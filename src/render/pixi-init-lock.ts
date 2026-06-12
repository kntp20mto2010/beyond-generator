// Pixi v8 の Application.init / autoDetectRenderer は並行実行すると
// 内部初期化(extensions・shader system)が混線し、片方のレンダラーが
// 何も描画しなくなることがある(ThumbnailService と StageCanvas の同時マウントで実踏)。
// 全ての Pixi 初期化をこの直列ロック経由にすること。
let chain: Promise<unknown> = Promise.resolve();

export function withPixiInitLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
