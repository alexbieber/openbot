const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week'];
const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function explainField(val, name) {
  if (val === '*') return `every ${name}`;
  if (/^\d+$/.test(val)) {
    if (name === 'month') return `in ${MONTHS[+val] || val}`;
    if (name === 'day of week') return `on ${DAYS[+val] || val}`;
    return `at ${name} ${val}`;
  }
  if (val.includes('/')) {
    const [, step] = val.split('/');
    return `every ${step} ${name}s`;
  }
  if (val.includes('-')) {
    const [a, b] = val.split('-');
    if (name === 'day of week') return `${DAYS[+a]||a} through ${DAYS[+b]||b}`;
    if (name === 'month') return `${MONTHS[+a]||a} through ${MONTHS[+b]||b}`;
    return `${name}s ${a} through ${b}`;
  }
  if (val.includes(',')) {
    const parts = val.split(',');
    if (name === 'day of week') return `on ${parts.map(p => DAYS[+p]||p).join(', ')}`;
    return `${name}s ${parts.join(', ')}`;
  }
  return `${name}: ${val}`;
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  return { minute: parts[0], hour: parts[1], dayOfMonth: parts[2], month: parts[3], dayOfWeek: parts[4] };
}

function getNextRuns(expr, count = 5) {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return [];
    // Simple next-run calculator for common patterns
    const dates = [];
    const now = new Date();
    let cursor = new Date(now);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    for (let attempts = 0; attempts < 10000 && dates.length < count; attempts++) {
      if (_matches(cursor, parts)) dates.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return dates.map(d => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
  } catch { return []; }
}

function _matches(date, parts) {
  const [min, hr, dom, mon, dow] = parts;
  const check = (field, value) => {
    if (field === '*') return true;
    if (field.includes('/')) { const [base, step] = field.split('/'); return (value % parseInt(step)) === 0; }
    if (field.includes(',')) return field.split(',').includes(String(value));
    if (field.includes('-')) { const [a,b] = field.split('-').map(Number); return value >= a && value <= b; }
    return parseInt(field) === value;
  };
  return check(min, date.getUTCMinutes()) &&
         check(hr, date.getUTCHours()) &&
         check(dom, date.getUTCDate()) &&
         check(mon, date.getUTCMonth() + 1) &&
         check(dow, date.getUTCDay());
}

const PRESETS = {
  '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *',
};

export default {
  name: 'cron-expression',
  async run({ action = 'explain', expression, description, count = 5 }) {
    const expr = expression ? (PRESETS[expression] || expression) : null;

    switch (action) {
      case 'explain':
      case 'parse': {
        if (!expr) return { ok: false, error: 'expression required' };
        const p = parseCron(expr);
        if (!p) return { ok: false, error: 'Invalid cron expression (expected 5 fields)' };
        const explanations = [
          explainField(p.minute, 'minute'),
          explainField(p.hour, 'hour'),
          explainField(p.dayOfMonth, 'day of month'),
          explainField(p.month, 'month'),
          explainField(p.dayOfWeek, 'day of week'),
        ];
        const summary = `Runs ${explanations.filter(e => !e.startsWith('every minute')).join(', ')}`;
        return { ok: true, expression: expr, fields: p, explanations, summary };
      }
      case 'validate': {
        if (!expr) return { ok: false, error: 'expression required' };
        const p = parseCron(expr);
        return { ok: true, valid: !!p, expression: expr };
      }
      case 'next': {
        if (!expr) return { ok: false, error: 'expression required' };
        const runs = getNextRuns(expr, Math.min(count, 10));
        return { ok: true, expression: expr, nextRuns: runs };
      }
      case 'generate': {
        if (!description) return { ok: false, error: 'description required' };
        const d = description.toLowerCase();
        let generated = '0 9 * * *';
        if (d.includes('every minute')) generated = '* * * * *';
        else if (d.includes('every hour')) generated = '0 * * * *';
        else if (d.includes('midnight') || d.includes('12am')) generated = '0 0 * * *';
        else if (d.includes('noon') || d.includes('12pm')) generated = '0 12 * * *';
        else if (d.includes('every day')) generated = '0 9 * * *';
        else if (d.includes('weekday') || d.includes('monday to friday') || d.includes('mon-fri')) generated = '0 9 * * 1-5';
        else if (d.includes('weekend')) generated = '0 10 * * 6,0';
        else if (d.includes('weekly') || d.includes('every week')) generated = '0 9 * * 1';
        else if (d.includes('monthly') || d.includes('every month')) generated = '0 9 1 * *';
        return { ok: true, description, expression: generated, nextRuns: getNextRuns(generated, 3) };
      }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
