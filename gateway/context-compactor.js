/**
 * Context Window Compactor
 * Mirrors ClawdBot's /compact command and automatic mid-run compaction.
 *
 * Strategy:
 * 1. Estimate token count of current history.
 * 2. If it exceeds the configured threshold (default 75% of model's context window),
 *    automatically compact the oldest messages.
 * 3. Compaction: sends the oldest N turns to the AI with a "summarize this conversation"
 *    prompt, replaces them with a single compact summary message.
 * 4. The summary is prefixed with [COMPACTED CONTEXT] so the model knows it's a summary.
 * 5. Recent turns (last 8 by default) are always preserved verbatim.
 *
 * Supports manual compaction via /compact slash command.
 */

// Approximate token count: 1 token ≈ 4 chars (rough heuristic)
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function estimateHistoryTokens(history) {
  return history.reduce((total, msg) => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    return total + estimateTokens(content) + 4; // 4 for role overhead
  }, 0);
}

// Model context window sizes (in tokens)
const MODEL_CONTEXT_WINDOWS = {
  'claude-opus-4': 200000,
  'claude-sonnet': 200000,
  'claude-haiku': 200000,
  'gpt-4o': 128000,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16000,
  'gpt-5': 256000,
  'o1': 200000,
  'o3': 200000,
  'gemini-2.5-pro': 2000000,
  'gemini-2.5-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'deepseek-chat': 65000,
  'grok-2': 131000,
  'grok-3': 131000,
  'mixtral': 32000,
  'llama-3': 128000,
  'default': 100000,
};

function getContextWindow(model) {
  if (!model) return MODEL_CONTEXT_WINDOWS.default;
  const lower = model.toLowerCase();
  for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return size;
  }
  return MODEL_CONTEXT_WINDOWS.default;
}

export class ContextCompactor {
  constructor(config = {}) {
    this.config = config;
    this.compactThreshold = config.ai?.compactThreshold || 0.75; // compact at 75% full
    this.preserveRecentTurns = config.ai?.preserveRecentTurns || 8;
    this.maxSummaryTokens = config.ai?.maxSummaryTokens || 1000;
  }

  /**
   * Check if history needs compaction.
   * @param {Array} history - message history
   * @param {string} systemPrompt - current system prompt
   * @param {string} model - current model name
   * @returns {{ needsCompaction: boolean, used: number, limit: number, percent: number }}
   */
  check(history, systemPrompt, model) {
    const contextWindow = getContextWindow(model);
    const limit = Math.floor(contextWindow * this.compactThreshold);
    const systemTokens = estimateTokens(systemPrompt);
    const historyTokens = estimateHistoryTokens(history);
    const used = systemTokens + historyTokens;

    return {
      needsCompaction: used > limit,
      used,
      limit,
      total: contextWindow,
      percent: Math.round((used / contextWindow) * 100),
    };
  }

  /**
   * Compact history by summarizing the oldest turns.
   * Returns a new history array with the oldest turns replaced by a summary.
   *
   * @param {Array} history - full message history
   * @param {object} aiClient - AI client that can call .complete()
   * @param {string} model - model to use for summarization
   * @returns {Promise<{ history: Array, summary: string, compactedCount: number }>}
   */
  async compact(history, aiClient, model) {
    if (history.length <= this.preserveRecentTurns + 2) {
      return { history, summary: '', compactedCount: 0 };
    }

    const keepCount = this.preserveRecentTurns;
    const compactMessages = history.slice(0, history.length - keepCount);
    const keepMessages = history.slice(history.length - keepCount);

    // Ask AI to summarize the oldest turns
    let summary = '';
    try {
      const summaryPrompt = [
        {
          role: 'user',
          content: `Please create a concise summary of this conversation up to this point. 
Capture: key facts discussed, decisions made, tasks completed, important context, and any preferences mentioned.
Be thorough but brief. This summary will replace these messages in context to free up space.

Format: Start with "SUMMARY:" then bullet points.

CONVERSATION TO SUMMARIZE:
${compactMessages.map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n')}`,
        },
      ];

      const result = await aiClient.complete({
        systemPrompt: 'You are a conversation summarizer. Create concise, accurate summaries.',
        history: summaryPrompt,
        agent: null,
        userId: 'system',
        sessionId: 'compact',
        _skipCompact: true,  // never recursively compact the summarizer's own call
      });
      summary = result.content || '';
    } catch (err) {
      // Fallback: create a simple summary from message count
      summary = `SUMMARY: [${compactMessages.length} earlier messages compacted. Topics discussed in prior turns.]`;
    }

    // Build the compacted history
    const compactedHistory = [
      {
        role: 'user',
        content: `[COMPACTED CONTEXT — ${compactMessages.length} earlier messages summarized]\n\n${summary}`,
      },
      {
        role: 'assistant',
        content: 'I understand the context from the earlier conversation. I\'ll continue from here.',
      },
      ...keepMessages,
    ];

    console.log(`[Compactor] Compacted ${compactMessages.length} messages → ${summary.length} char summary. History: ${history.length} → ${compactedHistory.length} messages.`);

    return {
      history: compactedHistory,
      summary,
      compactedCount: compactMessages.length,
      savedTokens: estimateHistoryTokens(compactMessages) - estimateTokens(summary),
    };
  }

  /**
   * Auto-compact if needed. Returns original or compacted history.
   */
  async autoCompact(history, systemPrompt, model, aiClient) {
    const status = this.check(history, systemPrompt, model);
    if (!status.needsCompaction) return { history, compacted: false, status };

    console.log(`[Compactor] Auto-compacting: ${status.percent}% of context window used (${status.used}/${status.total} tokens)`);
    const result = await this.compact(history, aiClient, model);
    return { ...result, compacted: true, status };
  }

  contextStatus(history, systemPrompt, model) {
    const status = this.check(history, systemPrompt, model);
    return {
      messages: history.length,
      estimatedTokens: status.used,
      contextWindow: status.total,
      percentFull: status.percent,
      threshold: Math.round(this.compactThreshold * 100),
      needsCompaction: status.needsCompaction,
    };
  }
}
