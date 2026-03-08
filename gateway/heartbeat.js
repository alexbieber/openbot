/**
 * Heartbeat Scheduler — 5-Stage Pipeline
 * Stage 1: Probe Runner    — deterministic system checks (disk, API health, process status)
 * Stage 2: Policy Engine   — evaluate state transitions, detect anomalies
 * Stage 3: Escalation Gate — decide if LLM reasoning is needed
 * Stage 4: Action Dispatcher — emit alerts or trigger remediation tasks
 * Stage 5: Scheduler       — cron-based tick management
 *
 * Philosophy: "cheap checks first, models only when needed"
 */

import cron from 'node-cron';
import axios from 'axios';
import os from 'os';

const SCHEDULE_MAP = {
  'every day':     '0 9 * * *',
  'every morning': '0 9 * * *',
  'every evening': '0 18 * * *',
  'every night':   '0 22 * * *',
  'every hour':    '0 * * * *',
  'every 30 min':  '*/30 * * * *',
  'every 15 min':  '*/15 * * * *',
  'every 5 min':   '*/5 * * * *',
  'every minute':  '* * * * *',
  'every monday':  '0 9 * * 1',
  'every tuesday': '0 9 * * 2',
  'every wednesday':'0 9 * * 3',
  'every thursday':'0 9 * * 4',
  'every friday':  '0 9 * * 5',
  'every weekend': '0 10 * * 0,6',
};

function parseCron(schedule) {
  const lower = schedule.toLowerCase();
  const timeMatch = lower.match(/at (\d{1,2}):(\d{2})/);
  const hour   = timeMatch ? parseInt(timeMatch[1]) : 9;
  const minute = timeMatch ? parseInt(timeMatch[2]) : 0;

  for (const [key, expr] of Object.entries(SCHEDULE_MAP)) {
    if (lower.includes(key)) {
      return expr.replace(/^(\S+) (\S+)/, `${minute} ${hour}`);
    }
  }
  if (cron.validate(schedule)) return schedule;
  return `${minute} ${hour} * * *`;
}

// ── Stage 1: Probe Runner ──────────────────────────────────────────────────
class ProbeRunner {
  async runAll(config = {}) {
    const results = {};

    try {
      const mem = os.freemem() / os.totalmem();
      results.memory = {
        ok: mem > 0.1,
        value: `${(mem * 100).toFixed(1)}% free`,
        warning: mem < 0.2,
      };
    } catch { results.memory = { ok: true }; }

    try {
      const diskCheck = await this._checkDisk();
      results.disk = diskCheck;
    } catch { results.disk = { ok: true }; }

    if (config.probeUrls?.length) {
      for (const url of config.probeUrls) {
        try {
          const start = Date.now();
          const res = await axios.get(url, { timeout: 5000, validateStatus: () => true });
          results[`api:${url}`] = { ok: res.status < 500, status: res.status, ms: Date.now() - start };
        } catch (err) {
          results[`api:${url}`] = { ok: false, error: err.message };
        }
      }
    }

    // Gateway self-check
    try {
      const res = await axios.get('http://127.0.0.1:18789/health', { timeout: 2000 });
      results.gateway = { ok: res.data?.status === 'ok', uptime: res.data?.uptime };
    } catch { results.gateway = { ok: false }; }

    return results;
  }

  async _checkDisk() {
    const { execSync } = await import('child_process');
    try {
      const isWin = process.platform === 'win32';
      if (isWin) return { ok: true, value: 'disk check skipped on Windows' };
      const out = execSync('df / | tail -1', { timeout: 3000 }).toString();
      const pct = parseInt(out.match(/(\d+)%/)?.[1] || '0');
      return { ok: pct < 90, value: `${pct}% used`, warning: pct > 80 };
    } catch { return { ok: true }; }
  }
}

// ── Stage 2: Policy Engine ─────────────────────────────────────────────────
class PolicyEngine {
  constructor() { this.previousState = {}; }

  evaluate(probeResults) {
    const alerts = [];
    const warnings = [];
    let needsEscalation = false;

    for (const [key, result] of Object.entries(probeResults)) {
      const prev = this.previousState[key];

      if (!result.ok) {
        if (!prev || prev.ok) {
          // State transition: was OK, now failing
          alerts.push({ key, result, type: 'failure', transition: true });
          needsEscalation = true;
        } else {
          alerts.push({ key, result, type: 'failure', transition: false });
        }
      } else if (prev && !prev.ok) {
        // Recovered
        alerts.push({ key, result, type: 'recovery', transition: true });
      }

      if (result.warning) {
        warnings.push({ key, result });
        if (!prev?.warning) needsEscalation = true;
      }
    }

    this.previousState = { ...probeResults };
    return { alerts, warnings, needsEscalation };
  }
}

// ── Stage 3: Escalation Gate ───────────────────────────────────────────────
class EscalationGate {
  shouldEscalate(policyResult, scheduledTask) {
    // Always escalate for scheduled user tasks
    if (scheduledTask) return true;
    // Escalate for new failures or recoveries
    if (policyResult.needsEscalation) return true;
    // Don't escalate for known ongoing issues without new transitions
    const newTransitions = policyResult.alerts.filter(a => a.transition).length;
    return newTransitions > 0;
  }
}

// ── Stage 4: Action Dispatcher ─────────────────────────────────────────────
class ActionDispatcher {
  constructor(aiRouter) { this.aiRouter = aiRouter; }

  async dispatch(action, context = {}) {
    if (action.type === 'scheduled_task') {
      return this._runScheduledTask(action, context);
    }
    if (action.type === 'alert') {
      return this._sendAlert(action);
    }
  }

  async _runScheduledTask({ task, agent, systemPrompt }, context) {
    console.log(`[Heartbeat] Running scheduled task: "${task.name}"`);
    try {
      await this.aiRouter.complete({
        systemPrompt,
        history: [{ role: 'user', content: task.message }],
        agent,
        userId: `heartbeat-${agent.id}`,
        channel: 'heartbeat',
        sessionId: `heartbeat-${agent.id}`,
      });
    } catch (err) {
      console.error(`[Heartbeat] Task "${task.name}" failed:`, err.message);
    }
  }

  async _sendAlert({ message }) {
    try {
      await axios.post('http://127.0.0.1:18789/message', {
        message: `🔔 System Alert: ${message}`,
        userId: 'heartbeat-system',
        channel: 'heartbeat',
      }, { timeout: 3000 });
    } catch {}
  }
}

// ── Stage 5: Scheduler ─────────────────────────────────────────────────────
export class HeartbeatScheduler {
  constructor(aiRouter, agentLoader, config = {}) {
    this.aiRouter = aiRouter;
    this.agentLoader = agentLoader;
    this.config = config;
    this.jobs = [];
    this.probe = new ProbeRunner();
    this.policy = new PolicyEngine();
    this.gate = new EscalationGate();
    this.dispatcher = new ActionDispatcher(aiRouter);
    // 24h deduplication: hash → last fired timestamp
    this._dedupCache = new Map();
    this._dedupTtl = (config.heartbeat?.dedupTtlHours || 24) * 3600 * 1000;
  }

  _isDuplicate(taskKey, alertHash) {
    const key = `${taskKey}:${alertHash}`;
    const lastFired = this._dedupCache.get(key);
    if (lastFired && Date.now() - lastFired < this._dedupTtl) return true;
    this._dedupCache.set(key, Date.now());
    // Prune old entries
    if (this._dedupCache.size > 1000) {
      for (const [k, ts] of this._dedupCache) {
        if (Date.now() - ts > this._dedupTtl) this._dedupCache.delete(k);
      }
    }
    return false;
  }

  start() {
    const agents = this.agentLoader.listAgents();
    let totalJobs = 0;

    // Schedule user-defined tasks from HEARTBEAT.md
    for (const agentMeta of agents) {
      const agent = this.agentLoader.getAgent(agentMeta.id);
      if (!agent?.heartbeat?.length) continue;

      for (const task of agent.heartbeat) {
        const cronExpr = parseCron(task.schedule);
        if (!cron.validate(cronExpr)) {
          console.warn(`[Heartbeat] Invalid schedule for "${task.name}": ${task.schedule}`);
          continue;
        }

        const job = cron.schedule(cronExpr, async () => {
          // 24h dedup check — skip if same task fired recently
          const dedup = this.config.heartbeat?.dedup !== false;
          if (dedup && this._isDuplicate(task.name, agentMeta.id)) {
            console.log(`[Heartbeat] Skipping duplicate alert: "${task.name}" (within ${this._dedupTtl / 3600000}h window)`);
            return;
          }
          await this._runPipeline({
            scheduledTask: { task, agent, systemPrompt: agent.systemPrompt },
          });
        });

        this.jobs.push(job);
        totalJobs++;
        console.log(`[Heartbeat] Scheduled: "${task.name}" (${cronExpr})`);
      }
    }

    // System probe heartbeat — runs every minute, lightweight
    const probeJob = cron.schedule('* * * * *', async () => {
      await this._runPipeline({ scheduledTask: null });
    });
    this.jobs.push(probeJob);

    if (totalJobs > 0) {
      console.log(`[Heartbeat] ${totalJobs} scheduled task(s) active`);
    }
    console.log('[Heartbeat] System probe active (every 1 min)');
  }

  async _runPipeline({ scheduledTask }) {
    // Stage 1: Probe
    const probeResults = await this.probe.runAll(this.config.heartbeat || {});

    // Stage 2: Policy
    const policyResult = this.policy.evaluate(probeResults);

    // Stage 3: Escalation gate
    const escalate = this.gate.shouldEscalate(policyResult, scheduledTask);
    if (!escalate) return;

    // Stage 4: Dispatch
    if (scheduledTask) {
      await this.dispatcher.dispatch({ type: 'scheduled_task', ...scheduledTask });
    }

    for (const alert of policyResult.alerts.filter(a => a.transition)) {
      const msg = alert.type === 'failure'
        ? `${alert.key} is DOWN: ${alert.result.error || alert.result.value || 'check failed'}`
        : `${alert.key} has RECOVERED`;
      await this.dispatcher.dispatch({ type: 'alert', message: msg });
    }
  }

  stop() {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
  }
}
