# Phase 1b ハンドオフ: パートエディタUI(設計: fable5 → 実装: sonnet)

## ゴール(Phase 1の受入条件)

ブラウザで: 新規(テンプレ複製)→ パレット変更・シェイプ移動/リサイズ・ピン移動・ミラー複製 → `characters/<id>.byc.json` へ保存 → ページ再読込 → 読込 → ポーズプレビューで同じ見た目。
編集操作はすべてundo/redo可能。既存テスト35件を壊さず、新規テストを追加。

## 画面レイアウト(キャラクタータブを置き換え)

```
┌────────────────────────────────────────────────────────────┐
│ [新規(テンプレ複製)] [読込▼] [保存] 名前:[____] ↩戻す ↪やり直す ●未保存 │
├─────────┬────────────────────────────────┬─────────────────┤
│ スロット一覧 │ 編集キャンバス(SVG)                  │ パレット(6色)        │
│  体(12)    │  キャラ全身レスト表示                  │ 選択スロットの        │
│  顔(5)     │  選択スロット強調・他は淡色(opacity .35)│  shapes一覧(追加/削除)│
│  髪(back/  │  ツール: 選択 / 矩形 / 楕円            │  形状プロパティ        │
│   mid×2/   │  ピン✛常時表示・ドラッグ可             │  (x,y,w,h,r,fill,    │
│   front)   │  wheelズーム / 空白ドラッグでパン       │   stroke無視可) + z   │
│  手(open/  │  グリッド50u・原点軸・接地線y=310      │  ピン座標(数値+D&D)   │
│   fist)    │  [L→Rミラーコピー]ボタン             │ ポーズプレビュー(Pixi) │
└─────────┴────────────────────────────────┴─────────────────┘
```

## 中核設計: SlotRef(全編集対象を1つの参照型で扱う)

パーツ/顔/髪/手はデータ位置が違うが、エディタからは同じ「シェイプ群+ピン」に見えるべき。**このunionとセレクタが本実装の背骨**:

```ts
// src/editor/character/slot-ref.ts
export type SlotRef =
  | { kind: "part"; slot: string }                        // parts[] (体)
  | { kind: "face"; slot: string }                        // face[slot].shapes["neutral"]
  | { kind: "hair"; layer: "front" | "mid" | "back"; index: number } // hair[layer][index]
  | { kind: "hand"; name: string };                       // hands[name]

export function refKey(ref: SlotRef): string;             // 安定キー(選択状態用)
export function refLabel(ref: SlotRef): string;           // 表示名(日本語: "上腕L" 等)
export function listSlotRefs(char: CharacterDoc): SlotRef[];  // 一覧パネルの順序で
export function getShapes(char: CharacterDoc, ref: SlotRef): readonly Shape[] | undefined;
export function getPins(char: CharacterDoc, ref: SlotRef): Record<string, Vec2>;
  // part→pins / face→{anchor} / hair→{pin} / hand→pins
export function getZ(char: CharacterDoc, ref: SlotRef): number | undefined; // hair/handは規定値(skeleton.tsの定数)
```

ミューテーション(コマンド)も同じrefを受ける:

```ts
// src/core/commands-character.ts — すべて store.dispatch でimmer draftを書く
setName(store, name)                          // mergeKey "name"
setPaletteColor(store, slot, color)           // mergeKey `palette:${slot}`
addShape(store, ref, shape)
removeShape(store, ref, index)
updateShape(store, ref, index, patch, mergeKey?)  // 移動/リサイズ用 mergeKey `shape:${refKey}:${index}`
movePin(store, ref, pinName, pos)             // mergeKey `pin:${refKey}:${pinName}`
setPartZ(store, slot, z)                      // partのみ
mirrorLR(store, fromRef)                      // part L↔R / hairMidの対応strand。shapes+pinsをx反転コピー
```

draft内でのref解決ヘルパー `resolveShapesDraft(draft, ref)` を作って重複を避けること。

## ミラー数学(src/core/mirror.ts + テスト必須)

x反転: rect `x' = -(x+w)` / ellipse `cx' = -cx` / polygon・path 全点 `x' = -x`(Q/Cの制御点も)/ pins 各点x反転。
スロット対応: `upperArmL↔upperArmR` 等のL/R置換、face `browL↔browR`、hair midは index 0↔1。対応が無いrefではボタンをdisable。

## DocStore拡張(src/core/doc-store.ts)

```ts
reset(doc: D): void  // doc差し替え+undo/redoスタック全クリア+revision+++notify
```
キャラの新規作成・読込で使用(履歴を持ち越さない)。プロジェクト読込も将来これを使う。テスト追加。

## io拡張

1. `FileSystemAdapter` に `listFiles(relDir: string): Promise<string[]>` 追加
   - FsAccess: ディレクトリの直下ファイル名一覧(無ければ`[]`、ディレクトリは除外)
   - Memory: `relDir + "/"` プレフィックスのキーを列挙
2. `src/io/serialize.ts` を一般化: `createJsonDocIO<T>({ schema, currentVersion, migrations })` → `{ toJson, parse, registerMigration }`。既存の `toJson/parseProject/registerMigration` はこれのラッパとして温存(既存テストを変更しない)。characterDocIO を追加(CharacterDocSchema, version 1)
3. 保存先: `characters/<doc.id>.byc.json`。読込▼: `listFiles("characters")` の `.byc.json` を列挙して選択

## キャンバス仕様(src/editor/character/EditCanvas.tsx)

- **SVG** `viewBox` 初期 `-380 -430 760 860`(キャラ空間直貼り。y-downなので変換不要)
- wheelズーム(カーソル中心、0.25〜4倍)、空白部ドラッグでパン
- 描画: `listSlotRefs` 順で全refのshapesを `<g>` ごとに描画。選択ref以外は `opacity: 0.35`
  - shape→SVG: rect(+rx)/ellipse/polygon/path(d文字列化ユーティリティ `src/editor/character/svg-paths.ts`)
  - fillは `resolveFill`(既存)
- **選択ツール**: shapeクリックで選択(クリックは選択refの中だけ。他refはスロット一覧から選ぶ)。ドラッグで移動。矩形/楕円は4隅ハンドル(8pxの白四角)でリサイズ(polygon/pathは移動のみでよい)
- **矩形/楕円ツール**: ドラッグで作成(fill "@primary" 初期値)→ 作成後選択ツールへ自動復帰
- **ピン**: 選択refのピンを✛マーカー+ラベルで表示、ドラッグで移動。**スナップ**: ドラッグ解放時、選択refのカプセル端円中心(r ≥ min(w,h)/2−0.5 のrectの両端)と楕円中心の6u以内なら吸着(関節の隙間防止。Phase 1aの知見)
- ガイド: 50uグリッド線(薄)、x=0/y=0軸、接地線y=310(ラベル付き)
- キー操作(キャンバスfocus時): Delete=選択shape削除 / 矢印=1uナッジ(Shiftで10u)/ Ctrl+Z・Shift+Ctrl+Z=undo/redo
- ドラッグ系は `setPointerCapture` を使い、mergeKeyで1操作=1履歴に

## ポーズプレビュー(src/editor/character/PosePreview.tsx)

- 既存の `computeBoneWorld`/`buildRenderList`/`buildCharacterContainer` を使用
- charStore購読で**編集のたびに再構築**(コンテナ破棄→再生成。この規模なら十分速い)
- ポーズ切替ボタン: 休め/手を振る/歩き/ジャンプ(現CharacterPageのPOSES定義を `poses.ts` へ移設)+「4ポーズ」トグル(横並び表示)
- Pixi Application生成は1回、StrictMode二重マウントガードは現CharacterPage実装を踏襲
- 現 `CharacterPage.tsx` はこのエディタページ(`CharacterEditorPage.tsx`)で置き換え(旧ビューワは削除してよい)

## 状態管理

- `charStore: DocStore<CharacterDoc>` モジュールレベル(初期値=テンプレ複製)。新規/読込は `reset()`
- 選択状態(zustandの `ui-store` に追加 or 専用store): `selectedRef: SlotRef | null` / `selectedShapeIndex: number | null` / `tool: "select" | "rect" | "ellipse"`
- undo後にshapeIndexが範囲外になったら選択解除(購読側でガード)
- savedRevision管理はプロジェクトと同様(キャラ用に別フィールド)

## 新規(テンプレ複製)

`structuredClone(TEMPLATE_A)` + `id: newId()` + `name: "新しいキャラクター"` → `charStore.reset()`。

## テスト(vitest追加)

1. mirror: rect/ellipse/polygon/path/pinsの反転、mirrorLRでupperArmL→Rが対称になる
2. commands-character: updateShapeのmergeKey統合、movePin、addShape/removeShapeのundo
3. DocStore.reset: スタッククリア・canUndo=false
4. characterDocIO: round-trip・未知フィールド保持(TEMPLATE_Aベース)
5. MemoryAdapter.listFiles: プレフィックス列挙・空配列

## 落とし穴

- `noUncheckedIndexedAccess`: shapes[index]・pins[name]アクセスは全てガード
- SVGのpointerイベントはe.stopPropagation()で背景パン処理と干渉させない
- `<input type="color">` は高頻度発火 → mergeKey必須
- viewBox操作中(パン/ズーム)はdispatch禁止(UI状態のみ。undo履歴に入れない)
- ピンのVec2はタプル。immer draftでは `pins[name] = [x, y]` で丸ごと代入
- 数値入力は空文字/NaNを弾いてからdispatch
- face編集対象は `shapes["neutral"]` 固定(他バリアントはPhase 2)。anchorは数値編集可
- hairのphysicsはUIに出さない(データは温存)
- 保存前に `validateCharacter` を実行し、issueがあれば確認ダイアログ(保存自体は可能)
- コードコメント最小限。UIラベル日本語

## 完了報告に含めること

npm test / npm run build の結果、追加・変更ファイル一覧、ハンドオフからの逸脱と理由、既知の制限。
