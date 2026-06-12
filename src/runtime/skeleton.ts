export type BoneId =
  | "root"
  | "torso"
  | "head"
  | "upperArmL"
  | "forearmL"
  | "handL"
  | "upperArmR"
  | "forearmR"
  | "handR"
  | "thighL"
  | "shinL"
  | "footL"
  | "thighR"
  | "shinR"
  | "footR";

export interface BoneDef {
  id: BoneId;
  parent: BoneId | null;
  // ボーンのレスト原点をどのパーツのどのピンから取るか(rootは原点固定)
  originFrom: { slot: string; pin: string } | null;
}

// 親が必ず先に並ぶ順序(computeBoneWorldはこの順で評価する)
export const HUMANOID_V1: readonly BoneDef[] = [
  { id: "root", parent: null, originFrom: null },
  { id: "torso", parent: "root", originFrom: { slot: "torso", pin: "origin" } },
  { id: "head", parent: "torso", originFrom: { slot: "head", pin: "origin" } },
  { id: "upperArmL", parent: "torso", originFrom: { slot: "upperArmL", pin: "origin" } },
  { id: "forearmL", parent: "upperArmL", originFrom: { slot: "forearmL", pin: "origin" } },
  { id: "handL", parent: "forearmL", originFrom: { slot: "forearmL", pin: "joint" } },
  { id: "upperArmR", parent: "torso", originFrom: { slot: "upperArmR", pin: "origin" } },
  { id: "forearmR", parent: "upperArmR", originFrom: { slot: "forearmR", pin: "origin" } },
  { id: "handR", parent: "forearmR", originFrom: { slot: "forearmR", pin: "joint" } },
  { id: "thighL", parent: "torso", originFrom: { slot: "thighL", pin: "origin" } },
  { id: "shinL", parent: "thighL", originFrom: { slot: "shinL", pin: "origin" } },
  { id: "footL", parent: "shinL", originFrom: { slot: "footL", pin: "origin" } },
  { id: "thighR", parent: "torso", originFrom: { slot: "thighR", pin: "origin" } },
  { id: "shinR", parent: "thighR", originFrom: { slot: "shinR", pin: "origin" } },
  { id: "footR", parent: "shinR", originFrom: { slot: "footR", pin: "origin" } },
] as const;

// 体パーツのスロット → 追従するボーン
export const SLOT_BONE: Record<string, BoneId> = {
  torso: "torso",
  head: "head",
  upperArmL: "upperArmL",
  forearmL: "forearmL",
  upperArmR: "upperArmR",
  forearmR: "forearmR",
  thighL: "thighL",
  shinL: "shinL",
  footL: "footL",
  thighR: "thighR",
  shinR: "shinR",
  footR: "footR",
};

// 顔・髪以外でデータにzを持たないもののz規定値(03のZ順テーブル)
export const HAND_Z: Record<"handL" | "handR", number> = {
  handR: 22,
  handL: 92,
};

export const HAIR_Z: Record<"back" | "mid" | "front", number> = {
  back: 10,
  mid: 80,
  front: 85,
};
