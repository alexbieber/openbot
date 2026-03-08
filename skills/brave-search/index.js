import axios from 'axios';

export const skill = {
  name: 'brave-search',
  description: 'Search the web using Brave Search API',
  async execute({ query, count = 5, freshness, country }) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      // Fallback: try a basic DuckDuckGo instant answer
      try {
        const res = await axios.get('https://api.duckduckgo.com/', {
          params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
          timeout: 8000,
        });
        const d = res.data;
        const results = [];
        if (d.AbstractText) results.push({ title: d.Heading, description: d.AbstractText, url: d.AbstractURL });
        (d.RelatedTopics || []).slice(0, count - 1).forEach(t => {
          if (t.Text) results.push({ title: t.Text.split(' - ')[0], description: t.Text, url: t.FirstURL });
        });
        return { results, source: 'duckduckgo-fallback', query };
      } catch {
        return { error: 'No BRAVE_SEARCH_API_KEY set and DuckDuckGo fallback failed', results: [] };
      }
    }

    try {
      const params = { q: query, count: Math.min(count, 20) };
      if (freshness) params.freshness = freshness;
      if (country) params.country = country;

      const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params,
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        timeout: 10000,
      });

      const web = res.data?.web?.results || [];
      const results = web.map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
        age: r.age,
        language: r.language,
      }));

      return { results, total: res.data?.web?.totalResults, query };
    } catch (err) {
      return { error: err.message, results: [] };
    }
  },
};

export default skill;
