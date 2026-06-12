# Phase 2b ハンドオフ: 表情編集UI・髪物理UI・コンタクトシートCLI(設計: fable5 → 実装: sonnet)

## ゴール(受入条件)

1. 顔スロットの**シェイプバリアント**(neutral以外)をエディタで追加・編集でき、ポーズプレビューの表情切替に即反映される
2. 髪ストランド選択時に**物理パラメータスライダ**が出て、▶走り再生中にリアルタイムで揺れ方が変わる
3. `npm run contactsheet` で **ポーズ4種×表情6種のグリッドPNG** が exports/ に出力される(テンプレ/任意の.byc.json両対応)
4. 既存テスト88件を壊さず、新規テスト追加で全green

## A. 顔バリアント編集

### SlotRef拡張(src/editor/character/slot-ref.ts)

```ts
{ kind: "face"; slot: string; variant?: string }   // 省略時 "neutral"
```
- `refKey`: `face:${slot}:${variant ?? "neutral"}`
- `getShapes`: `face[slot].shapes[variant ?? "neutral"]`
- `listSlotRefs` は従来通り**スロット毎に1エントリ**(variant: undefined)を返す。バリアント選択はUI側の状態で、選択中refのvariantを差し替える
- `mirrorLR`(face): **同じvariant名**を相手スロットへミラーコピー(無ければ作成)

### 新コマンド(src/core/commands-character.ts)

```ts
addFaceVariant(store, slot, name, copyFromNeutral = true)  // neutralの複製 or 空[]で作成
removeFaceVariant(store, slot, name)                        // name === "neutral" は拒否(no-op)
```
updateShape/addShape/removeShape/movePin は ref.variant を尊重するよう修正。

### UI(CharacterEditorPage)

顔スロット選択時、シェイプ一覧の上に**バリアントチップ行**を表示:

- チップ = 「既存バリアント ∪ そのスロットがプリセット10種から参照される名前」の和集合
  - 参照名はrentime層に定数として追加: `src/runtime/expression.ts` に `export function referencedShapeNames(slot: string): string[]`(EXPRESSION_PRESETS を走査して slot が使う名前を返す。browL→[up, angryIn, sadOut, worried] 等)
  - 既存 = 実線チップ(クリックで編集対象切替)、未作成 = 破線チップ(クリックで addFaceVariant して切替)
- 選択中バリアントの「×削除」ボタン(neutralには出さない)
- 注記表示: 「未作成のバリアントは表情時 neutral にフォールバック」

### EditCanvas: ゴースト表示

variant ≠ neutral を編集中、**そのスロットのneutralシェイプを薄く(opacity 0.2・操作不可)重ね描き**して位置合わせの基準にする。

## B. 髪物理パラメータUI

### プリセット定数(src/presets/hair-presets.ts)

```ts
export const HAIR_PHYSICS_PRESETS: Record<string, { label: string } & StrandPhysics> = {
  short:  { label: "ショート",     stiffness: .7,  damping: .85, inertia: .45, maxAngle: 12, gravity: .08, segments: 1 },
  bob:    { label: "ボブ",        stiffness: .55, damping: .8,  inertia: .6,  maxAngle: 18, gravity: .15, segments: 1 },
  long:   { label: "ロング",      stiffness: .35, damping: .75, inertia: .8,  maxAngle: 30, gravity: .3,  segments: 2 },
  pony:   { label: "ポニーテール", stiffness: .45, damping: .7,  inertia: .85, maxAngle: 38, gravity: .45, segments: 2 },
  ahoge:  { label: "アホ毛",      stiffness: .25, damping: .55, inertia: .9,  maxAngle: 45, gravity: .05, segments: 2 },
};
```

### コマンド

```ts
updateStrandPhysics(store, ref /* kind:"hair" */, patch: Partial<StrandPhysics>, mergeKey?)
```

### UI

hairストランド選択時、右パネルのピンの下に「揺れ(物理)」セクション:
- スライダ: stiffness / damping / inertia / gravity(0..1, step 0.05)、maxAngle(0..60, step 1)
- segments: 1 / 2 トグル
- プリセットボタン行(5種) → 一括適用
- 各スライダは mergeKey `physics:${refKey}:${param}` でドラッグ中1履歴
- ヒント文: 「▶走り再生中に動かすと揺れがリアルタイムで変わります」(実際PosePreviewはdoc変更でsim再生成するので動く)

## C. コンタクトシートCLI

### ページ(src/editor/character/ContactSheetPage.tsx + src/App.tsx のハッシュルート)

- `location.hash === "#contact-sheet"` のとき、タブUI無しでこのページのみ描画(App.tsxで分岐。リアクティブなルーティング不要、初回判定のみ)
- キャラの入手順: ①`window.__loadContactSheetChar(json: string)` がCLIから呼ばれたらそれを使い再描画 ②なければ `localStorage["byond.contactsheet.char"]`(エディタの「コンタクトシート」ボタンが書き込む) ③なければ TEMPLATE_A
- グリッド: **行=静止ポーズ4種(poses.tsのPOSES)、列=表情6種**(neutral / smile / laugh / sad / angry / surprised)
  - セル 210×330、キャラscale 0.3、Pixi Textで行・列ラベル(日本語)、キャラ名とパレットチップを上部に
  - キャンバス論理サイズ ~1300×1400、background "#f4f1ec"
- **静止描画のみ**(ticker回さない・物理なし・まばたきなし)→ 決定論
- 描画完了後 `window.__contactSheetReady = true` をセット
- エディタ側: ツールバーに「コンタクトシート」ボタン → localStorageに現docを書いて `window.open("/#contact-sheet")`

### CLIスクリプト(tools/contactsheet/run.mjs)

- 依存: **playwright-core**(devDependency。ブラウザDLしない— `channel: "chrome"` でインストール済みChromeを使う)
- 使い方: `npm run contactsheet [-- path/to/char.byc.json] [-- -o out.png]`
- 動作:
  1. `http://localhost:5273` に fetch して dev server 起動済みか確認。無ければ `npm run dev` をspawnして起動を待つ(終了時にkill)
  2. chromium.launch({ channel: "chrome", headless: true }) → `http://localhost:5273/#contact-sheet` を開く
  3. 引数の.byc.jsonがあれば読み込んで `page.evaluate` で `__loadContactSheetChar` に渡す
  4. `window.__contactSheetReady` をwaitForFunctionで待つ
  5. canvas要素をelement screenshotしてPNG保存(デフォルト `exports/contactsheet-<キャラ名 or template>.png`。exports/は無ければ作成)
  6. 保存パスをstdoutに出力
- viewport 1500×1600、deviceScaleFactor: 1
- package.json: `"contactsheet": "node tools/contactsheet/run.mjs"`

## テスト(vitest)

1. slot-ref: face variantの getShapes / refKey の一意性
2. commands: addFaceVariant(neutral複製・undo)、removeFaceVariant(neutral拒否)、updateStrandPhysics(merge)
3. mirrorLR: variant付きfaceのミラー(browL.angryIn → browR.angryIn が対称)
4. expression: referencedShapeNames("browL") が angryIn 等を含む
5. ContactSheetのセル配置計算をpure関数に切り出してテスト(layoutContactSheet(rows, cols) → 位置配列)

## 落とし穴

- refKey変更により選択状態・EditCanvasのReact keyが変わる — variant未指定時の互換("face:browL:neutral")を確認
- mirrorLR(face)は相手スロットが同variantを持たない場合も作成する
- localStorageは数百KBまで(キャラJSONは余裕)
- ContactSheetPageはPixi Application 1個・init後に1回だけ描画。StrictMode二重マウントガードは既存実装踏襲
- playwright-coreはブラウザを同梱しない: Chromeが無い環境では明確なエラーメッセージを出して終了
- CLIがdev serverをspawnした場合、Ctrl+C/エラー時も必ずkill(process.on("exit"))
- 「コンタクトシート」ボタンの window.open はポップアップブロックに注意(ユーザー操作起点なら通る)
- docs/ 変更禁止、git操作禁止、コードコメント最小限、UIラベル日本語

## 完了報告に含めること

npm test / npm run build / `npm run contactsheet`(テンプレ)の実行結果、追加・変更ファイルツリー、逸脱と理由、既知の制限。
