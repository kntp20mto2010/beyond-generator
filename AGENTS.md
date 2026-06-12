# Codex Instructions

## Codexへの画像生成依頼

このプロジェクトで画像生成が必要な場合は、必ず
`docs/spec/10-agent-image-generation-handoff.md`を読み、そのプロトコルに従うこと。

- 画像生成依頼は`.agent-tasks/image-requests/pending/`へJSONで発行する
- 書き込み途中の取得を防ぐため、一時ファイルからrenameして公開する
- 生成物の出力先は`assets/generated/`配下に限定する
- 同じ`id`を再利用しない
- `completed/`の結果JSONと画像を確認してから実装へ組み込む
- SVGやCSSで十分な素材はCodexへ依頼せず、既存のコード規約に沿って実装する

