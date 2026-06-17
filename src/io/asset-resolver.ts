import type { CharacterDoc } from "../core/schema/character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { TEMPLATE_B } from "../presets/characters/template-b.js";
import { computeMouthEnvelope } from "../runtime/mouth-envelope.js";
import { CHARS, type CharConfig } from "../editor/newchar/character-configs.js";
import type { FileSystemAdapter } from "./fs.js";
import { characterDocIO } from "./serialize.js";

// デコード用の共有 AudioContext(モジュール内で遅延生成)。再生用とは別でよい。
let sharedDecodeCtx: AudioContext | null = null;
function decodeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedDecodeCtx) sharedDecodeCtx = new Ctor();
  return sharedDecodeCtx;
}

export interface LoadedAudio {
  buffer: AudioBuffer;
  envelope: Uint8Array; // フレーム毎(30fps)の口開閉
  duration: number; // 秒
}

const BUILTINS: Record<string, CharacterDoc> = {
  "builtin:template-a": TEMPLATE_A,
  "builtin:template-b": TEMPLATE_B,
};

// 新キャラ(スプライト合成)用 builtin。CharacterDoc とは別系統で
// scene-eval が判別して SpriteCharacterView に振り分ける。
const SPRITE_BUILTINS: Record<string, CharConfig> = {
  "builtin:sakura": CHARS.sakura,
  "builtin:ryouta": CHARS.ryouta,
};

// 内蔵スプライトキャラの立ち絵サムネ(assets配信パス)。
const SPRITE_THUMBS: Record<string, string> = {
  "builtin:sakura": "assets/characters/sakura-portrait.png",
  "builtin:ryouta": "assets/characters/ryouta-portrait.png",
};

// 内蔵スプライトキャラの一覧(ref + 表示名 + サムネ)。シーン編集のキャラ追加UIで使う。
export const SPRITE_BUILTIN_LIST: { ref: string; label: string; thumb?: string }[] =
  Object.entries(SPRITE_BUILTINS).map(([ref, cfg]) => ({
    ref,
    label: cfg.label,
    thumb: SPRITE_THUMBS[ref],
  }));

// キャラ参照(ref)→ CharacterDoc の解決。builtinは即時、ファイルは非同期ロード+キャッシュ
export class AssetResolver {
  #cache = new Map<string, CharacterDoc>();
  #failed = new Set<string>();
  #pending = new Map<string, Promise<void>>();
  #listeners = new Set<() => void>();

  // 画像: パス → objectURL のキャッシュ
  #imageUrls = new Map<string, string>();
  #imageFailed = new Set<string>();
  #imagePending = new Map<string, Promise<void>>();

  // 音声: パス → デコード済みバッファ+エンベロープ
  #audio = new Map<string, LoadedAudio>();
  #audioFailed = new Set<string>();
  #audioPending = new Map<string, Promise<void>>();

  getCharacter(ref: string): CharacterDoc | undefined {
    const builtin = BUILTINS[ref];
    if (builtin) return builtin;
    return this.#cache.get(ref);
  }

  // 新キャラ(スプライト)。CharacterDoc とは別系統で返す。
  getSpriteCharacter(ref: string): CharConfig | undefined {
    return SPRITE_BUILTINS[ref];
  }

  async ensureLoaded(refs: readonly string[], fs: FileSystemAdapter | null): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const ref of refs) {
      if (BUILTINS[ref] || this.#cache.has(ref) || this.#failed.has(ref)) continue;
      const existing = this.#pending.get(ref);
      if (existing) {
        jobs.push(existing);
        continue;
      }
      const job = this.#load(ref, fs);
      this.#pending.set(ref, job);
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  async #load(ref: string, fs: FileSystemAdapter | null): Promise<void> {
    try {
      if (!fs) {
        this.#failed.add(ref);
        return;
      }
      const json = await fs.readTextFile(ref);
      if (json === null) {
        this.#failed.add(ref);
        return;
      }
      const doc = characterDocIO.parse(json);
      this.#cache.set(ref, doc);
      this.#notify();
    } catch {
      this.#failed.add(ref);
    } finally {
      this.#pending.delete(ref);
    }
  }

  // --- 画像背景の解決 ---

  getImageUrl(path: string): string | undefined {
    return this.#imageUrls.get(path);
  }

  async ensureImagesLoaded(
    paths: readonly string[],
    fs: FileSystemAdapter | null,
  ): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const path of paths) {
      if (!path) continue;
      if (this.#imageUrls.has(path) || this.#imageFailed.has(path)) continue;
      const existing = this.#imagePending.get(path);
      if (existing) {
        jobs.push(existing);
        continue;
      }
      const job = this.#loadImage(path, fs);
      this.#imagePending.set(path, job);
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  async #loadImage(path: string, fs: FileSystemAdapter | null): Promise<void> {
    try {
      // 1) プロジェクトフォルダ(FS Access)から
      const buf = fs ? await fs.readBinaryFile(path) : null;
      if (buf) {
        const url = URL.createObjectURL(new Blob([buf]));
        this.#imageUrls.set(path, url);
        this.#notify();
        return;
      }
      // 2) リポジトリ内蔵パス(devサーバー配信)へフォールバック
      const res = await fetch(encodeURI(`/${path}`));
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        this.#imageUrls.set(path, url);
        this.#notify();
        return;
      }
      this.#imageFailed.add(path);
    } catch {
      this.#imageFailed.add(path);
    } finally {
      this.#imagePending.delete(path);
    }
  }

  // --- 音声の解決(デコード + エンベロープ算出) ---

  getAudio(path: string): LoadedAudio | undefined {
    return this.#audio.get(path);
  }

  async ensureAudioLoaded(paths: readonly string[], fs: FileSystemAdapter | null): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const path of paths) {
      if (!path) continue;
      if (this.#audio.has(path) || this.#audioFailed.has(path)) continue;
      const existing = this.#audioPending.get(path);
      if (existing) {
        jobs.push(existing);
        continue;
      }
      const job = this.#loadAudio(path, fs);
      this.#audioPending.set(path, job);
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  async #loadAudio(path: string, fs: FileSystemAdapter | null): Promise<void> {
    try {
      // 1) プロジェクトフォルダ(FS Access) 2) リポジトリ内蔵(devサーバー配信)
      let bytes: ArrayBuffer | null = fs ? await fs.readBinaryFile(path) : null;
      if (!bytes) {
        const res = await fetch(encodeURI(`/${path}`));
        if (res.ok) bytes = await res.arrayBuffer();
      }
      if (!bytes) {
        this.#audioFailed.add(path);
        return;
      }
      const ctx = decodeContext();
      if (!ctx) {
        this.#audioFailed.add(path);
        return;
      }
      // decodeAudioData は ArrayBuffer を detach するので slice() でコピーを渡す
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      const envelope = computeMouthEnvelope(buffer, 30);
      this.#audio.set(path, { buffer, envelope, duration: buffer.duration });
      this.#notify();
    } catch {
      this.#audioFailed.add(path);
    } finally {
      this.#audioPending.delete(path);
    }
  }

  // ロード再試行のため失敗記録を消す(フォルダ再選択時など)
  invalidate(): void {
    this.#failed.clear();
    this.#imageFailed.clear();
    for (const url of this.#imageUrls.values()) URL.revokeObjectURL(url);
    this.#imageUrls.clear();
    this.#audioFailed.clear();
    this.#audio.clear();
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  #notify(): void {
    for (const cb of this.#listeners) cb();
  }
}
