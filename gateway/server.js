#!/usr/bin/env node
/**
 * OpenBot Gateway Server
 * The always-running core that bridges messaging channels to AI models.
 * Architecture: WebSocket hub + REST API + AI router + skill executor
 */

import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

import { AIRouter } from './ai-router.js';
import { SkillEngine } from './skill-engine.js';
import { MemoryManager } from './memory-manager.js';
import { SessionManager } from './session-manager.js';
import { AgentLoader } from './agent-loader.js';
import { HeartbeatScheduler } from './heartbeat.js';
import { CronScheduler } from './cron-scheduler.js';
import { AuditLogger } from './audit-logger.js';
import { SecretsManager } from './secrets-manager.js';
import { PairingManager } from './pairing.js';
import { HookSystem, loadHooksDir } from './hook-system.js';
import { AgentRouter } from './agent-router.js';
import { SystemPromptBuilder } from './system-prompt.js';
import { CommandQueue } from './command-queue.js';
import { ToolLoopDetector, hashInput } from './tool-loop-detector.js';
import { ExecTool } from './exec-tool.js';
import { WebhookManager } from './webhooks.js';
import { DockerSandbox } from './docker-sandbox.js';
import { CanvasManager } from './canvas.js';
import { MessageDebouncer } from './message-debouncer.js';
import { ObsidianSync } from './obsidian-sync.js';
import { ProviderAuthRegistry } from './provider-auth.js';
import { ACPBus } from './acp.js';
import { registerGmailWebhook } from './channels/gmail.js';
import { registerWeChatWebhook } from './channels/wechat.js';
import { MCPClient } from './mcp-client.js';
import { DeliveryQueue } from './delivery-queue.js';
import { WakeWordDetector, registerPTTEndpoint } from './wake-word.js';
import { mergeAgentsMdIntoConfig } from './soul-loader.js';
import { registerOutlookWebhook } from './channels/outlook.js';
import { loadConfig } from '../config/loader.js';
import { loadOpenBotConfig, watchConfig, writeOpenBotConfig } from '../config/openbot-config.js';
import { ensureDataDirs } from '../config/paths.js';
import multer from 'multer';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Bootstrap ───────────────────────────────────────────────────────────────
const config = loadConfig();
const openBotConfig = loadOpenBotConfig();
// Merge openbot.json on top of env-based config
Object.assign(config, { ...config, ...openBotConfig, ai: { ...config.ai, ...openBotConfig.ai } });
// Merge AGENTS.md agent definitions (overrides JSON config, hot Markdown config)
{
  const HOME = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const _agentsWorkspace = join(HOME, '.openbot');
  Object.assign(config, mergeAgentsMdIntoConfig(config, _agentsWorkspace));
}
const PORT = config.gateway?.port || 18789;
const HOST = config.gateway?.host || '127.0.0.1';

// Ensure data directories exist (cross-platform)
const DATA_DIR = ensureDataDirs();

// ── Core Services ────────────────────────────────────────────────────────────
const memory = new MemoryManager(join(DATA_DIR, 'memory'));
const sessions = new SessionManager(join(DATA_DIR, 'conversations'));
const audit = new AuditLogger(join(DATA_DIR, 'logs'));
const agentLoader = new AgentLoader(join(__dirname, '..', 'agents'));
const skillEngine = new SkillEngine(join(__dirname, '..', 'skills'), config, audit);
const aiRouter = new AIRouter(config, skillEngine, memory);
const heartbeat = new HeartbeatScheduler(aiRouter, agentLoader, config);
const cronScheduler = new CronScheduler(aiRouter, agentLoader, sessions);
const secrets = new SecretsManager();
secrets.injectAll(); // inject stored secrets into process.env
const pairing = new PairingManager(config.channels?.dmPolicy || 'pairing');

// ── New ClawdBot-parity systems ───────────────────────────────────────────────
const hooks = new HookSystem();
const agentRouter = new AgentRouter(config.agents?.list || [], config.bindings || [], 'default');
const systemPrompt = new SystemPromptBuilder({ ...config, _dataDir: DATA_DIR });
const commandQueue = new CommandQueue();
const loopDetector = new ToolLoopDetector(config);
const execTool = new ExecTool(config);
const webhookManager = new WebhookManager(DATA_DIR);
const dockerSandbox = new DockerSandbox(config);
const canvasManager = new CanvasManager();
const messageDebouncer = new MessageDebouncer(config);
const obsidianSync = new ObsidianSync(config, DATA_DIR);
const providerAuth = new ProviderAuthRegistry(secrets);
const acpBus = new ACPBus({ nodeId: config.nodeId, nodeName: config.agents?.default?.name || 'openbot', port: PORT });
const mcpClient = new MCPClient(config);
const deliveryQueue = new DeliveryQueue(DATA_DIR);
const wakeWord = new WakeWordDetector(config);

// MCP — connect to all configured servers on startup
mcpClient.connectAll().catch(() => {});
deliveryQueue.start();
wakeWord.start().catch(() => {});

// Expose MCP client globally for skill engine
globalThis._openBotMCP = mcpClient;
globalThis._openBotConfig = config; // shared with routes/agents.js and other modules

// Expose canvas + broadcast globally for the canvas skill
globalThis._openBotCanvas = canvasManager;
globalThis._openBotBroadcast = (msg) => {
  for (const [, client] of wsClients) {
    if (client.ws?.readyState === 1) client.ws.send(JSON.stringify(msg));
  }
};

// Load plugins from ~/.openbot/plugins/
import { join as _join } from 'path';
const pluginsDir = _join(DATA_DIR, 'plugins');
await loadHooksDir(pluginsDir, hooks).catch(() => {});

// Fire gateway_start hook
await hooks.fire('gateway_start', { config, port: PORT });

// Start Obsidian sync watcher if configured
obsidianSync.startWatcher();

// ── Express REST API ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  const tokenUsage = aiRouter.getTokenUsage?.() || {};
  const routing    = aiRouter.routingStatus?.() || {};
  res.json({
    status: 'ok',
    version: JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version || '1.0.0',
    uptime: process.uptime(),
    connectedChannels: wsClients.size,
    model: config.ai?.defaultModel || 'unknown',
    platform: process.platform,
    node: process.version,
    skills: skillEngine.skillCount?.() || 0,
    agents: agentLoader.listAgents?.()?.length || 1,
    tokenUsage: {
      totalInput:  tokenUsage.total_input  || 0,
      totalOutput: tokenUsage.total_output || 0,
      cacheReads:  tokenUsage.cache?.reads || 0,
      cacheSavedTokens: tokenUsage.cache?.saved_tokens || 0,
    },
    smartRouting: routing,
  });
});

// ── Routing status — which model tier is active ──────────────────────────────
app.get('/routing', (req, res) => {
  res.json({
    smartRouting: aiRouter.routingStatus(),
    defaultModel: config.ai?.defaultModel || 'claude-sonnet-4-6',
    promptCaching: config.ai?.promptCaching !== false,
    autoCompact:   config.ai?.autoCompact   !== false,
    tokenUsage:    aiRouter.getTokenUsage(),
  });
});

// QR code endpoint — serves QR as PNG for WhatsApp/channel pairing
app.get('/qr', (req, res) => {
  const { channel = 'whatsapp' } = req.query;
  // Return current QR data if available
  const qrData = globalThis._openBotQRData?.[channel];
  if (!qrData) {
    return res.status(404).json({ error: 'No QR code available. Start the channel adapter first.' });
  }
  res.json({ qr: qrData.text, dataUrl: qrData.dataUrl, channel, generatedAt: qrData.at });
});
// Store QR data globally so adapters can publish it
globalThis._openBotQRData = globalThis._openBotQRData || {};

// ── Setup status — tells the UI whether an API key is configured ──────────
app.get('/setup/status', (req, res) => {
  const hasKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OLLAMA_URL ||
    process.env.GEMINI_API_KEY ||
    process.env.TOGETHER_API_KEY ||
    process.env.MISTRAL_API_KEY
  );
  const provider = process.env.ANTHROPIC_API_KEY ? 'Anthropic'
    : process.env.OPENAI_API_KEY ? 'OpenAI'
    : process.env.DEEPSEEK_API_KEY ? 'DeepSeek'
    : process.env.OPENROUTER_API_KEY ? 'OpenRouter'
    : process.env.GROQ_API_KEY ? 'Groq'
    : process.env.OLLAMA_URL ? 'Ollama'
    : process.env.GEMINI_API_KEY ? 'Google Gemini'
    : process.env.TOGETHER_API_KEY ? 'Together AI'
    : process.env.MISTRAL_API_KEY ? 'Mistral'
    : null;
  res.json({
    ready: hasKey,
    provider,
    model: config.model || process.env.OPENBOT_MODEL || null,
    setupUrl: 'https://github.com/your-repo#quick-start',
    hint: hasKey
      ? `Using ${provider}`
      : 'Add an API key to .env (e.g. ANTHROPIC_API_KEY=sk-ant-...) then restart the gateway.',
  });
});

// Send a message via REST (for CLI / integrations)
app.post('/message', async (req, res) => {
  const { message, agentId = 'default', userId = 'rest-user', channel = 'rest' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const response = await processMessage({ message, agentId, userId, channel });
    res.json({ response, sessionId: response.sessionId });
  } catch (err) {
    console.error('[Gateway] REST error:', err.message);
    // 503 = Service Unavailable (no API key) vs 500 = unexpected internal error
    const isConfig = err.message?.includes('API key not configured') || err.message?.includes('not configured');
    res.status(isConfig ? 503 : 500).json({
      error: err.message,
      ...(isConfig ? { hint: 'Add an API key to your .env file and restart the gateway. See .env.example for all options.' } : {}),
    });
  }
});

// Streaming SSE endpoint — GET /stream?message=...&agentId=...&userId=...
app.get('/stream', async (req, res) => {
  const { message, agentId = 'default', userId = 'sse-user' } = req.query;
  if (!message) return res.status(400).json({ error: 'message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    send('start', { agentId, userId });
    const response = await aiRouter.completeStream({
      agentId, userId, message, channel: 'sse',
      agentLoader, memory, sessions, audit,
      onToken: (token) => send('token', { token }),
      onToolCall: (name, input) => send('tool', { name, input }),
    });
    send('done', { content: response.content, toolsUsed: response.toolsUsed, model: response.model });
  } catch (err) {
    send('error', { error: err.message });
  }
  res.end();
});

// Memory endpoints
app.get('/memory', async (req, res) => {
  // Accept ?q=, ?query=, or ?search= for compatibility
  const query = req.query.q || req.query.query || req.query.search || '';
  const items = query ? await memory.search(query) : await memory.list();
  res.json(items);
});

app.post('/memory', async (req, res) => {
  // Accept { content } or { key, value } for ClawdBot compat
  const content = req.body.content || (req.body.key && req.body.value
    ? `${req.body.key}: ${req.body.value}`
    : req.body.value || req.body.key);
  const tags = req.body.tags || [];
  if (!content) return res.status(400).json({ error: 'content (or key+value) required' });
  const id = await memory.save(content, Array.isArray(tags) ? tags : [tags]);
  res.json({ id });
});

app.delete('/memory/:id', async (req, res) => {
  await memory.delete(req.params.id);
  res.json({ ok: true });
});

// Skills endpoints
app.get('/skills', (req, res) => {
  res.json(skillEngine.listSkills());
});

// Hot-reload a skill (or all skills)
app.post('/skills/reload', (req, res) => {
  const { name } = req.body;
  if (name) {
    const ok = skillEngine.reloadSkill(name);
    res.json({ ok, name });
  } else {
    skillEngine.loadAll();
    res.json({ ok: true, reloaded: skillEngine.skillCount() });
  }
});

// Secrets endpoints (credentials management)
app.get('/secrets', (req, res) => res.json(secrets.list()));
app.post('/secrets', (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'key and value required' });
  secrets.set(key, value);
  res.json({ ok: true, key });
});
app.delete('/secrets/:key', (req, res) => {
  secrets.delete(req.params.key);
  res.json({ ok: true });
});

// Pairing endpoints
app.get('/pairing/allowed', (req, res) => res.json(pairing.listAllowed()));
app.get('/pairing/pending', (req, res) => res.json(pairing.listPending()));
app.post('/pairing/allow', (req, res) => {
  pairing.allow(req.body.userId);
  res.json({ ok: true });
});
app.post('/pairing/deny', (req, res) => {
  pairing.deny(req.body.userId);
  res.json({ ok: true });
});

// Cron endpoints
app.get('/cron', (req, res) => res.json(cronScheduler.listJobs()));
app.post('/cron', (req, res) => {
  try {
    let params = req.body;
    // Normalize shorthand: { name, cron, message } → full job schema
    if (!params.schedule && (params.cron || params.every || params.at)) {
      const schedule = params.cron
        ? { kind: 'cron', expression: params.cron }
        : params.every
          ? { kind: 'every', ms: params.every }
          : { kind: 'at', at: params.at };
      const payload = params.message
        ? { kind: 'agentTurn', message: params.message, agentId: params.agentId || 'default' }
        : (params.payload || { kind: 'systemEvent', event: 'cron.tick' });
      params = { ...params, schedule, payload };
    }
    res.json(cronScheduler.addJob(params));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/cron/runs', (req, res) => res.json(cronScheduler.getRuns()));
app.get('/cron/:jobId', (req, res) => { const j = cronScheduler.getJob(req.params.jobId); j ? res.json(j) : res.status(404).json({ error: 'not found' }); });
app.put('/cron/:jobId', (req, res) => { try { res.json(cronScheduler.editJob(req.params.jobId, req.body)); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/cron/:jobId', (req, res) => { try { res.json(cronScheduler.deleteJob(req.params.jobId)); } catch (e) { res.status(404).json({ error: e.message }); } });
app.post('/cron/:jobId/run', async (req, res) => { try { res.json(await cronScheduler.runNow(req.params.jobId)); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/cron/:jobId/runs', (req, res) => res.json(cronScheduler.getRuns(req.params.jobId)));

// Config endpoints
app.get('/config', (req, res) => res.json(config));
app.post('/config', async (req, res) => {
  // Accept full config object (UI) or key/value pair (CLI)
  if (req.body && typeof req.body === 'object' && !req.body.key) {
    try {
      writeOpenBotConfig(req.body);
      Object.assign(config, req.body);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const keys = key.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) { obj[keys[i]] = obj[keys[i]] || {}; obj = obj[keys[i]]; }
  obj[keys[keys.length - 1]] = value;
  res.json({ ok: true, key, value });
});

// Channels status endpoint
app.get('/channels/status', (req, res) => {
  const status = {};
  const chs = config?.channels || {};
  for (const [ch, cfg] of Object.entries(chs)) {
    if (typeof cfg !== 'object') continue;
    status[ch] = { connected: false, status: cfg.enabled === false ? 'disabled' : 'configured' };
  }
  res.json(status);
});

// Logs streaming (SSE)
const logSubscribers = new Set();
app.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: [OpenBot log stream connected]\n\n');
  logSubscribers.add(res);
  req.on('close', () => logSubscribers.delete(res));
});
// Patch console to also broadcast to log subscribers
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
console.log = (...args) => {
  _origLog(...args);
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  logSubscribers.forEach(r => { try { r.write(`data: ${line}\n\n`); } catch {} });
};
console.error = (...args) => {
  _origError(...args);
  const line = '[error] ' + args.map(a => a instanceof Error ? a.message : (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logSubscribers.forEach(r => { try { r.write(`data: ${line}\n\n`); } catch {} });
};

// Webhooks (automation) endpoints
app.get('/webhooks', (req, res) => res.json(webhookManager.list()));
app.post('/webhooks', (req, res) => {
  try { res.json(webhookManager.add(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/webhooks/:id', (req, res) => {
  try { res.json(webhookManager.remove(req.params.id)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
app.post('/webhooks/:id/fire', async (req, res) => {
  const hook = webhookManager.get(req.params.id);
  if (!hook) return res.status(404).json({ error: 'not found' });
  await webhookManager.fire(hook.event, { test: true, hookId: req.params.id });
  res.json({ ok: true });
});

// Exec approvals endpoints
app.get('/approvals/pending', (req, res) => res.json(execTool.listPendingApprovals()));
app.get('/approvals/allowlist', (req, res) => res.json(execTool.getApprovals()));
app.post('/approvals/:id/approve', (req, res) => res.json(execTool.approveExec(req.params.id)));
app.post('/approvals/:id/deny', (req, res) => res.json(execTool.denyExec(req.params.id)));
app.post('/approvals/allowlist/add', (req, res) => {
  const { binary } = req.body;
  if (!binary) return res.status(400).json({ error: 'binary required' });
  res.json(execTool.addToAllowlist(binary));
});

// Exec + process tool endpoints
app.post('/exec', async (req, res) => {
  try {
    const { command, agentId = 'default', sandbox = false, env: envVars } = req.body;
    if (!command) return res.status(400).json({ error: 'command required' });
    if (sandbox && dockerSandbox.isEnabled()) {
      const result = await dockerSandbox.run(command, { env: envVars });
      return res.json(result);
    }
    res.json(await execTool.run(req.body, agentId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/process', (req, res) => {
  const { action, sessionId, ...opts } = req.body;
  res.json(execTool.process(action, sessionId, opts));
});
app.get('/sandbox', (req, res) => res.json(dockerSandbox.summary()));
app.post('/sandbox/pull', async (req, res) => {
  const ok = await dockerSandbox.pullImage();
  res.json({ ok, image: dockerSandbox.config.image });
});

// Canvas endpoints
app.get('/canvas', (req, res) => res.json(canvasManager.list()));
app.get('/canvas/:session', (req, res) => {
  const c = canvasManager.get(req.params.session);
  c ? res.json(c) : res.status(404).json({ error: 'No canvas for this session' });
});
app.delete('/canvas/:session', (req, res) => { canvasManager.clear(req.params.session); res.json({ ok: true }); });

// Provider auth registry endpoints
app.get('/providers', (req, res) => res.json(providerAuth.listProviders()));
app.post('/providers/:id/login', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (apiKey) { res.json(await providerAuth.loginApiKey(req.params.id, apiKey)); }
    else { res.json(await providerAuth.loginDeviceFlow(req.params.id)); }
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/providers/:id', (req, res) => res.json({ ok: providerAuth.removeToken(req.params.id) }));

// Obsidian sync endpoints
app.get('/obsidian/status', (req, res) => res.json(obsidianSync.status()));
app.post('/obsidian/sync', (req, res) => {
  const count = obsidianSync.syncAllMemories();
  res.json({ ok: true, synced: count });
});

// ACP bus info
app.get('/acp/peers', (req, res) => res.json([...acpBus.peers.values()]));

// Debounce stats
app.get('/debounce', (req, res) => res.json(messageDebouncer.stats()));

// MCP servers
app.get('/mcp/servers', (req, res) => res.json(mcpClient.listServers()));
app.get('/mcp/tools', (req, res) => res.json(mcpClient.listAllTools()));
app.post('/mcp/connect', async (req, res) => {
  try {
    const { name, ...cfg } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const server = await mcpClient.connectServer(name, cfg);
    res.json({ connected: true, name, tools: server.tools.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/mcp/servers/:name', (req, res) => {
  mcpClient.disconnectServer(req.params.name);
  res.json({ ok: true });
});
app.post('/mcp/call', async (req, res) => {
  try {
    const { tool, args } = req.body;
    const result = await mcpClient.executeTool(tool, args || {});
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── File Upload endpoint ──────────────────────────────────────────────────────
const uploadStorage = multer.memoryStorage();
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});
const uploadDir = join(DATA_DIR, 'uploads');
try { mkdirSync(uploadDir, { recursive: true }); } catch {}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { originalname, mimetype, buffer } = req.file;
    const ext = originalname.split('.').pop() || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    const filePath = join(uploadDir, filename);
    writeFileSync(filePath, buffer);

    // For text/code/document types, extract content for the AI
    let content = null;
    if (mimetype.startsWith('text/') || mimetype === 'application/json') {
      content = buffer.toString('utf-8').slice(0, 50000);
    }

    res.json({
      ok: true,
      filename,
      originalname,
      mimetype,
      size: buffer.length,
      url: `/uploads/${filename}`,
      content,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

// ── Device registration (push notifications) ─────────────────────────────────
const _deviceTokens = new Map(); // token → { token, platform, userId, registeredAt }

app.post('/devices/register', (req, res) => {
  const { token, platform = 'unknown', userId = 'mobile-user' } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  _deviceTokens.set(token, { token, platform, userId, registeredAt: Date.now() });
  console.log(`[Devices] Registered push token: ${platform} / ${userId}`);
  res.json({ ok: true, registered: _deviceTokens.size });
});

app.get('/devices', (req, res) => {
  res.json([..._deviceTokens.values()]);
});

app.delete('/devices/:token', (req, res) => {
  const deleted = _deviceTokens.delete(decodeURIComponent(req.params.token));
  res.json({ ok: deleted });
});

// Expose device tokens globally so skills/channels can send push notifications
globalThis._openBotDeviceTokens = _deviceTokens;

// Delivery queue status
app.get('/delivery', (req, res) => res.json(deliveryQueue.status()));
app.get('/delivery/dead-letters', (req, res) => res.json(deliveryQueue.getDeadLetters()));
app.delete('/delivery/dead-letters', (req, res) => { deliveryQueue.clearDeadLetters(); res.json({ ok: true }); });

// Wake word status
app.get('/wake-word', (req, res) => res.json(wakeWord.status()));
app.post('/wake-word/start', async (req, res) => { await wakeWord.start(); res.json(wakeWord.status()); });
app.post('/wake-word/stop', (req, res) => { wakeWord.stop(); res.json(wakeWord.status()); });

// Plugins list
app.get('/plugins', (req, res) => res.json(hooks.listPlugins()));
app.get('/hooks', (req, res) => res.json(hooks.listHooks()));

// Queue status
app.get('/queue', (req, res) => res.json(commandQueue.status()));

// Agents (multi-agent routing)
app.get('/agents/routing', (req, res) => res.json({
  agents: agentRouter.listAgents(),
  bindings: agentRouter.listBindings(),
}));
app.post('/agents/resolve', (req, res) => res.json({ agentId: agentRouter.resolve(req.body) }));

// Conversations + Sessions endpoints (/sessions is the canonical path; /conversations is an alias)
app.get('/sessions', async (req, res) => {
  try {
    const list = await sessions.listSessions(req.query.userId);
    res.json(list);
  } catch { res.json([]); }
});
app.get('/sessions/:sessionId', async (req, res) => {
  try {
    const history = await sessions.getHistory(req.params.sessionId);
    res.json({ sessionId: req.params.sessionId, messages: history || [] });
  } catch { res.json({ messages: [] }); }
});
app.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await sessions.clearSession(req.params.sessionId);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

// Token usage dashboard
app.get('/tokens', (req, res) => {
  res.json(aiRouter.getTokenUsage());
});

// Webhook trigger endpoint — POST /webhook/:agentId with JSON body { message }
app.post('/webhook/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { message, userId = 'webhook' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const response = await processMessage({ message, agentId, userId, channel: 'webhook' });
    res.json({ response: response.content, sessionId: response.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// /conversations is an alias for /sessions (backward-compat)
app.get('/conversations', async (req, res) => {
  try {
    const list = await sessions.listSessions(req.query.userId);
    res.json(list);
  } catch { res.json([]); }
});
app.get('/conversations/:id', async (req, res) => {
  try {
    const history = await sessions.getHistory(req.params.id);
    res.json({ sessionId: req.params.id, messages: history || [] });
  } catch { res.json({ messages: [] }); }
});

// ── Import API routes ────────────────────────────────────────────────────────
import agentRoutes from './routes/agents.js';
import configRoutes from './routes/config.js';
import uiRoutes from './routes/ui.js';
app.use('/agents', agentRoutes);
app.use('/config', configRoutes);
app.use('/', uiRoutes);

// ── WebSocket Server ─────────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Map(); // clientId → { ws, role, userId, agentId, channel }

// Mount ACP bus (needs both app and wss)
acpBus.mount(app, wss);

// Register Gmail PubSub webhook if configured
if (process.env.GMAIL_CLIENT_ID || config.channels?.gmail) {
  registerGmailWebhook(app, async (msg) => {
    await processMessage({ message: msg.content, agentId: 'default', userId: msg.userId, channel: 'gmail', metadata: msg.metadata });
  });
}

// Register WeChat Official Account webhook if configured
if (process.env.WECHAT_APP_ID || config.channels?.wechat) {
  registerWeChatWebhook(app, async (msg) => {
    return processMessage({ message: msg.content, agentId: 'default', userId: msg.userId, channel: 'wechat' });
  });
}

// Register Push-to-Talk endpoint (voice input)
registerPTTEndpoint(app, aiRouter, sessions);

// Register Outlook / Microsoft 365 email channel if configured
if (process.env.OUTLOOK_CLIENT_ID || config.channels?.outlook) {
  registerOutlookWebhook(app, async (msg) => {
    return processMessage({ message: msg.content, agentId: 'default', userId: msg.userId, channel: 'outlook' });
  });
}

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  console.log(`[Gateway] New WS connection: ${clientId}`);

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' })); }

    // ── Handshake ──────────────────────────────────────────────────────────
    if (msg.type === 'handshake') {
      wsClients.set(clientId, {
        ws,
        role: msg.role || 'channel',
        userId: msg.userId || clientId,
        agentId: msg.agentId || 'default',
        channel: msg.channel || 'websocket',
      });
      ws.send(JSON.stringify({ type: 'handshake_ack', clientId, ok: true }));
      console.log(`[Gateway] Client registered: ${msg.channel || 'websocket'} / ${msg.userId}`);
      return;
    }

    // ── Message ────────────────────────────────────────────────────────────
    if (msg.type === 'message') {
      const client = wsClients.get(clientId);
      if (!client) {
        return ws.send(JSON.stringify({ type: 'error', error: 'Not registered. Send handshake first.' }));
      }

      // ── Slash commands (/new /reset /stop /help /model) ──────────────────
      const text = msg.content?.trim() || '';
      if (text.startsWith('/')) {
        const [cmd, ...args] = text.slice(1).split(' ');
        switch (cmd.toLowerCase()) {
          case 'new':
          case 'reset': {
            const sessionId = await sessions.getOrCreateSession(client.userId, client.agentId);
            await sessions.saveHistory(sessionId, []);
            ws.send(JSON.stringify({ type: 'message', content: '✓ Session cleared. Starting fresh.' }));
            return;
          }
          case 'skills':
            ws.send(JSON.stringify({ type: 'message', content: `**Skills:** ${skillEngine.listSkills().map(s => s.name).join(', ')}` }));
            return;
          case 'model': {
            const m = args[0];
            if (m) { config.ai = config.ai || {}; config.ai.defaultModel = m; ws.send(JSON.stringify({ type: 'message', content: `✓ Model set to: \`${m}\`` })); }
            else ws.send(JSON.stringify({ type: 'message', content: `Current model: \`${config.ai?.defaultModel || 'claude-sonnet-4-6'}\`` }));
            return;
          }
          case 'agent': {
            const newAgent = args[0];
            if (newAgent && agentLoader.getAgent(newAgent)) {
              wsClients.set(clientId, { ...client, agentId: newAgent });
              ws.send(JSON.stringify({ type: 'message', content: `✓ Switched to agent: @${newAgent}` }));
            } else {
              ws.send(JSON.stringify({ type: 'message', content: `Available: ${agentLoader.listAgents().map(a => `@${a.id}`).join(', ')}` }));
            }
            return;
          }
          case 'stop': {
            const aborted = commandQueue.abort(`${client.agentId}:${client.userId}`);
            ws.send(JSON.stringify({ type: 'message', content: `✓ Stop signal sent${aborted > 0 ? ` (${aborted} run(s) cancelled)` : ''}` }));
            return;
          }
          case 'context':
          case 'ctx': {
            const sessionId = await sessions.getOrCreateSession(client.userId, client.agentId);
            const history = await sessions.getHistory(sessionId) || [];
            const model = client.agent?.model || config.ai?.defaultModel || 'claude-sonnet-4-6';
            const ctxStatus = aiRouter.contextStatus(history, '', model);
            const usage = aiRouter.getTokenUsage();
            const cacheInfo = usage.cache ? ` · cache saved: ${usage.cache.saved_tokens?.toLocaleString() || 0}` : '';
            const bar = '█'.repeat(Math.floor(ctxStatus.percentFull / 5)) + '░'.repeat(20 - Math.floor(ctxStatus.percentFull / 5));
            const lines = [
              `**Context Window**`,
              `[${bar}] ${ctxStatus.percentFull}% (${ctxStatus.estimatedTokens.toLocaleString()} / ${ctxStatus.contextWindow.toLocaleString()} tokens)`,
              `Messages: ${ctxStatus.messages} · Model: ${model}`,
              `Auto-compact threshold: ${ctxStatus.threshold}%${ctxStatus.needsCompaction ? ' ⚠️ compaction recommended' : ''}`,
              `Tokens used session: ${(usage.total_input + usage.total_output).toLocaleString()}${cacheInfo}`,
              `Run /compact to summarize and free up space`,
            ];
            ws.send(JSON.stringify({ type: 'message', content: lines.join('\n') }));
            return;
          }
          case 'compact': {
            const sessionId = await sessions.getOrCreateSession(client.userId, client.agentId);
            const history = await sessions.getHistory(sessionId) || [];
            if (history.length < 6) {
              ws.send(JSON.stringify({ type: 'message', content: 'Nothing to compact yet (need at least 6 messages).' }));
              return;
            }
            const model = client.agent?.model || config.ai?.defaultModel;
            ws.send(JSON.stringify({ type: 'message', content: '⏳ Compacting history...' }));
            const result = await aiRouter.manualCompact(history, model);
            if (result.compactedCount > 0) {
              await sessions.saveHistory(sessionId, result.history);
              ws.send(JSON.stringify({ type: 'message', content: `✓ Compacted ${result.compactedCount} messages → ${result.history.length} total. Saved ~${result.savedTokens || '?'} tokens.\n\n**Summary:**\n${result.summary?.slice(0, 400) || '(no summary)'}` }));
            } else {
              ws.send(JSON.stringify({ type: 'message', content: 'History is short enough, no compaction needed.' }));
            }
            return;
          }
          case 'status': {
            const sessionId = await sessions.getOrCreateSession(client.userId, client.agentId);
            const history = await sessions.getHistory(sessionId) || [];
            ws.send(JSON.stringify({ type: 'message', content: `**Status**\nAgent: @${client.agentId}\nModel: ${config.ai?.defaultModel || '?'}\nSession: ${sessionId}\nMessages: ${history.length}\nGateway uptime: ${Math.round(process.uptime())}s` }));
            return;
          }
          case 'exec': {
            const setting = args.join(' ');
            ws.send(JSON.stringify({ type: 'message', content: `Exec settings: \`${setting || 'host=sandbox security=deny ask=on-miss'}\`\nUse REST POST /exec to run commands directly.` }));
            return;
          }
          case 'reasoning':
          case 'thinking':
            ws.send(JSON.stringify({ type: 'message', content: `Thinking level: auto (toggle not yet implemented in this session)` }));
            return;
          case 'send': {
            const policy = args[0];
            ws.send(JSON.stringify({ type: 'message', content: `Send policy: ${policy || 'on'} (set in config: session.sendPolicy)` }));
            return;
          }
          case 'help':
            ws.send(JSON.stringify({ type: 'message', content: [
              '**Slash Commands**',
              '`/new` · `/reset` — start fresh session',
              '`/stop` — abort current run',
              '`/model [name]` — show or switch model',
              '`/agent [id]` — switch agent',
              '`/skills` — list loaded skills',
              '`/context` · `/context list` — context window info',
              '`/compact` — summarize old context',
              '`/status` — session + gateway status',
              '`/exec` — show exec policy',
              '`/help` — this message',
            ].join('\n') }));
            return;
          default:
            // Unknown slash command — pass through to agent
            break;
        }
      }

      // Stream typing indicator
      ws.send(JSON.stringify({ type: 'typing', typing: true }));

      try {
        const response = await processMessage({
          message: msg.content,
          agentId: client.agentId,
          userId: client.userId,
          channel: client.channel,
          attachments: msg.attachments,
        });

        ws.send(JSON.stringify({
          type: 'message',
          content: response.content,
          sessionId: response.sessionId,
          model: response.model,
          toolsUsed: response.toolsUsed,
        }));
      } catch (err) {
        console.error('[Gateway] WS message error:', err.message);
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      } finally {
        ws.send(JSON.stringify({ type: 'typing', typing: false }));
      }
    }

    // ── Ping ───────────────────────────────────────────────────────────────
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    }
  });

  ws.on('close', () => {
    wsClients.delete(clientId);
    console.log(`[Gateway] Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error(`[Gateway] WS error for ${clientId}:`, err.message);
  });

  // Send welcome
  ws.send(JSON.stringify({ type: 'connected', clientId, message: 'OpenBot Gateway ready' }));
});

// ── Core Message Processor ───────────────────────────────────────────────────
async function processMessage({ message, agentId, userId, channel, attachments }) {
  const agent = agentLoader.getAgent(agentId) || agentLoader.getAgent('default');
  if (!agent) throw new Error(`Agent '${agentId}' not found`);

  // Load or create session
  const sessionId = await sessions.getOrCreateSession(userId, agentId);
  const history = await sessions.getHistory(sessionId);

  // Load memories relevant to this message
  const relevantMemories = await memory.search(message, 5);
  const memoryContext = relevantMemories.length > 0
    ? `\n\n## Your Memories (relevant context)\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  // Build system prompt from SOUL.md + memory context
  const systemPrompt = agent.systemPrompt + memoryContext;

  // Add user message to history
  history.push({ role: 'user', content: message });

  // Run AI + tools — pass message so SmartModelRouter can pick the right tier
  const result = await aiRouter.complete({
    systemPrompt,
    history,
    agent,
    userId,
    channel,
    sessionId,
    message,  // enables smart model routing
  });

  // Save assistant response to history
  history.push({ role: 'assistant', content: result.content });
  await sessions.saveHistory(sessionId, history);

  // Auto-extract memories if agent has memory skill
  if (agent.skills.includes('memory') && result.content) {
    await memory.autoExtract(message, result.content);
  }

  // Audit log
  audit.log({ userId, channel, agentId, message, response: result.content, toolsUsed: result.toolsUsed });

  return { ...result, sessionId };
}

// ── Broadcast to channel clients ─────────────────────────────────────────────
export function broadcastToUser(userId, payload) {
  for (const [, client] of wsClients) {
    if (client.userId === userId && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(payload));
    }
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
agentLoader.loadAll();
skillEngine.loadAll();
skillEngine.startHotReload(); // watch skills/ for changes — no restart needed
heartbeat.start();
cronScheduler.start();

// ── Anthropic prompt cache warming ───────────────────────────────────────────
// Anthropic's cache TTL is 5 minutes. We warm it every 4.5 min so the system
// prompt is always cached — first-token cost drops by ~90% on cache hits.
// This mirrors ClawdBot's "cache warming" strategy exactly.
{
  const CACHE_WARM_INTERVAL_MS = 4.5 * 60 * 1000; // 4.5 minutes
  const _doWarmCache = async () => {
    try {
      const defaultAgent = agentLoader.getAgent('default');
      const basePrompt = defaultAgent?.systemPrompt || 'You are OpenBot, a helpful AI assistant.';
      await aiRouter.warmCache(basePrompt, config.ai?.defaultModel);
    } catch { /* non-fatal */ }
  };
  // Initial warm 10 seconds after startup
  setTimeout(_doWarmCache, 10_000);
  // Recurring warm
  setInterval(_doWarmCache, CACHE_WARM_INTERVAL_MS);
  console.log('[CacheWarmer] Anthropic prompt cache warming enabled (every 4.5 min)');
}

// Hot-reload openbot.json config
watchConfig(newConfig => {
  Object.assign(config, { ...config, ...newConfig, ai: { ...config.ai, ...newConfig.ai } });
  if (newConfig.channels?.dmPolicy) pairing.setPolicy(newConfig.channels.dmPolicy);
});

// Wake word → trigger default agent with push-to-talk prompt
wakeWord.on('wake', async ({ engine }) => {
  console.log(`[WakeWord] Triggered via ${engine} — opening push-to-talk session`);
  // Broadcast wake event to all connected UI clients
  for (const [, client] of wsClients) {
    if (client.ws?.readyState === 1) {
      client.ws.send(JSON.stringify({ type: 'wake-word', engine }));
    }
  }
});

httpServer.listen(PORT, HOST, async () => {
  console.log(`\nOpenBot Gateway running at ws://${HOST}:${PORT}`);
  console.log(`   REST API: http://${HOST}:${PORT}`);
  console.log(`   Health:   http://${HOST}:${PORT}/health`);
  console.log(`   Agents:   ${agentLoader.agentCount()} loaded`);
  console.log(`   Skills:   ${skillEngine.skillCount()} loaded`);
  console.log(`   MCP:      ${mcpClient.listServers().length} server(s)`);
  console.log(`   Model:    ${config.ai?.defaultModel || 'not configured'}\n`);

  // Tailscale: expose via `tailscale serve` if configured
  if (config.gateway?.tailscale || process.argv.includes('--tailscale')) {
    _startTailscaleServe(PORT).catch(() => {});
  }
});

async function _startTailscaleServe(port) {
  const { execSync: exec } = await import('child_process');
  try {
    exec(`tailscale serve --bg http ${port}`, { stdio: 'pipe' });
    const status = exec('tailscale status --json', { stdio: 'pipe', encoding: 'utf-8' });
    const parsed = JSON.parse(status);
    const hostname = parsed.Self?.DNSName?.replace(/\.$/, '');
    if (hostname) {
      console.log(`[Tailscale] Serve enabled → https://${hostname}`);
    }
  } catch (e) {
    console.warn('[Tailscale] Could not start tailscale serve:', e.message);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
process.on('SIGINT',  () => { httpServer.close(); process.exit(0); });
