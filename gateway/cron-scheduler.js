/**
 * CronScheduler — OpenClaw-compatible cron system
 *
 * Job types:
 *   schedule.kind = "at"     — one-shot ISO timestamp
 *   schedule.kind = "every"  — fixed interval in ms
 *   schedule.kind = "cron"   — cron expression (5-field)
 *
 * Session targets:
 *   "main"      — enqueue system event, run on next heartbeat
 *   "isolated"  — run dedicated agent turn in cron:<jobId>
 *
 * Delivery modes:
 *   "announce"  — post result to channel
 *   "none"      — silent (no delivery)
 *   "webhook"   — POST result to URL
 *
 * Jobs persist to ~/.openbot/cron/jobs.json
 */

import cron from 'node-cron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const CRON_DIR = join(HOME, '.openbot', 'cron');
const JOBS_FILE = join(CRON_DIR, 'jobs.json');
const RUNS_FILE = join(CRON_DIR, 'runs.json');

mkdirSync(CRON_DIR, { recursive: true });

export class CronScheduler {
  constructor(aiRouter, agentLoader, sessions) {
    this.aiRouter = aiRouter;
    this.agentLoader = agentLoader;
    this.sessions = sessions;
    this.jobs = this._loadJobs();
    this.runs = this._loadRuns();
    this.timers = new Map();
    this.cronJobs = new Map();
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  _loadJobs() {
    if (!existsSync(JOBS_FILE)) return [];
    try { return JSON.parse(readFileSync(JOBS_FILE, 'utf-8')); } catch { return []; }
  }
  _saveJobs() {
    writeFileSync(JOBS_FILE, JSON.stringify(this.jobs, null, 2));
  }
  _loadRuns() {
    if (!existsSync(RUNS_FILE)) return [];
    try { return JSON.parse(readFileSync(RUNS_FILE, 'utf-8')).slice(-200); } catch { return []; }
  }
  _saveRuns() {
    writeFileSync(RUNS_FILE, JSON.stringify(this.runs.slice(-200), null, 2));
  }

  // ── Job CRUD ─────────────────────────────────────────────────────────────
  addJob(params) {
    const job = {
      jobId: uuidv4(),
      name: params.name || 'Unnamed',
      schedule: params.schedule,
      payload: params.payload,
      delivery: params.delivery || { mode: 'none' },
      agentId: params.agentId || 'default',
      deleteAfterRun: params.deleteAfterRun ?? (params.schedule?.kind === 'at'),
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRun: null,
      nextRun: null,
    };
    this.jobs.push(job);
    this._saveJobs();
    this._scheduleJob(job);
    return job;
  }

  editJob(jobId, updates) {
    const idx = this.jobs.findIndex(j => j.jobId === jobId);
    if (idx === -1) throw new Error(`Job not found: ${jobId}`);
    this._unscheduleJob(jobId);
    Object.assign(this.jobs[idx], updates, { jobId });
    this._saveJobs();
    this._scheduleJob(this.jobs[idx]);
    return this.jobs[idx];
  }

  deleteJob(jobId) {
    const idx = this.jobs.findIndex(j => j.jobId === jobId);
    if (idx === -1) throw new Error(`Job not found: ${jobId}`);
    const [removed] = this.jobs.splice(idx, 1);
    this._unscheduleJob(jobId);
    this._saveJobs();
    return removed;
  }

  getJob(jobId) {
    return this.jobs.find(j => j.jobId === jobId || j.jobId.startsWith(jobId)) || null;
  }

  listJobs() { return this.jobs; }

  getRuns(jobId) {
    return jobId ? this.runs.filter(r => r.jobId === jobId) : this.runs;
  }

  // ── Scheduling ───────────────────────────────────────────────────────────
  start() {
    for (const job of this.jobs) {
      if (job.enabled) this._scheduleJob(job);
    }
    console.log(`[Cron] ${this.jobs.length} job(s) loaded`);
  }

  stop() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
    this.cronJobs.forEach(j => j.stop());
    this.cronJobs.clear();
  }

  _scheduleJob(job) {
    if (!job.enabled) return;
    const { schedule } = job;
    if (!schedule || !schedule.kind) {
      console.warn(`[Cron] Skipping job "${job.name || job.jobId}" — missing schedule.kind`);
      return;
    }

    if (schedule.kind === 'at') {
      const delay = new Date(schedule.at).getTime() - Date.now();
      if (delay < 0) return; // past
      const timer = setTimeout(() => this._runJob(job), delay);
      this.timers.set(job.jobId, timer);

    } else if (schedule.kind === 'every') {
      const ms = schedule.ms || 60000;
      const timer = setInterval(() => this._runJob(job), ms);
      this.timers.set(job.jobId, timer);

    } else if (schedule.kind === 'cron') {
      if (!cron.validate(schedule.expression)) {
        console.warn(`[Cron] Invalid expression for "${job.name}": ${schedule.expression}`);
        return;
      }
      const tz = schedule.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const cronJob = cron.schedule(schedule.expression, () => this._runJob(job), { timezone: tz });
      this.cronJobs.set(job.jobId, cronJob);
    }

    // Compute next run for display
    job.nextRun = this._computeNextRun(schedule);
  }

  _unscheduleJob(jobId) {
    const timer = this.timers.get(jobId);
    if (timer) { clearTimeout(timer); clearInterval(timer); this.timers.delete(jobId); }
    const cronJob = this.cronJobs.get(jobId);
    if (cronJob) { cronJob.stop(); this.cronJobs.delete(jobId); }
  }

  _computeNextRun(schedule) {
    if (schedule.kind === 'at') return schedule.at;
    if (schedule.kind === 'every') return new Date(Date.now() + schedule.ms).toISOString();
    return null; // cron is complex, skip for now
  }

  // ── Execution ────────────────────────────────────────────────────────────
  async _runJob(job) {
    const runId = uuidv4();
    const startedAt = new Date().toISOString();
    console.log(`[Cron] Running: "${job.name}" (${job.jobId.slice(0, 8)})`);

    const run = { runId, jobId: job.jobId, name: job.name, startedAt, status: 'running', output: null };
    this.runs.push(run);

    try {
      let output;
      if (job.payload.kind === 'agentTurn') {
        output = await this._runIsolated(job);
      } else if (job.payload.kind === 'systemEvent') {
        output = await this._runMainEvent(job);
      } else {
        throw new Error(`Unknown payload kind: ${job.payload.kind}`);
      }

      run.status = 'ok';
      run.output = output;
      run.endedAt = new Date().toISOString();

      await this._deliver(job, output);

    } catch (err) {
      run.status = 'error';
      run.error = err.message;
      run.endedAt = new Date().toISOString();
      console.error(`[Cron] Job "${job.name}" failed:`, err.message);
    }

    job.lastRun = startedAt;
    if (job.deleteAfterRun && run.status === 'ok') {
      this.deleteJob(job.jobId);
    } else {
      this._saveJobs();
    }
    this._saveRuns();
  }

  async _runIsolated(job) {
    const agent = this.agentLoader.getAgent(job.agentId) || this.agentLoader.getAgent('default');
    if (!agent) throw new Error(`Agent not found: ${job.agentId}`);

    const sessionId = `cron:${job.jobId}`;
    const message = `[cron:${job.name}] ${job.payload.message || job.payload.systemEvent || ''}`;

    const result = await this.aiRouter.complete({
      systemPrompt: agent.systemPrompt,
      history: [{ role: 'user', content: message }],
      agent,
      userId: `cron-${job.jobId}`,
      channel: 'cron',
      sessionId,
    });

    return typeof result === 'string' ? result : result.content;
  }

  async _runMainEvent(job) {
    // Post to gateway as a system message
    const message = job.payload.systemEvent || job.payload.message || '';
    await axios.post('http://127.0.0.1:18789/message', {
      message: `[System Event] ${message}`,
      agentId: job.agentId || 'default',
      userId: 'cron-system',
      channel: 'cron',
    }, { timeout: 5000 }).catch(() => {});
    return `System event posted: ${message}`;
  }

  async _deliver(job, output) {
    const mode = job.delivery?.mode || 'none';
    if (mode === 'none') return;

    if (mode === 'announce') {
      const channel = job.delivery.channel;
      const to = job.delivery.to;
      // Send via gateway REST to targeted channel
      await axios.post('http://127.0.0.1:18789/message', {
        message: output,
        agentId: job.agentId || 'default',
        userId: to || 'cron-announce',
        channel: channel || 'cron',
      }, { timeout: 10000 }).catch(err => console.error('[Cron] Delivery failed:', err.message));
    }

    if (mode === 'webhook' && job.delivery.url) {
      await axios.post(job.delivery.url, {
        jobId: job.jobId,
        name: job.name,
        output,
        runAt: new Date().toISOString(),
      }, { timeout: 10000 }).catch(err => console.error('[Cron] Webhook failed:', err.message));
    }
  }

  // ── Manual Run ───────────────────────────────────────────────────────────
  async runNow(jobId) {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    await this._runJob(job);
    return job;
  }
}
