import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir, copyFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { makeEditorialWorker } from './editorial-release-runtime.mjs';

const root = path.resolve(import.meta.dirname, '..');
const schedule = JSON.parse(await readFile(path.join(root, 'src/data/editorialSchedule.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const content = path.join(root, 'src/content/blog');
const drafts = path.join(root, 'src/editorial-drafts');
const exists = async f => { try { await access(f); return true; } catch { return false; } };
const hash = b => createHash('sha256').update(b).digest('hex');
const walk = async (dir, prefix = '') => {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === '.astro') continue;
    if (item.isDirectory()) result.push(...await walk(path.join(dir, item.name), prefix + item.name + '/'));
    else result.push(prefix + item.name);
  }
  return result;
};
const runScript = name => new Promise((resolve, reject) => {
  const bin = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/c', 'npm.cmd', 'run', name] : ['run', name];
  const child = spawn(bin, args, { cwd: root, windowsHide: true, stdio: 'inherit', env: {...process.env, ASTRO_TELEMETRY_DISABLED: '1'} });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(name + ' failed (' + code + ')')));
});
const types = {'.html': 'text/html; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8'};
const routeFor = file => file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + file.slice(0, -10) : '/' + file;
const baselineOnly = schedule.articles.filter(s => s.order === 1 && s.approved);
assert.equal(baselineOnly.length, 1, 'An accepted first article is required');
const approved = schedule.articles.filter(s => s.approved).sort((a, b) => a.order - b.order);
assert.deepEqual(approved.map(s => s.order), approved.map((_, i) => i + 1), 'Release approvals must be sequential');
for (const item of approved) {
  assert.match(item.slug, /^[a-z0-9-]+$/);
  assert.ok(Number.isFinite(Date.parse(item.releaseAt)));
  const raw = await readFile(path.join(drafts, item.slug + '.md'));
  assert.equal(hash(raw), item.reviewedSha256, 'Article changed after editorial review: ' + item.slug);
}
const originalPresent = new Map();
for (const item of schedule.articles) {
  const dest = path.join(content, item.slug + '.md');
  if (await exists(dest)) originalPresent.set(item.slug, await readFile(dest));
}
const manifestPath = path.join(root, 'artifacts/editorial-build.json');
const versions = {};
let out, baseFiles, originalWorker = '', baseRoutes = {version: 1, include: [], exclude: []};
let securityHeaders = {};
const snapshots = [];
async function setPhase(phase) {
  for (const item of schedule.articles) {
    const dest = path.join(content, item.slug + '.md');
    if (item.approved && item.order <= phase) await copyFile(path.join(drafts, item.slug + '.md'), dest);
    else if (await exists(dest)) {
      if (originalPresent.has(item.slug) && item.order !== 1) assert.equal(hash(originalPresent.get(item.slug)), item.reviewedSha256, 'Unexpected public future source; stop instead of deleting it');
      await unlink(dest);
    }
  }
}
async function buildPhase(phase) {
  await setPhase(phase);
  if (pkg.scripts.prebuild) await runScript('prebuild');
  await runScript('build:static');
  out = await exists(path.join(root, 'dist/client/index.html')) ? path.join(root, 'dist/client') : path.join(root, 'dist');
  const files = (await walk(out)).filter(f => !f.startsWith('private-') && !f.startsWith('_editorial'));
  const records = {};
  for (const file of files) records[file] = await readFile(path.join(out, file));
  const paths = [];
  if (phase === 1) {
    baseFiles = records;
    if (records['_worker.js']) originalWorker = records['_worker.js'].toString('utf8');
    if (records['_routes.json']) baseRoutes = JSON.parse(records['_routes.json']);
    const headers = records['_headers']?.toString('utf8') ?? '';
    const global = headers.split(/^\/\*\s*$/m).at(-1);
    for (const line of global.split(/\r?\n/)) { const m = line.match(/^\s+([^:]+):\s*(.+)$/); if (m) securityHeaders[m[1]] = m[2]; }
  } else {
    const mapped = {};
    for (const [file, bytes] of Object.entries(records)) {
      if (baseFiles[file]?.equals(bytes)) continue;
      const route = routeFor(file);
      if (/^\/(?:ja|ko|zh-hant|es|pt-br|ru|de|fr|ar)(?:\/|$)/i.test(route)) {
        assert.ok(baseFiles[file], 'A new translated page was produced: ' + route);
        throw Error('Existing translated page changed while adding English-only articles: ' + route);
      }
      if (!types[path.extname(file)]) {
        assert.ok(baseFiles[file]?.equals(bytes), 'Unexpected changed binary or generated asset: ' + file);
        continue;
      }
      mapped[route] = {body: bytes.toString('utf8'), type: types[path.extname(file)], status: file === '404.html' ? 404 : 200}; paths.push(route);
    }
    versions[String(phase)] = mapped;
  }
  snapshots.push({phase, htmlPages: files.filter(f => f.endsWith('.html')).length, changedPaths: paths});
}
try {
  await buildPhase(1);
  for (const item of approved.filter(s => s.order > 1)) await buildPhase(item.order);
} finally {
  await setPhase(1);
  if (pkg.scripts.prebuild) await runScript('prebuild');
  await runScript('build:static');
}
if (Object.keys(versions).length) {
  const worker = makeEditorialWorker({schedule: schedule.articles, versions, originalWorker, securityHeaders});
  assert.ok(Buffer.byteLength(worker) < 2_500_000, 'Editorial worker is too large for the Free plan');
  await writeFile(path.join(out, '_worker.js'), worker);
  const include = [...new Set([...baseRoutes.include, '/blog', '/blog/*', '/', '/index.html', '/sitemap*', '/rss.xml', '/llms.txt', '/llms-full.txt', ...Object.values(versions).flatMap(v => Object.keys(v))])];
  // English HTML changes include footer links; the other language editions remain static.
  const compact = include.filter(p => !p.startsWith('/blog/') || p === '/blog/*');
  const routes = {version: 1, include: compact, exclude: baseRoutes.exclude.filter(p => p !== '/*' && p !== '/blog/*' && !compact.includes(p))};
  assert.ok(routes.include.length + routes.exclude.length <= 100);
  await writeFile(path.join(out, '_routes.json'), JSON.stringify(routes, null, 2) + '\n');
}
await mkdir(path.dirname(manifestPath), {recursive: true});
await writeFile(manifestPath, JSON.stringify({builtAt: new Date().toISOString(), domain: schedule.domain, out: path.relative(root, out), scheduled: approved.length - 1, snapshots, workerBytes: await exists(path.join(out, '_worker.js')) ? (await readFile(path.join(out, '_worker.js'))).length : 0}, null, 2) + '\n');
console.log('Editorial cumulative builds accepted: ' + schedule.domain + '; ' + approved.length + ' reviewed English articles');
