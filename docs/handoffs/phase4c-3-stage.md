# Phase 4c-3 ハンドオフ: ステージ直接操作+シーン帯(設計: fable5 → 実装: opus)

機能仕様は **docs/spec/11-scene-editor-ux.md §C(シーン帯)/ §E(ステージ操作)**。本書は実装の固定事項と落とし穴のみ。
スコープ外: 台本ビュー(4c-4)。**Timeline.tsx / timeline-lane.tsx / time-snap.ts / AddPanel.tsx は触らない**(4c-2成果を壊さない)。

## ゴール(受入条件)

1. ホバーで要素に薄枠、選択枠の四隅ハンドルでscale変更(undo可・複利なし)
2. キャラのダブルクリック→クイックアクションPopover(ポーズサムネ/顔サムネの2タブ)→クリックで**現在の再生ヘッドtに**アクション/表情キー追加
3. カメラモード(ツールバー📷トグル): ステージ上のカメラ枠ドラッグ=x/y、四隅ハンドル=zoom(16:9維持)。pointerupで現在tのキーを更新(なければ追加)。プリセット「全景」「選択要素に寄る」
4. シーン帯がサムネイル表示(renderScene実装)になり、D&Dで並べ替え、シーン間チップでトランジション(種類+長さ)を設定できる
5. テスト全green(既存266+新規)・ビルド成功

## 実装前に読むこと

docs/spec/11-scene-editor-ux.md(§C,E)、docs/handoffs/phase4c-1-visual.md と phase4c-2-timeline.md(前提)、src/editor/scene/StageCanvas.tsx・ScenePage.tsx・SceneStrip.tsx・ContextMenu.tsx(Popover配線の前例)、src/editor/thumbs/thumbnail-service.ts、**src/render/character-canvas2d.ts(サムネはWebGL禁止 — この2D描画を使う。冒頭コメントの経緯必読)**、src/render/balloon.ts(形状仕様)、src/runtime/scene-eval.ts(evaluateScene / evaluateCamera / SceneFramePayload)、src/editor/scene/stage-coords.ts、src/core/commands-project.ts、src/editor/ui/(ClipPicker / ExpressionPicker / Popover)

## 実装の固定事項

### A. ステージ操作(StageCanvas.tsx + ScenePage配線)

- **ホバー**: 非ドラッグ時のpointermoveでhitTest → 薄枠(1px、--accent系 alpha 0.5、選択枠とは別Graphics、app.stage直下)。ドラッグ中・カメラモード中・再生中は消す
- **拡縮ハンドル**: 選択枠の四隅に8px白角(青枠)。pointerdownがハンドル上(10px以内)なら scaleドラッグ: `新scale = 開始scale × (現在ポインタ→要素中心距離 / 開始ポインタ→要素中心距離)`、クランプ0.1〜5。`updateElementTransform`(mergeKey既存 `el:${id}:tf`)。locked要素には出さない
- **ダブルクリック**: canvasの`dblclick`でhitTest → kind==="character"なら `onQuickAction({clientX, clientY, elementId})` をScenePageへ。ScenePageはPopover(ContextMenuと同様のfixed配置)に「アクション | 表情」2タブを表示 — 中身は既存ClipPicker/ExpressionPickerのグリッド部を流用し、選択時に `addAction(store, sceneId, elId, { t: 現在t, clip, speed: 1 })` / `addExpressionKey(..., { t: 現在t, preset })`。追加後Popoverを閉じてbumpSeek
- ダブルクリックと通常クリック(選択+ドラッグ)の共存: dblclickはネイティブイベントなのでそのまま両立(pointerdown 2回が先行して走るのは許容)

### B. カメラモード(ツールバー📷トグル + StageCanvas)

- ScenePageに `cameraEdit: boolean`。ON中はStageCanvasの通常ヒットテスト/要素ドラッグ/ホバー/ハンドルを**無効化**し、カメラオーバーレイ(app.stage直下)を表示:
  - 現在t評価のカメラ(evaluateCamera)を**スクリーン座標の枠**として描画(16:9固定)。外側を半透明黒(alpha 0.35)でグレーアウト(4枚の矩形で囲む)
  - 枠内ドラッグ = カメラ中心x/y移動。四隅ハンドル = zoom(枠中心固定、`新zoom = 開始zoom × (開始対角距離 / 現在対角距離)`、クランプ0.5〜4)
  - **pointerupで確定**: 現在tに一致するキー(|key.t − t| < 0.01)があれば `updateCameraKey`、なければ `addCameraKey({t: 現在t, x, y, zoom})`。ドラッグ中はローカル値で枠とステージ表示(world変換)を即時更新してよい(dispatchはupの1回)
  - プリセットボタン(ツールバーの📷の隣に、ON中のみ表示): 「全景」= (960, 540, 1)で確定 / 「選択要素に寄る」= 選択要素のbounds中心(やや上寄り: cy − bounds高さ×0.15)へ、zoom = clamp(1080 / (bounds高さ × 1.6), 1, 2.5)で確定。要素未選択時はdisabled
- Escで解除(ScenePageのonKeyに追加。typing中ガード内)

### C. シーンサムネ(thumbnail-service.ts の renderScene 実装)

- **WebGL/Pixi使用禁止**(冒頭コメントの経緯)。Canvas 2Dで合成:
  - シグネチャを `renderScene(project, scene, resolver: { getCharacter; getImageUrl }, w = 128, h = 72): Promise<string>` に変更(現状は未実装スタブで呼び出しゼロ。AssetResolverをそのまま受ける)
  - 手順: 背景色fill(なければ紙色)→ 背景画像(resolver.getImageUrl → `new Image()` をawaitロード → cover配置。未解決はスキップ)→ `evaluateScene(project, scene, scene.duration / 2, resolver)` をz順に描画:
    - character: `drawItemsToCanvas`(transform適用が必要 — **flipX対応のためbase変換を{scaleX, scaleY, tx, ty}に拡張してよい**。ステージ1920×1080→w×hの縮小と要素transformを合成)
    - text: ctx.font(サイズ×縮小率)/ strokeText(縁取り)→ fillText。中央anchor
    - balloon: 角丸rect+三角しっぽの簡易描画で可(雲/トゲも角丸代用OK。fill/lineColor/テキストは正しく)
  - キャッシュ: `scene.id` → dataURL。`invalidateScene(sceneId)`で破棄+subscribe通知
- ScenePage: docのrevision変化で全シーンを `invalidateScene`(**300ms debounce** — 編集連打で毎回作らない)

### D. シーン帯(SceneStrip.tsx 全面改修)

- カード: サムネ(128×72、未生成中はシーン番号のみのプレースホルダ)+下に「シーン N・4.0秒」。選択中=アクセント枠。通し再生中の現在シーン=下端にプログレスバー(t/durationはpropsで受ける)
- **HTML5 D&Dで並べ替え**: dragstart/dragover(preventDefault+ドロップ位置インジケータ)/drop。コマンドは新設 `moveSceneTo(store, sceneId, toIndex)`(commands-project.ts追加可。1 dispatch=1 undo、範囲外は無視)。既存の←→ボタンは削除してよい
- カードの複製/削除ボタンは維持(既存コマンド)
- **シーン間トランジションチップ**: カードの間(と先頭以外)に小さな丸ボタン。デフォルト(cut)は「+」風の控えめ表示、設定済みは種別アイコン。クリックでポップオーバー: 種類セグメント(カット/フェード/ワイプ/スライド)+長さ数値 → `setSceneTransition`(対象は**右側のシーン**のtransition)

## テスト(vitest)

1. moveSceneTo: 前→後/後→前/同位置/範囲外+undo 1回
2. renderSceneのレイアウト純関数(切り出せる範囲: cover配置計算、ステージ→サムネ縮小変換)
3. カメラプリセット「寄る」のzoom/中心計算(純関数に切り出す)
4. 既存266件を壊さない

## 落とし穴

- **サムネにPixiを使わない**(StageCanvasのレンダラーが死ぬ。character-canvas2d.tsの経緯コメント参照)
- 拡縮・カメラ枠ドラッグとも「開始値+比率/デルタ」で計算(複利禁止)
- カメラ枠の座標変換: 表示中カメラでscreenToStage→新カメラ中心。ドラッグ中にカメラ自身が動くので、**開始時点のカメラでscreen→stage換算を固定**してデルタを取る
- ドラッグ確定前のライブ表示はrenderFrame側が読む値に注意(docはまだ旧値。オーバーレイ描画とworld変換だけローカル値を使う)
- dblclickの直前のpointerdownで選択が走るのは正常(選択済み要素のダブルクリックでも動くこと)
- D&Dのdragoverでは必ずpreventDefault(しないとdropが発火しない)
- renderSceneは非同期(Image待ち)+直列(同時多発させない — 既存のキュー的直列化に倣う)
- placeholder(未解決キャラ)はグレー矩形でよい(SceneFramePayloadのplaceholder分岐)
- サムネ再生成中に古いdataURLを表示し続ける(チラつき防止: invalidate時にキャッシュを即消さず、新しい生成完了で置換)
- 合成ポインタ検証: setPointerCaptureパッチ+dblclickは `new MouseEvent("dblclick", {...})`
- PixiのuseEffect([])はHMR非再実行 — フルリロードしてから確認
- docs/変更禁止、git操作禁止、UIラベル日本語、コメント最小限、strict + noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build結果(件数)、追加・変更ファイル一覧(概要付き)、受入条件1〜5の確認方法、逸脱と理由、既知の制限。
