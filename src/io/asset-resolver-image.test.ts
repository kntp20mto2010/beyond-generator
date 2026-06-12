import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetResolver } from "./asset-resolver.js";
import { MemoryAdapter } from "./fs.js";

// Node環境には URL.createObjectURL / fetch が無い(またはjsdom未実装)ため stub する
let urlCounter = 0;
const revoked: string[] = [];

beforeEach(() => {
  urlCounter = 0;
  revoked.length = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => `blob:mock-${++urlCounter}`,
    revokeObjectURL: (u: string) => revoked.push(u),
  });
  // Blob は中身を見ないので最小モック(parameter property は erasableSyntaxOnly で不可)
  vi.stubGlobal("Blob", function MockBlob(this: { parts: unknown[] }, parts: unknown[]) {
    this.parts = parts;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function buf(): ArrayBuffer {
  return new Uint8Array([1, 2, 3, 4]).buffer;
}

describe("AssetResolver: 画像背景の解決", () => {
  it("FSのreadBinaryFileから objectURL を作り getImageUrl で返す", async () => {
    const fs = new MemoryAdapter();
    fs.writeBinaryFile("assets/bg/room.png", buf());
    const r = new AssetResolver();

    expect(r.getImageUrl("assets/bg/room.png")).toBeUndefined();
    await r.ensureImagesLoaded(["assets/bg/room.png"], fs);
    expect(r.getImageUrl("assets/bg/room.png")).toBe("blob:mock-1");
  });

  it("ロード完了で subscribe が呼ばれる", async () => {
    const fs = new MemoryAdapter();
    fs.writeBinaryFile("assets/bg/a.png", buf());
    const r = new AssetResolver();
    let called = 0;
    r.subscribe(() => called++);
    await r.ensureImagesLoaded(["assets/bg/a.png"], fs);
    expect(called).toBe(1);
  });

  it("FSに無い場合は fetch フォールバック(リポジトリ内蔵パス)", async () => {
    const fs = new MemoryAdapter(); // 空
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => ({}) as Blob,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = new AssetResolver();
    await r.ensureImagesLoaded(["assets/generated/bg-school-001.png"], fs);
    expect(fetchMock).toHaveBeenCalledWith("/assets/generated/bg-school-001.png");
    expect(r.getImageUrl("assets/generated/bg-school-001.png")).toBe("blob:mock-1");
  });

  it("FS・fetch 両方失敗なら未解決のまま(再ロードしない)", async () => {
    const fs = new MemoryAdapter();
    const fetchMock = vi.fn(async () => ({ ok: false, blob: async () => ({}) as Blob }));
    vi.stubGlobal("fetch", fetchMock);

    const r = new AssetResolver();
    await r.ensureImagesLoaded(["missing.png"], fs);
    expect(r.getImageUrl("missing.png")).toBeUndefined();
    // 2回目は failed 記録によりfetchを呼ばない
    await r.ensureImagesLoaded(["missing.png"], fs);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidate で objectURL を revoke しキャッシュを破棄", async () => {
    const fs = new MemoryAdapter();
    fs.writeBinaryFile("assets/bg/x.png", buf());
    const r = new AssetResolver();
    await r.ensureImagesLoaded(["assets/bg/x.png"], fs);
    const url = r.getImageUrl("assets/bg/x.png");
    expect(url).toBe("blob:mock-1");

    r.invalidate();
    expect(revoked).toContain(url);
    expect(r.getImageUrl("assets/bg/x.png")).toBeUndefined();
    // 破棄後は再ロード可能(failedクリア)
    await r.ensureImagesLoaded(["assets/bg/x.png"], fs);
    expect(r.getImageUrl("assets/bg/x.png")).toBe("blob:mock-2");
  });
});
