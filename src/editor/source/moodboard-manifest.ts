// 抽出元 (moodboard) ごとの「置かれている家具リスト」+ 抽出進捗チェックリストのデータ。
//
// 目的: 部屋全体の理想レイアウト moodboard (例 sakura-room-ideal-layout-ken-style-r2) に
// 描かれた家具/装飾を列挙し、それぞれが OBJECT_CATALOG に「抽出済み / 別生成済み / 未作成」の
// どれかを一目で追えるようにする。SourcePage がこれを描画する。
//
// ステータスは **manifest にハードコードしない**。catalogId と OBJECT_CATALOG.source から
// 実行時に導出する (itemStatus)。これにより catalog に source を足したり新 entry を登録すると
// チェックリストが自動で更新され、drift しない。
import { OBJECT_CATALOG, SAKURA_ROOM_MOODBOARD } from "../scene/objects-catalog.js";

// moodboard 上の1アイテム = チェックリスト1行。
export interface MoodboardItem {
  labelJa: string;
  group: string; // 章立て見出し (床家具 / 床敷き / 窓 / 壁飾り / 天井 / 小物・植物)
  location: string; // moodboard 上のおおよその位置
  // 対応する OBJECT_CATALOG の id。まだ単体オブジェクト化していなければ null。
  catalogId: string | null;
  note?: string;
}

export interface MoodboardSource {
  id: string;
  labelJa: string;
  imagePath: string; // リポジトリ相対の moodboard PNG
  items: MoodboardItem[];
}

// アイテムの抽出状態:
// - extracted : catalog に entry があり、その source = この moodboard (= ここから抽出済み)
// - made      : catalog に entry はあるが source 未設定/別 (= 別途ゼロ生成された版が存在)
// - todo      : 対応する catalog entry がまだ無い (= 未作成)
export type ItemStatus = "extracted" | "made" | "todo";

export function itemStatus(item: MoodboardItem, moodboardPath: string): ItemStatus {
  if (!item.catalogId) return "todo";
  const def = OBJECT_CATALOG.find((d) => d.id === item.catalogId);
  if (!def) return "todo";
  return def.source === moodboardPath ? "extracted" : "made";
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
    catalogId: null,
    note: "table kind の catalog entry が未作成。",
  },
  {
    labelJa: "プーフ (丸スツール・ピンク)",
    group: "床家具",
    location: "中央手前・ラグ上",
    catalogId: null,
    note: "単体 pouf/stool entry が未作成 (vanity セットとは別物)。",
  },
  { labelJa: "ワードローブ", group: "床家具", location: "右壁ぎわ奥", catalogId: "sakura-wardrobe" },
  { labelJa: "本棚", group: "床家具", location: "右壁ぎわ手前", catalogId: "sakura-bookshelf" },
  {
    labelJa: "観葉植物 (床置き・大)",
    group: "床家具",
    location: "右壁ぎわ床・本棚右脇",
    catalogId: null,
    note: "白鉢の床置き大型グリーン。plant kind の床置き entry が未作成。",
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
    note: "2枚目の額。専用 entry が未作成 (frame-floral は左壁に割当済み)。",
  },
  { labelJa: "壁掛け時計 (丸型)", group: "壁飾り", location: "中央上部・窓の右上", catalogId: "sakura-wall-clock" },
  { labelJa: "ドライフラワー (スワッグ)", group: "壁飾り", location: "左壁上部・ベッド頭上", catalogId: "sakura-wall-dried-bouquet" },
  {
    labelJa: "ウォールシェルフ (植物棚)",
    group: "壁飾り",
    location: "左壁・ベッド上方",
    catalogId: null,
    note: "鉢植え2つを載せた壁付け木製シェルフ。entry 未作成。",
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
    note: "机上の緑デスクランプ。単体 entry が未作成 (机抽出に内包する手もある)。",
  },
  {
    labelJa: "鉢植え観葉植物 (窓辺・棚上など)",
    group: "小物・植物",
    location: "窓辺/ワードローブ上/本棚/テーブル上",
    catalogId: null,
    note: "各所の小型鉢植えをまとめて1行。plant entry 群が未作成。",
  },
];

export const MOODBOARD_SOURCES: MoodboardSource[] = [
  {
    id: "sakura-room-ideal-r2",
    labelJa: "サクラルーム (理想レイアウト r2)",
    imagePath: SAKURA_ROOM_MOODBOARD,
    items: SAKURA_ROOM_ITEMS,
  },
];
