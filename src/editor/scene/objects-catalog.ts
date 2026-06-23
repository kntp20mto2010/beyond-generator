import { GRID } from "./grid.js";
import type { PlacementRule } from "./room-regions/types.js";

// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// グリッド footprint + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
//
// 各家具は最大 **3 視点(views: front / front-dimetric / side)** を持てる。
//   - front          : 真正面 elevation(orthographic, no perspective, no top visible)
//   - front-dimetric : dimetric 2:1 + sitting eye-level(L1b、AC 風配置)
//   - side           : 壁這う(v10 wall-aligned)。元 PNG の向き(左壁正本 / 右壁正本)は
//                      variant.wallOrigin で宣言し、配置先の壁と異なれば render 時に自動 flipX。
// 配置時の view 選択で見た目を切り替える(どうぶつの森方式)。
//
// サイズはグリッドの n×m セルで定義し(全体の統一感のため)、scale は
// 「幅 = cells.w セル」になるよう nativeW から導出する(objectScale)。
// オブジェクトのサイズ密度: 画像の約 PX_PER_CELL px が 1 グリッドセルに収まるよう
// リサイズする(例 900×1200px → 3×4セル)。footprint セルは native/PX_PER_CELL を
// 繰り上げ(ceil)。端数が出る画像はセルに収まるよう必ず1セル大きい箱にする。
export const PX_PER_CELL = 300;

export function cellsFromNative(nativeW: number, nativeH: number): { w: number; h: number } {
  return {
    w: Math.max(1, Math.ceil(nativeW / PX_PER_CELL)),
    h: Math.max(1, Math.ceil(nativeH / PX_PER_CELL)),
  };
}

// 視点ごとの投影設定(カメラ・軸傾き・projection type)。ObjectPage カードに表示する。
export interface ProjectionInfo {
  type: string;                       // "dimetric 2:1" / "weak high-angle" / "wall-aligned v10" etc.
  eyeLevelCm?: number | "sitting";    // カメラ目線の高さ(cm)、"sitting" = 着席アイレベル
  rotationDeg?: number;               // yaw(横回転)
  cameraTiltDeg?: number;             // pitch(俯仰)、+ = 見下ろし
  lateralAxisTiltDeg?: number;        // dimetric の幅軸 (lateral axis) 傾き
  depthAxisTiltDeg?: number;          // dimetric の奥行軸 (depth axis) 傾き
  ratioWDH?: string;                  // 例 "2:1:vertical" (W:D:H)
}

export const PROJECTION_PRESETS = {
  "weak-high-angle-eye120": {
    type: "weak high-angle",
    eyeLevelCm: 120,
    rotationDeg: 0,
    cameraTiltDeg: 12,
    lateralAxisTiltDeg: 0,
    depthAxisTiltDeg: 0,
    ratioWDH: "front-only (no depth)",
  },
  "dimetric-2to1-sitting": {
    type: "dimetric 2:1",
    eyeLevelCm: "sitting",
    rotationDeg: 0,
    lateralAxisTiltDeg: 12,
    depthAxisTiltDeg: 20,
    ratioWDH: "2:1 (lateral:depth)",
  },
  "wall-aligned-v10": {
    type: "weak perspective (wall-aligned)",
    eyeLevelCm: 160,
    rotationDeg: -65,
    cameraTiltDeg: 30,
    lateralAxisTiltDeg: 10,
    ratioWDH: "—",
  },
} as const satisfies Record<string, ProjectionInfo>;

export type ProjectionPresetKey = keyof typeof PROJECTION_PRESETS;

// 単一視点の画像定義。
export interface ObjectVariant {
  src: string;
  nativeW: number;
  nativeH: number;
  cells?: { w: number; h: number };
  seat?: { dx: number; dy: number };
  shadowSrc?: string;
  projection?: ProjectionPresetKey;   // 投影プリセット参照
  promptFile?: string;                // assets/objects/prompts/<promptFile>.md
  // この variant が抽出された moodboard 画像のパス。def.source の上書き。
  // 同じ家具でも視点ごとに異なる moodboard 画像から取った場合に明示する。
  // 未設定なら def.source にフォールバック。SourcePage のテーブルで「何番目の画像から取ったか」表示に使う。
  source?: string;
  // この view が「部屋 moodboard からの抽出」ではなく「単体プロンプトでゼロ生成」された印。
  // dimetric(sitting-2to1)/side(v10) など、部屋 render が見せない投影は個別生成に頼った。
  // SourcePage の早見表で ⚠️ 表示し、抽出(card 番号)と区別する。
  generatedStandalone?: boolean;
  // side / front-dimetric の元 PNG が「どちらの壁ぎわ」を向いて描かれているかを宣言する。
  // 配置先の壁と異なる場合、scene 描画時に自動 flipX。未指定なら "left" 扱い (既存 PNG は
  // 全て leftwall.png ファイル名で左壁正本のため)。"right" を入れると右壁正本扱いになり、
  // 左壁配置時に自動反転する。front / wall 系 view にも将来同じ仕組みを拡張可能。
  wallOrigin?: "left" | "right";
}

export type ObjectViewName = "front" | "front-dimetric" | "side";

export const VIEW_LABEL: Record<ObjectViewName, string> = {
  front: "正面",
  "front-dimetric": "立体",
  side: "壁付",
};

// side variant を配置壁に合わせるための flipX を返す。
// variant.wallOrigin が targetWall と一致しなければ反転。未指定は "left" 既定。
export function resolveSideFlipX(variant: ObjectVariant, targetWall: "left" | "right"): boolean {
  const origin = variant.wallOrigin ?? "left";
  return origin !== targetWall;
}

// 家具のカテゴリ(種類)。AddPanel / ObjectPage のフィルタチップで使う。
export type ObjectKind =
  | "sofa" | "chair" | "desk" | "bed"
  | "storage" | "vanity" | "table" | "stool" | "plant"
  | "window" | "rug" | "wall-decor" | "lamp";

export const KIND_LABEL: Record<ObjectKind, string> = {
  sofa: "ソファ",
  chair: "椅子",
  desk: "机",
  bed: "ベッド",
  storage: "収納",
  vanity: "ドレッサー",
  table: "テーブル",
  stool: "スツール",
  plant: "植物",
  window: "窓",
  rug: "ラグ",
  "wall-decor": "壁飾り",
  lamp: "照明",
};

// 配置方法。Scene 上の Z 並びやスナップ規則を将来分けるためにも使う。
// - floor     : 床置き家具 (3 視点)
// - wall      : 奥/左/右どの壁にも貼れる平面壁デコ (額絵・時計・スワッグ・棚 etc、正面のみ)
// - back-wall : 奥壁ぴったり専用 (窓+カーテンなど構造的に奥壁固定のもの、正面のみ)
// - side-wall : 左右壁専用 (将来用、正面のみ)
// - ceiling   : 天井 = 壁の最上段 row 0 のみ (フェアリーライト・ペナント、正面のみ)
// - ground    : 床に敷く (ラグ、正面のみ)
export type ObjectPlacement = "floor" | "wall" | "back-wall" | "side-wall" | "ceiling" | "ground";

export const PLACEMENT_LABEL: Record<ObjectPlacement, string> = {
  floor: "床置き",
  wall: "壁掛け",
  "back-wall": "奥壁",
  "side-wall": "左右壁",
  ceiling: "天井",
  ground: "床敷き",
};

// 配置ごとに使う角度 (view) の許可リスト。
// - floor                       : 全 3 角度(AC 風配置で正面/斜め/壁付け全部使う)
// - wall                        : 正面 (奥壁用、完全フラット) + 壁付 (左右壁用、壁面に対して斜め視点)
// - back-wall/side-wall/ceiling: 正面のみ(壁/天井にぴったり貼る平面画。窓は奥壁固定、天井は横方向)
// - ground                      : 正面のみ(ラグは正面 or 上面のみ、立体だと模様が歪む)
// テストでカタログ整合性を保証する(grid-object.test.ts)。
export const ALLOWED_ANGLES_BY_PLACEMENT: Record<ObjectPlacement, readonly ObjectViewName[]> = {
  floor: ["front", "front-dimetric", "side"],
  wall: ["front", "side"],
  "back-wall": ["front"],
  "side-wall": ["front"],
  ceiling: ["front"],
  ground: ["front"],
};

// 配置種別ごとのデフォルト PlacementRule。
// per-def の placementRule が指定されていれば、そちらを優先する (effectivePlacementRule)。
// - floor     : 床セル F のみ。判定は中央 anchor col (中央 1〜2 cell) の最下行 (centerAnchorBottom)。
//               anchor SOME (片方食い込みOK)・anchor 全てがマップ内まで = 奥/横壁ぎわ + 画面端まで詰められる。
// - wall      : 壁全種 (L/B/R) どこでも貼れる平面壁デコ。マージン無し (端寄せ可)。
// - back-wall : 奥壁 B のみ。マージン無し (端寄せ可)。窓など中央寄せが必要なものは per-def で追加。
// - side-wall : 左壁 L / 右壁 R のみ。
// - ceiling   : 壁全種 (L/B/R) のうち row 0 のみ = 部屋の最上段。
//               判定は中央 anchor col の **最上行** (centerAnchorTop)。床家具と上下対称。
//               anchor SOME (片方食い込みOK)・anchor 全てマップ内まで = 横は画面端まで寄せられる。
// - ground    : 床セル F のみ (ラグ)。
export const DEFAULT_PLACEMENT_RULES: Record<ObjectPlacement, PlacementRule> = {
  floor: { regions: ["F"], regionsApplyTo: "centerAnchorBottom" },
  wall: { regions: ["L", "B", "R"] },
  "back-wall": { regions: ["B"] },
  "side-wall": { regions: ["L", "R"] },
  ceiling: { regions: ["L", "B", "R"], regionsApplyTo: "centerAnchorTop", rowMin: 0, rowMax: 0 },
  ground: { regions: ["F"] },
};

// def の効力ある PlacementRule。
// 縛りがあるのは「床家具 (floor)」「天井家具 (ceiling)」「per-def placementRule 指定 (= 窓)」だけ。
// 壁デコ・地面など他の placement は自由配置 (DEFAULT は持つが適用しない方針)。
// - 床家具: 中央 anchor の最下行 (centerAnchorBottom) = 床接地行。
// - 天井家具: 中央 anchor の最上行 (centerAnchorTop) = 天井接触行 + rowMin=rowMax=0 で最上段限定。
// - 窓:     per-def の placementRule で 奥壁 B + 上下 1 マス margin。
export function effectivePlacementRule(def: ObjectDef): PlacementRule | undefined {
  if (def.placementRule) return def.placementRule;
  if (def.placement === "floor" || def.placement === "ceiling") {
    return DEFAULT_PLACEMENT_RULES[def.placement];
  }
  return undefined;
}

// 緑マスク pipeline で個別家具を切り出した「抽出元」moodboard (部屋全体絵)。
// この出自を持つ家具は ObjectDef.source に設定する。ObjectPage の「抽出元」フィルタで使う。
export const SAKURA_ROOM_L1 =
  "assets/generated/sakura-room-L1-20260620.png";
// 同じサクラルームを別レイアウト/別角度で再生成した 2 枚目 (足元 3/4 視点等の角度補強用)。
// 一部の variant (ベッド dimetric, 学習デスク front 等) はこちらから抽出した。
export const SAKURA_ROOM_L2 =
  "assets/generated/sakura-room-L2-20260621.png";
// 3 枚目 (r5): ワードローブ/本棚/学習机を画面から省略し、ベッド・ソファ・デスクチェア・
// ドレッサー+プフ の 4 家具だけを head-on で配置した正面 view 抽出用 moodboard。
// 部屋の枠 = sakura-room-empty.png と pixel 一致、家具デザインと窓+壁飾り = L2 から踏襲、天井装飾なし。
// OCCLUDERS: 全 4 家具とも none (ソファ前のコーヒーテーブルは離れているため遮蔽なし)。
export const SAKURA_ROOM_L3 =
  "assets/generated/sakura-room-L3-20260622.png";
// 4 枚目 (r6): ソファを左壁ぎわ wall-aligned 3/4 + デスクを正面 elevation で配置した混成 view。
// "sofa-side-desk-front" 名のとおり desk の真正面 (front) と sofa の左壁 side 抽出用。
// 壁飾り (clock/swag) も左壁に dimetric 角度で写っているため wall-decor side 抽出にも使う。
// OCCLUDERS: desk は遮蔽なし、sofa は床植物が右下手前で部分遮蔽。
export const SAKURA_ROOM_L4 =
  "assets/generated/sakura-room-L4-20260623.png";

// === navy-room (20 代男性の部屋) ===
// sakura-room-empty を recolor した空室 (壁=無地ネイビー / 床=グレーウッド、ジオメトリ同一)。
export const NAVY_ROOM_EMPTY =
  "assets/backgrounds/navy-room-empty.png";
// 理想レイアウト moodboard r3。本家 ken-style-r2 レシピを踏襲してフラット作風で生成 (r1/r2 は 3D 化して破棄)。
// navy 部屋の家具抽出元。docs/spec/10「部屋・家具 moodboard 生成レシピ」参照。
export const NAVY_ROOM_L1 =
  "assets/generated/navy-room-L1-20260623.png";
// navy-room 角度補強用 別レイアウト (均等配分3枚)。同じ navy 部屋を信じられる配置で再生成し、
// 奥壁ぎわ=front / 左右壁ぎわ=side / 中央 free-standing=dimetric の自然な角度の寄せ集めで
// 取りこぼし 21 角度を 7/7/7 で均等に埋める。docs/spec/10「部屋・家具 moodboard 生成レシピ」参照。
export const NAVY_ROOM_L2 =
  "assets/generated/navy-room-L2-20260623.png";
export const NAVY_ROOM_L3 =
  "assets/generated/navy-room-L3-20260623.png";
export const NAVY_ROOM_L4 =
  "assets/generated/navy-room-L4-20260623.png";

// 家具カタログのエントリ。少なくとも一つの view を持つ。
export interface ObjectDef {
  id: string;
  label: string;
  defaultView: ObjectViewName;
  views: Partial<Record<ObjectViewName, ObjectVariant>>;
  kind?: ObjectKind;
  placement?: ObjectPlacement;
  placementRule?: PlacementRule;
  // 抽出元 moodboard のパス(リポジトリ相対)。緑マスクで部屋全体絵から切り出した家具に設定。
  // 未設定 = ゼロから(プロンプト)生成。ObjectPage の「抽出元 あり/なし」フィルタで使う。
  source?: string;
  // この家具が想定する人物像のタグ群 (年代・性別・属性など)。
  // 単一所有者ではなく「この家具がフィットしそうな人物属性」を列挙する。
  // - "shared" = moodboard 横断で使える汎用家具 (観葉植物・本・カップ等)
  // - "teen" / "child" / "adult" / "senior" 等 = 年代
  // - "female" / "male" / "neutral" 等 = 性別
  // - "student" / "office" / "kawaii" / "japanese" 等 = 属性・テイスト
  // 例: ピンクのシングルベッド = ["teen", "female", "kawaii"]
  //     観葉植物 (大型) = ["shared"]
  //     学習机 = ["student", "child", "teen"]
  persona?: string[];
}

export const OBJECT_CATALOG: ObjectDef[] = [
  // === 既存の汎用家具(side 未生成) ===
  {
    id: "sofa-navy",
    label: "ソファ",
    defaultView: "front-dimetric",
    persona: ["shared", "adult"],
    kind: "sofa",
    placement: "floor",
    views: {
      front: {
        src: "assets/objects/sofa-navy-front.png",
        nativeW: 828,
        nativeH: 508,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -289 },
        projection: "weak-high-angle-eye120",
        promptFile: "sofa-navy-front-eye120-v2-rattan-20260619",
      },
      "front-dimetric": {
        src: "assets/objects/sofa-navy-dimetric.png",
        nativeW: 1010,
        nativeH: 789,
        cells: { w: 4, h: 3 },
        seat: { dx: 0, dy: -506 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sofa-navy-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/sofa-navy-leftwall.png",
        nativeW: 672,
        nativeH: 762,
        cells: { w: 4, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sofa-navy-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "school-chair",
    label: "学校椅子",
    defaultView: "front-dimetric",
    persona: ["school", "student"],
    kind: "chair",
    placement: "floor",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-chair-front-dimetric.png",
        nativeW: 548,
        nativeH: 865,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -525 },
        projection: "dimetric-2to1-sitting",
        promptFile: "school-chair-sitting-2to1-l1b-v2-20260619",
      },
      side: {
        src: "assets/objects/school-chair-leftwall.png",
        nativeW: 550,
        nativeH: 862,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "school-chair-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "school-desk-front",
    label: "学校机(対面)",
    defaultView: "front-dimetric",
    persona: ["school", "student"],
    kind: "desk",
    placement: "floor",
    views: {
      "front-dimetric": {
        src: "assets/objects/school-desk-front-dimetric.png",
        nativeW: 889,
        nativeH: 772,
        cells: { w: 3, h: 3 },
        projection: "dimetric-2to1-sitting",
        promptFile: "school-desk-front-sitting-2to1-l1b-v1-20260619",
      },
      side: {
        src: "assets/objects/school-desk-front-leftwall.png",
        nativeW: 895,
        nativeH: 752,
        cells: { w: 3, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "school-desk-front-leftwall-v10-l1b-20260619",
        wallOrigin: "left",
      },
    },
  },

  // === サクラ部屋家具(front + side) ===
  {
    id: "sakura-bed-pink-single",
    label: "ベッド(ピンク シングル)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "bed",
    placement: "floor",
    views: {
      // front: L3 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出 (長辺 head-on)。
      //   OCCLUDERS: none のため cleanup ではなく edgepolish フロー (輪郭外周のみ整形) を採用。
      //   ベッドは Codex の stock-photo prior が強く、参照を view_image でロードさせず generate に
      //   逃げると別物 (青ブランケット等) を生成する。対策として edgepolish プロンプト冒頭で
      //   「view_image で参照ロード → edit モード → generate 禁止 → ロード失敗なら fail」を強制 (r5 で成功)。
      //   read-only sandbox の書き出しは flaky で数回 GENERATION_FAILED するが id を変えて再試行で当たる。
      front: {
        src: "assets/objects/sakura-bed-pink-single-front.png",
        nativeW: 553,
        nativeH: 455,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L3,
      },
      // front-dimetric: L2 部屋から緑マスク → apply-green-mask → prep-fillin-canvas →
      //   crop-mask-with-roomctx + Codex cleanup (2 参照, OCCLUDERS: none) → strip-fake-transparency。
      //   旧版 (moodboard r2 dimetric 1253x644 側面 3/4 view) を foot-forward 3/4 view で置き換え。
      "front-dimetric": {
        src: "assets/objects/sakura-bed-pink-single-dimetric.png",
        nativeW: 546,
        nativeH: 564,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L2,
      },
      // side: moodboard r2 部屋全体保持 → ベッド以外透明化 → crop-alpha-bbox.py で grayscale chromakey + bbox crop
      side: {
        src: "assets/objects/sakura-bed-pink-single-leftwall.png",
        shadowSrc: "assets/objects/sakura-bed-pink-single-leftwall.shadow.png",
        nativeW: 765,
        nativeH: 604,
        cells: { w: 3, h: 3 },
        seat: { dx: 0, dy: -391 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-bed-pink-single-room-anchored-r7-20260620",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-sofa-green-floor",
    label: "ソファ(緑フロア)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "sofa",
    placement: "floor",
    views: {
      // front: L3 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出。
      //   緑マスク → apply-green-mask (padding 0.1) → prep-fillin (margin 0.08) →
      //   crop-mask-with-roomctx (margin 0.30) → Codex cleanup-minimal (OCCLUDERS: none)
      //   → strip-fake-transparency (tight-crop, pad 12)。
      //   silhouette が完全に見えていたため補完不要、ほぼ input pixel そのまま出た。
      front: {
        src: "assets/objects/sakura-sofa-green-floor-front.png",
        nativeW: 594,
        nativeH: 303,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L3,
      },
      // front-dimetric: moodboard r2 中央 sage green クラウドソファ
      // pipeline: 緑マスク r1 → apply-green-mask (padding 0.1) →
      //   Codex cleanup (虫食い補完 prompt 厳格版 r5b)
      "front-dimetric": {
        src: "assets/objects/sakura-sofa-green-floor-dimetric.png",
        shadowSrc: "assets/objects/sakura-sofa-green-floor-dimetric.shadow.png",
        nativeW: 508,
        nativeH: 393,
        cells: { w: 2, h: 2 },
        seat: { dx: 0, dy: -260 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-sofa-fillin-bugbites-r5b-20260621",
      },
      // side: moodboard r1 (L2) 右壁ぎわ wall-aligned 3/4 view。
      //   緑マスク r2 (r1 で hallucination 発生→反例明示で再生成) → apply-green-mask
      //   (bbox 458x427) → prep-fillin (444x407) → crop-with-roomctx (612x561) →
      //   Codex cleanup (occluder: 植物/プフ/ラグ で右下・前面下端・脚元欠け、本体色補完) →
      //   strip (tight-crop, pad 12)。wallOrigin "right" 初登録。
      side: {
        src: "assets/objects/sakura-sofa-green-floor-rightwall.png",
        nativeW: 363,
        nativeH: 364,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L2,
        wallOrigin: "right",
        promptFile: "sakura-sofa-green-floor-rightwall-cleanup-20260623",
      },
    },
  },
  {
    id: "sakura-window-curtain",
    label: "窓+カーテン",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["shared"],
    kind: "window",
    placement: "back-wall",
    // 窓は端寄せ厳禁(壁の天井/床境界に貼らないため上下 1 cell マージン)。
    // 額絵などは default rule (margin 無し) に従って端寄せ自由。
    placementRule: { regions: ["B"], marginTop: 1, marginBottom: 1 },
    views: {
      // front: moodboard r2 奥壁中央の窓+カーテン → 緑マスク r1c → apply-green-mask
      //   (padding 0.1) → 補完 cleanup r2 (下端の植物/ランプ/机断片を除去)
      front: {
        src: "assets/objects/sakura-window-curtain.png",
        nativeW: 540,
        nativeH: 419,
        cells: { w: 2, h: 2 },
        promptFile: "sakura-window-curtain-complete-r2-20260621",
        // QC overlay 用 secondary source: r1 にも視覚的に整合する (head-on layout の奥壁中央)。
        // 対応 mask: sakura-window-curtain-on-r1-mask-20260623.png
      },
    },
  },
  {
    id: "sakura-study-desk",
    label: "学習デスク",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["student", "child", "teen"],
    kind: "desk",
    placement: "floor",
    views: {
      // front: L4 (sofa-side-desk-front) から緑マスク抽出した真正面 elevation。
      //   r6 はデスクを正面 view に置く目的の専用 moodboard。OCCLUDERS: 天板上に小物
      //   (ランプ/ペン立て/本) があったため cleanup で天板木目色で除去。
      front: {
        src: "assets/objects/sakura-study-desk-front.png",
        nativeW: 578,
        nativeH: 249,
        cells: { w: 2, h: 1 },
        source: SAKURA_ROOM_L4,
        promptFile: "sakura-study-desk-front-r6-cleanup-20260623",
      },
      "front-dimetric": {
        src: "assets/objects/sakura-study-desk-dimetric.png",
        nativeW: 1041,
        nativeH: 836,
        cells: { w: 4, h: 3 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-study-desk-sitting-2to1-l1b-v1-20260619",
        generatedStandalone: true,
      },
      // side (壁付): L2 部屋から抽出した壁付寄り 3/4 view (正面寄りに壁付した見え方)。
      //   元は front slot に誤登録されていた (実際は壁に寄せた時の見え方 = 壁付) ため KEN 指示で
      //   side に移動し、ファイルも -front → -frontwall にリネーム。
      //   旧 leftwall v10 side (sakura-study-desk-leftwall.png、急角度で潰れ気味) を置換、
      //   旧ファイルは disk に残置。
      side: {
        src: "assets/objects/sakura-study-desk-frontwall.png",
        nativeW: 454,
        nativeH: 450,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L2,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-desk-chair-pink",
    label: "デスクチェア(ピンク)",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "chair",
    placement: "floor",
    views: {
      // front: L3 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出。
      //   緑マスク自体も view_image→edit 強制で生成 (r1 は room を描き直してチェアがベッド位置に
      //   ズレ → r2 で room 保持・正位置に修正)。OCCLUDERS: bed behind chair だがチェア本体は完全可視。
      //   edgepolish (view_image 強制) で輪郭整形、内部 RGB 保持。head-on 縦長なので footprint 1x2。
      front: {
        src: "assets/objects/sakura-desk-chair-pink-front.png",
        nativeW: 128,
        nativeH: 223,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_L3,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-desk-chair-pink-dimetric.png",
        nativeW: 550,
        nativeH: 907,
        cells: { w: 2, h: 3 },
        seat: { dx: 0, dy: -539 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-desk-chair-pink-sitting-2to1-l1b-v1-20260619",
        generatedStandalone: true,
      },
      side: {
        src: "assets/objects/sakura-desk-chair-pink-leftwall.png",
        nativeW: 973,
        nativeH: 815,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-desk-chair-pink-leftwall-v10-l1b-20260619",
        generatedStandalone: true,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-wardrobe",
    label: "ワードローブ",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: L2 部屋から緑マスク → apply-green-mask → step4 r5b 厳格版補完 → strip
      front: {
        src: "assets/objects/sakura-wardrobe-front.png",
        nativeW: 281,
        nativeH: 479,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_L2,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-wardrobe-dimetric.png",
        nativeW: 553,
        nativeH: 835,
        cells: { w: 3, h: 5 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-wardrobe-sitting-2to1-l1b-v1-20260619",
        generatedStandalone: true,
      },
      // side: moodboard r2 部屋全体保持 → ワードローブ位置 緑マスク (r8, 緑のみ tight) →
      //   PIL apply-green-mask.py で moodboard 原画から切り抜き → 「補完」表現で
      //   Codex cleanup (complete r9) で隣の本棚断片除去
      side: {
        src: "assets/objects/sakura-wardrobe-leftwall.png",
        shadowSrc: "assets/objects/sakura-wardrobe-leftwall.shadow.png",
        nativeW: 410,
        nativeH: 732,
        cells: { w: 2, h: 3 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-wardrobe-complete-r9-20260621",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-bookshelf",
    label: "本棚",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: L2 部屋から緑マスク → apply-green-mask → step4 r7 (単独依頼で
      //   パース維持指示あり, KEN 肯定評価) → strip-fake-transparency。フロー2 (KEN 評価済み版を凍結) 採用。
      front: {
        src: "assets/objects/sakura-bookshelf-front.png",
        nativeW: 233,
        nativeH: 395,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_L2,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-bookshelf-dimetric.png",
        nativeW: 424,
        nativeH: 872,
        cells: { w: 2, h: 4 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-bookshelf-sitting-2to1-l1b-v1-20260619",
        generatedStandalone: true,
      },
      // side: moodboard r2 部屋全体保持 → 本棚位置を緑マスクで Codex 依頼 (r7) →
      //   PIL (apply-green-mask.py) で moodboard 原画から緑領域を切り抜き (from-mask r7) →
      //   蔦・周辺装飾の余計 pixel を Codex cleanup 依頼 (cleanup r8) で除去
      side: {
        src: "assets/objects/sakura-bookshelf-leftwall.png",
        shadowSrc: "assets/objects/sakura-bookshelf-leftwall.shadow.png",
        nativeW: 256,
        nativeH: 520,
        cells: { w: 1, h: 2 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-bookshelf-cleanup-r8-20260621",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-vanity-dresser-with-pouf",
    label: "ドレッサー+鏡+プフ",
    defaultView: "front-dimetric",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "vanity",
    placement: "floor",
    views: {
      // front: L3 head-on 部屋 (4 家具集中版) から緑マスク pipeline で抽出。
      //   OCCLUDERS: none のため cleanup ではなく edgepolish フロー (Codex template framing +
      //   5 step + diff metric で輪郭外周のみ anti-alias、内部 RGB は bit-perfect 保持) を採用。
      //   天板の鉢植えは Codex が「本体ではない」と判断して落とし、ドレッサー本体のみのクリーン版。
      front: {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-front.png",
        nativeW: 283,
        nativeH: 321,
        cells: { w: 2, h: 2 },
        source: SAKURA_ROOM_L3,
      },
      "front-dimetric": {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-dimetric.png",
        nativeW: 1092,
        nativeH: 901,
        cells: { w: 4, h: 4 },
        seat: { dx: 354, dy: -339 },
        projection: "dimetric-2to1-sitting",
        promptFile: "sakura-vanity-dresser-with-pouf-sitting-2to1-l1b-v1-20260619",
        generatedStandalone: true,
      },
      side: {
        src: "assets/objects/sakura-vanity-dresser-with-pouf-leftwall.png",
        nativeW: 652,
        nativeH: 907,
        cells: { w: 4, h: 4 },
        projection: "wall-aligned-v10",
        promptFile: "sakura-vanity-dresser-with-pouf-leftwall-v10-l1b-20260619",
        generatedStandalone: true,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "sakura-rug-floral",
    label: "ラグ(花柄)",
    defaultView: "front",
    persona: ["teen", "female", "kawaii"],
    kind: "rug",
    placement: "ground",
    views: {
      front: {
        src: "assets/objects/sakura-rug-floral.png",
        nativeW: 1401,
        nativeH: 545,
        cells: { w: 5, h: 3 },
      },
    },
  },
  {
    id: "sakura-plant-floor-large",
    label: "観葉植物(床置き)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "plant",
    placement: "floor",
    views: {
      // front: r2 部屋から緑マスク (view_image→edit 強制、r1 は別部屋を再生成したため破棄、
      //   r2 で本物の r2 を編集 = 目視確認済) → apply-green-mask → strip。
      //   OCCLUDERS: none・虫食いなしのクリーンな鉢植えだったため cleanup 不要。
      front: {
        src: "assets/objects/sakura-plant-floor-large-front.png",
        nativeW: 114,
        nativeH: 232,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L1,
      },
      // front-dimetric: L3 から緑マスク抽出。OCCLUDERS: none (右端で独立)。
      "front-dimetric": {
        src: "assets/objects/sakura-plant-floor-large-dimetric.png",
        nativeW: 232,
        nativeH: 350,
        cells: { w: 1, h: 2 },
        source: SAKURA_ROOM_L3,
        promptFile: "sakura-plant-floor-large-dimetric-r5-cleanup-20260623",
      },
      // side: 個別 Codex 生成 (wall-aligned-v10 yaw -65°)。wallOrigin: "left"。
      side: {
        src: "assets/objects/sakura-plant-floor-large-leftwall.png",
        nativeW: 601,
        nativeH: 971,
        cells: { w: 3, h: 4 },
        projection: "wall-aligned-v10",
        wallOrigin: "left",
        promptFile: "sakura-plant-floor-large-leftwall-v10-l1b-20260623",
        generatedStandalone: true,
      },
    },
  },
  {
    id: "sakura-pouf-pink",
    label: "プーフ(丸スツール・ピンク)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "stool",
    placement: "floor",
    views: {
      // front: r2 部屋から緑マスク (view_image→edit 強制) → apply-green-mask → strip。
      //   OCCLUDERS: none・虫食いなしのクリーンな丸スツールだったため cleanup 不要。
      front: {
        src: "assets/objects/sakura-pouf-pink-front.png",
        nativeW: 239,
        nativeH: 154,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L1,
      },
      // front-dimetric: L3 から緑マスク抽出 (ドレッサー手前)。
      //   初回 r1 で別部屋 hallucination → r2 で反例強化版投入し r5 layout 保持で成功。
      "front-dimetric": {
        src: "assets/objects/sakura-pouf-pink-dimetric.png",
        nativeW: 155,
        nativeH: 118,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L3,
        promptFile: "sakura-pouf-pink-dimetric-r5-cleanup-20260623",
      },
      // side: 個別 Codex 生成 (wall-aligned-v10 yaw -65°)。wallOrigin: "left"。
      side: {
        src: "assets/objects/sakura-pouf-pink-leftwall.png",
        nativeW: 440,
        nativeH: 414,
        cells: { w: 2, h: 2 },
        projection: "wall-aligned-v10",
        wallOrigin: "left",
        promptFile: "sakura-pouf-pink-leftwall-v10-l1b-20260623",
        generatedStandalone: true,
      },
    },
  },
  {
    id: "sakura-coffee-table",
    label: "コーヒーテーブル(円形ロー)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "table",
    placement: "floor",
    views: {
      // front: r2 部屋から緑マスク (sakura-table-mask-tight-r1) → apply-green-mask →
      //   prep-fillin → roomctx-crop → Codex cleanup (view_image 強制、天板上の小物の虫食いを
      //   木色で埋めて空の天板に) → strip-fake-transparency。
      front: {
        src: "assets/objects/sakura-coffee-table-front.png",
        nativeW: 303,
        nativeH: 171,
        cells: { w: 2, h: 1 },
        source: SAKURA_ROOM_L1,
      },
      // front-dimetric: L3 から緑マスク抽出。OCCLUDERS: 天板上に植物 + 本 →
      //   cleanup で天板木目色で補完。
      "front-dimetric": {
        src: "assets/objects/sakura-coffee-table-dimetric.png",
        nativeW: 322,
        nativeH: 187,
        cells: { w: 2, h: 1 },
        source: SAKURA_ROOM_L3,
        promptFile: "sakura-coffee-table-cream-dimetric-r5-cleanup-20260623",
      },
      // side: 個別 Codex 生成 (wall-aligned-v10 yaw -65°)。wallOrigin: "left"。
      side: {
        src: "assets/objects/sakura-coffee-table-leftwall.png",
        nativeW: 819,
        nativeH: 370,
        cells: { w: 3, h: 2 },
        projection: "wall-aligned-v10",
        wallOrigin: "left",
        promptFile: "sakura-coffee-table-cream-leftwall-v10-l1b-20260623",
        generatedStandalone: true,
      },
    },
  },
  {
    id: "sakura-rug-cloud",
    label: "ラグ(雲)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "rug",
    placement: "ground",
    views: {
      front: {
        src: "assets/objects/sakura-rug-cloud.png",
        nativeW: 1360,
        nativeH: 347,
        cells: { w: 5, h: 2 },
      },
    },
  },

  // === 壁デコ(wall-mounted、視点は1つのみ) ===
  {
    id: "sakura-wall-shelf-plant",
    label: "ウォールシェルフ(植物棚)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      // front: r2 左壁・ベッド上方の木製壁付け棚 + 鉢植え2つ。緑マスク (view_image→edit 強制、
      //   本物の r2 編集を目視確認済) → apply → strip。OCCLUDERS: none・クリーンで cleanup 不要。
      front: {
        src: "assets/objects/sakura-wall-shelf-plant-front.png",
        nativeW: 234,
        nativeH: 185,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L1,
      },
      // side (壁付): r6 左壁から抽出した wall-aligned 3/4 view。棚板+植物3鉢+垂れ葉。
      //   OCCLUDERS: none。pipeline: 緑マスク → apply → prep → roomctx → cleanup (軽処理) → strip。
      side: {
        src: "assets/objects/sakura-wall-shelf-plant-leftwall.png",
        nativeW: 262,
        nativeH: 228,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L4,
        wallOrigin: "left",
        promptFile: "sakura-wall-shelf-plant-side-r6-cleanup-20260623",
      },
    },
  },
  {
    id: "sakura-wall-frame-floral",
    label: "額絵(花柄)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-frame-floral.png",
        nativeW: 441,
        nativeH: 566,
        cells: { w: 2, h: 2 },
      },
      // side: r3 r5 右壁から緑マスク抽出 (3/4 dimetric perspective)。wallOrigin: "right"。
      side: {
        src: "assets/objects/sakura-wall-frame-floral-rightwall.png",
        nativeW: 95,
        nativeH: 177,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L3,
        wallOrigin: "right",
        promptFile: "sakura-wall-frame-floral-side-r5-cleanup-20260623",
      },
    },
  },
  {
    id: "sakura-wall-clock",
    label: "壁掛け時計",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["shared"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-clock.png",
        nativeW: 465,
        nativeH: 477,
        cells: { w: 2, h: 2 },
      },
      // side: r3 r5 左壁から緑マスク抽出 (3/4 dimetric で楕円化)。wallOrigin: "left"。
      side: {
        src: "assets/objects/sakura-wall-clock-leftwall.png",
        nativeW: 103,
        nativeH: 142,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L3,
        wallOrigin: "left",
        promptFile: "sakura-wall-clock-side-r5-cleanup-20260623",
      },
    },
  },
  {
    id: "sakura-wall-dried-bouquet",
    label: "ドライフラワー束",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      front: {
        src: "assets/objects/sakura-wall-dried-bouquet.png",
        nativeW: 342,
        nativeH: 598,
        cells: { w: 2, h: 2 },
      },
      // side: r6 左壁から緑マスク抽出 (wall-aligned 3/4)。wallOrigin: "left"。
      side: {
        src: "assets/objects/sakura-wall-dried-bouquet-leftwall.png",
        nativeW: 126,
        nativeH: 288,
        cells: { w: 1, h: 1 },
        source: SAKURA_ROOM_L4,
        wallOrigin: "left",
        promptFile: "sakura-wall-dried-bouquet-side-r6-cleanup-20260623",
      },
    },
  },
  {
    id: "sakura-wall-pennant",
    label: "ペナント(5旗)",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "ceiling",
    views: {
      front: {
        src: "assets/objects/sakura-wall-pennant.png",
        nativeW: 841,
        nativeH: 293,
        cells: { w: 3, h: 1 },
      },
    },
  },
  {
    id: "sakura-wall-fairy-lights",
    label: "フェアリーライト",
    defaultView: "front",
    source: SAKURA_ROOM_L1,
    persona: ["teen", "female", "kawaii"],
    kind: "wall-decor",
    placement: "ceiling",
    views: {
      front: {
        src: "assets/objects/sakura-wall-fairy-lights.png",
        nativeW: 851,
        nativeH: 242,
        cells: { w: 3, h: 1 },
      },
    },
  },

  // === navy-room (20 代男性の部屋) 家具 ===
  // 理想レイアウト r3 (本家 ken-style レシピのフラット作風) を起点に緑マスク抽出。
  {
    id: "navy-bed",
    label: "ベッド(ネイビー)",
    defaultView: "side",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "bed",
    placement: "floor",
    views: {
      // front: L2 奥壁ぎわ。デスクが手前で下部中央を遮蔽 → Codex cleanup でスカート/木フレーム補完 → strip。
      front: {
        src: "assets/objects/navy-bed-front.png",
        nativeW: 534,
        nativeH: 380,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L2,
        promptFile: "navy-bed-front-cleanup-L2-20260623",
      },
      // side: r3 左壁ぎわ wall-aligned 3/4 view。緑マスク → apply-green-mask → strip。
      //   OCCLUDERS none・クリーンシルエットで cleanup 不要。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-bed-leftwall.png",
        nativeW: 559,
        nativeH: 316,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L1,
        projection: "wall-aligned-v10",
        wallOrigin: "left",
      },
      // front-dimetric: L3 中央 free-standing。OCCLUDERS none。
      "front-dimetric": {
        src: "assets/objects/navy-bed-dimetric.png",
        nativeW: 579,
        nativeH: 424,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L3,
      },
    },
  },
  {
    id: "navy-wardrobe",
    label: "ワードローブ(ネイビー部屋)",
    defaultView: "front-dimetric",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: r4 奥壁ぎわ。OCCLUDERS none・クリーンシルエットで cleanup 不要。
      front: {
        src: "assets/objects/navy-wardrobe-front.png",
        nativeW: 280,
        nativeH: 444,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L2,
      },
      "front-dimetric": {
        src: "assets/objects/navy-wardrobe-dimetric.png",
        nativeW: 269,
        nativeH: 442,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L1,
        // 元抽出はベッド遮蔽で下部が切れていたため Codex 補完で下を完成 (色は medium brown 維持、
        // ただし補完時に引き出し段数等のデザインが若干 redraw された)。
        promptFile: "navy-wardrobe-dimetric-complete-r2-20260623",
      },
      // side: L3 左壁ぎわ wall-aligned。OCCLUDERS none。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-wardrobe-leftwall.png",
        nativeW: 250,
        nativeH: 474,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L3,
        projection: "wall-aligned-v10",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-bookshelf",
    label: "本棚(ネイビー部屋)",
    defaultView: "side",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "storage",
    placement: "floor",
    views: {
      // front: r4 奥壁ぎわ (中身=本/植物/花瓶 内包)。OCCLUDERS none。
      front: {
        src: "assets/objects/navy-bookshelf-front.png",
        nativeW: 253,
        nativeH: 434,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L2,
      },
      // side: r3 右壁ぎわ wall-aligned。OCCLUDERS none。wallOrigin "right"。
      side: {
        src: "assets/objects/navy-bookshelf-rightwall.png",
        nativeW: 238,
        nativeH: 670,
        cells: { w: 1, h: 3 },
        source: NAVY_ROOM_L1,
        projection: "wall-aligned-v10",
        wallOrigin: "right",
      },
      // front-dimetric: L3 中央右 free-standing (中身込み)。OCCLUDERS none。
      "front-dimetric": {
        src: "assets/objects/navy-bookshelf-dimetric.png",
        nativeW: 321,
        nativeH: 405,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L3,
      },
    },
  },
  {
    id: "navy-office-chair",
    label: "オフィスチェア(ネイビー部屋)",
    defaultView: "front-dimetric",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "chair",
    placement: "floor",
    views: {
      // front-dimetric: r3 中央・デスク前。r3 ではデスク向きのため背面寄りの view。
      "front-dimetric": {
        src: "assets/objects/navy-office-chair-dimetric.png",
        nativeW: 144,
        nativeH: 227,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L1,
      },
      // side: L4 右壁ぎわ wall-aligned (側面プロフィール)。OCCLUDERS none。wallOrigin "right"。
      //   緑マスク r1 で 3D 写実オフィス hallucination → r2(反例強化+L4 anchor)で成功。
      side: {
        src: "assets/objects/navy-office-chair-rightwall.png",
        nativeW: 303,
        nativeH: 466,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L4,
        projection: "wall-aligned-v10",
        wallOrigin: "right",
      },
      // front: L3 奥中央・真正面向き。OCCLUDERS none。緑マスクは anti-3D anchor で 3D 化回避。
      front: {
        src: "assets/objects/navy-office-chair-front.png",
        nativeW: 142,
        nativeH: 227,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L3,
      },
    },
  },
  {
    id: "navy-coffee-table",
    label: "ローテーブル(ネイビー部屋)",
    defaultView: "front-dimetric",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "table",
    placement: "floor",
    views: {
      // front: L3 奥壁ぎわ・真正面。OCCLUDERS none。
      front: {
        src: "assets/objects/navy-coffee-table-front.png",
        nativeW: 294,
        nativeH: 108,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L3,
      },
      "front-dimetric": {
        src: "assets/objects/navy-coffee-table-dimetric.png",
        nativeW: 418,
        nativeH: 150,
        cells: { w: 2, h: 1 },
        source: NAVY_ROOM_L1,
      },
      // side: L4 左壁ぎわ wall-aligned。OCCLUDERS none。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-coffee-table-leftwall.png",
        nativeW: 418,
        nativeH: 268,
        cells: { w: 2, h: 1 },
        source: NAVY_ROOM_L4,
        projection: "wall-aligned-v10",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-floor-lamp",
    label: "フロアランプ(ネイビー部屋)",
    defaultView: "side",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "lamp",
    placement: "floor",
    views: {
      // front: L3 奥壁ぎわ・真正面。OCCLUDERS none。
      front: {
        src: "assets/objects/navy-floor-lamp-front.png",
        nativeW: 75,
        nativeH: 297,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L3,
      },
      // front-dimetric: r4 中央 free-standing。OCCLUDERS none。
      "front-dimetric": {
        src: "assets/objects/navy-floor-lamp-dimetric.png",
        nativeW: 158,
        nativeH: 371,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L2,
      },
      side: {
        src: "assets/objects/navy-floor-lamp-rightwall.png",
        nativeW: 134,
        nativeH: 344,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L1,
        projection: "wall-aligned-v10",
        wallOrigin: "right",
      },
    },
  },
  {
    id: "navy-wall-poster",
    label: "壁アート(抽象ポスター)",
    defaultView: "front",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      front: {
        src: "assets/objects/navy-wall-poster.png",
        nativeW: 172,
        nativeH: 192,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L1,
      },
      // side: L4 左壁 (foreshorten した壁付角度)。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-wall-poster-side.png",
        nativeW: 180,
        nativeH: 424,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L4,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-wall-clock",
    label: "壁掛け時計(ネイビー部屋)",
    defaultView: "front",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      front: {
        src: "assets/objects/navy-wall-clock.png",
        nativeW: 114,
        nativeH: 113,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L1,
      },
      // side: L4 左壁 (foreshorten で楕円化)。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-wall-clock-side.png",
        nativeW: 93,
        nativeH: 134,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L4,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-sofa",
    label: "ソファ(ネイビー部屋・2人掛け)",
    defaultView: "front-dimetric",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "sofa",
    placement: "floor",
    views: {
      // front: L4 奥壁ぎわ (クッション込み)。OCCLUDERS none。
      front: {
        src: "assets/objects/navy-sofa-front.png",
        nativeW: 619,
        nativeH: 244,
        cells: { w: 3, h: 1 },
        source: NAVY_ROOM_L4,
      },
      // front-dimetric: r3 中央。ローテーブルが手前で底中央を少し遮蔽 (微小欠けのみ許容)。
      //   緑マスク r1 で 3D 別部屋 hallucination → r2 反例強化で成功。
      "front-dimetric": {
        src: "assets/objects/navy-sofa-dimetric.png",
        nativeW: 616,
        nativeH: 279,
        cells: { w: 3, h: 1 },
        source: NAVY_ROOM_L1,
        promptFile: "navy-sofa-dimetric-mask-r2-20260623",
      },
      // side: r4 左壁ぎわ wall-aligned (クッション込み)。OCCLUDERS none・cleanup 不要。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-sofa-leftwall.png",
        nativeW: 379,
        nativeH: 347,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L2,
        projection: "wall-aligned-v10",
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-rug",
    label: "ラグ(ネイビー部屋)",
    defaultView: "front",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "rug",
    placement: "ground",
    views: {
      // front: r3 床中央。ソファ+テーブルが上に乗る → 緑マスクで外形を覆い cleanup で穴埋め。
      front: {
        src: "assets/objects/navy-rug.png",
        nativeW: 1240,
        nativeH: 271,
        cells: { w: 5, h: 1 },
        source: NAVY_ROOM_L1,
        promptFile: "navy-rug-cleanup-20260623",
      },
    },
  },
  {
    id: "navy-wall-shelf",
    label: "ウォールシェルフ(ネイビー部屋)",
    defaultView: "front",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "wall-decor",
    placement: "wall",
    views: {
      // front: r3 右壁。緑マスク r1 で 3D 別部屋 hallucination → r2 反例強化で成功。
      front: {
        src: "assets/objects/navy-wall-shelf.png",
        nativeW: 229,
        nativeH: 149,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L1,
        promptFile: "navy-wall-shelf-mask-r2-20260623",
      },
      // side: L4 左壁 (中身=小植物/小物 内包)。wallOrigin "left"。
      side: {
        src: "assets/objects/navy-wall-shelf-side.png",
        nativeW: 199,
        nativeH: 140,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L4,
        wallOrigin: "left",
      },
    },
  },
  {
    id: "navy-desk",
    label: "作業デスク(ネイビー部屋)",
    defaultView: "front",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "desk",
    placement: "floor",
    views: {
      // front: r3 奥壁ぎわ中央。デスク本体 + 天板の monitor/lamp/小物を内包。
      //   OCCLUDERS: チェアが手前で kneehole を遮蔽 (kneehole は空き空間なので欠けのまま許容)。
      front: {
        src: "assets/objects/navy-desk-front.png",
        nativeW: 435,
        nativeH: 294,
        cells: { w: 2, h: 1 },
        source: NAVY_ROOM_L1,
      },
      // front-dimetric: L2 中央 free-standing (天板の monitor/lamp/小物 内包)。
      //   OCCLUDERS: 手前のチェアが kneehole (空き空間) を遮蔽 → 実害なし・cleanup 不要。
      "front-dimetric": {
        src: "assets/objects/navy-desk-dimetric.png",
        nativeW: 662,
        nativeH: 418,
        cells: { w: 3, h: 2 },
        source: NAVY_ROOM_L2,
      },
      // side: L3 右壁ぎわ wall-aligned (天板の monitor/lamp/小物 内包)。wallOrigin "right"。
      //   OCCLUDERS: 手前のチェアが kneehole を遮蔽 → 緑塗り対象外・stray 破片は除去済。
      side: {
        src: "assets/objects/navy-desk-rightwall.png",
        nativeW: 397,
        nativeH: 405,
        cells: { w: 2, h: 2 },
        source: NAVY_ROOM_L3,
        projection: "wall-aligned-v10",
        wallOrigin: "right",
      },
    },
  },
  {
    id: "navy-plant-floor",
    label: "観葉植物(ネイビー部屋・床置き)",
    defaultView: "front-dimetric",
    source: NAVY_ROOM_L1,
    persona: ["adult", "male"],
    kind: "plant",
    placement: "floor",
    views: {
      // front: L4 中央 free-standing。OCCLUDERS none。
      front: {
        src: "assets/objects/navy-plant-floor-front.png",
        nativeW: 209,
        nativeH: 460,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L4,
      },
      // front-dimetric: r3 右・床。緑マスク r1 で 3D 別部屋 hallucination → r2 で反例強化し成功。
      "front-dimetric": {
        src: "assets/objects/navy-plant-floor-dimetric.png",
        nativeW: 189,
        nativeH: 232,
        cells: { w: 1, h: 1 },
        source: NAVY_ROOM_L1,
        promptFile: "navy-plant-floor-dimetric-mask-r2-20260623",
      },
      // side: r4 右壁ぎわ wall-aligned。OCCLUDERS none。wallOrigin "right"。
      side: {
        src: "assets/objects/navy-plant-floor-rightwall.png",
        nativeW: 237,
        nativeH: 438,
        cells: { w: 1, h: 2 },
        source: NAVY_ROOM_L2,
        projection: "wall-aligned-v10",
        wallOrigin: "right",
      },
    },
  },
];

// ─── ヘルパ ──────────────────────────────────────────────

// src で variant 単位の lookup。同じ src は1つの variant にしか属さない前提。
export function lookupVariantBySrc(
  src: string,
): { def: ObjectDef; variant: ObjectVariant; view: ObjectViewName } | undefined {
  for (const def of OBJECT_CATALOG) {
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      const variant = def.views[view];
      if (variant && variant.src === src) return { def, variant, view };
    }
  }
  return undefined;
}

// オブジェクト既定の footprint セル(variant 未指定なら native/PX_PER_CELL)。
export function variantCells(variant: ObjectVariant): { w: number; h: number } {
  return variant.cells ?? cellsFromNative(variant.nativeW, variant.nativeH);
}

export function objectDefaultCells(def: ObjectDef, view?: ObjectViewName): { w: number; h: number } {
  const v = (view && def.views[view]) ?? def.views[def.defaultView];
  if (!v) throw new Error(`objectDefaultCells: no variant on ${def.id}`);
  return variantCells(v);
}

// 画像(nativeW×nativeH)を cells の箱へ「アスペクト保持で contain」する scale。
// 短径(より厳しい方)を満たし、長径側は箱内に padding(中央寄せ)。歪み無し。
export function containScale(
  nativeW: number,
  nativeH: number,
  cells: { w: number; h: number },
): number {
  return Math.min((cells.w * GRID) / nativeW, (cells.h * GRID) / nativeH);
}

export function objectScale(def: ObjectDef, view?: ObjectViewName): number {
  const v = (view && def.views[view]) ?? def.views[def.defaultView];
  if (!v) throw new Error(`objectScale: no variant on ${def.id}`);
  return containScale(v.nativeW, v.nativeH, variantCells(v));
}

// src + 任意セルでの contain scale(セルを変えてリサイズする際に使う)。
export function objectScaleForCells(
  src: string,
  cells: { w: number; h: number },
): number {
  const hit = lookupVariantBySrc(src);
  if (!hit) return 1;
  return containScale(hit.variant.nativeW, hit.variant.nativeH, cells);
}

export function getObjectDef(src: string): ObjectDef | undefined {
  return lookupVariantBySrc(src)?.def;
}

// src から variant の cells を引く(未指定 cells は native から導出)。
export function getObjectCells(src: string): { w: number; h: number } | undefined {
  const hit = lookupVariantBySrc(src);
  return hit ? variantCells(hit.variant) : undefined;
}

// src から座面アンカーを引く(座れない variant は undefined)。
export function getObjectSeat(src: string): { dx: number; dy: number } | undefined {
  return lookupVariantBySrc(src)?.variant.seat;
}

// src から表示名を引く(カタログ外はファイル名にフォールバック)。
export function objectLabel(src: string): string {
  return lookupVariantBySrc(src)?.def.label ?? src.replace(/^.*\//, "");
}

// src から影 PNG パスを引く(未指定なら undefined)。
export function getObjectShadowSrc(src: string): string | undefined {
  return lookupVariantBySrc(src)?.variant.shadowSrc;
}

// 既定 view の src を返す(AddPanel の初期サムネ用)。
export function getDefaultVariantSrc(def: ObjectDef): string {
  const v = def.views[def.defaultView];
  if (!v) {
    // defaultView の variant が無ければ存在する方の view を返す
    for (const view of Object.keys(def.views) as ObjectViewName[]) {
      if (def.views[view]) return def.views[view]!.src;
    }
    throw new Error(`getDefaultVariantSrc: no views on ${def.id}`);
  }
  return v.src;
}
