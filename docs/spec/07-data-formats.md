# 07. データフォーマット

## 共通規約

- すべてJSON(テキスト)。`formatVersion`(整数)を必ず持ち、読込時にマイグレーション関数を順適用
- ID: ULID。アセット参照は**プロジェクトフォルダからの相対パス**
- 座標: y-down、単位px(キャラは標準身長600u基準のローカル座標)
- 色: パレットスロット名(`"@primary"`)or 固定HEX(`"#3E6FB0"`)
- 形状kind: `rect`(r=角丸半径。カプセルはエディタ上のプリセットで r=w/2 のrect)/ `ellipse` / `polygon` / `path`(M/L/Q/C/Z)。fill か stroke の少なくとも一方必須
- パーツの形状・ピン座標は**キャラ空間**(全身キャンバス、root=原点、y-down)で保持
- 拡張子: キャラ `*.byc.json` / プロジェクト `*.byp.json` / クリップ `*.clip.json`

## プロジェクトフォルダ構成

```
my-video/
  project.byp.json
  project.autosave.json
  characters/
    hana.byc.json
  assets/
    backgrounds/  props/  audio/
  exports/
```

## キャラクターファイル(.byc.json)

```jsonc
{
  "formatVersion": 1,
  "id": "01J...",
  "name": "ハナ",
  "skeleton": "humanoid-v1",
  "palette": {
    "skin": "#F2C9A0", "hair": "#3A2E2A", "primary": "#3E6FB0",
    "secondary": "#E8E4DC", "accent": "#D95A3B", "line": "#2A2A33"
  },
  "parts": [
    {
      "slot": "upperArmL",
      "z": 90,
      "pins": { "origin": [38, -185], "joint": [38, -100] },   // キャラ空間(肩・肘の位置)
      "shapes": [   // プリミティブ合成(パートエディタの出力)。座標もキャラ空間
        { "kind": "rect", "x": 30, "y": -190, "w": 16, "h": 98, "r": 8, "fill": "@primary" }
      ]
    }
    // ... torso, head, thighL/R, ...
  ],
  "hands": {        // ハンドシェイプセット
    "open":  { "shapes": [/*...*/], "pins": { "origin": [0,0], "grip": [4, 18] } },
    "fist":  { "shapes": [/*...*/] },
    "point": { "shapes": [/*...*/] }
  },
  "face": {
    "browL": { "pos": [-24, -210], "shapes": { "neutral": {/*..*/}, "angryIn": {/*..*/} } },
    "eyeL":  { "pos": [-24, -196], "shapes": { "open": {/*..*/}, "closed": {/*..*/} } },
    "pupilL":{ "bounds": [10, 6] },   // 視線offsetの可動楕円
    "mouth": { "pos": [0, -160], "shapes": { "neutral": {/*..*/}, "smile": {/*..*/}, "openSmile": {/*..*/} } }
  },
  "expressions": {  // プリセット上書き(省略時はシステム標準)
    "angry": { "browL": "angryIn", "browR": "angryIn", "mouth": "frown", "browOffsetY": 4 }
  },
  "hair": {
    "front": [{ "shapes": [/*..*/], "pin": [0, -240],
                "physics": { "stiffness": 0.7, "damping": 0.82, "inertia": 0.5, "maxAngle": 14, "gravity": 0.1, "segments": 1 } }],
    "mid":   [/* 左右の横髪 */],
    "back":  [{ "shapes": [/*..*/], "pin": [0, -230],
                "physics": { "stiffness": 0.35, "damping": 0.78, "inertia": 0.9, "maxAngle": 38, "gravity": 0.4, "segments": 2 } }]
  },
  "blink": { "enabled": true, "rate": 1.0 }
}
```

## プロジェクトファイル(.byp.json)

```jsonc
{
  "formatVersion": 1,
  "id": "01J...",
  "title": "踏切の安全解説",
  "stage": { "w": 1920, "h": 1080, "fps": 30 },
  "bgm": [{ "audioRef": "assets/audio/bgm.mp3", "fromScene": 0, "offset": 0, "gain": 0.6 }],
  "scenes": [
    {
      "id": "01J...",
      "duration": 6.5,
      "durationMode": "fitAudio",        // manual | fitAudio | fitElements
      "transitionOut": { "type": "fade", "dur": 0.4 },
      "background": { "ref": "assets/backgrounds/crossing.svg", "tint": null },
      "camera": [{ "t": 0, "x": 960, "y": 540, "zoom": 1.0 }, { "t": 4.0, "zoom": 1.25, "ease": "easeInOutSine" }],
      "elements": [ /* 06のelementモデル参照 */ ],
      "seed": 1234                        // まばたき等の決定論的乱数用
    }
  ]
}
```

## クリップファイル(.clip.json)

05のクリップフォーマット参照。`presets/clips/` にシステム同梱、ユーザー自作はプロジェクト/グローバルライブラリに保存(Phase 7)。

## 互換性ルール

- 後方互換: 古い`formatVersion`は必ず開ける(マイグレーション登録制)
- 未知フィールドは**保持して書き戻す**(前方互換・手書き編集の安全網)
- スロット名・シェイプ名は予約語以外自由(ユーザー拡張可)
