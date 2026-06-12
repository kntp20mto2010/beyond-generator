import { useEffect, useRef } from "react";
import { Application, Text, TextStyle, Graphics } from "pixi.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import { characterDocIO } from "../../io/serialize.js";
import { TEMPLATE_A } from "../../presets/characters/template-a.js";
import { CLIPS } from "../../presets/clips/index.js";
import { sampleClip } from "../../runtime/clip-player.js";
import { computeBoneWorld, buildRenderList } from "../../runtime/pose.js";
import { buildCharacterContainer } from "../../render/character-pixi.js";
import { resolveFace } from "../../runtime/expression.js";
import { withPixiInitLock } from "../../render/pixi-init-lock.js";

const CELL_W = 190;
const CELL_H = 300;
const CHAR_SCALE = 0.27;
const HEADER_H = 60;
const LABEL_W = 100;
const PHASE_COLS = [0, 0.25, 0.5, 0.75] as const;
const PHASE_LABELS = ["0%", "25%", "50%", "75%"] as const;

const CLIP_LIST = Object.values(CLIPS);

const CANVAS_W = LABEL_W + PHASE_COLS.length * CELL_W + 20;
const CANVAS_H = HEADER_H + CLIP_LIST.length * CELL_H + 20;

export interface ClipSheetLayout {
  col: number;
  row: number;
  x: number;
  y: number;
}

export function layoutClipSheet(rows: number, cols: number): ClipSheetLayout[] {
  const result: ClipSheetLayout[] = [];
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
  const g = globalThis as Record<string, unknown>;
  if (typeof g["__csChar"] === "object" && g["__csChar"] !== null) {
    return g["__csChar"] as CharacterDoc;
  }
  try {
    const stored = localStorage.getItem("byond.contactsheet.char");
    if (stored) return characterDocIO.parse(stored);
  } catch {
    // fall through
  }
  return structuredClone(TEMPLATE_A);
}

export function ClipSheetPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      const char = loadCharacter();

      await withPixiInitLock(() => app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: 1,
        autoDensity: false,
      }));
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const labelStyle = new TextStyle({ fontSize: 11, fill: "#555" });
      const headStyle = new TextStyle({ fontSize: 12, fill: "#555" });
      const titleStyle = new TextStyle({ fontSize: 15, fontWeight: "bold", fill: "#333" });

      const title = new Text({ text: `クリップシート: ${char.name}`, style: titleStyle });
      title.position.set(LABEL_W, 8);
      app.stage.addChild(title);

      PHASE_LABELS.forEach((lbl, c) => {
        const t = new Text({ text: lbl, style: headStyle });
        t.position.set(LABEL_W + c * CELL_W + CELL_W / 2 - t.width / 2, HEADER_H - 20);
        app.stage.addChild(t);
      });

      const layout = layoutClipSheet(CLIP_LIST.length, PHASE_COLS.length);
      const face = resolveFace(char, { preset: "neutral" });

      for (const { row, col, x, y } of layout) {
        const clip = CLIP_LIST[row]!;
        const phase = PHASE_COLS[col]!;
        const t = phase * clip.duration;

        const frame = sampleClip(clip, t);
        const bones = computeBoneWorld(char, frame.pose);
        const items = buildRenderList(char, bones, {
          face,
          handShape: frame.handShape,
        });
        const container = buildCharacterContainer(char, items);

        const cellCenterX = x + CELL_W / 2;
        const groundY = y + CELL_H - 10;
        container.position.set(cellCenterX, groundY - 310 * CHAR_SCALE);
        container.scale.set(CHAR_SCALE);
        app.stage.addChild(container);

        const border = new Graphics();
        border.rect(x, y, CELL_W, CELL_H).stroke({ color: "#ddd", width: 0.5 });
        app.stage.addChild(border);
      }

      CLIP_LIST.forEach((clip, r) => {
        const lbl = new Text({ text: `${clip.label}\n${clip.id}`, style: labelStyle });
        lbl.position.set(4, HEADER_H + r * CELL_H + CELL_H / 2 - 12);
        app.stage.addChild(lbl);
      });

      const g = globalThis as Record<string, unknown>;
      g["__clipSheetReady"] = true;
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div style={{ padding: "8px", background: "#e8e4dc", minHeight: "100vh" }}>
      <div ref={hostRef} id="clip-sheet-canvas" />
    </div>
  );
}
