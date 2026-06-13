import type {
  Action,
  BalloonElement,
  CameraKey,
  CharacterElement,
  ExpressionKey,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  Talk,
  TextElement,
  Transition,
} from "../core/schema/project.js";
import type {
  Cast,
  Place,
  Scene,
  Shot,
  Story,
  TransitionName,
} from "./schema.js";
import { StorySchema } from "./schema.js";
import {
  CLIP_DUR,
  estMove,
  estTalk,
  FPS,
  PLACE_TABLE,
  quantize,
  resolvePlace,
  voiceLen,
} from "./timing.js";

const STAGE_W = 1920;

// セリフ長 → 吹き出し既定 w/h(spec/12 §3 autoSize)
function autoSize(line: string): { w: number; h: number } {
  const len = [...line].length;
  if (len <= 6) return { w: 360, h: 170 };
  if (len <= 10) return { w: 430, h: 175 };
  if (len <= 14) return { w: 480, h: 180 };
  if (len <= 18) return { w: 540, h: 185 };
  return { w: 580, h: 190 };
}

function placeX(place: Place): number {
  if (typeof place === "string") return PLACE_TABLE[place];
  return place.x;
}

// transition の正規化(string | {type,dur} → ProjectDoc Transition)
function normalizeTransition(
  t: TransitionName | { type: TransitionName; dur: number },
): Transition {
  if (typeof t === "string") return { type: t, dur: 0.5 };
  return { type: t.type, dur: t.dur };
}

// ---------------------------------------------------------------------------
// キャスト稼働状態(de-linearize の畳み込み対象)
// ---------------------------------------------------------------------------

interface CastState {
  cast: Cast;
  index: number; // 配列順 = z
  x: number; // 現在位置(採時用前進累積。expandActions と同型ロジック)
  y: number;
  actions: Action[];
  expressions: ExpressionKey[];
  talks: Talk[];
  lastClip: string | undefined; // 冪等抑制用
}

interface CompileSceneResult {
  scene: SceneDoc;
  end: number; // 採時末(duration 自動計算用)
}

// shot の占有尺(spec/12 §2-2)
function shotDuration(
  shot: Shot,
  charPerSec: number,
  audioDurations: Record<string, number>,
  fromX: number,
): number {
  if (shot.hold !== undefined) return shot.hold;
  const parts: number[] = [0.3];
  if (shot.line !== undefined && shot.silent !== true) {
    parts.push(voiceLen(shot.voice, shot.line, charPerSec, audioDurations));
  } else if (shot.line !== undefined) {
    // silent: balloon のみだが画面占有は est で確保
    parts.push(estTalk(shot.line, charPerSec));
  }
  if (shot.do !== undefined) {
    parts.push(CLIP_DUR[shot.do]);
  }
  const move = shot.walkTo ?? shot.runTo;
  if (move !== undefined) {
    const clip = shot.runTo !== undefined ? "run" : "walk";
    parts.push(estMove(fromX, placeX(move), clip, shot.speed));
  }
  if (shot.camera !== undefined) parts.push(1.0);
  if (shot.caption !== undefined) parts.push(Math.max(estTalk(shot.caption, charPerSec), 1.2));
  return Math.max(...parts);
}

// ---------------------------------------------------------------------------
// 1シーンのコンパイル(cursor=0 の単一パス左→右)
// ---------------------------------------------------------------------------

function compileScene(
  scene: Scene,
  sceneIndex: number,
  story: Story,
  voiceCounter: { n: number },
): CompileSceneResult {
  const defaults = story.defaults;
  const charPerSec = defaults.charPerSec;
  const groundY = defaults.groundY;
  const audioDurations = story.audioDurations;

  // キャスト稼働状態(配列順 = z 昇順)
  const castStates = new Map<string, CastState>();
  scene.cast.forEach((cast, index) => {
    const pos = resolvePlace(cast.at, groundY);
    castStates.set(cast.id, {
      cast,
      index,
      x: pos.x,
      y: pos.y,
      actions: [],
      expressions: [],
      talks: [],
      lastClip: undefined,
    });
  });

  const balloons: { el: BalloonElement; speakerIndex: number }[] = [];
  const captions: TextElement[] = [];
  const cameraKeys: CameraKey[] = [];

  let cursor = 0;
  let prevEnd = 0;
  let lastT0 = 0;
  let elementSeq = 0; // 吹き出し/キャプション等の出現順(決定論id用)
  let lineSeq = 0; // シーン内 line 出現順(balloon z 用)

  for (const shot of scene.shots) {
    const speaker = shot.who !== undefined ? castStates.get(shot.who) : undefined;
    const fromX = speaker?.x ?? STAGE_W / 2;

    // 1) 開始 t0(spec/12 §2-1)
    let t0: number;
    let overlap = false;
    if (shot.at !== undefined) {
      t0 = shot.at;
    } else if (shot.after === "prevStart") {
      t0 = lastT0;
      overlap = true;
    } else if (shot.after === "prev") {
      t0 = prevEnd;
    } else if (typeof shot.after === "number") {
      t0 = prevEnd + shot.after;
    } else if (shot.gap !== undefined) {
      t0 = cursor + shot.gap;
    } else {
      t0 = cursor;
    }
    t0 = quantize(t0);

    // 2) 占有尺
    const dur = shotDuration(shot, charPerSec, audioDurations, fromX);

    // 3) 4トラック同期展開(同一 t0)
    if (shot.line !== undefined && speaker) {
      const clip = shot.clip ?? "talk1";

      // A. talk(silent でなければ)
      if (shot.silent !== true) {
        const voiceId = resolveVoice(shot.voice, voiceCounter);
        speaker.talks.push({ t: t0, audio: `assets/audio/${voiceId}.wav`, gain: 1 });
      }

      // B. action(直前同clipは冪等抑制)
      if (shot.silent !== true) {
        pushAction(speaker, { t: t0, clip, speed: 1 });
      }

      // C. balloon
      const bShape = shot.balloon?.shape ?? defaults.balloonShape;
      const size = autoSize(shot.line);
      const w = shot.balloon?.w ?? size.w;
      const h = shot.balloon?.h ?? size.h;
      const speakerX = speaker.x;
      const speakerFaceLeft = resolveFaceLeft(speaker.cast);
      const geom = balloonGeometry(speakerX, w, h, shot.balloon?.at, groundY);
      const balloonEl = makeBalloon({
        id: `scene-${sceneIndex + 1}-balloon-${lineSeq + 1}`,
        text: shot.line,
        shape: bShape,
        w,
        h,
        fill: shot.balloon?.fill,
        x: geom.x,
        y: geom.y,
        tail: resolveTail(shot.balloon?.tail, speakerX, geom.x, h, speakerFaceLeft),
        delay: t0,
        z: 200 + lineSeq,
      });
      balloons.push({ el: balloonEl, speakerIndex: speaker.index });
      lineSeq++;

      // D. expression(emotion 指定時のみ)
      if (shot.emotion !== undefined) {
        speaker.expressions.push({ t: t0, preset: shot.emotion });
      }
    } else if (speaker && shot.emotion !== undefined && shot.line === undefined) {
      // 表情のみの shot(発話なし)
      speaker.expressions.push({ t: t0, preset: shot.emotion });
    }

    // 動作 shot(do / walkTo / runTo)
    if (speaker && shot.do !== undefined) {
      pushAction(speaker, { t: t0, clip: shot.do, speed: shot.speed });
    }
    const move = shot.walkTo ?? shot.runTo;
    if (speaker && move !== undefined) {
      const clip = shot.runTo !== undefined ? "run" : "walk";
      const target = resolvePlace(move, speaker.y);
      pushAction(speaker, {
        t: t0,
        clip,
        speed: shot.speed,
        moveTo: { x: target.x, y: target.y },
      });
      speaker.x = target.x; // 前進累積(到着位置を以降の fromX に反映)
      speaker.y = target.y;
    }

    // camera
    if (shot.camera !== undefined) {
      cameraKeys.push(makeCameraKey(shot, t0, castStates, groundY));
    }

    // caption(TextElement)
    if (shot.caption !== undefined) {
      captions.push(makeCaption(`scene-${sceneIndex + 1}-text-${elementSeq + 1}`, shot.caption, t0));
      elementSeq++;
    }

    // 4) cursor 前進(単調増加。prevStart 以外で進める)
    prevEnd = quantize(t0 + dur);
    lastT0 = t0;
    if (!overlap) {
      cursor = Math.max(cursor, quantize(prevEnd + defaults.gapSec));
    }
  }

  // 次話者lineで前話者balloonをfade(keep でなければ)
  applyBalloonExits(balloons, scene.shots);

  // 要素の組み立て(z昇順: characters → balloons → captions)
  const elements: SceneElement[] = [];
  scene.cast.forEach((cast, index) => {
    const st = castStates.get(cast.id)!;
    elements.push(makeCharacter(cast, index, st, defaults.scale, groundY));
  });
  for (const b of balloons) elements.push(b.el);
  for (const c of captions) elements.push(c);

  // 採時末
  let end = 0;
  for (const st of castStates.values()) {
    for (const a of st.actions) end = Math.max(end, a.t);
    for (const tk of st.talks) end = Math.max(end, tk.t);
    // 表情だけのショット(リアクション)も採時末に含める(無いと尺が足りず表情が発火しない)
    for (const ex of st.expressions) end = Math.max(end, ex.t);
  }
  for (const b of balloons) end = Math.max(end, b.el.enter.delay, b.el.exit.at ?? 0);
  for (const c of captions) end = Math.max(end, c.enter.delay);
  end = quantize(end + 0.5); // 最終発話の余韻(占有尺の概算)

  const duration =
    scene.duration !== undefined
      ? scene.duration
      : quantize(end + scene.hold);

  const sceneDoc: SceneDoc = {
    id: scene.id ?? `scene-${sceneIndex + 1}`,
    duration,
    durationMode: "manual",
    background: resolveBackground(scene.bg),
    camera: cameraKeys,
    transition:
      sceneIndex === 0
        ? { type: "cut", dur: 0.5 }
        : normalizeTransition(scene.transition),
    elements,
    seed: sceneIndex,
  };

  return { scene: sceneDoc, end: duration };
}

// ---------------------------------------------------------------------------
// 4トラック・幾何ヘルパ
// ---------------------------------------------------------------------------

function resolveVoice(voice: string | undefined, counter: { n: number }): string {
  if (voice !== undefined) return voice;
  counter.n++;
  const num = String(counter.n).padStart(3, "0");
  return `vo-${num}`;
}

// 直前同clipは冪等抑制(同一 clip の連続を1つに畳む)
function pushAction(st: CastState, action: Action): void {
  if (st.lastClip === action.clip && action.moveTo === undefined) return;
  st.actions.push(action);
  st.lastClip = action.clip;
}

// cast.face と初期位置から「左向きか」を解決(face 明示優先)
function resolveFaceLeft(cast: Cast): boolean {
  if (cast.face === "left") return true;
  if (cast.face === "right") return false;
  // 既定: 画面右寄り(centerRight 以右)は左向き(相手=左 を向く)とする
  const x = placeX(cast.at);
  return x > STAGE_W / 2;
}

// 吹き出し位置: 話者頭上。右寄りなら左へ寄せて画面内に収める
function balloonGeometry(
  speakerX: number,
  w: number,
  h: number,
  at: Place | undefined,
  groundY: number,
): { x: number; y: number } {
  if (at !== undefined) {
    const p = resolvePlace(at, 250);
    return { x: p.x, y: p.y };
  }
  // 頭上 y(地面から上方へ。balloon 高さ分も持ち上げ、頭上に底辺が来るよう調整)
  const y = groundY - 450 - (h - 180) / 2;
  // 右寄りは左へ、左寄りは右へオフセット(2人正対の重なり回避)
  const dir = speakerX > STAGE_W / 2 ? -1 : 1;
  let x = speakerX + dir * 130;
  // 画面内クランプ
  const half = w / 2;
  x = Math.min(Math.max(x, half + 20), STAGE_W - half - 20);
  return { x, y };
}

// tail: 話者側へ向ける。auto は話者方向、明示座標はそのまま
function resolveTail(
  tail: "auto" | { x: number; y: number } | undefined,
  speakerX: number,
  balloonX: number,
  h: number,
  speakerFaceLeft: boolean,
): { x: number; y: number } {
  if (tail !== undefined && tail !== "auto") return tail;
  // しっぽ x は話者がバルーン中心の左右どちらかで決める
  const toLeft = speakerX < balloonX || (speakerX === balloonX && speakerFaceLeft);
  const tx = toLeft ? -(90) : 90;
  const ty = h - 5;
  return { x: tx, y: ty };
}

function makeBalloon(args: {
  id: string;
  text: string;
  shape: "round" | "cloud" | "spike";
  w: number;
  h: number;
  fill: string | undefined;
  x: number;
  y: number;
  tail: { x: number; y: number };
  delay: number;
  z: number;
}): BalloonElement {
  return {
    id: args.id,
    kind: "balloon",
    shape: args.shape,
    text: args.text,
    size: balloonFontSize(args.text),
    w: args.w,
    h: args.h,
    fill: args.fill ?? "#ffffff",
    textColor: "#2E2A33",
    lineColor: "#2E2A33",
    lineWidth: 4,
    tail: args.tail,
    transform: { x: args.x, y: args.y, scale: 1, flipX: false },
    z: args.z,
    locked: false,
    enter: { type: "pop", delay: args.delay, dur: 0.3 },
    exit: { type: "cut", at: null, dur: 0.4 },
  };
}

// テキスト長からフォントサイズ(autoSize と整合する縮小)
function balloonFontSize(text: string): number {
  const len = [...text].length;
  if (len <= 6) return 40;
  if (len <= 10) return 38;
  if (len <= 14) return 38;
  if (len <= 18) return 36;
  return 34;
}

// keep でなく、次が別話者の line なら balloon を fade exit
function applyBalloonExits(
  balloons: { el: BalloonElement; speakerIndex: number }[],
  shots: Shot[],
): void {
  // balloon は line shot 順で生成済み。次 line balloon の delay を exit.at に使う
  for (let i = 0; i < balloons.length; i++) {
    const cur = balloons[i]!;
    const next = balloons[i + 1];
    if (!next) continue;
    if (cur.speakerIndex === next.speakerIndex) continue; // 同話者連続は維持
    // shot 側 keep を引くため、対応 shot を探す(line 出現順 = balloon 順)
    const shot = nthLineShot(shots, i);
    if (shot?.balloon?.keep === true) continue;
    cur.el.exit = { type: "fade", at: next.el.enter.delay, dur: 0.25 };
  }
}

function nthLineShot(shots: Shot[], n: number): Shot | undefined {
  let count = 0;
  for (const s of shots) {
    if (s.line !== undefined) {
      if (count === n) return s;
      count++;
    }
  }
  return undefined;
}

function makeCharacter(
  cast: Cast,
  index: number,
  st: CastState,
  defaultScale: number,
  groundY: number,
): CharacterElement {
  const pos = resolvePlace(cast.at, groundY);
  const faceLeft = resolveFaceLeft(cast);
  const expressions: ExpressionKey[] = [];
  // 初期表情(mood)は t=0
  expressions.push({ t: 0, preset: cast.mood ?? "neutral" });
  for (const ex of st.expressions) expressions.push(ex);

  return {
    id: `scene-char-${index}`,
    kind: "character",
    ref: cast.ref,
    transform: {
      x: pos.x,
      y: pos.y,
      scale: cast.scale ?? defaultScale,
      flipX: faceLeft,
    },
    z: index,
    locked: false,
    enter: { type: cast.enter ?? "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: st.actions,
    expressions,
    talks: st.talks,
  };
}

function makeCaption(id: string, text: string, t0: number): TextElement {
  return {
    id,
    kind: "text",
    text,
    size: 48,
    color: "#2E2A33",
    strokeColor: "#ffffff",
    strokeWidth: 6,
    transform: { x: STAGE_W / 2, y: 900, scale: 1, flipX: false },
    z: 100,
    locked: false,
    enter: { type: "fade", delay: t0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
  };
}

function makeCameraKey(
  shot: Shot,
  t0: number,
  castStates: Map<string, CastState>,
  groundY: number,
): CameraKey {
  if (shot.camera === "reset" || shot.camera === undefined) {
    return { t: t0, x: STAGE_W / 2, y: 1080 / 2, zoom: 1 };
  }
  const cam = shot.camera;
  let cx = STAGE_W / 2;
  let cy = 1080 / 2;
  if (cam.on !== undefined) {
    if (typeof cam.on === "string") {
      const st = castStates.get(cam.on);
      if (st) {
        cx = st.x;
        cy = st.y - 200;
      } else {
        // place 名として解釈
        const place = resolvePlace(cam.on as Place, groundY);
        cx = place.x;
        cy = place.y - 200;
      }
    } else {
      const place = resolvePlace(cam.on, groundY);
      cx = place.x;
      cy = place.y - 200;
    }
  }
  const key: CameraKey = { t: t0, x: cx, y: cy, zoom: cam.zoom };
  if (cam.ease !== undefined) key.ease = cam.ease;
  return key;
}

function resolveBackground(
  bg: string | null | undefined,
): { color?: string; image?: string } | null {
  if (bg === null || bg === undefined) return null;
  if (bg.startsWith("#")) return { color: bg };
  return { image: bg };
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

export function compile(story: Story): ProjectDoc {
  // 入力を正規化(default 補完を確定。string 入力でも parseStory 同様に通す)
  const parsed = StorySchema.parse(story);

  const voiceCounter = { n: 0 };
  const scenes: SceneDoc[] = [];
  parsed.scenes.forEach((scene, i) => {
    const result = compileScene(scene, i, parsed, voiceCounter);
    scenes.push(result.scene);
  });

  // 全 t を出力直前に 1/30s グリッドへ量子化(二重保証)
  for (const scene of scenes) {
    scene.duration = quantize(scene.duration);
    for (const cam of scene.camera) cam.t = quantize(cam.t);
    for (const el of scene.elements) {
      if (el.kind === "character") {
        for (const a of el.actions) a.t = quantize(a.t);
        for (const ex of el.expressions) ex.t = quantize(ex.t);
        for (const tk of el.talks) tk.t = quantize(tk.t);
        // t昇順整列(安定)
        el.actions.sort((a, b) => a.t - b.t);
        el.expressions.sort((a, b) => a.t - b.t);
        el.talks.sort((a, b) => a.t - b.t);
      } else {
        el.enter.delay = quantize(el.enter.delay);
        if (el.exit.at !== null) el.exit.at = quantize(el.exit.at);
      }
    }
  }

  return {
    formatVersion: 1,
    id: resolveStoryId(parsed),
    title: parsed.title,
    stage: { w: 1920, h: 1080, fps: FPS },
    bgm: resolveBgm(parsed),
    scenes,
  };
}

// id 省略時は title の決定論ハッシュ(乱数禁止)
function resolveStoryId(story: Story): string {
  if (story.id !== undefined) return story.id;
  return `story-${slugHash(story.title)}`;
}

// 文字列 → 安定 8桁16進ハッシュ(FNV-1a。乱数・時刻に依存しない)
function slugHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function resolveBgm(story: Story): ProjectDoc["bgm"] {
  if (story.bgm === undefined) return [];
  if (typeof story.bgm === "string") {
    return [{ audio: story.bgm, gain: 0.5, loop: true }];
  }
  return [{ audio: story.bgm.audio, gain: story.bgm.gain, loop: story.bgm.loop }];
}
