/**
 * Web Search Skill
 * Searches the web via Brave Search API (free tier available).
 * Falls back to DuckDuckGo Instant Answers if no API key configured.
 */

export default async function execute({ query, count = 5, freshness }, context = {}) {
  if (!query) throw new Error('query is required');

  const apiKey = process.env.BRAVE_SEARCH_API_KEY || context.config?.skills?.braveSearchApiKey;

  if (apiKey) {
    return searchBrave(query, count, freshness, apiKey);
  }

  // Fallback: DuckDuckGo Instant Answers (no API key needed, limited)
  return searchDuckDuckGo(query);
}

async function searchBrave(query, count, freshness, apiKey) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 10)),
    ...(freshness && { freshness }),
  });

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Brave Search API error: ${res.status}`);

  const data = await res.json();
  const results = data.web?.results || [];

  if (!results.length) return `No results found for: "${query}"`;

  const lines = results.map((r, i) =>
    `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ''}`
  );

  return `Search results for "${query}":\n\n${lines.join('\n\n')}`;
}

async function searchDuckDuckGo(query) {
  const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, {
    signal: AbortSignal.timeout(8000),
  });

  const data = await res.json();

  const results = [];
  if (data.AbstractText) results.push(`**Summary**: ${data.AbstractText}\nSource: ${data.AbstractURL}`);
  if (data.RelatedTopics) {
    data.RelatedTopics.slice(0, 4).forEach((t, i) => {
      if (t.Text) results.push(`${i + 1}. ${t.Text}\n   ${t.FirstURL || ''}`);
    });
  }

  if (!results.length) return `No instant results for "${query}". Consider adding a Brave Search API key for full web search.`;

  return `Results for "${query}" (DuckDuckGo Instant):\n\n${results.join('\n\n')}\n\n_Note: Set BRAVE_SEARCH_API_KEY for full web search._`;
}
