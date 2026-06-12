# Phase 5-1 ハンドオフ: 音声ランタイム+リップフラップ(設計: fable5 → 実装: opus)

セリフ音声(talk)・BGMのスキーマ/ロード/プレビュー再生と、音声エンベロープ駆動の口パク。
MP4書き出しは5-2(別セッション)。**評価器は書き出しと共通になるため、音声系も「データを渡せば純関数で絵が決まる」原則を崩さない。**

素材: `assets/audio/vo-001.wav 〜 vo-007.wav`(44.1kHz mono 16bit、fable5がTTS生成済み)。

## ゴール(受入条件)

1. キャラ要素に**セリフ音声(talk)**を時刻付きで割り当てられ、▶シーン再生・▶▶通し再生で**声が鳴る**(シーン跨ぎで多重再生しない。⏹/スクラブで止まる)
2. **口パク**: 音声の鳴っている区間、その音量エンベロープに合わせてキャラの口が開閉する(プレビューでもスクラブでも同じ絵 — スクラブは無音だが口は動く)
3. タイムラインにtalkブロック(幅=音声長)が表示され、ドラッグで時刻調整できる(undo 1回)
4. BGM(プロジェクト1本・ループ・音量)が通し再生で鳴る
5. 台本ビューにセリフ音声の行が出る
6. テスト全green(既存296+新規)・ビルド成功

## 実装前に読むこと

docs/spec/06(音声節)、src/core/schema/project.ts、src/io/asset-resolver.ts(画像ロードのパターン)、src/io/fs.ts(readBinaryFile)、src/runtime/scene-eval.ts、src/runtime/expression.ts(resolveFace)、src/editor/scene/ScenePage.tsx(再生制御: playScene/playAll/stop/onReachEnd/onScrub)、StageCanvas.tsx(evaluateScene呼び出し点)、timeline-lane.tsx(makeTimeDragパターン)、PropertyPanel.tsx、ScriptPanel.tsx + script-events.ts、docs/handoffs/phase4c-2-timeline.md(ドラッグ規約)

## A. スキーマ(project.ts — formatVersion 1のまま加算的)

```ts
export const TalkSchema = z.object({
  t: z.number().min(0),
  audio: z.string(),                       // "assets/audio/vo-001.wav"(リポジトリ配信 or プロジェクトフォルダ相対)
  gain: z.number().min(0).default(1),
}).passthrough();
// CharacterElement に talks: z.array(TalkSchema).default([])(t昇順で保持)

export const BgmSchema = z.object({
  audio: z.string(),
  gain: z.number().min(0).default(0.5),
  loop: z.boolean().default(true),
}).passthrough();
// ProjectDoc.bgm: z.array(z.unknown()) → z.array(BgmSchema)(旧ファイルは空配列なので互換OK。v1はUI上1本のみ扱う)
```

talkの長さはスキーマに持たない(音声バッファの実長から導出 — 差し替えで自動追従)。

## B. 音声ロード+エンベロープ(asset-resolver.ts拡張 + src/runtime/mouth-envelope.ts新設)

- AssetResolver拡張(画像と同パターン: FS readBinaryFile → fetch("/"+path) フォールバック、failed記録、#notify):
  ```ts
  getAudio(path): { buffer: AudioBuffer; envelope: Uint8Array; duration: number } | undefined
  ensureAudioLoaded(paths: readonly string[], fs): Promise<void>
  ```
  - デコードは共有AudioContext 1個(モジュール内遅延生成)。`decodeAudioData` はArrayBufferをdetachするので渡す前に slice() コピー
- `computeMouthEnvelope(buffer: AudioBuffer, fps = 30): Uint8Array`(**純関数 — テスト対象**):
  - フレーム毎RMS → 閾値 = max(RMS全体の最大値 × 0.15, 1e-4) → 0/1列
  - チャタリング防止: 1フレームだけの孤立開閉を均す(前後と同値化)
- ScenePage: docの全talk/bgmパスを集めて `ensureAudioLoaded`(既存のensureImagesLoadedと同じuseEffect)

## C. 評価器の口パク(scene-eval.ts + expression.ts)

- `EvaluateSceneOptions` に追加:
  ```ts
  audio?: { lookup(path: string): { envelope: Uint8Array; duration: number } | undefined };
  ```
- evaluateCharacter: アクティブtalk = talksのうち `talk.t <= t < talk.t + duration` の最後。あれば `frame = floor((t - talk.t) * 30)` で `envelope[frame] === 1` のとき **mouthOverride = "open"**(0なら通常表情の口)
- `resolveFace(char, { preset, blink, mouthOverride? })` に拡張: 表情合成の**最後に**mouthスロットを上書き(blinkは目のみの既存挙動を変えない)。openシェイプはMOUTHに既存
- StageCanvas: evaluateScene呼び出しに `audio: { lookup: (p) => pRef.current.resolver.getAudio(p) }` を渡す(再生中もスクラブ中も同じ)
- ThumbnailServiceのrenderSceneはaudio無しでよい(サムネは口パク不要)

## D. プレビュー再生(src/editor/scene/audio-playback.ts 新設 + ScenePage配線)

```ts
export class AudioPlayback {
  // ctxは再生操作時に生成/resume(autoplay制約)。masterGain → destination
  playScene(scene: SceneDoc, fromT: number, resolver): void  // talksをschedule(fromT途中開始はoffset)
  startBgm(bgm: Bgm, resolver): void                          // 通し再生時のみ。loop
  stopAll(): void                                              // 全source停止(talk+bgm)
  stopTalks(): void                                            // シーン跨ぎ用(bgmは継続)
}
```

- ScenePage配線: playScene→playScene(scene, tRef.current) / playAll→startBgm+playScene(先頭) / onReachEndの次シーン遷移→stopTalks+playScene(次,0) / stop・スクラブ開始・シーン選択→stopAll
- gain: talk.gain / bgm.gain をGainNodeで
- source.start(when, offset): fromTがtalk.tより後なら offset = fromT - talk.t、duration超は鳴らさない

## E. UI

- **PropertyPanel(キャラ選択時)**: 「セリフ音声」Section — talks一覧(t数値 + 音声select + ×)+「+ セリフ音声」。音声選択肢は `import.meta.glob("/assets/audio/*.{wav,mp3}", { query: "?url", eager: false })` のキー列挙 + `fs.listFiles("assets/audio")`(プロジェクトフォルダ)。globが効かない場合は内蔵リスト定数にフォールバックしてよい(逸脱として報告)
- **タイムライン**: キャラレーン内の下側に talkブロック(高さ半分・音声系の色 — CSS変数追加可)。幅 = duration × pxPerSec(未ロード時は0.5s仮)。ドラッグでt移動(**ローカルプレビュー→pointerup 1 dispatch** — 4c-2規約)
- **シーン設定(未選択時)**: 「BGM」Section — select(音声一覧)+ gainスライダ + クリア。doc.bgm[0]を編集
- **台本ビュー**: talk行 `🔊 <キャラ名> (vo-001)` をt昇順に挿入(script-events.tsに追加)
- コマンド(commands-project.ts): addTalk / updateTalk(index, patch) / removeTalk(tソート、actionsと同パターン)、setBgm(store, bgm | null)

## F. テスト(vitest)

1. computeMouthEnvelope: 合成波形(無音→正弦波→無音)で開閉列 / 孤立1フレームの均し(AudioBufferはモック: {length, sampleRate, getChannelData})
2. スキーマ: talks/bgm付きround-trip / 旧ファイル(無し)互換
3. 評価器: talk区間内でenvelope=1→mouth open / envelope=0→表情の口 / 区間外→表情の口(audioオプションのlookupはスタブ)
4. コマンド: addTalk/updateTalk/removeTalkのソートとundo
5. 既存296件を壊さない

## 落とし穴

- decodeAudioDataに渡すArrayBufferは**slice()コピー**(detached対策)
- AudioContextの生成/resumeは**再生ボタンのイベント内**で(autoplayポリシー)
- 通し再生のシーン跨ぎ: 前シーンのtalk sourceを止めずに次を鳴らすと二重音。stopTalks→schedule
- スクラブ・シーン選択・⏹で確実にstopAll(止め忘れが一番起きやすい)
- エンベロープのfpsはステージfps(30)と一致させる
- resolveFaceのmouthOverrideは**blinkより後勝ちにしない**(blinkは目、mouthは口 — 干渉しないが、表情プリセットのmouth(openSmile等)をoverrideが置き換える)
- タイムラインのtalkドラッグは4c-2の「pointerup 1 dispatch」規約(updateTalkはtソートでindexが変わる)
- StageCanvas/Timeline本体の構造変更は最小限(evaluateSceneのopts+talkブロック追加のみ)。SceneStrip/AddPanelは触らない
- ヘッドレス検証: 音は聞けないので、AudioContextのstate/scheduleされたsource数・store.docをDEVフック(`globalThis.__byondStore`)で確認。口パクはスクラブのスクショで(talk区間中に口が開いたフレームを捉える)
- docs/変更禁止、git操作禁止、UIラベル日本語、コメント最小限、strict + noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build結果(件数)、追加・変更ファイル一覧(概要付き)、受入条件1〜6の確認方法、逸脱と理由、既知の制限。
