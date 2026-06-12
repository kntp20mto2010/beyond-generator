import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import type { DocStore } from "../../core/doc-store.js";
import type { CharacterDoc } from "../../core/schema/character.js";
import { computeBoneWorld, buildRenderList } from "../../runtime/pose.js";
import { buildCharacterContainer } from "../../render/character-pixi.js";
import { POSES } from "./poses.js";

const PREVIEW_W = 260;
const PREVIEW_H = 340;
const GROUND_Y = 300;
const SCALE = 0.43;
const MULTI_W = 1000;
const MULTI_H = 360;
const MULTI_GROUND_Y = 320;
const MULTI_SCALE = 0.43;

interface Props {
  charStore: DocStore<CharacterDoc>;
}

export function PosePreview({ charStore }: Props) {
  const singleRef = useRef<HTMLDivElement>(null);
  const multiRef = useRef<HTMLDivElement>(null);
  const [poseIndex, setPoseIndex] = useState(0);
  const [multiMode, setMultiMode] = useState(false);

  // single pose preview
  useEffect(() => {
    const host = singleRef.current;
    if (!host || multiMode) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: PREVIEW_W,
        height: PREVIEW_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const rebuild = () => {
        app.stage.removeChildren();
        const char = charStore.doc;
        const def = POSES[poseIndex] ?? POSES[0]!;
        const bones = computeBoneWorld(char, def.pose);
        const items = buildRenderList(char, bones, { handShape: def.handShape });
        const c = buildCharacterContainer(char, items);
        c.position.set(PREVIEW_W / 2, GROUND_Y - 310 * SCALE);
        c.scale.set(SCALE);
        app.stage.addChild(c);
      };

      rebuild();
      const unsub = charStore.subscribe(rebuild);

      return () => {
        unsub();
      };
    })().then((_cleanup) => {
      // cleanup stored in closure
    });

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseIndex, multiMode]);

  // multi pose preview
  useEffect(() => {
    const host = multiRef.current;
    if (!host || !multiMode) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: MULTI_W,
        height: MULTI_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) { app.destroy(true); return; }
      host.appendChild(app.canvas);

      const rebuild = () => {
        app.stage.removeChildren();
        const char = charStore.doc;
        POSES.forEach((def, i) => {
          const bones = computeBoneWorld(char, def.pose);
          const items = buildRenderList(char, bones, { handShape: def.handShape });
          const c = buildCharacterContainer(char, items);
          c.position.set(130 + i * 185, MULTI_GROUND_Y - 310 * MULTI_SCALE);
          c.scale.set(MULTI_SCALE);
          app.stage.addChild(c);
        });
      };

      rebuild();
      const unsub = charStore.subscribe(rebuild);

      return () => {
        unsub();
      };
    })();

    return () => {
      disposed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode]);

  // rebuild on store change for multi
  useEffect(() => {
    if (!multiMode) return;
    return charStore.subscribe(() => {
      // pixi rebuild is handled inside the pixi effect — this triggers remount via key
    });
  }, [charStore, multiMode]);

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px", flexWrap: "wrap" }}>
        {POSES.map((p, i) => (
          <button
            key={p.label}
            onClick={() => { setMultiMode(false); setPoseIndex(i); }}
            style={{
              padding: "2px 8px",
              fontSize: "11px",
              background: !multiMode && poseIndex === i ? "#5B7DB1" : "#eee",
              color: !multiMode && poseIndex === i ? "#fff" : "#333",
              border: "1px solid #ccc",
              borderRadius: "3px",
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setMultiMode((m) => !m)}
          style={{
            padding: "2px 8px",
            fontSize: "11px",
            background: multiMode ? "#5B7DB1" : "#eee",
            color: multiMode ? "#fff" : "#333",
            border: "1px solid #ccc",
            borderRadius: "3px",
            cursor: "pointer",
          }}
        >
          4ポーズ
        </button>
      </div>
      {!multiMode && <div ref={singleRef} />}
      {multiMode && <div ref={multiRef} />}
    </div>
  );
}
