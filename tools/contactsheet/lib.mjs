#!/usr/bin/env node
// 共通ヘルパー: dev server 起動確認・待機・スクショ
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import { mkdirSync } from "fs";
import { resolve } from "path";

export const DEV_URL = "http://localhost:5273";
export const projectRoot = new URL("../../", import.meta.url).pathname;

export async function isServerUp() {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export async function ensureDevServer() {
  if (await isServerUp()) return null;

  console.log("dev server を起動します...");
  const devProc = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    stdio: "pipe",
    detached: false,
  });
  process.on("exit", () => { try { devProc.kill(); } catch {} });
  process.on("SIGINT", () => { try { devProc.kill(); } catch {} process.exit(130); });
  process.on("SIGTERM", () => { try { devProc.kill(); } catch {} process.exit(143); });

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
  return devProc;
}

export async function launchBrowser(viewportW, viewportH) {
  const { chromium } = await import("playwright-core");
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (e) {
    console.error(
      "Chrome が見つかりません。Google Chrome をインストールしてください。\n" + String(e),
    );
    process.exit(1);
  }
  const context = await browser.newContext({
    viewport: { width: viewportW, height: viewportH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  return { browser, page };
}

export function ensureExportsDir() {
  const exportsDir = resolve(projectRoot, "exports");
  mkdirSync(exportsDir, { recursive: true });
  return exportsDir;
}
