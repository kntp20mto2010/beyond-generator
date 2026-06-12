import { useEffect, useRef } from "react";
import { Application, Graphics, Text, TextStyle } from "pixi.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import { characterDocIO } from "../../io/serialize.js";
import { TEMPLATE_A } from "../../presets/characters/template-a.js";
import {
  computeBoneWorld,
  buildRenderList,
} from "../../runtime/pose.js";
import { buildCharacterContainer } from "../../render/character-pixi.js";
import { resolveFace } from "../../runtime/expression.js";
import { POSES } from "./poses.js";

// 列: 表情6種
const EXPRESSIONS = [
  { key: "neutral", label: "通常" },
  { key: "smile",   label: "笑顔" },
  { key: "laugh",   label: "大笑い" },
  { key: "sad",     label: "悲しい" },
  { key: "angry",   label: "怒り" },
  { key: "surprised", label: "驚き" },
] as const;

const CELL_W = 210;
const CELL_H = 330;
const CHAR_SCALE = 0.3;
const HEADER_H = 92; // タイトル行 + パレット行 + 列ヘッダ行
const LABEL_W = 70;

const CANVAS_W = LABEL_W + EXPRESSIONS.length * CELL_W + 20;
const CANVAS_H = HEADER_H + POSES.length * CELL_H + 20;

export interface ContactSheetLayout {
  col: number;
  row: number;
  x: number;
  y: number;
}

export function layoutContactSheet(rows: number, cols: number): ContactSheetLayout[] {
  const result: ContactSheetLayout[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result.push({
        row: r,
        col: c,
        x: LABEL_W + c * CELL_W,
        y: HEADER_H + r * CELL_H,
      });
    }
  }
  return result;
}

function loadCharacter(): CharacterDoc {
  // 1. CLI から window.__loadContactSheetChar が呼ばれた場合は global で管理
  const g = globalThis as Record<string, unknown>;
  if (typeof g["__csChar"] === "object" && g["__csChar"] !== null) {
    return g["__csChar"] as CharacterDoc;
  }
  // 2. localStorage からロード
  try {
    const stored = localStorage.getItem("byond.contactsheet.char");
    if (stored) return characterDocIO.parse(stored);
  } catch {
    // fall through
  }
  // 3. テンプレート
  return structuredClone(TEMPLATE_A);
}

export function ContactSheetPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      const char = loadCharacter();

      // CLI から JSON を受け取るコールバックを設定
      const g = globalThis as Record<string, unknown>;
      g["__loadContactSheetChar"] = (json: string) => {
        try {
          g["__csChar"] = characterDocIO.parse(json);
          // Pixi側はこの関数が呼ばれたあと再レンダーが必要だが、
          // CLIは init 後に呼ぶので別 Application が必要。ここは初回描画時用
        } catch {
          // ignore
        }
      };

      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: 1,
        autoDensity: false,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      // 行ラベル(ポーズ名)
      const labelStyle = new TextStyle({ fontSize: 13, fill: "#555" });
      const headStyle = new TextStyle({ fontSize: 12, fill: "#555" });
      const titleStyle = new TextStyle({ fontSize: 16, fontWeight: "bold", fill: "#333" });

      // タイトル・キャラ名
      const title = new Text({ text: `コンタクトシート: ${char.name}`, style: titleStyle });
      title.position.set(LABEL_W, 8);
      app.stage.addChild(title);

      // パレットチップ
      let chipX = LABEL_W;
      for (const [slot, color] of Object.entries(char.palette)) {
        const chip = new Graphics();
        chip.rect(0, 0, 16, 16).fill({ color });
        chip.rect(0, 0, 16, 16).stroke({ color: "#aaa", width: 0.5 });
        chip.position.set(chipX, 32);
        app.stage.addChild(chip);
        const chipLabel = new Text({ text: slot, style: new TextStyle({ fontSize: 9, fill: "#888" }) });
        chipLabel.position.set(chipX, 50);
        app.stage.addChild(chipLabel);
        chipX += 58;
      }

      // 列ヘッダ(表情名) — パレット行の下の独立した帯
      EXPRESSIONS.forEach((expr, c) => {
        const lbl = new Text({ text: expr.label, style: headStyle });
        lbl.position.set(LABEL_W + c * CELL_W + CELL_W / 2 - lbl.width / 2, HEADER_H - 20);
        app.stage.addChild(lbl);
      });

      // セルを描画
      const layout = layoutContactSheet(POSES.length, EXPRESSIONS.length);
      for (const { row, col, x, y } of layout) {
        const poseDef = POSES[row]!;
        const exprDef = EXPRESSIONS[col]!;

        const face = resolveFace(char, { preset: exprDef.key });
        const bones = computeBoneWorld(char, poseDef.pose);
        const items = buildRenderList(char, bones, {
          face,
          handShape: poseDef.handShape,
        });
        const container = buildCharacterContainer(char, items);

        // キャラをセル中央下基準に配置
        const cellCenterX = x + CELL_W / 2;
        const groundY = y + CELL_H - 10;
        container.position.set(cellCenterX, groundY - 310 * CHAR_SCALE);
        container.scale.set(CHAR_SCALE);
        app.stage.addChild(container);

        // セル境界線
        const border = new Graphics();
        border.rect(x, y, CELL_W, CELL_H)
          .stroke({ color: "#ddd", width: 0.5 });
        app.stage.addChild(border);
      }

      // 行ラベル(ポーズ名)
      POSES.forEach((poseDef, r) => {
        const lbl = new Text({ text: poseDef.label, style: labelStyle });
        lbl.position.set(4, HEADER_H + r * CELL_H + CELL_H / 2 - 8);
        app.stage.addChild(lbl);
      });

      // 描画完了フラグ
      g["__contactSheetReady"] = true;
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div style={{ padding: "8px", background: "#e8e4dc", minHeight: "100vh" }}>
      <div ref={hostRef} id="contact-sheet-canvas" />
    </div>
  );
}
