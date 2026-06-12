# 10. Claude Code → Codex 画像生成ハンドオフ仕様

## 目的

Claude CodeがByondの実装中に画像生成を必要としたとき、中央MCPサーバーへ
依頼を登録し、Codexが画像生成と成果物の保存を担当する。

複数プロジェクト共通のキュー、状態管理、排他制御は以下へ分離する。

```text
/Users/KEN/codex-image-server
```

Byondリポジトリ内には生成された採用画像だけを置き、依頼状態を管理する
JSONキューは作らない。SQLite DBを唯一の状態管理インターフェースとする。

## 役割

- **Claude Code**: 画像仕様を決め、MCPで依頼し、完了後の画像を実装へ組み込む
- **Codex**: MCPで依頼をclaimし、画像生成、保存、検証、完了更新を行う
- **中央MCP**: プロジェクト登録、入力検証、SQLite永続化、排他的claimを行う
- **ユーザー**: Codex側の監視Automationを有効にし、曖昧な依頼を判断する

MCPサーバー自身は画像を生成しない。Codexの組み込み画像生成機能と中央キューを
接続する役割だけを持つ。

## プロジェクト登録

Byondは中央キューへ次の内容で登録する。

```json
{
  "projectId": "byond-generator",
  "rootPath": "/Users/KEN/byond-generator",
  "outputDir": "assets/generated",
  "styleGuide": "docs/spec/01-vision-and-scope.md"
}
```

登録は初回または設定変更時に`register_image_project`で行う。

## Claude Codeの発行手順

1. SVGやCSSで十分な素材ではなく、画像生成が必要か確認する。
2. 用途、構図、スタイル、寸法、必須要素、禁止事項を決める。
3. 一意な依頼IDと`assets/generated/`配下の未使用出力先を決める。
4. MCPツール`submit_image_request`を呼ぶ。
5. `get_image_request`で状態を確認する。
6. `completed`と画像ファイルの存在を確認してから実装へ組み込む。

依頼例:

```json
{
  "id": "bg-office-001",
  "projectId": "byond-generator",
  "prompt": "フラットデザインの明るいオフィス背景。人物と文字は含めない。",
  "purpose": "シーンエディタ用のオフィス背景",
  "requirements": {
    "aspectRatio": "16:9",
    "width": 1536,
    "height": 864,
    "format": "png",
    "transparentBackground": false,
    "mustInclude": [
      "広い余白",
      "単純な幾何学形状",
      "Byondの既存パレットと調和する色"
    ],
    "mustAvoid": [
      "文字",
      "ロゴ",
      "写実表現",
      "人物"
    ]
  },
  "references": [],
  "output": "assets/generated/bg-office-001.png",
  "requestedBy": "claude-code"
}
```

`id`と`output`は再利用しない。失敗後に再依頼する場合は
`bg-office-001-r2`のような新しいIDを使う。

## Codexの処理手順

Codex側では、Thread Automationが定期的に次を実行する。

1. `claim_next_image_request`を呼ぶ。
2. 依頼がなければ報告せず終了する。
3. 返されたプロジェクトのスタイルガイドと参照画像を読む。
4. 依頼に従って一時画像を生成する。
5. `publish_generated_image`で指定された`output`へ配送する。
6. 形式、寸法、主要な必須要素と禁止事項を確認する。
7. `complete_image_request`を呼ぶ。
8. 処理不能なら`fail_image_request`を呼ぶ。

推奨worker IDは`codex-desktop-main`とする。claimにはリース期限があり、
Codexが処理途中で停止した場合は期限後にpendingへ戻る。

## 状態

| 状態 | 意味 |
|---|---|
| `pending` | 未取得 |
| `processing` | Codexがclaim済み |
| `completed` | 画像保存と検証が完了 |
| `failed` | 処理不能。`error`に理由を保持 |

Claude CodeはDB上の`completed`だけでなく、対象画像が実際に存在することも
確認する。MCPサーバーも画像が存在しない完了更新を拒否する。

主な失敗コード:

| コード | 意味 |
|---|---|
| `INVALID_REQUEST` | 要件不足または矛盾 |
| `MISSING_REFERENCE` | 参照ファイルが存在しない |
| `GENERATION_FAILED` | 画像生成処理に失敗 |
| `VALIDATION_FAILED` | 寸法、形式、禁止事項などの検証に失敗 |
| `OUTPUT_CONFLICT` | 出力先が既存ファイルと衝突 |

## パスと安全規則

- 出力先と参照先はByondルート基準の相対パスとする
- `..`、絶対出力パス、リポジトリ外への書き込みは禁止
- 出力先は`assets/generated/`配下に限定する
- 既存画像を上書きしない
- APIキー、個人情報、認証情報を依頼へ含めない
- Codexは画像生成依頼を理由にアプリコードや仕様書を変更しない
- エージェントは明示されない限りGit commitを行わない

## Codex Automation

ファイル変更だけではCodexデスクトップのスレッドは起動しないため、中央MCPを
利用できるCodexスレッドへThread Automationを設定する。

推奨プロンプト:

```text
codex-image-server MCPのclaim_next_image_requestを
workerId="codex-desktop-main"で呼ぶ。
依頼がなければ報告せず終了する。
依頼があれば、登録プロジェクトの仕様と参照画像を確認し、
画像生成、publish_generated_imageによる配送、検証を行ってから
complete_image_requestを呼ぶ。
処理不能ならfail_image_requestへ具体的なエラーを記録する。
依頼されていないコード変更やGit commitは行わない。
1回の起動で最大3件まで処理する。
```

Automationの実行には、対象マシン、Codexアプリ、対象プロジェクト、
`/Users/KEN/codex-image-server`が利用可能である必要がある。

## 管理

中央キューの確認:

```bash
cd /Users/KEN/codex-image-server
npm run cli -- projects
npm run cli -- jobs byond-generator
```

中央MCPの実装、DBスキーマ、クライアント登録方法は
`/Users/KEN/codex-image-server/README.md`を参照する。
