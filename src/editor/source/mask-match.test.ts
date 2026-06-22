import { describe, expect, it } from "vitest";
import { findBboxForVariant, stemCandidates, stemFromVariantSrc, stemMatches, type MaskBbox } from "./mask-match.js";
import type { ObjectVariant } from "../scene/objects-catalog.js";

const W = 1920;
const H = 1080;

function mask(stem: string, x: number, y: number, w = 100, h = 100, canvasW = W, canvasH = H): MaskBbox {
  return { file: `${stem}-mask.png`, stem, canvasW, canvasH, bbox: { x, y, w, h }, mtime: 0 };
}

function variant(src: string): ObjectVariant {
  return { src: `assets/objects/${src}.png`, nativeW: 100, nativeH: 100 };
}

describe("stem helpers", () => {
  it("stemFromVariantSrc strips dir and ext", () => {
    expect(stemFromVariantSrc("assets/objects/sakura-bookshelf-front.png")).toBe("sakura-bookshelf-front");
  });
  it("stemCandidates appends view-suffix-stripped base", () => {
    expect(stemCandidates("assets/objects/sakura-bed-pink-single-leftwall.png")).toEqual([
      "sakura-bed-pink-single-leftwall",
      "sakura-bed-pink-single",
    ]);
  });
  it("stemMatches: exact / prefix both directions", () => {
    expect(stemMatches("sakura-sofa", "sakura-sofa-green-floor")).toBe(true);
    expect(stemMatches("sakura-sofa-green-floor-front", "sakura-sofa-green-floor-front")).toBe(true);
    expect(stemMatches("sakura-bed-altlayout", "sakura-bed-pink-single")).toBe(false);
  });
});

describe("findBboxForVariant exact-first (命名規約 <variant-src-stem>-mask)", () => {
  // r5 の 4 家具 front が「自分の source のマスク」に当たり、古い同名家具マスクに誤マッチしないこと。
  it("ソファ front は r5 マスクに当たる (古い sakura-sofa r2 マスクを拾わない)", () => {
    const masks = [
      mask("sakura-sofa", 1022, 608), // 旧 r2 dimetric 抽出元マスク
      mask("sakura-sofa-green-floor-front", 93, 552), // r5 front (命名規約)
    ];
    const hit = findBboxForVariant(variant("sakura-sofa-green-floor-front"), W, H, masks);
    expect(hit?.bbox.x).toBe(93); // r5 位置
  });

  it("同じソファでも front-dimetric は古い sakura-sofa マスク (r2) に当たる = source 別で別マスク", () => {
    const masks = [
      mask("sakura-sofa", 1022, 608),
      mask("sakura-sofa-green-floor-front", 93, 552),
    ];
    // front-dimetric は完全一致マスクが無い → フォールバックで sakura-sofa に当たる
    const hit = findBboxForVariant(variant("sakura-sofa-green-floor-dimetric"), W, H, masks);
    expect(hit?.bbox.x).toBe(1022); // r2 位置
  });

  it("ベッド/ドレッサー/チェア front も自分の r5 マスクに一意で当たる", () => {
    const masks = [
      mask("sakura-bed-altlayout", 571, 475), // 旧 r1 マスク (stem 不一致)
      mask("sakura-bed-pink-single-front", 1182, 471),
      mask("sakura-vanity-dresser-with-pouf-front", 671, 375),
      mask("sakura-desk-chair-pink-front", 986, 467),
      mask("sakura-desk-chair-altlayout-r5", 1329, 440), // 失敗版 r1 (stem 不一致)
    ];
    expect(findBboxForVariant(variant("sakura-bed-pink-single-front"), W, H, masks)?.bbox.x).toBe(1182);
    expect(findBboxForVariant(variant("sakura-vanity-dresser-with-pouf-front"), W, H, masks)?.bbox.x).toBe(671);
    expect(findBboxForVariant(variant("sakura-desk-chair-pink-front"), W, H, masks)?.bbox.x).toBe(986);
  });

  it("旧マスク (命名規約前) はフォールバックの緩いマッチで当たる", () => {
    const masks = [mask("sakura-wardrobe-front", 533, 185), mask("sakura-wardrobe", 1268, 121)];
    // front 完全一致
    expect(findBboxForVariant(variant("sakura-wardrobe-front"), W, H, masks)?.bbox.x).toBe(533);
    // side は完全一致なし → フォールバックで sakura-wardrobe
    expect(findBboxForVariant(variant("sakura-wardrobe-leftwall"), W, H, masks)?.bbox.x).toBe(1268);
  });

  it("canvas サイズ不一致のマスクは除外", () => {
    const masks = [mask("sakura-sofa-green-floor-front", 93, 552, 100, 100, 1358, 764)];
    expect(findBboxForVariant(variant("sakura-sofa-green-floor-front"), W, H, masks)).toBeNull();
  });

  it("マッチなしは null", () => {
    expect(findBboxForVariant(variant("sakura-nonexistent-front"), W, H, [mask("sakura-sofa", 0, 0)])).toBeNull();
  });
});
