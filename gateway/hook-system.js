/**
 * OpenBot Hook System
 * Mirrors ClawdBot's plugin/hook architecture.
 * Supports: agent lifecycle, tool intercept, message pipeline, gateway events.
 */

export class HookSystem {
  constructor() {
    this._hooks = new Map();
    this._plugins = [];
  }

  // ── Plugin Registration ──────────────────────────────────────────────────
  registerPlugin(plugin) {
    if (!plugin || typeof plugin !== 'object') throw new Error('Invalid plugin');
    const name = plugin.name || `plugin_${this._plugins.length}`;
    this._plugins.push({ name, plugin });
    // Register all hook handlers the plugin declares
    const HOOK_NAMES = [
      'before_model_resolve', 'before_prompt_build', 'before_agent_start', 'agent_end',
      'before_compaction', 'after_compaction',
      'before_tool_call', 'after_tool_call', 'tool_result_persist',
      'message_received', 'message_sending', 'message_sent',
      'session_start', 'session_end',
      'gateway_start', 'gateway_stop',
      'agent_bootstrap',
    ];
    for (const hookName of HOOK_NAMES) {
      if (typeof plugin[hookName] === 'function') {
        this.on(hookName, plugin[hookName].bind(plugin));
      }
    }
    console.log(`[Hooks] Plugin registered: ${name}`);
    return this;
  }

  on(hookName, handler) {
    if (!this._hooks.has(hookName)) this._hooks.set(hookName, []);
    this._hooks.get(hookName).push(handler);
    return this;
  }

  off(hookName, handler) {
    if (!this._hooks.has(hookName)) return;
    const handlers = this._hooks.get(hookName).filter(h => h !== handler);
    this._hooks.set(hookName, handlers);
  }

  // ── Hook Execution ───────────────────────────────────────────────────────

  /** Run all handlers for a hook. Returns accumulated context mutations. */
  async run(hookName, context = {}) {
    const handlers = this._hooks.get(hookName) || [];
    let ctx = { ...context };
    for (const handler of handlers) {
      try {
        const result = await handler(ctx);
        if (result && typeof result === 'object') {
          ctx = { ...ctx, ...result };
        }
      } catch (err) {
        console.error(`[Hooks] Error in ${hookName} handler:`, err.message);
      }
    }
    return ctx;
  }

  /** Fire-and-forget hooks that don't mutate context */
  async fire(hookName, data = {}) {
    const handlers = this._hooks.get(hookName) || [];
    await Promise.allSettled(handlers.map(h => h(data)));
  }

  listPlugins() {
    return this._plugins.map(p => ({ name: p.name }));
  }

  listHooks() {
    const result = {};
    for (const [name, handlers] of this._hooks) {
      result[name] = handlers.length;
    }
    return result;
  }
}

// ── Built-in hooks directory loader ─────────────────────────────────────────
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export async function loadHooksDir(hooksDir, hookSystem) {
  if (!existsSync(hooksDir)) return;
  const files = readdirSync(hooksDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const mod = await import(`file://${join(hooksDir, file)}`);
      if (typeof mod.default === 'object' && mod.default !== null) {
        hookSystem.registerPlugin({ name: file.replace('.js', ''), ...mod.default });
      } else if (typeof mod.default === 'function') {
        // Function-style plugin: call it with hookSystem
        await mod.default(hookSystem);
      }
    } catch (err) {
      console.error(`[Hooks] Failed to load hook ${file}:`, err.message);
    }
  }
}
