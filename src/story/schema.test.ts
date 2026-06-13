import { describe, it, expect } from "vitest";
import { parseStory, StorySchema } from "./schema.js";

const minimalStory = {
  format: "byond-story/1",
  title: "テスト",
  scenes: [
    {
      cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
      shots: [{ who: "a", line: "こんにちは", emotion: "smile" }],
    },
  ],
};

describe("StorySchema", () => {
  it("最小構成の Story を通す", () => {
    const story = parseStory(minimalStory);
    expect(story.format).toBe("byond-story/1");
    expect(story.scenes).toHaveLength(1);
    // default が補完される
    expect(story.defaults.charPerSec).toBe(5.5);
    expect(story.defaults.groundY).toBe(700);
    expect(story.scenes[0]!.hold).toBe(0.5);
  });

  it("JSON 文字列も受け取る", () => {
    const story = parseStory(JSON.stringify(minimalStory));
    expect(story.title).toBe("テスト");
  });

  it("語彙外 clip(fly)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
          shots: [{ who: "a", line: "x", clip: "fly" }],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("語彙外 emotion(excited)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
          shots: [{ who: "a", line: "x", emotion: "excited" }],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("語彙外 do(fly)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
          shots: [{ who: "a", do: "fly" }],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("語彙外 mood(epic)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "center", mood: "epic" }],
          shots: [],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("語彙外 transition(zoom)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          transition: "zoom",
          cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
          shots: [],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("語彙外 balloon.shape(square)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "center" }],
          shots: [{ who: "a", line: "x", balloon: { shape: "square" } }],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("不正な place 名(middle)を reject する", () => {
    const bad = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: "middle" }],
          shots: [],
        },
      ],
    };
    expect(() => parseStory(bad)).toThrow();
  });

  it("座標オブジェクトの place は許可", () => {
    const ok = {
      ...minimalStory,
      scenes: [
        {
          cast: [{ id: "a", ref: "builtin:template-a", at: { x: 500, y: 700 } }],
          shots: [],
        },
      ],
    };
    expect(() => parseStory(ok)).not.toThrow();
  });

  it("format リテラルが違うと reject", () => {
    expect(() => parseStory({ ...minimalStory, format: "byond-story/2" })).toThrow();
  });

  it("scenes が空だと reject", () => {
    expect(() => parseStory({ ...minimalStory, scenes: [] })).toThrow();
  });

  it("StorySchema は全49語彙 enum を持つ", () => {
    // enum 拘束が効いていることの構造確認(parse 経路)
    const r = StorySchema.safeParse(minimalStory);
    expect(r.success).toBe(true);
  });
});
