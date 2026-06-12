import type { CharacterDoc } from "../core/schema/character.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import type { FileSystemAdapter } from "./fs.js";
import { characterDocIO } from "./serialize.js";

const BUILTINS: Record<string, CharacterDoc> = {
  "builtin:template-a": TEMPLATE_A,
};

// キャラ参照(ref)→ CharacterDoc の解決。builtinは即時、ファイルは非同期ロード+キャッシュ
export class AssetResolver {
  #cache = new Map<string, CharacterDoc>();
  #failed = new Set<string>();
  #pending = new Map<string, Promise<void>>();
  #listeners = new Set<() => void>();

  getCharacter(ref: string): CharacterDoc | undefined {
    const builtin = BUILTINS[ref];
    if (builtin) return builtin;
    return this.#cache.get(ref);
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

  // ロード再試行のため失敗記録を消す(フォルダ再選択時など)
  invalidate(): void {
    this.#failed.clear();
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
