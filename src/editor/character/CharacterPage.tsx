import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";
import { TEMPLATE_A } from "../../presets/characters/template-a.js";
import { computeBoneWorld, buildRenderList, type Pose } from "../../runtime/pose.js";
import { buildCharacterContainer } from "../../render/character-pixi.js";
import { validateCharacter } from "../../core/schema/character.js";

interface PoseDef {
  label: string;
  pose: Pose;
  handShape?: string;
}

// リグ検証用ポーズ(プリセットクリップはPhase 3)
const POSES: PoseDef[] = [
  { label: "休め", pose: {} },
  {
    label: "手を振る",
    pose: {
      rotations: { upperArmL: -150, forearmL: -35, head: 6 },
    },
  },
  {
    label: "歩き(検証)",
    pose: {
      rotations: { thighL: -30, shinL: 40, thighR: 20, shinR: 5, torso: 6, upperArmL: 25, upperArmR: -25 },
      rootOffset: [0, -6],
    },
  },
  {
    label: "ジャンプ",
    pose: {
      rotations: {
        upperArmL: -150, forearmL: -20,
        upperArmR: 150, forearmR: 20,
        thighL: -10, shinL: 15, thighR: 10, shinR: -15,
        head: -4,
      },
      rootOffset: [0, -55],
    },
    handShape: "open",
  },
];

const CANVAS_W = 1000;
const CANVAS_H = 540;
const GROUND_Y = 430;
const SCALE = 0.55;

export function CharacterPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        background: "#f4f1ec",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);

      const ground = new Graphics()
        .moveTo(40, GROUND_Y)
        .lineTo(CANVAS_W - 40, GROUND_Y)
        .stroke({ color: "#d8d2c6", width: 2 });
      app.stage.addChild(ground);

      POSES.forEach((def, i) => {
        const bones = computeBoneWorld(TEMPLATE_A, def.pose);
        const items = buildRenderList(TEMPLATE_A, bones, {
          handShape: def.handShape,
        });
        const c = buildCharacterContainer(TEMPLATE_A, items);
        // 接地: キャラ空間の sole y=310 が GROUND_Y に乗るよう配置
        c.position.set(150 + i * 235, GROUND_Y - 310 * SCALE);
        c.scale.set(SCALE);
        app.stage.addChild(c);
      });
    })();

    return () => {
      disposed = true;
      if (app.renderer) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  const issues = validateCharacter(TEMPLATE_A);

  return (
    <div style={{ padding: "8px" }}>
      <p style={{ margin: "4px 0 10px", color: "#666" }}>
        テンプレート「{TEMPLATE_A.name}」 — リグ検証ポーズ(Phase 1)
      </p>
      <div ref={hostRef} />
      <div
        style={{
          display: "flex",
          width: CANVAS_W,
          marginTop: "4px",
          color: "#888",
        }}
      >
        {POSES.map((p) => (
          <span key={p.label} style={{ width: 235, textAlign: "center" }}>
            {p.label}
          </span>
        ))}
      </div>
      {issues.length > 0 && (
        <ul style={{ color: "#c33" }}>
          {issues.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
