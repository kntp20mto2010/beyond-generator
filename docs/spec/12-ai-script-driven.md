# 12. AI台本駆動レイヤー(Story Layer)

Phase 7。自由文プロット → AIが台本(Story)生成 → 決定論コンパイラで ProjectDoc 化 → 既存ランタイムで再生/MP4書き出し。
設計は多視点ワークフロー(3案を独立生成→批判採点→統合)の成果。勝者は**ショット型**の3層分離を骨格に、**ビートリスト型**の `audioDurations` 明示注入、**脚本型**の cast 辞書・逆コンパイル対称性を接ぎ木。

## 設計が前提から排除した「2つの嘘」(採点で全案が突かれた点)

1. **決定論採時 = 実物再現ではない。** 実 `project.byp.json` の `t` は人間の手調整値(孤立した表情キー、0.1秒ズラし等)を含む。**est採時は「新規生成時の自然な間」を作るもので、手調整済みProjectDocのバイト再現は目標にしない。** 手調整の絶対秒は台本で `at:` を明示したときだけ一致する。
2. **`buildScriptEvents()` は非可逆**(clip id→label / moveTo.y・speed / audioパス / camera x,y,ease を捨てる)。よって `decompile` は buildScriptEvents を経由せず、**ProjectDoc を直接走査**する独立関数。round-trip は「コンパイラ生成直後のProjectDoc」に限り構造同型を保証(完全バイト可逆は非保証)。

## 三層分離

```
Story (.bys.json)   人間とAIが書く/読む唯一の真実源。シーン=cast配列+順序付きshots。t省略。
   ↓ compile(story)  決定論(現在時刻/乱数/I/O不使用)。外部入力は audioDurations のみ
ProjectDoc (.byp.json)  要素別配列・全t絶対秒・seed固定。手で触らない中間生成物(触ったらStory層の管理外)
   ↓ 既存ランタイム  facing/idle/到着idle/crossfade/talk長/口パク/歩行速度/Y維持 を自動推論(8機構)
```

## 1. 台本層 JSON スキーマ(zod相当)

トップは `Story`。ProjectDoc の「要素別配列」を時間軸 `shots[]` へ反転し、コンパイラが de-linearize する。**`t`(絶対秒)は原則書かない。**

```ts
const StorySchema = z.object({
  format: z.literal("byond-story/1"),                 // 必須
  id: z.string().optional(),                          // 省略=slug(title)の決定論ハッシュ
  title: z.string(),                                  // 必須 → ProjectDoc.title
  defaults: z.object({
    charPerSec:   z.number().positive().default(5.5), // 採時話速(実測VOICEVOX≈4.45発話字/秒。§7参照)
    gapSec:       z.number().min(0).default(0.25),    // shot間の既定ギャップ
    balloonShape: z.enum(["round","cloud","spike"]).default("round"),
    scale:        z.number().positive().default(0.9),
    groundY:      z.number().default(700),
  }).default({}),
  bgm: z.union([z.string(), z.object({
    audio: z.string(), gain: z.number().min(0).default(0.5), loop: z.boolean().default(true),
  })]).optional(),
  audioDurations: z.record(z.string(), z.number().positive()).default({}), // ★決定論の鍵: 実音声長(秒)。未掲載は est
  scenes: z.array(SceneSchema).min(1),
});

const SceneSchema = z.object({
  id: z.string().optional(),                          // 省略="scene-{index+1}"
  bg: z.string().nullable().optional(),               // "assets/.../x.png"=画像 / "#hex"=色 / null=紙色
  transition: z.union([                               // 前シーンから受ける切替(scenes[0]無視)
    z.enum(["cut","fade","wipe","slide"]),
    z.object({ type: z.enum(["cut","fade","wipe","slide"]), dur: z.number().min(0) }),
  ]).default("cut"),
  duration: z.number().positive().optional(),         // 省略=採時末+hold で自動
  hold: z.number().min(0).default(0.5),
  cast: z.array(CastSchema).min(1),                   // 配列順=z昇順 0,1,2…
  shots: z.array(ShotSchema),                         // ★上演順。t は基本書かない
});

const PlaceSchema = z.union([
  z.enum(["farLeft","left","centerLeft","center","centerRight","right","farRight"]),
  z.object({ x: z.number(), y: z.number().optional() }),
]);
// 決定論表(1920幅, y=groundY): farLeft=200 left=320 centerLeft=680 center=960 centerRight=1240 right=1600 farRight=1780

const CastSchema = z.object({
  id:   z.string(),                                   // shotから参照する短いローカルID(例 "hana")
  ref:  z.string(),                                   // "builtin:template-a" 等
  at:   PlaceSchema,                                  // 初期位置
  scale: z.number().positive().optional(),           // 省略=defaults.scale
  face: z.enum(["left","right"]).optional(),         // flipX解決。省略=移動方向から自動(右既定)
  mood: z.string().optional(),                        // 初期表情preset(t=0)。省略=neutral
  enter: EffectTypeSchema.optional(),                 // 登場効果。省略=cut
});

const ShotSchema = z.object({
  // 発話(最頻)
  who: z.string().optional(), line: z.string().optional(), emotion: z.string().optional(),
  clip: z.enum(["talk1","talk2"]).optional(),         // 省略=talk1
  voice: z.string().optional(),                       // 省略=連番自動割当 vo-NNN
  silent: z.boolean().default(false),                 // true=音声/口パク無し、balloonのみ
  balloon: z.object({                                 // 全任意(微調整の逃げ道)
    shape: z.enum(["round","cloud","spike"]).optional(),
    at: PlaceSchema.optional(), w: z.number().positive().optional(), h: z.number().positive().optional(),
    fill: z.string().optional(), keep: z.boolean().optional(),   // keep=次話者でfadeしない
    tail: z.union([z.literal("auto"), z.object({x:z.number(),y:z.number()})]).default("auto"),
  }).optional(),
  // 動作
  do: z.string().optional(),                          // point/wave/nod/headShake/jump/idle…
  walkTo: PlaceSchema.optional(), runTo: PlaceSchema.optional(), speed: z.number().positive().default(1),
  // 演出
  camera: z.union([z.literal("reset"), z.object({
    on: z.union([z.string(), PlaceSchema]).optional(), zoom: z.number().positive().default(1.35),
    ease: z.string().optional(),
  })]).optional(),
  caption: z.string().optional(),                     // 画面テキスト(TextElement)
  // timing(基本書かない。書けば固定アンカー)
  at: z.number().optional(), after: z.union([z.literal("prev"), z.literal("prevStart"), z.number()]).optional(),
  gap: z.number().optional(), hold: z.number().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),  // 生成要素へshallow-merge(9割不要)
});
```

**ID語彙は約49語に厳格制限**(zod enum で hallucination を生成段階で弾く):
`clip ∈ {idle,walk,run,talk1,talk2,point,wave,nod,headShake,jump}` / `preset ∈ {neutral,smile,laugh,sad,cry,angry,surprised,worried,smug,tired}` / `shape ∈ {round,cloud,spike}` / `effect ∈ {cut,fade,slideL,slideR,slideT,slideB,pop}` / `transition ∈ {cut,fade,wipe,slide}`。

## 2. コンパイラ契約

```ts
function compile(story: Story): ProjectDoc;     // 決定論。外部依存は story.audioDurations のみ
function decompile(project: ProjectDoc): Story; // ProjectDocを直接走査(buildScriptEvents非経由)
```

| 自動導出(台本に書かない) | 導出元 |
|---|---|
| 全要素の `t` | §採時アルゴリズム |
| `facing` | moveTo水平方向 |
| t=0 idle / 到着 idle / crossfade | ランタイム |
| talk長 / 口パク列 | 音声バッファ |
| 歩行速度 / moveTo.y | DEFAULT_WALK_V=240, 開始Y維持 |
| balloon の transform/tail/w/h/enter | 話者位置+テキスト長 |
| seed(=scene index)/id/z順/duration | 決定論導出 |
| formatVersion=1, stage, durationMode | 固定 |

| 台本に要求(意味のみ) | フィールド |
|---|---|
| 誰が・何を・どんな顔で言うか | who, line, emotion |
| 誰がどこへ動くか | who, walkTo/runTo/do |
| 上演順・登場人物・配置 | shots[]順, cast[] |
| 背景・切替・カメラ寄り | bg, transition, camera |

### 決定論的採時(シーンごと cursor=0 から左→右の単一パス)

```
estTalk(line) = ceil(([...line].length / charPerSec)*10)/10 + 0.2*count(、) + 0.2   ※実測7サンプルで較正
voiceLen(v)   = audioDurations[v] ?? estTalk(line) ?? 3.0      ★実長優先
CLIP_DUR = {idle:3.2, walk:0.8, run:0.52, talk1:1.6, talk2:2.0, point:0.5, wave:0.9, nod:0.9, headShake:0.8, jump:1.0}
VEL = {walk:240, run:580, *:240};  estMove(from,to,clip) = |to.x-from.x|/(VEL[clip]*speed)

各shot:
1) 開始t0: at数値→t0=at / after="prevStart"→t0=lastT0(重ねる) / after数値→prevEnd+after
            / gap→cursor+gap / 既定→cursor
2) 占有尺dur: hold指定→hold / else parts=[line→voiceLen, do→CLIP_DUR, walkTo/runTo→estMove,
            camera→1.0, caption→max(estTalk,1.2)]; dur=max(parts ∪ {0.3})
3) prevEnd=t0+dur; lastT0=t0; (prevStart以外)cursor=max(cursor, prevEnd+gapSec)  ※単調増加
4) 全tを出力直前に1/30s(1フレーム)グリッドへ量子化(累積誤差と非決定を排除)
```

**不変条件**: `balloon.enter.delay === 話者 talk.t`(同じ t0 から両方を生成して構造保証)。実データ全4シーンで成立。「歩いて到着してから喋る」は `walkTo` shot と `line` shot を**別ショット**にし、line側を `after:"prev"`(既定=prevEnd基準)で繋ぐ。

## 3. セリフ1行 → 4トラック展開(同一 t0 で同期生成)

- **A. talk** → `who.talks[]` に `{t:t0, audio:resolveVoice(voice), gain:1}`
- **B. action** → `who.actions[]` に `{t:t0, clip:clip??"talk1", speed:1}`(直前同clipは冪等抑制)
- **C. balloon** → 新規 BalloonElement: text=line / shape / transform=話者頭上(右寄りなら左へ寄せ画面内) / tail=auto(話者側) / **enter={pop, delay:t0, dur:0.3}** / exit=次が別話者lineなら{fade, at:その t0}・`keep`か無ければ{at:null} / w,h=autoSize(line) / z=200+順
- **D. expression** → `emotion` 指定時のみ `who.expressions[]` に `{t:t0, preset:emotion}`。**記号からの表情推定はしない**(誤推定温床を排除)。初期表情は `cast.mood`、発話中の変化は `emotion` で分離

**autoSize(line)**: len≤6→{360,170} / ≤10→{430,175} / ≤14→{480,180} / ≤18→{540,185} / else→{580,190}。凝る場合のみ `balloon.w/h` か `raw` で上書き。

### TTS未生成セリフ(3段階)
1. `voice`明示+`audioDurations`掲載 → 実長で採時・再生(理想)
2. `voice`明示or連番だが長さ未掲載 → `estTalk`で採時(プレースホルダ)。ProjectDocには `talks[].audio` を出力 → 後で `assets/audio/vo-NNN.wav` を置けばランタイムが自動で実長/口パクに差し替え(**後生成OK**)
3. `silent:true` → talks出さず balloon のみ(無音・口パク無し)

連番割当(決定論): シーン横断で `line` 出現順に `vo-001, vo-002…`(`assets/audio/vo-NNN.wav`)。再コンパイルで同番。

### 音声エンジン: VOICEVOX(ローカルHTTP `:50021`)

開発用TTSは macOS `say` から **VOICEVOX** へ移行(高品質・キャラ別の本物の声)。ランタイムは音声をパス参照するだけなのでエンジン非依存 — 生成手順だけが変わる。

- 合成手順: `POST /audio_query?speaker=ID&text=…` → query JSONに `outputSamplingRate:44100, outputStereo:false` を上書き → `POST /synthesis?speaker=ID` → WAV(44.1kHz mono Int16、既存と同フォーマット)
- **キャラ→話者マップ**(差し替え自由): ハル(template-a)= 青山龍星 ノーマル(13)/ ハナ(template-b)= 春日部つむぎ ノーマル(8)
- 7bのAI生成では `line` → VOICEVOX合成 → `assets/audio/vo-NNN.wav` + `audioDurations[vo-NNN]=実長` をパイプラインに組み込む(キャラの話者IDは cast に `voiceId` を後付け拡張)
- サンプル「学校の日常」の vo-001〜007 はVOICEVOX再生成済み(実測話速4.45発話字/秒)

## 4. Claude API連携(spec 09準拠・「提案→ユーザー確認」ドラフト方式)

| 段階 | モデル | 頻度 | 担当 |
|---|---|---|---|
| ① プロット→シーン分割・絵コンテ下書き | `claude-sonnet-4-6` | 動画毎1回 | 自由文 → `Story.scenes[]` ドラフト |
| ② セリフ→表情/アクション提案 | `claude-haiku-4-5` | セリフ毎(バッチ1コール) | 各 `line` に `emotion`+任意 `do`/`clip` |

- 両段とも **structured outputs(json_schema)で Story スキーマに拘束**し約49語彙を enum 固定 → 存在しないクリップ/表情の hallucination を API応答段階で排除(zod二重防御)。`messages.parse()` + `zodOutputFormat`
- 共通システムプロンプト(語彙表+スキーマ例)を `cache_control:{type:"ephemeral"}` でキャッシュ。「**絶対秒は書くな・順序と意味だけ**」を明示
- ① sonnet: `effort:"medium"`。② haiku: 全line 1バッチコール(セリフ毎コールしない=トークン節約)
- **コスト表示(UI必須)**: `usage` から実トークン → 円換算を常時表示。sonnet $3/$15・haiku $1/$5(/1M in/out)。生成前 `countTokens` 見積→生成後実コスト確定。APIキーはローカル設定

## 5. 実装サブフェーズ

### 7a — スキーマ+コンパイラ+テスト(API不要・完全決定論)
- 成果物: `src/story/{schema,compile,decompile,timing}.ts` + 各 `.test.ts`
- 受入: `compile(story)` が `ProjectSchema.parse()` を通る / **同一Story→バイト一致ProjectDoc(10回反復)・Math.random/Date を import しない** / 全line で `balloon.enter.delay===talk.t` / §6検証(scene構造同型)green / `decompile(compile(story))` が構造同型Story / 語彙外clipをzodがreject
- 実装: sonnet量産(難所=de-linearizeの位置畳み込み・採時の単調性はopusがIF定義)

### 7b — Claude API生成
- 成果物: `src/story/ai/{scene-split(sonnet), line-suggest(haiku)}.ts` + コスト表示UI + ドラフトフロー
- 受入: プロット文→Storyドラフト→compile→プレビュー / 生成Storyが必ずzodを通る / コスト実数表示 / 自動確定しない / **APIキー未設定でも7a(手書き台本→compile)は動く**
- 実装: opus主導

### 7c以降(スコープ外)
台本ビューの双方向編集(decompileで接続可)/ カメラ多段ズーム・任意イージング / 3人以上の会話・縦並びballoon衝突回避(現ヒューリスティックは2人正対前提)/ 意図的バリエーションseed

## 6. 検証: 「学校の日常」教室シーン(scenes[2])を Story形式で

```jsonc
{ "bg": "assets/backgrounds/bg-classroom-001.svg", "transition": "wipe",
  "cast": [
    { "id": "haru", "ref": "builtin:template-a", "at": "centerLeft",  "mood": "neutral" },
    { "id": "hana", "ref": "builtin:template-b", "at": "centerRight", "face": "left", "mood": "smile" }
  ],
  "shots": [
    { "who": "hana", "line": "今日、体育あるよね?" },
    { "who": "haru", "line": "うん、ドッジボールだって!", "clip": "talk2", "emotion": "smile" },
    { "who": "hana", "emotion": "surprised" }
  ]
}
```

10行の意味記述 → 約60行の ProjectDoc(キャラ2・talk2・balloon2・表情キー・transition)へ展開。**構造(要素種別・数・話者-balloon対応・t順序・clip種別)は完全一致**してコンパイルされる。手調整された非グリッド秒(0.1秒ズラし)・凝った tail 座標・dur微差は台本層には載らず ProjectDoc 側の領分として残る = 「決定論で同型、手調整は明示時のみ一致」が正直な保証線。

## 7. 未解決の論点(設計時点。7a着手前に確定)

- **【解決】est較正**: 音声エンジンを VOICEVOX に決定 → 実測 **4.45発話字/秒**(sayより遅く表情豊か)。`charPerSec=5.5` を既定(全コードポイント基準のest式に合わせ発話字レートより高め)。7aで vo-001〜007 の7サンプルに対し est誤差を許容範囲でテスト。※7aは旧値7.0で着手済みのため、ランディング時に5.5へ更新+較正テストを合わせる
- **【決定】2人正対レイアウト**を当面のサポート範囲とする。3人以上・縦並びの balloon 衝突回避は 7c
- **【決定】`balloon.keep`** でexit自動fadeをオプトアウト可に(7aで入れる)
- **【決定】transition/camera の dur** はオブジェクト指定で上書き可(スキーマ反映済)
- **round-trip**は「生成直後限定の構造同型」に格下げ(完全バイト可逆は非保証)。双方向編集UX(7c)で許容ラインを再確認
- seed決定論の副作用(同台本=同揺れ)。バリエーション試行は 7c で `scene.seed` 拡張
