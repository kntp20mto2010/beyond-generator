import { useCallback, useEffect, useRef, useState } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import { resolveFill } from "../../core/schema/geometry.js";
import type { Shape, Vec2 } from "../../core/schema/geometry.js";
import { addShape, movePin, removeShape, updateShape } from "../../core/commands-character.js";
import { getShapes, getPins, listSlotRefs, refKey } from "./slot-ref.js";
import type { SlotRef } from "./slot-ref.js";
import { pathCmdsToD } from "./svg-paths.js";

type Tool = "select" | "rect" | "ellipse";

interface Props {
  charStore: DocStore<CharacterDoc>;
  selectedRef: SlotRef | null;
  selectedShapeIndex: number | null;
  tool: Tool;
  onSelectShape: (index: number | null) => void;
  onShapeCountChange?: () => void;
}

const INIT_VB = { x: -380, y: -430, w: 760, h: 860 };
const GRID = 50;
const GROUND_Y = 310;
const HANDLE_SIZE = 8;
const PIN_SNAP_DIST = 6;

function svgPoint(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
): Vec2 {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const m = svgEl.getScreenCTM();
  if (!m) return [clientX, clientY];
  const inv = m.inverse();
  const tp = pt.matrixTransform(inv);
  return [tp.x, tp.y];
}

function ShapeEl({
  shape,
  palette,
  selected,
  dimmed,
  onClick,
}: {
  shape: Shape;
  palette: Record<string, string>;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const fill = shape.fill ? resolveFill(shape.fill, palette) : "none";
  const stroke = shape.stroke
    ? { stroke: resolveFill(shape.stroke.color, palette), strokeWidth: shape.stroke.width }
    : {};
  const style: React.CSSProperties = {
    opacity: dimmed ? 0.35 : 1,
    cursor: "pointer",
    outline: selected ? "2px solid #5B7DB1" : undefined,
  };

  switch (shape.kind) {
    case "rect":
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.r ?? 0}
          fill={fill}
          {...stroke}
          style={style}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill={fill}
          {...stroke}
          style={style}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        />
      );
    case "polygon":
      return (
        <polygon
          points={shape.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
          fill={fill}
          {...stroke}
          style={style}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        />
      );
    case "path":
      return (
        <path
          d={pathCmdsToD(shape.d)}
          fill={fill}
          {...stroke}
          style={style}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        />
      );
  }
}

// 選択シェイプの4隅リサイズハンドル(rect/ellipseのみ)
function ResizeHandles({
  shape,
  onDrag,
}: {
  shape: Shape;
  onDrag: (corner: string, dx: number, dy: number, orig: Shape) => void;
}) {
  if (shape.kind !== "rect" && shape.kind !== "ellipse") return null;

  let cx: number, cy: number, hw: number, hh: number;
  if (shape.kind === "rect") {
    cx = shape.x + shape.w / 2;
    cy = shape.y + shape.h / 2;
    hw = shape.w / 2;
    hh = shape.h / 2;
  } else {
    cx = shape.cx;
    cy = shape.cy;
    hw = shape.rx;
    hh = shape.ry;
  }

  const corners = [
    { id: "tl", x: cx - hw, y: cy - hh },
    { id: "tr", x: cx + hw, y: cy - hh },
    { id: "bl", x: cx - hw, y: cy + hh },
    { id: "br", x: cx + hw, y: cy + hh },
  ];

  return (
    <>
      {corners.map((c) => (
        <rect
          key={c.id}
          x={c.x - HANDLE_SIZE / 2}
          y={c.y - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="white"
          stroke="#5B7DB1"
          strokeWidth={1.5}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            // 累積デルタは常にドラッグ開始時点の形状に適用する(複利暴走防止)
            const orig = structuredClone(shape);
            e.currentTarget.setPointerCapture(e.pointerId);

            const onMove = (me: PointerEvent) => {
              onDrag(c.id, me.clientX - startX, me.clientY - startY, orig);
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      ))}
    </>
  );
}

// ピン✛マーカー
function PinMarker({
  name,
  pos,
  onDrag,
}: {
  name: string;
  pos: Vec2;
  onDrag: (newPos: Vec2) => void;
}) {
  const S = 7;
  return (
    <g style={{ cursor: "crosshair" }}>
      <line
        x1={pos[0] - S}
        y1={pos[1]}
        x2={pos[0] + S}
        y2={pos[1]}
        stroke="#f80"
        strokeWidth={2}
        pointerEvents="none"
      />
      <line
        x1={pos[0]}
        y1={pos[1] - S}
        x2={pos[0]}
        y2={pos[1] + S}
        stroke="#f80"
        strokeWidth={2}
        pointerEvents="none"
      />
      {/* 透明なヒット領域 */}
      <circle
        cx={pos[0]}
        cy={pos[1]}
        r={S + 2}
        fill="transparent"
        onPointerDown={(e) => {
          e.stopPropagation();
          const svgEl = (e.currentTarget as SVGCircleElement).ownerSVGElement!;
          e.currentTarget.setPointerCapture(e.pointerId);

          const onMove = (me: PointerEvent) => {
            const p = svgPoint(svgEl, me.clientX, me.clientY);
            onDrag(p);
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      />
      <text
        x={pos[0] + S + 2}
        y={pos[1] - 2}
        fontSize={10}
        fill="#f80"
        pointerEvents="none"
      >
        {name}
      </text>
    </g>
  );
}

export function EditCanvas({
  charStore,
  selectedRef,
  selectedShapeIndex,
  tool,
  onSelectShape,
  onShapeCountChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState(INIT_VB);
  const [doc, setDoc] = useState(charStore.doc);
  const [drawRect, setDrawRect] = useState<{
    start: Vec2; current: Vec2;
  } | null>(null);

  // drag state refs (avoid stale closures in pointer handlers)
  const dragState = useRef<{
    kind: "move" | "resize";
    startClient: Vec2;
    startSvg: Vec2;
    corner?: string;
    origShape?: Shape;
  } | null>(null);

  useEffect(() => {
    return charStore.subscribe(() => setDoc(charStore.doc));
  }, [charStore]);

  // keyboard: delete / arrows / undo/redo
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedRef) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedShapeIndex !== null) {
          removeShape(charStore, selectedRef, selectedShapeIndex);
          onSelectShape(null);
          onShapeCountChange?.();
        }
      }
      const nudge = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -nudge;
      else if (e.key === "ArrowRight") dx = nudge;
      else if (e.key === "ArrowUp") dy = -nudge;
      else if (e.key === "ArrowDown") dy = nudge;
      if ((dx !== 0 || dy !== 0) && selectedShapeIndex !== null) {
        e.preventDefault();
        const shape = getShapes(doc, selectedRef)?.[selectedShapeIndex];
        if (!shape) return;
        const patch = shapeTranslatePatch(shape, dx, dy);
        updateShape(charStore, selectedRef, selectedShapeIndex, patch, `shape:${refKey(selectedRef)}:${selectedShapeIndex}`);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) charStore.redo();
        else charStore.undo();
      }
    },
    [charStore, selectedRef, selectedShapeIndex, doc, onSelectShape, onShapeCountChange],
  );

  // snap pin to capsule-end or ellipse center within PIN_SNAP_DIST
  const snapPin = useCallback(
    (pos: Vec2): Vec2 => {
      if (!selectedRef) return pos;
      const shapes = getShapes(doc, selectedRef) ?? [];
      let best: Vec2 | null = null;
      let bestDist = PIN_SNAP_DIST;

      for (const shape of shapes) {
        const candidates: Vec2[] = [];
        if (shape.kind === "ellipse") {
          candidates.push([shape.cx, shape.cy]);
        } else if (shape.kind === "rect") {
          const r = shape.r ?? 0;
          const minDim = Math.min(shape.w, shape.h);
          if (r >= minDim / 2 - 0.5) {
            // capsule: both circle-end centers
            if (shape.w > shape.h) {
              candidates.push([shape.x + r, shape.y + shape.h / 2]);
              candidates.push([shape.x + shape.w - r, shape.y + shape.h / 2]);
            } else {
              candidates.push([shape.x + shape.w / 2, shape.y + r]);
              candidates.push([shape.x + shape.w / 2, shape.y + shape.h - r]);
            }
          }
        }
        for (const c of candidates) {
          const d = Math.hypot(pos[0] - c[0], pos[1] - c[1]);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
      }
      return best ?? pos;
    },
    [doc, selectedRef],
  );

  // wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 0.9 : 1.1;
    setVb((v) => {
      const newW = Math.max(190, Math.min(3040, v.w * factor));
      const newH = Math.max(215, Math.min(3440, v.h * factor));
      const fx = mx / rect.width;
      const fy = my / rect.height;
      const newX = v.x + (v.w - newW) * fx;
      const newY = v.y + (v.h - newH) * fy;
      return { x: newX, y: newY, w: newW, h: newH };
    });
  };

  // background pan / draw-tool start
  const handleBgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    if (tool === "rect" || tool === "ellipse") {
      const p = svgPoint(svg, e.clientX, e.clientY);
      setDrawRect({ start: p, current: p });
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // pan(開始時のviewBox基準で絶対値更新。複利暴走防止)
    onSelectShape(null);
    const startX = e.clientX;
    const startY = e.clientY;
    const startVb = vb;
    svg.setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      const rect = svg.getBoundingClientRect();
      const scaleX = startVb.w / rect.width;
      const scaleY = startVb.h / rect.height;
      setVb({
        ...startVb,
        x: startVb.x - dx * scaleX,
        y: startVb.y - dy * scaleY,
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawRect) {
      const svg = svgRef.current;
      if (!svg) return;
      const p = svgPoint(svg, e.clientX, e.clientY);
      setDrawRect((d) => d ? { ...d, current: p } : null);
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawRect || !selectedRef) {
      setDrawRect(null);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const p = svgPoint(svg, e.clientX, e.clientY);
    const x0 = Math.min(drawRect.start[0], p[0]);
    const y0 = Math.min(drawRect.start[1], p[1]);
    const w = Math.abs(p[0] - drawRect.start[0]);
    const h = Math.abs(p[1] - drawRect.start[1]);
    if (w > 2 && h > 2) {
      if (tool === "rect") {
        addShape(charStore, selectedRef, { kind: "rect", x: x0, y: y0, w, h, r: 0, fill: "@primary" });
      } else {
        addShape(charStore, selectedRef, {
          kind: "ellipse",
          cx: x0 + w / 2,
          cy: y0 + h / 2,
          rx: w / 2,
          ry: h / 2,
          fill: "@primary",
        });
      }
      onShapeCountChange?.();
    }
    setDrawRect(null);
  };

  // shape drag (move)
  const handleShapePointerDown = (
    e: React.PointerEvent,
    index: number,
  ) => {
    if (!selectedRef || tool !== "select") return;
    e.stopPropagation();
    onSelectShape(index);
    const shape = getShapes(doc, selectedRef)?.[index];
    if (!shape) return;
    const svg = svgRef.current;
    if (!svg) return;
    const startSvg = svgPoint(svg, e.clientX, e.clientY);
    dragState.current = {
      kind: "move",
      startClient: [e.clientX, e.clientY],
      startSvg,
      origShape: structuredClone(shape),
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      if (!dragState.current || !selectedRef) return;
      const svg2 = svgRef.current;
      if (!svg2) return;
      const curSvg = svgPoint(svg2, me.clientX, me.clientY);
      const dx = curSvg[0] - dragState.current.startSvg[0];
      const dy = curSvg[1] - dragState.current.startSvg[1];
      const orig = dragState.current.origShape!;
      const patch = shapeTranslatePatch(orig, dx, dy);
      updateShape(charStore, selectedRef, index, patch, `shape:${refKey(selectedRef)}:${index}`);
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // resize handle drag(常にドラッグ開始時のorigに累積デルタを適用)
  const handleResizeDrag = useCallback(
    (corner: string, dcx: number, dcy: number, orig: Shape) => {
      if (!selectedRef || selectedShapeIndex === null) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = vb.w / rect.width;
      const scaleY = vb.h / rect.height;
      const dx = dcx * scaleX;
      const dy = dcy * scaleY;
      const shape = orig;

      if (shape.kind === "rect") {
        let { x, y, w, h } = shape;
        if (corner === "tl") { x += dx; y += dy; w -= dx; h -= dy; }
        else if (corner === "tr") { y += dy; w += dx; h -= dy; }
        else if (corner === "bl") { x += dx; w -= dx; h += dy; }
        else if (corner === "br") { w += dx; h += dy; }
        if (w > 1 && h > 1) {
          updateShape(charStore, selectedRef, selectedShapeIndex, { x, y, w, h }, `shape:${refKey(selectedRef)}:${selectedShapeIndex}`);
        }
      } else if (shape.kind === "ellipse") {
        let { cx, cy, rx, ry } = shape;
        if (corner === "tl") { cx += dx / 2; cy += dy / 2; rx -= dx / 2; ry -= dy / 2; }
        else if (corner === "tr") { cx += dx / 2; cy += dy / 2; rx += dx / 2; ry -= dy / 2; }
        else if (corner === "bl") { cx += dx / 2; cy += dy / 2; rx -= dx / 2; ry += dy / 2; }
        else if (corner === "br") { cx += dx / 2; cy += dy / 2; rx += dx / 2; ry += dy / 2; }
        if (rx > 0.5 && ry > 0.5) {
          updateShape(charStore, selectedRef, selectedShapeIndex, { cx, cy, rx, ry }, `shape:${refKey(selectedRef)}:${selectedShapeIndex}`);
        }
      }
    },
    [charStore, selectedRef, selectedShapeIndex, vb],
  );

  const palette = doc.palette;
  const allRefs = listSlotRefs(doc);
  const selKey = selectedRef ? refKey(selectedRef) : null;
  const selectedShapes = selectedRef ? (getShapes(doc, selectedRef) ?? []) : [];
  const selectedShape = selectedShapeIndex !== null ? selectedShapes[selectedShapeIndex] ?? null : null;
  const pins = selectedRef ? getPins(doc, selectedRef) : {};

  // variant≠neutral 編集中: neutralシェイプをゴーストとして取得
  const neutralGhostShapes = (
    selectedRef?.kind === "face" &&
    (selectedRef.variant ?? "neutral") !== "neutral"
  )
    ? (getShapes(doc, { ...selectedRef, variant: "neutral" }) ?? [])
    : [];

  // grid lines
  const gridLines: React.ReactNode[] = [];
  const gx0 = Math.floor(vb.x / GRID) * GRID;
  const gy0 = Math.floor(vb.y / GRID) * GRID;
  for (let gx = gx0; gx <= vb.x + vb.w; gx += GRID) {
    gridLines.push(
      <line key={`gx${gx}`} x1={gx} y1={vb.y} x2={gx} y2={vb.y + vb.h}
        stroke="#e0e0e0" strokeWidth={0.5} />,
    );
  }
  for (let gy = gy0; gy <= vb.y + vb.h; gy += GRID) {
    gridLines.push(
      <line key={`gy${gy}`} x1={vb.x} y1={gy} x2={vb.x + vb.w} y2={gy}
        stroke="#e0e0e0" strokeWidth={0.5} />,
    );
  }

  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const canvasCursor = tool === "select" ? "default" : "crosshair";

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      style={{
        width: "100%",
        height: "100%",
        background: "#fafafa",
        cursor: canvasCursor,
        touchAction: "none",
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onPointerDown={handleBgPointerDown}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
    >
      {/* grid */}
      {gridLines}
      {/* axes */}
      <line x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h} stroke="#ccc" strokeWidth={1} />
      <line x1={vb.x} y1={0} x2={vb.x + vb.w} y2={0} stroke="#ccc" strokeWidth={1} />
      {/* ground line */}
      <line x1={vb.x} y1={GROUND_Y} x2={vb.x + vb.w} y2={GROUND_Y} stroke="#b0cfa0" strokeWidth={1} strokeDasharray="6 4" />
      <text x={vb.x + 4} y={GROUND_Y - 3} fontSize={10} fill="#8ab888">接地 y=310</text>

      {/* all slots */}
      {allRefs.map((ref) => {
        const key = refKey(ref);
        const isSelected = key === selKey;
        const shapes = getShapes(doc, ref) ?? [];
        return (
          <g key={key}>
            {shapes.map((shape, i) => (
              <g
                key={i}
                onPointerDown={isSelected ? (e) => handleShapePointerDown(e, i) : undefined}
                style={isSelected ? { cursor: "move" } : undefined}
              >
                <ShapeEl
                  shape={shape}
                  palette={palette}
                  selected={isSelected && selectedShapeIndex === i}
                  dimmed={!isSelected}
                  onClick={() => {
                    if (isSelected) onSelectShape(i);
                  }}
                />
              </g>
            ))}
            {/* resize handles for selected shape */}
            {isSelected && selectedShape && selectedShapeIndex !== null && (
              <ResizeHandles
                shape={selectedShape}
                onDrag={handleResizeDrag}
              />
            )}
          </g>
        );
      })}

      {/* neutral ゴースト(variant編集中: opacity 0.2・操作不可) */}
      {neutralGhostShapes.length > 0 && (
        <g opacity={0.2} pointerEvents="none">
          {neutralGhostShapes.map((shape, i) => (
            <ShapeEl
              key={`ghost:${i}`}
              shape={shape}
              palette={palette}
              selected={false}
              dimmed={false}
              onClick={() => undefined}
            />
          ))}
        </g>
      )}

      {/* pins for selected ref */}
      {selectedRef && Object.entries(pins).map(([name, pos]) => (
        <PinMarker
          key={name}
          name={name}
          pos={pos}
          onDrag={(newPos) => {
            const snapped = snapPin(newPos);
            movePin(charStore, selectedRef, name, snapped);
          }}
        />
      ))}

      {/* draw preview */}
      {drawRect && (tool === "rect" || tool === "ellipse") && (() => {
        const x0 = Math.min(drawRect.start[0], drawRect.current[0]);
        const y0 = Math.min(drawRect.start[1], drawRect.current[1]);
        const dw = Math.abs(drawRect.current[0] - drawRect.start[0]);
        const dh = Math.abs(drawRect.current[1] - drawRect.start[1]);
        if (tool === "rect") {
          return (
            <rect
              x={x0} y={y0} width={dw} height={dh}
              fill="rgba(91,125,177,0.2)"
              stroke="#5B7DB1"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          );
        }
        return (
          <ellipse
            cx={x0 + dw / 2}
            cy={y0 + dh / 2}
            rx={dw / 2}
            ry={dh / 2}
            fill="rgba(91,125,177,0.2)"
            stroke="#5B7DB1"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        );
      })()}
    </svg>
  );
}

function shapeTranslatePatch(shape: Shape, dx: number, dy: number): Partial<Shape> {
  switch (shape.kind) {
    case "rect":
      return { x: shape.x + dx, y: shape.y + dy };
    case "ellipse":
      return { cx: shape.cx + dx, cy: shape.cy + dy };
    case "polygon":
      return { points: shape.points.map((p): Vec2 => [p[0] + dx, p[1] + dy]) };
    case "path":
      return {
        d: shape.d.map((cmd) => {
          switch (cmd.c) {
            case "M": return { ...cmd, p: [cmd.p[0] + dx, cmd.p[1] + dy] as Vec2 };
            case "L": return { ...cmd, p: [cmd.p[0] + dx, cmd.p[1] + dy] as Vec2 };
            case "Q": return { ...cmd, cp: [cmd.cp[0] + dx, cmd.cp[1] + dy] as Vec2, p: [cmd.p[0] + dx, cmd.p[1] + dy] as Vec2 };
            case "C": return { ...cmd, cp1: [cmd.cp1[0] + dx, cmd.cp1[1] + dy] as Vec2, cp2: [cmd.cp2[0] + dx, cmd.cp2[1] + dy] as Vec2, p: [cmd.p[0] + dx, cmd.p[1] + dy] as Vec2 };
            case "Z": return cmd;
          }
        }),
      };
  }
}
