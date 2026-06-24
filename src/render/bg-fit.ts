// 背景画像のステージへのフィット計算 (描画から分離した純関数・テスト可能)。
//
// - 16:9 より横長 (パノラマ) → 高さフィット・左端基準・全幅で敷く。
//   ワールド幅 = 描画後の背景幅。カメラ x をこの範囲でパンすると横スクロールになる。
// - それ以外 (16:9 以内) → 従来どおり cover-fit + 中央寄せ。ワールド幅 = ステージ幅。
//
// scale/x/y は背景 Sprite に与える値、worldWidth はカメラがパンできるワールドの横幅。
export function computeBgFit(
  texW: number,
  texH: number,
  stageW: number,
  stageH: number,
): { scale: number; x: number; y: number; worldWidth: number } {
  if (texW <= 0 || texH <= 0) return { scale: 1, x: 0, y: 0, worldWidth: stageW };
  const stageAspect = stageW / stageH;
  const texAspect = texW / texH;
  if (texAspect > stageAspect + 1e-3) {
    // パノラマ: 高さを合わせ、左端 (world x=0) から全幅で敷く。
    const scale = stageH / texH;
    return { scale, x: 0, y: 0, worldWidth: texW * scale };
  }
  // 通常: 短辺基準でステージを覆い、はみ出しを中央クロップ。
  const scale = Math.max(stageW / texW, stageH / texH);
  return {
    scale,
    x: (stageW - texW * scale) / 2,
    y: (stageH - texH * scale) / 2,
    worldWidth: stageW,
  };
}
