import { describe, expect, it } from "vitest";
import { SAKURA_ROOM_REGIONS } from "./sakura-room.js";
import {
  anchorColsForObject,
  floorFootprintWallAdjacency,
  floorWallAdjacency,
  isFootprintValid,
  multiAnchorWallAdjacency,
  nearestValidSnap,
  regionAtCell,
  regionAtStage,
  type PlacementRule,
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

  it("floorFootprintWallAdjacency: footprint 全体で壁隣接を判定 (手前 row でも届けば side)", () => {
    // sakura-room: row5 cols0-2=L cols13-15=R / row6 col0=L col15=R / row7-8 全F
    //   row4 = 奥壁 B (cols4-11)

    // leftBorder: footprint cols 1-4 rows 5-7 (手前まで届く)。左外側 col0 row5=L → leftBorder
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 1, 5, 4, 3)).toBe("leftBorder");

    // leftBorder: 手前寄り footprint rows 6-8 cols 1-4。左外側 col0 row6=L → leftBorder
    //   (anchor 1 セル判定なら row8 中央では L 隣接が無く取れなかったケース)
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 1, 6, 4, 3)).toBe("leftBorder");

    // rightBorder: footprint cols 9-12 rows 5-7。右外側 col13 row5=R → rightBorder
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 9, 5, 4, 3)).toBe("rightBorder");

    // backBorder: footprint cols 5-8 rows 5-7。上外側 row4 cols5-8=B、左右は F → backBorder
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 5, 5, 4, 3)).toBe("backBorder");

    // interior: footprint cols 6-9 rows 7-8 (完全手前、壁に届かない)
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 6, 7, 4, 2)).toBe("interior");

    // 優先順: left > back。footprint cols 1-4 rows 5-7 は左(col0 L)も上(row4 col4=B)も該当 → left 優先
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 1, 5, 4, 3)).toBe("leftBorder");

    // 部屋左端の床列 (colLeft=0, 最前列 row7-8): L セルが届かなくても leftBorder
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 0, 7, 2, 2)).toBe("leftBorder");
    // 部屋右端の床列 (colRight=15): rightBorder
    expect(floorFootprintWallAdjacency(SAKURA_ROOM_REGIONS, 14, 7, 2, 2)).toBe("rightBorder");
  });

  describe("PlacementRule (窓 = B のみ + 上下 1 cell マージン)", () => {
    const WINDOW_RULE: PlacementRule = { regions: ["B"], marginTop: 1, marginBottom: 1 };

    it("isFootprintValid: 窓 4×3 を奥壁中央に置けるか", () => {
      // sakura-room rows 0-4 は奥壁 B (cols 4-11), row 5 は F (cols 3-12)
      // snx=960 (col 6-9, even cw=4 → offX=0), sny=600 → row 5 が bottom 行
      //   footprint = rows 2-4 cols 6-9 (全て B) ✓
      //   margin: row 1 (B) ✓ / row 5 (F) ✗  → invalid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 960, 600, 4, 3, WINDOW_RULE)).toBe(false);
      // snx=960, sny=480 → bottom 行 = row 4 (B)
      //   footprint = rows 1-3 cols 6-9 (全 B) ✓
      //   margin: row 0 (B) ✓ / row 4 (B) ✓ → valid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 960, 480, 4, 3, WINDOW_RULE)).toBe(true);
    });

    it("isFootprintValid: 壁範囲外 (col < 4) は invalid", () => {
      // snx=240 → colLeft = (240-240)/120 = 0. footprint cols 0-3 = L L L L → not B → invalid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 240, 480, 4, 3, WINDOW_RULE)).toBe(false);
      // snx=480 → colLeft = (480-240)/120 = 2. footprint cols 2-5: row 1 col 2,3=L → invalid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 480, 480, 4, 3, WINDOW_RULE)).toBe(false);
    });

    it("nearestValidSnap: 不正位置 (960,600) からの最近傍 valid は (960,480)", () => {
      const got = nearestValidSnap(SAKURA_ROOM_REGIONS, 960, 600, 4, 3, WINDOW_RULE);
      expect(got).toEqual({ snx: 960, sny: 480 });
    });

    it("nearestValidSnap: valid 位置はそのまま返る (距離 0)", () => {
      const got = nearestValidSnap(SAKURA_ROOM_REGIONS, 960, 480, 4, 3, WINDOW_RULE);
      expect(got).toEqual({ snx: 960, sny: 480 });
    });

    it("isFootprintValid: 奇数幅 (cw=3) で offX=grid/2 snap も検証", () => {
      // snx=900 (odd cw=3, col center)、sny=480
      // colLeft = round((900 - 180)/120) = 6, footprint cols 6-8 rows 1-3 (全 B)
      // margin: row 0 (6-8) = B, row 4 (6-8) = B → valid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 900, 480, 3, 3, WINDOW_RULE)).toBe(true);
    });

    it("isFootprintValid: marginLeft/marginRight も検証 (壁端拒否)", () => {
      const ruleWithSideMargin: PlacementRule = {
        regions: ["B"], marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1,
      };
      // snx=720 → colLeft=4, footprint cols 4-7。marginLeft=1 で col 3 = L → invalid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 720, 480, 4, 3, ruleWithSideMargin)).toBe(false);
      // snx=960 → colLeft=6, footprint cols 6-9。marginLeft=1 で col 5 = B ✓, marginRight=1 で col 10 = B ✓
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 960, 480, 4, 3, ruleWithSideMargin)).toBe(true);
    });

    it("nearestValidSnap: valid 位置が存在しなければ undefined", () => {
      // ground (F のみ) かつ 6×3 (cols 6 必要) を margin=1 で挟む → ほとんど不可能
      // 床は 16 cols 9 rows のうち rows 7-8 は全 F、rows 5-6 部分的 F
      // 6×3 + margin 4方向×1 = 6×3 cell + 2 周囲 = 8×5 を全 F で必要 → row 7+1=8 まで埋まる候補が無い
      const heavyRule: PlacementRule = {
        regions: ["F"], marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1,
      };
      const got = nearestValidSnap(SAKURA_ROOM_REGIONS, 960, 600, 6, 3, heavyRule);
      expect(got).toBeUndefined();
    });

    it("isFootprintValid: footprint が部分的にマップ外でも安全に invalid", () => {
      // snx=120 → colLeft=(120-240)/120=-1, cols -1,0,1,2 → regions[r]?.[-1]=undefined → invalid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 120, 480, 4, 3, WINDOW_RULE)).toBe(false);
    });
  });

  describe("PlacementRule rowMin/rowMax (天井 = row 0 のみ)", () => {
    // ceiling rule: 壁 region (L/B/R) のうち rowTop が 0 のみ
    const CEILING_RULE: PlacementRule = {
      regions: ["L", "B", "R"],
      rowMin: 0,
      rowMax: 0,
    };

    it("isFootprintValid: ceiling 3×1 を奥壁 row 0 中央に置けるか", () => {
      // sakura-room row 0: 全 B (cols 4-11)。奇数 cw=3 → offX=grid/2
      // snx=900 (col center 7) → colLeft = round((900 - 180)/120) = 6, cols 6-8
      // sny=120 → rowTop = round(120/120) - 1 = 0 ✓ in [0,0]
      // footprint cols 6-8 row 0 = B B B → valid
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 900, 120, 3, 1, CEILING_RULE)).toBe(true);
    });

    it("isFootprintValid: rowMin/rowMax 範囲外 (row 1 以降) は invalid", () => {
      // sny=240 → rowTop = round(240/120) - 1 = 1 ✗ rowMax=0
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 900, 240, 3, 1, CEILING_RULE)).toBe(false);
      // sny=480 → rowTop = 3 ✗
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 900, 480, 3, 1, CEILING_RULE)).toBe(false);
    });

    it("isFootprintValid: region は OK でも rowTop が範囲外なら invalid", () => {
      // sny=600 → rowTop = 4 (床側) ✗ rowMax=0
      expect(isFootprintValid(SAKURA_ROOM_REGIONS, 900, 600, 3, 1, CEILING_RULE)).toBe(false);
    });

    it("nearestValidSnap: 範囲外 (row 4) から始めても row 0 の最近傍へ吸着", () => {
      // 開始 (900, 600) = row 4 相当の不正位置 → 最近傍 valid は row 0
      // 偶数 / 奇数 snap は cellsW で決まる (cw=3 → offX=60)
      const got = nearestValidSnap(SAKURA_ROOM_REGIONS, 900, 600, 3, 1, CEILING_RULE);
      expect(got).toBeDefined();
      // sny = 120 = (rowTop=0 + cellsH=1) * grid
      expect(got!.sny).toBe(120);
      // cols 4-11 が B。snx 候補は { snx = c*120+60 | c in cols }、open: footprint cols c..c+2 全 B
      //   c=4 → cols 4-6 (B B B) ✓ snx = 540
      //   c=5 → cols 5-7 ✓ snx = 660
      //   ... c=9 → cols 9-11 ✓ snx = 1140
      // 開始 snx=900 → 最近傍は snx=900 (c=7, cols 7-9 全 B) ✓
      expect(got!.snx).toBe(900);
    });

    it("nearestValidSnap: rowMin/rowMax で走査範囲を絞っても valid が見つかる", () => {
      // (840, 480) → 偶数 cw=2 で offX=0, cols=7-8 row 0 = B B → valid
      // sny=120 expected (rowTop=0 へ吸着)
      const got = nearestValidSnap(SAKURA_ROOM_REGIONS, 840, 480, 2, 1, CEILING_RULE);
      expect(got).toBeDefined();
      expect(got!.sny).toBe(120);
    });
  });
});
