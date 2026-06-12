# Claude Code Instructions

## Codexへの画像生成依頼

このプロジェクトで画像生成が必要な場合は、必ず
`docs/spec/10-agent-image-generation-handoff.md`を読み、そのプロトコルに従うこと。

- `codex-image-server` MCPの`submit_image_request`で依頼する
- 生成物の出力先は`assets/generated/`配下に限定する
- 同じ`id`を再利用しない
- `get_image_request`の`completed`状態と画像を確認してから実装へ組み込む
- SVGやCSSで十分な素材はCodexへ依頼せず、既存のコード規約に沿って実装する
