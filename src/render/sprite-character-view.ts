import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { CharConfig, Frame } from "../editor/newchar/character-configs.js";

// シーンエディタで新キャラ(サクラ/リョウタ)を静的に描画する最低限のビュー。
// 新キャラタブのリグ(SpriteRigPage)の動的スキニング/クリップ/表情は載せていない。
// 1) CharConfig からテクスチャを非同期で読み込み
// 2) ロード完了後、レイヤーを z 順で重ねるだけの static composite
// 3) 内部スケール 0.55 で 1280px テクスチャが ~700px に収まるよう調整
//
// 動的アニメ(clip/expression)を載せたければ、SpriteRigPage の skin/lean/eye/mouth
// 処理をここに移植する別フェーズで対応。
export class SpriteCharacterView {
  readonly container = new Container();
  readonly cfg: CharConfig;
  #ready = false;
  #failed = false;
  #texByFile = new Map<string, Texture>();

  constructor(cfg: CharConfig) {
    this.cfg = cfg;
    // 内部スケールでテクスチャ原寸を縮めて scene の transform.scale=1 で扱いやすく。
    this.container.scale.set(0.55);
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
    this.#build();
    this.#ready = true;
  }

  #build(): void {
    const cfg = this.cfg;
    const HIP = cfg.hip;
    const sub = (file: string, f: Frame): Texture => new Texture({
      source: this.#texByFile.get(file)!.source,
      frame: new Rectangle(f[0], f[1], f[2], f[3]),
    });
    const placed = (l: { file: string; frame: Frame }): Sprite => {
      const s = new Sprite(sub(l.file, l.frame));
      s.position.set(l.frame[0] - HIP[0], l.frame[1] - HIP[1]);
      return s;
    };

    // z順: 後ろ髪 → 奥靴 → ズボン(全体) → 腕(剛体) → 上着/首/頭/顔/口/目/眉/前髪 → 手前靴
    // 新キャラタブのリグと同じ順序を簡易再現。スキニングや mix 切替はせず、
    // 全レイヤーを最低限の静止合成で配置するだけ。
    for (const l of cfg.backLayers) this.container.addChild(placed(l));
    // 奥靴
    this.container.addChild(placed({ file: cfg.footLFile, frame: cfg.footLFrame }));
    // legwear をフル幅で 1 枚として置く(脚 1 枚)
    const legBbox: Frame = [cfg.meshGx0, cfg.meshGy0, cfg.meshGx1 - cfg.meshGx0, cfg.meshGy1 - cfg.meshGy0];
    this.container.addChild(placed({ file: "legwear.png", frame: legBbox }));
    // 腕 cutout(L→R の順、 SpriteRigPage と同じ並び)
    for (const arm of cfg.arms) this.container.addChild(placed(arm));
    // 前面レイヤー(上着以下、頭まで)
    for (const l of cfg.frontLayers) this.container.addChild(placed(l));
    // 手前靴
    this.container.addChild(placed({ file: cfg.footRFile, frame: cfg.footRFrame }));
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.#texByFile.clear();
  }
}
