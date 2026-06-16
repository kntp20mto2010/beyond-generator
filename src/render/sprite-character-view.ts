import { Assets, Container, Texture } from "pixi.js";
import type { CharConfig } from "../editor/newchar/character-configs.js";
import { lookupSpriteClip, SpriteRig, toExprKey } from "./sprite-rig.js";

// シーンエディタで新キャラ(サクラ/リョウタ)を動的に描画するビュー。
// テクスチャを非同期ロードし、SpriteRig(SpriteRigPage のリグ移植)で
// clip/表情/まばたき/口パクを毎フレーム駆動する。
//
// 内部スケール 0.47 で 1280px テクスチャを ~600px に縮め、scene の transform.scale=1
// で扱いやすくする。向き反転(flipX)は親(ElView コンテナ)側で行うため、ここでは反転しない。
//
// update() は scene-eval が払い出すドライバ(clip 名/ローカル時刻/表情/talk/clock)で駆動。
export interface SpriteDrivers {
  clip: string;
  localTime: number;
  prevClip: string | null;
  prevLocalTime: number;
  blend: number;
  expr: string;
  talk: boolean;
  clock: number; // シーン内時刻(秒)。dt 算出に使う
}

export class SpriteCharacterView {
  readonly container = new Container();
  readonly cfg: CharConfig;
  #ready = false;
  #failed = false;
  #rig: SpriteRig | null = null;
  #texByFile = new Map<string, Texture>();
  #lastClock: number | null = null;

  constructor(cfg: CharConfig) {
    this.cfg = cfg;
    this.container.scale.set(0.47);
    void this.#loadAndBuild();
  }

  get ready(): boolean { return this.#ready; }
  get failed(): boolean { return this.#failed; }

  async #loadAndBuild(): Promise<void> {
    const cfg = this.cfg;
    const files = Array.from(new Set([
      ...cfg.backLayers.map((l) => l.file),
      ...cfg.frontLayers.map((l) => l.file),
      ...cfg.arms.map((p) => p.file),
      "legwear.png",
      cfg.footLFile,
      cfg.footRFile,
    ]));
    try {
      await Promise.all(files.map(async (f) => {
        const tex = await Assets.load(`${cfg.dir}/${f}`) as Texture;
        this.#texByFile.set(f, tex);
      }));
    } catch (e) {
      console.error("[SpriteCharacterView] load failed", cfg.dir, e);
      this.#failed = true;
      return;
    }
    this.#rig = new SpriteRig(cfg, this.#texByFile);
    this.container.addChild(this.#rig.container);
    this.#ready = true;
  }

  // 毎フレーム駆動。ロード完了前は no-op(applyItem は構築前でも呼ぶ)。
  update(d: SpriteDrivers): void {
    if (!this.#rig) return;
    // dt はシーン内時刻の差分から算出(preview のバックグラウンド rAF や scrub で
    // 飛んでもバネ/まばたきが暴れないよう [0, 1/15] にクランプ)。
    const dt = this.#lastClock == null ? 1 / 60 : Math.min(Math.max(d.clock - this.#lastClock, 0), 1 / 15);
    this.#lastClock = d.clock;
    this.#rig.update({
      clip: lookupSpriteClip(d.clip),
      localTime: d.localTime,
      prevClip: d.prevClip ? lookupSpriteClip(d.prevClip) : null,
      prevLocalTime: d.prevLocalTime,
      blend: d.blend,
      expr: toExprKey(d.expr),
      talk: d.talk,
      dt,
    });
  }

  destroy(): void {
    this.#rig?.destroy();
    this.container.destroy({ children: true });
    this.#texByFile.clear();
  }
}
