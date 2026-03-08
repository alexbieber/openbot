import { lookup as dnsLookup } from 'dns/promises';

export default {
  name: 'ip-lookup',
  async run({ target = 'me', type = 'all' }) {
    let ip = target;

    if (target === 'me') {
      const res = await fetch('https://api.ipify.org?format=json').catch(() => null);
      if (!res?.ok) return { ok: false, error: 'Could not determine public IP' };
      ip = (await res.json()).ip;
    } else if (!/^[\d.:a-fA-F]+$/.test(target)) {
      // Domain → resolve to IP first
      try { const addrs = await dnsLookup(target, { all: true }); ip = addrs[0]?.address; }
      catch { return { ok: false, error: `Cannot resolve domain: ${target}` }; }
    }

    const result = { ok: true, ip, target };

    if (type === 'geo' || type === 'all') {
      const res = await fetch(`https://ipapi.co/${ip}/json/`).catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        result.geo = { city: d.city, region: d.region, country: d.country_name, countryCode: d.country_code, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone, isp: d.org };
      }
    }

    if (type === 'asn' || type === 'all') {
      const res = await fetch(`https://ipapi.co/${ip}/json/`).catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        result.asn = { asn: d.asn, org: d.org };
      }
    }

    if (type === 'rdns' || type === 'all') {
      try {
        const { reverse } = await import('dns/promises');
        const hostnames = await reverse(ip).catch(() => []);
        result.rdns = hostnames;
      } catch {}
    }

    return result;
  },
};
