export function selectRelease(schedule, now) {
  return schedule.filter(s => s.approved && Date.parse(s.releaseAt) <= now).sort((a, b) => a.order - b.order).at(-1)?.order ?? 0;
}

export function makeEditorialWorker({ schedule, versions, originalWorker = '', securityHeaders = {} }) {
  const baseline = originalWorker ? originalWorker.replace(/export\s+default\s*/, 'const baselineWorker = ') : 'const baselineWorker = { fetch(request, env) { return env.ASSETS.fetch(request); } };';
  return `${baseline}\n
const schedule = ${JSON.stringify(schedule)};
const versions = ${JSON.stringify(versions)};
const securityHeaders = ${JSON.stringify(securityHeaders)};
const futurePaths = new Set(schedule.map(s => '/blog/' + s.slug + '/'));
function normalizePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\\\\') || decoded.includes('\\0')) return null;
  if (decoded.endsWith('/index.html')) decoded = decoded.slice(0, -10);
  if (decoded === '/index.html') decoded = '/';
  if (decoded.startsWith('/blog/') && !decoded.endsWith('/') && !/\\.[^/]+$/.test(decoded)) decoded += '/';
  return decoded;
}
function missing(request) { return new Response(request.method === 'HEAD' ? null : 'Not found\\n', {status: 404, headers: {...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}}); }
export default {
  async fetch(request, env, ctx) {
    if (!['GET', 'HEAD'].includes(request.method)) return baselineWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);
    if (pathname === null) return missing(request);
    const now = Date.now();
    const phase = schedule.filter(s => s.approved && Date.parse(s.releaseAt) <= now).sort((a, b) => a.order - b.order).at(-1)?.order ?? 0;
    const entry = versions[String(phase)]?.[pathname];
    if (entry) {
      const response = new Response(request.method === 'HEAD' ? null : entry.body, {status: entry.status ?? 200, headers: {...securityHeaders, 'Content-Type': entry.type, 'Cache-Control': 'no-store', 'X-Editorial-Release': String(phase)}});
      return response;
    }
    if (futurePaths.has(pathname)) {
      const item = schedule.find(s => '/blog/' + s.slug + '/' === pathname);
      if (!item.approved || Date.parse(item.releaseAt) > now) return missing(request);
    }
    const response = await baselineWorker.fetch(request, env, ctx);
    if (Object.values(versions).some(v => Object.hasOwn(v, pathname))) {
      const result = new Response(response.body, response);
      result.headers.set('Cache-Control', 'no-store');
      return result;
    }
    return response;
  }
};\n`;
}
