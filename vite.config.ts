import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFile, mkdir, readFile } from "node:fs/promises";

// 新キャラタブのスナップ機能専用 middleware。
// POST /__pose-snapshot { name, dataUrl } → tmp/pose-snapshots/<ts>-<name>.png に保存し
// JSON { path, bytes } を返す。Codex CLI に `-i` で渡せるようプロジェクト相対パスで返す。
function poseSnapshotPlugin(): Plugin {
  return {
    name: "pose-snapshot",
    configureServer(server) {
      server.middlewares.use("/__pose-snapshot", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        try {
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const { name, dataUrl } = JSON.parse(body) as { name?: string; dataUrl?: string };
          const PREFIX = "data:image/png;base64,";
          if (typeof dataUrl !== "string" || !dataUrl.startsWith(PREFIX)) {
            res.statusCode = 400;
            res.end("bad dataUrl");
            return;
          }
          const b64 = dataUrl.slice(PREFIX.length);
          const data = Buffer.from(b64, "base64");
          const safeName = String(name || "snap").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60);
          const stamp = Date.now();
          const dir = "tmp/pose-snapshots";
          const file = `${dir}/${stamp}-${safeName}.png`;
          await mkdir(dir, { recursive: true });
          await writeFile(file, data);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ path: file, bytes: data.length }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error)?.message ?? e));
        }
      });
    },
  };
}

// CharConfig の指定キャラの腕 pivot を character-configs.ts に書き戻す。
// arms: [{ key, pivot: [x, y] }] を受け取り、SAKURA_CFG/RYOUTA_CFG のブロック内で
// `key: "<KEY>"` を含む {…} の `pivot: [a, b]` 数値だけを置換。
function rigSavePlugin(): Plugin {
  return {
    name: "rig-save",
    configureServer(server) {
      server.middlewares.use("/__rig-save", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
        try {
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const { char, arms, legs } = JSON.parse(body) as {
            char?: string;
            arms?: { key: string; pivot: [number, number] }[];
            legs?: { key: string; pos: [number, number] }[];
          };
          const CONST_BY_CHAR: Record<string, string> = { sakura: "SAKURA_CFG", ryouta: "RYOUTA_CFG" };
          const constName = CONST_BY_CHAR[char ?? ""];
          if (!constName || (!Array.isArray(arms) && !Array.isArray(legs))) {
            res.statusCode = 400; res.end("bad payload"); return;
          }
          const path = "src/editor/newchar/character-configs.ts";
          const orig = await readFile(path, "utf8");
          const startRe = new RegExp(`export const ${constName}: CharConfig = \\{`);
          const m = startRe.exec(orig);
          if (!m) { res.statusCode = 500; res.end("const not found"); return; }
          const blockStart = m.index;
          const closeOffset = orig.slice(blockStart).indexOf("\n};");
          if (closeOffset < 0) { res.statusCode = 500; res.end("block close not found"); return; }
          const blockEnd = blockStart + closeOffset;
          let block = orig.slice(blockStart, blockEnd);
          let n = 0;
          for (const a of arms ?? []) {
            const [px, py] = a.pivot;
            // { key: "<KEY>", ... pivot: [a, b], ... } の数値だけを置換。
            // arms 配列の各要素は 1 行で書かれている前提(現状の整形に一致)。
            const pat = new RegExp(`(\\{[^}]*key:\\s*"${a.key}"[^}]*pivot:\\s*\\[)\\s*\\d+\\s*,\\s*\\d+\\s*(\\])`);
            const next = block.replace(pat, `$1${Math.round(px)}, ${Math.round(py)}$2`);
            if (next !== block) { n++; block = next; }
          }
          // 脚関節(トップレベルの hipL/hipR/kneeL/kneeR/ankleL/ankleR: [x, y])。
          const LEG_KEYS = new Set(["hipL", "hipR", "kneeL", "kneeR", "ankleL", "ankleR"]);
          for (const l of legs ?? []) {
            if (!LEG_KEYS.has(l.key)) continue;
            const [px, py] = l.pos;
            const pat = new RegExp(`(\\b${l.key}:\\s*\\[)\\s*-?\\d+\\s*,\\s*-?\\d+\\s*(\\])`);
            const next = block.replace(pat, `$1${Math.round(px)}, ${Math.round(py)}$2`);
            if (next !== block) { n++; block = next; }
          }
          const newOrig = orig.slice(0, blockStart) + block + orig.slice(blockEnd);
          await writeFile(path, newOrig);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, char, replaced: n }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error)?.message ?? e));
        }
      });
    },
  };
}

// オブジェクト画像の水平反転上書き専用 middleware。
// POST /__object-flip { src, dataUrl } → assets/objects/ 配下の src を上書き。
// src は assets/objects/ 配下に限定(他パスへの書き込みを防ぐ)。
function objectFlipPlugin(): Plugin {
  return {
    name: "object-flip",
    configureServer(server) {
      server.middlewares.use("/__object-flip", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
        try {
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const { src, dataUrl } = JSON.parse(body) as { src?: string; dataUrl?: string };
          if (typeof src !== "string" || !src.startsWith("assets/objects/") || src.includes("..")) {
            res.statusCode = 400; res.end("bad src (must be under assets/objects/)"); return;
          }
          const PREFIX = "data:image/png;base64,";
          if (typeof dataUrl !== "string" || !dataUrl.startsWith(PREFIX)) {
            res.statusCode = 400; res.end("bad dataUrl"); return;
          }
          const data = Buffer.from(dataUrl.slice(PREFIX.length), "base64");
          await writeFile(src, data);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, src, bytes: data.length }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error)?.message ?? e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), poseSnapshotPlugin(), rigSavePlugin(), objectFlipPlugin()],
  server: { port: 5273, strictPort: true },
});
