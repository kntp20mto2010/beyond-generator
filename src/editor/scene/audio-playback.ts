import type { Bgm, SceneDoc } from "../../core/schema/project.js";
import type { AssetResolver } from "../../io/asset-resolver.js";

// プレビュー再生。評価器とは独立(口パクはエンベロープで別途駆動)。
// AudioContext は再生操作のイベント内で生成/resume する(autoplayポリシー)。
export class AudioPlayback {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #talkSources = new Set<AudioBufferSourceNode>();
  #bgmSources = new Set<AudioBufferSourceNode>();

  // 再生ボタンのイベント内で呼ぶこと(ユーザー操作起点)
  #ensureCtx(): { ctx: AudioContext; master: GainNode } | null {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.#ctx) {
      this.#ctx = new Ctor();
      this.#master = this.#ctx.createGain();
      this.#master.connect(this.#ctx.destination);
    }
    if (this.#ctx.state === "suspended") void this.#ctx.resume();
    return this.#ctx && this.#master ? { ctx: this.#ctx, master: this.#master } : null;
  }

  // gain を挟んで1本スケジュール。offset 超過は鳴らさない。
  #scheduleOne(
    ctx: AudioContext,
    master: GainNode,
    buffer: AudioBuffer,
    gain: number,
    offset: number,
    into: Set<AudioBufferSourceNode>,
    loop: boolean,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.onended = () => {
      into.delete(src);
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* 既に切断済みは無視 */
      }
    };
    into.add(src);
    src.start(ctx.currentTime, offset);
  }

  // シーンの全talkを fromT 基準でスケジュール(BGMは触らない)。
  playScene(scene: SceneDoc, fromT: number, resolver: AssetResolver): void {
    const ready = this.#ensureCtx();
    if (!ready) return;
    const { ctx, master } = ready;
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      for (const talk of el.talks) {
        const a = resolver.getAudio(talk.audio);
        if (!a) continue; // 未ロードは鳴らさない(口パクも開かない)
        const end = talk.t + a.duration;
        if (fromT >= end) continue; // 既に終わっている
        if (fromT <= talk.t) {
          // 未来のtalk: when を相対遅延でスケジュール
          const src = ctx.createBufferSource();
          src.buffer = a.buffer;
          const g = ctx.createGain();
          g.gain.value = talk.gain;
          src.connect(g);
          g.connect(master);
          src.onended = () => {
            this.#talkSources.delete(src);
            try {
              src.disconnect();
              g.disconnect();
            } catch {
              /* noop */
            }
          };
          this.#talkSources.add(src);
          src.start(ctx.currentTime + (talk.t - fromT));
        } else {
          // 再生位置がtalk途中: offset で頭出し
          this.#scheduleOne(ctx, master, a.buffer, talk.gain, fromT - talk.t, this.#talkSources, false);
        }
      }
    }
  }

  // 通し再生開始時のみ。ループ。
  startBgm(bgm: Bgm, resolver: AssetResolver): void {
    const ready = this.#ensureCtx();
    if (!ready) return;
    const a = resolver.getAudio(bgm.audio);
    if (!a) return;
    this.#scheduleOne(ready.ctx, ready.master, a.buffer, bgm.gain, 0, this.#bgmSources, bgm.loop);
  }

  // talkのみ停止(シーン跨ぎ用、BGMは継続)
  stopTalks(): void {
    for (const src of [...this.#talkSources]) this.#stopSource(src, this.#talkSources);
  }

  // 全停止(talk + bgm)
  stopAll(): void {
    for (const src of [...this.#talkSources]) this.#stopSource(src, this.#talkSources);
    for (const src of [...this.#bgmSources]) this.#stopSource(src, this.#bgmSources);
  }

  #stopSource(src: AudioBufferSourceNode, set: Set<AudioBufferSourceNode>): void {
    set.delete(src);
    src.onended = null;
    try {
      src.stop();
      src.disconnect();
    } catch {
      /* 既に停止済みは無視 */
    }
  }

  // DEV検証用: 現在 active な source 数 / ctx state を読む
  get debugState(): { ctxState: string | null; talkSources: number; bgmSources: number } {
    return {
      ctxState: this.#ctx?.state ?? null,
      talkSources: this.#talkSources.size,
      bgmSources: this.#bgmSources.size,
    };
  }
}
