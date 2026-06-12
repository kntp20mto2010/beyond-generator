import { describe, expect, it } from "vitest";
import type { CharacterElement, ProjectDoc, SceneDoc } from "../core/schema/project.js";
import { createEmptyProject, createEmptyScene } from "../core/schema/project.js";
import { TEMPLATE_A } from "../presets/characters/template-a.js";
import type { CharResolver } from "./scene-eval.js";
import { ScenePhysicsPool } from "./scene-physics.js";

const resolver: CharResolver = {
  getCharacter: (ref) => (ref === "builtin:template-a" ? TEMPLATE_A : undefined),
};

function build(): { project: ProjectDoc; scene: SceneDoc } {
  const project = createEmptyProject();
  const scene = createEmptyScene(0);
  scene.duration = 6;
  const el: CharacterElement = {
    id: "c1",
    kind: "character",
    ref: "builtin:template-a",
    transform: { x: 960, y: 700, scale: 0.9, flipX: false },
    z: 0,
    locked: false,
    enter: { type: "cut", delay: 0, dur: 0.4 },
    exit: { type: "cut", at: null, dur: 0.4 },
    actions: [{ t: 0, clip: "jump", speed: 1 }],
    expressions: [],
  };
  scene.elements = [el];
  project.scenes.push(scene);
  return { project, scene };
}

describe("ScenePhysicsPool", () => {
  it("seek は決定論的(同 t で同じ deforms)", () => {
    const { project, scene } = build();
    const a = new ScenePhysicsPool();
    const b = new ScenePhysicsPool();
    a.seek(project, scene, 0.7, resolver);
    b.seek(project, scene, 0.7, resolver);
    const da = a.deforms("c1");
    const db = b.deforms("c1");
    expect(da !== undefined || db !== undefined).toBe(true);
    // 同じキー集合・同じ行列
    const keys = new Set([...(da?.keys() ?? []), ...(db?.keys() ?? [])]);
    for (const k of keys) {
      expect(da?.get(k)).toEqual(db?.get(k));
    }
  });

  it("seek(0) は静止(deformsは空または極小)", () => {
    const { project, scene } = build();
    const pool = new ScenePhysicsPool();
    pool.seek(project, scene, 0, resolver);
    const d = pool.deforms("c1");
    // reset直後は変形なし → getDeforms は REST_EPS 以下を除外して空
    expect(d?.size ?? 0).toBe(0);
  });

  it("シーンから消えた要素のsimは破棄される", () => {
    const { project, scene } = build();
    const pool = new ScenePhysicsPool();
    pool.seek(project, scene, 0.5, resolver);
    expect(pool.deforms("c1")).toBeDefined();
    scene.elements = [];
    pool.seek(project, scene, 0.5, resolver);
    expect(pool.deforms("c1")).toBeUndefined();
  });

  it("advance は dt<=0 で何もしない", () => {
    const { project, scene } = build();
    const pool = new ScenePhysicsPool();
    pool.seek(project, scene, 0.5, resolver);
    const before = pool.deforms("c1");
    pool.advance(project, scene, 0.5, 0.5, resolver);
    expect(pool.deforms("c1")).toEqual(before);
  });
});
