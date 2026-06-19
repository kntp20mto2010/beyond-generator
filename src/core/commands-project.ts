import type { Draft } from "immer";
import type { DocStore } from "./doc-store.js";
import { newId } from "./id.js";
import type {
  Action,
  BalloonElement,
  Bgm,
  CameraKey,
  Enter,
  Exit,
  ExpressionKey,
  ProjectDoc,
  SceneDoc,
  SceneElement,
  Talk,
  TextElement,
  Transform,
  Transition,
} from "./schema/project.js";
import { createEmptyScene } from "./schema/project.js";

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

function findScene(d: Draft<ProjectDoc>, sceneId: string): Draft<SceneDoc> | undefined {
  return d.scenes.find((s) => s.id === sceneId);
}

function findElement(
  d: Draft<ProjectDoc>,
  sceneId: string,
  elementId: string,
): Draft<SceneElement> | undefined {
  const scene = findScene(d, sceneId);
  return scene?.elements.find((e) => e.id === elementId);
}

function sortByT<T extends { t: number }>(arr: Draft<T>[]): void {
  arr.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// シーン操作
// ---------------------------------------------------------------------------

export function addScene(store: DocStore<ProjectDoc>): void {
  store.dispatch("シーン追加", (d) => {
    d.scenes.push(createEmptyScene(d.scenes.length) as Draft<SceneDoc>);
  });
}

export function removeScene(store: DocStore<ProjectDoc>, sceneId: string): void {
  store.dispatch("シーン削除", (d) => {
    const idx = d.scenes.findIndex((s) => s.id === sceneId);
    if (idx !== -1) d.scenes.splice(idx, 1);
  });
}

export function duplicateScene(store: DocStore<ProjectDoc>, sceneId: string): void {
  store.dispatch("シーン複製", (d) => {
    const idx = d.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const src = d.scenes[idx]!;
    // 深複製してから id を振り直す(要素idも一意に)
    const copy = JSON.parse(JSON.stringify(src)) as SceneDoc;
    copy.id = newId();
    copy.elements = copy.elements.map((el) => ({ ...el, id: newId() }));
    d.scenes.splice(idx + 1, 0, copy as Draft<SceneDoc>);
  });
}

export function moveScene(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  dir: -1 | 1,
): void {
  store.dispatch("シーン並べ替え", (d) => {
    const idx = d.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= d.scenes.length) return;
    const [moved] = d.scenes.splice(idx, 1);
    if (moved) d.scenes.splice(target, 0, moved);
  });
}

// シーンを toIndex へ移動(D&D並べ替え用)。1 dispatch = 1 undo、範囲外/同位置は無視
export function moveSceneTo(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  toIndex: number,
): void {
  store.dispatch("シーン並べ替え", (d) => {
    const from = d.scenes.findIndex((s) => s.id === sceneId);
    if (from === -1) return;
    if (toIndex < 0 || toIndex >= d.scenes.length) return;
    if (toIndex === from) return;
    const [moved] = d.scenes.splice(from, 1);
    if (moved) d.scenes.splice(toIndex, 0, moved);
  });
}

export function setSceneDuration(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  sec: number,
): void {
  store.dispatch(
    "シーン長変更",
    (d) => {
      const scene = findScene(d, sceneId);
      if (scene) scene.duration = sec;
    },
    { mergeKey: `dur:${sceneId}` },
  );
}

export function setSceneBackground(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  color: string | null,
): void {
  store.dispatch(
    "背景色変更",
    (d) => {
      const scene = findScene(d, sceneId);
      if (!scene) return;
      const image = scene.background?.image;
      if (color === null) {
        scene.background = image ? { image } : null;
      } else {
        scene.background = image ? { color, image } : { color };
      }
    },
    { mergeKey: `bg:${sceneId}` },
  );
}

export function setSceneBackgroundImage(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  image: string | null,
): void {
  store.dispatch(
    "背景画像変更",
    (d) => {
      const scene = findScene(d, sceneId);
      if (!scene) return;
      const color = scene.background?.color;
      if (image === null) {
        scene.background = color !== undefined ? { color } : null;
      } else {
        scene.background = color !== undefined ? { color, image } : { image };
      }
    },
    { mergeKey: `bgimg:${sceneId}` },
  );
}

// ---------------------------------------------------------------------------
// カメラキー / シーントランジション
// ---------------------------------------------------------------------------

export function addCameraKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  key: CameraKey,
): void {
  store.dispatch("カメラキー追加", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    scene.camera.push(key as Draft<CameraKey>);
    sortByT(scene.camera);
  });
}

export function updateCameraKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  index: number,
  patch: Partial<CameraKey>,
): void {
  store.dispatch(
    "カメラキー編集",
    (d) => {
      const scene = findScene(d, sceneId);
      if (!scene) return;
      const key = scene.camera[index];
      if (!key) return;
      Object.assign(key, patch);
      sortByT(scene.camera);
    },
    { mergeKey: `cam:${sceneId}:${index}` },
  );
}

export function removeCameraKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  index: number,
): void {
  store.dispatch("カメラキー削除", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    if (index >= 0 && index < scene.camera.length) scene.camera.splice(index, 1);
  });
}

export function setSceneTransition(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  patch: Partial<Transition>,
): void {
  store.dispatch(
    "トランジション変更",
    (d) => {
      const scene = findScene(d, sceneId);
      if (scene) Object.assign(scene.transition, patch);
    },
    { mergeKey: `trans:${sceneId}` },
  );
}

// ---------------------------------------------------------------------------
// 要素操作
// ---------------------------------------------------------------------------

export function addElement(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  element: SceneElement,
): void {
  store.dispatch("要素追加", (d) => {
    const scene = findScene(d, sceneId);
    if (scene) scene.elements.push(element as Draft<SceneElement>);
  });
}

export function removeElement(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
): void {
  store.dispatch("要素削除", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    const idx = scene.elements.findIndex((e) => e.id === elementId);
    if (idx !== -1) scene.elements.splice(idx, 1);
  });
}

export function updateElementTransform(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  patch: Partial<Transform>,
): void {
  store.dispatch(
    "位置変更",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el) Object.assign(el.transform, patch);
    },
    { mergeKey: `el:${elementId}:tf` },
  );
}

// オブジェクトのサイズをグリッド footprint(セル数)で設定。cells と、それに対応する
// contain scale(呼び出し側がカタログから算出)を同時に更新する。
export function setObjectSize(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  cells: { w: number; h: number },
  scale: number,
  snappedX?: number,
): void {
  store.dispatch("サイズ変更", (d) => {
    const el = findElement(d, sceneId, elementId);
    if (el && el.kind === "object") {
      el.cells = { w: cells.w, h: cells.h };
      el.transform.scale = scale;
      // 幅の偶奇が変わると中心の吸着位相も変わる(端を列線に乗せ続ける)
      if (snappedX !== undefined) el.transform.x = snappedX;
    }
  });
}

// オブジェクトの表示画像(variant)を別の view 用 src に切り替える。
// cells は新 variant のものに合わせ、scale も再計算。サイズ変更コマンドと同じく
// ステージ上での見た目が大きく変わるので別 dispatch にする。
export function setObjectView(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  newSrc: string,
  newCells: { w: number; h: number },
  newScale: number,
): void {
  store.dispatch("ビュー切替", (d) => {
    const el = findElement(d, sceneId, elementId);
    if (el && el.kind === "object") {
      el.src = newSrc;
      el.cells = { w: newCells.w, h: newCells.h };
      el.transform.scale = newScale;
    }
  });
}

export function setElementZ(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  z: number,
): void {
  store.dispatch("重なり順変更", (d) => {
    const el = findElement(d, sceneId, elementId);
    if (el) el.z = z;
  });
}

// 深複製 + 新id、x,y+24、z=既存max+1。複製要素のidを返す代わりに付与済み要素を push
export function duplicateElement(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
): void {
  store.dispatch("要素複製", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    const src = scene.elements.find((e) => e.id === elementId);
    if (!src) return;
    // draft(Proxy)は structuredClone 不可。duplicateScene と同じく JSON で深複製
    const copy = JSON.parse(JSON.stringify(src)) as SceneElement;
    copy.id = newId();
    copy.transform.x += 24;
    copy.transform.y += 24;
    const maxZ = scene.elements.reduce((m, e) => Math.max(m, e.z), -1);
    copy.z = maxZ + 1;
    scene.elements.push(copy as Draft<SceneElement>);
  });
}

export type ReorderOp = "front" | "forward" | "backward" | "back";

// z昇順(同zはstable)の並びで対象を移動 → 全要素のzをindexで再正規化。1 dispatch = 1 undo
export function reorderElement(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  op: ReorderOp,
): void {
  store.dispatch("重なり順変更", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    const els = scene.elements;
    // z昇順 stable（同zは元の配列順を保つ）
    const order = els
      .map((el, i) => ({ el, i }))
      .sort((a, b) => (a.el.z - b.el.z) || (a.i - b.i))
      .map((x) => x.el);
    const cur = order.findIndex((el) => el.id === elementId);
    if (cur === -1) return;
    let target = cur;
    if (op === "front") target = order.length - 1;
    else if (op === "back") target = 0;
    else if (op === "forward") target = Math.min(order.length - 1, cur + 1);
    else if (op === "backward") target = Math.max(0, cur - 1);
    if (target === cur) {
      // 位置不変でもzを正規化(同z混在の解消)
      order.forEach((el, idx) => {
        el.z = idx;
      });
      return;
    }
    const [moved] = order.splice(cur, 1);
    if (moved) order.splice(target, 0, moved);
    order.forEach((el, idx) => {
      el.z = idx;
    });
  });
}

export function setElementLocked(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  locked: boolean,
): void {
  store.dispatch(locked ? "ロック" : "ロック解除", (d) => {
    const el = findElement(d, sceneId, elementId);
    if (el) el.locked = locked;
  });
}

export function unlockAllElements(store: DocStore<ProjectDoc>, sceneId: string): void {
  store.dispatch("全ロック解除", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    for (const el of scene.elements) el.locked = false;
  });
}

// キャラ差し替え: kind==="character" のみ。ref 以外には一切触らない(タイミング・表情を維持)
export function replaceElementRef(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  ref: string,
): void {
  store.dispatch("キャラ差し替え", (d) => {
    const el = findElement(d, sceneId, elementId);
    if (el && el.kind === "character") el.ref = ref;
  });
}

export function setElementEnter(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  patch: Partial<Enter>,
): void {
  store.dispatch(
    "登場効果変更",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el) Object.assign(el.enter, patch);
    },
    { mergeKey: `el:${elementId}:enter` },
  );
}

export function setElementExit(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  patch: Partial<Exit>,
): void {
  store.dispatch(
    "退場効果変更",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el) Object.assign(el.exit, patch);
    },
    { mergeKey: `el:${elementId}:exit` },
  );
}

// ---------------------------------------------------------------------------
// アクション(キャラ要素)
// ---------------------------------------------------------------------------

function characterEl(
  d: Draft<ProjectDoc>,
  sceneId: string,
  elementId: string,
): Extract<Draft<SceneElement>, { kind: "character" }> | undefined {
  const el = findElement(d, sceneId, elementId);
  return el && el.kind === "character" ? el : undefined;
}

export function addAction(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  action: Action,
): void {
  store.dispatch("アクション追加", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    el.actions.push(action as Draft<Action>);
    sortByT(el.actions);
  });
}

export function updateAction(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
  patch: Partial<Action>,
): void {
  store.dispatch("アクション編集", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    const action = el.actions[index];
    if (!action) return;
    Object.assign(action, patch);
    // moveTo の解除: Object.assign では key が残るため明示削除
    if ("moveTo" in patch && patch.moveTo === undefined) delete action.moveTo;
    sortByT(el.actions);
  });
}

export function removeAction(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
): void {
  store.dispatch("アクション削除", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    if (index >= 0 && index < el.actions.length) el.actions.splice(index, 1);
  });
}

// 家具に座らせる: キャラを家具の座面へ移動 + 着座アクションを置き、家具の手前(z+1)へ。
// seat は家具画像の下端中央アンカー基準のオフセット(dy上負)。既存アクションは置換する。
// withTalk=true なら sit(腰を下ろす)→ sit-talk(座って話す) を並べ、着座後に発話の所作へ
// 移る。発話音声(talks)は別途付与すると口パクが音声に同期する。
export function sitCharacterOnObject(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  charId: string,
  objectId: string,
  seat: { dx: number; dy: number },
  withTalk = false,
): void {
  store.dispatch(withTalk ? "座って話す" : "座らせる", (d) => {
    const scene = findScene(d, sceneId);
    if (!scene) return;
    const ch = scene.elements.find((e) => e.id === charId);
    const obj = scene.elements.find((e) => e.id === objectId);
    if (!ch || ch.kind !== "character" || !obj || obj.kind !== "object") return;
    const s = obj.transform.scale;
    const dirX = obj.transform.flipX ? -1 : 1;
    ch.transform.x = obj.transform.x + seat.dx * dirX * s;
    ch.transform.y = obj.transform.y + seat.dy * s;
    ch.z = obj.z + 1;
    ch.actions = (
      withTalk
        ? [
            { t: 0, clip: "sit", speed: 1 },
            { t: 1, clip: "sit-talk", speed: 1 },
          ]
        : [{ t: 0, clip: "sit", speed: 1 }]
    ) as Draft<Action>[];
  });
}

// ---------------------------------------------------------------------------
// 表情キー(キャラ要素)
// ---------------------------------------------------------------------------

export function addExpressionKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  key: ExpressionKey,
): void {
  store.dispatch("表情追加", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    el.expressions.push(key as Draft<ExpressionKey>);
    sortByT(el.expressions);
  });
}

export function updateExpressionKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
  patch: Partial<ExpressionKey>,
): void {
  store.dispatch("表情編集", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    const key = el.expressions[index];
    if (!key) return;
    Object.assign(key, patch);
    sortByT(el.expressions);
  });
}

export function removeExpressionKey(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
): void {
  store.dispatch("表情削除", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    if (index >= 0 && index < el.expressions.length) el.expressions.splice(index, 1);
  });
}

// ---------------------------------------------------------------------------
// セリフ音声(キャラ要素)/ BGM(プロジェクト)
// ---------------------------------------------------------------------------

export function addTalk(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  talk: Talk,
): void {
  store.dispatch("セリフ音声追加", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    el.talks.push(talk as Draft<Talk>);
    sortByT(el.talks);
  });
}

export function updateTalk(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
  patch: Partial<Talk>,
): void {
  store.dispatch("セリフ音声編集", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    const talk = el.talks[index];
    if (!talk) return;
    Object.assign(talk, patch);
    sortByT(el.talks);
  });
}

export function removeTalk(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  index: number,
): void {
  store.dispatch("セリフ音声削除", (d) => {
    const el = characterEl(d, sceneId, elementId);
    if (!el) return;
    if (index >= 0 && index < el.talks.length) el.talks.splice(index, 1);
  });
}

// v1はBGM1本。bgm=null でクリア、Bgm で doc.bgm[0] を設定
export function setBgm(store: DocStore<ProjectDoc>, bgm: Bgm | null): void {
  store.dispatch(bgm ? "BGM設定" : "BGM解除", (d) => {
    d.bgm = bgm ? [bgm as Draft<Bgm>] : [];
  });
}

// ---------------------------------------------------------------------------
// テキスト要素プロパティ
// ---------------------------------------------------------------------------

export function setTextProps(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  patch: Partial<Omit<TextElement, "id" | "kind" | "transform" | "z" | "enter" | "exit">>,
  mergeKey?: string,
): void {
  store.dispatch(
    "テキスト編集",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el && el.kind === "text") Object.assign(el, patch);
    },
    { mergeKey: mergeKey ?? `el:${elementId}:text` },
  );
}

// ---------------------------------------------------------------------------
// 吹き出し要素
// ---------------------------------------------------------------------------

export function setBalloonProps(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  patch: Partial<
    Omit<BalloonElement, "id" | "kind" | "transform" | "z" | "locked" | "enter" | "exit" | "tail">
  >,
  mergeKey?: string,
): void {
  store.dispatch(
    "吹き出し編集",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el && el.kind === "balloon") Object.assign(el, patch);
    },
    { mergeKey: mergeKey ?? `el:${elementId}:balloon` },
  );
}

export function setBalloonTail(
  store: DocStore<ProjectDoc>,
  sceneId: string,
  elementId: string,
  tail: { x: number; y: number },
): void {
  store.dispatch(
    "しっぽ移動",
    (d) => {
      const el = findElement(d, sceneId, elementId);
      if (el && el.kind === "balloon") el.tail = tail;
    },
    { mergeKey: `el:${elementId}:tail` },
  );
}
