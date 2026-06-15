import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFile, mkdir } from "node:fs/promises";

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

export default defineConfig({
  plugins: [react(), poseSnapshotPlugin()],
  server: { port: 5273, strictPort: true },
});
