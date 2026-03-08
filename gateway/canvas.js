/**
 * Canvas — agent-controlled visual workspace.
 * The agent can create, update, and render charts, diagrams, tables, markdown docs,
 * and interactive presentations. The UI polls /canvas for the current canvas state.
 *
 * Stored in memory — not persisted (use canvas_save to export).
 */

export class CanvasManager {
  constructor() {
    this.canvases = new Map(); // sessionKey → { type, content, title, updatedAt }
  }

  set(sessionKey, canvas) {
    this.canvases.set(sessionKey, { ...canvas, updatedAt: new Date().toISOString() });
  }

  get(sessionKey) {
    return this.canvases.get(sessionKey) || null;
  }

  list() {
    return [...this.canvases.entries()].map(([k, v]) => ({ session: k, title: v.title, type: v.type, updatedAt: v.updatedAt }));
  }

  clear(sessionKey) {
    this.canvases.delete(sessionKey);
  }
}
