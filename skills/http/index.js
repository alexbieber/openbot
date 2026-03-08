export default {
  name: 'http',
  async run({ method = 'GET', url, headers = {}, body, timeout = 10000 }) {
    if (!url) return { ok: false, error: 'url is required' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const opts = {
        method,
        headers: { 'User-Agent': 'OpenBot/1.0', ...headers },
        signal: controller.signal,
      };
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        opts.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(url, opts);
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: parsed,
        size: text.length,
      };
    } catch (err) {
      return { ok: false, error: err.name === 'AbortError' ? `Timeout after ${timeout}ms` : err.message };
    } finally {
      clearTimeout(timer);
    }
  },
};
