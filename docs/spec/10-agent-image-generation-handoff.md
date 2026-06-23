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
- **Codex**: MCPで起動対象の依頼IDをclaimし、画像生成、保存、検証、完了更新を行う
- **中央MCP**: プロジェクト登録、入力検証、SQLite永続化、排他的claimを行う
- **ユーザー**: 曖昧な依頼や失敗時の再依頼方針を判断する

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
4. 依頼の`kind`を選ぶ。
5. MCPツール`submit_and_wake_image_request`を呼び、Codex CLIを即時起動する。
6. `get_image_request`で状態を確認する。
7. `completed`と画像ファイルの存在を確認してから実装へ組み込む。

`kind`は次の3種類だけを使う。

| kind | input | 用途 |
|---|---|---|
| `generate` | なし | 新規画像生成 |
| `edit` | 必須 | 入力画像を見て、指定箇所だけ局所編集する |
| `judge_edit` | 必須 | 入力画像を完成判定し、欠陥なしならそのまま採用、欠陥ありならそこだけ編集する |

Claude Codeが既存の`generate`、`edit`、`judge_edit`では表現しづらい処理種別が
必要だと判断した場合は、勝手に新しい`kind`を作らず、ユーザーに追加要否を質問する。
ユーザーが同意した場合だけ、中央サーバーとこの仕様書を更新してから使う。

`submit_and_wake_image_request`の戻り値は依頼登録とworker起動結果だけを表す。
Codexが後から`complete_image_request`を呼んでも、MCPから依頼側へpush通知は送られない。
依頼側は対象IDを保持し、`get_image_request`で`completed`または`failed`を確認する。

依頼例:

```json
{
  "id": "bg-office-001",
  "projectId": "byond-generator",
  "kind": "generate",
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

`judge_edit`例:

```json
{
  "id": "bookshelf-judge-001",
  "projectId": "byond-generator",
  "kind": "judge_edit",
  "input": "assets/objects/navy-bookshelf-rightwall.png",
  "prompt": "cut-off、透明穴、他物体の断片があるか判定。欠陥なしなら入力をそのまま出力。欠陥ありなら欠陥だけ修正。",
  "purpose": "完成品判定と必要最小限の補修",
  "requirements": {
    "format": "png",
    "transparentBackground": true
  },
  "references": [],
  "output": "assets/generated/bookshelf-judge-001.png",
  "requestedBy": "claude-code"
}
```

#### judge_edit の実証済み挙動と運用ルール (2026-06-23 検証)

家具抽出物 4 件 (clean=bed/bookshelf, 欠陥あり=desk/table) で検証した結果:

- **判定 (欠陥の有無) は信頼できる = 4/4 正解。** 欠陥なしと判定すると
  `accept_input_image_request` で入力を **byte 完全一致のまま** 出力する (md5 一致を確認)。
  → 「これは clean か」のトリアージは judge_edit に任せてよい。clean を無改変で素通しできる。
- **`decision: "edited"` の出力は外科的でなく全体を再生成している。** 検証では:
  - 別解像度に再レンダ (desk 439×300→1536×1024, table 441×161→1945×809)
  - 偽透過チェッカーを実ピクセルで焼き込む (RGB 化 → `strip-fake-transparency.py` 必須)
  - 近傍を勝手に改変 (desk=モニター別形状に描き直し / table=指示に反して穴へ黒マグを新規追加)
- **したがって `edited` 出力はそのまま採用しない。** 必ず Read で目視し、形状・作風が変わっていれば捨てる。
  穴だけ正確に埋めたいときは judge_edit に任せず、従来の局所 cleanup
  (prep-fillin-canvas + crop-mask-with-roomctx + `kind: "edit"` で穴のみ指定) を使う。
- 要約: **judge_edit = 「直す要否の自動トリアージ」用。clean 判定は信頼、修復結果は不可信・要目視。**

#### Codex の baked 背景はチェッカーでなく単色クロマキーで出させる (2026-06-24, KEN 提案)

Codex は cleanup (`edit`/`judge_edit` の穴埋め) や単体生成で、透過のつもりでも **チェッカー (明るいグレー/白) を
実ピクセルで焼き込む**。チェッカーは cream/白の家具色に近く、`strip-fake-transparency.py` で抜くと
**家具の明色を食ったり残渣が残る**。

対策: **背景を「家具に出ない単色」で焼かせて chroma key する**。

- 依頼プロンプトに「**家具以外の領域を純マゼンタ #FF00FF のベタ塗りにする。チェッカー/透明/白にしない**」を入れる
  (`requirements.transparentBackground: false`、mustInclude に「背景=#FF00FF ベタ」、mustAvoid に「チェッカー/透明/白」)。
- 受領後 `scripts/key-chroma-bg.py <in> <out> --color magenta --tight-crop` で抜く (despill 付き)。
- **デフォルトは magenta #FF00FF**(家具にほぼ無い色なので汎用安全)。緑 #00FF00 も可だが
  **観葉植物・緑クッション・緑の本など緑を含む家具を食う**ので緑無しが確実な家具に限る。
- 実証 (2026-06-24): ベッド正面を緑背景→緑キーで残渣 0・cream を食わず抽出。緑だらけの観葉植物を
  マゼンタ背景→マゼンタキーで葉を 1px も食わず magenta 残渣 0 で抽出。
- これは緑マスク抽出 (`apply-green-mask`, 部屋から家具を切り出す工程) とは別物。
  あちらは「家具を緑に塗って緑を残す」、こちらは「背景を単色にして単色を抜く」。

## 部屋・家具 moodboard 生成レシピ (KEN フラット作風厳守・最重要)

部屋全体 moodboard や家具を含む room イラストを生成するときは、**プロンプトを自己流で書き直してはならない**。
必ず下記の「実績レシピ」をそのまま踏襲する。これは何度も事故ったので **仕様として固定**する。

### なぜ固定するか (失敗の構造)

Codex の画像バックエンド (gpt-5.4-mini) は **「家具のある部屋」= 3D インテリアレンダー (Planner5D / SketchUp /
写実シェーディング)** という強いバイアスを持つ。自己流のプロンプトや「この部屋に家具を populate して」という
フレーミング、写実的な素材指定 (例「木/黒天板・PC モニター」)、3D 寄りの参照画像を足すと、このバイアスに負けて
**KEN のフラット作風が完全に飛び、3D レンダーになる**。空室 (壁/床だけ) は単純なのでフラットを保てるが、
家具を載せた瞬間に 3D 化する。**model のせいではなくプロンプトレシピのせい** (同じ model でフラットにもなる)。

実証 (2026-06-23, navy 部屋): 自己流プロンプト + 2 枚参照 → r1/r2 とも完全に 3D レンダー化。
本家レシピをそのまま踏襲 → r3 で一発フラット成功。

### 実績レシピ = `sakura-room-L1-20260620` をテンプレにする

このジョブの全文プロンプトは `get_image_request("sakura-room-L1-20260620")` で取得できる。
**新しい部屋 (別年代・別テイスト) の moodboard を作るときは、この prompt をコピーして家具セット・パレット・
参照背景だけ差し替える**。要点 (どれも外さない):

1. **参照は flat な empty 背景を 1 枚だけ** 渡す。別の room 画像を style ref として 2 枚目に足さない
   (img2img が 3D に寄る・参照が混乱する)。empty 自体がフラットであること (下記)。
2. フレーミングは **「理想的な家具レイアウト案を 1 枚の完成形コンセプトイラストとして提案」**。
   「この部屋に家具を populate して」は写実を誘発するので使わない。
3. 画風文を **本家と同じ強さで最上位 ([最重要])** に置く:
   Piotr Antkowiak / 16personalities (MBTI) / Roblox / Vyond 風、**角丸ジオメトリック・基本図形 (矩形/円/三角) の
   組み合わせ優先**、アウトライン無し (色面ブロックのみ)、陰影は 1 段階暗い色のワンポイントのみ、
   グラデーション/airbrush 禁止、**写実・3D レンダ・photorealism・細密な木目/布目テクスチャ は一切なし**。
4. 家具は **カテゴリだけ伝えて Codex に自由デザインさせる**。素材を細かく指定 (「木/黒天板・PC モニター」等) すると
   写実を誘発する。
5. 配置 rule (region map F/B/L/R + 壁ぎわで view が決まる: 左壁=side / 奥壁=front / 内側=front-dimetric) も
   本家どおり記述する。

### 空室 (empty 背景) の作り方

新テイストの empty は **「色替えだけ」** で作る。flat な既存 empty (例 `assets/backgrounds/sakura-room-empty.png`) を
style + geometry の参照にし、「これは 2D フラットイラストの色替え。3D レンダー禁止。壁紙と床の色だけ変える。
ジオメトリ/カメラ/幅木/フラットさは 1px も変えない」と指示する。3D レンダー / ザラ質感 / 写実木目 / 隅の陰影を
反例で明示する。実証: navy-room-empty r1 (自己流→3D 化) → r2 (反例強化→フラット成功)。

### 出力後は必ず目視確認

publish 後に Read で開き、**フラット 2D イラストになっているか (3D レンダー/写実家具になっていないか)** を
自分の目で確認する。3D 化していたら捨てて、上記レシピに沿って新 id で re-spin する (CLAUDE.md 不変ルール 5 と同様)。

## 部屋 moodboard 生成の禁止事項 (家具抽出用)

家具を緑マスクで切り出すための「部屋全体 moodboard」を生成するときは、抽出パイプラインの前提
**「1 枚の moodboard 内に、対象家具は各 1 個だけ」** を必ず守る。これを破ると緑マスクがどの家具を
指すか曖昧になり、片方が orphan 化して抽出元タブの QC で「正面/壁付どっち?」の混乱になる。

禁止:

1. **同じ catalog id の家具を 1 枚に 2 個以上描かせない。** 1 家具 = moodboard 内で 1 箇所だけ。
   緑マスク → catalog variant の対応は「1 mask = 1 variant = 1 位置」を前提にしている。
2. **catalog で区別できない見た目そっくりの同種家具を複数置かせない。**
   例: 額を 2 枚 (抽象画 + 植物画)、スワッグを 2 個、時計を 2 個。catalog が 1 entry しか持たない種類は
   moodboard 内でも 1 個に絞る。どうしても 2 種類置くなら、色・形・サイズで **catalog の別 id として
   明確に区別できる**ほど見た目を変え、各々を別 entry として登録する前提にする。
3. 1 枚の moodboard 内は **視点 (抽出したい角度) を統一**する。同じ部屋で家具ごとに front/dimetric/side が
   混ざると、どの view を抽出したか曖昧になる。head-on は front 用、3/4 dimetric は立体用、wall-aligned は
   壁付用、と moodboard 1 枚 = 1 角度で発注する。

参考事例 (2026-06-23): `sakura-room-L1` は左壁と奥壁に額 2 枚・スワッグ 2 個を
描いてしまい、catalog は各 1 entry しか無いため奥壁側が orphan 化。QC overlay が「額が 1 個しか出ない /
正面か壁付か紛らわしい」状態になった。

## 新しい部屋を追加するときのチェックリスト (sakura ハードコードの一般化)

最初の部屋 (sakura-room) のコードには `sakura-` 固定のハードコードが点在している。新しい部屋
(navy-room 等) を追加するときは、下記を **すべて** 一般化しないと「navy 部屋なのに sakura の背景/設定で
処理される」事故になる (2026-06-23 に QC 背景が sakura 固定で navy が pink 背景になる事故が実際に起きた)。

新部屋追加時に必ず対応する箇所:

1. **空室背景**: `assets/backgrounds/<room>-empty.png` を用意し、`AddPanel.tsx` の `BUILTIN_BGS` に
   empty と layout moodboard を追加。
2. **source 定数**: `objects-catalog.ts` に `<ROOM>_EMPTY` / `<ROOM>_LAYOUT` 定数を追加。
3. **抽出元 manifest**: `moodboard-manifest.ts` の `MOODBOARD_SOURCES` に group を追加。
   **`emptyBg` は必須フィールド** — 指定し忘れると tsc エラーになる (QC レイアウトの背景に使う。
   未指定で sakura 固定にフォールバックすると別部屋の背景で QC される事故になるため必須化済み)。
4. **region map (scene 描画)**: `StageCanvas.tsx` の `currentRoomMap` の背景 image 判定に新部屋名を追加。
   **ジオメトリが sakura と同じ (recolor しただけ) なら `SAKURA_ROOM_REGIONS` を流用**、違うなら新しい
   region map を作る。`drawGrid` の region overlay (showRegions) も別ジオメトリなら map 選択を一般化する。
5. **mask 検出**: `scripts/moodboard-positions.py` の glob/regex プレフィックスに新部屋名を追加
   (`^(?:sakura|navy)-...` の形)。
6. **命名規約**: 家具 catalog id は `<room>-<furniture>`、緑マスクは `<variant-src-stem>-mask-<DATE>.png`
   (QC 自動配置のため variant src と stem 一致が必須)。

横展開のとき「`sakura` で grep して固定箇所を洗う」のが確実 (`grep -rn "sakura-room\|SAKURA_ROOM" src/`)。

## Codexの処理手順

通常は`submit_and_wake_image_request`が起動したオンデマンドworkerが次を実行する。
低頻度の画像依頼では定期Automationを使わない。

1. `claim_image_request`を起動対象の`id`と`workerId`で呼ぶ。
2. 対象IDをclaimできなければ報告して終了する。
3. 返されたプロジェクトのスタイルガイドは必要箇所だけ読み、参照画像は指定分だけ確認する。
4. `kind`を確認し、`generate`は新規生成、`edit`は入力画像の局所編集、`judge_edit`は完成判定と必要時だけ局所編集として処理する。
5. `judge_edit`で欠陥なしなら`accept_input_image_request`を呼び、入力画像をそのまま採用して完了する。
6. 生成または編集生成が必要な場合は、依頼に従って一時画像を生成する。
7. 生成画像の実ファイル探索は許可source rootに限定する。
8. `publish_generated_image`で指定された`output`へ配送する。
9. 形式、寸法、主要な必須要素と禁止事項を確認する。
10. `complete_image_request`を呼ぶ。
11. 処理不能なら`fail_image_request`を呼ぶ。

`claim_next_image_request`は手動・バッチ処理で最古のpending依頼を処理したい場合だけ使う。
オンデマンドworkerでは使わない。claimにはリース期限があり、Codexが処理途中で停止した場合は期限後に`pending`へ戻る。

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
- `edit`と`judge_edit`の`input`もByondルート基準の相対パスとする
- `..`、絶対出力パス、リポジトリ外への書き込みは禁止
- 出力先は`assets/generated/`配下に限定する
- 既存画像を上書きしない
- APIキー、個人情報、認証情報を依頼へ含めない
- Codexは画像生成依頼を理由にアプリコードや仕様書を変更しない
- エージェントは明示されない限りGit commitを行わない

## Codexオンデマンドワーカー

通常は`submit_and_wake_image_request`が`gpt-5.4-mini`の一時Codex CLIワーカーを
起動するため、定期Automationは不要。

オンデマンドworkerは`submit_and_wake_image_request`で登録された依頼IDを
`claim_image_request`で直接claimする。古いpending依頼が残っていても、起動対象以外を
処理してはならない。

起動に失敗しても依頼は`pending`に残る。ログは次へ保存される。

```text
/Users/KEN/codex-image-server/logs/<依頼ID>.log
```

ワーカー実行には、対象マシン、Codex CLIのログイン、対象プロジェクト、
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
