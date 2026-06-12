# 10. Claude Code → Codex 画像生成ハンドオフ仕様

## 目的

Claude CodeがByondの実装中に画像生成を必要としたとき、Codexへ依頼し、
生成物と処理結果を同じリポジトリ内で安全に受け渡す。

デスクトップアプリ同士のチャットや通知を直接監視しない。共有フォルダ上の
JSONファイルを唯一の依頼・状態管理インターフェースとする。

## 役割

- **Claude Code**: 必要な画像の仕様を決め、依頼JSONを発行し、完了後の画像を実装へ組み込む
- **Codex**: pending依頼を取得し、画像を生成し、検証結果と生成物を返す
- **ユーザー**: Codex側の監視Automationを有効にし、曖昧な依頼や失敗時に判断する

Claude Codeは画像生成そのものを代行せず、Codexの完了結果を待つ。
Codexは依頼されていないアプリコードを変更しない。

## ディレクトリ

```text
.agent-tasks/
  image-requests/
    pending/
    processing/
    completed/
    failed/
assets/
  generated/
```

- `.agent-tasks/image-requests/`: エージェント間の制御情報
- `assets/generated/`: アプリで利用する生成画像
- 1依頼につき1つのJSONファイルを使用する
- JSONファイル名は `<id>.json` とする

## 依頼JSON

Claude Codeは次の形式で依頼を作成する。

```json
{
  "schemaVersion": 1,
  "id": "bg-office-001",
  "type": "image_generation",
  "requestedBy": "claude-code",
  "createdAt": "2026-06-12T12:00:00Z",
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
  "status": "pending"
}
```

### 必須フィールド

| フィールド | 内容 |
|---|---|
| `schemaVersion` | 現在は`1` |
| `id` | リポジトリ内で一意なASCII識別子 |
| `type` | `image_generation`固定 |
| `requestedBy` | `claude-code` |
| `createdAt` | ISO 8601 UTC日時 |
| `prompt` | 画像生成モデルへ渡せる具体的な説明 |
| `purpose` | 画像をどこで何に使うか |
| `requirements` | 寸法、形式、必須要素、禁止要素 |
| `references` | 参照ファイルのリポジトリ相対パス配列 |
| `output` | `assets/generated/`配下の相対パス |
| `status` | 発行時は`pending` |

`id`と`output`は既存依頼・既存ファイルと重複させない。
外部URLではなく、可能な限りリポジトリ内の参照画像を指定する。

## Claude Codeの発行手順

1. 画像が本当に必要か確認する。SVGやCSSで十分なUI素材はコードとして実装する。
2. `id`、用途、構図、スタイル、禁止事項、出力先を決める。
3. 依頼を`.agent-tasks/image-requests/<id>.json.tmp`へ完全に書く。
4. JSONとして再読込できることと、参照ファイルが存在することを確認する。
5. `.tmp`を`pending/<id>.json`へrenameする。
6. 完了までは同じ`id`の依頼を再発行しない。

`pending/`へ直接書き始めてはならない。Codexが書き込み途中のJSONを取得する
競合を避けるため、同一ファイルシステム上のrenameで公開する。

## Codexの取得手順

Codex側では、Byondプロジェクトに紐づくThread Automationが定期的に
`pending/`を確認する。

1. `pending/`をファイル名昇順で走査する。
2. JSONの必須フィールド、出力先、参照ファイルを検証する。
3. `pending/<id>.json`を`processing/<id>.json`へrenameしてclaimする。
4. 依頼に従って画像を生成する。
5. 生成物を指定された`output`へ保存する。
6. 生成物の形式、寸法、主要な禁止事項を確認する。
7. 結果フィールドを追記し、`completed/<id>.json`へrenameする。

`processing/`へのrenameに失敗した依頼は、別処理が取得済みとみなして触らない。

## 完了JSON

```json
{
  "schemaVersion": 1,
  "id": "bg-office-001",
  "type": "image_generation",
  "requestedBy": "claude-code",
  "createdAt": "2026-06-12T12:00:00Z",
  "prompt": "フラットデザインの明るいオフィス背景。人物と文字は含めない。",
  "purpose": "シーンエディタ用のオフィス背景",
  "requirements": {
    "aspectRatio": "16:9",
    "width": 1536,
    "height": 864,
    "format": "png",
    "transparentBackground": false,
    "mustInclude": [],
    "mustAvoid": ["文字", "ロゴ", "写実表現", "人物"]
  },
  "references": [],
  "output": "assets/generated/bg-office-001.png",
  "status": "completed",
  "result": {
    "completedBy": "codex",
    "completedAt": "2026-06-12T12:05:00Z",
    "actualWidth": 1536,
    "actualHeight": 864,
    "format": "png",
    "notes": "依頼どおり人物と文字を含まない背景を生成した。"
  }
}
```

Claude Codeは`completed/`のJSONと画像ファイルの両方が存在する場合だけ成功と
みなす。組み込み前に寸法と用途への適合を確認する。

## 失敗JSON

処理不能の場合、Codexは画像を成功扱いせず、依頼JSONへ以下を追記して
`failed/<id>.json`へ移動する。

```json
{
  "status": "failed",
  "error": {
    "failedBy": "codex",
    "failedAt": "2026-06-12T12:05:00Z",
    "code": "INVALID_REQUEST",
    "message": "widthとheightが指定されていません。",
    "retryable": true
  }
}
```

主なエラーコード:

| コード | 意味 |
|---|---|
| `INVALID_REQUEST` | 必須項目不足、矛盾、無効なパス |
| `MISSING_REFERENCE` | 参照ファイルが存在しない |
| `GENERATION_FAILED` | 画像生成処理に失敗 |
| `VALIDATION_FAILED` | 寸法、形式、禁止事項などの検証に失敗 |
| `OUTPUT_CONFLICT` | 出力先が既存ファイルと衝突 |

Claude Codeが再依頼する場合は、元JSONを直接pendingへ戻さず、原因を修正して
新しい`id`を発行する。例: `bg-office-001-r2`。

## パスと安全規則

- すべてのパスはリポジトリルート基準の相対パスとする
- `..`、絶対パス、シンボリックリンク経由のリポジトリ外書き込みは禁止
- 出力先は`assets/generated/`配下に限定する
- 既存画像を上書きしない
- APIキー、個人情報、認証情報をJSONやプロンプトへ書かない
- 画像生成依頼を理由に、Codexがアプリコードや仕様書を変更しない

## Git運用

- `assets/generated/`の採用画像はGit管理対象にできる
- `.agent-tasks/image-requests/processing/`は一時状態であり、コミットしない
- `pending/`、`completed/`、`failed/`を履歴として残すかは運用開始後に決める
- エージェントはユーザーから明示されない限りcommitしない

## Automationの前提

ファイル作成だけではCodexデスクトップのスレッドは自動的に起動しない。
Codex側に、このプロジェクトと現在の会話へ紐づくThread Automationを設定し、
1分程度の間隔でpending依頼を確認する。

Automationの実行には、対象マシンが起動中で、Codexアプリが動作し、
`/Users/KEN/byond-generator`が利用可能である必要がある。

推奨Automationプロンプト:

```text
/Users/KEN/byond-generator の
.agent-tasks/image-requests/pending/ を確認する。
依頼がなければ報告せず終了する。
依頼があれば docs/spec/10-agent-image-generation-handoff.md に従い、
1件ずつclaim、画像生成、検証、完了または失敗状態への移動を行う。
依頼されていないコード変更やGit commitは行わない。
```

## 将来拡張

依頼数や即時性の要求が増えた場合は、JSON形式と状態遷移を維持したまま、
Thread AutomationによるポーリングをローカルMCPサーバーまたは
`codex app-server`を利用する通知ブリッジへ置き換える。
