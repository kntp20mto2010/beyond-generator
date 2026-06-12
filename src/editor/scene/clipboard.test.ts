import { describe, expect, it } from "vitest";
import type { CharacterElement } from "../../core/schema/project.js";
import { copyElement, hasClipboard, readClipboard } from "./clipboard.js";

function charEl(): CharacterElement {
  return {
    id: "src",
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 100, y: 200, scale: 1, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [{ t: 0, clip: "wave", speed: 1 }],
    expressions: [{ t: 0, preset: "smile" }],
  };
}

describe("clipboard", () => {
  it("コピー後 hasClipboard が true", () => {
    copyElement(charEl());
    expect(hasClipboard()).toBe(true);
  });

  it("readClipboard は元と独立した深複製を返す", () => {
    const src = charEl();
    copyElement(src);
    const a = readClipboard();
    expect(a).toEqual(src);

    // コピー元を変更しても取り出した内容は変わらない(structuredClone)
    src.transform.x = 9999;
    src.actions[0]!.clip = "run";
    const b = readClipboard();
    expect(b?.transform.x).toBe(100);
    if (b?.kind !== "character") throw new Error("char");
    expect(b.actions[0]?.clip).toBe("wave");
  });

  it("readClipboard を2回呼ぶと別インスタンス(相互に独立)", () => {
    copyElement(charEl());
    const a = readClipboard();
    const b = readClipboard();
    expect(a).not.toBe(b);
    if (a) a.transform.y = -1;
    expect(b?.transform.y).toBe(200);
  });
});
