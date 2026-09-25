import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localeList, homeCopy } from "../src/data/localized-girlfriendgpt.ts";
import { comparisonKeys, comparisonCopy } from "../src/data/localized-articles.ts";
import { infoCopy } from "../src/data/localized-info.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "client");
const origin = "https://girlfriendgpt.fun";
const pagePaths = ["/", "/blog/", "/about/", "/contact/", "/editorial-policy/", "/privacy/", "/terms/", ...comparisonKeys.map((key) => `/blog/girlfriendgpt-vs-${key}/`)];
const sitemap = readFileSync(path.join(out, "sitemap-0.xml"), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
let count = 0;
for (const pagePath of pagePaths) {
  const expected = [
    { code: "en", route: pagePath },
    ...localeList.map(({ code, slug }) => ({ code, route: `/${slug}${pagePath}` })),
    { code: "x-default", route: pagePath },
  ];
  const alternates = new Map(expected.map(({ code, route }) => [code, `${origin}${route}`]));
  for (const { code, route } of expected.slice(0, -1)) {
    const file = path.join(out, route, "index.html");
    check(existsSync(file), `${route}: missing HTML`);
    if (!existsSync(file)) continue;
    count++;
    const html = readFileSync(file, "utf8");
    const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const lang = html.match(/<html lang="([^"]+)"/)?.[1];
    const dir = html.match(/<html [^>]*dir="([^"]+)"/)?.[1];
    const h1 = [...html.matchAll(/<h1(?:\s|>)/g)].length;
    const foundAlternates = new Map([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((match) => [match[1], match[2]]));
    check(title.length > 0, `${route}: title`);
    check(desc.length > 0, `${route}: description`);
    check(canonical === `${origin}${route}`, `${route}: canonical`);
    check(lang === code, `${route}: language ${lang} != ${code}`);
    check(dir === (code === "ar" ? "rtl" : "ltr"), `${route}: direction`);
    check(h1 === 1, `${route}: H1 count ${h1}`);
    check(foundAlternates.size === 11, `${route}: alternate count ${foundAlternates.size}`);
    for (const [alternateCode, href] of alternates) check(foundAlternates.get(alternateCode) === href, `${route}: hreflang ${alternateCode}`);
    check(sitemap.includes(`<loc>${origin}${route}</loc>`), `${route}: sitemap`);
    check(html.includes('property="og:title"') && html.includes('name="twitter:title"'), `${route}: social metadata`);
    check(html.includes('id="site-analytics"') && html.includes('src="/analytics-consent.js"'), `${route}: consent UI`);
    if (pagePath === "/") check(html.includes("<h1>GirlfriendGPT</h1>"), `${route}: exact homepage keyword`);
    if (route.includes("/blog/girlfriendgpt-vs-")) {
      check(html.includes('class="locale-article-sources"') || code === "en", `${route}: cited sources`);
      check(!html.includes("DIRECT ANSWER"), `${route}: old module`);
    }
  }
}
for (const { slug } of localeList) {
  const info = infoCopy[slug], articles = comparisonCopy[slug], home = homeCopy[slug];
  check(Boolean(home) && home.comparisons.rows.length === 5 && home.method.steps.length === 4, `${slug}: home content`);
  check(Boolean(info) && Object.keys(info).length === 5, `${slug}: information pages`);
  check(Boolean(articles) && Object.keys(articles).length === 5, `${slug}: articles`);
  for (const key of comparisonKeys) {
    const article = articles?.[key];
    check(Boolean(article) && article.sections.length >= 4 && article.sections.every(([heading, paragraphs]) => heading && paragraphs.length > 0), `${slug}/${key}: article depth`);
  }
}
check(count === 120, `120 routes expected, got ${count}`);
check(!sitemap.includes("404"), "404 in sitemap");
if (failures.length) { console.error(`Locale audit failed (${failures.length}):\n- ${failures.join("\n- ")}`); process.exitCode = 1; }
else console.log(`Locale audit passed: ${count}/120 routes, reciprocal hreflang, sitemap, structured content, RTL and consent markup.`);
