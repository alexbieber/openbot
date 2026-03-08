/**
 * SmartModelRouter — Mirrors ClawdBot's task-based model tiering.
 *
 * Rather than using the same expensive model for every message,
 * this router classifies task complexity and picks the cheapest model
 * that can handle it — exactly how ClawdBot cuts costs by 50-70%.
 *
 * Tiers (configurable in openbot.json → ai.routing):
 *   budget   — quick lookups, greetings, simple Q&A        ($0.10-0.60 / 1M tokens)
 *   worker   — multi-step tasks, moderate reasoning         ($0.60-3.00 / 1M tokens)
 *   frontier — complex analysis, long code, deep reasoning  ($3.00-15.00 / 1M tokens)
 *
 * Classification uses fast heuristics (no extra API call):
 *   - Token estimate of message
 *   - Presence of code blocks, multi-step language, analysis keywords
 *   - Explicit user override: "use haiku", "use opus" etc.
 */

// ── Default model tiers ───────────────────────────────────────────────────────
// Each tier lists models in preference order.
// The router picks the first model whose provider client is available.
const DEFAULT_TIERS = {
  budget: [
    'claude-haiku-3-5',       // Anthropic Haiku — cheapest Claude
    'gemini-2.0-flash',       // Google Flash — very cheap
    'groq/llama-3.1-8b-instant', // Groq — near-zero cost
    'gpt-4o-mini',            // OpenAI mini
    'deepseek-chat',          // DeepSeek — extremely cheap
    'ollama/llama3',          // Local — free
  ],
  worker: [
    'claude-sonnet-4-6',      // Anthropic Sonnet — default
    'gpt-4o',                 // OpenAI GPT-4o
    'gemini-2.5-flash',       // Google Flash (capable)
    'deepseek-chat',          // DeepSeek
    'groq/llama-3.3-70b-versatile',
  ],
  frontier: [
    'claude-opus-4-5',        // Anthropic Opus — max reasoning
    'gpt-4o',                 // OpenAI GPT-4o
    'gemini-2.5-pro',         // Google Pro
    'claude-sonnet-4-6',      // Fallback to sonnet
  ],
};

// ── Complexity signals ────────────────────────────────────────────────────────
const FRONTIER_PATTERNS = [
  /write.*\b(essay|report|document|proposal|thesis|plan|analysis)\b/i,
  /\b(analyze|analyse|compare.*contrast|deep.*dive|comprehensive|investigate|research)\b/i,
  /\b(debug|refactor|architect|design.*system|implement.*from.*scratch)\b/i,
  /```[\s\S]{200,}```/,                    // Long code block
  /\b(step.*by.*step|detailed|thorough|extensive)\b/i,
  /\n.*\n.*\n.*\n/,                         // 4+ newlines = long structured message
  /\b(pros.*cons|tradeoffs?|decision.*framework)\b/i,
  /explain.*why|how.*exactly|in.*depth/i,
];

const BUDGET_PATTERNS = [
  // Pure greetings / acknowledgements — never need a smart model
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|understood|great|awesome|cool|perfect|sounds good)[\s!?.]*$/i,
  // Simple factual questions (no code / no task implied)
  /^what (is|are|was|were) [a-zA-Z\s]{3,50}\??$/i,
  /^(who is|when (was|did|is)|where is|what time|how (many|much|old)) .{1,50}\??$/i,
  // Simple unit / math conversions
  /^(convert|calculate|compute|what'?s) [a-zA-Z0-9\s+\-*/.]{3,50}[?]?$/i,
  // Ping / status checks
  /^(ping|are you (there|alive|ready)|test|hello world)[\s!?]*$/i,
];

// Sub-agent / background work — only for clearly lightweight operations
const SUBAGENT_PATTERNS = [
  /^(summarize|summary of|tldr):?\s+/i,          // "summarize: ..." with content following
  /^translate (this |the )?(following )?text/i,   // explicit translation requests
];

export class SmartModelRouter {
  constructor(config = {}) {
    this.config = config;
    // Allow full override in openbot.json → ai.routing
    const routingCfg = config.ai?.routing || {};
    this.tiers = {
      budget:   routingCfg.budgetModels   || DEFAULT_TIERS.budget,
      worker:   routingCfg.workerModels   || DEFAULT_TIERS.worker,
      frontier: routingCfg.frontierModels || DEFAULT_TIERS.frontier,
    };
    // Support both `ai.routing.enabled` and top-level `ai.smartRouting`
    const topLevel = config.ai?.smartRouting;
    this.enabled = topLevel !== undefined ? topLevel !== false
      : routingCfg.enabled !== false; // on by default
    this.logDecisions = routingCfg.logDecisions !== false;
  }

  /**
   * Classify the complexity of a message.
   * @param {string} message
   * @param {string[]} history — recent messages for context
   * @returns {'budget'|'worker'|'frontier'}
   */
  classify(message, history = []) {
    const msg = (message || '').trim();

    // Explicit model override in message: "use opus", "use haiku", etc.
    const explicitModel = this._extractModelOverride(msg);
    if (explicitModel) return explicitModel;

    // Budget signals
    for (const pattern of BUDGET_PATTERNS) {
      if (pattern.test(msg)) return 'budget';
    }
    for (const pattern of SUBAGENT_PATTERNS) {
      if (pattern.test(msg)) return 'budget';
    }

    // Frontier signals
    for (const pattern of FRONTIER_PATTERNS) {
      if (pattern.test(msg)) return 'frontier';
    }

    // Length-based heuristic — only use word count for clear extremes.
    // Short messages can still be complex (e.g. "implement merge sort", "refactor auth"),
    // so we only use very short (≤ 4 words) as a budget signal if the message contains
    // no technical keywords.
    const words = msg.split(/\s+/).length;
    const hasTechnicalWords = /\b(code|function|class|method|file|bug|error|test|api|database|auth|module|refactor|implement|build|create|deploy|fix|debug|optimize|performance)\b/i.test(msg);

    if (words <= 3 && !hasTechnicalWords) return 'budget';
    if (words > 80) return 'frontier';

    // History length: long conversations have built up complex context
    if (history.length > 30) return 'worker';

    return 'worker'; // Safe default
  }

  /**
   * Select the best available model for a given tier.
   * Checks which provider clients are configured.
   * @param {'budget'|'worker'|'frontier'} tier
   * @param {object} availableProviders — map of provider name → boolean
   * @param {string} [agentModel] — agent's explicit model override
   * @param {string} [defaultModel] — config default model
   * @returns {string} model name to use
   */
  selectModel(tier, availableProviders, agentModel, defaultModel) {
    // If the agent has an explicit model set, always use it
    if (agentModel && agentModel !== 'auto') return agentModel;

    // If routing is disabled, use default
    if (!this.enabled) return defaultModel || 'claude-sonnet-4-6';

    const candidates = this.tiers[tier] || this.tiers.worker;
    for (const model of candidates) {
      const provider = this._modelToProvider(model);
      if (availableProviders[provider]) {
        return model;
      }
    }

    // No matching provider found — fall back to default
    return defaultModel || 'claude-sonnet-4-6';
  }

  /**
   * Main entry: given a message and router context, return the model to use.
   */
  route({ message, history = [], agentModel, defaultModel, availableProviders }) {
    const tier = this.classify(message, history);
    const model = this.selectModel(tier, availableProviders, agentModel, defaultModel);

    if (this.logDecisions) {
      const words = (message || '').split(/\s+/).length;
      console.log(`[SmartRouter] ${words}w msg → tier:${tier} → model:${model}`);
    }

    return { tier, model };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _extractModelOverride(msg) {
    const lc = msg.toLowerCase();
    // Explicit model family mentions → map to tier (checked in specificity order)
    if (/\buse (claude.?opus|opus)\b/.test(lc))           return 'frontier';
    if (/\buse (claude.?haiku|haiku)\b/.test(lc))         return 'budget';
    if (/\buse (claude.?sonnet|sonnet)\b/.test(lc))       return 'worker';
    if (/\buse (gpt.?4o.?mini|4o.?mini)\b/.test(lc))     return 'budget';
    if (/\buse (gpt.?4o|gpt.?4|o3|o1)\b/.test(lc))       return 'frontier';
    if (/\buse (fast|quick|cheap|budget)\b/.test(lc))     return 'budget';
    if (/\buse (best|smartest|powerful|frontier)\b/.test(lc)) return 'frontier';
    return null;
  }

  _modelToProvider(model) {
    const m = model.toLowerCase();
    if (m.includes('claude'))        return 'anthropic';
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'openai';
    if (m.includes('gemini'))        return 'google';
    if (m.includes('deepseek'))      return 'deepseek';
    if (m.includes('groq/'))         return 'groq';
    if (m.includes('ollama/'))       return 'ollama';
    if (m.includes('openrouter/'))   return 'openrouter';
    if (m.includes('mistral') || m.includes('codestral')) return 'mistral';
    if (m.includes('gemma'))         return 'groq';
    return 'anthropic'; // default
  }

  /** Return a summary of the current routing config for the UI/CLI */
  status() {
    return {
      enabled: this.enabled,
      tiers: {
        budget:   this.tiers.budget[0],
        worker:   this.tiers.worker[0],
        frontier: this.tiers.frontier[0],
      },
    };
  }
}
