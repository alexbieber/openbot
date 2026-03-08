/**
 * News Skill
 * NewsAPI with RSS fallback.
 */
import axios from 'axios';

export default async function execute({ query, category, country = 'us', count = 5 }, context = {}) {
  const apiKey = process.env.NEWS_API_KEY || context.config?.skills?.newsApiKey;
  count = Math.min(count, 10);

  if (apiKey) return newsApi(query, category, country, count, apiKey);
  return rssFallback(query);
}

async function newsApi(query, category, country, count, apiKey) {
  const base = 'https://newsapi.org/v2';
  let res;

  if (query) {
    res = await axios.get(`${base}/everything`, {
      params: { q: query, pageSize: count, sortBy: 'publishedAt', language: 'en', apiKey },
      timeout: 8000,
    });
  } else {
    res = await axios.get(`${base}/top-headlines`, {
      params: { country, category, pageSize: count, apiKey },
      timeout: 8000,
    });
  }

  const articles = res.data.articles || [];
  if (!articles.length) return `No news found${query ? ` for "${query}"` : ''}.`;

  const lines = articles.slice(0, count).map((a, i) =>
    `${i + 1}. **${a.title}**\n   ${a.source.name} — ${new Date(a.publishedAt).toLocaleDateString()}\n   ${a.description || ''}\n   ${a.url}`
  );

  return `${query ? `News about "${query}"` : `Top ${category || 'general'} news`}:\n\n${lines.join('\n\n')}`;
}

async function rssFallback(query) {
  const feed = query
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en`
    : 'https://news.google.com/rss?hl=en';

  const res = await axios.get(feed, { timeout: 8000 });
  const items = [...res.data.matchAll(/<title>(.*?)<\/title>/g)]
    .slice(2, 7)
    .map((m, i) => `${i + 1}. ${m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()}`);

  return items.length ? `Latest news:\n${items.join('\n')}` : 'Could not fetch news.';
}
