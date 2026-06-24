# Claude Code Instructions

## 絶対に守る不変ルール (越権禁止)

KEN が明示的に許可しない限り、以下は **絶対にやらない**。違反すると過去のセッションで何度も怒られている。

### 1. catalog-hidden.json の ID を勝手に unhide しない
`src/editor/scene/catalog-hidden.json` の `hidden` 配列は **KEN が UI の削除ボタンで意図的に隠したもの**。色不一致や品質不足を KEN が判定した結果。「画風と整合してる」「色が合ってる」等の自己判断で削除して unhide するのは**越権**。

- ファイル単体 (`assets/objects/<id>-<view>.png`) が disk に残っているのは「ファイル削除しない方針」のためで「再利用可能」を意味しない。
- KEN が「hidden 解除」「未作成のものに手をつけて」と指示しても、それは **新 moodboard で新 asset を生成して catalog の src を上書き** という意味であって、hidden を外して旧ファイルを復活させる意味ではない。
- catalog-hidden.json は **読み取り専用として扱う**。編集が必要なら必ず KEN に確認。
- 過去違反: 2026-06-22 / 2026-06-23 で 2 回怒られた。詳細: `~/.claude/projects/-Users-KEN-byond-generator/memory/feedback-hidden-no-unhide.md`

### 2. 未承認の代替アプローチを勝手に採用しない
KEN が議論中の「採用方針」とは違うやり方を独断で採用しない。例:
- Codex フローで進めている最中に、勝手にローカル決定論スクリプト (例 `smooth-silhouette-edges.py --mode shape`) に切替えて catalog 登録する → 2026-06-22 で怒られた
- 「失敗が続いたから別案にする」は KEN の判断領域。フォールバックを発動する前に必ず確認。

### 3. ファイルを安易に削除しない
KEN ルール: 「ファイルは残置、UI 側で hidden 化」。
- `assets/generated/` / `assets/objects/` の既存ファイルは消さない (catalog から外しても disk に残す)。
- catalog entry を削除するときも src ファイルは残置。

### 4. Hidden 物を議論に混ぜない
catalog-hidden に入っているものは「無いものとして」扱う。進捗表・統計・推薦・提案の対象外。

### 5. Codex の緑マスク/編集出力は「本物の moodboard か」必ず目視確認してから次工程へ
Codex は references に画像を渡し、プロンプトで view_image 強制・「読めなければ fail」と書いても、**flakily 参照を無視して部屋ごと新規生成する** (写実的な別部屋になり、OCCLUDERS テキストまで画像に焼き込まれることもある)。これは過去に何度も起きている (デスクチェア mask r1・ベッド edgepolish・床植物 mask r1)。

- 緑マスク生成後は、**必ず Read で開いて「本物の sakura room (KEN フラット画風・正しいレイアウト) を編集したものか」を目視確認**してから apply-green-mask に進む。再生成された別部屋なら**即捨てて新 id でリトライ**。apply してから「なんか変」と気づくのでは遅い。
- 「references に渡した」「validation が pass と言ってる」は信用しない (Codex の自己申告は嘘をつく)。自分の目で出力画像を見て確認する。
- cleanup/edgepolish 出力も同様に、別物生成されてないか目視確認してから strip/登録する。

### 6. 推測・思い込みで断定しない。必ず実物 (マスク/抽出物/スクリプト/UI 状態) を Read で見てから言う・進む

KEN が何度も怒っている**根本パターン**: マスク・抽出物・スクリプトの挙動・テーブルのセル状態などを**実際に見ずに、自分の意図や思い込みで断定する**。「purpose に cleanup と書いた = 処理した」「緑化を指示した = 緑化された」「遮蔽なし = clean」のように検証を飛ばすから、事実と食い違って嘘になり、同じ失敗を繰り返す。

- 結論・状態・原因を述べる前に、必ず対象を **Read / `get_image_request` / スクリプト読み**で実物を確認する。確認してないことを「〜のはず」「〜だと思う」で言わない・進めない。確認できないなら「確認できてない」と言う。
- **抽出物は必ず Read で開いて「家具が途切れてないか・穴が空いてないか」を見る**。手前/上に別の物 (occluder) がある家具は、緑マスクで occluder を緑化しない → **その部分が透明の穴になる** (apply-green-mask は緑画素だけ残す)。穴があれば **cleanup で家具色に補完**する。strip 直行で済ませない。
- 緑マスク発注時は **OCCLUDERS を明示** (none か、手前/上の遮蔽物リスト)。occluder ありなら cleanup を必ず通し、その出力も目視してから strip。
- 過去事例 2026-06-23 (navy 部屋): ワードローブ=ベッド遮蔽を**見落とし**て下部が切れたまま登録 / desk・sofa=purpose に「cleanup で補完」と**書いたのに実行漏れ** / coffee-table=「緑化されたはず」と**思い込んだが実際は非緑→天板に穴**。全て「実物を見ずに断定」が原因。

---

## Codexへの画像生成依頼

このプロジェクトで画像生成が必要な場合は、必ず
`docs/spec/10-agent-image-generation-handoff.md`を読み、そのプロトコルに従うこと。

- `codex-image-server` MCPの`submit_and_wake_image_request`で依頼し、Codexを即時起動する
- `wake.launched`が`false`でも依頼は`pending`に残るため、状態とログを確認する
- 完了通知はpushされないため、依頼後は対象IDを`wait_image_request`で待つ
- `submit_and_wake_image_request`の戻り値だけで完了判断しない。`wait_image_request`の`completed` / `failed` / `timeout`を確認する
  - `timeout`の場合は**同じ`id`を再利用せず**、ログ (`/Users/KEN/codex-image-server/logs/<id>.log`) と状態をユーザーへ報告してから、原因を踏まえ新 id で再依頼する
- 依頼には`kind`を指定する
  - `generate`: 新規画像生成
  - `edit`: 入力画像の指定箇所だけを局所編集
  - `judge_edit`: 入力画像を完成判定し、欠陥なしならそのまま採用、欠陥ありならそこだけ修正
- `edit`と`judge_edit`は`input`にプロジェクト内の相対パスを指定する
- 完成品か欠陥ありかをCodexに判定させたい場合は、必ず`judge_edit`を使う
- 既存kindで表現できない新しいkindが必要だと判断した場合は、勝手に作らずユーザーに質問する
- 生成物の出力先は`assets/generated/`配下に限定する
- 同じ`id`と`output`を再利用しない
- `get_image_request`の`completed`状態と画像を確認してから実装へ組み込む
- 不要な古い依頼は`cancel_image_request`、新しい依頼で置き換えた古い依頼は`supersede_image_request`で片付ける
- SVGやCSSで十分な素材はCodexへ依頼せず、既存のコード規約に沿って実装する

### ⚠️ 部屋・家具 moodboard を生成するときは「実績レシピ」を必ず踏襲 (作風が飛ぶ事故の防止)

部屋全体 moodboard や家具を含む room イラストを Codex で生成するときは、**プロンプトを自己流で書かない**。
Codex は「家具のある部屋」を **3D インテリアレンダー** にしてしまうバイアスが強く、自己流プロンプトだと
**KEN のフラット作風が完全に飛ぶ** (2026-06-23 navy 部屋 r1/r2 で実際に 3D 化して怒られた)。

- **必ず `docs/spec/10` の「部屋・家具 moodboard 生成レシピ (KEN フラット作風厳守)」節を読んでから発注する。**
- レシピの核: 本家 `sakura-room-ideal-layout-ken-style-r2-20260620` の prompt を
  `get_image_request(...)` で取得し、**それをテンプレに家具セット・パレット・参照背景だけ差し替える**。
  自己流で書き直さない。
- 参照は **flat な empty 背景 1 枚だけ**。「コンセプトイラスト提案」フレーミング。画風文 (基本図形優先・
  アウトライン無し・3D レンダ/写実/細密テクスチャ 一切なし) を最上位。家具は **カテゴリだけ伝えて自由デザイン**。
- 生成後は **必ず Read で開いてフラット 2D か (3D レンダー化してないか) 目視確認**。3D 化なら捨てて re-spin (不変ルール 5)。

### moodboard を作ったら、まず UI で見れるようにしてから view 抽出に進む (KEN 明示 2026-06-23)

新しい moodboard 画像を生成・採用したら、**いきなり view 抽出 (緑マスク〜catalog 登録) に進まない**。
先に **`src/editor/scene/objects-catalog.ts` に定数を足し、`src/editor/source/moodboard-manifest.ts` の
対象部屋 `MoodboardSource.imagePaths` に `{path, labelJa, contributes}` を追加**して、
`http://localhost:5273/` の **「抽出元」タブにその moodboard が表示される状態にする**。

- 表示できたことを **必ず確認してから** 21 view などの抽出フェーズに進む (Playwright で
  `img[src*="..."]` の `naturalWidth>0` を見る / スクショ等)。
- 理由: KEN が moodboard をすぐ閲覧・レビューできる状態を保つため。抽出を先走ると KEN が現物を見れない。
- `contributes` には各部屋がどの家具のどの角度 (front/side/dimetric) を供給するかを書く。

### moodboard レイアウトの命名は `L1/L2/L3/L4` (retry の `r` を使わない / KEN 明示 2026-06-23)

正式採用した部屋レイアウト moodboard は **部屋ごとに `L1 L2 L3 L4` の通し番号**で呼ぶ (QC が qc1-4 なのと揃える)。
- `L番号` は **その部屋の moodboard 表示順 (manifest imagePaths 順)** に対応する固定の board 番号。angle で呼ばない。
- ファイル名 = `<room>-L<N>-<date>.png` (例 `navy-room-L2-20260623.png`)、定数 = `<ROOM>_L<N>`、UI ラベル = `L<N> 説明`。
- **`rN` は「同じ画像の作り直し (retry/revision)」専用**。採用 board の識別に `r` を使わない。retry は `-v2` を付ける。
- 過去は `r` を board 番号と retry 番号の両方に流用して破綻していた (例 `sakura-...-r3-front-r5`)。2026-06-23 に L 体系へ統一。
