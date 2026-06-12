import type { CharacterDoc } from "../core/schema/character.js";
import type { ProjectDoc, SceneDoc } from "../core/schema/project.js";
import type { CharResolver } from "./scene-eval.js";
import { evaluateActionTrack } from "./scene-eval.js";
import { HairSimulator } from "./hair-physics.js";
import type { Mat2D } from "./mat2d.js";
import { computeBoneWorld, headDecalMatrix } from "./pose.js";

const SEEK_DT = 1 / 60;

interface Entry {
  sim: HairSimulator;
  char: CharacterDoc; // 作り直し判定用
}

// シーン内キャラ要素の髪物理をまとめて進める。スクラブ時は t=0 から再構築
export class ScenePhysicsPool {
  #entries = new Map<string, Entry>();

  // 現在のシーンに存在しない要素のsimを破棄し、docが変わったものは作り直す
  #sync(scene: SceneDoc, resolver: CharResolver): void {
    const live = new Set<string>();
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      const char = resolver.getCharacter(el.ref);
      if (!char) continue;
      live.add(el.id);
      const entry = this.#entries.get(el.id);
      if (!entry || entry.char !== char) {
        this.#entries.set(el.id, { sim: new HairSimulator(char), char });
      }
    }
    for (const id of [...this.#entries.keys()]) {
      if (!live.has(id)) this.#entries.delete(id);
    }
  }

  // headMatrix を評価して1ステップ進める(再生中の連続フレーム用)
  #stepAt(scene: SceneDoc, t: number, dt: number): void {
    for (const el of scene.elements) {
      if (el.kind !== "character") continue;
      const entry = this.#entries.get(el.id);
      if (!entry) continue;
      const frame = evaluateActionTrack(el.actions, t);
      const bones = computeBoneWorld(entry.char, frame.pose);
      const hm = headDecalMatrix(bones);
      // Phase 4a: 仮想速度は常に [0,0](moveTo未実装)
      if (hm) entry.sim.step(hm, dt, [0, 0]);
    }
  }

  advance(
    _project: ProjectDoc,
    scene: SceneDoc,
    tPrev: number,
    tNow: number,
    resolver: CharResolver,
  ): void {
    this.#sync(scene, resolver);
    const dt = tNow - tPrev;
    if (dt <= 0) return;
    this.#stepAt(scene, tNow, dt);
  }

  // スクラブ: 全simをreset()し、t=0から固定刻みで再構築
  seek(
    _project: ProjectDoc,
    scene: SceneDoc,
    t: number,
    resolver: CharResolver,
  ): void {
    this.#sync(scene, resolver);
    for (const entry of this.#entries.values()) entry.sim.reset();
    if (t <= 0) return;
    let tt = 0;
    while (tt < t - 1e-6) {
      const dt = Math.min(SEEK_DT, t - tt);
      tt += dt;
      this.#stepAt(scene, tt, dt);
    }
  }

  deforms(elementId: string): Map<string, Mat2D> | undefined {
    return this.#entries.get(elementId)?.sim.getDeforms();
  }
}
