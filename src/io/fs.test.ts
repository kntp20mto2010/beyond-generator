import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "./fs.js";

describe("MemoryAdapter", () => {
  it("初期状態でfolderNameはnull", () => {
    const adapter = new MemoryAdapter();
    expect(adapter.folderName).toBeNull();
  });

  it("pickProjectFolder後にfolderNameが設定される", async () => {
    const adapter = new MemoryAdapter();
    const ok = await adapter.pickProjectFolder();
    expect(ok).toBe(true);
    expect(adapter.folderName).toBe("memory");
  });

  it("write→read round-trip", async () => {
    const adapter = new MemoryAdapter();
    await adapter.pickProjectFolder();
    await adapter.writeTextFile("project.byp.json", '{"hello":"world"}');
    const result = await adapter.readTextFile("project.byp.json");
    expect(result).toBe('{"hello":"world"}');
  });

  it("存在しないファイルはnull", async () => {
    const adapter = new MemoryAdapter();
    const result = await adapter.readTextFile("nonexistent.json");
    expect(result).toBeNull();
  });

  it("上書き保存が正しく動く", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("a.txt", "first");
    await adapter.writeTextFile("a.txt", "second");
    expect(await adapter.readTextFile("a.txt")).toBe("second");
  });

  it("別パスは干渉しない", async () => {
    const adapter = new MemoryAdapter();
    await adapter.writeTextFile("a.txt", "aaa");
    await adapter.writeTextFile("b.txt", "bbb");
    expect(await adapter.readTextFile("a.txt")).toBe("aaa");
    expect(await adapter.readTextFile("b.txt")).toBe("bbb");
  });
});
