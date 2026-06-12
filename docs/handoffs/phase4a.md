# Phase 4a ハンドオフ: シーンエディタ・コア(設計: fable5 → 実装: opus)

## ゴール(受入条件)

ブラウザのシーン編集タブで: **3シーンの紙芝居(キャラ2体+背景色+テキスト)を組んで、シーン単独再生と通し再生ができる**。
- キャラを置く→アクション(クリップ)と表情をタイムライン上の時刻に割り当てる→enter/exit効果を付ける→再生ヘッドでスクラブ→▶再生
- すべての編集がundo可能。保存→再読込で完全復元
- テスト全green(既存136+新規)

スコープ外(Phase 4b以降): 小道具/画像背景、カメラ、右クリックメニュー、スナップ、Replace、吹き出し、moveTo移動、シーントランジション(通し再生はカット切替)、音声。

## 設計原則(06仕様の核)

**シーン相対タイム**: 全タイミングはシーン内相対(t=0=シーン開始)。グローバルタイムラインは存在しない。シーンの並べ替え・複製が他シーンに影響しない。

**評価器が唯一の真実**: `evaluateScene(project, scene, t, resolver)` が「時刻tのシーンの絵」を完全決定する純関数(物理を除く)。プレビューも将来の書き出しもこれを通る。

## A. スキーマ拡張(src/core/schema/project.ts)

formatVersionは1のまま(加算的変更、既存ファイルはdefaultで埋まる)。

```ts
const TransformSchema = z.object({
  x: z.number(), y: z.number(),
  scale: z.number().positive().default(1),
  flipX: z.boolean().default(false),
}).passthrough();

const EffectTypeSchema = z.enum(["cut", "fade", "slideL", "slideR", "slideT", "slideB", "pop"]);
const EnterSchema = z.object({
  type: EffectTypeSchema.default("cut"),
  delay: z.number().min(0).default(0),
  dur: z.number().min(0).default(0.4),
}).passthrough();
const ExitSchema = z.object({
  type: EffectTypeSchema.default("cut"),
  at: z.number().nullable().default(null),   // null = シーン末まで居る
  dur: z.number().min(0).default(0.4),
}).passthrough();

const ActionSchema = z.object({
  t: z.number().min(0),
  clip: z.string(),                  // CLIPSのid
  speed: z.number().positive().default(1),
}).passthrough();
const ExpressionKeySchema = z.object({
  t: z.number().min(0),
  preset: z.string(),                // EXPRESSION_PRESETSのキー
}).passthrough();

const CharacterElementSchema = z.object({
  id: z.string(), kind: z.literal("character"),
  ref: z.string(),                   // "builtin:template-a" | "characters/<id>.byc.json"
  transform: TransformSchema,
  z: z.number().default(0),
  enter: EnterSchema.default({}), exit: ExitSchema.default({}),
  actions: z.array(ActionSchema).default([]),
  expressions: z.array(ExpressionKeySchema).default([]),
}).passthrough();

const TextElementSchema = z.object({
  id: z.string(), kind: z.literal("text"),
  text: z.string(),
  size: z.number().positive().default(48),
  color: z.string().default("#2E2A33"),
  strokeColor: z.string().nullable().default(null),  // 縁取り(null=なし)
  strokeWidth: z.number().min(0).default(6),
  transform: TransformSchema,
  z: z.number().default(100),
  enter: EnterSchema.default({}), exit: ExitSchema.default({}),
}).passthrough();

const SceneElementSchema = z.discriminatedUnion("kind", [CharacterElementSchema, TextElementSchema]);
```

SceneDoc拡張: `background: z.object({ color: z.string() }).passthrough().nullable().default(null)`(null=紙色 #f4f1ec)、`elements: z.array(SceneElementSchema).default([])`。既存の `duration / durationMode / seed` は維持。

## B. シーン評価器(src/runtime/scene-eval.ts — 本フェーズの心臓)

### アクション列の純関数評価(action-track)

ClipPlayer(ステートフル)はプレビュー専用。シーンは**スクラブ可能**でなければならないので純関数で:

```ts
// clip-player.ts から blendFrames と smoothstep を export し再利用すること
export function evaluateActionTrack(actions: readonly Action[], t: number): ClipFrame
```

- 暗黙の先頭アクション: `{ t: 0, clip: "idle", speed: 1 }`(t=0に明示アクションがあればそれが優先)
- active = `a.t <= t` を満たす最後のアクション。クリップローカル時刻 = `(t - a.t) * a.speed`
- **クロスフェード**: `t - active.t < 0.22` かつ直前アクションが存在する場合、直前クリップ(その継続時刻で評価)と smoothstep ブレンド
- 非ループクリップは最終姿勢保持(sampleClipの既存仕様)
- 同時刻に複数アクションがある場合は配列順の後勝ち

### 要素の可視性とenter/exit効果

```ts
interface ElementVisual {
  visible: boolean;
  alpha: number;          // 0..1
  offset: [number, number]; // ステージ座標の加算オフセット
  scaleMul: number;       // transform.scaleに乗算
}
export function evaluateEffect(enter: Enter, exit: Exit, sceneDuration: number, t: number): ElementVisual
```

- 可視窓: `enter.delay <= t < (exit.at ?? Infinity) + exit.dur`(cut exitはexit.atちょうどで消える)
- enter進行 p = clamp((t - delay) / dur, 0, 1)(cutはp=1)
  - fade: alpha = p
  - slideL/R: offset.x = ∓(1260) * (1 - quadOut(p))(画面外から。slideLは左から=負側から入る)
  - slideT/B: offset.y = ∓(840) * (1 - quadOut(p))
  - pop: scaleMul = backOut(p)、alpha = min(1, p * 3)
- exit進行 q = clamp((t - at) / dur, 0, 1): 同効果を逆向き(fadeはalpha=1-q、slideは出ていく方向=enterと同じ側へ戻る、popは縮む)
- イージングは runtime/easing.ts を再利用

### シーンフレーム

```ts
export interface SceneFrameItem {
  elementId: string;
  z: number;
  visual: ElementVisual;
  payload:
    | { kind: "character"; char: CharacterDoc; items: RenderItem[]; flipX: boolean; transform: Transform }
    | { kind: "text"; el: TextElement; transform: Transform };
}
export function evaluateScene(project, scene, t, resolver, opts?: { hairDeforms?: Map<elementId, Map<string, Mat2D>> }): SceneFrameItem[]
```

- character: evaluateActionTrack → pose → computeBoneWorld → 表情(`expressions`の`t<=t`最後、default neutral)+ まばたき(`blinkAt`、seed = `scene.seed * 31 + 要素index`、要素ごとに `mulberry32` と schedule を都度生成して決定論を守る)→ buildRenderList(face, handShape, hairDeform)
- z昇順ソートで返す。resolver未解決のキャラは `{kind:"text"}` 扱いのプレースホルダではなく**スキップせず**、グレーの矩形+名前で描けるよう `payload.kind: "placeholder"` を足してもよい(任意)

### 髪物理(src/runtime/scene-physics.ts)

```ts
export class ScenePhysicsPool {
  // elementId → HairSimulator。キャラdocが変わったら作り直し
  advance(project, scene, tPrev, tNow, resolver): void  // 再生中: 1フレーム進める(各キャラのheadDecalMatrixを評価して step)
  seek(project, scene, t, resolver): void               // スクラブ: 全simをreset()し、t=0からdt=1/60刻みでadvanceを繰り返して再構築
  deforms(elementId): Map<string, Mat2D> | undefined
}
```
- 仮想速度はPhase 4aでは常に[0,0](moveTo未実装のため。実移動はrootの実速度が拾う…も無いので髪は主にクリップのバウンスで揺れる)
- seekはシーン長10秒でも600ステップ程度。十分速いが、ドラッグ中は間引いて呼ぶ(pointerup時だけseekでも可)

## C. プロジェクトコマンド(src/core/commands-project.ts 新設)

すべて既存DocStore.dispatchで。mergeKey規約は既存に倣う:

```
addScene / removeScene / duplicateScene(深複製+新id) / moveScene(index入替) / setSceneDuration / setSceneBackground
addElement(sceneId, element) / removeElement / updateElementTransform(mergeKey: `el:${id}:tf`) / setElementZ
setElementEnter / setElementExit
addAction / updateAction(index, patch) / removeAction   // 追加後は t 昇順にソートして保持
addExpressionKey / updateExpressionKey / removeExpressionKey // 同上
setTextProps(textの内容・サイズ・色等, mergeKey)
```

既存 commands.ts(setTitle等)は温存。AppShellの「プロジェクト読込」は dispatch でなく **DocStore.reset()** に変更(Phase 0からの持ち越し改善。履歴を持ち越さない)。

## D. キャラ解決(src/io/asset-resolver.ts)

```ts
export class AssetResolver {
  // "builtin:template-a" は即解決。"characters/*.byc.json" は fs から非同期ロードしてキャッシュ
  getCharacter(ref): CharacterDoc | undefined          // 同期(キャッシュのみ)
  ensureLoaded(refs: string[], fs): Promise<void>      // 未解決をまとめてロード(parse は characterDocIO)
  subscribe(cb): unsubscribe                            // ロード完了通知(ステージ再描画用)
}
```

## E. UI(src/editor/scene/ — AppShellを置き換え)

```
┌ ツールバー: [フォルダを開く][保存] タイトル | ↩ ↪ | ▶シーン再生 ▶通し再生 ⏹ | ●未保存
├─────────┬──────────────────────────────┬──────────────┐
│ 追加パネル  │ ステージ(Pixi, 960×540で1920×1080を表示) │ プロパティパネル    │
│ [キャラ▼]  │  - evaluateSceneの結果を描画              │ 選択要素:         │
│  ハル(内蔵) │  - クリック選択(枠表示)、ドラッグ移動        │  transform数値     │
│  保存済一覧 │  - Delete削除                            │  scale/flipX/z    │
│ [テキスト]  │  - 背景色                                │  enter/exit編集    │
│ [背景色■]  │                                          │  actions一覧+追加  │
│           │                                          │  expressions一覧   │
│           │                                          │  (テキスト時: 内容/ │
│           │                                          │   サイズ/色/縁取り) │
├─────────┴──────────────────────────────┴──────────────┤
│ シーン帯: [1][2][3][+] (選択/複製/削除/←→移動)                          │
│ タイムライン: ルーラー(0..duration, 再生ヘッドドラッグでスクラブ)            │
│   要素ごとに1行: 名前 | enter▸ | アクションチップ(t位置に配置,クリック選択) | ◂exit │
│   シーン長: [6.0]秒                                                   │
└──────────────────────────────────────────────────────┘
```

実装ノート:
- ステージはPixi 1パス: `evaluateScene` → 要素ごとにContainer(キャラはCharacterView流用可、ただし要素数が少ないのでbuildCharacterContainerの毎フレーム再構築でも可。**再生中はCharacterView方式を推奨**)。テキストはPixi Text(stroke対応)
- 再生: app.ticker。`playing: {mode: "scene"|"all", t}` をrefで管理。tがduration超で次へ(allの場合)/停止。スクラブはルーラーpointerでt設定+physics.seek
- ステージのドラッグは**累積デルタを開始時transformに適用**(複利バグ禁止。EditCanvas参照)
- 選択状態・再生状態はReact state+ref(ticker用)。doc変更はコマンド経由のみ
- ステージ座標系: 1920×1080を0.5スケール表示。クリック座標→ステージ座標変換ユーティリティ
- キャラ追加時の初期値: x=960, y=700, scale=0.9, z=要素数, enter=cut
- テキスト追加初期値: text="テキスト", size=64, x=960, y=200, 縁取り白8
- アクション追加UI: クリップselect(CLIPS)+時刻入力。表情も同様(EXPRESSION_PRESETS)
- 通し再生中はシーン帯の現在シーンをハイライト
- 既存AppShell.tsxは削除し、App.tsxはScenePage(新)を シーン編集 タブにマウント。プロジェクトstoreはApp.tsxのモジュールレベルのものを移譲(現状維持でprops渡し)

## F. テスト(vitest)

1. evaluateActionTrack: 暗黙idle / アクション切替のクロスフェード連続性 / speed / 非ループ保持(純関数なので同入力同出力)
2. evaluateEffect: 可視窓(delay前は不可視、exit後は不可視)/ fadeのalpha / slideのoffsetが0に収束 / popのscale / cut exitの瞬時消滅
3. evaluateScene: 2要素のz順 / 表情キーの時刻選択 / まばたき決定論(同seedで同結果)
4. commands-project: addElement/removeElementのundo / updateElementTransformのmerge / duplicateSceneが新idを持つ深複製 / アクションのtソート
5. スキーマ: 要素入りシーンのround-trip(serialize-character.test.tsに倣う)+ 旧形式(elements無し)ファイルがdefaultで開ける

## 落とし穴

- まばたきscheduleは**評価のたびに使い捨て配列を渡す**か要素毎にキャッシュ(blinkAtはscheduleを伸ばす副作用がある。同じ配列を異なるseedで使い回すと壊れる)
- exit.at は シーン相対秒の絶対値。シーン長変更でexitがduration超になる場合は「exitなし」と同じ扱い(クランプしない)
- discriminatedUnionとpassthroughの併用は既存ShapeSchemaパターンを踏襲
- transformのflipXはコンテナscaleX反転で実装(PosePreviewの反転実装参照)。テキストには適用しない
- Pixi Textのstrokeはv8では `style: { stroke: { color, width } }`
- 再生ヘッドのスクラブ中のphysics.seekは重い場合 pointerup のみで可
- 「プロジェクト読込はreset()」へ変更時、AppShellの既存テストは無い(UIテストなし)が、シーンタブの保存/読込フローを必ず手動確認
- docs/ 変更禁止、git操作禁止、UIラベル日本語、コードコメント最小限、strict+noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build の結果、追加・変更ファイルツリー、受入フロー(3シーン構築→通し再生)を自分でどう確認したか、逸脱と理由、既知の制限。
