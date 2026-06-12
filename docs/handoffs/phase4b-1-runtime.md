# Phase 4b-1 ハンドオフ: ランタイム拡張(設計: fable5 → 実装: opus)

moveTo歩行移動 / カメラ / シーントランジション / 画像背景のFS解決。
Phase 4b-2(右クリック・スナップ・Replace・吹き出し)は別セッション。本セッションでは触らない。

## ゴール(受入条件)

1. walkアクションに移動先を付けるとキャラが**歩いて移動**し、到着後idleに戻り、移動方向を自動で向く。移動中は髪が実速度で揺れる
2. カメラキー2つでパン/ズームが滑らかに動き、スクラブでも再生でも同じ絵。ズーム中もクリック選択・ドラッグが正しい
3. 通し再生でシーン境界に fade / wipe / slide トランジションが見える
4. プロジェクトフォルダ(FS Access)に置いた画像が背景に使える(devサーバー配信パス外)。リポジトリ内蔵パスも従来どおり動く
5. 旧プロジェクトファイル(camera/transition/moveTo無し)がdefaultで開ける。テスト全green(既存188+新規)

## 実装前に読むこと

docs/handoffs/phase4a.md(前提知識)、src/core/schema/project.ts、src/runtime/scene-eval.ts、src/runtime/clip-player.ts、src/runtime/scene-physics.ts、src/runtime/hair-physics.ts(stepの仮想速度の意味)、src/runtime/easing.ts、src/core/commands-project.ts、src/io/fs.ts、src/io/asset-resolver.ts、src/editor/scene/(ScenePage / StageCanvas / PropertyPanel / AddPanel / stage-coords)、src/presets/clips/index.ts(virtualVelocity: walk=240, run=580, 他=0)

## A. スキーマ(src/core/schema/project.ts — formatVersion 1のまま加算的)

```ts
// ActionSchema に追加
moveTo: z.object({ x: z.number(), y: z.number().optional() }).passthrough().optional(),
// y省略 = 開始時のyを維持(横移動)

export const CameraKeySchema = z.object({
  t: z.number().min(0),
  x: z.number(),            // カメラ中心(ステージ座標)
  y: z.number(),
  zoom: z.number().positive().default(1),
  ease: z.string().optional(),  // EasingName。未指定=quadInOut(clip.tsのease列と同様、文字列で緩く保持)
}).passthrough();

export const TransitionSchema = z.object({
  type: z.enum(["cut", "fade", "wipe", "slide"]).default("cut"),
  dur: z.number().min(0).default(0.5),
}).passthrough();
```

SceneDoc: `camera: z.array(z.unknown())` → `z.array(CameraKeySchema).default([])`、
`transition: TransitionSchema.default({})` を追加。**transitionの意味 = 「前シーンからこのシーンへの切替効果」**。scenes[0]のtransitionは無視(常にcut)。

## B. moveTo評価(src/runtime/scene-eval.ts)

### アクション展開(本パートの心臓)

```ts
interface ExpandedAction {
  t: number; clip: string; speed: number;
  from: [number, number];      // このアクション開始時の位置
  to: [number, number];        // 到達点(moveTo無しなら from と同じ)
  travelEnd: number;           // 到着時刻(moveTo無しなら t)
}
export function expandActions(origin: [number, number], actions: readonly Action[]): ExpandedAction[]
```

- normalizedActions(暗黙idle先頭・t昇順)を踏襲した上で、先頭から位置を畳み込む:
  - 移動速度 v = `(clipのvirtualVelocity || 240) * speed`(virtualVelocity=0のクリップにmoveToが付いた場合は240でフォールバック)
  - travelDur = dist(from→to) / v。dist=0なら移動なし扱い(ゼロ除算禁止)
  - **打ち切り**: 次アクションの開始 next.t < travelEnd の場合、到達点 = lerp(from, to, (next.t - t) / travelDur)。次アクションの from はその点
  - **到着idle**: travelEnd < 次アクション開始(または次が無い)かつ移動があった場合、travelEnd に暗黙アクション `{ t: travelEnd, clip: "idle", speed: 1, from: to, to, travelEnd }` を挿入(到着で歩きが止まる。既存クロスフェード0.22sが自然に効く)
- `evaluateActionTrack` はこの展開済み列で評価するようシグネチャ変更: `evaluateActionTrack(origin: [number, number], actions: readonly Action[], t: number): ClipFrame`(scene-physicsと既存テストの呼び出しも更新)

### 位置・向き・速度

```ts
export function evaluateCharMotion(el: CharacterElement, t: number): {
  pos: [number, number];
  facing: 1 | -1;          // 1=右向き(素), -1=反転
  vel: [number, number];   // px/s。移動中のみ非ゼロ
}
```

- pos: アクティブなExpandedActionで、t < travelEnd なら lerp(from, to, (t - a.t) / travelDur)、以降は to
- facing: **tまでに発生した最後の水平移動の方向**(dx<0 → -1)。一度も移動が無ければ `el.transform.flipX ? -1 : 1`。到着後も向きは維持(すぐ振り返らない)
- vel: 移動中は (to - from) / travelDur、それ以外 [0,0]
- evaluateCharacterの戻りpayloadのtransformを**実効値**に: `{ ...el.transform, x: pos[0], y: pos[1], flipX: facing === -1 }`(StageCanvasは無変更で動く)。moveToを持つアクションが1つも無い要素は従来と完全に同じ値になること

### 髪物理(scene-physics.ts)

`#stepAt` の `sim.step(hm, dt, [0, 0])` を `evaluateCharMotion` の vel に置換。hair-physics.tsのstepを読み、仮想速度の座標系(ワールドかローカルか・符号)を確認して合わせること。flipX反転中はx速度の符号反転が必要かをコードから判断(プレビューのPosePreview/ClipSheetでのvirtualVelocityの渡し方が参考になる)。判断根拠を完了報告に書くこと。

## C. カメラ(src/runtime/scene-eval.ts + StageCanvas)

```ts
export interface CameraState { x: number; y: number; zoom: number }
export function evaluateCamera(keys: readonly CameraKey[], t: number): CameraState
```

- キー無し → `{ x: 960, y: 540, zoom: 1 }`。t≤最初のキー → 最初の値。t≥最後 → 最後の値
- 区間補間: `ease(key_i.ease as EasingName ?? "quadInOut", k)` で x/y/zoom を補間(t昇順ソートして評価)
- **evaluateSceneには混ぜない**(戻り型を壊さない)。呼び出し側が別途呼ぶ

### StageCanvasへの適用

- root(world)の変換: `root.scale.set(STAGE_SCALE * cam.zoom)`、`root.position.set(VIEW_W/2 - cam.x * cam.zoom * STAGE_SCALE, VIEW_H/2 - cam.y * cam.zoom * STAGE_SCALE)`。毎フレームrenderFrame内で適用
- zoom<1でステージ外が見える場合は紙色のまま(背景色矩形は1920×1080のまま。許容)
- **座標変換を一元化**(stage-coords.ts): `screenToStage(px, py, cam)` に拡張 — `stageX = (px - VIEW_W/2) / (STAGE_SCALE * cam.zoom) + cam.x`。逆関数 `stageToScreen` も追加(4b-2のガイド描画で使う)。pointerdownのヒットテスト/ドラッグのデルタ換算をすべてこれ経由に
- **selection(選択枠)はrootからapp.stage直下へ移動**: boundsはapp.stage座標で返るので、`/STAGE_SCALE` 換算を全削除してb.x等をそのまま使う(zoomしても枠の太さが一定になる)。ヒットテストのbounds判定はスクリーン座標側で行うよう書き換えると換算が消えて簡潔

### UI(最小限)

- PropertyPanel: **要素未選択時に「シーン設定」を表示**(現状は「要素を選択してください」のみ)— トランジション(type select + dur)、カメラキー一覧(t/x/y/zoom数値 + ease select(EASINGSのキー) + 削除)+「現在時刻にキー追加」ボタン(ScenePageから再生ヘッドtをpropsで渡す。追加値は現在の評価済みカメラ)
- アクション編集(PropertyPanel既存のactions一覧)に「移動先 X/Y」入力を追加。空欄=移動なし。クリア手段必須(下記コマンド注意参照)
- Timeline: カメラキーがあるシーンは要素レーンの上に1行「📷 カメラ」レーンを出し、キー位置にマーカー(クリック動作は不要、表示のみ)

## D. シーントランジション(StageCanvas)

snapshot方式(2シーン同時評価はしない):

- 通し再生(mode="all")でシーン末に達した時、**次シーンのtransition.typeがcut以外なら**、`renderFrame(scene, scene.duration)` 直後に `app.renderer.extract.texture(...)` でapp.stage全体(カメラ込みの見た目)をテクスチャ化し、Spriteとしてapp.stage最前面に置いてから `onReachEnd` を呼ぶ(Pixi v8のextract APIは型定義で確認)
- 以降のticker(新シーン再生中)、進行 p = clamp(新シーン相対t / transition.dur, 0, 1) で:
  - fade: snapshot.alpha = 1 - p
  - wipe: snapshotにGraphicsマスク(可視域 = x ∈ [p*VIEW_W, VIEW_W] の矩形。新シーンが左から現れる)。マスクGraphicsもstageにaddChildしておくこと
  - slide: snapshot.x = -p * VIEW_W、同時にrootのposition.xへ `(1-p) * VIEW_W` を加算(新シーンが右から押し込む=プッシュ)
- p≥1 でsnapshot Sprite除去+texture.destroy(true)(リーク禁止)。再生停止(⏹)時も破棄
- シーン単独再生・スクラブではトランジションは描画しない
- **通し再生中は選択枠を描かない**(snapshotに枠が写り込むのも防ぐ。再生開始時にonSelect(null)でも可)

## E. 画像背景のFS解決(io/fs.ts + io/asset-resolver.ts + StageCanvas + AddPanel)

- FileSystemAdapterに `readBinaryFile(relPath: string): Promise<ArrayBuffer | null>` を追加(FsAccess: file.arrayBuffer()。MemoryAdapter: バイナリ用Mapを追加しテスト可能に)
- AssetResolverに画像解決を追加:
  ```ts
  getImageUrl(path: string): string | undefined          // 同期(キャッシュのみ)
  ensureImagesLoaded(paths: readonly string[], fs: FileSystemAdapter | null): Promise<void>
  ```
  - 解決順: fs.readBinaryFile → Blob → URL.createObjectURL。失敗時 `fetch(encodeURI("/" + path))` → blob → objectURL(リポジトリ内蔵パスのフォールバック)。両方失敗でfailed記録
  - ロード完了で既存の#notify(ステージ再描画)。invalidate()で画像failedもクリア+objectURLをrevokeしてキャッシュ破棄
- StageCanvas.updateBgImage: `imgEl.src = encodeURI("/" + want)` を `resolver.getImageUrl(img)` ベースに変更。**未解決の間はスキップし、解決後に再試行される構造に**(bgImgKey比較を「パス+URL有無」にする等。resolverRevの変化でrenderFrameは走る)
- ScenePage: キャラのensureLoadedと同じuseEffectで、全シーンのbackground.imageを集めて `ensureImagesLoaded` を呼ぶ
- AddPanel: 背景画像セクションに **プロジェクトフォルダの `assets/bg/` 一覧**(fs.listFiles、拡張子 .png/.jpg/.jpeg/.webp)をボタン表示して選択可能に。既存の手入力欄も残す(リポジトリ内蔵 assets/generated/... 用)

## F. コマンド(commands-project.ts)

```
addCameraKey(sceneId, key) / updateCameraKey(sceneId, index, patch) / removeCameraKey(sceneId, index)
  // 追加・更新後は t 昇順ソート。updateのmergeKey: `cam:${sceneId}:${index}`
setSceneTransition(sceneId, patch: Partial<Transition>)   // mergeKey: `trans:${sceneId}`
```

updateActionの注意: moveToの**解除**は `patch.moveTo === undefined` かつ `"moveTo" in patch` のとき `delete action.moveTo` する処理を追加(Object.assignだとキーが残る)。

## G. テスト(vitest)

1. expandActions/evaluateCharMotion: 等速移動の中間位置 / 到着後の静止と暗黙idleがポーズに効く(evaluateActionTrackがidleのポーズを返す)/ 打ち切り(移動中に次アクション開始 → 位置連続)/ facing(左移動で-1、到着後も維持、移動なしはtransform.flipX準拠)/ virtualVelocity=0クリップのフォールバック / speed=2で所要時間半分 / moveTo無し要素は従来評価と完全一致
2. evaluateCamera: キー無しデフォルト / 1キー / 2キー中間値 / ease指定 / 範囲外クランプ / 未ソート入力
3. スキーマ: camera+transition+moveTo付きシーンのround-trip / 旧形式(これら無し)がdefaultで開ける
4. commands: カメラキーCRUD+undo+tソート / setSceneTransition / updateActionでmoveTo付与→解除
5. resolver画像: MemoryAdapter(readBinaryFile実装)で ensureImagesLoaded → getImageUrl。**URL.createObjectURL / fetch はNode環境に無い(またはjsdom未実装)ので vi.stubGlobal でモック**(既存vitest環境がnodeかjsdomかを確認してから書く)

## 落とし穴

- evaluateActionTrackのシグネチャ変更はscene-physics.ts・既存テスト(scene-eval.test.ts / clip-player.test.ts)へ波及。全更新
- 位置評価に Date.now()/Math.random() 禁止(純関数。スクラブ・書き出しの決定論)
- expandActionsはアクション毎に毎フレーム呼ばれる。配列生成は許容(要素数が小さい)が、O(n²)にしない
- カメラ導入後のドラッグは「開始時transform + (現在stage座標 - 開始stage座標)」の形を維持(複利バグ禁止)。ドラッグ中にカメラが動くことはない(再生中はドラッグしない)が、座標変換は毎回その時点のcamで
- snapshotのextractは前シーンの絵が**まだstageに居るうち**に。onReachEnd呼び出し前
- texture.destroyとSprite除去をstop()/シーン選択変更でも必ず(リーク)
- updateBgImageの「ロード完了前にスキップ→完了後に再適用」を忘れると初回だけ背景が出ない
- objectURLはinvalidate時にURL.revokeObjectURL
- PixiのuseEffect([])はHMRで再実行されない — エフェクト系変更後はブラウザをフルリロードしてから確認(progress.md記載の実踏バグ)
- formatVersionは1のまま。スキーマはすべてdefault付き加算
- docs/ 変更禁止、git操作禁止、UIラベル日本語、コードコメント最小限、strict+noUncheckedIndexedAccess準拠

## 完了報告に含めること

npm test / npm run build の結果(件数)、追加・変更ファイルツリー、髪物理の速度符号の判断根拠、受入条件1〜5をどう確認したか、逸脱と理由、既知の制限。
