# Phase 4c-4 ハンドオフ: 台本ビュー(設計: fable5 → 実装: sonnet)

機能仕様は **docs/spec/11-scene-editor-ux.md §H**。本書は実装の固定事項と落とし穴のみ。
AI台本駆動(Phase 7)の布石: シーンを「時系列イベント列」として通し読み・ジャンプ・セリフ修正できるビュー。

## ゴール(受入条件)

1. 右パネルが「プロパティ | 台本」のタブ切替になり、台本タブで現在シーンの全イベント(登場/アクション+moveTo/表情/カメラキー/トランジション/セリフ)が**t昇順で読める**
2. 行クリックで該当要素が選択され、再生ヘッドがそのtへ移動する(カメラ行は要素選択解除+tジャンプ)
3. 吹き出し・テキストの本文がリスト内で**インライン編集**できる(変更はundo可)
4. テスト全green(既存283+新規)・ビルド成功

## 実装前に読むこと

docs/spec/11-scene-editor-ux.md(§H)、src/editor/scene/ScenePage.tsx・PropertyPanel.tsx、src/editor/ui/(Section等)、src/core/schema/project.ts、src/core/commands-project.ts(setBalloonProps / setTextProps)、src/runtime/scene-eval.ts(expandActions — moveTo到着の表記用)、src/presets/clips/index.ts(CLIPSのlabel)、src/runtime/expression.ts(EXPRESSION_PRESETSのlabel)

## 実装の固定事項

### イベント列の構築(src/editor/scene/script-events.ts 新設 — 純関数)

```ts
export type ScriptEvent =
  | { t: number; kind: "enter"; elementId: string; name: string; effect: string }
  | { t: number; kind: "exit"; elementId: string; name: string; effect: string }
  | { t: number; kind: "action"; elementId: string; name: string; clipLabel: string; moveToX?: number }
  | { t: number; kind: "expression"; elementId: string; name: string; presetLabel: string }
  | { t: number; kind: "dialogue"; elementId: string; text: string }      // balloon / text(enter.delayをtに)
  | { t: number; kind: "camera"; index: number; zoom: number }
  | { t: number; kind: "transition"; type: string; dur: number };          // 次シーンへの切替(scene末尾, t=duration)
export function buildScriptEvents(project: ProjectDoc, scene: SceneDoc, nextScene: SceneDoc | null): ScriptEvent[]
```

- 要素名: キャラ=refの短縮(既存Timelineの表記流用)、balloon/text=本文先頭10文字
- enterはdelay>0またはtype≠cutのときだけ行を出す(全要素のcut登場で行が埋まるのを防ぐ)。exitはat≠nullのとき
- dialogue: balloon/textを「セリフ行」として必ず出す(t=enter.delay)
- transition行: nextSceneのtransitionがcut以外のとき末尾に
- ソート: t昇順、同tは enter → dialogue → action → expression → camera の順

### UI(src/editor/scene/ScriptPanel.tsx 新設 + ScenePage配線)

- ScenePageの右パネルを「プロパティ | 台本」タブに(state: rightTab)。タブUIは小さなセグメント(4c-1のSegmentedButtons流用可)
- ScriptPanel: イベント行のリスト。各行 = `[t秒] [種別アイコン] [名前] [内容]`(アイコンは4c-1 icons.tsx / 表情はEXPRESSION_PRESETSのlabel)
- 行クリック: `onJump(event)` → ScenePageが 要素選択(camera/transitionは選択解除)+ `setTime(event.t)` + bumpSeek
- dialogue行: 本文部分をクリックでinput化(またはcontentEditableでなく常設の小さなinput/textarea)。変更で setBalloonProps / setTextProps(mergeKey既存)
- 再生ヘッドtに最も近い過去のイベント行をハイライト(現在地表示)
- 空シーン時は「イベントがありません」

## テスト(vitest)

1. buildScriptEvents: t昇順 / 同tの種別順 / cut登場は行なし / dialogueの本文とt / moveTo付きアクションのmoveToX / transition行の有無 / カメラ行
2. 既存283件を壊さない

## 落とし穴

- StageCanvas.tsx / Timeline.tsx / timeline-lane.tsx / SceneStrip.tsx / AddPanel.tsx は触らない(配線はScenePage+新規ファイルのみ)
- インライン編集のinputはクリックバブリングで行ジャンプを誘発しない(stopPropagation)
- 名前の短縮はサロゲートペア安全に([...text].slice)
- 台本タブ表示中も要素選択状態は維持(プロパティに戻ったとき選択が生きている)
- docs/変更禁止、git操作禁止、UIラベル日本語、コメント最小限、strict + noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build結果(件数)、追加・変更ファイル一覧(概要付き)、受入条件1〜4の確認方法、逸脱と理由、既知の制限。
