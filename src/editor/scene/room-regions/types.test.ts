import { describe, expect, it } from "vitest";
import { SAKURA_ROOM_REGIONS } from "./sakura-room.js";
import {
  ALLOWED_REGIONS_BY_PLACEMENT,
  anchorColsForObject,
  floorWallAdjacency,
  multiAnchorWallAdjacency,
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

  it("anchorColsForObject: 偶数幅は中央 2 セル、奇数幅は中央 1 セル", () => {
    // grid=120, centerX=960 → centerCol = floor(960/120) = 8
    expect(anchorColsForObject(960, 4, 120)).toEqual([7, 8]); // 偶数 cw=4 → [7, 8]
    expect(anchorColsForObject(960, 2, 120)).toEqual([7, 8]); // 偶数 cw=2 → [7, 8]
    // grid=120, centerX=900 → centerCol = floor(900/120) = 7 (half-cell offset)
    expect(anchorColsForObject(900, 3, 120)).toEqual([7]);    // 奇数 cw=3 → [7]
    expect(anchorColsForObject(900, 1, 120)).toEqual([7]);    // 奇数 cw=1 → [7]
  });

  it("anchorColsForObject: 境界・負値でも安全に列を返す", () => {
    // 範囲外の負/上限超 col を返すが、呼出側は map.regions[row]?.[col] = undefined で safe
    expect(anchorColsForObject(0, 2, 120)).toEqual([-1, 0]);     // 左端 grid line
    expect(anchorColsForObject(1920, 2, 120)).toEqual([15, 16]); // 右端 grid line (col 16 は範囲外)
    expect(anchorColsForObject(-10, 1, 120)).toEqual([-1]);      // 負値
  });

  it("multiAnchorWallAdjacency: 4 パターンを優先順 left>right>back>interior で判定", () => {
    // sakura-room row 5: ["L","L","L","F","F","F","F","F","F","F","F","F","F","R","R","R"]
    // sakura-room row 4: 全 B (cols 4-11)、L/R は両端
    // sakura-room row 6: ["L","F","F","F","F","F","F","F","F","F","F","F","F","F","F","R"]
    // sakura-room row 7: 全 F

    // leftBorder: cols=[3, 4], row=5 → leftmost-1 = 2 = "L" → leftBorder
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [3, 4], 5)).toBe("leftBorder");

    // rightBorder: cols=[11, 12], row=5 → rightmost+1 = 13 = "R" → rightBorder
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [11, 12], 5)).toBe("rightBorder");

    // backBorder: cols=[7, 8], row=5 → 左右非該当、上は (4,7)=B / (4,8)=B → backBorder
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [7, 8], 5)).toBe("backBorder");

    // interior: cols=[7, 8], row=7 → 左右上いずれも F
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [7, 8], 7)).toBe("interior");

    // 単一 anchor (奇数幅) でも動く: cols=[7], row=5 → 上=(4,7)=B → backBorder
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [7], 5)).toBe("backBorder");

    // 空配列は interior
    expect(multiAnchorWallAdjacency(SAKURA_ROOM_REGIONS, [], 5)).toBe("interior");
  });
});
