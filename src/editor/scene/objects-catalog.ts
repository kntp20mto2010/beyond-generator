// 配置可能オブジェクト(家具/小物)のカタログ。AddPanel のオブジェクト一覧 +
// 既定スケールに使う。src はリポジトリ相対の透過PNGパス。
export interface ObjectDef {
  id: string;
  label: string;
  src: string;
  scale: number; // 配置時の既定 transform.scale
}

export const OBJECT_CATALOG: ObjectDef[] = [
  { id: "sofa-navy", label: "ソファ", src: "assets/objects/sofa-navy-2seat.png", scale: 0.42 },
];
