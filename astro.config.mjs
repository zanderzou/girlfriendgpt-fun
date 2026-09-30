import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import redirectEnglishLinks from "./scripts/redirect-english-links.mjs";

export default defineConfig({
  site: "https://girlfriendgpt.fun",
  output: "static",
  outDir: "./dist/client",
  trailingSlash: "always",
  integrations: [sitemap(), redirectEnglishLinks()],
  build: { format: "directory" },
});
