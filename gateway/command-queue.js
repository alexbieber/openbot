/**
 * OpenBot Command Queue
 * Per-session serialization — prevents tool/session races.
 * Modes: collect (queue all), steer (interrupt with new), followup (append after current)
 */

export class CommandQueue {
  constructor() {
    this._queues = new Map(); // sessionKey -> queue state
  }

  /**
   * Enqueue a task for a session. Returns a Promise that resolves with the task result.
   * @param {string} sessionKey
   * @param {Function} task - async function to execute
   * @param {object} opts - { mode: 'collect'|'steer'|'followup', priority: number }
   */
  enqueue(sessionKey, task, opts = {}) {
    const { mode = 'collect' } = opts;

    if (!this._queues.has(sessionKey)) {
      this._queues.set(sessionKey, { running: false, queue: [], abortController: null });
    }

    const state = this._queues.get(sessionKey);

    return new Promise((resolve, reject) => {
      const entry = { task, resolve, reject, mode, addedAt: Date.now() };

      if (mode === 'steer' && state.running) {
        // Abort current run and replace queue
        state.abortController?.abort();
        state.queue = [entry];
      } else {
        state.queue.push(entry);
      }

      this._drain(sessionKey);
    });
  }

  async _drain(sessionKey) {
    const state = this._queues.get(sessionKey);
    if (!state || state.running || state.queue.length === 0) return;

    state.running = true;
    const entry = state.queue.shift();
    const controller = new AbortController();
    state.abortController = controller;

    try {
      const result = await entry.task(controller.signal);
      entry.resolve(result);
    } catch (err) {
      if (err.name === 'AbortError') {
        entry.reject(new Error('Run aborted (steer)'));
      } else {
        entry.reject(err);
      }
    } finally {
      state.running = false;
      state.abortController = null;
      // Drain next
      if (state.queue.length > 0) {
        setImmediate(() => this._drain(sessionKey));
      }
    }
  }

  /** Abort all running/queued tasks for a session */
  abort(sessionKey) {
    const state = this._queues.get(sessionKey);
    if (!state) return 0;
    state.abortController?.abort();
    const count = state.queue.length + (state.running ? 1 : 0);
    state.queue = [];
    return count;
  }

  /** Check if session has an active run */
  isRunning(sessionKey) {
    return this._queues.get(sessionKey)?.running || false;
  }

  getQueueDepth(sessionKey) {
    return this._queues.get(sessionKey)?.queue.length || 0;
  }

  /** Snapshot for status endpoint */
  status() {
    const result = {};
    for (const [key, state] of this._queues) {
      if (state.running || state.queue.length > 0) {
        result[key] = { running: state.running, queued: state.queue.length };
      }
    }
    return result;
  }
}
