# Phase 0 ハンドオフ: 基盤(設計: fable5 → 実装: sonnet)

## ゴール(受入条件)

ブラウザで: 空プロジェクト作成 → タイトル変更・シーン追加/削除 → **undo/redoが正しく動く** → プロジェクトフォルダへ保存 → 再読込で復元。
ユニットテストで: undo/redo・マージ・直列化round-trip・未知フィールド保持・マイグレーション機構がgreen。

## 環境(確認済み)

- Node v22 / **npm**(pnpm無し。package.jsonのscriptsはnpm前提で書く)
- macOS / Chrome対象(File System Access API使用)

## セットアップ

```
npm create vite@latest . -- --template react-ts   # 既存ファイル(docs/, README.md)は保持すること
npm i pixi.js@^8 zustand immer zod ulid
npm i -D vitest @biomejs/biome
```

- React はテンプレート既定の最新でよい(18+)
- tsconfig: `strict: true` + `noUncheckedIndexedAccess: true`
- biome: lint+format、scripts: `dev / build / test / lint / format`
- README.md と docs/ は**上書き・削除禁止**(viteテンプレが生成するREADMEは破棄して既存を残す)

## ディレクトリ(02-architecture準拠)

```
src/
  core/
    schema/      # 型 + zodスキーマ + マイグレーション
    doc-store.ts # パッチ方式 DocStore(下記)
    id.ts        # ulid ラッパ(テストでseed差し替え可能に)
  runtime/       # 空(placeholder .gitkeep)
  render/        # 空
  editor/
    shell/       # Phase 0 最小UI
    ui-store.ts  # zustand(UI状態: 開いているフォルダ名等。docはDocStore管轄)
  io/
    fs.ts        # FileSystemAdapter + FsAccessAdapter + MemoryAdapter
    serialize.ts # toJson / parseProject(validate+migrate)
  presets/       # 空
tools/           # 空
fixtures/        # テスト用JSON
```

`core/` `runtime/` `io/` は **React/DOM非依存の純TS** を厳守(fs.tsのFsAccessAdapterのみブラウザAPI使用可)。

## 最重要アーキ判断: パッチ方式undo(immer)

コマンド毎にinvertを手書きせず、**immerの `produceWithPatches` で patches / inversePatches を自動取得**して履歴に積む。将来の全エディタコマンドが自動的にundo対応になる。

```ts
// core/doc-store.ts
type CommandFn<D> = (draft: Draft<D>) => void

interface HistoryEntry {
  label: string
  mergeKey?: string      // 同一mergeKeyが1000ms以内に連続 → 直前エントリに統合
  patches: Patch[]
  inverse: Patch[]
  at: number             // performance.now()系。Date.now()でも可(UI層なので決定論対象外)
}

class DocStore<D> {
  constructor(initial: D)
  readonly doc: D                       // 現在値(immutable)
  readonly revision: number             // 変更毎にincrement(dirty判定用)
  dispatch(label: string, fn: CommandFn<D>, opts?: { mergeKey?: string }): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  subscribe(cb: () => void): () => void // useSyncExternalStore用
}
```

- `enablePatches()` をcoreのエントリで1回呼ぶ
- redoスタックはdispatchでクリア
- 履歴上限200(超過分は古い方から捨てる)
- **docはplain object/arrayのみ**(Map/Set禁止 — patchとJSON直列化の相性のため)
- Reactバインドは `useSyncExternalStore`(zustandはdocに使わない。UI状態のみzustand)

## スキーマ(07-data-formats準拠、Phase 0はprojectのみ)

```ts
// core/schema/project.ts — zodで定義し、z.infer で型を導出
ProjectDoc = {
  formatVersion: 1, id: string, title: string,
  stage: { w: 1920, h: 1080, fps: 30 },
  bgm: [],            // Phase 5まで空配列
  scenes: SceneDoc[]
}
SceneDoc = {
  id: string, duration: number /*秒*/, durationMode: 'manual',
  background: null, camera: [], elements: [], seed: number
}
```

- 全オブジェクトスキーマに **`.passthrough()`**(未知フィールド保持 → 書き戻し。07の前方互換ルール)
- `createEmptyProject(): ProjectDoc`(scenes: [] で開始。シーン追加コマンドの初期durationは4.0秒、seedは連番でよい)
- マイグレーション: `migrations: Record<number, (raw) => raw>` 登録制。`parseProject`は formatVersion を見て現行まで順適用 → zod validate。**未来バージョンは明示エラー**(「新しいバージョンのファイルです」)

## Phase 0 コマンド(動作証明用)

- `setTitle(title)` — mergeKey: `"title"`(連続入力が1履歴になる)
- `addScene()` / `removeScene(id)` / `setSceneDuration(id, sec)` — mergeKey: `"dur:"+id`

## io

```ts
// io/fs.ts
interface FileSystemAdapter {
  pickProjectFolder(): Promise<boolean>          // false=キャンセル
  readTextFile(relPath: string): Promise<string | null>  // 無ければnull
  writeTextFile(relPath: string, content: string): Promise<void> // 中間ディレクトリ自動作成
  readonly folderName: string | null
}
```

- `FsAccessAdapter`: showDirectoryPicker使用。**ボタンのclickハンドラから同期的に呼ぶ**(awaitを挟むとuser gesture文脈が切れて例外になることがある)
- `MemoryAdapter`: Map<string,string>(テスト用)
- serialize: JSON.stringify(doc, null, 2)。保存先は `project.byp.json` 固定

## UIシェル(editor/shell — 最小限・日本語ラベル)

ヘッダ1行+本体のみ。装飾は最低限(システムフォント、簡素なflex):

```
[フォルダを開く] [保存]   [↩ 戻す] [↪ やり直す]   タイトル:[________]   ● 未保存
シーン一覧:
  1. scene_01J...  duration:[4.0]秒  [削除]
  2. ...
[+ シーン追加]
```

- 戻す/やり直すは canUndo/canRedo でdisabled
- 未保存ドット: revision !== savedRevision
- 「フォルダを開く」→ picker → 既存 `project.byp.json` があれば読込、無ければ空プロジェクト作成
- 保存: 未選択ならpickerを先に出す

## テスト(vitest、DOM不要)

1. doc-store: dispatch→undo→redo の値検証 / mergeKey統合(2回のsetTitleが1回のundoで戻る)/ dispatch後にredoクリア / 履歴上限
2. serialize: round-trip deep equal / **未知フィールド**(`{"x_custom": 1}` をsceneに注入)が保存後も残る / 未来formatVersionでエラー / ダミーmigration(v1→v2をテスト内で登録)が適用される
3. MemoryAdapter: write→read round-trip、未存在→null

## Git

`git init` + `.gitignore`(node_modules, dist, .DS_Store, *.autosave.json, exports/)+ 全ファイルで初回コミット1つ:
`Phase 0: 基盤(scaffold, パッチ方式undo, 保存/読込)`(コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)

## 落とし穴メモ

- immerの`enablePatches()`忘れ → produceWithPatchesが例外
- zod `.passthrough()` 漏れ → 未知フィールドが黙って消える(テストで検出される)
- `noUncheckedIndexedAccess` により配列indexアクセスはガード必須
- FsAccessAdapterの型: `showDirectoryPicker` はlib.domに無い場合あり → `src/io/fs-access.d.ts` で最小限の型宣言を足す
- viteテンプレ生成物の掃除: App.css等のデモ残骸は削除。ただし既存の README.md / docs/ は触らない

## 完了報告に含めること

インストールしたバージョン(react/pixi/zod等)、`npm test`と`npm run build`の結果、作成ファイル一覧、ハンドオフから逸脱した点とその理由。
