import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export const skill = {
  name: 'llm-task',
  description: 'Spawn a focused sub-LLM call for isolated reasoning tasks',
  async execute({ prompt, input, model, maxTokens = 1000, temperature = 0.3 }) {
    const resolvedModel = model || process.env.OPENBOT_FAST_MODEL || 'gpt-4o-mini';
    const fullPrompt = input ? `${prompt}\n\n---\n${input}` : prompt;

    // Try Anthropic first (Claude Haiku is fast and cheap)
    if ((resolvedModel.includes('claude') || (!model && process.env.ANTHROPIC_API_KEY)) && process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const m = resolvedModel.includes('claude') ? resolvedModel : 'claude-haiku-3-5';
      try {
        const res = await client.messages.create({
          model: m, max_tokens: maxTokens, temperature,
          messages: [{ role: 'user', content: fullPrompt }],
        });
        return { output: res.content[0]?.text, model: m, tokens: res.usage };
      } catch {}
    }

    // Try OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey });
      const m = resolvedModel.includes('/') ? resolvedModel : 'gpt-4o-mini';
      try {
        const res = await client.chat.completions.create({
          model: m, max_tokens: maxTokens, temperature,
          messages: [{ role: 'user', content: fullPrompt }],
        });
        return { output: res.choices[0]?.message?.content, model: m, tokens: res.usage };
      } catch (err) {
        return { error: err.message };
      }
    }

    return { error: 'No AI provider configured for llm-task skill' };
  },
};

export default skill;
