import { describe, expect, it } from "vitest";
import { SAKURA_ROOM_REGIONS } from "./sakura-room.js";
import {
  ALLOWED_REGIONS_BY_PLACEMENT,
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
});
