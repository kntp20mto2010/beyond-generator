import { describe, it, expect } from "vitest";

// src/story/ 配下の本体ソース(テスト/フィクスチャ除く)が
// 乱数 / 時刻 API を import・使用しないことを静的に保証。
// Vite の glob+raw でソース文字列を取得(Node fs に依存しない)
const RAW = import.meta.glob("./*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CORE_FILES = [
  "schema.ts",
  "timing.ts",
  "compile.ts",
  "decompile.ts",
  "index.ts",
];

function rawFor(name: string): string {
  const key = `./${name}`;
  const src = RAW[key];
  if (src === undefined) throw new Error(`source not found: ${name}`);
  return src;
}

describe("静的: src/story/ は非決定論 API を使わない", () => {
  it("本体ファイルが揃っている(schema/timing/compile/decompile/index)", () => {
    for (const name of CORE_FILES) {
      expect(Object.keys(RAW)).toContain(`./${name}`);
    }
  });

  for (const f of CORE_FILES) {
    it(`${f} は乱数 / 時刻 API を含まない`, () => {
      const src = rawFor(f);
      expect(src).not.toMatch(/\bMath\.random\b/);
      expect(src).not.toMatch(/\bnew\s+Date\b/);
      expect(src).not.toMatch(/\bDate\.now\b/);
      expect(src).not.toMatch(/\bDate\s*\(/);
      // newId(乱数 ULID)も使わない
      expect(src).not.toMatch(/\bnewId\b/);
      expect(src).not.toMatch(/\bulid\b/);
    });
  }
});
