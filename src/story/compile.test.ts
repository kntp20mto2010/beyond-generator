import { describe, it, expect } from "vitest";
import { compile } from "./compile.js";
import { ProjectDocSchema } from "../core/schema/project.js";
import type {
  BalloonElement,
  CharacterElement,
  ProjectDoc,
  SceneDoc,
} from "../core/schema/project.js";
import { classroomStory, walkThenTalkStory } from "./__fixtures.js";
import refProjectJson from "../../project.byp.json" with { type: "json" };

function chars(scene: SceneDoc): CharacterElement[] {
  return scene.elements.filter(
    (e): e is CharacterElement => e.kind === "character",
  );
}
function balloons(scene: SceneDoc): BalloonElement[] {
  return scene.elements.filter(
    (e): e is BalloonElement => e.kind === "balloon",
  );
}

describe("compile: ProjectSchema 適合", () => {
  it("compile(story) は ProjectDocSchema.parse を通る", () => {
    const proj = compile(classroomStory);
    expect(() => ProjectDocSchema.parse(proj)).not.toThrow();
    expect(proj.formatVersion).toBe(1);
    expect(proj.stage).toEqual({ w: 1920, h: 1080, fps: 30 });
    expect(proj.title).toBe("学校の日常 第1話");
  });
});

describe("compile: 自動シーン尺は全イベントを覆う(回帰)", () => {
  it("末尾の表情だけショット(リアクション)も尺に含まれ発火する", () => {
    // classroomStory の末尾 shot は { who:hana, emotion:surprised }(逐次=末尾配置)
    const proj = compile(classroomStory);
    const scene = proj.scenes[0]!;
    let maxT = 0;
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      for (const a of el.actions) maxT = Math.max(maxT, a.t);
      for (const ex of el.expressions) maxT = Math.max(maxT, ex.t);
      for (const tk of el.talks ?? []) maxT = Math.max(maxT, tk.t);
    }
    // 全イベント(最後の surprised 表情含む)が尺の内側にある
    expect(scene.duration).toBeGreaterThanOrEqual(maxT);
  });
});

describe("compile: 決定論(バイト一致10回)", () => {
  it("同一 Story → JSON.stringify がバイト一致(10回反復)", () => {
    const first = JSON.stringify(compile(classroomStory));
    for (let i = 0; i < 10; i++) {
      expect(JSON.stringify(compile(classroomStory))).toBe(first);
    }
  });

  it("seed は scene index、id は決定論導出(乱数でない)", () => {
    const proj = compile(classroomStory);
    expect(proj.scenes[0]!.seed).toBe(0);
    expect(proj.scenes[0]!.id).toBe("scene-1");
    // id 省略時は title ハッシュ。再実行で同じ
    expect(compile(classroomStory).id).toBe(proj.id);
    expect(proj.id).toMatch(/^story-[0-9a-f]{8}$/);
  });
});

describe("compile: 不変条件 balloon.enter.delay === 話者 talk.t", () => {
  function assertInvariant(proj: ProjectDoc): number {
    let checked = 0;
    for (const scene of proj.scenes) {
      const bs = balloons(scene);
      const cs = chars(scene);
      for (const b of bs) {
        // delay と一致する talk.t を持つ話者が存在する
        const match = cs.some((c) =>
          c.talks.some((t) => t.t === b.enter.delay),
        );
        expect(match).toBe(true);
        checked++;
      }
    }
    return checked;
  }

  it("全 line balloon で delay==talk.t(教室シーン)", () => {
    const n = assertInvariant(compile(classroomStory));
    expect(n).toBeGreaterThan(0);
  });

  it("歩いて話すシーンでも成立", () => {
    assertInvariant(compile(walkThenTalkStory));
  });
});

describe("compile: 4トラック同期展開", () => {
  it("line shot は talk/action/balloon を同一 t0 から生成", () => {
    const proj = compile(classroomStory);
    const scene = proj.scenes[0]!;
    const cs = chars(scene);
    const bs = balloons(scene);
    // hana(template-b, z=1)が最初の話者
    const hana = cs.find((c) => c.ref === "builtin:template-b")!;
    expect(hana.talks).toHaveLength(1);
    expect(hana.actions[0]!.clip).toBe("talk1");
    expect(hana.actions[0]!.t).toBe(hana.talks[0]!.t);
    // balloon[0] が hana の talk と同 t0
    expect(bs[0]!.enter.delay).toBe(hana.talks[0]!.t);
    expect(bs[0]!.text).toBe("今日、体育あるよね?");
  });

  it("emotion 指定で expression を同 t0 に出す", () => {
    const proj = compile(classroomStory);
    const haru = chars(proj.scenes[0]!).find(
      (c) => c.ref === "builtin:template-a",
    )!;
    // mood neutral@0 + line の emotion smile@talk.t
    expect(haru.expressions[0]).toEqual({ t: 0, preset: "neutral" });
    const smile = haru.expressions.find((e) => e.preset === "smile");
    expect(smile).toBeDefined();
    expect(smile!.t).toBe(haru.talks[0]!.t);
    expect(haru.actions[0]!.clip).toBe("talk2");
  });

  it("silent:true は talk/action を出さず balloon のみ", () => {
    const story = {
      ...classroomStory,
      scenes: [
        {
          ...classroomStory.scenes[0]!,
          shots: [{ who: "hana", line: "無音セリフ", silent: true, speed: 1 }],
        },
      ],
    };
    const proj = compile(story);
    const scene = proj.scenes[0]!;
    expect(balloons(scene)).toHaveLength(1);
    const hana = chars(scene).find((c) => c.ref === "builtin:template-b")!;
    expect(hana.talks).toHaveLength(0);
  });
});

describe("compile: 全 t は 1/30s グリッド", () => {
  it("action/talk/expression/balloon.delay が量子化済み", () => {
    const proj = compile(classroomStory);
    const q = (t: number) => Math.abs(t * 30 - Math.round(t * 30)) < 1e-9;
    for (const scene of proj.scenes) {
      for (const c of chars(scene)) {
        for (const a of c.actions) expect(q(a.t)).toBe(true);
        for (const t of c.talks) expect(q(t.t)).toBe(true);
        for (const e of c.expressions) expect(q(e.t)).toBe(true);
      }
      for (const b of balloons(scene)) expect(q(b.enter.delay)).toBe(true);
    }
  });
});

describe("compile: 歩いて到着→喋る(別ショット, after:prev)", () => {
  it("walk action 後に line が prevEnd 基準で並ぶ", () => {
    const proj = compile(walkThenTalkStory);
    const c = chars(proj.scenes[0]!)[0]!;
    const walk = c.actions.find((a) => a.clip === "walk");
    expect(walk).toBeDefined();
    expect(walk!.moveTo).toBeDefined();
    // talk は walk より後の t
    expect(c.talks[0]!.t).toBeGreaterThan(walk!.t);
  });
});

// ---------------------------------------------------------------------------
// §6 構造同型: project.byp.json scenes[2] と要素種別列・話者balloon対応・clip種別
// ---------------------------------------------------------------------------

describe("§6 構造同型(scenes[2])", () => {
  const ref = refProjectJson as unknown as ProjectDoc;
  const refScene = ref.scenes[2]!;

  const compiled = compile(classroomStory).scenes[0]!;

  it("要素種別の集合(character×2, balloon×2)が一致", () => {
    const kindCount = (s: SceneDoc) => {
      const m: Record<string, number> = {};
      for (const e of s.elements) m[e.kind] = (m[e.kind] ?? 0) + 1;
      return m;
    };
    const refC = kindCount(refScene);
    const myC = kindCount(compiled);
    expect(myC.character).toBe(refC.character); // 2
    expect(myC.balloon).toBe(refC.balloon); // 2
  });

  it("キャラ ref と z 順が一致(template-a z0, template-b z1)", () => {
    const refChars = chars(refScene).sort((a, b) => a.z - b.z);
    const myChars = chars(compiled).sort((a, b) => a.z - b.z);
    expect(myChars.map((c) => c.ref)).toEqual(refChars.map((c) => c.ref));
  });

  it("flipX(template-a=false, template-b=true)が一致", () => {
    const byRef = (s: SceneDoc, ref: string) =>
      chars(s).find((c) => c.ref === ref)!;
    for (const r of ["builtin:template-a", "builtin:template-b"]) {
      expect(byRef(compiled, r).transform.flipX).toBe(
        byRef(refScene, r).transform.flipX,
      );
    }
  });

  it("話者-balloon 対応(各 balloon の delay が話者 talk.t と一致)が両者で成立", () => {
    for (const s of [refScene, compiled]) {
      for (const b of balloons(s)) {
        const ok = chars(s).some((c) =>
          c.talks.some((t) => Math.abs(t.t - b.enter.delay) < 1e-3),
        );
        expect(ok).toBe(true);
      }
    }
  });

  it("balloon テキストと順序(発話順)が一致", () => {
    const refTexts = balloons(refScene)
      .sort((a, b) => a.enter.delay - b.enter.delay)
      .map((b) => b.text);
    const myTexts = balloons(compiled)
      .sort((a, b) => a.enter.delay - b.enter.delay)
      .map((b) => b.text);
    expect(myTexts).toEqual(refTexts);
  });

  it("talk clip 種別(template-a=talk2, template-b=talk1)が一致", () => {
    const talkClip = (s: SceneDoc, ref: string) => {
      const c = chars(s).find((x) => x.ref === ref)!;
      return c.actions.find((a) => a.clip === "talk1" || a.clip === "talk2")
        ?.clip;
    };
    expect(talkClip(compiled, "builtin:template-a")).toBe(
      talkClip(refScene, "builtin:template-a"),
    );
    expect(talkClip(compiled, "builtin:template-b")).toBe(
      talkClip(refScene, "builtin:template-b"),
    );
  });

  it("expression 種別(template-a: neutral→smile, template-b: smile→surprised)が一致", () => {
    const presets = (s: SceneDoc, ref: string) =>
      chars(s)
        .find((c) => c.ref === ref)!
        .expressions.sort((a, b) => a.t - b.t)
        .map((e) => e.preset);
    expect(presets(compiled, "builtin:template-a")).toEqual(
      presets(refScene, "builtin:template-a"),
    );
    expect(presets(compiled, "builtin:template-b")).toEqual(
      presets(refScene, "builtin:template-b"),
    );
  });

  it("talk t の昇順関係(template-b が先, template-a が後)が一致", () => {
    const firstTalk = (s: SceneDoc, ref: string) =>
      chars(s).find((c) => c.ref === ref)!.talks[0]!.t;
    const refOrder =
      firstTalk(refScene, "builtin:template-b") <
      firstTalk(refScene, "builtin:template-a");
    const myOrder =
      firstTalk(compiled, "builtin:template-b") <
      firstTalk(compiled, "builtin:template-a");
    expect(myOrder).toBe(refOrder);
  });

  it("transition は wipe(scenes[0] でないとき Story の transition を反映)", () => {
    // classroomStory は単一シーンなので別途多シーンで検証
    const multi = {
      ...classroomStory,
      scenes: [
        { ...classroomStory.scenes[0]!, transition: "cut" as const },
        {
          ...classroomStory.scenes[0]!,
          transition: "wipe" as const,
        },
      ],
    };
    const p = compile(multi);
    expect(p.scenes[0]!.transition.type).toBe("cut"); // scenes[0] は常に cut
    expect(p.scenes[1]!.transition.type).toBe("wipe");
  });
});
