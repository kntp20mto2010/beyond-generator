#!/usr/bin/env node
// クリップシートCLI: 全クリップ×位相4サンプルのグリッドPNGを出力
import { readFileSync, mkdirSync } from "fs";
import { resolve, basename } from "path";
import {
  DEV_URL,
  projectRoot,
  ensureDevServer,
  launchBrowser,
  ensureExportsDir,
} from "./lib.mjs";

const PAGE_URL = `${DEV_URL}/#clip-sheet`;
const VIEWPORT_W = 900;
const VIEWPORT_H = 3200;

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

const devProc = await ensureDevServer();
const { browser, page } = await launchBrowser(VIEWPORT_W, VIEWPORT_H);

try {
  await page.goto(PAGE_URL, { waitUntil: "networkidle" });

  if (inputFile) {
    const absPath = resolve(inputFile);
    const json = readFileSync(absPath, "utf-8");
    await page.evaluate((jsonStr) => {
      const g = globalThis;
      if (typeof g.__loadContactSheetChar === "function") {
        g.__loadContactSheetChar(jsonStr);
      }
    }, json);
    const { setTimeout: sleep } = await import("timers/promises");
    await sleep(1000);
  }

  await page.waitForFunction(() => globalThis.__clipSheetReady === true, {
    timeout: 15000,
  });

  const canvasEl = await page.locator("#clip-sheet-canvas canvas").first();

  if (!outputFile) {
    let charName = "template";
    if (inputFile) {
      charName = basename(inputFile, ".byc.json").replace(/[^a-z0-9_-]/gi, "_");
    }
    const exportsDir = ensureExportsDir();
    outputFile = resolve(exportsDir, `clipsheet-${charName}.png`);
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
