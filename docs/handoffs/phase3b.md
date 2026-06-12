# Phase 3b ハンドオフ: プリセットクリップ7本+クリップシートCLI(設計: fable5 → 実装: sonnet)

## ゴール(Phase 3の受入条件の完成)

1. プリセットクリップが10本揃う(既存 idle/walk/run + **talk1/talk2/point/wave/nod/headShake/jump**)
2. `npm run clipsheet` で **全クリップ×位相4サンプルのグリッドPNG** が exports/ に出る
3. プレビューのアニメselectで10本すべて再生・相互切替(クロスフェード)できる
4. テスト全green(既存126件+新規)

## A. クリップ7本のデータ作成

### 共通規約(必読: src/presets/clips/walk.ts と run.ts が手本)

- 1ファイル=1クリップ(`src/presets/clips/<id>.ts`)、`src/presets/clips/index.ts` のCLIPSに登録(登録順がUIの並び順: idle, walk, run, talk1, talk2, point, wave, nod, headShake, jump)
- 時刻は秒。回転はdeg、**+θ=画面上時計回り**(y-down)。腕を上げる=upperArmLは負方向(例: 真上≈-170、前方水平≈-90)
- **ループクリップは末尾キーを先頭値・t=durationで閉じる**(テストが機械検証する)
- 単発(loop:false)は最終キーの値で保持される(point等の「構え続ける」はこれを利用)
- virtualVelocityは全て0(移動しないクリップ)
- イージングは基本 sineInOut。衝撃系(着地)は quadIn/quadOut

### 各クリップ仕様

| id | label | loop | duration | 内容 |
|---|---|---|---|---|
| talk1 | 会話A | true | 1.6 | 片手説明: upperArmL -50を中心に±10で揺らす、forearmL -30±12、頭を小さくうなずく(head 0↔3)、torso 3。handShape open |
| talk2 | 会話B | true | 2.0 | 両手交互: upperArmL/Rを半上げ(-35前後)で交互に強調(位相半周期ずらし)、forearm ±15、head相づち。handShape open |
| point | 指差し | **false** | 0.5 | 腕を前方水平へ: upperArmL 0→-95(backOutで少しオーバーシュート)、forearmL 0→-8、torso 4、head 2。handShape [[0,"open"],[0.2,"point"]]。最終姿勢で保持 |
| wave | 手を振る | true | 0.9 | upperArmL -150固定キー、forearmLを-30↔+20で往復(2往復/周期)、head 4傾け。handShape open |
| nod | うなずき | **false** | 0.9 | head 0→14→2→12→0 の2回うなずき(sineInOut)、torso 0→2→0 |
| headShake | 首振り | **false** | 0.8 | head 0→-9→8→-6→0(イヤイヤ。2D正面なので傾き往復で表現)、体は不動 |
| jump | ジャンプ | **false** | 1.0 | 予備動作(0-0.25: root.y +12、thigh両方±でしゃがみ、shin曲げ、torso 8)→跳躍(0.25-0.55: root.y -75 quadOut、脚伸ばし、両腕-140/+140へ振り上げ)→着地(0.55-0.8: root.y 0 quadIn、再びしゃがみ)→復帰(0.8-1.0: 全部0へ)。handShape open |

- L/R対称の腕振り: upperArmRはupperArmLの符号反転値(walk.ts参照)
- 「保持」の絵が決まるpoint/waveは、停止(⏹)からの再生で違和感がないか必ずプレビューで目視すること

## B. クリップシートCLI

### ページ(src/editor/character/ClipSheetPage.tsx)

- `location.hash === "#clip-sheet"` で表示(App.tsxの分岐にケース追加。ContactSheetPageの分岐と並べる)
- グリッド: **行=CLIPS全クリップ(登録順)、列=位相サンプル4点**(t = 0 / 0.25d / 0.5d / 0.75d。dはduration)
  - 各セル: sampleClipでポーズ評価(物理なし・表情neutral・blinkなし・静止)→ buildRenderList → buildCharacterContainer
  - セル 190×300、scale 0.27、行ラベル=クリップlabel+id、列ヘッダ="0%/25%/50%/75%"
  - キャラはContactSheetPageと同じ取得順(`__csChar` → localStorage → TEMPLATE_A)。ContactSheetPageの loadCharacter / レイアウト思想を流用(共通化できる部分は小さなヘルパーに抽出してよいが、過度な抽象化は不要)
- 描画完了で `window.__clipSheetReady = true`

### CLI(tools/contactsheet/run-clipsheet.mjs)

- `npm run clipsheet [-- path/to/char.byc.json] [-- -o out.png]`
- run.mjs と同じ流れ(server再利用/起動 → #clip-sheet → readyを待つ → canvasスクショ)。**run.mjsと共通の処理は tools/contactsheet/lib.mjs に抽出して両方から使う**(起動・待機・スクショ部分)
- デフォルト出力: `exports/clipsheet-<キャラ名 or template>.png`
- package.json: `"clipsheet": "node tools/contactsheet/run-clipsheet.mjs"`

## テスト(vitest追加)

1. CLIPS登録が10本、idがファイル名と一致、ループクリップ全てが末尾キー規約を満たす(既存テストがあるので自動でカバーされることを確認)
2. point: loop=false、t=10で最終姿勢を保持(upperArmL ≈ -95)
3. jump: t=0.4 で root.y < -40(跳躍中)、t=1.0 で ≈ 0(着地復帰)
4. 全10本がClipDocSchemaを通る(既存テストが自動カバー)
5. clipsheetのセル配置pure関数(流用 or 新設)のテスト

## 落とし穴

- 回転の符号: 腕の「上げ」は負。walk/runの値を必ず参照してから書く
- nod/headShake/pointは**体幹・脚のキーを持たない**(クロスフェードでidle等と自然に合成されるよう、不要なボーンにキーを置かない)
- handShapeキーは時刻昇順
- ClipSheetPageはticker禁止(静止1回描画)
- lib.mjs抽出時、既存 `npm run contactsheet` を壊さないこと(両方実行して確認)
- docs/ 変更禁止、git操作禁止、UIラベル日本語、コードコメント最小限

## 完了報告に含めること

npm test / npm run build / npm run contactsheet / npm run clipsheet の結果(出力パス)、追加・変更ファイルツリー、逸脱と理由、既知の制限。
