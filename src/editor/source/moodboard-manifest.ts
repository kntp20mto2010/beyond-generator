// 抽出元 (moodboard) ごとの「置かれている家具リスト」+ 抽出進捗チェックリストのデータ。
//
// 目的: 部屋全体の理想レイアウト moodboard (例 sakura-room-ideal-layout-ken-style-r2) に
// 描かれた家具/装飾を列挙し、それぞれが OBJECT_CATALOG に「抽出済み / 別生成済み / 未作成」の
// どれかを一目で追えるようにする。SourcePage がこれを描画する。
//
// ステータスは **manifest にハードコードしない**。catalogId と OBJECT_CATALOG.source から
// 実行時に導出する (itemStatus)。これにより catalog に source を足したり新 entry を登録すると
// チェックリストが自動で更新され、drift しない。
import {
  OBJECT_CATALOG,
  ALLOWED_ANGLES_BY_PLACEMENT,
  SAKURA_ROOM_MOODBOARD,
  SAKURA_ROOM_ALTLAYOUT_R1,
  SAKURA_ROOM_ALTLAYOUT_R3,
} from "../scene/objects-catalog.js";

// moodboard 上の1アイテム = チェックリスト1行。
export interface MoodboardItem {
  labelJa: string;
  group: string; // 章立て見出し (床家具 / 床敷き / 窓 / 壁飾り / 天井 / 小物・植物)
  location: string; // moodboard 上のおおよその位置
  // 対応する OBJECT_CATALOG の id。まだ単体オブジェクト化していなければ null。
  catalogId: string | null;
  note?: string;
}

// 1 つの moodboard 画像 (部屋を別レイアウト/別角度で再生成したバリエーション)。
// 同じ部屋を別レイアウトで作り直して角度を増やす運用なので、複数枚で 1 source を構成する。
export interface MoodboardImage {
  path: string; // assets/generated/... リポジトリ相対
  labelJa?: string; // 例 "理想レイアウト r2"、"別レイアウト r1 (足元 3/4 視点)"
  contributes?: string; // この画像から取れる視点を任意で説明。例 "立体 (側面寄り 3/4)"
}

export interface MoodboardSource {
  id: string;
  labelJa: string;
  imagePaths: MoodboardImage[]; // 複数の room image を縦に並べる
  items: MoodboardItem[];
}

// アイテムの抽出状態:
// - extracted : catalog に entry があり、その source = この moodboard (= ここから抽出済み)
// - made      : catalog に entry はあるが source 未設定/別 (= 別途ゼロ生成された版が存在)
// - todo      : 対応する catalog entry がまだ無い (= 未作成)
export type ItemStatus = "extracted" | "made" | "todo";

// hidden 判定: catalog-hidden.json に id がある (家具ごと) または id|view がある (視点ごと)
function isHidden(hiddenIds: Set<string>, defId: string, view?: string): boolean {
  if (hiddenIds.has(defId)) return true;
  if (view && hiddenIds.has(`${defId}|${view}`)) return true;
  return false;
}

export function itemStatus(item: MoodboardItem, moodboardPaths: string[], hiddenIds: Set<string> = new Set()): ItemStatus {
  if (!item.catalogId) return "todo";
  const def = OBJECT_CATALOG.find((d) => d.id === item.catalogId);
  if (!def) return "todo";
  // def 自体が hidden なら todo 扱い (= UI から消えてるので未作成と同じ意味)
  if (isHidden(hiddenIds, def.id)) return "todo";
  // 可視 variant の source がこの source group の画像に一致すれば抽出済
  let hasVisibleView = false;
  for (const [view, v] of Object.entries(def.views)) {
    if (!v) continue;
    if (isHidden(hiddenIds, def.id, view)) continue; // hidden variant は無視
    hasVisibleView = true;
    if (v.source && moodboardPaths.includes(v.source)) return "extracted";
  }
  // 全 view が hidden / 未定義なら、def.source フォールバックは使わず todo 扱い
  if (!hasVisibleView) return "todo";
  return def.source && moodboardPaths.includes(def.source) ? "extracted" : "made";
}

// 各 view の variant がどの moodboard 画像 (sourcePaths 配列) から抽出されたかを返す。
// number = sourcePaths[index-1] から抽出 (variant.source または def.source が一致、= 抽出済)
// "?"    = variant 存在するが source 未設定または別 source 由来
// "gap"  = variant 未作成だが、placement 的にあるべき view (取りこぼし = 残作業)
// "na"   = この placement では使わない view (窓/ラグ/壁デコは front 専用、立体/壁付は不要) または
//          catalog 未登録 / hidden (= 無いものとして扱う)
//
// 「gap」と「na」を分けることで「あと何角度作れば埋まるか」が数えられる
// ("—" だと「不要」と「取りこぼし」が混ざって残作業が見えない)。
export type ViewExtractionCell = number | "?" | "gap" | "na";

export function viewExtractionCell(
  item: MoodboardItem,
  view: "front" | "front-dimetric" | "side",
  moodboardPaths: string[],
  hiddenIds: Set<string> = new Set(),
): ViewExtractionCell {
  if (!item.catalogId) return "na"; // catalog 未登録 → per-view は判定不能 (item 全体が「未作成」)
  const def = OBJECT_CATALOG.find((d) => d.id === item.catalogId);
  if (!def) return "na";
  // hidden は「無いものとして扱う」(KEN ルール)。取りこぼし扱いにもしない。
  if (isHidden(hiddenIds, def.id, view)) return "na";
  if (isHidden(hiddenIds, def.id)) return "na";
  const v = def.views[view];
  if (!v) {
    // variant が無い。placement 的にこの view が「あるべき」なら取りこぼし (gap)、不要なら na。
    // floor → 3角度全部 / wall・back-wall・side-wall・ceiling・ground → front のみ。
    const applicable = def.placement ? ALLOWED_ANGLES_BY_PLACEMENT[def.placement].includes(view) : false;
    return applicable ? "gap" : "na";
  }
  const path = v.source ?? def.source;
  if (!path) return "?";
  const idx = moodboardPaths.indexOf(path);
  return idx >= 0 ? idx + 1 : "?";
}

// この source の moodboard 内で「取りこぼし」(placement 的にあるべきだが未作成の view) の総数。
// 早見表のヘッダで「残作業 N 角度」を表示するために使う。hidden は対象外。
export function countGaps(items: MoodboardItem[], moodboardPaths: string[], hiddenIds: Set<string> = new Set()): number {
  let n = 0;
  for (const item of items) {
    for (const view of ["front", "front-dimetric", "side"] as const) {
      if (viewExtractionCell(item, view, moodboardPaths, hiddenIds) === "gap") n++;
    }
  }
  return n;
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  extracted: "抽出済",
  made: "作成済(別生成)",
  todo: "未作成",
};

// サクラルーム 理想レイアウト r2 の家具インベントリ。
// 小物 (枕・机上の本/ペン立て・ソファ/ベッドのクッション等) は親家具の抽出画像に内包されるため
// 個別行にはしない。単体配置する単位だけを列挙する。
const SAKURA_ROOM_ITEMS: MoodboardItem[] = [
  // ── 床家具 ──
  { labelJa: "ベッド (ピンク・シングル)", group: "床家具", location: "左壁ぎわ", catalogId: "sakura-bed-pink-single" },
  { labelJa: "学習机", group: "床家具", location: "中央左・窓下", catalogId: "sakura-study-desk" },
  {
    labelJa: "デスクチェア (緑)",
    group: "床家具",
    location: "机の前(中央)",
    catalogId: "sakura-desk-chair-pink",
    note: "moodboard の椅子はセージグリーンだが catalog id は ...-pink。再生成時に色 or label の調整が要る。",
  },
  { labelJa: "ソファ (セージグリーン2人掛け)", group: "床家具", location: "中央右・ラグ上", catalogId: "sakura-sofa-green-floor" },
  {
    labelJa: "コーヒーテーブル (円形ロー)",
    group: "床家具",
    location: "中央・ラグ上",
    catalogId: "sakura-coffee-table",
  },
  {
    labelJa: "プーフ (丸スツール・ピンク)",
    group: "床家具",
    location: "中央手前・ラグ上",
    catalogId: "sakura-pouf-pink",
  },
  { labelJa: "ワードローブ", group: "床家具", location: "右壁ぎわ奥", catalogId: "sakura-wardrobe" },
  { labelJa: "本棚", group: "床家具", location: "右壁ぎわ手前", catalogId: "sakura-bookshelf" },
  {
    labelJa: "観葉植物 (床置き・大)",
    group: "床家具",
    location: "右壁ぎわ床・本棚右脇",
    catalogId: "sakura-plant-floor-large",
  },

  // ── 床敷き ──
  { labelJa: "ラグ (雲形)", group: "床敷き", location: "部屋中央・床", catalogId: "sakura-rug-cloud" },

  // ── 窓 ──
  { labelJa: "窓 + カーテン", group: "窓", location: "奥壁中央", catalogId: "sakura-window-curtain" },

  // ── 壁飾り ──
  {
    labelJa: "額入りアート (抽象画)",
    group: "壁飾り",
    location: "左壁・ベッド頭上",
    catalogId: "sakura-wall-frame-floral",
    note: "moodboard 左壁の額は抽象画。catalog の額絵 entry は1つだけなので暫定割当。",
  },
  {
    labelJa: "額入りアート (植物画・小)",
    group: "壁飾り",
    location: "中央右壁・時計の下",
    catalogId: null,
    note: "2枚目の額 (frame-floral は左壁に割当済み)。緑マスク抽出を試みたが、tiny target のため Codex の edit が 3 連続で部屋ごと再生成 (写実的な別部屋) → deferred。手動 crop or 専用 moodboard で後日。",
  },
  { labelJa: "壁掛け時計 (丸型)", group: "壁飾り", location: "中央上部・窓の右上", catalogId: "sakura-wall-clock" },
  { labelJa: "ドライフラワー (スワッグ)", group: "壁飾り", location: "左壁上部・ベッド頭上", catalogId: "sakura-wall-dried-bouquet" },
  {
    labelJa: "ウォールシェルフ (植物棚)",
    group: "壁飾り",
    location: "左壁・ベッド上方",
    catalogId: "sakura-wall-shelf-plant",
  },

  // ── 天井 ──
  { labelJa: "ペナントガーランド (三角旗)", group: "天井", location: "天井ぎわ右寄り", catalogId: "sakura-wall-pennant" },
  { labelJa: "フェアリーライト (電飾)", group: "天井", location: "天井ぎわを横断", catalogId: "sakura-wall-fairy-lights" },

  // ── 小物・植物 ──
  {
    labelJa: "デスクランプ (緑)",
    group: "小物・植物",
    location: "学習机の上(左奥)",
    catalogId: null,
    note: "学習机の抽出画像 (sakura-study-desk-*) に天板小物として内包済み。単体で置く需要が出たら専用抽出するが、現状は机に含むため standalone entry は作らない。",
  },
  {
    labelJa: "鉢植え観葉植物 (窓辺・棚上など)",
    group: "小物・植物",
    location: "窓辺/ワードローブ上/本棚/テーブル上",
    catalogId: null,
    note: "各所の小型鉢植え。多くは host 家具の抽出画像に内包済み (ウォールシェルフ=sakura-wall-shelf-plant に鉢植え2つ、本棚/ワードローブの上の小鉢も各家具に含む)。単体 plant entry は床置き大 (sakura-plant-floor-large) のみ作成。微小な棚上鉢植えの standalone は需要が出たら個別に。",
  },
];

export const MOODBOARD_SOURCES: MoodboardSource[] = [
  {
    id: "sakura-room",
    labelJa: "サクラルーム",
    imagePaths: [
      {
        path: SAKURA_ROOM_MOODBOARD,
        labelJa: "理想レイアウト r2",
        contributes: "立体 (側面寄り 3/4) 中心、窓+カーテン・ラグ・ソファ・ワードローブ・本棚 など多くの家具の最初の moodboard",
      },
      {
        path: SAKURA_ROOM_ALTLAYOUT_R1,
        labelJa: "別レイアウト r1 (足元 3/4 視点)",
        contributes: "正面寄り 3/4 (足元/前面向き) を補強。ベッド・学習デスク・ワードローブ・本棚 などの front を抽出可能",
      },
      {
        path: SAKURA_ROOM_ALTLAYOUT_R3,
        labelJa: "別レイアウト r3 (head-on 視点・4 家具集中)",
        contributes: "真正面 (head-on) を補強。ベッド・ソファ・ドレッサー+プフ・デスクチェア の front を抽出可能。ワードローブ/本棚/学習机は別 source で取得済のため画面から省略。OCCLUDERS: 全 4 家具とも none",
      },
    ],
    items: SAKURA_ROOM_ITEMS,
  },
];
