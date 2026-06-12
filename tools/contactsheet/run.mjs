#!/usr/bin/env node
// コンタクトシートCLI: playwright-core (channel:"chrome") を使ってPNG出力
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { spawnSync, spawn } from "child_process";
import { resolve, basename } from "path";
import { setTimeout as sleep } from "timers/promises";

const DEV_URL = "http://localhost:5273";
const PAGE_URL = `${DEV_URL}/#contact-sheet`;
const VIEWPORT_W = 1500;
const VIEWPORT_H = 1600;

// --- 引数パース ---
const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" && args[i + 1]) {
    outputFile = args[++i];
  } else if (args[i] && !args[i].startsWith("-")) {
    inputFile = args[i];
  }
}

// --- dev server 起動確認 ---
async function isServerUp() {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

let devProc = null;
const projectRoot = new URL("../../", import.meta.url).pathname;

if (!(await isServerUp())) {
  console.log("dev server を起動します...");
  devProc = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    stdio: "pipe",
    detached: false,
  });
  // 終了時に必ずkill
  process.on("exit", () => { try { devProc.kill(); } catch {} });
  process.on("SIGINT", () => { try { devProc.kill(); } catch {} process.exit(130); });
  process.on("SIGTERM", () => { try { devProc.kill(); } catch {} process.exit(143); });

  // dev server が起動するまで待つ
  let waited = 0;
  while (!(await isServerUp())) {
    await sleep(500);
    waited += 500;
    if (waited > 30000) {
      console.error("dev server の起動タイムアウト");
      devProc.kill();
      process.exit(1);
    }
  }
  console.log("dev server 起動完了");
}

// --- Playwright ---
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch (e) {
  console.error(
    "Chrome が見つかりません。Google Chrome をインストールしてください。\n" + String(e),
  );
  if (devProc) devProc.kill();
  process.exit(1);
}

const context = await browser.newContext({
  viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  await page.goto(PAGE_URL, { waitUntil: "networkidle" });

  // 入力ファイルがあれば読み込んで渡す
  if (inputFile) {
    const absPath = resolve(inputFile);
    const json = readFileSync(absPath, "utf-8");
    await page.evaluate((jsonStr) => {
      const g = globalThis;
      if (typeof g.__loadContactSheetChar === "function") {
        g.__loadContactSheetChar(jsonStr);
      }
    }, json);
    // 再レンダーを待つ
    await sleep(1000);
  }

  // 描画完了を待つ
  await page.waitForFunction(() => globalThis.__contactSheetReady === true, {
    timeout: 15000,
  });

  // canvas 要素をスクリーンショット
  const canvasEl = await page.locator("#contact-sheet-canvas canvas").first();

  // 出力パスを決定
  if (!outputFile) {
    let charName = "template";
    if (inputFile) {
      charName = basename(inputFile, ".byc.json").replace(/[^a-z0-9_-]/gi, "_");
    }
    const exportsDir = resolve(projectRoot, "exports");
    mkdirSync(exportsDir, { recursive: true });
    outputFile = resolve(exportsDir, `contactsheet-${charName}.png`);
  } else {
    const dir = resolve(outputFile, "..");
    mkdirSync(dir, { recursive: true });
  }

  await canvasEl.screenshot({ path: outputFile, type: "png" });
  console.log(outputFile);
} finally {
  await browser.close();
  if (devProc) devProc.kill();
}
