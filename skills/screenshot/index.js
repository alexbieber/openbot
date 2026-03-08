export default {
  name: 'screenshot',
  async run({ url, width = 1280, height = 800, fullPage = false, outputPath, waitMs = 500 }) {
    if (!url) return { ok: false, error: 'url required' };

    // Try puppeteer first, then playwright
    let browser;
    try {
      const puppeteer = await import('puppeteer').catch(() => null);
      if (puppeteer) {
        browser = await puppeteer.default.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
        const opts = { fullPage };
        if (outputPath) { await page.screenshot({ ...opts, path: outputPath }); return { ok: true, savedTo: outputPath, url }; }
        const buf = await page.screenshot({ ...opts, type: 'png' });
        return { ok: true, base64: buf.toString('base64'), width, height, url, format: 'png' };
      }
    } catch (e) {
      if (!e.code?.includes('MODULE_NOT_FOUND')) return { ok: false, error: e.message };
    } finally {
      await browser?.close?.();
    }

    // Try playwright
    try {
      const playwright = await import('playwright').catch(() => null);
      if (playwright) {
        const pw = playwright.default || playwright;
        const br = await pw.chromium.launch();
        const context = await br.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        if (waitMs > 0) await page.waitForTimeout(waitMs);
        const opts = { fullPage };
        if (outputPath) { await page.screenshot({ ...opts, path: outputPath }); await br.close(); return { ok: true, savedTo: outputPath, url }; }
        const buf = await page.screenshot({ ...opts, type: 'png' });
        await br.close();
        return { ok: true, base64: buf.toString('base64'), width, height, url, format: 'png' };
      }
    } catch (e) {
      if (!e.code?.includes('MODULE_NOT_FOUND')) return { ok: false, error: e.message };
    }

    return { ok: false, error: 'Screenshot requires puppeteer or playwright. Install: npm install puppeteer' };
  },
};
