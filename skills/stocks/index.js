/**
 * Stocks Skill
 * Yahoo Finance via public API — no key needed.
 */
import axios from 'axios';

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YF_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; OpenBot/1.0)' };

async function getQuote(symbol) {
  const res = await axios.get(`${YF_BASE}/${symbol}`, {
    headers: HEADERS,
    params: { interval: '1d', range: '5d' },
    timeout: 8000,
  });
  const meta = res.data.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No data for ${symbol}`);
  return meta;
}

function pct(a, b) { return b ? (((a - b) / b) * 100).toFixed(2) : '?'; }

export default async function execute({ action, symbols, query }) {
  switch (action) {
    case 'price': {
      if (!symbols) throw new Error('symbols required (e.g. "AAPL,TSLA")');
      const tickers = symbols.split(',').map(s => s.trim().toUpperCase());
      const results = await Promise.allSettled(tickers.map(getQuote));
      const lines = results.map((r, i) => {
        if (r.status === 'rejected') return `${tickers[i]}: Error — ${r.reason.message}`;
        const m = r.value;
        const change = pct(m.regularMarketPrice, m.chartPreviousClose);
        const arrow = m.regularMarketPrice >= m.chartPreviousClose ? '▲' : '▼';
        return `${m.symbol}: $${m.regularMarketPrice?.toFixed(2)} ${arrow}${change}% | Open: $${m.regularMarketOpen?.toFixed(2)} | Vol: ${(m.regularMarketVolume / 1e6).toFixed(1)}M`;
      });
      return lines.join('\n');
    }

    case 'info': {
      if (!symbols) throw new Error('symbols required');
      const symbol = symbols.split(',')[0].trim().toUpperCase();
      const meta = await getQuote(symbol);
      return `${meta.symbol} — ${meta.shortName || ''}
Exchange: ${meta.exchangeName} | Currency: ${meta.currency}
Price: $${meta.regularMarketPrice?.toFixed(2)}
Previous Close: $${meta.chartPreviousClose?.toFixed(2)}
Change: ${pct(meta.regularMarketPrice, meta.chartPreviousClose)}%
52w High: $${meta.fiftyTwoWeekHigh?.toFixed(2)}
52w Low: $${meta.fiftyTwoWeekLow?.toFixed(2)}
Volume: ${(meta.regularMarketVolume / 1e6).toFixed(1)}M`;
    }

    case 'search': {
      if (!query) throw new Error('query required');
      const res = await axios.get(YF_SEARCH, {
        headers: HEADERS,
        params: { q: query, quotesCount: 6, newsCount: 0 },
        timeout: 8000,
      });
      const quotes = res.data.quotes || [];
      if (!quotes.length) return `No stocks found for "${query}"`;
      return `Search results for "${query}":\n` + quotes.map(q =>
        `  ${q.symbol} — ${q.shortname || q.longname || ''} (${q.exchange})`
      ).join('\n');
    }

    default: throw new Error(`Unknown action: ${action}`);
  }
}
