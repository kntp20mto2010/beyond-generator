import type { SceneElement } from "../../core/schema/project.js";

// シーン要素のクリップボード(モジュールレベル)。シーンを跨いでペースト可。
let clip: SceneElement | null = null;

export function copyElement(el: SceneElement): void {
  clip = structuredClone(el);
}

export function hasClipboard(): boolean {
  return clip !== null;
}

// ペースト用に複製を取り出す(新id付与・位置調整は呼び出し側)。空なら null
export function readClipboard(): SceneElement | null {
  return clip ? structuredClone(clip) : null;
}
