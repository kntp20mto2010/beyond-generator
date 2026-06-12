import { describe, expect, it } from "vitest";
import {
  bgmLoopCount,
  buildExportTimeline,
  collectTalkPlacements,
  frameToSceneT,
  interleaveStereo,
  transitionProgress,
} from "./export-timeline.js";
import type { ProjectDoc, SceneDoc } from "../core/schema/project.js";

function scene(id: string, duration: number, partial: Partial<SceneDoc> = {}): SceneDoc {
  return {
    id,
    duration,
    durationMode: "manual",
    background: null,
    camera: [],
    transition: { type: "cut", dur: 0.5 },
    elements: [],
    seed: 1,
    ...partial,
  };
}

function project(scenes: SceneDoc[]): ProjectDoc {
  return {
    formatVersion: 1,
    id: "p",
    title: "t",
    stage: { w: 1920, h: 1080, fps: 30 },
    bgm: [],
    scenes,
  };
}

describe("buildExportTimeline", () => {
  it("computes frame counts, global start frame/sec, total frames", () => {
    const tl = buildExportTimeline(
      project([scene("a", 5), scene("b", 5.5), scene("c", 6)]),
      30,
    );
    expect(tl.scenes.map((s) => s.frameCount)).toEqual([150, 165, 180]);
    expect(tl.scenes.map((s) => s.startFrame)).toEqual([0, 150, 315]);
    expect(tl.scenes.map((s) => s.startSec)).toEqual([0, 5, 10.5]);
    expect(tl.totalFrames).toBe(150 + 165 + 180);
    expect(tl.totalDurationSec).toBeCloseTo(16.5, 6);
  });

  it("rounds non-integer frame counts up (ceil)", () => {
    // 24fps, duration 1.01s -> 24.24 -> ceil 25
    const tl = buildExportTimeline(project([scene("a", 1.01)]), 24);
    expect(tl.scenes[0]!.frameCount).toBe(25);
  });

  it("forces scenes[0] transition to cut, keeps later ones", () => {
    const tl = buildExportTimeline(
      project([
        scene("a", 4, { transition: { type: "fade", dur: 0.5 } }),
        scene("b", 4, { transition: { type: "wipe", dur: 0.8 } }),
      ]),
      30,
    );
    expect(tl.scenes[0]!.transition.type).toBe("cut");
    expect(tl.scenes[1]!.transition).toEqual({ type: "wipe", dur: 0.8 });
  });

  it("handles empty project", () => {
    const tl = buildExportTimeline(project([]), 30);
    expect(tl.totalFrames).toBe(0);
    expect(tl.totalDurationSec).toBe(0);
    expect(tl.scenes).toEqual([]);
  });
});

describe("frameToSceneT", () => {
  it("maps frame to t and clamps to duration", () => {
    expect(frameToSceneT(0, 30, 5)).toBe(0);
    expect(frameToSceneT(15, 30, 5)).toBe(0.5);
    expect(frameToSceneT(150, 30, 5)).toBe(5); // clamp (150/30 = 5)
    expect(frameToSceneT(160, 30, 5)).toBe(5); // beyond duration -> clamp
  });
});

describe("transitionProgress", () => {
  it("returns null for cut", () => {
    expect(transitionProgress({ type: "cut", dur: 0.5 }, 0.1)).toBeNull();
  });
  it("returns 0..1 progress during window for fade", () => {
    expect(transitionProgress({ type: "fade", dur: 0.5 }, 0)).toBe(0);
    expect(transitionProgress({ type: "fade", dur: 0.5 }, 0.25)).toBeCloseTo(0.5, 6);
    expect(transitionProgress({ type: "fade", dur: 0.5 }, 0.5)).toBe(1);
    expect(transitionProgress({ type: "fade", dur: 0.5 }, 1.0)).toBe(1); // clamp
  });
  it("returns null before window start", () => {
    expect(transitionProgress({ type: "slide", dur: 0.5 }, -0.1)).toBeNull();
  });
  it("treats dur<=0 as instant complete", () => {
    expect(transitionProgress({ type: "wipe", dur: 0 }, 0)).toBe(1);
  });
});

describe("collectTalkPlacements", () => {
  it("offsets talk.t by scene global startSec, preserves gain", () => {
    const p = project([
      scene("a", 5, {
        elements: [
          {
            id: "c1",
            kind: "character",
            ref: "builtin:template-a",
            transform: { x: 0, y: 0, scale: 1, flipX: false },
            z: 0,
            locked: false,
            enter: { type: "cut", delay: 0, dur: 0.4 },
            exit: { type: "cut", at: null, dur: 0.4 },
            actions: [],
            expressions: [],
            talks: [{ t: 1, audio: "assets/audio/vo-001.wav", gain: 0.8 }],
          },
        ],
      }),
      scene("b", 5, {
        elements: [
          {
            id: "c2",
            kind: "character",
            ref: "builtin:template-a",
            transform: { x: 0, y: 0, scale: 1, flipX: false },
            z: 0,
            locked: false,
            enter: { type: "cut", delay: 0, dur: 0.4 },
            exit: { type: "cut", at: null, dur: 0.4 },
            actions: [],
            expressions: [],
            talks: [{ t: 2, audio: "assets/audio/vo-002.wav", gain: 1 }],
          },
        ],
      }),
    ]);
    const tl = buildExportTimeline(p, 30);
    const placements = collectTalkPlacements(p, tl);
    expect(placements).toEqual([
      { audio: "assets/audio/vo-001.wav", startSec: 1, gain: 0.8 },
      { audio: "assets/audio/vo-002.wav", startSec: 7, gain: 1 },
    ]);
  });

  it("returns empty when no talks", () => {
    const p = project([scene("a", 4)]);
    const tl = buildExportTimeline(p, 30);
    expect(collectTalkPlacements(p, tl)).toEqual([]);
  });
});

describe("bgmLoopCount", () => {
  it("loops to cover total duration", () => {
    expect(bgmLoopCount(10, 3, true)).toBe(4); // ceil(10/3)
    expect(bgmLoopCount(9, 3, true)).toBe(3);
  });
  it("returns 1 when loop disabled", () => {
    expect(bgmLoopCount(10, 3, false)).toBe(1);
  });
  it("returns 0 for empty/invalid", () => {
    expect(bgmLoopCount(0, 3, true)).toBe(0);
    expect(bgmLoopCount(10, 0, true)).toBe(0);
  });
});

describe("interleaveStereo", () => {
  it("interleaves a stereo buffer", () => {
    const l = new Float32Array([0.1, 0.2, 0.3]);
    const r = new Float32Array([-0.1, -0.2, -0.3]);
    const buf = {
      numberOfChannels: 2,
      length: 3,
      getChannelData: (ch: number) => (ch === 0 ? l : r),
    };
    const out = interleaveStereo(buf);
    const expected = [0.1, -0.1, 0.2, -0.2, 0.3, -0.3];
    expect(out.length).toBe(expected.length);
    expected.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 6));
  });

  it("duplicates mono into both channels", () => {
    const m = new Float32Array([0.5, -0.5]);
    const buf = {
      numberOfChannels: 1,
      length: 2,
      getChannelData: () => m,
    };
    const out = interleaveStereo(buf);
    expect(Array.from(out)).toEqual([0.5, 0.5, -0.5, -0.5]);
  });
});
