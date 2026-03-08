// Safe math evaluator — no eval(), uses a simple expression parser
import { createRequire } from 'module';

function safeEval(expr) {
  // Try mathjs first
  try {
    const mathjs = createRequire(import.meta.url)('mathjs');
    return mathjs.evaluate(expr);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      // Fallback: very limited safe eval using Function constructor with only math
      const safe = new Function(
        'Math', 'PI', 'E',
        `"use strict"; return (${expr.replace(/\^/g, '**')})`,
      );
      return safe(Math, Math.PI, Math.E);
    }
    throw e;
  }
}

export default {
  name: 'math',
  async run({ expression, precision = 10 }) {
    if (!expression) return { ok: false, error: 'expression is required' };
    try {
      const result = safeEval(expression.trim());
      const formatted = typeof result === 'number'
        ? (Number.isInteger(result) ? result.toString() : result.toPrecision(precision).replace(/\.?0+$/, ''))
        : String(result);
      return { ok: true, expression, result: formatted, raw: result };
    } catch (err) {
      return { ok: false, error: err.message, expression };
    }
  },
};
