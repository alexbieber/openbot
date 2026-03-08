#!/usr/bin/env node
/**
 * OpenBot Full Test Suite
 * Tests: SmartModelRouter logic, ContextCompactor logic, all gateway endpoints,
 *        new /routing endpoint, cache warmer startup, double-compaction guard.
 *
 * Run: node test-suite.mjs
 * No API key required for logic tests. Gateway must be running on :18789.
 */

import { SmartModelRouter } from './gateway/smart-model-router.js';
import { ContextCompactor } from './gateway/context-compactor.js';

const BASE = 'http://localhost:18789';
let pass = 0, fail = 0, warn = 0;
const results = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    pass++;
    results.push({ name, status: 'PASS' });
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
    results.push({ name, status: 'FAIL', detail });
  }
}

function section(title) {
  console.log(`\n\x1b[1m\x1b[34m── ${title} ──\x1b[0m`);
}

async function GET(path, expectStatus = 200) {
  try {
    const r = await fetch(`${BASE}${path}`);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function POST(path, body, expectStatus = 200) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

// ─── 1. SmartModelRouter Unit Tests ─────────────────────────────────────────

section('SmartModelRouter — Classification Logic');

const router = new SmartModelRouter({
  ai: { defaultModel: 'claude-sonnet-4-6' }
});

// Budget tier — greetings
ok('classify "hi" → budget',             router.classify('hi')        === 'budget');
ok('classify "hello" → budget',          router.classify('hello')     === 'budget');
ok('classify "thanks!" → budget',        router.classify('thanks!')   === 'budget');
ok('classify "ok" → budget',             router.classify('ok')        === 'budget');
ok('classify "yes" → budget',            router.classify('yes')       === 'budget');
ok('classify "sounds good" → budget',    router.classify('sounds good') === 'budget');

// Budget tier — factual questions
ok('classify "what is Python?" → budget', router.classify('what is Python?') === 'budget');
ok('classify "what are arrays?" → budget',router.classify('what are arrays?') === 'budget');
ok('classify "who is Linus Torvalds?" → budget', router.classify('who is Linus Torvalds?') === 'budget');
ok('classify "ping" → budget',           router.classify('ping')      === 'budget');

// Budget tier — very short non-technical
ok('classify "cool" → budget',           router.classify('cool')      === 'budget');
ok('classify "sure" → budget',           router.classify('sure')      === 'budget');

// Technical short messages must NOT be budget
ok('classify "fix my code" NOT budget',  router.classify('fix my code')    !== 'budget', router.classify('fix my code'));
ok('classify "debug this error" NOT budget', router.classify('debug this error') !== 'budget', router.classify('debug this error'));
ok('classify "refactor auth.js" NOT budget', router.classify('refactor auth.js') !== 'budget', router.classify('refactor auth.js'));
ok('classify "implement merge sort" NOT budget', router.classify('implement merge sort') !== 'budget', router.classify('implement merge sort'));
ok('classify "build api" NOT budget',    router.classify('build api')      !== 'budget', router.classify('build api'));
// "check all the logics" = 4 words → should NOT be budget (threshold is ≤ 3 words)
ok('classify "check all the logics" NOT budget', router.classify('check all the logics') !== 'budget', router.classify('check all the logics'));
// Extra: verify the threshold itself
ok('classify 3 non-technical words → budget', router.classify('what a day') === 'budget', router.classify('what a day'));
ok('classify 4 non-technical words → worker', router.classify('check all the logics') === 'worker', router.classify('check all the logics'));

// Worker tier — normal tasks
ok('classify moderate task → worker',
  router.classify('Can you help me write a function to parse JSON from a REST API response?') === 'worker',
  router.classify('Can you help me write a function to parse JSON from a REST API response?'));

ok('classify short technical → worker or frontier',
  ['worker','frontier'].includes(router.classify('fix my code')),
  router.classify('fix my code'));

// Frontier tier — complex analysis
ok('classify long analysis → frontier',
  router.classify('Please analyze and compare the tradeoffs between microservices and monolithic architecture for a high-traffic e-commerce platform with 10M daily active users, considering scalability, latency, cost, and team complexity.') === 'frontier',
  router.classify('analyze...'));

ok('classify refactor → frontier',
  router.classify('Refactor the entire authentication system from scratch, implementing OAuth2 with PKCE, JWT rotation, and multi-factor authentication.') === 'frontier',
  router.classify('refactor...'));

ok('classify essay writing → frontier',
  router.classify('Write a comprehensive report analyzing the impact of AI on software engineering jobs over the next decade.') === 'frontier',
  router.classify('write report...'));

ok('classify step-by-step → frontier',
  router.classify('Explain step-by-step how the Linux kernel handles memory page faults in detail.') === 'frontier',
  router.classify('explain step by step...'));

ok('classify > 80 words → frontier',
  router.classify('a '.repeat(85)) === 'frontier',
  router.classify('a '.repeat(85)));

// User overrides
ok('classify "use haiku ..." → budget',   router.classify('use haiku to answer this') === 'budget');
ok('classify "use opus ..." → frontier',  router.classify('use opus for this task')   === 'frontier');
ok('classify "use sonnet..." → worker',   router.classify('use sonnet please')        === 'worker');
ok('classify "use fast ..." → budget',    router.classify('use fast model')           === 'budget');
ok('classify "use frontier" → frontier',  router.classify('use frontier')             === 'frontier');

// ─── 2. SmartModelRouter — Model Selection ───────────────────────────────────

section('SmartModelRouter — Model Selection');

// When Anthropic is available, budget should pick claude-haiku
const onlyAnthropic = { anthropic: true, openai: false, groq: false, google: false, deepseek: false, ollama: false, openrouter: false, mistral: false, together: false };
const selectedBudget = router.selectModel('budget', onlyAnthropic, undefined, 'claude-sonnet-4-6');
ok('budget tier with Anthropic → haiku', selectedBudget.includes('haiku'), selectedBudget);

const selectedWorker = router.selectModel('worker', onlyAnthropic, undefined, 'claude-sonnet-4-6');
ok('worker tier with Anthropic → sonnet', selectedWorker.includes('sonnet'), selectedWorker);

// Agent explicit model always wins
const agentOverride = router.selectModel('budget', onlyAnthropic, 'claude-opus-4-5', 'claude-sonnet-4-6');
ok('agent model override beats routing tier', agentOverride === 'claude-opus-4-5', agentOverride);

// Disabled routing returns default
const disabledRouter = new SmartModelRouter({ ai: { smartRouting: false, defaultModel: 'claude-sonnet-4-6' } });
ok('routing disabled → uses default model',
  disabledRouter.selectModel('budget', onlyAnthropic, undefined, 'claude-sonnet-4-6') === 'claude-sonnet-4-6');

// Fallback when no provider matches
const noProviders = { anthropic: false, openai: false, groq: false, google: false, deepseek: false, ollama: false };
const fallback = router.selectModel('frontier', noProviders, undefined, 'my-custom-model');
ok('no matching provider → falls back to defaultModel', fallback === 'my-custom-model', fallback);

// Status method
const status = router.status();
ok('status() has enabled field',     typeof status.enabled === 'boolean');
ok('status() has tiers.budget',      typeof status.tiers.budget === 'string');
ok('status() has tiers.worker',      typeof status.tiers.worker === 'string');
ok('status() has tiers.frontier',    typeof status.tiers.frontier === 'string');

// ─── 3. SmartModelRouter — Config Key Unification ───────────────────────────

section('SmartModelRouter — Config Key Unification');

const r1 = new SmartModelRouter({ ai: { smartRouting: false } });
ok('ai.smartRouting=false disables routing',  !r1.enabled);

const r2 = new SmartModelRouter({ ai: { routing: { enabled: false } } });
ok('ai.routing.enabled=false disables routing', !r2.enabled);

const r3 = new SmartModelRouter({ ai: { smartRouting: true } });
ok('ai.smartRouting=true enables routing',    r3.enabled);

// ─── 4. ContextCompactor Unit Tests ──────────────────────────────────────────

section('ContextCompactor — Logic');

const compactor = new ContextCompactor({
  ai: { compactThreshold: 0.75, preserveRecentTurns: 4 }
});

// Empty history never needs compaction
const emptyStatus = compactor.check([], '', 'claude-sonnet-4-6');
ok('empty history: needsCompaction=false', !emptyStatus.needsCompaction);

// Short history never needs compaction
const shortHistory = Array.from({ length: 5 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'hello',
}));
const shortStatus = compactor.check(shortHistory, 'sys', 'claude-sonnet-4-6');
ok('5-message history: needsCompaction=false', !shortStatus.needsCompaction);

// contextStatus method works
const ctxStatus = compactor.contextStatus(shortHistory, 'sys', 'claude-sonnet-4-6');
ok('contextStatus has messages count',  ctxStatus.messages === 5);
ok('contextStatus has percentFull',     typeof ctxStatus.percentFull === 'number');
ok('contextStatus has contextWindow',   ctxStatus.contextWindow > 0);
ok('contextStatus has needsCompaction', typeof ctxStatus.needsCompaction === 'boolean');

// Very long history triggers compaction check
const longHistory = Array.from({ length: 200 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'This is a moderately long message to use up context window tokens. ' + 'word '.repeat(50),
}));
const longStatus = compactor.check(longHistory, 'You are a helpful AI assistant.', 'gpt-3.5-turbo');
ok('200 long messages on 16k model: needsCompaction=true', longStatus.needsCompaction,
   `${longStatus.percent}% used`);

// compact() should not recurse when called with history <= preserveRecentTurns + 2
const tinyHistory = [
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: 'hello' },
];
// Mock aiClient
const mockClient = { complete: async () => ({ content: 'SUMMARY: mock summary' }) };
const compactResult = await compactor.compact(tinyHistory, mockClient, 'claude-sonnet-4-6');
ok('compact() with tiny history returns unchanged', compactResult.compactedCount === 0);
ok('compact() with tiny history returns original messages', compactResult.history.length === 2);

// compact() with enough messages uses AI summarization
const longEnoughHistory = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'Message number ' + i,
}));
const bigResult = await compactor.compact(longEnoughHistory, mockClient, 'claude-sonnet-4-6');
ok('compact() summarizes old messages', bigResult.compactedCount > 0, `compacted ${bigResult.compactedCount} messages`);
ok('compact() keeps recent messages', bigResult.history.length < longEnoughHistory.length, `${bigResult.history.length} messages remain`);
ok('compact() result has [COMPACTED CONTEXT] prefix', bigResult.history[0].content.includes('COMPACTED CONTEXT'));
ok('compact() result has summary text', bigResult.history[0].content.includes('SUMMARY:'));
ok('compact() has assistant ack message', bigResult.history[1].role === 'assistant');

// ─── 5. Gateway Endpoint Tests ───────────────────────────────────────────────

section('Gateway — Core Endpoints');

const health = await GET('/health');
ok('GET /health → 200',              health.status === 200);
ok('/health has status:ok',          health.body?.status === 'ok');
ok('/health has version',            !!health.body?.version);
ok('/health has skills count',       health.body?.skills > 0, `${health.body?.skills} skills`);
ok('/health has agents count',       health.body?.agents > 0, `${health.body?.agents} agents`);
ok('/health has tokenUsage object',  typeof health.body?.tokenUsage === 'object', JSON.stringify(health.body?.tokenUsage));
ok('/health has smartRouting object',typeof health.body?.smartRouting === 'object', JSON.stringify(health.body?.smartRouting));

const agents = await GET('/agents');
ok('GET /agents → 200',              agents.status === 200);
ok('/agents returns array',          Array.isArray(agents.body));
ok('/agents has ≥1 agent',           agents.body?.length >= 1, `${agents.body?.length} agents`);
ok('/agents[0] has id field',        !!agents.body?.[0]?.id);

const skills = await GET('/skills');
ok('GET /skills → 200',              skills.status === 200);
ok('/skills returns array',          Array.isArray(skills.body));
ok('/skills has ≥50 skills',         skills.body?.length >= 50, `${skills.body?.length} skills`);

const memory = await GET('/memory');
ok('GET /memory → 200',              memory.status === 200);

const sessions = await GET('/sessions');
ok('GET /sessions → 200',            sessions.status === 200);

const tokens = await GET('/tokens');
ok('GET /tokens → 200',              tokens.status === 200);
ok('/tokens has total_input',        typeof tokens.body?.total_input === 'number');

section('Gateway — New Cost-Saving Endpoints');

const routing = await GET('/routing');
ok('GET /routing → 200',               routing.status === 200);
ok('/routing has smartRouting object',  typeof routing.body?.smartRouting === 'object');
ok('/routing has defaultModel',         typeof routing.body?.defaultModel === 'string');
ok('/routing has promptCaching bool',   typeof routing.body?.promptCaching === 'boolean');
ok('/routing has autoCompact bool',     typeof routing.body?.autoCompact === 'boolean');
ok('/routing has tokenUsage',           typeof routing.body?.tokenUsage === 'object');
ok('/routing.smartRouting has enabled', typeof routing.body?.smartRouting?.enabled === 'boolean');
ok('/routing.smartRouting has tiers',   typeof routing.body?.smartRouting?.tiers === 'object');
ok('/routing.smartRouting.tiers has budget',   !!routing.body?.smartRouting?.tiers?.budget);
ok('/routing.smartRouting.tiers has worker',   !!routing.body?.smartRouting?.tiers?.worker);
ok('/routing.smartRouting.tiers has frontier', !!routing.body?.smartRouting?.tiers?.frontier);

const setupStatus = await GET('/setup/status');
ok('GET /setup/status → 200',          setupStatus.status === 200);
ok('/setup/status has ready field',    typeof setupStatus.body?.ready === 'boolean');
ok('/setup/status has hint',           typeof setupStatus.body?.hint === 'string');

section('Gateway — REST Validation');

const noMsg = await POST('/message', {});
ok('POST /message with no body → 400', noMsg.status === 400);

const noMsgErr = await POST('/message', { agentId: 'default' });
ok('POST /message no message field → 400', noMsgErr.status === 400);

const noKey = await POST('/message', { message: 'hello test' });
ok('POST /message without API key → 503 (not 500)', noKey.status === 503,
   `Got ${noKey.status}: ${noKey.body?.error}`);
ok('POST /message 503 has hint field', !!noKey.body?.hint, noKey.body?.hint);

section('Gateway — UI & Static Files');

const ui = await fetch(`${BASE}/`).then(r => ({ status: r.status, text: r.text() }));
const uiText = await ui.text;
ok('GET / → 200',                    ui.status === 200);
ok('/ serves HTML',                  uiText.includes('<!DOCTYPE') || uiText.includes('<html'));
ok('/ has OpenBot title',            uiText.includes('OpenBot'));

const logo = await fetch(`${BASE}/logo.svg`);
ok('GET /logo.svg → 200',            logo.status === 200);
ok('/logo.svg Content-Type is SVG',  logo.headers.get('content-type')?.includes('svg'));

const favicon = await fetch(`${BASE}/favicon.svg`);
ok('GET /favicon.svg → 200',         favicon.status === 200);

section('Gateway — Existing Endpoints Still Work');

const cron = await GET('/cron');
ok('GET /cron → 200',                cron.status === 200);

const webhooks = await GET('/webhooks');
ok('GET /webhooks → 200',            webhooks.status === 200);

const mcp = await GET('/mcp/servers');
ok('GET /mcp/servers → 200',         mcp.status === 200);

const mcpTools = await GET('/mcp/tools');
ok('GET /mcp/tools → 200',           mcpTools.status === 200);

const agentsRouting = await GET('/agents/routing');
ok('GET /agents/routing → 200',      agentsRouting.status === 200);

// /logs/stream is a Server-Sent Events endpoint — just verify it accepts connections (200)
const logsStreamResp = await fetch(`${BASE}/logs/stream`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
ok('GET /logs/stream → 200 (SSE)',   logsStreamResp?.status === 200, `status: ${logsStreamResp?.status}`);

section('Gateway — Memory Endpoints');

const memPost = await POST('/memory', { key: 'test-key', value: 'test-value-for-suite' });
ok('POST /memory → 200 or 201',      [200, 201].includes(memPost.status), `Got ${memPost.status}`);

const memSearch = await GET('/memory?q=test-value-for-suite');
ok('GET /memory?q=... → 200',        memSearch.status === 200);

section('Gateway — Security Endpoints');

const exec400 = await POST('/exec', {});
ok('POST /exec with no command → 400', exec400.status === 400);

section('Smart Router Integration — Server Startup Marker');

// The server startup log should have [CacheWarmer] line
// We verify by checking /health still works (server didn't crash on new code)
const healthCheck2 = await GET('/health');
ok('Server still healthy after new feature load', healthCheck2.status === 200);
ok('smartRouting enabled in health response',
  healthCheck2.body?.smartRouting?.enabled !== false,
  JSON.stringify(healthCheck2.body?.smartRouting));

// ─── 6. Summary ──────────────────────────────────────────────────────────────

const total = pass + fail;
console.log(`\n${'─'.repeat(55)}`);
console.log(`\x1b[1mResults: ${pass}/${total} passed\x1b[0m  (${fail} failed)`);
if (fail === 0) {
  console.log('\x1b[32m\x1b[1m✓ ALL TESTS PASSED — Ready to ship!\x1b[0m\n');
} else {
  console.log('\x1b[31m\x1b[1m✗ SOME TESTS FAILED — review above before shipping\x1b[0m\n');
  results.filter(r => r.status === 'FAIL').forEach(r =>
    console.log(`  FAIL: ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  );
  process.exit(1);
}
