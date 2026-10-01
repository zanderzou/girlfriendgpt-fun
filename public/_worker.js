// Only retired language paths invoke this Pages Function.
// English and Spanish continue to use static Pages assets.
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (/^\/(?:ja|ko|zh-hant|pt-br|ru|de|fr|ar)(?:\/|$)/i.test(pathname)) {
      return new Response(request.method === "HEAD" ? null : "This language edition has been removed. English: /  Spanish: /es/\n", {
        status: 410,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
