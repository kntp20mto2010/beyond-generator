// 緑マスク bbox と catalog variant の対応付け (抽出元タブ QC レイアウトの自動配置用)。
//
// SourcePage (React) から純粋ロジックだけ分離して vitest で決定論的にテストできるようにする。
// moodboard-positions.py が assets/generated/sakura-*mask*.png から緑 bbox を抽出して
// MaskBbox[] を返し、ここで catalog の variant と紐付ける。
import type { ObjectVariant } from "../scene/objects-catalog.js";

export interface MaskBbox {
  file: string;
  stem: string;
  canvasW: number;
  canvasH: number;
  bbox: { x: number; y: number; w: number; h: number };
  mtime: number;
}

// variant.src "assets/objects/sakura-bookshelf-front.png" → "sakura-bookshelf-front"
export function stemFromVariantSrc(src: string): string {
  return src.replace(/^assets\/objects\//, "").replace(/\.png$/, "");
}

// 視点 suffix (catalog の variant src で使われる) を剥がすと「家具本体の stem」が出る。
// "sakura-bookshelf-dimetric" → "sakura-bookshelf"
// "sakura-bed-pink-single-leftwall" → "sakura-bed-pink-single"
const VIEW_SUFFIXES = ["front-dimetric", "dimetric", "leftwall", "rightwall", "front"];

export function stemCandidates(src: string): string[] {
  const base = stemFromVariantSrc(src);
  const out = [base];
  for (const suf of VIEW_SUFFIXES) {
    if (base.endsWith(`-${suf}`)) {
      out.push(base.slice(0, -(suf.length + 1)));
      break;
    }
  }
  return out;
}

// 緩い stem マッチ: 完全一致 or "-" 境界で片方が他方のプレフィックスなら OK。
// 「sakura-sofa-green」(mask) ⊂ 「sakura-sofa-green-floor」(catalog) は OK。
// 「sakura-bed-altlayout」(mask) と「sakura-bed-pink-single」(catalog) は NG (互いに prefix でない)。
export function stemMatches(maskStem: string, candidate: string): boolean {
  if (maskStem === candidate) return true;
  if (maskStem.startsWith(candidate + "-")) return true;
  if (candidate.startsWith(maskStem + "-")) return true;
  return false;
}

// マスク stem が view 専用 (命名規約 <…>-front / -leftwall 等で終わる) か。
// view 専用マスクは exact-first でしか当てない (緩いマッチからは除外する) ことで、
// 例えば「sakura-bed-pink-single-front」(r5 front) がベッドの side/dimetric (別 source) に
// prefix で誤マッチして別 view を別位置に飛ばすのを防ぐ。
export function isViewSpecificMaskStem(stem: string): boolean {
  return VIEW_SUFFIXES.some((suf) => stem.endsWith(`-${suf}`));
}

// variant に対応する mask bbox を返す。
//
// 【重要】matching は本来「家具名」だけで探すと source 盲目になる: 同じ家具を複数 moodboard から
// 抽出すると (front=altlayout-r5 / front-dimetric=r2 等)、どのマスクを使うか緩いマッチでは区別できず
// 別 source のマスクを誤って拾う。これを防ぐため 2 段構え:
//
//   1) 完全一致を最優先: マスク stem === variant src の full stem (view 込み)。
//      命名規約「<variant-src-stem>-mask-<date>.png」(例 sakura-sofa-green-floor-front-mask-...) に
//      従ったマスクはここで一意に当たる。view 込みなので source も自動で一意 (1 view = 1 source = 1 mask)。
//      → 今後の抽出はマスクを variant src 名で作るだけで自動配置される。
//   2) フォールバック: 命名規約前の旧マスク用に、従来の緩い stem マッチ。
export function findBboxForVariant(
  variant: ObjectVariant,
  expectCanvasW: number,
  expectCanvasH: number,
  bySource: MaskBbox[],
): MaskBbox | null {
  const candidates = bySource.filter((m) => m.canvasW === expectCanvasW && m.canvasH === expectCanvasH);
  // 1) 完全一致 (命名規約に従ったマスク)。source 込みで一意。
  const fullStem = stemFromVariantSrc(variant.src);
  const exact = candidates.find((m) => m.stem === fullStem);
  if (exact) return exact;
  // 2) フォールバック (旧マスク)。view 専用マスクは exact でしか当てない (別 view への誤マッチ防止)。
  const loose = candidates.filter((m) => !isViewSpecificMaskStem(m.stem));
  for (const stem of stemCandidates(variant.src)) {
    const hit = loose.find((m) => stemMatches(m.stem, stem));
    if (hit) return hit;
  }
  return null;
}
