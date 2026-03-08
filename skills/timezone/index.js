export default {
  name: 'timezone',
  async run({ action = 'now', timezone, datetime, toTimezone }) {
    const tz = timezone || 'UTC';

    switch (action) {
      case 'now': {
        const now = new Date();
        const fmt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'long' };
        try {
          const local = now.toLocaleString('en-US', fmt);
          const iso = new Date(now.toLocaleString('en-US', { timeZone: tz })).toISOString().replace('Z', '');
          return { ok: true, timezone: tz, local, iso, utc: now.toISOString() };
        } catch { return { ok: false, error: `Unknown timezone: ${tz}` }; }
      }
      case 'convert': {
        if (!toTimezone) return { ok: false, error: 'toTimezone required' };
        const date = datetime ? new Date(datetime) : new Date();
        if (isNaN(date)) return { ok: false, error: `Invalid datetime: ${datetime}` };
        try {
          const fromFmt = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
          const toFmt = { ...fromFmt, timeZone: toTimezone };
          return {
            ok: true,
            from: { timezone: tz, time: date.toLocaleString('en-US', fromFmt) },
            to: { timezone: toTimezone, time: date.toLocaleString('en-US', toFmt) },
            utc: date.toISOString(),
          };
        } catch (e) { return { ok: false, error: e.message }; }
      }
      case 'offset': {
        try {
          const now = new Date();
          const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
          const tzStr = now.toLocaleString('en-US', { timeZone: tz });
          const offsetMs = (new Date(tzStr) - new Date(utcStr));
          const offsetH = offsetMs / 3600000;
          return { ok: true, timezone: tz, offsetHours: offsetH, offsetString: `UTC${offsetH >= 0 ? '+' : ''}${offsetH}` };
        } catch { return { ok: false, error: `Unknown timezone: ${tz}` }; }
      }
      case 'list':
        return { ok: true, note: 'IANA timezone list is extensive. Common ones:', timezones: [
          'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Toronto',
          'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
          'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
          'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Honolulu',
        ]};
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
