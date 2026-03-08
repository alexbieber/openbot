import axios from 'axios';

export const skill = {
  name: 'firecrawl',
  description: 'Deep website scraping to clean markdown',
  async execute({ url, mode = 'scrape', maxPages = 5, schema }) {
    const apiKey = process.env.FIRECRAWL_API_KEY;

    if (!apiKey) {
      // Fallback: basic fetch + strip HTML
      return await this._basicFetch(url);
    }

    try {
      if (mode === 'scrape') {
        const res = await axios.post('https://api.firecrawl.dev/v1/scrape',
          { url, formats: ['markdown'] },
          { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        return { markdown: res.data?.data?.markdown, metadata: res.data?.data?.metadata, url };

      } else if (mode === 'crawl') {
        const start = await axios.post('https://api.firecrawl.dev/v1/crawl',
          { url, limit: maxPages, scrapeOptions: { formats: ['markdown'] } },
          { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        const jobId = start.data?.id;
        if (!jobId) return { error: 'No job ID returned' };

        // Poll for completion
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const status = await axios.get(`https://api.firecrawl.dev/v1/crawl/${jobId}`,
            { headers: { 'Authorization': `Bearer ${apiKey}` } }
          );
          if (status.data?.status === 'completed') {
            const pages = (status.data?.data || []).map(p => ({ url: p.metadata?.sourceURL, markdown: p.markdown }));
            return { pages, total: pages.length, url };
          }
        }
        return { error: 'Crawl timed out', url };

      } else if (mode === 'extract') {
        const res = await axios.post('https://api.firecrawl.dev/v1/extract',
          { urls: [url], schema },
          { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        return { data: res.data?.data, url };
      }
    } catch (err) {
      return { error: err.message, url };
    }
  },

  async _basicFetch(url) {
    try {
      const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'OpenBot/1.0' } });
      const html = res.data;
      // Basic HTML to text
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50000);
      return { markdown: text, url, source: 'basic-fetch' };
    } catch (err) {
      return { error: err.message, url };
    }
  },
};

export default skill;
