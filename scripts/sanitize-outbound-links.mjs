import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file is copied to each site's scripts/ directory. It operates only on
// the generated public artifact; editorial source URLs remain private evidence.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = JSON.parse(await readFile(path.join(root, 'outbound-links.json'), 'utf8'));
const site = new URL(settings.site);
const allowed = new Set(settings.promotionUrls);
const exists = async file => access(file).then(() => true, () => false);
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&#38;', '&');
const ownHost = hostname => hostname.replace(/^www\./i, '') === site.hostname.replace(/^www\./i, '');
const outside = value => {
  try {
    const url = new URL(decode(value), site);
    return ['http:', 'https:'].includes(url.protocol) && !ownHost(url.hostname);
  } catch { return false; }
};
const keep = value => !outside(value) || allowed.has(decode(value));

function sanitizeJsonLd(markup) {
  return markup.replace(/<script\b([^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, raw) => {
    let value;
    try { value = JSON.parse(raw); } catch { return whole; }
    let changed = false;
    const visit = node => {
      if (Array.isArray(node)) return node.map(visit);
      if (!node || typeof node !== 'object') return node;
      for (const key of ['citation', 'sameAs', 'isBasedOn', 'significantLink', 'relatedLink']) {
        if (!(key in node)) continue;
        const original = node[key];
        if (Array.isArray(original)) {
          const filtered = original.filter(item => typeof item !== 'string' || keep(item));
          if (filtered.length !== original.length) changed = true;
          if (filtered.length) node[key] = filtered;
          else delete node[key];
        } else if (typeof original === 'string' && !keep(original)) { delete node[key]; changed = true; }
      }
      for (const child of Object.values(node)) visit(child);
      return node;
    };
    visit(value);
    return changed ? `<script${attrs}>${JSON.stringify(value)}</script>` : whole;
  });
}

function sanitizeHtml(markup, totals) {
  let result = markup.replace(/<a\b[^>]*>/gi, tag => {
    const match = tag.match(/\s+href\s*=\s*(["'])(.*?)\1/i);
    if (!match || keep(match[2])) return tag;
    totals.removed++;
    return tag.replace(match[0], '');
  });
  result = sanitizeJsonLd(result);
  return result;
}

function sanitizeText(markup, totals) {
  // Feed bodies sometimes contain literal HTML, and some llms files use
  // Markdown links. Keep labels and other copy byte-for-byte where possible.
  let result = sanitizeHtml(markup, totals);
  result = result.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label, url) => {
    if (keep(url)) return whole;
    totals.removed++;
    return label;
  });
  return result;
}

async function files(dir, prefix = '') {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) output.push(...await files(path.join(dir, entry.name), relative + '/'));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

const out = await exists(path.join(root, 'dist/client/index.html')) ? path.join(root, 'dist/client') : path.join(root, 'dist');
if (!await exists(path.join(out, 'index.html'))) throw Error(`Missing public artifact: ${out}`);
const totals = { removed: 0, changed: 0, html: 0 };
for (const relative of await files(out)) {
  if (!/\.(?:html|xml|txt|json)$/.test(relative)) continue;
  if (relative === '_routes.json' || relative === 'BingSiteAuth.xml') continue;
  const file = path.join(out, relative);
  const before = await readFile(file, 'utf8');
  const after = relative.endsWith('.html') ? sanitizeHtml(before, totals) : sanitizeText(before, totals);
  if (relative.endsWith('.html')) totals.html++;
  if (after !== before) { await writeFile(file, after); totals.changed++; }
}
console.log(`Outbound source links removed: ${totals.removed} across ${totals.changed} files (${totals.html} HTML pages checked)`);
