/**
 * OpenBot Tool Loop Detector
 * Detects repetitive or stalled tool-call loops.
 * Config: tools.loopDetection.maxRepeat, tools.loopDetection.windowSize, tools.loopDetection.action
 */

export class ToolLoopDetector {
  constructor(config = {}) {
    const cfg = config?.tools?.loopDetection || {};
    this.maxRepeat = cfg.maxRepeat ?? 3;       // max same tool+input combos in window
    this.windowSize = cfg.windowSize ?? 10;    // rolling window of tool calls
    this.action = cfg.action || 'warn';        // warn | abort | inject
    this._sessions = new Map();
  }

  /**
   * Record a tool call and check for loops.
   * @returns { loopDetected: bool, message: string|null }
   */
  record(sessionKey, toolName, inputHash) {
    if (!this._sessions.has(sessionKey)) {
      this._sessions.set(sessionKey, []);
    }
    const history = this._sessions.get(sessionKey);
    const key = `${toolName}::${inputHash}`;
    history.push({ key, at: Date.now() });

    // Keep rolling window
    if (history.length > this.windowSize) history.shift();

    // Count repeats in window
    const count = history.filter(h => h.key === key).length;
    if (count >= this.maxRepeat) {
      const msg = `[Tool Loop Detected] "${toolName}" called with same input ${count} times in last ${this.windowSize} calls. ` +
        (this.action === 'abort' ? 'Aborting run.' : 'Consider a different approach.');
      return { loopDetected: true, message: msg, action: this.action, toolName, count };
    }

    return { loopDetected: false };
  }

  reset(sessionKey) {
    this._sessions.delete(sessionKey);
  }

  clearAll() {
    this._sessions.clear();
  }
}

/** Create a simple hash of tool input for comparison */
export function hashInput(input) {
  if (!input) return '';
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 256); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}
