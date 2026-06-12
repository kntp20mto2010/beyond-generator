# Byond(仮称)

横16:9の紙芝居動画を作る、個人専用フラットデザイン動画制作ツール。
Vyondの視覚的編集の快適さに、**キャラクターを0から自作できるクリエイター**(Roblox的な顔の自由度 × Live2D的な3層髪物理 × ピン留めオートリグ)を組み合わせる。

## 仕様書

| # | ファイル | 内容 |
|---|---|---|
| 01 | [vision-and-scope](docs/spec/01-vision-and-scope.md) | コンセプト、4リファレンス分析、v1スコープ/非ゴール、アートスタイルガイド |
| 02 | [architecture](docs/spec/02-architecture.md) | 技術スタック、レイヤー構成、決定論原則、undo、テスト戦略 |
| 03 | [character-system](docs/spec/03-character-system.md) | **支柱**: humanoid-v1スケルトン、ピン仕様、パートエディタ、パレット |
| 04 | [face-and-hair](docs/spec/04-face-and-hair.md) | 顔デカール哲学、シェイプセット、表情合成、視線、3層髪と振り子物理 |
| 05 | [animation-runtime](docs/spec/05-animation-runtime.md) | クリップ形式、プリセット10本、合成パイプライン、トーク |
| 06 | [scene-editor](docs/spec/06-scene-editor.md) | シーン相対タイム、ステージ操作、Replace、タイムライン、書き出し |
| 07 | [data-formats](docs/spec/07-data-formats.md) | .byc / .byp / .clip のJSONスキーマと互換性ルール |
| 08 | [roadmap](docs/spec/08-roadmap.md) | Phase 0〜7、受入条件、マイルストーン、フェーズ別に読む仕様書の対応表 |
| 09 | [model-strategy](docs/spec/09-model-strategy.md) | fable5/opus/sonnet割り当て、トークン節約の4つの仕組み |
| 10 | [agent-image-generation-handoff](docs/spec/10-agent-image-generation-handoff.md) | Claude CodeからCodexへ画像生成を依頼するJSONキュー仕様 |

## コア設計判断(5点)

1. **固定スケルトン × ピン留め = オートリグ** — ユーザーはリグを組まず、絵を描いてピンを打つだけ。全キャラがプリセットアニメを共有できる
2. **顔はボーンレスのデカール** — 眉・目・口の「シェイプセット差し替え+オフセット」で表情駆動。どんな絵柄でも枠に入れれば動く
3. **髪はストランド+減衰振り子** — 前髪/中間髪/後ろ髪を別ストランドにし、ボーンのワールド速度で駆動。走れば勝手になびく(決定論的に再現可能)
4. **シーン相対タイム** — グローバルタイムラインを持たない。並べ替え・複製・Replaceが壊れない、Vyondの編集快適性の本質
5. **評価器が唯一の真実** — プレビュー・書き出し・コンタクトシートは全て同じ `evaluate(doc, sceneId, t)` を通る

## 開発の進め方

- フェーズ着手時、[08-roadmap](docs/spec/08-roadmap.md) の対応表にあるファイルだけ読み込む(トークン節約)
- モデル割り当ては [09-model-strategy](docs/spec/09-model-strategy.md) に従う: **fable5=設計・難所(Phase 1-3コア)・視覚検証 / opus=タイムライン・書き出し / sonnet=量産**
- 視覚検証はコンタクトシート1枚方式+ピクセル回帰ゲートで、fable5の画像認識を要所だけに使う

## 現在地

**Phase 0〜4a 完了**(キャラ作成・表情・髪物理・クリップ10本・シーンエディタ・Codex製背景の採用まで)。
詳細な進捗・動かし方・検証の落とし穴は **[docs/progress.md](docs/progress.md)** を参照。次は Phase 4b(Replace・スナップ・カメラ・moveTo)→ Phase 5(音声+MP4書き出し = M2)。

```
npm run dev   # http://localhost:5273(Chrome/Edge)
npm test      # 188件
```
