import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";
import { decompile } from "./decompile.js";
import { classroomStory, walkThenTalkStory } from "./__fixtures.js";
import type { Story } from "./schema.js";

// 意味フィールドだけを抜き出す(id / default 補完 / 採時の差は無視)
function shotMeaning(s: {
  who?: string;
  line?: string;
  clip?: string;
  emotion?: string;
  caption?: string;
}) {
  const out: Record<string, string> = {};
  if (s.line !== undefined) out.line = s.line;
  if (s.clip !== undefined) out.clip = s.clip;
  if (s.emotion !== undefined) out.emotion = s.emotion;
  if (s.caption !== undefined) out.caption = s.caption;
  return out;
}

describe("decompile(compile(story)) は構造同型 Story", () => {
  it("教室シーン: cast 数・shot 数・意味フィールドが一致", () => {
    const back = decompile(compile(classroomStory));
    const orig = classroomStory.scenes[0]!;
    const got = back.scenes[0]!;

    expect(got.cast).toHaveLength(orig.cast.length);
    // ref は完全一致(cast id は ref 由来になる=許容差)
    expect(got.cast.map((c) => c.ref)).toEqual(orig.cast.map((c) => c.ref));
    // mood は ProjectDoc の t=0 expression から復元
    const hanaBack = got.cast.find((c) => c.ref === "builtin:template-b")!;
    expect(hanaBack.mood).toBe("smile");
    expect(hanaBack.face).toBe("left");

    // shots: 意味フィールドが順序込みで一致
    expect(got.shots.map(shotMeaning)).toEqual(orig.shots.map(shotMeaning));
  });

  it("balloon の話者対応(who)が round-trip で保たれる", () => {
    const back = decompile(compile(classroomStory));
    const got = back.scenes[0]!;
    // who は cast id(ref 由来)で復元される
    const lineShots = got.shots.filter((s) => s.line !== undefined);
    expect(lineShots[0]!.who).toBe("template-b"); // hana
    expect(lineShots[1]!.who).toBe("template-a"); // haru
  });

  it("bg / transition が復元される", () => {
    const back = decompile(compile(classroomStory));
    expect(back.scenes[0]!.bg).toBe("assets/backgrounds/bg-classroom-001.svg");
  });

  it("色背景(#hex)も round-trip", () => {
    const back = decompile(compile(walkThenTalkStory));
    expect(back.scenes[0]!.bg).toBe("#88ccee");
  });

  it("voice 連番は省略される(再コンパイルで同番)", () => {
    const back = decompile(compile(classroomStory));
    const lineShots = back.scenes[0]!.shots.filter((s) => s.line !== undefined);
    // vo-001, vo-002 の連番なので voice は省略される
    for (const s of lineShots) expect(s.voice).toBeUndefined();
  });

  it("再 compile した結果も ProjectDoc 構造が安定(二重 round-trip)", () => {
    const proj1 = compile(classroomStory);
    const story2: Story = decompile(proj1);
    const proj2 = compile(story2);
    // 要素種別の並びが一致
    const kinds = (p: typeof proj1) =>
      p.scenes[0]!.elements.map((e) => e.kind);
    expect(kinds(proj2)).toEqual(kinds(proj1));
  });

  it("複数シーンの transition(scenes[0]=cut, scenes[1]=wipe)を復元", () => {
    const multi = {
      ...classroomStory,
      scenes: [
        { ...classroomStory.scenes[0]!, transition: "cut" as const },
        { ...classroomStory.scenes[0]!, transition: "wipe" as const },
      ],
    };
    const back = decompile(compile(multi));
    expect(back.scenes[0]!.transition).toBe("cut");
    expect(back.scenes[1]!.transition).toBe("wipe");
  });
});
