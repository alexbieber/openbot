/**
 * Browser skill v2 — full Playwright automation with aria-refs, CDP, remote Browserless
 */

let _browser = null;
let _context = null;
let _page = null;
let _refMap = new Map(); // aria-ref → element handle cache
let _refCounter = 0;
let _pw = null;

async function getPw() {
  if (_pw) return _pw;
  try { _pw = await import('playwright'); return _pw; }
  catch { throw new Error('Playwright not installed. Run: npm install playwright && npx playwright install chromium'); }
}

async function getBrowser(profile = 'default') {
  if (_browser?.isConnected()) return _browser;

  const pw = await getPw();

  // Remote Browserless or CDP endpoint
  const cdpUrl = process.env.BROWSERLESS_URL || process.env.CDP_URL;
  if (cdpUrl) {
    _browser = await pw.chromium.connectOverCDP(cdpUrl, {
      timeout: parseInt(process.env.REMOTE_CDP_TIMEOUT_MS || '30000'),
      headers: process.env.BROWSERLESS_TOKEN
        ? { 'Authorization': `Bearer ${process.env.BROWSERLESS_TOKEN}` }
        : {},
    });
    return _browser;
  }

  // Attach to running Chrome
  if (profile === 'chrome') {
    const port = process.env.CHROME_DEBUG_PORT || '9222';
    try {
      _browser = await pw.chromium.connectOverCDP(`http://localhost:${port}`);
      return _browser;
    } catch {
      throw new Error(`Cannot attach to Chrome. Start Chrome with: --remote-debugging-port=${port}`);
    }
  }

  // Launch managed Chromium
  _browser = await pw.chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: process.env.CHROMIUM_PATH,
  });
  return _browser;
}

async function getPage(profile = 'default') {
  const browser = await getBrowser(profile);

  if (!_context || _context.browser() !== browser) {
    _context = await browser.newContext({
      userAgent: process.env.BROWSER_USER_AGENT,
      viewport: { width: parseInt(process.env.BROWSER_WIDTH || '1280'), height: parseInt(process.env.BROWSER_HEIGHT || '800') },
      ignoreHTTPSErrors: process.env.BROWSER_IGNORE_HTTPS === 'true',
    });
    _page = await _context.newPage();
    _refCounter = 0;
    _refMap.clear();
  }

  if (!_page || _page.isClosed()) {
    _page = await _context.newPage();
    _refCounter = 0;
    _refMap.clear();
  }

  return _page;
}

// Build aria snapshot with ref IDs
async function buildAriaSnapshot(page, maxLength = 8000) {
  _refCounter = 0;
  _refMap.clear();

  const snapshot = await page.evaluate(() => {
    function serializeNode(el, depth = 0) {
      if (depth > 8) return '';
      const tag = el.tagName?.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return '';

      const role = el.getAttribute?.('role') || el.tagName?.toLowerCase();
      const name = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.getAttribute?.('placeholder') || el.getAttribute?.('alt') || '';
      const text = (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) ? el.firstChild.textContent?.trim() : '';
      const href = el.getAttribute?.('href') || '';
      const type = el.getAttribute?.('type') || '';

      const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
        el.getAttribute?.('onclick') || el.getAttribute?.('role') === 'button' || el.hasAttribute?.('tabindex');

      let line = '';
      if (isInteractive || name || text) {
        const display = name || text || href.slice(0, 50) || type;
        line = `${'  '.repeat(depth)}[${tag}${display ? ` "${display}"` : ''}]`;
        if (el.dataset) el.dataset._ariaRef = `__REF__`;
      }

      const children = Array.from(el.children || []).map(c => serializeNode(c, depth + 1)).filter(Boolean);
      return [line, ...children].filter(Boolean).join('\n');
    }
    return serializeNode(document.body);
  });

  // Assign ref IDs to interactive elements
  const elements = await page.$$('[data-_aria-ref="__REF__"]');
  const refLines = [];
  for (const el of elements.slice(0, 200)) {
    const id = ++_refCounter;
    await el.evaluate((node, refId) => { node.dataset._ariaRef = refId; }, id);
    _refMap.set(id, el);
    const info = await el.evaluate(n => ({
      tag: n.tagName.toLowerCase(),
      text: (n.textContent || '').trim().slice(0, 60),
      name: n.getAttribute('aria-label') || n.getAttribute('title') || n.getAttribute('placeholder') || '',
      href: n.getAttribute('href') || '',
      type: n.getAttribute('type') || '',
    }));
    refLines.push(`ref=${id}: <${info.tag}> ${info.name || info.text || info.href || info.type}`);
  }

  const title = await page.title();
  const url = page.url();

  let output = `Page: "${title}"\nURL: ${url}\n\n--- Interactive Elements ---\n${refLines.join('\n')}\n\n--- Content ---\n${snapshot}`;
  if (output.length > maxLength) output = output.slice(0, maxLength) + '\n...[truncated]';
  return output;
}

async function resolveRef(page, ref) {
  if (ref.startsWith('ref=')) {
    const id = parseInt(ref.slice(4));
    const cached = _refMap.get(id);
    if (cached) {
      try { await cached.isVisible(); return cached; } catch {}
    }
    // Re-query by data attribute
    return page.$(`[data-_aria-ref="${id}"]`);
  }
  // CSS selector fallback
  return page.$(ref);
}

export default {
  name: 'browser',

  async run({ tool, ...params }, { config }) {
    const profile = params.profile || config?.browser?.profile || 'default';

    switch (tool) {
      // ── navigate ────────────────────────────────────────────────────────────
      case 'browser_navigate': {
        const page = await getPage(profile);
        await page.goto(params.url, { waitUntil: params.waitUntil || 'load', timeout: 30000 });
        const title = await page.title();
        const snapshot = await buildAriaSnapshot(page, params.maxLength || 4000);
        return { ok: true, url: params.url, title, snapshot };
      }

      // ── snapshot ─────────────────────────────────────────────────────────────
      case 'browser_snapshot': {
        const page = await getPage(profile);
        const snapshot = await buildAriaSnapshot(page, params.maxLength || 8000);
        return { ok: true, snapshot };
      }

      // ── act ──────────────────────────────────────────────────────────────────
      case 'browser_act': {
        const page = await getPage(profile);
        const el = await resolveRef(page, params.ref);
        if (!el) return { ok: false, error: `Element not found: ${params.ref}` };

        switch (params.action) {
          case 'click': await el.click({ timeout: 10000 }); break;
          case 'type': await el.type(params.text || '', { delay: 30 }); break;
          case 'fill': await el.fill(params.text || ''); break;
          case 'clear': await el.fill(''); break;
          case 'hover': await el.hover(); break;
          case 'focus': await el.focus(); break;
          case 'check': await el.check(); break;
          case 'select': await el.selectOption(params.text || ''); break;
          case 'scroll': await el.scrollIntoViewIfNeeded(); break;
          case 'press': await el.press(params.key || 'Enter'); break;
          default: return { ok: false, error: `Unknown action: ${params.action}` };
        }

        // Wait briefly for page to settle
        await page.waitForTimeout(300).catch(() => {});
        const snapshot = await buildAriaSnapshot(page, 4000);
        return { ok: true, action: params.action, ref: params.ref, snapshot };
      }

      // ── extract ──────────────────────────────────────────────────────────────
      case 'browser_extract': {
        const page = await getPage(profile);
        const sel = params.selector || 'body';

        switch (params.format || 'text') {
          case 'text': {
            const text = await page.locator(sel).first().innerText().catch(() => '');
            return { ok: true, text: text.slice(0, 10000) };
          }
          case 'html': {
            const html = await page.locator(sel).first().innerHTML().catch(() => '');
            return { ok: true, html: html.slice(0, 10000) };
          }
          case 'links': {
            const links = await page.$$eval('a[href]', els => els.map(a => ({ text: a.textContent?.trim(), href: a.href })).filter(l => l.href));
            return { ok: true, links: links.slice(0, 100) };
          }
          case 'table': {
            const tables = await page.$$eval('table', tbls => tbls.map(t => {
              const rows = Array.from(t.rows).map(r => Array.from(r.cells).map(c => c.textContent?.trim()));
              return rows;
            }));
            return { ok: true, tables };
          }
          case 'markdown': {
            const html = await page.locator(sel).first().innerHTML().catch(() => '');
            const md = html
              .replace(/<h([1-6])>(.*?)<\/h\1>/gi, (_, l, t) => `${'#'.repeat(l)} ${t}\n`)
              .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
              .replace(/<em>(.*?)<\/em>/gi, '*$1*')
              .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
              .replace(/<[^>]+>/g, '')
              .replace(/\n{3,}/g, '\n\n').trim();
            return { ok: true, markdown: md.slice(0, 10000) };
          }
        }
        break;
      }

      // ── tabs ─────────────────────────────────────────────────────────────────
      case 'browser_tabs': {
        const browser = await getBrowser(profile);
        const pages = _context ? _context.pages() : [];

        switch (params.action) {
          case 'list':
            return { ok: true, tabs: await Promise.all(pages.map(async (p, i) => ({ id: i, url: p.url(), title: await p.title() }))) };
          case 'new': {
            const newPage = await _context.newPage();
            if (params.url) await newPage.goto(params.url);
            _page = newPage;
            return { ok: true, tabId: pages.length, url: newPage.url() };
          }
          case 'switch': {
            const tab = pages[params.tabId];
            if (!tab) return { ok: false, error: `Tab ${params.tabId} not found` };
            _page = tab;
            await tab.bringToFront().catch(() => {});
            return { ok: true, tabId: params.tabId, url: tab.url() };
          }
          case 'close': {
            const tab = pages[params.tabId];
            if (tab) { await tab.close(); if (_page === tab) _page = pages[0]; }
            return { ok: true };
          }
          case 'screenshot': {
            const p = _page || pages[0];
            if (!p) return { ok: false, error: 'No tab open' };
            const buf = await p.screenshot({ type: 'png' });
            return { ok: true, base64: buf.toString('base64'), format: 'png' };
          }
        }
        break;
      }

      // ── wait ─────────────────────────────────────────────────────────────────
      case 'browser_wait': {
        const page = await getPage(profile);
        const timeout = params.timeout || 10000;
        switch (params.for) {
          case 'selector': await page.waitForSelector(params.value, { timeout }); break;
          case 'url': await page.waitForURL(params.value, { timeout }); break;
          case 'text': await page.waitForFunction(t => document.body.innerText?.includes(t), params.value, { timeout }); break;
          case 'time': await page.waitForTimeout(parseInt(params.value)); break;
          case 'network': await page.waitForLoadState('networkidle', { timeout }); break;
        }
        return { ok: true, for: params.for, value: params.value };
      }

      // ── script ───────────────────────────────────────────────────────────────
      case 'browser_script': {
        const page = await getPage(profile);
        const result = await page.evaluate(new Function(params.code)); // safe context
        return { ok: true, result };
      }

      // ── upload ───────────────────────────────────────────────────────────────
      case 'browser_upload': {
        const page = await getPage(profile);
        const input = await page.$(params.selector);
        if (!input) return { ok: false, error: `Input not found: ${params.selector}` };
        await input.setInputFiles(params.filePath);
        return { ok: true };
      }

      // ── pdf ──────────────────────────────────────────────────────────────────
      case 'browser_pdf': {
        const page = await getPage(profile);
        await page.pdf({ path: params.outputPath, format: params.format || 'A4' });
        return { ok: true, savedTo: params.outputPath };
      }

      default:
        return { ok: false, error: `Unknown browser tool: ${tool}. Use: browser_navigate, browser_snapshot, browser_act, browser_extract, browser_tabs, browser_wait, browser_script, browser_upload, browser_pdf` };
    }
  },

  async cleanup() {
    await _browser?.close?.();
    _browser = null; _context = null; _page = null; _refMap.clear();
  },
};
