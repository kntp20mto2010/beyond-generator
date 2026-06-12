# Phase 4c-1 ハンドオフ: ビジュアル基盤(設計: fable5 → 実装: sonnet)

詳細仕様は **docs/spec/11-scene-editor-ux.md の §A(ThumbnailService)/ §B(アセットパネル)/ §F(プロパティパネル)/ §G(テーマ・アイコン)**。本書は実装上の固定事項と落とし穴のみ。
スコープ外: タイムライン(4c-2)、ステージ操作・シーン帯(4c-3)、台本ビュー(4c-4)。**StageCanvas.tsx と Timeline.tsx と SceneStrip.tsx は触らない**。

## ゴール(受入条件)

1. キャラ・背景・表情・登場退場効果が全て**絵/アイコンで選べる**(テキストselect・パス手入力の廃止)
2. アプリ全体が統一ダークテーマ(CSS変数)+SVGアイコン(絵文字全廃はシーン編集タブ内のみ必須)
3. サムネ生成でリークなし(同一キャラ100枚連続生成でJSヒープが発散しない)
4. 既存テスト245件green維持+新規(純関数部分)。npm run build成功。**キャラクタータブが壊れていない**こと

## 実装前に読むこと

docs/spec/11-scene-editor-ux.md(§A,B,F,G)、src/editor/scene/AddPanel.tsx・PropertyPanel.tsx・ScenePage.tsx、src/editor/character/PosePreview.tsx(キャラ描画と上半身フレーミングの前例)、src/editor/character/ContactSheetPage.tsx(オフスクリーンPixiの前例)、src/render/character-pixi.ts(CharacterView)、src/runtime/pose.ts(computeBoneWorld / buildRenderList / headDecalMatrix)、src/runtime/clip-player.ts(sampleClip)、src/runtime/expression.ts(EXPRESSION_PRESETS)、src/presets/clips/index.ts(CLIPS / CLIP_ORDER)、src/io/asset-resolver.ts、src/App.tsx・main.tsx

## A. ThumbnailService(src/editor/thumbs/thumbnail-service.ts 新設)

仕様11 §Aのインターフェースに従う。実装の固定事項:

- **共有Pixi Application 1つ**を遅延init(`backgroundAlpha: 0, antialias: true`、canvasはDOMに**追加しない**)。リクエストは直列キュー(Promiseチェーンで1件ずつ。並行レンダリング禁止)
- キャラ描画: `sampleClip(CLIPS[clip ?? "idle"], phase ?? 0)` → `computeBoneWorld` → `resolveFace(char, {preset: expression ?? "neutral"})` → `buildRenderList` → `CharacterView.update()` → コンテナをboundsで枠内fit(余白8%)→ `renderer.extract.base64()`等でdataURL化(Pixi v8のextract APIは型定義で確認)
- **face: true** は上半身クロップ: PosePreview.tsxの「上半身」フレーミング実装を流用すること(前例があるので新規の魔法数を作らない)
- シーンサムネ: `evaluateScene(project, scene, scene.duration / 2, resolver)` の結果をStageCanvasのapplyItem相当で組む…のは重いので、**4c-1ではキャラサムネのみ実装し、renderSceneはインターフェースだけ定義して未実装(TODOコメント+nullを返す)でよい**(シーン帯は4c-3スコープ。背景サムネは実画像の`<img>`で済むのでPixi不要)
- **destroy規律**: 抽出後にコンテナ`destroy({children: true})`。CharacterViewは使い回さず毎回生成→破棄(キャッシュが効くので頻度は低い)
- キャッシュ: `Map<string, string>`(key = ref/charId + JSON化したopts)。`subscribe(cb)`で完成通知、Reactは`useSyncExternalStore`またはrev++で再描画
- 保存キャラのdocは`AssetResolver.getCharacter(ref)`から。**AddPanelに出す全キャラを`ensureLoaded`してからサムネ要求**(ScenePageの一覧ロード箇所を拡張)

## B. テーマ(src/index.css 新設+main.tsxでimport)

仕様11 §GのCSS変数をそのまま使う。追加の固定事項:

- 要素直スタイル(`button { ... }`等)のグローバル上書きは**最小限**にし、`.ui-btn` `.ui-input` `.ui-panel`等のクラスベース中心にする(キャラクタータブを壊さないため)。シーン編集側のコンポーネントからインラインstyleを段階的にクラスへ移行(全廃は不要、色とフォントはCSS変数参照に)
- App.tsxのタブバーもテーマ適用(ダーク+アクセント下線)
- ステージ周辺(StageCanvasを**囲む親要素**の背景)は触ってよいがStageCanvas.tsx自体は変更しない

## C. 共通UI部品(src/editor/ui/)

- `Section.tsx`: 折りたたみセクション(タイトル+▾、開閉state内部持ち、defaultOpen prop)
- `SegmentedButtons.tsx`: `{value, options: {value, icon?, label, title?}[], onChange}` — enter/exit効果・トランジション種別用
- `IconButton.tsx` / `Thumb.tsx`(画像+選択枠+下ラベル)/ `Popover.tsx`(anchor相対、外側クリックで閉じる — ContextMenuの閉じ処理を参考)
- `icons.tsx`: 16×16 viewBox、`stroke="currentColor" fill="none"`系の関数コンポーネント22種: play / playAll / stop / undo / redo / folder / save / grid / camera / character / text / balloon / background / lock / unlock / duplicate / trash / flip / front / back / transition / keyDiamond
- `ExpressionPicker.tsx`: EXPRESSION_PRESETS全件の顔サムネ(ThumbnailService face)グリッド。`{char, value, onPick}`。charが未解決ならlabelテキストにフォールバック
- `ClipPicker.tsx`: CLIP_ORDER全件のポーズサムネ(clip, phase=0.4)グリッドのPopover版。`{char, value, onPick}`

## D. AddPanel / PropertyPanel の改修

仕様11 §B・§F通り。固定事項:

- AddPanel: キャラ=Thumbグリッド2列(内蔵+保存済)。背景=内蔵リスト(`const BUILTIN_BGS = ["assets/generated/bg-school-001.png"]`)+`assets/bg/`一覧をresolver.getImageUrl→`<img>`サムネ化(未解決はensureImagesLoaded後にrev更新で出る)。色スウォッチ8色(紙色系・空色・夕色・夜色・緑・灰・白・黒)+カラーピッカー。吹き出し3種はミニSVG。**パス手入力欄は削除**
- PropertyPanel: Section化(配置/登場・退場/アクション/表情/吹き出し/シーン設定)。enter・exit・トランジションをSegmentedButtonsに(アイコン+title)。表情キー行のselect→ExpressionPicker(Popover)。アクション行のクリップselect→ClipPicker。**数値入力(X/Y/t/delay/dur等)は残す**
- ScenePageへのThumbnailService配線は`useMemo`でシングルトン生成し、AddPanel/PropertyPanelへprops渡し

## E. テスト

- 純関数を切り出してテスト: fit計算(bounds→スケール/オフセット)、キャッシュキー生成、(あれば)スウォッチ定義
- Pixi依存部はユニットテスト不要(ブラウザ検証で代替)。既存245件を壊さない

## 落とし穴

- **Pixi共有appのinit前アクセス**: 初回リクエストでawait init→キュー処理。initを複数回走らせない(initフラグ+Promise共有)
- extract後のdestroy漏れ=リーク。100枚ループをヘッドレスで実行し`performance.memory.usedJSHeapSize`が発散しないこと(progress.md「検証の落とし穴」§6-7も必読)
- グローバルCSSでキャラクタータブのSVG編集キャンバスやスライダーを壊さない(変更後に両タブをスクショ確認)
- ExpressionPicker/ClipPickerのサムネ要求はマウント時一括でなく**Popoverを開いた時**に開始(起動時の無駄レンダリング防止)。AddPanelのキャラサムネは起動時でよい(数が少ない)
- PixiのuseEffect([])はHMRで再実行されない — フルリロードで検証
- UIラベル日本語、コードコメント最小限、strict + noUncheckedIndexedAccess、docs/変更禁止、git操作禁止
- レイアウトの3カラム構造・各パネルの機能は変えない(見た目と選択UIの置き換えのみ)

## 完了報告に含めること

npm test / npm run build結果、追加・変更ファイルツリー、ヒープ検証の方法と結果、シーン編集タブ+キャラクタータブ両方のスクショ確認結果(自分でヘッドレス確認)、逸脱と理由、既知の制限。
