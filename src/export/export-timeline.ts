import type { ProjectDoc, Transition } from "../core/schema/project.js";

// 書き出しの決定論的な時間計算(Pixi/WebCodecs 非依存・純関数)。テスト対象。

export interface SceneTiming {
  index: number;
  sceneId: string;
  // このシーンのローカルフレーム数 = ceil(duration * fps)
  frameCount: number;
  // 全体通しでの先頭フレーム番号(= 前シーンまでの frameCount 合計)
  startFrame: number;
  // 全体通しでの開始秒(= 前シーンまでの duration 合計)。音声配置に使う
  startSec: number;
  duration: number;
  // 前シーンからこのシーンへの切替効果(scenes[0] は常に cut 扱い)
  transition: Transition;
}

export interface ExportTimeline {
  fps: number;
  totalFrames: number;
  totalDurationSec: number; // 全 duration の合計(音声総尺の基準)
  scenes: SceneTiming[];
}

// シーン毎フレーム数 / グローバル開始フレーム・秒 / 総フレーム数 / トランジション窓を求める
export function buildExportTimeline(project: ProjectDoc, fps: number): ExportTimeline {
  const scenes: SceneTiming[] = [];
  let startFrame = 0;
  let startSec = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i]!;
    const frameCount = Math.max(0, Math.ceil(scene.duration * fps));
    // scenes[0] のトランジションは無視(常に cut)
    const transition: Transition =
      i === 0 ? { type: "cut", dur: scene.transition.dur } : scene.transition;
    scenes.push({
      index: i,
      sceneId: scene.id,
      frameCount,
      startFrame,
      startSec,
      duration: scene.duration,
      transition,
    });
    startFrame += frameCount;
    startSec += scene.duration;
  }
  return {
    fps,
    totalFrames: startFrame,
    totalDurationSec: startSec,
    scenes,
  };
}

// シーン内ローカルフレーム f(0..frameCount-1)の評価時刻 t = f / fps。
// 末尾フレームでも duration を超えないようクランプ(評価器は t>=duration を許容するが安全側に)。
export function frameToSceneT(frame: number, fps: number, duration: number): number {
  const t = frame / fps;
  return t > duration ? duration : t;
}

// トランジション窓: 新シーン先頭から dur 秒間。relT(新シーン相対秒)に対する進行 p(0..1)。
// type が cut もしくは dur<=0 なら窓なし(null)。
export function transitionProgress(
  transition: Transition,
  relT: number,
): number | null {
  if (transition.type === "cut") return null;
  if (transition.dur <= 0) return relT >= 0 ? 1 : null;
  if (relT < 0) return null;
  const p = relT / transition.dur;
  return p >= 1 ? 1 : p;
}

// ---------------------------------------------------------------------------
// 音声配置(talk / BGM)— 純関数。OfflineAudioContext へ渡す前の決定論計算。
// ---------------------------------------------------------------------------

export interface TalkPlacement {
  audio: string;
  // 全体通しでの開始秒(= シーン startSec + talk.t)
  startSec: number;
  gain: number;
}

// 全シーンの talk を「グローバル開始秒 + gain」へ展開(durationは音声バッファ実長から別途)。
// timeline の startSec(durationベース)を使う。
export function collectTalkPlacements(
  project: ProjectDoc,
  timeline: ExportTimeline,
): TalkPlacement[] {
  const out: TalkPlacement[] = [];
  for (const st of timeline.scenes) {
    const scene = project.scenes[st.index]!;
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      for (const talk of el.talks) {
        out.push({
          audio: talk.audio,
          startSec: st.startSec + talk.t,
          gain: talk.gain,
        });
      }
    }
  }
  return out;
}

// BGM を総尺まで敷き詰めるのに必要なループ回数(loop=false なら1)。
// bufferDuration<=0 は0回(無音扱い)。
export function bgmLoopCount(
  totalDurationSec: number,
  bufferDuration: number,
  loop: boolean,
): number {
  if (bufferDuration <= 0 || totalDurationSec <= 0) return 0;
  if (!loop) return 1;
  return Math.ceil(totalDurationSec / bufferDuration);
}

// ---------------------------------------------------------------------------
// AudioBuffer → インターリーブ Float32(AudioData format "f32" 用)
// ---------------------------------------------------------------------------

// 2ch 固定でインターリーブ。モノラル入力は左右複製、3ch以上は先頭2chを使用。
// 最小限のバッファ形(numberOfChannels / length / getChannelData)で受けてテスト可能に。
export interface ChannelBufferLike {
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

export function interleaveStereo(buffer: ChannelBufferLike): Float32Array {
  const frames = buffer.length;
  const out = new Float32Array(frames * 2);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels >= 2 ? buffer.getChannelData(1) : ch0;
  for (let i = 0; i < frames; i++) {
    out[i * 2] = ch0[i] ?? 0;
    out[i * 2 + 1] = ch1[i] ?? 0;
  }
  return out;
}
