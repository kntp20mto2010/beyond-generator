# Phase 4b-2 ハンドオフ: 編集UX(設計: fable5 → 実装: opus)

右クリックメニュー / スナップ / Replace / ロック / 吹き出し / ショートカット。
前提: Phase 4b-1(moveTo・カメラ・トランジション・画像FS解決)は実装済み。stage-coordsの `screenToStage(px, py, cam)` / `stageToScreen` を必ず使うこと。

## ゴール(受入条件)

1. ステージ右クリックで コピー/ペースト/複製/反転/順序(4種)/整列(6種)/ロック/差し替え/削除 が機能し、**すべてundo可能**
2. ドラッグ中に中央線・3分割線・他要素エッジへ吸着し、ガイド線が表示される。Shiftで無効。ツールバーのトグルでグリッド+セーフエリア常時表示
3. **Replace**: キャラを別キャラに差し替えても transform・enter/exit・アクション・表情がそのまま生きて再生できる
4. 吹き出し3種(角丸/雲/トゲ)を配置でき、テキスト内包、しっぽ先端をステージ上でドラッグできる
5. ショートカット: Ctrl+C/V/D、Ctrl+L、矢印±1px / Shift+矢印±10px、[ / ] で背面/前面
6. テスト全green(既存+新規)。旧プロジェクトファイルが開ける

## 実装前に読むこと

docs/handoffs/phase4a.md と phase4b-1-runtime.md(前提)、src/core/schema/project.ts、src/core/commands-project.ts、src/editor/scene/ 全部、src/runtime/scene-eval.ts(SceneFramePayload)、src/io/asset-resolver.ts。

## A. スキーマ(project.ts — formatVersion 1のまま加算的)

- Character/Text/Balloon全要素に `locked: z.boolean().default(false)`
- 吹き出し:

```ts
export const BalloonElementSchema = z.object({
  id: z.string(), kind: z.literal("balloon"),
  shape: z.enum(["round", "cloud", "spike"]).default("round"),
  text: z.string(),
  size: z.number().positive().default(40),        // フォントサイズ
  w: z.number().positive().default(420),
  h: z.number().positive().default(240),
  fill: z.string().default("#ffffff"),
  textColor: z.string().default("#2E2A33"),
  lineColor: z.string().default("#2E2A33"),
  lineWidth: z.number().min(0).default(4),
  tail: z.object({ x: z.number(), y: z.number() }).default({ x: -60, y: 220 }), // しっぽ先端(要素ローカル座標)
  transform: TransformSchema,
  z: z.number().default(200),
  enter: EnterSchema.default({}), exit: ExitSchema.default({}),
}).passthrough();
```

- SceneElementSchemaのdiscriminatedUnionに追加。scene-eval: `SceneFramePayload` に `{ kind: "balloon"; el: BalloonElement; transform: Transform }` を追加(text同様パススルー。enter/exit効果は既存evaluateEffectがそのまま効く)

## B. 吹き出し描画(src/render/balloon.ts 新設 + StageCanvas applyItem拡張)

```ts
export function drawBalloon(g: Graphics, el: BalloonElement): void  // 本体+しっぽ。中心(0,0)にw×h
```

- **描画順(線の継ぎ目を消す定石)**: ①しっぽ三角形をfill+stroke → ②本体をfill+stroke → ③しっぽ三角形を本体fill色でもう一度fillのみ(本体側の線を消し、しっぽの外側2辺の線だけ残る)。①と③のしっぽは同一頂点
- しっぽ頂点: 先端 = (tail.x, tail.y)。基部2点 = 本体中心から先端方向ベクトルに垂直に ±max(18, w*0.06) 離した点を中心寄り(中心から先端へ30%の位置)に取る
- round: `roundRect(-w/2, -h/2, w, h, min(w,h)*0.22)`
- cloud: 本体楕円(w×h)の輪郭に沿ってこぶ円8〜10個をfill+strokeで先に描き、最後に楕円本体をfillのみで上塗り(内側の線を消す)
- spike: 16頂点の星形ポリゴン(外接 w/2,h/2、内側×0.78)
- テキスト: applyItem側でPixi Textを子に。`anchor 0.5`、style: `{ fontSize: el.size, fill: el.textColor, wordWrap: true, wordWrapWidth: el.w - 48, breakWords: true, align: "center" }`(**breakWords必須 — 日本語はスペースが無く折り返せない**)
- applyItem: balloonブランチ追加(Graphics+Textをcontainerに保持、ElViewに `balloon?: { g: Graphics; text: Text }`)。flipXは適用しない(テキスト同様)
- 追加UI: AddPanelに「吹き出し」セクション(3形状ボタン)。初期値 x=620, y=300, text="セリフ"
- PropertyPanel: balloon選択時 — shape select / テキスト(textarea)/ w/h / フォントサイズ / 地色・文字色・線色。コマンドは `setBalloonProps`(setTextProps相当、mergeKey `el:${id}:balloon`)
- **しっぽドラッグ**: 選択中balloonのしっぽ先端に小ハンドル(白丸+青枠、半径7px スクリーン座標)をapp.stage直下に描画。pointerdownがハンドル上(半径10px以内)なら要素ドラッグではなくtailドラッグ(ローカル座標へ逆変換: stage座標→(stage - transform.xy) / scale。flipXは無いので不要)。コマンド `setBalloonTail(sceneId, elementId, tail)` mergeKey `el:${id}:tail`
- Timeline: balloonのアイコン💬+テキスト表示。locked要素は名前の前に🔒

## C. 右クリックメニュー(src/editor/scene/ContextMenu.tsx 新設 + StageCanvas / ScenePage 配線)

- StageCanvasのcanvasに `contextmenu` リスナ: preventDefault → ヒットテスト(既存pointerdownのヒット判定を関数に抽出して共用。**locked要素はヒット対象外**)→ 要素上なら選択して要素メニュー、空白なら空白メニュー。メニュー要求は `onContextMenu(info)` でScenePageへ(clientX/Y、対象elementId | null)
- ContextMenuはReactでposition:fixed(clientX/Y、画面右端・下端でクランプ)。外側mousedown / Escで閉じる。サブメニューはホバーで右展開
- 要素メニュー: コピー / ペースト / 複製 / 反転(キャラのみ表示)/ 順序▸(最前面へ・前面へ・背面へ・最背面へ)/ 整列▸(左・中央・右 / 上・中・下)/ ロック / 差し替え▸(キャラのみ。後述)/ 削除
- 空白メニュー: ペースト(クリップボード空ならdisabled)/ 全ロック解除
- **クリップボード**: src/editor/scene/clipboard.ts のモジュールレベル変数(`SceneElement | null`)。コピー=structuredClone。ペースト=structuredClone+新id+x,y+24(右クリック時はメニュー位置のstage座標に配置)。シーンを跨いでペースト可(シーン相対タイムなのでそのまま成立)
- 整列: コマンド追加せず、UI側で現在のPixi bounds(ステージ座標に換算)から必要シフトを計算して `updateElementTransform` を呼ぶ(整列先: ステージ 0 / 960 / 1920、0 / 540 / 1080 にboundsの端/中心を合わせる)

## D. コマンド(commands-project.ts)

```
duplicateElement(sceneId, elementId)        // 深複製+新id、x,y+24、z=既存max+1
reorderElement(sceneId, elementId, op: "front" | "forward" | "backward" | "back")
  // z昇順の並び(同zはstable)で対象を移動 → 全要素の z を index で再正規化。1 dispatch = 1 undo
setElementLocked(sceneId, elementId, locked)
unlockAllElements(sceneId)
replaceElementRef(sceneId, elementId, ref)  // kind==="character" のみ。ref以外に一切触らない
setBalloonProps(sceneId, elementId, patch, mergeKey?)   // setTextProps相当
setBalloonTail(sceneId, elementId, tail)                // mergeKey `el:${id}:tail`
```

ペーストは既存addElementで足りる(呼び出し側でid/offset処理)。

## E. スナップ(src/editor/scene/snap.ts 新設 — 純関数 + StageCanvas統合)

```ts
export interface Edges { l: number; cx: number; r: number; t: number; cy: number; b: number }
export interface SnapGuide { axis: "v" | "h"; pos: number }   // ステージ座標の線
export function computeSnap(
  moving: Edges, others: readonly Edges[], threshold: number,
): { dx: number; dy: number; guides: SnapGuide[] }
```

- 候補X: ステージ線 {0, 640, 960, 1280, 1920} + セーフエリア {96, 1824} + 各otherの {l, cx, r}。movingの {l, cx, r} それぞれと比較し**最小距離**のペアがthreshold(12)以内なら dx = candidate − movingEdge。Y同様({0, 360, 540, 720, 1080} + {54, 1026} + others)
- 同距離はステージ線優先。X/Yは独立に判定。ヒットした候補線をguidesに
- StageCanvas統合: ドラッグ開始時に対象のbounds(ステージ座標)とtransformの差を記録 → onMoveで `予測bounds = 開始bounds + 生デルタ` → computeSnap(他要素=lastFrameの可視要素から自分とlocked以外) → **transform = 開始transform + 生デルタ + (dx, dy)**(常に開始値起点。複利禁止)。`me.shiftKey` でスナップ無効
- ガイド描画: app.stage直下のGraphicsに、guidesを `stageToScreen` で換算して1pxマゼンタ(#E64A8D)線。pointerupで消す
- グリッドトグル: ツールバーにトグルボタン「グリッド」。ON時、root内(ステージ座標)に3分割線+中央線(細线 #5B7DB1 alpha 0.25)とセーフエリア矩形(1828×972 中央、破線不可なら実線 alpha 0.35)を描く専用Graphics(bgの上・要素の下)

## F. ロック

- ステージのヒットテスト(クリック / ドラッグ / 右クリック)からlocked要素を除外。タイムラインのレーン名クリックでは選択可能(既存のまま)
- 選択中のlocked要素: 選択枠は描くがドラッグ開始を無視。PropertyPanelは「🔒 ロック中」表示+「ロック解除」ボタンのみ(他の入力は隠すかdisable)
- Ctrl+L: 選択要素のロックをトグル

## G. Replace(差し替え)

- ScenePageで保存済キャラ一覧(AddPanelのfs.listFiles("characters")ロジック)をstateへ引き上げ、AddPanelとContextMenuの両方に渡す
- 右クリック「差し替え▸」: ハル(内蔵)+保存済一覧。選択 → `replaceElementRef` → `resolver.ensureLoaded([ref], fs)` → bumpSeek(物理作り直しは#syncのchar比較が自動でやる)
- 差し替え後もアクション/表情/enter/exit/transformが維持されること(コマンドがrefしか触らないので自動成立。テストで保証)

## H. ショートカット(ScenePageのonKey拡張)

既存(Ctrl+Z系 / Delete / Space)に追加。typing中ガードは既存踏襲:

- Ctrl+C: コピー、Ctrl+V: ペースト(+24オフセット)、Ctrl+D: 複製(**preventDefault** — ブックマーク防止)
- Ctrl+L: ロックトグル(**preventDefault** — アドレスバー防止)
- 矢印: 選択要素を±1px、Shift+矢印: ±10px(updateElementTransform、mergeKeyで連打マージ。locked時は無効)
- [ / ]: reorderElement backward / forward

## I. テスト(vitest)

1. スキーマ: balloon入りシーンのround-trip / locked省略の旧ファイルがdefault falseで開ける
2. commands: duplicateElementの新id+オフセット / reorderElementの4操作とz正規化(同z混在から開始しても順序が安定)+undoが1回で戻る / setElementLocked / unlockAllElements / replaceElementRefがref以外を変えない(transform・actions・expressionsの深い等価を確認)
3. computeSnap: 中央線吸着 / 他要素エッジ吸着 / threshold外で非吸着 / 複数候補の最近傍選択 / X/Y独立 / guides内容
4. クリップボード: コピー→ペーストで新id・元と独立(深複製)

## 落とし穴

- スナップ補正は**開始transform+生デルタ+スナップ補正**の形(progress.md記載の複利バグを再導入しない)
- contextmenuイベントはpreventDefault必須。メニューはclientX/Yそのまま(canvas座標と混同しない)。ヒットテストだけstage座標
- structuredCloneで複製(参照共有するとundo patchが壊れる)
- ペースト新idを忘れると描画ビューのMapが衝突
- reorderElementの正規化はz昇順stable sortの順序で0..n-1を振り直し(キャラz=index・テキストz=100+規約は廃止してよい。新規追加時の初期zは「既存max+1」に変更)
- discriminatedUnion拡張で applyItem / Timeline / PropertyPanel / ヒットテスト等のswitchにballoon分岐漏れがないか(TSのexhaustive checkを活用)
- balloonのtailはローカル座標(transform.scaleの影響下)。ハンドルのヒット判定はスクリーン座標で
- Pixi Textのstyle変更は再代入(v8)。wordWrapWidthはw変更に追従
- しっぽハンドルとguides・選択枠はapp.stage直下(rootに入れるとzoomで太さが変わる)
- カメラzoom中の右クリック位置→stage座標も `screenToStage(px, py, cam)` 経由
- PixiのuseEffect([])はHMRで再実行されない — フルリロードしてから確認
- docs/ 変更禁止、git操作禁止、UIラベル日本語、コードコメント最小限、strict+noUncheckedIndexedAccess準拠

## 完了報告に含めること

npm test / npm run build の結果(件数)、追加・変更ファイルツリー、受入条件1〜6をどう確認したか、逸脱と理由、既知の制限。
