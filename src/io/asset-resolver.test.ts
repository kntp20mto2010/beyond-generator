import { describe, expect, it } from "vitest";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import { AssetResolver } from "./asset-resolver.js";
import { MemoryAdapter } from "./fs.js";
import { characterDocIO } from "./serialize.js";

describe("AssetResolver", () => {
  it("builtin は同期で解決できる", () => {
    const r = new AssetResolver();
    expect(r.getCharacter("builtin:template-a")).toBe(TEMPLATE_A);
  });

  it("ファイル参照は ensureLoaded 後に解決される", async () => {
    const fs = new MemoryAdapter();
    await fs.writeTextFile("characters/hal.byc.json", characterDocIO.toJson(TEMPLATE_A));
    const r = new AssetResolver();

    expect(r.getCharacter("characters/hal.byc.json")).toBeUndefined();
    await r.ensureLoaded(["characters/hal.byc.json"], fs);
    const doc = r.getCharacter("characters/hal.byc.json");
    expect(doc?.name).toBe("ハル");
  });

  it("ロード完了で subscribe が呼ばれる", async () => {
    const fs = new MemoryAdapter();
    await fs.writeTextFile("characters/hal.byc.json", characterDocIO.toJson(TEMPLATE_A));
    const r = new AssetResolver();
    let called = 0;
    r.subscribe(() => {
      called++;
    });
    await r.ensureLoaded(["characters/hal.byc.json"], fs);
    expect(called).toBe(1);
  });

  it("存在しないファイルは失敗扱いで再ロードしない", async () => {
    const fs = new MemoryAdapter();
    const r = new AssetResolver();
    await r.ensureLoaded(["characters/missing.byc.json"], fs);
    expect(r.getCharacter("characters/missing.byc.json")).toBeUndefined();
    // 2回目は I/O を呼ばない(MemoryAdapterは副作用が無いので例外が出ないことだけ確認)
    await r.ensureLoaded(["characters/missing.byc.json"], fs);
    expect(r.getCharacter("characters/missing.byc.json")).toBeUndefined();
  });
});
