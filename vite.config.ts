import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

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

// assets/generated/*.png をリスト化して返す。
// GET /__generated-list?limit=30
// 各エントリ: { src, basename, size, mtime, importedAs? }
// importedAs は同名の assets/objects/<basename>.png が存在すれば、その相対パス。
function generatedListPlugin(): Plugin {
  return {
    name: "generated-list",
    configureServer(server) {
      server.middlewares.use("/__generated-list", async (req, res) => {
        if (req.method && req.method !== "GET") {
          res.statusCode = 405; res.end("GET only"); return;
        }
        try {
          const dir = "assets/generated";
          const url = new URL(req.url ?? "/", "http://localhost");
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 60)));
          const filter = (url.searchParams.get("filter") ?? "").toLowerCase();
          const names = await readdir(dir);
          const pngs = names.filter((n) => n.toLowerCase().endsWith(".png"));
          const stats = await Promise.all(
            pngs.map(async (n) => {
              const s = await stat(`${dir}/${n}`);
              return { name: n, size: s.size, mtime: s.mtimeMs };
            }),
          );
          // newest first
          stats.sort((a, b) => b.mtime - a.mtime);
          const filtered = filter ? stats.filter((s) => s.name.toLowerCase().includes(filter)) : stats;
          const slice = filtered.slice(0, limit);
          // import 状態: 同名(タイムスタンプ除いた basename)の assets/objects/<name>.png が存在するか
          // 単純化のため、basename を完全一致でチェックする(将来的に「-20260618」等の suffix 除去を入れてもよい)
          const objectNames = new Set(
            (await readdir("assets/objects").catch(() => [] as string[])).filter((n) => n.toLowerCase().endsWith(".png")),
          );
          const entries = slice.map((s) => ({
            src: `${dir}/${s.name}`,
            basename: s.name,
            size: s.size,
            mtime: s.mtime,
            importedAs: objectNames.has(s.name) ? `assets/objects/${s.name}` : null,
          }));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ entries, total: filtered.length }));
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error)?.message ?? e));
        }
      });
    },
  };
}

// Codex 生成物 → 透過 PNG への chroma-key+クロップ取り込み。
// POST /__object-import { src, outputName, brightThresh?, satThresh?, largestOnly?, noCrop? }
// - src: "assets/generated/..." のみ許可
// - outputName: 安全なファイル名(英数とハイフン/アンダースコアのみ、拡張子なし)
// 内部で `python3 scripts/chromakey-import.py` を実行。
function objectImportPlugin(): Plugin {
  return {
    name: "object-import",
    configureServer(server) {
      server.middlewares.use("/__object-import", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
        try {
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const params = JSON.parse(body) as {
            src?: string; outputName?: string;
            brightThresh?: number; satThresh?: number;
            largestOnly?: boolean; noCrop?: boolean;
          };
          const { src, outputName } = params;
          if (typeof src !== "string" || !src.startsWith("assets/generated/") || src.includes("..")) {
            res.statusCode = 400; res.end("bad src (must be under assets/generated/)"); return;
          }
          if (typeof outputName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(outputName)) {
            res.statusCode = 400; res.end("bad outputName (only [a-zA-Z0-9_-])"); return;
          }
          const output = `assets/objects/${outputName}.png`;
          const bright = Number.isFinite(params.brightThresh) ? Number(params.brightThresh) : 235;
          const sat = Number.isFinite(params.satThresh) ? Number(params.satThresh) : 10;
          const largestOnly = params.largestOnly !== false; // default true
          const noCrop = params.noCrop === true;
          const args = [
            "scripts/chromakey-import.py", src, output,
            "--bright", String(bright),
            "--saturation", String(sat),
            ...(largestOnly ? ["--largest-only"] : []),
            ...(noCrop ? ["--no-crop"] : []),
          ];
          await mkdir("assets/objects", { recursive: true });
          const { stdout, stderr } = await pExecFile("python3", args, { maxBuffer: 4 * 1024 * 1024 });
          // stdout 例: "INPUT (WxH) -> OUTPUT (WxH, X.X% transparent)"
          const m = stdout.match(/->\s*\S+\s*\((\d+)x(\d+),\s*([\d.]+)% transparent\)/);
          const result = m
            ? { width: Number(m[1]), height: Number(m[2]), transparentPct: Number(m[3]) }
            : null;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, output, result, stdout, stderr }));
        } catch (e) {
          const err = e as { message?: string; stderr?: string };
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message, stderr: err.stderr }));
        }
      });
    },
  };
}

// assets/objects/*.png の alpha 透過状況を報告。GET /__object-alpha
// scripts/object-alpha-report.py の JSON {files:[{src,w,h,transparentPct,opaque}]} をそのまま返す。
// ObjectPage が「透過済/要透過」バッジ・フィルタ・件数に使う。
function objectAlphaPlugin(): Plugin {
  return {
    name: "object-alpha",
    configureServer(server) {
      server.middlewares.use("/__object-alpha", async (req, res) => {
        if (req.method && req.method !== "GET") { res.statusCode = 405; res.end("GET only"); return; }
        try {
          const { stdout } = await pExecFile("python3", ["scripts/object-alpha-report.py"], { maxBuffer: 8 * 1024 * 1024 });
          res.setHeader("Content-Type", "application/json");
          res.end(stdout);
        } catch (e) {
          const err = e as { message?: string; stderr?: string };
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message, stderr: err.stderr }));
        }
      });
    },
  };
}

// 既存カタログ画像を「その場で」透過化する。POST /__object-make-transparent { src, brightThresh?, satThresh?, largestOnly? }
// - src: "assets/objects/..." の .png のみ許可(他パスへの書き込み防止)
// - chromakey-import.py を --no-crop で in-place 実行 = 寸法を変えない(catalog の nativeW/H が崩れない)。
//   端からの flood-fill で外周の白系背景だけを alpha=0 にし、内部の白系ディテールは維持する。
function objectMakeTransparentPlugin(): Plugin {
  return {
    name: "object-make-transparent",
    configureServer(server) {
      server.middlewares.use("/__object-make-transparent", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
        try {
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const params = JSON.parse(body) as {
            src?: string; brightThresh?: number; satThresh?: number; largestOnly?: boolean;
          };
          const { src } = params;
          if (typeof src !== "string" || !src.startsWith("assets/objects/") || src.includes("..") || !src.endsWith(".png")) {
            res.statusCode = 400; res.end("bad src (must be a .png under assets/objects/)"); return;
          }
          const bright = Number.isFinite(params.brightThresh) ? Number(params.brightThresh) : 235;
          const sat = Number.isFinite(params.satThresh) ? Number(params.satThresh) : 10;
          const largestOnly = params.largestOnly === true; // 既定 false: in-place は全成分維持が安全
          const args = [
            "scripts/chromakey-import.py", src, src,
            "--bright", String(bright),
            "--saturation", String(sat),
            "--no-crop",
            ...(largestOnly ? ["--largest-only"] : []),
          ];
          const { stdout, stderr } = await pExecFile("python3", args, { maxBuffer: 4 * 1024 * 1024 });
          const m = stdout.match(/->\s*\S+\s*\((\d+)x(\d+),\s*([\d.]+)% transparent\)/);
          const result = m ? { width: Number(m[1]), height: Number(m[2]), transparentPct: Number(m[3]) } : null;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, src, result, stdout, stderr }));
        } catch (e) {
          const err = e as { message?: string; stderr?: string };
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message, stderr: err.stderr }));
        }
      });
    },
  };
}

// catalog の hidden ID リストを管理。GET /__catalog-hidden で読取、POST /__catalog-hidden で
// id を追加・削除。実体は src/editor/scene/catalog-hidden.json。catalog source は触らない。
// オブジェクトタブで「削除」ボタンを押すと id がここに加わり、UI から非表示になる (soft hide)。
function catalogHiddenPlugin(): Plugin {
  const HIDDEN_PATH = "src/editor/scene/catalog-hidden.json";
  return {
    name: "catalog-hidden",
    configureServer(server) {
      server.middlewares.use("/__catalog-hidden", async (req, res) => {
        try {
          if (req.method === "GET" || !req.method) {
            const buf = await readFile(HIDDEN_PATH, "utf8").catch(() => '{"hidden":[]}');
            res.setHeader("Content-Type", "application/json");
            res.end(buf);
            return;
          }
          if (req.method !== "POST") { res.statusCode = 405; res.end("GET or POST only"); return; }
          let body = "";
          for await (const chunk of req) body += chunk as string;
          const { id, action } = JSON.parse(body) as { id?: string; action?: "hide" | "unhide" };
          if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
            res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: "bad id" })); return;
          }
          const op = action === "unhide" ? "unhide" : "hide";
          const cur = JSON.parse(await readFile(HIDDEN_PATH, "utf8").catch(() => '{"hidden":[]}')) as { hidden: string[] };
          const set = new Set(cur.hidden);
          if (op === "hide") set.add(id); else set.delete(id);
          const next = { hidden: Array.from(set).sort() };
          await writeFile(HIDDEN_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, hidden: next.hidden, op }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), poseSnapshotPlugin(), rigSavePlugin(), objectFlipPlugin(), generatedListPlugin(), objectImportPlugin(), objectAlphaPlugin(), objectMakeTransparentPlugin(), catalogHiddenPlugin()],
  server: { port: 5273, strictPort: true },
});
