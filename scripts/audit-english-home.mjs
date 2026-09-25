import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/zande/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 840 }, deviceScaleFactor: 1 });
    const response = await page.goto("http://127.0.0.1:4325/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".hero-copy")).opacity) > 0.95, null, { timeout: 5000 });
    const result = await page.evaluate(() => {
      const title = document.querySelector("h1");
      const rect = title.getBoundingClientRect();
      return { h1: title.textContent.trim(), titleHeight: rect.height, lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    if (response?.status() !== 200 || result.h1 !== "GirlfriendGPT" || result.titleHeight > result.lineHeight * 1.15 || result.overflow > 1) throw Error(`${width}px homepage failed: ${JSON.stringify(result)}`);
    const screenshot = path.join(os.tmpdir(), `girlfriendgpt-home-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    console.log(`${width}px homepage passed; screenshot ${screenshot}`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4325/blog/girlfriendgpt-vs-candy-ai/");
  if (await page.getByText("DIRECT ANSWER", { exact: true }).count()) throw Error("Legacy DIRECT ANSWER block remains");
  await page.close();
} finally { await browser.close(); }
