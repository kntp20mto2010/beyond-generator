// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// 既定スケール + 座面アンカーに使う。src はリポジトリ相対の透過PNGパス。
export interface ObjectDef {
  id: string;
  label: string;
  src: string;
  scale: number; // 配置時の既定 transform.scale
  // 座れる家具は座面アンカーを持つ。下端中央アンカーからの画像空間オフセット
  // (キャラの腰=transform.y を置く点)。dy は上が負。
  seat?: { dx: number; dy: number };
}

export const OBJECT_CATALOG: ObjectDef[] = [
  {
    id: "sofa-navy",
    label: "ソファ",
    src: "assets/objects/sofa-navy-2seat.png",
    scale: 0.62,
    seat: { dx: 0, dy: -306 },
  },
];

// src から座面アンカーを引く(座れない家具は undefined)。
export function getObjectSeat(src: string): { dx: number; dy: number } | undefined {
  return OBJECT_CATALOG.find((o) => o.src === src)?.seat;
}

// src から表示名を引く(カタログ外はファイル名にフォールバック)。
export function objectLabel(src: string): string {
  return OBJECT_CATALOG.find((o) => o.src === src)?.label ?? src.replace(/^.*\//, "");
}
