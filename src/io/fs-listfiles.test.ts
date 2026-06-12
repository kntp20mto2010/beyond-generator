import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "./fs.js";

describe("MemoryAdapter.listFiles", () => {
  it("空ディレクトリは空配列", async () => {
    const adapter = new MemoryAdapter();
    const result = await adapter.listFiles("characters");
    expect(result).toEqual([]);
  });

  it("プレフィックスが一致するファイル名を返す", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("characters/char1.byc.json", "{}");
    await adapter.writeTextFile("characters/char2.byc.json", "{}");
    const result = await adapter.listFiles("characters");
    expect(result.sort()).toEqual(["char1.byc.json", "char2.byc.json"]);
  });

  it("サブディレクトリのファイルは含まない", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("characters/a.json", "{}");
    await adapter.writeTextFile("characters/sub/b.json", "{}");
    const result = await adapter.listFiles("characters");
    expect(result).toEqual(["a.json"]);
  });

  it("別ディレクトリのファイルは含まない", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("characters/char.byc.json", "{}");
    await adapter.writeTextFile("project.byp.json", "{}");
    const result = await adapter.listFiles("characters");
    expect(result).toEqual(["char.byc.json"]);
  });

  it("末尾スラッシュあり・なしで同じ結果", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("characters/x.json", "{}");
    const r1 = await adapter.listFiles("characters");
    const r2 = await adapter.listFiles("characters/");
    expect(r1).toEqual(r2);
  });
});
