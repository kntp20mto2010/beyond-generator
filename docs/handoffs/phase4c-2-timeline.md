# Phase 4c-2 ハンドオフ: タイムライン本格化(設計: fable5 → 実装: opus)

機能仕様は **docs/spec/11-scene-editor-ux.md §D**。本書は実装の固定事項と落とし穴のみ。
スコープ外: ステージ操作・シーン帯(4c-3)、台本ビュー(4c-4)。**StageCanvas.tsx と SceneStrip.tsx と AddPanel.tsx は触らない**。

## ゴール(受入条件)

1. アクション・表情キー・enter/exit・カメラキーの時刻が**すべてタイムライン上のドラッグで調整**でき、各ドラッグが**undo 1回**で戻る
2. ドラッグ中に時刻スナップ(0.05s刻み+他キーの時刻+整数秒)が効く
3. アクションが区間ブロックで表示され(次アクション開始まで)、moveTo付きは到着時刻が見える
4. 再生ヘッドが全レーンを貫通し、レーン余白でもスクラブできる
5. テスト全green(既存253+新規)・ビルド成功

## 実装前に読むこと

docs/spec/11-scene-editor-ux.md(§D)、docs/handoffs/phase4c-1-visual.md(4c-1の成果物)、src/editor/scene/Timeline.tsx・ScenePage.tsx・PropertyPanel.tsx、src/editor/ui/(4c-1の共通部品)、src/editor/thumbs/thumbnail-service.ts、src/core/commands-project.ts、src/runtime/scene-eval.ts(expandActionsがexport済み — moveTo到着時刻の計算に使う)、src/editor/scene/snap.ts(ステージ用スナップの前例)

## 実装の固定事項

### ドラッグ確定方式(最重要)

**ドラッグ中はdocをdispatchしない。** ローカルReact state(`dragPreview`)で表示だけを動かし、**pointerupで1回だけコマンドをdispatch**する。
理由: `updateAction`/`updateExpressionKey`/`addCameraKey`系はt昇順ソートを伴うため、ドラッグ中にdispatchすると**配列indexが変わり以降の更新が別の要素を触る**。pointerup 1回方式ならこの罠を回避でき、undoも自然に1エントリになる。
ドラッグデルタは「開始時の値+累積デルタ」(複利禁止 — progress.md落とし穴3)。

### 時刻スナップ(src/editor/scene/time-snap.ts 新設 — 純関数)

```ts
export function snapTime(
  t: number,                       // 生ドラッグ結果
  candidates: readonly number[],   // 同レーン以外も含む他キーの時刻+整数秒(0..duration)
  pxPerSec: number,                // 現在のレーン幅換算(閾値をpx基準にするため)
  thresholdPx?: number,            // default 6
): number
// 最近傍candidateがthreshold内ならそれを返し、なければ 0.05s 刻みに丸める。0..durationにクランプは呼び出し側
```

### ブロックモデル

- アクションブロック: 区間 `[a.t, 次アクションのt)`、最後はシーン末まで。ブロック左端に掴みやすい本体、ラベルはクリップlabel。moveTo付きは `expandActions([el.transform.x, el.transform.y], actions)` の travelEnd まで「▸」連続表示(CSSのrepeating-linear-gradientで可)+到着位置に縦線
- 表情キー: ◆マーカー(12px)+顔ミニアイコン(ThumbnailService face 20px、未ロード時はプリセットlabel頭文字)。ドラッグでt
- enter: レーン左端から `delay+dur` 幅の半透明グラデブロック。**本体ドラッグ=delay、右端8pxドラッグ=dur**。exit: `at`から`dur`幅、本体ドラッグ=at、右端=dur。exit.at===nullなら非表示(追加はPropertyPanelの既存チェックボックス)。cutタイプはdur=0扱いの細線
- カメラレーン(camera.length>0で表示、既存の📷レーンを置換): ◆ドラッグでキーのt移動。**クリック(ドラッグなし)で要素選択を解除(onSelect(null))+再生ヘッドをそのキーのtへ**(シーン設定セクションが見える状態にする)
- 再生ヘッド: ルーラー+全レーンを貫く縦線1本に統一。レーンの何もない領域のpointerdownはスクラブ(既存startScrubを共通化)。ブロック/マーカー上はドラッグ優先

### コマンド

既存で足りる: updateAction / updateExpressionKey / updateCameraKey / setElementEnter / setElementExit(pointerup時に1回呼ぶ。mergeKeyは不要 — 1ドラッグ=1 dispatch)。新規コマンド禁止。

### レイアウト

- レーンヘッダ(幅110): 種別アイコン(4c-1のicons.tsx)+名前+🔒(locked時)。クリック選択は既存維持
- レーン高をやや拡大(26→30px程度)しブロック操作を掴みやすく。色はCSS変数(アクション=--accent系、enter=緑系、exit=橙系、選択レーンは背景強調)
- Timeline.tsxの行コンポーネントが肥大化するなら src/editor/scene/timeline-lane.tsx 等に分割可

## テスト(vitest)

1. snapTime: 候補吸着 / 閾値外で0.05丸め / 最近傍選択 / px換算
2. ブロック区間計算(純関数に切り出す): アクション区間(次の開始まで・最後はシーン末)/ moveTo到着時刻(expandActions利用)
3. ドラッグ確定値のクランプ(0..duration)
4. 既存253件を壊さない

## 落とし穴

- **updateActionのtソートでindexが変わる**(上記の通りpointerup 1回方式で回避)。表情キー・カメラキーも同じソート挙動
- ドラッグとクリックの区別: 移動量3px未満はクリック扱い(カメラキーの選択動作)
- exit.atのドラッグ範囲はenter.delayより小さくならないようクランプ…はしない(評価器は矛盾値でも壊れない。クランプは0..durationのみ)
- durationを跨ぐ値: exit.at等はduration超を許す(4aハンドオフの仕様: クランプしない)。ドラッグでは0..durationに制限してよい
- pct計算(left%)はscene.duration変更に追従(既存実装参照)
- typing中ガード等のキーボード系は触らない(ScenePage既存)
- ThumbnailServiceの顔取得はPopover時と同様subscribe+rev更新パターン(AddPanelの実装参照)
- PixiのuseEffect([])はHMR非再実行 — フル リロードして確認(StageCanvasは触らないが表示確認時の注意)
- 合成ポインタ検証時はsetPointerCaptureをパッチ(progress.md§6)
- docs/変更禁止、git操作禁止、UIラベル日本語、コメント最小限、strict + noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build結果(件数)、追加・変更ファイル一覧(概要付き)、受入条件1〜5の確認方法(ヘッドレスでのドラッグ検証含む)、逸脱と理由、既知の制限。
