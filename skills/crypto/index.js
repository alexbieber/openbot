/**
 * Crypto Skill
 * CoinGecko API — free, no key needed.
 */
import axios from 'axios';

const BASE = 'https://api.coingecko.com/api/v3';
const HEADERS = { 'User-Agent': 'OpenBot/1.0' };

const SYMBOL_MAP = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', ada: 'cardano',
  doge: 'dogecoin', bnb: 'binancecoin', xrp: 'ripple', dot: 'polkadot',
  avax: 'avalanche-2', matic: 'matic-network', link: 'chainlink',
  ltc: 'litecoin', uni: 'uniswap', atom: 'cosmos', algo: 'algorand',
};

function resolveId(coin) {
  const lower = coin.toLowerCase().trim();
  return SYMBOL_MAP[lower] || lower;
}

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(6)}`;
}

export default async function execute({ action, coins, count = 10, currency = 'usd' }) {
  switch (action) {
    case 'price': {
      if (!coins) throw new Error('coins required (e.g. "BTC,ETH")');
      const ids = coins.split(',').map(c => resolveId(c)).join(',');
      const res = await axios.get(`${BASE}/simple/price`, {
        headers: HEADERS,
        params: { ids, vs_currencies: currency, include_24hr_change: true, include_market_cap: true },
        timeout: 8000,
      });
      const lines = Object.entries(res.data).map(([id, data]) =>
        `${id.toUpperCase()}: ${fmt(data[currency])} (24h: ${data[`${currency}_24h_change`]?.toFixed(2) ?? '?'}%) | MCap: ${fmt(data[`${currency}_market_cap`])}`
      );
      return lines.length ? lines.join('\n') : 'No data found for specified coins';
    }

    case 'top': {
      const res = await axios.get(`${BASE}/coins/markets`, {
        headers: HEADERS,
        params: { vs_currency: currency, order: 'market_cap_desc', per_page: Math.min(count, 25), page: 1 },
        timeout: 8000,
      });
      return `Top ${res.data.length} Cryptocurrencies:\n\n` + res.data.map((c, i) =>
        `${i + 1}. ${c.name} (${c.symbol.toUpperCase()}): ${fmt(c.current_price)} | 24h: ${c.price_change_percentage_24h?.toFixed(2) ?? '?'}% | MCap: ${fmt(c.market_cap)}`
      ).join('\n');
    }

    case 'info': {
      if (!coins) throw new Error('coins required');
      const id = resolveId(coins.split(',')[0]);
      const res = await axios.get(`${BASE}/coins/${id}`, {
        headers: HEADERS,
        params: { localization: false, tickers: false, community_data: false },
        timeout: 8000,
      });
      const d = res.data;
      const price = d.market_data?.current_price?.[currency];
      return `${d.name} (${d.symbol.toUpperCase()})
Price: ${fmt(price)}
24h Change: ${d.market_data?.price_change_percentage_24h?.toFixed(2)}%
7d Change: ${d.market_data?.price_change_percentage_7d?.toFixed(2)}%
Market Cap: ${fmt(d.market_data?.market_cap?.[currency])}
24h Volume: ${fmt(d.market_data?.total_volume?.[currency])}
ATH: ${fmt(d.market_data?.ath?.[currency])}
Rank: #${d.market_cap_rank}
Description: ${d.description?.en?.substring(0, 200) || 'N/A'}`;
    }

    case 'search': {
      if (!coins) throw new Error('coins required');
      const res = await axios.get(`${BASE}/search`, {
        headers: HEADERS,
        params: { query: coins },
        timeout: 8000,
      });
      const results = res.data.coins?.slice(0, 5) || [];
      if (!results.length) return `No coins found for "${coins}"`;
      return `Search results for "${coins}":\n` + results.map(c =>
        `  ${c.symbol.toUpperCase()} — ${c.name} (rank: #${c.market_cap_rank || '?'})`
      ).join('\n');
    }

    default: throw new Error(`Unknown action: ${action}`);
  }
}
