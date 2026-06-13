import type {
  BalloonElement,
  CharacterElement,
  ProjectDoc,
  SceneDoc,
  TextElement,
} from "../core/schema/project.js";
import { PLACE_TABLE } from "./timing.js";
import type {
  Cast,
  Place,
  PlaceName,
  Scene,
  Shot,
  Story,
  TransitionName,
} from "./schema.js";

const PLACE_EPS = 24; // place 名と一致とみなす許容
const T_EPS = 1e-6;

// x 座標 → 最寄りの place 名(なければ {x})。round-trip で初期 at を復元
function xToPlace(x: number, y: number, groundY: number): Place {
  let best: PlaceName | undefined;
  let bestD = Infinity;
  for (const [name, px] of Object.entries(PLACE_TABLE) as [PlaceName, number][]) {
    const d = Math.abs(px - x);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  if (best !== undefined && bestD <= PLACE_EPS && Math.abs(y - groundY) <= PLACE_EPS) {
    return best;
  }
  return y === groundY ? { x } : { x, y };
}

// ProjectDoc transition → Story transition(0.5 既定なら string に縮約)
function decompileTransition(
  t: SceneDoc["transition"],
): TransitionName | { type: TransitionName; dur: number } {
  if (Math.abs(t.dur - 0.5) < T_EPS) return t.type;
  return { type: t.type, dur: t.dur };
}

function decompileBg(bg: SceneDoc["background"]): string | null | undefined {
  if (bg === null) return null;
  if (bg.image !== undefined) return bg.image;
  if (bg.color !== undefined) return bg.color;
  return null;
}

// cast.ref から短いローカル id を導出(builtin:template-a → template-a)
function refToCastId(ref: string): string {
  return ref
    .replace(/^builtin:/, "")
    .replace(/^.*\//, "")
    .replace(/\.byc\.json$/, "");
}

interface CharInfo {
  el: CharacterElement;
  index: number;
  castId: string;
}

export function decompileScene(scene: SceneDoc, sceneIndex: number): Scene {
  const groundY = inferGroundY(scene);

  const chars: CharInfo[] = [];
  const balloons: BalloonElement[] = [];
  const texts: TextElement[] = [];
  for (const el of scene.elements) {
    if (el.kind === "character") {
      chars.push({ el, index: el.z, castId: refToCastId(el.ref) });
    } else if (el.kind === "balloon") {
      balloons.push(el);
    } else {
      texts.push(el);
    }
  }

  // cast(z 昇順)
  const castOrder = [...chars].sort((a, b) => a.index - b.index);
  const cast: Cast[] = castOrder.map((c) => {
    const out: Cast = {
      id: c.castId,
      ref: c.el.ref,
      at: xToPlace(c.el.transform.x, c.el.transform.y, groundY),
    };
    if (c.el.transform.flipX) out.face = "left";
    // 初期表情(t=0 の expression)を mood に
    const mood = c.el.expressions.find((e) => Math.abs(e.t) < T_EPS);
    if (mood && mood.preset !== "neutral") out.mood = mood.preset as Cast["mood"];
    if (c.el.enter.type !== "cut") out.enter = c.el.enter.type;
    return out;
  });

  // 話者 talk と balloon を delay==t で突合し line shot を再集約
  const shots: Shot[] = [];

  // 各 talk を「shot」種にし、t でグループ化
  interface Pending {
    t: number;
    who: string;
    line?: string;
    clip?: "talk1" | "talk2";
    voice?: string;
    emotion?: string;
  }
  const pendings: Pending[] = [];

  for (const c of chars) {
    const who = c.castId;
    for (const talk of c.el.talks) {
      const balloon = balloons.find(
        (b) => Math.abs(b.enter.delay - talk.t) < 1e-3,
      );
      const action = c.el.actions.find((a) => Math.abs(a.t - talk.t) < 1e-3);
      const expression = c.el.expressions.find(
        (e) => Math.abs(e.t - talk.t) < 1e-3 && e.t > T_EPS,
      );
      const p: Pending = { t: talk.t, who };
      if (balloon) p.line = balloon.text;
      if (action && (action.clip === "talk1" || action.clip === "talk2")) {
        p.clip = action.clip;
      }
      const voice = audioToVoice(talk.audio);
      if (voice) p.voice = voice;
      if (expression) p.emotion = expression.preset;
      pendings.push(p);
    }
    // 発話なしの expression(line/talk と紐づかない表情キー)も shot 化
    for (const ex of c.el.expressions) {
      if (Math.abs(ex.t) < T_EPS) continue; // 初期表情は mood 済み
      const hasTalk = c.el.talks.some((t) => Math.abs(t.t - ex.t) < 1e-3);
      if (hasTalk) continue;
      pendings.push({ t: ex.t, who, emotion: ex.preset });
    }
  }

  // caption(text 要素)
  for (const tx of texts) {
    pendings.push({ t: tx.enter.delay, who: "", line: undefined });
    // caption は line/who を持たない別種。下で text として復元する
  }

  // t 昇順 → shot 化(voice が連番なら省略)
  pendings.sort((a, b) => a.t - b.t);
  let voiceSeq = 0;
  for (const p of pendings) {
    if (p.who === "") continue; // caption は別処理
    const shot: Shot = { who: p.who, silent: false, speed: 1 };
    if (p.line !== undefined) shot.line = p.line;
    if (p.clip !== undefined && p.clip !== "talk1") shot.clip = p.clip;
    if (p.emotion !== undefined) shot.emotion = p.emotion as Shot["emotion"];
    // voice: 連番 vo-NNN なら省略(再コンパイルで同番)
    if (p.voice !== undefined) {
      voiceSeq++;
      const expected = `vo-${String(voiceSeq).padStart(3, "0")}`;
      if (p.voice !== expected) shot.voice = p.voice;
    }
    shots.push(shot);
  }

  // caption shots(text 要素由来)
  for (const tx of texts) {
    shots.push({ caption: tx.text, silent: false, speed: 1 });
  }

  const out: Scene = {
    transition: sceneIndex === 0 ? "cut" : decompileTransition(scene.transition),
    hold: 0.5,
    cast,
    shots,
  };
  const bg = decompileBg(scene.background);
  if (bg !== undefined) out.bg = bg;
  return out;
}

function inferGroundY(scene: SceneDoc): number {
  for (const el of scene.elements) {
    if (el.kind === "character") return el.transform.y;
  }
  return 700;
}

function audioToVoice(audio: string): string | undefined {
  const m = audio.match(/([^/]+)\.(wav|mp3)$/i);
  return m ? m[1] : undefined;
}

export function decompile(project: ProjectDoc): Story {
  const scenes: Scene[] = project.scenes.map((s, i) => decompileScene(s, i));
  const story: Story = {
    format: "byond-story/1",
    id: project.id,
    title: project.title,
    defaults: {
      charPerSec: 7.0,
      gapSec: 0.25,
      balloonShape: "round",
      scale: 0.9,
      groundY: scenes.length > 0 ? inferDefaultGroundY(project) : 700,
    },
    audioDurations: {},
    scenes,
  };
  const bgm = decompileBgm(project);
  if (bgm !== undefined) story.bgm = bgm;
  return story;
}

function inferDefaultGroundY(project: ProjectDoc): number {
  for (const scene of project.scenes) {
    for (const el of scene.elements) {
      if (el.kind === "character") return el.transform.y;
    }
  }
  return 700;
}

function decompileBgm(project: ProjectDoc): Story["bgm"] | undefined {
  const first = project.bgm[0];
  if (!first) return undefined;
  return { audio: first.audio, gain: first.gain, loop: first.loop };
}
