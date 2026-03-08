import { resolve, resolve4, resolve6, resolveMx, resolveTxt, resolveNs, resolveCname, resolveSoa, resolvePtr } from 'dns/promises';

export default {
  name: 'dns',
  async run({ domain, type = 'A' }) {
    if (!domain) return { ok: false, error: 'domain required' };

    async function lookup(t) {
      try {
        switch (t.toUpperCase()) {
          case 'A': return { type: 'A', records: await resolve4(domain) };
          case 'AAAA': return { type: 'AAAA', records: await resolve6(domain) };
          case 'MX': return { type: 'MX', records: await resolveMx(domain) };
          case 'TXT': return { type: 'TXT', records: await resolveTxt(domain) };
          case 'NS': return { type: 'NS', records: await resolveNs(domain) };
          case 'CNAME': return { type: 'CNAME', records: await resolveCname(domain) };
          case 'SOA': return { type: 'SOA', records: await resolveSoa(domain) };
          case 'PTR': return { type: 'PTR', records: await resolvePtr(domain) };
          default: return { type: t, error: `Unsupported type: ${t}` };
        }
      } catch (err) {
        return { type: t, error: err.message };
      }
    }

    if (type.toLowerCase() === 'all') {
      const types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SOA'];
      const results = await Promise.all(types.map(lookup));
      return { ok: true, domain, records: results.filter(r => !r.error) };
    }

    const result = await lookup(type);
    return { ok: !result.error, domain, ...result };
  },
};
