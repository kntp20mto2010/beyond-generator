# Phase 5-2 ハンドオフ: MP4書き出し(設計: fable5 → 実装: opus)

WebCodecs(H.264 + AAC)+ mp4-muxer(導入済み ^5.2.2)で、プロジェクト全編を音声付きMP4に書き出す。
**評価器がプレビューと同一なので、書き出し=「フレーム順に評価器を回してエンコード」**(02の評価器原則)。

環境確認済み(fable5): `VideoEncoder` は `avc1.640028`(High 4.0, 1080p30)対応、`AudioEncoder` は `mp4a.40.2`(AAC, 44.1k/48k)対応。

## ゴール(受入条件)

1. ツールバー「書き出し」→ ダイアログ(解像度 1080p/720p・fps 30/24)→ 実行で、**全シーン+トランジション+カメラ+口パク+セリフ音声+BGMの入ったMP4**がダウンロードされる
2. 進捗バー(フレーム数ベース)+キャンセル(中断時は破棄)
3. 書き出し中とエクスポート後にエディタが壊れない(Pixiレンダラー排他 — 書き出し中はStageCanvasをアンマウント)
4. 書き出した絵がプレビューと一致(評価器・物理・トランジションの再現。検収はfable5がffmpegフレーム抽出で行う)
5. テスト全green(既存321+新規)・ビルド成功

## 実装前に読むこと

docs/handoffs/phase4b-1-runtime.md(トランジション仕様)と phase5-1-audio.md、src/editor/scene/StageCanvas.tsx(**renderFrame/applyItem/カメラ適用/トランジション合成 — 書き出しはこれと同じ絵を作る**)、src/runtime/scene-eval.ts・scene-physics.ts、src/io/asset-resolver.ts(getAudio)、src/editor/scene/audio-playback.ts、src/render/pixi-init-lock.ts(**冒頭コメント必読: Pixiレンダラーは同時1個**)、node_modules/mp4-muxer/README.md(API)

## A. 描画コアの共有化(リファクタ — 最重要)

StageCanvasのフレーム描画(evaluateScene → ElView群のapplyItem → カメラ適用 → トランジションsnapshot合成)を **`src/render/scene-render-stack.ts`** に抽出する:

```ts
export class SceneRenderStack {
  // root(world)/bg/bgImage/elLayerを内包。編集用オーバーレイ(選択枠等)は含まない
  constructor(app: Application, resolver: AssetResolver);
  // tでシーンを描く(カメラ・口パク込み)。physicsPoolのdeforms適用
  renderFrame(project: ProjectDoc, scene: SceneDoc, t: number, pool: ScenePhysicsPool, opts?: { slidePush?: number }): void;
  // トランジション用: 現在のapp.stageをsnapshot(Sprite)化して最前面へ/進行p適用/破棄
  beginTransition(type: "fade" | "wipe" | "slide", dur: number): void;
  applyTransition(p: number): void;   // fade: alpha / wipe: マスク / slide: snapshot.x + 新シーンへslidePush
  disposeTransition(): void;
  destroy(): void;
}
```

- StageCanvasはこれを使う形に書き換え(編集オーバーレイ・ヒットテスト・ドラッグはStageCanvas側に残す)。**既存の見た目と挙動を変えない**(回帰はスクショ比較で自己確認)
- 背景画像はresolver.getImageUrl経由(未解決時スキップ→ロード後再試行)— 書き出し前に全アセットをensureLoadedしてから開始するので、エクスポート時は解決済み前提でよい

## B. エクスポートパイプライン(src/export/mp4-exporter.ts 新設)

```ts
export interface ExportSettings { width: 1920 | 1280; height: 1080 | 720; fps: 30 | 24; videoBitrate?: number }
export interface ExportProgress { frame: number; totalFrames: number; phase: "audio" | "video" | "mux" }
export async function exportMp4(
  project: ProjectDoc,
  resolver: AssetResolver,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob>
```

実装の固定事項:

1. **事前ロード**: 全キャラ/画像/音声を `ensureLoaded / ensureImagesLoaded / ensureAudioLoaded` で解決してから開始
2. **専用Pixi Application**(withPixiInitLock経由、width×height、DOM追加なし)+ SceneRenderStack + ScenePhysicsPool。**呼び出し側(ScenePage)はエクスポート中StageCanvasをアンマウント**(同時1レンダラー)
3. **タイムライン**: シーンを順に、各シーン `frame = 0 .. ceil(duration*fps)-1`、t = frame/fps。シーン頭で `pool.seek(0)` → 各フレーム `pool.advance(prevT, t)`。シーンiの開始グローバル秒 = 前シーンのdurationの累積
4. **トランジション**: 次シーンのtransitionがcut以外なら、前シーン最終フレーム(t=duration)を描いた状態で `beginTransition` → 新シーンの最初の `dur` 秒は `applyTransition(t/dur)` を毎フレーム
5. **フレームエンコード**: `app.renderer.render(app.stage)` → `new VideoFrame(app.canvas, { timestamp: グローバルフレーム番号 * 1e6 / fps, duration: 1e6 / fps })` → `videoEncoder.encode(frame, { keyFrame: frame % (fps*2) === 0 })` → `frame.close()`。エンコーダのqueueが30超えたら `await encoder.flush()` ではなく **queueサイズを見て待つ**(`encodeQueueSize > 8` で `await new Promise(r => setTimeout(r))` ループ — flushを毎回呼ぶと遅い)
   - codec: `avc1.640028`(720pは `avc1.64001f`)、bitrate: 1080p=8Mbps / 720p=5Mbps、`latencyMode: "quality"`
6. **音声**: OfflineAudioContext(2ch, 44100, ceil(総時間*44100))に全シーンのtalk(グローバルオフセット+talk.t、GainNode)とBGM(loop、総時間まで)を配置 → `startRendering()` → AudioBuffer → **インターリーブf32**にして適当なチャンク(1024フレーム)毎に `new AudioData({ format: "f32", sampleRate: 44100, numberOfFrames, numberOfChannels: 2, timestamp, data })` → AudioEncoder(`mp4a.40.2`, 128kbps)
7. **muxer**: mp4-muxer `Muxer + ArrayBufferTarget`、video: avc / audio: aac。Encoderのoutputコールバックで `muxer.addVideoChunk / addAudioChunk(chunk, meta)`。最後に `videoEncoder.flush() → audioEncoder.flush() → muxer.finalize()` → `new Blob([target.buffer], { type: "video/mp4" })`
8. **キャンセル**: AbortSignalを毎フレームチェック → エンコーダclose・Pixi destroy・例外でreject
9. **後片付け**: 成功/失敗/キャンセルの全経路で `app.destroy(true)`・encoder close(リーク禁止)

## C. UI(src/editor/scene/ExportDialog.tsx 新設 + ScenePage配線)

- ツールバーに「書き出し」ボタン(IconはIconSave流用 or icons.tsxに1個追加可)
- モーダル: 解像度select(1920×1080 / 1280×720)、fps select(30 / 24)、合計時間表示 → [書き出す]
- 実行中: 進捗バー(frame/totalFrames)+「キャンセル」。**実行中はStageCanvasをアンマウント**し「書き出し中…」プレースホルダ表示(ScenePageの`exporting` stateで分岐)
- 完了: `URL.createObjectURL(blob)` → `<a download="タイトル.mp4">` 自動クリック → revoke。ダイアログ閉じてStageCanvas再マウント(bumpSeekで物理再構築)
- 再生中に書き出し開始したら先に stop+stopAll

## D. テスト(vitest — Pixi/WebCodecsはNodeに無いので純関数部のみ)

1. タイムライン計算(純関数に切り出す): シーン毎フレーム数 / グローバル開始秒 / 総フレーム数 / トランジション窓
2. 音声配置計算(純関数): talk→{startSec, gain}列、BGMのloop回数
3. AudioBuffer→インターリーブf32変換(モックバッファ)
4. 既存321件を壊さない

## 落とし穴

- **Pixiレンダラー同時1個**: エクスポート中はStageCanvasアンマウント必須(プール混線の実踏バグ。pixi-init-lock.tsの経緯コメント)
- VideoFrameは**毎フレーム必ずclose()**(リークでブラウザが落ちる)
- `timestamp`はマイクロ秒・グローバル通し(シーンごとにリセットしない)
- encodeQueueSizeのバックプレッシャ(待たないとメモリ爆発)
- OfflineAudioContextのlength=0は例外(総時間が0なら音声トラックなしでmux)
- AudioDataのdataはインターリーブ済みFloat32Array(planarではない — format "f32" はinterleaved、"f32-planar"はplanar。どちらかに合わせる)
- mp4-muxerのfastStart: "in-memory" を指定(メタデータ先頭化、ストリーミング再生可能に)
- トランジションのsnapshot текстура destroy(全経路)
- キャンセル経路のclose漏れ
- 物理seekはシーン頭のみ(毎フレームseekすると遅い)
- エクスポートは`import.meta.env`非依存(本番ビルドでも動く)
- ヘッドレス検証: 実際に2シーン程度の小プロジェクトで書き出し→blobサイズ>0とdurationの妥当性。**生成MP4は /tmp ではなく exports/ に保存できないため、ダウンロードblobをDEVフックで `globalThis.__lastExportBlob` に置く**(fable5がffmpeg検証する取り出し口)
- docs/変更禁止、git操作禁止、UIラベル日本語、コメント最小限、strict + noUncheckedIndexedAccess

## 完了報告に含めること

npm test / npm run build結果(件数)、追加・変更ファイル一覧(概要付き)、受入条件1〜5の確認方法(ヘッドレス書き出しの実測: 所要時間・blobサイズ)、逸脱と理由、既知の制限。
