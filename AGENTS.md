# Codex Instructions

## Codexへの画像生成依頼

このプロジェクトで画像生成が必要な場合は、必ず
`docs/spec/10-agent-image-generation-handoff.md`を読み、そのプロトコルに従うこと。

- 画像生成依頼は`codex-image-server` MCPの`submit_and_wake_image_request`で発行する
- 完了通知はpushされないため、依頼側は`get_image_request`で対象IDを確認する
- 依頼には`kind`を指定する。新規生成は`generate`、局所編集は`edit`、完成判定して必要時だけ直す場合は`judge_edit`
- `edit`と`judge_edit`は`input`にプロジェクト内の相対パスを指定する
- 既存kindで表現できない新しいkindが必要だと判断した場合は、勝手に作らずユーザーに質問する
- 生成物の出力先は`assets/generated/`配下に限定する
- 同じ`id`を再利用しない
- `completed`状態と画像ファイルを確認してから実装へ組み込む
- SVGやCSSで十分な素材はCodexへ依頼せず、既存のコード規約に沿って実装する
