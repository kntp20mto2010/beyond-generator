# Phase 7a ハンドオフ: 台本コンパイラ(設計: workflow統合 → 実装: opus)

設計の正本は **docs/spec/12-ai-script-driven.md**(必読・全節)。本書は実装の固定事項のみ。
スコープ: 台本層スキーマ + `compile`/`decompile` + 採時。**API不要・完全決定論**。UI配線とClaude APIは 7b/7c(本セッション対象外)。

## ゴール(受入条件・全green)

1. `compile(story)` が `ProjectSchema.parse()`(src/core/schema/project.ts)を通る ProjectDoc を返す
2. **決定論**: 同一 Story → **バイト一致** ProjectDoc(`JSON.stringify` 比較)を10回反復で確認。`src/story/` 配下が `Date`/`Math.random`/`new Date` を import・使用しない(静的grepテスト)
3. 全 `line` shot で **`balloon.enter.delay === 話者 talks[].t`**(不変条件)をテストで保証
4. §6検証: spec/12 の「学校の日常 教室シーン」Story → コンパイル結果が `project.byp.json` の `scenes[2]` と**構造同型**(要素種別・数・話者-balloon対応・t昇順・clip種別が一致。`at:`明示したtは数値一致)
5. `decompile(compile(story))` が**構造同型の Story** を返す(round-trip限定保証)
6. 語彙外の clip/preset を含む Story を zod が reject
7. npm test 全green(既存321+新規)・npm run build 成功

## 実装前に読むこと

docs/spec/12(全節)、src/core/schema/project.ts(コンパイル先)、src/presets/clips/index.ts と各クリップ(**CLIP_DUR/VEL は実値をここから取る — ハードコードした近似値ではなく実 duration/virtualVelocity を使う**)、src/runtime/scene-eval.ts(8自動推論機構 — コンパイラはこれらを**再実装せず**、ランタイムが補う前提で省略する。ただし `from` 位置の前進累積は expandActions と同型ロジックを採時用に持つ)、src/editor/scene/script-events.ts(`buildScriptEvents` が非可逆な理由 → decompile はこれを使わず ProjectDoc を直接走査)、project.byp.json(§6検証データ)、src/io/serialize.ts(parseProject)

## 実装の固定事項

### ファイル構成(src/story/ 新設)
- `schema.ts` — zod(spec/12 §1)。`StorySchema`/`SceneSchema`/`CastSchema`/`ShotSchema`/`PlaceSchema`。約49語彙を enum 固定。`parseStory(json)` も
- `timing.ts` — 採時(spec/12 §2の単一パス)。**純関数**。`estTalk`/`voiceLen`/`estMove`/`CLIP_DUR`/`VEL`/`PLACE_TABLE`、1/30s量子化
- `compile.ts` — `compile(story): ProjectDoc`(spec/12 §2-3)。de-linearize(shot列 → 要素別配列)、セリフ1行→4トラック同期展開、balloon幾何(autoSize/話者頭上/tail)
- `decompile.ts` — `decompile(project): Story`。ProjectDoc直接走査。`balloon.enter.delay==talk.t` で話者-balloon突合、近接tのtalk/action/expressionを1 `line` shotへ再集約
- `index.ts` — re-export
- 各 `*.test.ts`

### 厳守
- **純関数・I/Oなし・決定論**。唯一の外部入力は `story.audioDurations`(コンパイル入力として注入。ランタイムが実バッファから読む値と同一テーブルを渡せば出力t群が一致)
- 採時の cursor は**単調増加**(後退禁止)。after/gap/at の優先順位は spec/12 §2 の通り
- balloon と talk は**同じ t0 変数**から両方を生成し、`delay==t.t` を構造的に保証(時刻一致に後から依存しない)
- 「歩いて到着→喋る」は walkTo shot と line shot を別ショットにし line を `after:"prev"`(prevEnd基準)で繋ぐ。同一shot内 max() で潰さない
- seed=scene index、id は決定論導出(`scene-{i+1}` / 要素は scene index+出現順 の純粋な連番。**ランダムID禁止** — newId()は乱数なので使わない。決定論連番 or 入力ハッシュ)
- §6で設計通りに一致しない箇所があれば**誤魔化さず report**(spec/12 は「構造同型・手調整秒は at: 明示時のみ一致」と保証線を引いている。それを超える一致を捏造しない)
- strict + noUncheckedIndexedAccess、UIラベル日本語、コメント最小限、docs/変更禁止、git操作禁止
- SceneRenderStack/StageCanvas等の既存ランタイム・UIは**一切触らない**(7aは純粋なデータ変換層の追加のみ)

### テストの要点(vitest)
- determinism: 同一Storyを10回compile→`JSON.stringify`全一致
- 静的: `src/story/` を読んで `Date`/`Math.random` 不使用を assert(ソース文字列grep)
- 不変条件: 生成ProjectDocの全balloonで delay==対応talk.t
- §6: spec/12のStoryをcompile→project.byp.json scenes[2]と構造比較(要素種別列・t順序・clip種別・話者balloon対応)
- round-trip: `decompile(compile(story))` が元storyと構造同型(idやdefault補完の差は許容、意味フィールドは一致)
- zod reject: clip:"fly" 等の語彙外を parseStory が投げる
- 採時較正: spec/12 §7の通り、charPerSec既定での estTalk が実測サンプル(vo-001〜007相当の文字数→秒)と許容誤差内(±0.5s程度)

## 完了報告に含めること
npm test / npm run build結果(件数)、追加ファイル一覧、受入条件1〜7の確認方法、§6で設計と一致しなかった点(あれば正直に)、逸脱と理由、既知の制限。
