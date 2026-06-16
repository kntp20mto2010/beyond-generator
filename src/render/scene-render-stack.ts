import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { drawBalloon } from "./balloon.js";
import { CharacterView } from "./character-pixi.js";
import { SpriteCharacterView } from "./sprite-character-view.js";
import type { CharConfig } from "../editor/newchar/character-configs.js";
import type { AssetResolver } from "../io/asset-resolver.js";
import { PAPER_COLOR, type ProjectDoc, type SceneDoc } from "../core/schema/project.js";
import {
  evaluateCamera,
  evaluateScene,
  STAGE_H,
  STAGE_W,
  type CameraState,
  type CharResolver,
  type SceneFrameItem,
} from "../runtime/scene-eval.js";
import type { Mat2D } from "../runtime/mat2d.js";
import type { ScenePhysicsPool } from "../runtime/scene-physics.js";

interface ElView {
  container: Container;
  charView?: CharacterView;
  spriteCharView?: SpriteCharacterView;
  text?: Text;
  balloon?: { g: Graphics; text: Text };
  placeholder?: { g: Graphics; label: Text };
}

// シーン境界トランジションの一時状態(snapshot方式)
interface TransitionState {
  sprite: Sprite;
  tex: Texture;
  mask: Graphics | null;
  type: "fade" | "wipe" | "slide";
  dur: number;
}

export interface RenderFrameOpts {
  // カメラ評価値を上書き(カメラ編集モードの identity 表示用)。未指定なら scene.camera を評価
  cameraOverride?: CameraState;
  // slide トランジション中の新シーン押し込み量(px)
  slidePush?: number;
}

// StageCanvas / 書き出しで共有する描画コア。
// root(world)/ bg / bgImage / elLayer を内包し、評価器の絵だけを作る。
// 編集オーバーレイ(選択枠・グリッド・ホバー・カメラ枠)は呼び出し側に残す。
export class SceneRenderStack {
  readonly root: Container;
  readonly elLayer: Container;
  // world スケール基準(VIEW_W = stageW * scaleBase / 1920)。StageCanvas=0.5、書き出し=width/1920
  readonly #scaleBase: number;
  readonly #viewW: number;
  readonly #viewH: number;

  #app: Application;
  #resolver: AssetResolver;
  #bg: Graphics;
  #bgImageLayer: Container;
  #views = new Map<string, ElView>();
  #charResolver: CharResolver;
  #transition: TransitionState | null = null;

  // 表示中の背景画像キー = "パス|URL"。パスと URL 有無の両方で再評価
  #bgImgKey: string | null = null;
  #disposed = false;

  // 最後に評価/描画したフレーム(ヒットテスト等に呼び出し側が使う)
  lastFrame: SceneFrameItem[] = [];

  constructor(app: Application, resolver: AssetResolver, scaleBase = 0.5) {
    this.#app = app;
    this.#resolver = resolver;
    this.#scaleBase = scaleBase;
    this.#viewW = STAGE_W * scaleBase;
    this.#viewH = STAGE_H * scaleBase;

    this.root = new Container();
    this.root.scale.set(scaleBase);
    app.stage.addChild(this.root);

    this.#bg = new Graphics();
    this.root.addChild(this.#bg);

    // 背景画像(色レイヤの上・要素の下)。高さフィット+中央クロップ
    this.#bgImageLayer = new Container();
    this.root.addChild(this.#bgImageLayer);

    this.elLayer = new Container();
    this.root.addChild(this.elLayer);

    this.#charResolver = {
      getCharacter: (ref) => this.#resolver.getCharacter(ref),
      getSpriteCharacter: (ref) => this.#resolver.getSpriteCharacter(ref),
    };
  }

  get viewW(): number {
    return this.#viewW;
  }
  get viewH(): number {
    return this.#viewH;
  }

  // root(world)へカメラ変換を適用。slidePush は新シーン押し込み量(px)
  applyCamera(cam: CameraState, slidePush = 0): void {
    const z = this.#scaleBase * cam.zoom;
    this.root.scale.set(z);
    this.root.position.set(
      this.#viewW / 2 - cam.x * z + slidePush,
      this.#viewH / 2 - cam.y * z,
    );
  }

  // hairDeforms: シーン内キャラの髪変形(elementId → strandKey → Mat2D)を pool から集める
  #collectDeforms(scene: SceneDoc, pool: ScenePhysicsPool): Map<string, Map<string, Mat2D>> {
    const map = new Map<string, Map<string, Mat2D>>();
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      const d = pool.deforms(el.id);
      if (d) map.set(el.id, d);
    }
    return map;
  }

  // 背景画像を解決して反映。未解決(URL未取得)の間はスキップし、解決後に再試行される
  #updateBgImage(scene: SceneDoc | undefined): void {
    const path = scene?.background?.image ?? null;
    const url = path ? this.#resolver.getImageUrl(path) : undefined;
    const key = path ? `${path}|${url ?? ""}` : null;
    if (key === this.#bgImgKey) return;
    this.#bgImgKey = key;
    for (const c of this.#bgImageLayer.removeChildren()) c.destroy();
    if (!path || !url) return;
    const want = key;
    const imgEl = new Image();
    imgEl.onload = () => {
      if (this.#disposed || this.#bgImgKey !== want) return;
      const tex = Texture.from(imgEl);
      const s = Math.max(STAGE_W / tex.width, STAGE_H / tex.height);
      const sp = new Sprite(tex);
      sp.scale.set(s);
      sp.position.set((STAGE_W - tex.width * s) / 2, (STAGE_H - tex.height * s) / 2);
      this.#bgImageLayer.addChild(sp);
    };
    imgEl.src = url;
  }

  // t でシーンを描く(カメラ・口パク込み)。pool の deforms を適用。
  // 適用したカメラ(ヒットテスト基準)を返す。
  renderFrame(
    project: ProjectDoc,
    scene: SceneDoc | undefined,
    t: number,
    pool: ScenePhysicsPool,
    opts?: RenderFrameOpts,
  ): CameraState {
    this.#bg.clear();
    const color = scene?.background?.color ?? PAPER_COLOR;
    this.#bg.rect(0, 0, STAGE_W, STAGE_H).fill({ color });
    this.#updateBgImage(scene);

    const cam =
      opts?.cameraOverride ??
      (scene ? evaluateCamera(scene.camera, t) : { x: STAGE_W / 2, y: STAGE_H / 2, zoom: 1 });
    this.applyCamera(cam, opts?.slidePush ?? 0);

    if (!scene) {
      for (const [, v] of this.#views) v.container.destroy({ children: true });
      this.#views.clear();
      this.lastFrame = [];
      return cam;
    }

    const frame = evaluateScene(project, scene, t, this.#charResolver, {
      hairDeforms: this.#collectDeforms(scene, pool),
      // 口パク: 再生中もスクラブ中も同じエンベロープ参照(音は鳴らずとも口は動く)
      audio: { lookup: (path) => this.#resolver.getAudio(path) },
    });
    this.lastFrame = frame;

    const seen = new Set<string>();
    this.elLayer.removeChildren(); // z順を毎フレーム反映(要素数は少ない)

    for (const item of frame) {
      seen.add(item.elementId);
      let view = this.#views.get(item.elementId);
      if (!view) {
        view = { container: new Container() };
        this.#views.set(item.elementId, view);
      }
      applyItem(view, item);
      this.elLayer.addChild(view.container);
    }
    for (const [id, v] of [...this.#views]) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.#views.delete(id);
      }
    }

    return cam;
  }

  // 描画済み要素の Pixi container(bounds 参照等に使う)。未描画なら undefined
  getView(elementId: string): Container | undefined {
    return this.#views.get(elementId)?.container;
  }

  // === トランジション(snapshot方式) ===

  // 現在の app.stage を snapshot(Sprite)化して最前面へ。cut 相当は呼ばない前提
  beginTransition(type: "fade" | "wipe" | "slide", dur: number): void {
    this.disposeTransition();
    const tex = this.#app.renderer.extract.texture(this.#app.stage);
    const sprite = new Sprite(tex);
    sprite.position.set(0, 0);
    let mask: Graphics | null = null;
    if (type === "wipe") {
      mask = new Graphics();
      mask.rect(0, 0, this.#viewW, this.#viewH).fill({ color: 0xffffff });
      this.#app.stage.addChild(mask);
      sprite.mask = mask;
    }
    this.#app.stage.addChild(sprite);
    this.#transition = { sprite, tex, mask, type, dur };
  }

  hasTransition(): boolean {
    return this.#transition !== null;
  }

  // 進行 p(0→1)を snapshot に適用。fade: alpha / wipe: マスク / slide: snapshot.x。
  // p≥1 で自動破棄。slide の新シーン押し込みは renderFrame の slidePush 側で行う。
  applyTransition(p: number): void {
    const tr = this.#transition;
    if (!tr) return;
    const prog = p < 0 ? 0 : p > 1 ? 1 : p;
    if (tr.type === "fade") {
      tr.sprite.alpha = 1 - prog;
    } else if (tr.type === "wipe" && tr.mask) {
      tr.mask.clear();
      tr.mask
        .rect(prog * this.#viewW, 0, this.#viewW - prog * this.#viewW, this.#viewH)
        .fill({ color: 0xffffff });
    } else if (tr.type === "slide") {
      tr.sprite.x = -prog * this.#viewW;
    }
    if (prog >= 1) this.disposeTransition();
  }

  disposeTransition(): void {
    const tr = this.#transition;
    if (!tr) return;
    tr.sprite.destroy();
    if (tr.mask) tr.mask.destroy();
    tr.tex.destroy(true);
    this.#transition = null;
  }

  // root 配下の表示物と views を破棄(app 自体は呼び出し側が destroy する)
  destroy(): void {
    this.#disposed = true;
    this.disposeTransition();
    for (const [, v] of this.#views) v.container.destroy({ children: true });
    this.#views.clear();
    this.root.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------
// 要素の表示更新(StageCanvas から移設。挙動は不変)
// ---------------------------------------------------------------------------

export function applyItem(view: ElView, item: SceneFrameItem): void {
  const c = view.container;
  const visual = item.visual;
  c.alpha = visual.alpha;

  if (item.payload.kind === "sprite-character") {
    if (!view.spriteCharView) {
      view.spriteCharView = new SpriteCharacterView(item.payload.spriteCfg as CharConfig);
      c.addChild(view.spriteCharView.container);
    }
    if (view.text) { view.text.destroy(); view.text = undefined; }
    const tf = item.payload.transform;
    const s = tf.scale * visual.scaleMul;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(item.payload.flipX ? -s : s, s);
  } else if (item.payload.kind === "character") {
    if (!view.charView) {
      view.charView = new CharacterView();
      c.addChild(view.charView.container);
    }
    if (view.text) {
      view.text.destroy();
      view.text = undefined;
    }
    view.charView.update(item.payload.char, item.payload.items);
    const tf = item.payload.transform;
    const s = tf.scale * visual.scaleMul;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(item.payload.flipX ? -s : s, s);
  } else if (item.payload.kind === "text") {
    const el = item.payload.el;
    const stroke =
      el.strokeColor !== null
        ? { color: el.strokeColor, width: el.strokeWidth, join: "round" as const }
        : undefined;
    if (!view.text) {
      view.text = new Text({ text: el.text });
      view.text.anchor.set(0.5);
      c.addChild(view.text);
    }
    view.text.text = el.text;
    view.text.style = {
      fontFamily: "system-ui, sans-serif",
      fontSize: el.size,
      fill: el.color,
      ...(stroke ? { stroke } : {}),
      align: "center",
    };
    const tf = item.payload.transform;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(tf.scale * visual.scaleMul);
  } else if (item.payload.kind === "balloon") {
    const el = item.payload.el;
    if (!view.balloon) {
      const g = new Graphics();
      const text = new Text({ text: el.text });
      text.anchor.set(0.5);
      c.addChild(g);
      c.addChild(text);
      view.balloon = { g, text };
    }
    const { g, text } = view.balloon;
    g.clear();
    drawBalloon(g, el);
    text.text = el.text;
    text.style = {
      fontFamily: "system-ui, sans-serif",
      fontSize: el.size,
      fill: el.textColor,
      wordWrap: true,
      wordWrapWidth: el.w - 48,
      breakWords: true,
      align: "center",
    };
    const tf = item.payload.transform;
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    // balloon は flipX を適用しない(テキスト同様)
    c.scale.set(tf.scale * visual.scaleMul);
  } else {
    // placeholder
    const tf = item.payload.transform;
    if (!view.placeholder) {
      const g = new Graphics();
      const label = new Text({
        text: "未解決",
        style: { fontFamily: "system-ui", fontSize: 40, fill: "#888" },
      });
      label.anchor.set(0.5);
      c.addChild(g);
      c.addChild(label);
      view.placeholder = { g, label };
    }
    view.placeholder.g.clear();
    view.placeholder.g
      .rect(-120, -300, 240, 300)
      .fill({ color: 0xdddddd })
      .stroke({ color: 0x999999, width: 2 });
    view.placeholder.label.position.set(0, -150);
    c.position.set(tf.x + visual.offset[0], tf.y + visual.offset[1]);
    c.scale.set(tf.scale * visual.scaleMul);
  }
}
