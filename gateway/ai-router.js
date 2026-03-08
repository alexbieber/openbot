/**
 * AI Router
 * Dynamically routes to Anthropic, OpenAI, DeepSeek, or Ollama.
 * Handles tool calls, streaming, and provider failover.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { ContextCompactor } from './context-compactor.js';
import { SmartModelRouter } from './smart-model-router.js';

const PROVIDER_MAP = {
  // Groq
  'llama-3': 'groq',
  'llama3': 'groq',
  'mixtral': 'groq',
  'gemma': 'groq',
  'groq/': 'groq',
  'whisper-large': 'groq',
  // xAI / Grok
  'grok': 'xai',
  'grok-2': 'xai',
  'grok-3': 'xai',
  'xai/': 'xai',
  // Cerebras
  'cerebras/': 'cerebras',
  'llama3.1-8b': 'cerebras',
  'llama3.1-70b': 'cerebras',
  // LM Studio
  'lmstudio/': 'lmstudio',
  'lm-studio/': 'lmstudio',
  // Jan.ai
  'jan/': 'jan',
  // Google Gemini
  'gemini': 'google',
  'gemini-3': 'google',
  'gemini-3-pro': 'google',
  'gemini-3.1-pro': 'google',
  'gemini-3-flash': 'google',
  'gemini-3.1-flash': 'google',
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.0-flash': 'google',
  'gemini-1.5-pro': 'google',
  'gemini-1.5-flash': 'google',
  'gemini-pro': 'google',
  'google/gemini': 'google',
  // Anthropic
  'claude': 'anthropic',
  'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku': 'anthropic',
  // OpenAI
  'gpt-4o': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4': 'openai',
  'gpt-3.5-turbo': 'openai',
  'gpt-5': 'openai',
  'gpt-5.3': 'openai',
  'o1': 'openai',
  'o3': 'openai',
  // DeepSeek
  'deepseek-chat': 'deepseek',
  'deepseek-reasoner': 'deepseek',
  // Chinese models via OpenRouter
  'kimi': 'openrouter',
  'moonshot': 'openrouter',
  'glm': 'openrouter',
  'minimax': 'openrouter',
  // OpenRouter (any model via openrouter.ai)
  'openrouter/': 'openrouter',
  'meta-llama/': 'openrouter',
  'mistralai/': 'openrouter',
  'google/': 'openrouter',
  'cohere/': 'openrouter',
  'qwen/': 'openrouter',
  // Ollama
  'ollama': 'ollama',
  'ollama/': 'ollama',
  // Mistral
  'mistral': 'mistral',
  'codestral': 'mistral',
  // Perplexity
  'sonar': 'perplexity',
  'llama-3.1-sonar': 'perplexity',
  // Venice
  'venice/': 'venice',
  // vLLM
  'vllm/': 'vllm',
  // Qwen
  'qwen': 'qwen',
  'qwen2': 'qwen',
  // GitHub Models / Copilot
  'github/': 'github',
  'phi-': 'github',
  // Amazon Bedrock
  'bedrock/': 'bedrock',
  'amazon.': 'bedrock',
  'anthropic.claude': 'bedrock',
  // HuggingFace
  'hf/': 'huggingface',
  'huggingface/': 'huggingface',
  // MiniMax
  'minimax': 'minimax',
  'abab': 'minimax',
  // GLM / Zhipu
  'glm-': 'glm',
  'chatglm': 'glm',
  // Moonshot / Kimi
  'moonshot-': 'moonshot',
  'kimi': 'moonshot',
  // NVIDIA
  'nvidia/': 'nvidia',
  'nv-mistral': 'nvidia',
  // LiteLLM proxy
  'litellm/': 'litellm',
  // Together AI
  'together/': 'together',
  // Z.AI
  'zai/': 'zai',
  // Cloudflare
  'cloudflare/': 'cloudflare',
  '@cf/': 'cloudflare',
  // Vercel AI Gateway
  'vercel/': 'vercel',
};

export class AIRouter {
  constructor(config, skillEngine, memory) {
    this.config = config;
    this.skillEngine = skillEngine;
    this.memory = memory;
    this.clients = {};
    this.tokenUsage = { total_input: 0, total_output: 0, by_model: {} };
    this.compactor = new ContextCompactor(config);
    this.smartRouter = new SmartModelRouter(config);
    this._initClients();
  }

  _trackTokens(model, input, output) {
    this.tokenUsage.total_input += input || 0;
    this.tokenUsage.total_output += output || 0;
    if (!this.tokenUsage.by_model[model]) {
      this.tokenUsage.by_model[model] = { input: 0, output: 0, calls: 0 };
    }
    this.tokenUsage.by_model[model].input += input || 0;
    this.tokenUsage.by_model[model].output += output || 0;
    this.tokenUsage.by_model[model].calls += 1;
  }

  getTokenUsage() { return this.tokenUsage; }

  _trackCacheHit(model, cacheRead, cacheWrite) {
    if (!this.tokenUsage.cache) this.tokenUsage.cache = { reads: 0, writes: 0, saved_tokens: 0 };
    this.tokenUsage.cache.reads += cacheRead || 0;
    this.tokenUsage.cache.writes += cacheWrite || 0;
    this.tokenUsage.cache.saved_tokens += cacheRead || 0;
  }

  _initClients() {
    const { ai } = this.config;
    if (ai?.anthropicApiKey) {
      this.clients.anthropic = new Anthropic({ apiKey: ai.anthropicApiKey });
    }
    if (ai?.openaiApiKey) {
      this.clients.openai = new OpenAI({ apiKey: ai.openaiApiKey });
    }
    // DeepSeek uses OpenAI-compatible API
    if (ai?.deepseekApiKey) {
      this.clients.deepseek = new OpenAI({
        apiKey: ai.deepseekApiKey,
        baseURL: 'https://api.deepseek.com/v1',
      });
    }
    // OpenRouter — access 200+ models via one key
    if (ai?.openrouterApiKey) {
      this.clients.openrouter = new OpenAI({
        apiKey: ai.openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/openbot/openbot',
          'X-Title': 'OpenBot',
        },
      });
    }
    // Kimi (Moonshot AI)
    if (ai?.kimiApiKey) {
      this.clients.kimi = new OpenAI({
        apiKey: ai.kimiApiKey,
        baseURL: 'https://api.moonshot.cn/v1',
      });
    }
    // GLM (Zhipu AI)
    if (ai?.glmApiKey) {
      this.clients.glm = new OpenAI({
        apiKey: ai.glmApiKey,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      });
    }
    // MiniMax
    if (ai?.minimaxApiKey) {
      this.clients.minimax = new OpenAI({
        apiKey: ai.minimaxApiKey,
        baseURL: 'https://api.minimax.chat/v1',
      });
    }

    if (ai?.mistralApiKey || process.env.MISTRAL_API_KEY) {
      this.clients.mistral = new OpenAI({ apiKey: ai?.mistralApiKey || process.env.MISTRAL_API_KEY, baseURL: 'https://api.mistral.ai/v1' });
    }
    if (ai?.perplexityApiKey || process.env.PERPLEXITY_API_KEY) {
      this.clients.perplexity = new OpenAI({ apiKey: ai?.perplexityApiKey || process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' });
    }
    if (ai?.veniceApiKey || process.env.VENICE_API_KEY) {
      this.clients.venice = new OpenAI({ apiKey: ai?.veniceApiKey || process.env.VENICE_API_KEY, baseURL: 'https://api.venice.ai/api/v1' });
    }
    if (ai?.vllmBaseUrl || process.env.VLLM_BASE_URL) {
      this.clients.vllm = new OpenAI({ apiKey: ai?.vllmApiKey || process.env.VLLM_API_KEY || 'no-key', baseURL: ai?.vllmBaseUrl || process.env.VLLM_BASE_URL });
    }
    if (ai?.qwenApiKey || process.env.QWEN_API_KEY) {
      this.clients.qwen = new OpenAI({ apiKey: ai?.qwenApiKey || process.env.QWEN_API_KEY, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });
    }
    if (process.env.GITHUB_TOKEN_MODELS || ai?.githubToken) {
      this.clients.github = new OpenAI({ apiKey: ai?.githubToken || process.env.GITHUB_TOKEN_MODELS, baseURL: 'https://models.inference.ai.azure.com' });
    }
    // Amazon Bedrock (via openai-compatible endpoint or direct)
    if (ai?.bedrockAccessKey || process.env.AWS_ACCESS_KEY_ID) {
      // Route via AWS Bedrock using OpenAI-compatible shim if available
      const bedrockBase = ai?.bedrockBaseUrl || process.env.BEDROCK_BASE_URL || 'https://bedrock-runtime.us-east-1.amazonaws.com';
      this.clients.bedrock = new OpenAI({ apiKey: ai?.bedrockAccessKey || process.env.AWS_ACCESS_KEY_ID, baseURL: bedrockBase });
    }
    // HuggingFace Inference API
    if (ai?.huggingfaceApiKey || process.env.HUGGINGFACE_API_KEY) {
      this.clients.huggingface = new OpenAI({ apiKey: ai?.huggingfaceApiKey || process.env.HUGGINGFACE_API_KEY, baseURL: 'https://api-inference.huggingface.co/v1' });
    }
    // Moonshot AI (Kimi)
    if (ai?.moonshotApiKey || process.env.MOONSHOT_API_KEY) {
      this.clients.moonshot = new OpenAI({ apiKey: ai?.moonshotApiKey || process.env.MOONSHOT_API_KEY, baseURL: 'https://api.moonshot.cn/v1' });
    }
    // NVIDIA NIM
    if (ai?.nvidiaApiKey || process.env.NVIDIA_API_KEY) {
      this.clients.nvidia = new OpenAI({ apiKey: ai?.nvidiaApiKey || process.env.NVIDIA_API_KEY, baseURL: 'https://integrate.api.nvidia.com/v1' });
    }
    // LiteLLM proxy
    if (ai?.litellmBaseUrl || process.env.LITELLM_BASE_URL) {
      this.clients.litellm = new OpenAI({ apiKey: ai?.litellmApiKey || process.env.LITELLM_API_KEY || 'no-key', baseURL: ai?.litellmBaseUrl || process.env.LITELLM_BASE_URL });
    }
    // Together AI
    if (ai?.togetherApiKey || process.env.TOGETHER_API_KEY) {
      this.clients.together = new OpenAI({ apiKey: ai?.togetherApiKey || process.env.TOGETHER_API_KEY, baseURL: 'https://api.together.xyz/v1' });
    }
    // Z.AI
    if (ai?.zaiApiKey || process.env.ZAI_API_KEY) {
      this.clients.zai = new OpenAI({ apiKey: ai?.zaiApiKey || process.env.ZAI_API_KEY, baseURL: 'https://api.z.ai/v1' });
    }
    // Cloudflare Workers AI
    if (ai?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID) {
      const accountId = ai?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
      this.clients.cloudflare = new OpenAI({ apiKey: ai?.cloudflareApiToken || process.env.CLOUDFLARE_API_TOKEN, baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1` });
    }
    // Ollama local
    if (ai?.ollamaUrl || process.env.OLLAMA_BASE_URL) {
      const ollamaBase = (ai?.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434') + '/v1';
      this.clients.ollama = new OpenAI({ apiKey: 'ollama', baseURL: ollamaBase });
    }
    // Google Gemini (native REST API — not OpenAI compatible)
    if (ai?.googleApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
      this.clients.google = {
        apiKey: ai?.googleApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
        _isGemini: true,
      };
    }
    // Groq — ultra-fast inference (Llama 3, Mixtral, Gemma at 800+ tok/s)
    if (ai?.groqApiKey || process.env.GROQ_API_KEY) {
      this.clients.groq = new OpenAI({ apiKey: ai?.groqApiKey || process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    }
    // xAI — Grok models
    if (ai?.xaiApiKey || process.env.XAI_API_KEY) {
      this.clients.xai = new OpenAI({ apiKey: ai?.xaiApiKey || process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
    }
    // Cerebras — fast inference on Wafer-Scale Engine
    if (ai?.cerebrasApiKey || process.env.CEREBRAS_API_KEY) {
      this.clients.cerebras = new OpenAI({ apiKey: ai?.cerebrasApiKey || process.env.CEREBRAS_API_KEY, baseURL: 'https://api.cerebras.ai/v1' });
    }
    // LM Studio — local OpenAI-compatible server (default port 1234)
    if (ai?.lmstudioUrl || process.env.LMSTUDIO_BASE_URL) {
      const lmsBase = ai?.lmstudioUrl || process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';
      this.clients.lmstudio = new OpenAI({ apiKey: 'lm-studio', baseURL: lmsBase });
    }
    // Jan.ai — another local OpenAI-compatible server (default port 1337)
    if (ai?.janUrl || process.env.JAN_BASE_URL) {
      const janBase = ai?.janUrl || process.env.JAN_BASE_URL || 'http://localhost:1337/v1';
      this.clients.jan = new OpenAI({ apiKey: 'jan', baseURL: janBase });
    }
  }

  _resolveProvider(model) {
    if (!model) return 'anthropic';
    const lower = model.toLowerCase();
    for (const [key, provider] of Object.entries(PROVIDER_MAP)) {
      if (lower.startsWith(key) || lower.includes(key)) return provider;
    }
    if (lower.includes('ollama') || this.config.ai?.ollamaUrl) return 'ollama';
    // If model contains a slash (e.g. org/model), route to OpenRouter
    if (lower.includes('/')) return 'openrouter';
    return 'anthropic';
  }

  _buildTools(agent) {
    const skillTools = !agent?.skills?.length ? [] : agent.skills.map(skillName => {
      const skill = this.skillEngine.getSkill(skillName);
      if (!skill) return null;
      return { name: skill.name, description: skill.description, input_schema: skill.inputSchema };
    }).filter(Boolean);

    // Include MCP tools from all connected MCP servers
    const mcpTools = globalThis._openBotMCP ? globalThis._openBotMCP.getAllTools('anthropic') : [];

    return [...skillTools, ...mcpTools];
  }

  async _executeTool(toolName, args, context) {
    // MCP tool takes priority if prefixed
    const mcp = globalThis._openBotMCP;
    if (mcp && mcp.isMCPTool(toolName)) {
      return mcp.executeTool(toolName, args);
    }
    return this.skillEngine.execute(toolName, args, context);
  }

  _buildOpenAITools(agent) {
    const tools = this._buildTools(agent);
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  // ── Available providers map (for SmartModelRouter) ───────────────────────
  _availableProviders() {
    return {
      anthropic:  !!this.clients.anthropic,
      openai:     !!this.clients.openai,
      deepseek:   !!this.clients.deepseek,
      openrouter: !!this.clients.openrouter,
      groq:       !!this.clients.groq,
      google:     !!(this.config.ai?.geminiApiKey || process.env.GEMINI_API_KEY),
      ollama:     !!(this.config.ai?.ollamaUrl || process.env.OLLAMA_URL),
      mistral:    !!this.clients.mistral,
      together:   !!this.clients.together,
    };
  }

  // Streaming wrapper used by SSE endpoint
  async completeStream({ agentId, userId, message, channel, agentLoader, memory, sessions, audit, onToken, onToolCall }) {
    const agent = agentLoader.getAgent(agentId) || agentLoader.getAgent('default');
    if (!agent) throw new Error(`Agent '${agentId}' not found`);
    const sessionId = await sessions.getOrCreateSession(userId, agentId);
    const history = await sessions.getHistory(sessionId);
    const relevantMemories = await memory.search(message, 5);
    const memoryContext = relevantMemories.length
      ? `\n\n## Your Memories\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}`
      : '';
    const systemPrompt = agent.systemPrompt + memoryContext;

    // ── Smart model routing: pick cheapest model that fits the task ───────
    const defaultModel = this.config.ai?.defaultModel || 'claude-sonnet-4-6';
    const { tier, model } = this.smartRouter.route({
      message,
      history,
      agentModel: agent?.model,
      defaultModel,
      availableProviders: this._availableProviders(),
    });

    // ── Auto-compact history if context window is getting full ────────────
    let workingHistory = [...history];
    if (this.config.ai?.autoCompact !== false && workingHistory.length > 10) {
      const compactResult = await this.compactor.autoCompact(workingHistory, systemPrompt, model, this);
      if (compactResult.compacted) {
        workingHistory = compactResult.history;
        console.log(`[AIRouter] Stream: auto-compacted session ${sessionId} (tier:${tier})`);
      }
    }

    workingHistory.push({ role: 'user', content: message });

    const provider = this._resolveProvider(model);

    // Stream via Anthropic if available, otherwise fall back to regular complete.
    // Pass _model and _skipCompact so complete() doesn't re-route or re-compact.
    let result;
    if (provider === 'anthropic' && this.clients.anthropic && onToken) {
      result = await this._streamAnthropic({ model, systemPrompt, history: workingHistory, agent, userId, sessionId, onToken, onToolCall });
    } else {
      result = await this.complete({ systemPrompt, history: workingHistory, agent, userId, channel, sessionId, _model: model, _tier: tier, _skipCompact: true });
      onToken?.(result.content);
    }

    workingHistory.push({ role: 'assistant', content: result.content });
    await sessions.saveHistory(sessionId, workingHistory);
    if (agent.skills.includes('memory') && result.content) await memory.autoExtract(message, result.content);
    audit.log({ userId, channel, agentId, message, response: result.content, toolsUsed: result.toolsUsed, model, tier });
    return { ...result, tier };
  }

  async _streamAnthropic({ model, systemPrompt, history, agent, userId, sessionId, onToken, onToolCall }) {
    const tools = this._buildTools(agent);
    const maxTokens = this.config.ai?.maxTokens || 4096;
    let currentHistory = [...history];
    const toolsUsed = [];
    let fullContent = '';

    // Prompt caching: mark stable system prompt and large first messages as cacheable.
    // This mirrors the same logic in _callAnthropic and cuts repeat costs by up to 90%.
    const cacheEnabled = this.config?.ai?.promptCaching !== false;

    for (let attempt = 0; attempt < 10; attempt++) {
      const systemBlock = cacheEnabled
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt;

      const cachedHistory = cacheEnabled ? currentHistory.map((msg, i) => {
        if (i === 0 && typeof msg.content === 'string' && msg.content.length > 1000) {
          return { ...msg, content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }] };
        }
        return msg;
      }) : currentHistory;

      const stream = await this.clients.anthropic.messages.create({
        model: model === 'claude' ? 'claude-sonnet-4-6' : model,
        max_tokens: maxTokens,
        system: systemBlock,
        messages: cachedHistory,
        tools: tools.length ? tools : undefined,
        stream: true,
      });

      let stopReason = null;
      const responseContent = [];
      let currentText = '';
      let currentToolUse = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { ...event.content_block, input: '' };
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentText += event.delta.text;
            fullContent += event.delta.text;
            onToken?.(event.delta.text);
          }
          if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        }
        if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try { currentToolUse.input = JSON.parse(currentToolUse.input); } catch {}
            responseContent.push(currentToolUse);
            onToolCall?.(currentToolUse.name, currentToolUse.input);
            currentToolUse = null;
          } else if (currentText) {
            responseContent.push({ type: 'text', text: currentText });
            currentText = '';
          }
        }
        if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason;
          this._trackTokens(model, 0, event.usage?.output_tokens);
        }
        if (event.type === 'message_start') {
          const usage = event.message.usage || {};
          this._trackTokens(model, usage.input_tokens, 0);
          // Track cache hits — cache_read_input_tokens are billed at 10% of normal
          if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
            this._trackCacheHit(model, usage.cache_read_input_tokens, usage.cache_creation_input_tokens);
          }
        }
      }

      if (stopReason === 'end_turn' || !stopReason) break;

      if (stopReason === 'tool_use') {
        currentHistory.push({ role: 'assistant', content: responseContent });
        const toolResults = [];
        for (const block of responseContent.filter(b => b.type === 'tool_use')) {
          toolsUsed.push(block.name);
          let result;
          try { result = await this.skillEngine.execute(block.name, block.input, { userId, sessionId }); }
          catch (err) { result = { error: err.message }; }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        }
        currentHistory.push({ role: 'user', content: toolResults });
        continue;
      }
      break;
    }
    return { content: fullContent, model, toolsUsed };
  }

  // ── Compaction: summarize history when it gets too long ───────────────────
  async _compactHistory(history, model) {
    const MAX_MESSAGES = 40;
    if (history.length <= MAX_MESSAGES) return history;

    const toSummarize = history.slice(0, history.length - 10);
    const recent = history.slice(-10);

    const summaryPrompt = `Summarize this conversation history concisely in 3-5 bullet points. Focus on key decisions, context, and facts that would be needed to continue the conversation:\n\n${toSummarize.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n').substring(0, 6000)}`;

    try {
      const summaryResult = await this.complete({
        systemPrompt: 'You summarize conversations. Be brief and factual.',
        history: [{ role: 'user', content: summaryPrompt }],
        agent: { skills: [], systemPrompt: '' },
        userId: 'compaction',
        channel: 'internal',
        sessionId: 'compaction',
        _skipCompact: true,
      });
      const summary = { role: 'user', content: `[Conversation summary — earlier context]\n${summaryResult.content}` };
      console.log('[AI] Context compacted');
      return [summary, ...recent];
    } catch {
      return recent; // Fallback: just keep recent
    }
  }

  // ── Model Failover ────────────────────────────────────────────────────────
  async _completeWithFailover(params, primaryModel) {
    const FALLBACK_CHAIN = [
      primaryModel,
      'claude-sonnet-4-6',
      'gpt-4o-mini',
      'deepseek-chat',
    ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

    let lastErr;
    for (const model of FALLBACK_CHAIN) {
      try {
        return await this._completeWithModel({ ...params, model });
      } catch (err) {
        const retryable = err.status === 429 || err.status === 529 || err.status >= 500;
        if (!retryable) throw err;
        lastErr = err;
        const nextModel = FALLBACK_CHAIN[FALLBACK_CHAIN.indexOf(model) + 1];
        if (nextModel) console.log(`[AI] ${model} unavailable (${err.status}), failing over to ${nextModel}`);
      }
    }
    throw lastErr;
  }

  async complete({ systemPrompt, history, agent, userId, channel, sessionId, message, _model, _tier, _skipCompact }) {
    const defaultModel = this.config.ai?.defaultModel || 'claude-sonnet-4-6';
    let model = _model;   // allow callers to pass a pre-resolved model (avoids re-routing)
    let tier  = _tier || 'worker';

    if (!model) {
      // Smart model routing: route only when message text is provided
      if (message && this.smartRouter.enabled) {
        const routed = this.smartRouter.route({
          message,
          history: history || [],
          agentModel: agent?.model,
          defaultModel,
          availableProviders: this._availableProviders(),
        });
        model = routed.model;
        tier  = routed.tier;
      } else {
        model = agent?.model || defaultModel;
      }
    }

    const provider = this._resolveProvider(model);

    // Auto-compact history if context window is getting full.
    // Skip if caller already compacted (e.g. completeStream fallback path).
    let workingHistory = history;
    if (!_skipCompact && this.config.ai?.autoCompact !== false && history.length > 10) {
      const compactResult = await this.compactor.autoCompact(history, systemPrompt, model, this);
      if (compactResult.compacted) {
        workingHistory = compactResult.history;
      }
    }

    try {
      const result = await this._callProvider(provider, { model, systemPrompt, history: workingHistory, agent, userId, sessionId });
      return { ...result, tier };
    } catch (err) {
      // Failover to backup model if configured
      const backupModel = this.config.ai?.fallbackModel;
      if (backupModel && backupModel !== model) {
        console.warn(`[AIRouter] Primary model failed (${err.message}), trying fallback: ${backupModel}`);
        const backupProvider = this._resolveProvider(backupModel);
        const result = await this._callProvider(backupProvider, { model: backupModel, systemPrompt, history: workingHistory, agent, userId, sessionId });
        return { ...result, tier: 'worker' };
      }
      throw err;
    }
  }

  /**
   * Warm Anthropic's prompt cache by sending a tiny no-op message.
   * Anthropic caches expire after ~5 minutes of inactivity.
   * Calling this every 4-5 minutes (or at least before peak usage) keeps the
   * cache hot so subsequent requests pay only 10% of normal input token cost.
   *
   * @param {string} systemPrompt — the system prompt to keep warm
   * @param {string} [model]
   */
  async warmCache(systemPrompt, model) {
    if (!this.clients.anthropic) return;
    if (this.config?.ai?.promptCaching === false) return;

    // Prompt caching only works with Anthropic/Claude models.
    // If the configured default is a different provider, fall back to Haiku
    // (cheapest Claude — the warm call costs < $0.0001).
    const raw = model || this.config.ai?.defaultModel || 'claude-sonnet-4-6';
    const isClaudeModel = raw.toLowerCase().includes('claude') || raw === 'claude';
    const m = isClaudeModel ? (raw === 'claude' ? 'claude-sonnet-4-6' : raw) : 'claude-haiku-3-5';

    try {
      await this.clients.anthropic.messages.create({
        model: m,
        max_tokens: 1,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: '.' }],
      });
      console.log('[AIRouter] Cache warmed for model:', m);
    } catch (err) {
      // Non-fatal — cache warming is best-effort
      console.warn('[AIRouter] Cache warm failed (non-fatal):', err.message);
    }
  }

  /** Smart routing status for UI/CLI */
  routingStatus() {
    return this.smartRouter.status();
  }

  /** Get context window usage for a session's history */
  contextStatus(history, systemPrompt, model) {
    const m = model || this.config.ai?.defaultModel || 'claude-sonnet-4-6';
    return this.compactor.contextStatus(history, systemPrompt, m);
  }

  /** Manual /compact command handler */
  async manualCompact(history, model) {
    const m = model || this.config.ai?.defaultModel || 'claude-sonnet-4-6';
    return this.compactor.compact(history, this, m);
  }

  async _callProvider(provider, { model, systemPrompt, history, agent, userId, sessionId }) {
    switch (provider) {
      case 'anthropic':  return this._callAnthropic({ model, systemPrompt, history, agent, userId, sessionId });
      case 'openai':     return this._callOpenAI({ model, systemPrompt, history, agent, userId, sessionId });
      case 'deepseek':   return this._callDeepSeek({ model, systemPrompt, history, agent, userId, sessionId });
      case 'openrouter': return this._callOpenRouter({ model, systemPrompt, history, agent, userId, sessionId });
      case 'kimi':       return this._callKimi({ model, systemPrompt, history, agent, userId, sessionId });
      case 'glm':        return this._callGLM({ model, systemPrompt, history, agent, userId, sessionId });
      case 'minimax':    return this._callMiniMax({ model, systemPrompt, history, agent, userId, sessionId });
      case 'ollama':     return this._callOllama({ model, systemPrompt, history, agent, userId, sessionId });
      case 'google':     return this._callGemini({ model, systemPrompt, history, agent, userId, sessionId });
      case 'groq':       return this._callOpenAICompat('groq', { model, systemPrompt, history, agent, userId, sessionId });
      case 'xai':        return this._callOpenAICompat('xai', { model, systemPrompt, history, agent, userId, sessionId });
      case 'cerebras':   return this._callOpenAICompat('cerebras', { model, systemPrompt, history, agent, userId, sessionId });
      case 'lmstudio':   return this._callOpenAICompat('lmstudio', { model, systemPrompt, history, agent, userId, sessionId });
      case 'jan':        return this._callOpenAICompat('jan', { model, systemPrompt, history, agent, userId, sessionId });
      default: throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

  // ── Google Gemini ──────────────────────────────────────────────────────────
  async _callGemini({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.google) throw new Error('GOOGLE_AI_API_KEY / GEMINI_API_KEY not configured');
    const apiKey = this.clients.google.apiKey;

    // Normalize model name
    let geminiModel = model.replace(/^google\/gemini[-/]?/i, '').replace(/^gemini[-/]?/i, '');
    if (!geminiModel || geminiModel === model) geminiModel = 'gemini-2.5-flash-preview-04-17';
    else geminiModel = `gemini-${geminiModel}`;

    // Convert history to Gemini format
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
    }));

    // Build tools if agent has skills
    const agentTools = this._buildTools(agent);
    const tools = agentTools.length > 0 ? [{
      functionDeclarations: agentTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: 'OBJECT', properties: {} },
      })),
    }] : [];

    const toolsUsed = [];
    let currentContents = [...contents];

    for (let attempt = 0; attempt < 10; attempt++) {
      const payload = {
        contents: currentContents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: this.config.ai?.maxTokens || 8192, temperature: 0.7 },
      };
      if (tools.length) payload.tools = tools;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error('Gemini returned no candidates');

      this._trackTokens(geminiModel,
        data.usageMetadata?.promptTokenCount,
        data.usageMetadata?.candidatesTokenCount,
      );

      // Handle function calls
      const functionCalls = candidate.content?.parts?.filter(p => p.functionCall);
      if (functionCalls?.length) {
        currentContents.push({ role: 'model', parts: candidate.content.parts });
        const toolResults = [];

        for (const part of functionCalls) {
          const { name, args } = part.functionCall;
          toolsUsed.push(name);
          try {
            const result = await this.skillEngine.execute(name, args, { agent, userId, sessionId });
            toolResults.push({ functionResponse: { name, response: { output: JSON.stringify(result) } } });
          } catch (err) {
            toolResults.push({ functionResponse: { name, response: { error: err.message } } });
          }
        }

        currentContents.push({ role: 'user', parts: toolResults });
        continue;
      }

      // Text response
      const text = candidate.content?.parts?.filter(p => p.text).map(p => p.text).join('') || '';
      return { content: text, model: geminiModel, toolsUsed };
    }

    return { content: '(max tool iterations reached)', model: geminiModel, toolsUsed };
  }

  // ── Generic OpenAI-compatible caller (Groq, xAI, Cerebras, LM Studio, Jan) ─
  async _callOpenAICompat(clientKey, { model, systemPrompt, history, agent, userId, sessionId }) {
    const client = this.clients[clientKey];
    if (!client) throw new Error(`${clientKey} not configured. Set ${clientKey.toUpperCase()}_API_KEY or configure in openbot.json`);

    const tools = this._buildOpenAITools(agent);
    const messages = [{ role: 'system', content: systemPrompt }, ...history];
    const maxTokens = this.config.ai?.maxTokens || 4096;
    const toolsUsed = [];
    let currentMessages = [...messages];

    for (let attempt = 0; attempt < 10; attempt++) {
      const params = {
        model: model.includes('/') ? model.split('/').slice(1).join('/') : model,
        messages: currentMessages,
        max_tokens: maxTokens,
        temperature: 0.7,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      };

      const response = await client.chat.completions.create(params);
      const msg = response.choices[0]?.message;
      if (!msg) break;

      this._trackTokens(model, response.usage?.prompt_tokens, response.usage?.completion_tokens);

      if (msg.tool_calls?.length) {
        currentMessages.push(msg);
        const toolResults = [];
        for (const tc of msg.tool_calls) {
          const args = JSON.parse(tc.function.arguments || '{}');
          toolsUsed.push(tc.function.name);
          try {
            const result = await this._executeTool(tc.function.name, args, { agent, userId, sessionId });
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
          } catch (err) {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err.message}` });
          }
        }
        currentMessages.push(...toolResults);
        continue;
      }

      return { content: msg.content || '', model, toolsUsed };
    }
    return { content: '(max tool iterations reached)', model, toolsUsed };
  }

  // ── Anthropic (Claude) ─────────────────────────────────────────────────────
  async _callAnthropic({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.anthropic) throw new Error('Anthropic API key not configured');

    const tools = this._buildTools(agent);
    const maxTokens = this.config.ai?.maxTokens || 4096;

    // Agentic loop: handle tool calls
    let currentHistory = [...history];
    const toolsUsed = [];

    for (let attempt = 0; attempt < 10; attempt++) {
      // Prompt caching: mark stable system prompt and first few messages as cacheable
      const cacheEnabled = this.config?.ai?.promptCaching !== false;
      const systemBlock = cacheEnabled
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt;

      // Cache first message (usually contains long context)
      const cachedHistory = cacheEnabled ? currentHistory.map((msg, i) => {
        if (i === 0 && typeof msg.content === 'string' && msg.content.length > 1000) {
          return { ...msg, content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }] };
        }
        return msg;
      }) : currentHistory;

      const response = await this.clients.anthropic.messages.create({
        model: model.includes('/') ? model : (model === 'claude' ? 'claude-sonnet-4-6' : model),
        max_tokens: maxTokens,
        system: systemBlock,
        messages: cachedHistory,
        tools: tools.length > 0 ? tools : undefined,
        ...(cacheEnabled ? { betas: ['prompt-caching-2024-07-31'] } : {}),
      });
      // Track cache savings
      if (response.usage?.cache_read_input_tokens) {
        this._trackCacheHit(model, response.usage.cache_read_input_tokens, response.usage.cache_creation_input_tokens || 0);
      }

      if (response.stop_reason === 'end_turn' || !response.stop_reason) {
        const content = response.content.find(b => b.type === 'text')?.text || '';
        this._trackTokens(model, response.usage?.input_tokens, response.usage?.output_tokens);
        return { content, model, toolsUsed };
      }

      if (response.stop_reason === 'tool_use') {
        const assistantMsg = { role: 'assistant', content: response.content };
        currentHistory.push(assistantMsg);

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          console.log(`[AIRouter] Tool call: ${block.name}(${JSON.stringify(block.input).substring(0, 100)})`);
          toolsUsed.push(block.name);

          let result;
          try {
            result = await this.skillEngine.execute(block.name, block.input, { userId, sessionId });
          } catch (err) {
            result = { error: err.message };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }

        currentHistory.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    return { content: 'I was unable to complete the request.', model, toolsUsed };
  }

  // ── OpenAI (GPT-4) ─────────────────────────────────────────────────────────
  async _callOpenAI({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.openai) throw new Error('OpenAI API key not configured');

    const tools = this._buildOpenAITools(agent);
    const messages = [{ role: 'system', content: systemPrompt }, ...history];
    const toolsUsed = [];

    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await this.clients.openai.chat.completions.create({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: this.config.ai?.maxTokens || 4096,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'stop') {
        this._trackTokens(model, response.usage?.prompt_tokens, response.usage?.completion_tokens);
        return { content: choice.message.content, model, toolsUsed };
      }

      if (choice.finish_reason === 'tool_calls') {
        messages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[AIRouter] Tool call: ${toolCall.function.name}`);
          toolsUsed.push(toolCall.function.name);

          let result;
          try {
            result = await this.skillEngine.execute(toolCall.function.name, args, { userId, sessionId });
          } catch (err) {
            result = { error: err.message };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
        continue;
      }

      break;
    }

    return { content: 'Request could not be completed.', model, toolsUsed };
  }

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  async _callDeepSeek({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.deepseek) throw new Error('DeepSeek API key not configured');
    return this._callOpenAI.call(
      { ...this, clients: { openai: this.clients.deepseek } },
      { model, systemPrompt, history, agent, userId, sessionId }
    );
  }

  // ── OpenRouter (200+ models) ───────────────────────────────────────────────
  async _callOpenRouter({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.openrouter) throw new Error('OpenRouter API key not configured. Get one at openrouter.ai');
    return this._callOpenAI.call(
      { ...this, clients: { openai: this.clients.openrouter } },
      { model, systemPrompt, history, agent, userId, sessionId }
    );
  }

  // ── Kimi (Moonshot AI) ────────────────────────────────────────────────────
  async _callKimi({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.kimi) throw new Error('Kimi API key not configured');
    const kimiModel = model.startsWith('kimi') ? 'moonshot-v1-8k' : model;
    return this._callOpenAI.call(
      { ...this, clients: { openai: this.clients.kimi } },
      { model: kimiModel, systemPrompt, history, agent, userId, sessionId }
    );
  }

  // ── GLM (Zhipu AI) ────────────────────────────────────────────────────────
  async _callGLM({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.glm) throw new Error('GLM API key not configured');
    const glmModel = model.startsWith('glm') ? model : 'glm-4';
    return this._callOpenAI.call(
      { ...this, clients: { openai: this.clients.glm } },
      { model: glmModel, systemPrompt, history, agent, userId, sessionId }
    );
  }

  // ── MiniMax ───────────────────────────────────────────────────────────────
  async _callMiniMax({ model, systemPrompt, history, agent, userId, sessionId }) {
    if (!this.clients.minimax) throw new Error('MiniMax API key not configured');
    const mmModel = model.startsWith('minimax') ? model : 'abab6.5s-chat';
    return this._callOpenAI.call(
      { ...this, clients: { openai: this.clients.minimax } },
      { model: mmModel, systemPrompt, history, agent, userId, sessionId }
    );
  }

  // ── Ollama (local) ─────────────────────────────────────────────────────────
  async _callOllama({ model, systemPrompt, history }) {
    const baseUrl = this.config.ai?.ollamaUrl || 'http://localhost:11434';
    const ollamaModel = model.replace('ollama/', '') || 'llama3';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    const response = await axios.post(`${baseUrl}/api/chat`, {
      model: ollamaModel,
      messages,
      stream: false,
    });

    return {
      content: response.data.message?.content || '',
      model: `ollama/${ollamaModel}`,
      toolsUsed: [],
    };
  }
}
