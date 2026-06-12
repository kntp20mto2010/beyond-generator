import { describe, expect, it } from "vitest";
import { computeMouthEnvelope, type PcmLike } from "./mouth-envelope.js";

// 指定サンプル配列を1チャンネルとして返すモックバッファ
function mockBuffer(samples: number[], sampleRate: number): PcmLike {
  const data = Float32Array.from(samples);
  return {
    length: data.length,
    sampleRate,
    getChannelData: () => data,
  };
}

// 区間[start,end)を正弦波、それ以外を無音にした波形を作る
function makeWave(totalSamples: number, voiceStart: number, voiceEnd: number, sampleRate: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < totalSamples; i++) {
    if (i >= voiceStart && i < voiceEnd) {
      out.push(Math.sin((i / sampleRate) * 2 * Math.PI * 220) * 0.8);
    } else {
      out.push(0);
    }
  }
  return out;
}

describe("computeMouthEnvelope", () => {
  it("無音→正弦波→無音で、声の区間だけ口が開く", () => {
    const fps = 30;
    const sr = 3000; // 100サンプル/フレーム(RMSが安定する現実的な比率)
    // 10フレーム分。フレーム 0..1 無音, 2..6 声, 7..9 無音
    const fpsSamples = sr / fps; // 100
    const samples = makeWave(10 * fpsSamples, 2 * fpsSamples, 7 * fpsSamples, sr);
    const env = computeMouthEnvelope(mockBuffer(samples, sr), fps);
    expect(env.length).toBe(10);
    // 無音フレームは閉、声フレームは開
    expect(env[0]).toBe(0);
    expect(env[1]).toBe(0);
    expect(env[2]).toBe(1);
    expect(env[5]).toBe(1);
    expect(env[6]).toBe(1);
    expect(env[8]).toBe(0);
    expect(env[9]).toBe(0);
  });

  it("全無音なら全フレーム閉", () => {
    const env = computeMouthEnvelope(mockBuffer(new Array(8).fill(0), 30), 30);
    expect([...env]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("孤立した1フレームの開を前後と均す(閉→開→閉 が 閉のまま)", () => {
    // フレーム3だけ突発音、前後は無音 → 孤立開はチャタリング除去される
    const samples = [0, 0, 0, 0.9, 0, 0, 0];
    const env = computeMouthEnvelope(mockBuffer(samples, 7), 7);
    expect(env[3]).toBe(0); // 孤立開は均されて閉
  });

  it("孤立した1フレームの閉を前後と均す(開→閉→開 が 開のまま)", () => {
    // 連続音の中の1フレームだけ瞬間的に落ち込む → 孤立閉は開に均される
    // RMSベースなので、両端を強く・中央を閾値未満にして孤立閉を作る
    const samples = [0.9, 0.9, 0.0001, 0.9, 0.9];
    const env = computeMouthEnvelope(mockBuffer(samples, 5), 5);
    expect(env[0]).toBe(1);
    expect(env[2]).toBe(1); // 孤立閉は均されて開
    expect(env[4]).toBe(1);
  });

  it("空バッファは長さ0", () => {
    expect(computeMouthEnvelope(mockBuffer([], 44100), 30).length).toBe(0);
  });

  it("フレーム数 = ceil(length / (sampleRate/fps))", () => {
    // 44100Hz, 30fps → 1470サンプル/フレーム。3000サンプル → ceil(3000/1470)=3フレーム
    const env = computeMouthEnvelope(mockBuffer(new Array(3000).fill(0), 44100), 30);
    expect(env.length).toBe(3);
  });
});
