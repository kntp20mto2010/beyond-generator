import { describe, expect, it } from "vitest";
import { SAKURA_ROOM_REGIONS } from "./sakura-room.js";
import {
  ALLOWED_REGIONS_BY_PLACEMENT,
  floorWallAdjacency,
  nearestAllowedCell,
  regionAtCell,
  regionAtStage,
} from "./types.js";

describe("room-regions helper", () => {
  it("regionAtCell: 範囲内は code を返し、範囲外は undefined", () => {
    expect(regionAtCell(SAKURA_ROOM_REGIONS, 0, 0)).toBe("L"); // 左壁
    expect(regionAtCell(SAKURA_ROOM_REGIONS, 8, 0)).toBe("B"); // 奥壁
    expect(regionAtCell(SAKURA_ROOM_REGIONS, 15, 0)).toBe("R"); // 右壁
    expect(regionAtCell(SAKURA_ROOM_REGIONS, 8, 8)).toBe("F"); // 床
    expect(regionAtCell(SAKURA_ROOM_REGIONS, -1, 0)).toBeUndefined();
    expect(regionAtCell(SAKURA_ROOM_REGIONS, 0, 99)).toBeUndefined();
  });

  it("regionAtStage: STAGE 座標 → cell の region", () => {
    expect(regionAtStage(SAKURA_ROOM_REGIONS, 60, 60)).toBe("L"); // (col=0, row=0)
    expect(regionAtStage(SAKURA_ROOM_REGIONS, 960, 1020)).toBe("F"); // (col=8, row=8)
    expect(regionAtStage(SAKURA_ROOM_REGIONS, -10, 0)).toBeUndefined();
  });

  it("nearestAllowedCell: 床セル中の中央 → 同セル", () => {
    const near = nearestAllowedCell(SAKURA_ROOM_REGIONS, 8, 8, ["F"]);
    expect(near).toEqual({ col: 8, row: 8 });
  });

  it("nearestAllowedCell: 壁セルから floor を探すと最寄り床に着地", () => {
    // (col=8, row=0) は奥壁。floor の最近傍は (8, 5)(マンハッタン 5)
    const near = nearestAllowedCell(SAKURA_ROOM_REGIONS, 8, 0, ["F"]);
    expect(near).toEqual({ col: 8, row: 5 });
  });

  it("nearestAllowedCell: 床セルから wall を探すと最寄り壁に着地", () => {
    // (col=8, row=8) は床。wall (L/B/R) の最近傍は奥壁 row=4
    const near = nearestAllowedCell(SAKURA_ROOM_REGIONS, 8, 8, ["L", "B", "R"]);
    expect(near?.row).toBeLessThanOrEqual(4);
  });

  it("ALLOWED_REGIONS_BY_PLACEMENT: 配置ごとに正しい region 集合", () => {
    expect(ALLOWED_REGIONS_BY_PLACEMENT.floor).toEqual(["F"]);
    expect(ALLOWED_REGIONS_BY_PLACEMENT.wall).toEqual(["L", "B", "R"]);
    expect(ALLOWED_REGIONS_BY_PLACEMENT.ground).toEqual(["F"]);
  });

  it("floorWallAdjacency: 床セルの壁隣接を判定", () => {
    // sakura-room の床セル位置例:
    // row 5: ["L","L","L","F","F",...,"F","R","R","R"]   col 3 が leftBorder, col 12 が rightBorder
    // row 7: 全 F                                          内側
    // 奥壁隣接: row 5 col 3 は実は (col=3, row=4)=L で left のみ。backBorder は row 6+ で row-1=B のセル探す。
    // row 6: ["L","F","F",...,"F","R"]  col=1 は (col=1, row=5)='L' で left! ですらない、行が変わる。
    // ちゃんと row=6 col=1 の上 (col=1, row=5) を見ると "L"。だから col=1,row=6 は left border(縦境界).
    // back border の例: row 5 col 4 → 上は (col=4, row=4)='B' → backBorder
    expect(floorWallAdjacency(SAKURA_ROOM_REGIONS, 3, 5)).toBe("leftBorder");   // 左隣が L
    expect(floorWallAdjacency(SAKURA_ROOM_REGIONS, 12, 5)).toBe("rightBorder"); // 右隣が R
    expect(floorWallAdjacency(SAKURA_ROOM_REGIONS, 4, 5)).toBe("backBorder");   // 上隣が B
    expect(floorWallAdjacency(SAKURA_ROOM_REGIONS, 8, 7)).toBe("interior");     // 4 方向すべて F
    expect(floorWallAdjacency(SAKURA_ROOM_REGIONS, 0, 0)).toBe("interior");     // L セルそのもの = 床ではない
  });
});
