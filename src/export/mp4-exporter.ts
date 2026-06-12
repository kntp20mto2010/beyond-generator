import { Application } from "pixi.js";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { ProjectDoc } from "../core/schema/project.js";
import type { AssetResolver } from "../io/asset-resolver.js";
import { SceneRenderStack } from "../render/scene-render-stack.js";
import { ScenePhysicsPool } from "../runtime/scene-physics.js";
import type { CharResolver } from "../runtime/scene-eval.js";
import { withPixiInitLock } from "../render/pixi-init-lock.js";
import {
  buildExportTimeline,
  collectTalkPlacements,
  frameToSceneT,
  interleaveStereo,
  transitionProgress,
  type ExportTimeline,
} from "./export-timeline.js";

export interface ExportSettings {
  width: 1920 | 1280;
  height: 1080 | 720;
  fps: 30 | 24;
  videoBitrate?: number;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  phase: "audio" | "video" | "mux";
}

const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 128_000;
const AUDIO_CHUNK_FRAMES = 1024; // AudioData 1個あたりのサンプルフレーム数
const ENCODE_QUEUE_LIMIT = 8; // これを超えたらバックプレッシャ待機

class CancelledError extends Error {
  constructor() {
    super("export cancelled");
    this.name = "CancelledError";
  }
}

export function isExportCancelled(e: unknown): boolean {
  return e instanceof CancelledError;
}

function videoCodec(width: number): string {
  // 1080p: High 4.0 / 720p: High 3.1
  return width >= 1920 ? "avc1.640028" : "avc1.64001f";
}

function defaultBitrate(width: number): number {
  return width >= 1920 ? 8_000_000 : 5_000_000;
}

// 次のマクロタスクまで待つ(エンコードキューを捌かせる)。
// setTimeout(0) はバックグラウンドタブで最低1秒にスロットルされ書き出しが1fps化するため、
// スロットリング対象外の MessageChannel を使う(実踏: ヘッドレス/非表示タブで60秒→数秒)
const tickChannel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
function nextTick(): Promise<void> {
  if (!tickChannel) return new Promise((r) => setTimeout(r));
  return new Promise((r) => {
    tickChannel.port1.onmessage = () => r();
    tickChannel.port2.postMessage(null);
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError();
}

// プロジェクト全編を音声付き MP4 に書き出す。評価器(プレビューと同一)をフレーム順に回す。
export async function exportMp4(
  project: ProjectDoc,
  resolver: AssetResolver,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);

  const { width, height, fps } = settings;
  const timeline = buildExportTimeline(project, fps);
  const totalFrames = timeline.totalFrames;

  // --- 1) 事前ロード: 全キャラ/画像/音声を解決 ---
  // (呼び出し側でも ensure 済みだが、書き出しは解決済み前提なので念のため待つ)
  onProgress({ frame: 0, totalFrames, phase: "audio" });

  // --- 2) 音声ミックス(OfflineAudioContext)→ エンコード用に AudioBuffer を得る ---
  const mixedAudio = await renderAudioMix(project, resolver, timeline, signal);

  throwIfAborted(signal);

  // --- 3) muxer ---
  const target = new ArrayBufferTarget();
  const hasAudio = mixedAudio !== null && mixedAudio.length > 0;
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    ...(hasAudio
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: AUDIO_CHANNELS,
            sampleRate: AUDIO_SAMPLE_RATE,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  // --- 4) エンコーダ ---
  let encoderError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  videoEncoder.configure({
    codec: videoCodec(width),
    width,
    height,
    bitrate: settings.videoBitrate ?? defaultBitrate(width),
    framerate: fps,
    latencyMode: "quality",
  });

  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: AUDIO_CHANNELS,
      bitrate: AUDIO_BITRATE,
    });
  }

  // --- 5) 専用 Pixi(DOM追加なし)+ SceneRenderStack + 物理プール ---
  const app = new Application();
  let stack: SceneRenderStack | null = null;

  // 全経路のクリーンアップ(成功/失敗/キャンセル)
  const cleanup = () => {
    try {
      stack?.destroy();
    } catch {
      /* noop */
    }
    try {
      if (app.renderer) app.destroy(true, { children: true });
    } catch {
      /* noop */
    }
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      /* noop */
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      /* noop */
    }
  };

  try {
    await withPixiInitLock(() =>
      app.init({
        width,
        height,
        background: 0x000000,
        antialias: true,
        // 書き出しは等倍(物理ピクセル = 論理ピクセル)。devicePixelRatio は使わない
        resolution: 1,
        autoDensity: false,
        preference: "webgl",
      }),
    );
    throwIfAborted(signal);

    // ステージ(1920幅)を canvas(width)へ収める基準スケール
    stack = new SceneRenderStack(app, resolver, width / 1920);
    const pool = new ScenePhysicsPool();
    const charResolver: CharResolver = { getCharacter: (ref) => resolver.getCharacter(ref) };

    // --- 6) 音声エンコード(video より先に流して muxer に音声チャンクを供給) ---
    if (audioEncoder && mixedAudio) {
      encodeAudio(audioEncoder, mixedAudio);
    }

    // --- 7) 映像フレームループ ---
    let globalFrame = 0;
    onProgress({ frame: 0, totalFrames, phase: "video" });

    for (let si = 0; si < project.scenes.length; si++) {
      const scene = project.scenes[si]!;
      const timing = timeline.scenes[si]!;
      const nextTiming = timeline.scenes[si + 1];

      // シーン頭で物理を t=0 から再構築
      pool.seek(project, scene, 0, charResolver);
      let prevT = 0;

      // このシーンに入るトランジション(前シーンから引き継いだ snapshot)を解消する窓
      const incoming = timing.transition; // scenes[0] は cut 固定(timeline側で保証)

      for (let f = 0; f < timing.frameCount; f++) {
        throwIfAborted(signal);
        if (encoderError) throw encoderError;

        const t = frameToSceneT(f, fps, scene.duration);
        if (t > prevT) {
          pool.advance(project, scene, prevT, t, charResolver);
          prevT = t;
        }

        // 入ってくるトランジション(このシーンが新シーン側)の slidePush と進行
        let slidePush = 0;
        const inProg = transitionProgress(incoming, t);
        if (inProg !== null && stack.hasTransition()) {
          if (incoming.type === "slide") slidePush = (1 - inProg) * stack.viewW;
        }

        stack.renderFrame(project, scene, t, pool, { slidePush });

        // snapshot を進行に合わせて変形/消去(新シーンの最初の dur 秒)
        if (inProg !== null && stack.hasTransition()) {
          stack.applyTransition(inProg);
        }

        app.renderer.render(app.stage);

        const timestampUs = Math.round((globalFrame * 1e6) / fps);
        const frame = new VideoFrame(app.canvas, {
          timestamp: timestampUs,
          duration: Math.round(1e6 / fps),
        });
        // キーフレームは fps*2 ごと(GOP 2秒)。先頭は必ず key
        videoEncoder.encode(frame, { keyFrame: globalFrame % (fps * 2) === 0 });
        frame.close();

        globalFrame++;
        onProgress({ frame: globalFrame, totalFrames, phase: "video" });

        // バックプレッシャ: キューが溜まったら捌けるまで待つ
        while (videoEncoder.encodeQueueSize > ENCODE_QUEUE_LIMIT) {
          throwIfAborted(signal);
          if (encoderError) throw encoderError;
          await nextTick();
        }
      }

      // 残った snapshot は破棄(進行が 1 に届かないケースの保険)
      stack.disposeTransition();

      // 次シーンが cut 以外なら、現フレーム(このシーン最終 = scene.duration)を snapshot 化
      if (nextTiming && nextTiming.transition.type !== "cut") {
        // 直前に scene.duration を描いた状態にしてから snapshot を取る
        const endT = scene.duration;
        if (endT > prevT) {
          pool.advance(project, scene, prevT, endT, charResolver);
          prevT = endT;
        }
        stack.renderFrame(project, scene, endT, pool, {});
        app.renderer.render(app.stage);
        stack.beginTransition(nextTiming.transition.type, nextTiming.transition.dur);
      }
    }

    throwIfAborted(signal);
    if (encoderError) throw encoderError;

    // --- 8) flush → finalize ---
    onProgress({ frame: totalFrames, totalFrames, phase: "mux" });
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (encoderError) throw encoderError;

    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });

    cleanup();
    return blob;
  } catch (e) {
    cleanup();
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 音声: OfflineAudioContext で talk + BGM をミックス → AudioBuffer
// ---------------------------------------------------------------------------

async function renderAudioMix(
  project: ProjectDoc,
  resolver: AssetResolver,
  timeline: ExportTimeline,
  signal: AbortSignal,
): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === "undefined") return null;
  const totalSec = timeline.totalDurationSec;
  if (totalSec <= 0) return null;

  const totalFrames = Math.ceil(totalSec * AUDIO_SAMPLE_RATE);
  // length=0 は例外。安全側で 0 以下なら音声なし
  if (totalFrames <= 0) return null;

  const ctx = new OfflineAudioContext(AUDIO_CHANNELS, totalFrames, AUDIO_SAMPLE_RATE);
  let scheduled = 0;

  // talk: グローバル開始秒で配置(GainNode)
  for (const tp of collectTalkPlacements(project, timeline)) {
    const a = resolver.getAudio(tp.audio);
    if (!a) continue;
    if (tp.startSec >= totalSec) continue;
    const src = ctx.createBufferSource();
    src.buffer = a.buffer;
    const g = ctx.createGain();
    g.gain.value = tp.gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(Math.max(0, tp.startSec));
    scheduled++;
  }

  // BGM: 総尺までループ(v1 は doc.bgm[0] のみ)
  const bgm = project.bgm[0];
  if (bgm) {
    const a = resolver.getAudio(bgm.audio);
    if (a) {
      const src = ctx.createBufferSource();
      src.buffer = a.buffer;
      src.loop = bgm.loop;
      const g = ctx.createGain();
      g.gain.value = bgm.gain;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(0);
      scheduled++;
    }
  }

  if (scheduled === 0) return null;
  throwIfAborted(signal);

  const rendered = await ctx.startRendering();
  throwIfAborted(signal);
  return rendered;
}

// AudioBuffer をインターリーブ f32 のチャンクに分けて AudioEncoder へ
function encodeAudio(encoder: AudioEncoder, buffer: AudioBuffer): void {
  const interleaved = interleaveStereo(buffer);
  const totalFrames = buffer.length;
  let frameOffset = 0;
  while (frameOffset < totalFrames) {
    const n = Math.min(AUDIO_CHUNK_FRAMES, totalFrames - frameOffset);
    const slice = interleaved.subarray(frameOffset * 2, (frameOffset + n) * 2);
    const data = new Float32Array(slice); // detach 対策にコピー
    const timestampUs = Math.round((frameOffset * 1e6) / AUDIO_SAMPLE_RATE);
    const audioData = new AudioData({
      format: "f32",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfFrames: n,
      numberOfChannels: AUDIO_CHANNELS,
      timestamp: timestampUs,
      data,
    });
    encoder.encode(audioData);
    audioData.close();
    frameOffset += n;
  }
}
