import { describe, it, expect } from "vitest";
import { characterDocIO } from "./serialize.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";

describe("characterDocIO: round-trip", () => {
  it("toJson + parse で deep equal を返す", () => {
    const json = characterDocIO.toJson(TEMPLATE_A);
    const parsed = characterDocIO.parse(json);
    expect(parsed).toEqual(TEMPLATE_A);
  });

  it("未知フィールドが保持される", () => {
    const doc = structuredClone(TEMPLATE_A) as typeof TEMPLATE_A & Record<string, unknown>;
    doc["x_custom"] = "preserved";
    const json = characterDocIO.toJson(doc);
    const parsed = characterDocIO.parse(json) as Record<string, unknown>;
    expect(parsed["x_custom"]).toBe("preserved");
  });

  it("未来バージョンでエラー", () => {
    const raw = { ...TEMPLATE_A, formatVersion: 9999 };
    expect(() => characterDocIO.parse(JSON.stringify(raw))).toThrow(
      "新しいバージョンのファイルです",
    );
  });

  it("formatVersion欠落でエラー", () => {
    const { formatVersion: _, ...rest } = TEMPLATE_A;
    expect(() => characterDocIO.parse(JSON.stringify(rest))).toThrow("formatVersion");
  });
});
