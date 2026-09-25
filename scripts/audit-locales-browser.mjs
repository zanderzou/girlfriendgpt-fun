import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { localeList } from "../src/data/localized-girlfriendgpt.ts";
import { comparisonKeys } from "../src/data/localized-articles.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/zande/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:4325";
const routes = ["/", "/blog/", "/about/", "/contact/", "/editorial-policy/", "/privacy/", "/terms/", ...comparisonKeys.map((key) => `/blog/girlfriendgpt-vs-${key}/`)];
const checks = [{ code: "en", slug: "" }, ...localeList.map(({ code, slug }) => ({ code, slug }))];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let passed = 0;
const failures = [];
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, deviceScaleFactor: 1 });
    for (const locale of checks) {
      for (const route of routes) {
        const pathname = locale.slug ? `/${locale.slug}${route}` : route;
        const response = await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded", timeout: 15000 });
        const result = await page.evaluate(() => {
          const heading = document.querySelector("h1");
          const rect = heading?.getBoundingClientRect();
          return {
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            overflow: Math.ceil(document.documentElement.scrollWidth - innerWidth),
            heading: heading?.textContent?.trim() ?? "",
            headingWidth: rect?.width ?? 0,
            headingRight: rect?.right ?? 0,
            headingLeft: rect?.left ?? 0,
            headingHeight: rect?.height ?? 0,
            lineHeight: heading ? parseFloat(getComputedStyle(heading).lineHeight) : 0,
            picker: !!document.querySelector(".language-picker"),
          };
        });
        const ok = response?.status() === 200 && result.lang === locale.code && result.dir === (locale.code === "ar" ? "rtl" : "ltr") && result.overflow <= 1 && result.headingWidth > 0 && result.headingLeft >= -2 && result.headingRight <= width + 2 && result.picker;
        if (!ok) failures.push(`${width}px ${pathname}: ${JSON.stringify({ status: response?.status(), ...result })}`);
        if (route === "/" && (result.heading !== "GirlfriendGPT" || result.headingHeight > result.lineHeight * 1.2)) failures.push(`${width}px ${pathname}: homepage title wraps`);
        if (["ja", "de", "ar"].includes(locale.slug) && ["/", "/blog/girlfriendgpt-vs-candy-ai/"].includes(route)) {
          const name = `girlfriendgpt-${locale.slug}-${route === "/" ? "home" : "article"}-${width}.png`;
          await page.screenshot({ path: path.join(os.tmpdir(), name), fullPage: false });
        }
        passed++;
      }
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await page.goto(`${base}/ja/blog/girlfriendgpt-vs-candy-ai/`);
  await page.locator(".language-picker summary").click();
  await page.locator(".language-options a[lang=ar]").click();
  if (!page.url().endsWith("/ar/blog/girlfriendgpt-vs-candy-ai/")) failures.push(`Language switch failed: ${page.url()}`);
  await page.close();
} finally { await browser.close(); }
if (failures.length) { console.error(`Browser audit failed (${failures.length}):\n- ${failures.join("\n- ")}`); process.exitCode = 1; }
else console.log(`Browser audit passed: ${passed}/240 desktop/mobile pages, one-line keyword headings, RTL and article language switch. Sample screenshots in ${os.tmpdir()}.`);
