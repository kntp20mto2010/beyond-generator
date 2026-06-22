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

---

## Codexへの画像生成依頼

このプロジェクトで画像生成が必要な場合は、必ず
`docs/spec/10-agent-image-generation-handoff.md`を読み、そのプロトコルに従うこと。

- `codex-image-server` MCPの`submit_and_wake_image_request`で依頼し、Codexを即時起動する
- `wake.launched`が`false`でも依頼は`pending`に残るため、状態とログを確認する
- 完了通知はpushされないため、依頼後は対象IDを`get_image_request`で確認する
- 生成物の出力先は`assets/generated/`配下に限定する
- 同じ`id`を再利用しない
- `get_image_request`の`completed`状態と画像を確認してから実装へ組み込む
- SVGやCSSで十分な素材はCodexへ依頼せず、既存のコード規約に沿って実装する
