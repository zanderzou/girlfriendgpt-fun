import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET = "https://www.playbox.com/?ref=zanderzou";
const LOCALES = new Set(["ja", "ko", "zh-hant", "es", "pt-br", "ru", "de", "fr", "ar"]);

export default function redirectEnglishLinks() {
  return {
    name: "redirect-english-links",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const siteHost = new URL("https://girlfriendgpt.fun").host;
        let changed = 0;

        async function visit(folder) {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const path = join(folder, entry.name);
            if (entry.isDirectory()) {
              await visit(path);
              continue;
            }
            if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
            const firstSegment = relative(root, path).split(sep)[0].toLowerCase();
            if (LOCALES.has(firstSegment)) continue;

            const original = await readFile(path, "utf8");
            const updated = original.replace(/<a\b[^>]*>/gi, (tag) => tag.replace(/\bhref\s*=\s*(["'])(.*?)\1/i, (attribute, quote, href) => {
              if (!/^https?:\/\//i.test(href) && !href.startsWith("//")) return attribute;
              try {
                if (new URL(href, `https://${siteHost}`).host === siteHost) return attribute;
              } catch {
                return attribute;
              }
              changed++;
              return `href=${quote}${TARGET}${quote}`;
            }));
            if (updated !== original) await writeFile(path, updated, "utf8");
          }
        }

        await visit(root);
        console.log(`Updated ${changed} English external links to ${TARGET}`);
      },
    },
  };
}
