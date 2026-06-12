// 音声バッファ → フレーム毎の口の開閉列(0/1)。書き出しとプレビューで共通の純データ。
// fps はステージfps(30)と一致させる。長さ = ceil(duration * fps)。

// AudioBuffer のうち本関数が必要とする最小構造(テストでモックしやすいよう絞る)
export interface PcmLike {
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

// フレーム毎RMS → 閾値で0/1化 → 孤立1フレームを均す。純関数(テスト対象)。
export function computeMouthEnvelope(buffer: PcmLike, fps = 30): Uint8Array {
  const { length, sampleRate } = buffer;
  if (length <= 0 || sampleRate <= 0) return new Uint8Array(0);
  const data = buffer.getChannelData(0);
  const samplesPerFrame = sampleRate / fps;
  const frameCount = Math.max(1, Math.ceil(length / samplesPerFrame));

  // 各フレームのRMSを算出
  const rms = new Float32Array(frameCount);
  let maxRms = 0;
  for (let f = 0; f < frameCount; f++) {
    const start = Math.floor(f * samplesPerFrame);
    const end = Math.min(length, Math.floor((f + 1) * samplesPerFrame));
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      const v = data[i] ?? 0;
      sum += v * v;
      n++;
    }
    const r = n > 0 ? Math.sqrt(sum / n) : 0;
    rms[f] = r;
    if (r > maxRms) maxRms = r;
  }

  // 閾値 = max(全体最大 × 0.15, 1e-4)
  const threshold = Math.max(maxRms * 0.15, 1e-4);
  const open = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    open[f] = (rms[f] ?? 0) >= threshold ? 1 : 0;
  }

  // チャタリング防止: 前後と異なる孤立1フレームを前後と同値化
  if (frameCount >= 3) {
    const smoothed = Uint8Array.from(open);
    for (let f = 1; f < frameCount - 1; f++) {
      const prev = open[f - 1]!;
      const next = open[f + 1]!;
      if (prev === next && open[f] !== prev) smoothed[f] = prev;
    }
    return smoothed;
  }
  return open;
}
