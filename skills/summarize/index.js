/**
 * Summarize Skill
 * Summarize text, URLs, or files.
 */
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';

async function fetchUrl(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenBot/1.0)' },
    timeout: 10000,
  });
  return res.data
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 10000);
}

export default async function execute({ content, url, path: filePath, style = 'bullets', length = 'medium' }, context = {}) {
  let text = content;

  if (!text && url) text = await fetchUrl(url);
  if (!text && filePath) {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    text = readFileSync(filePath, 'utf-8').substring(0, 10000);
  }
  if (!text) throw new Error('Provide content, url, or path to summarize');

  const lengthMap = { short: '3-5', medium: '5-8', long: '10-15' };
  const styleMap = {
    bullets: `bullet points (${lengthMap[length]} bullets)`,
    paragraph: `${length === 'short' ? '1-2' : length === 'medium' ? '2-3' : '4-5'} concise paragraphs`,
    executive: 'executive summary with: Key Points, Business Impact, Action Items',
    tldr: 'a single sentence TL;DR',
  };

  const prompt = `Summarize the following content as ${styleMap[style] || styleMap.bullets}.
Be concise and focus on the most important information.

Content:
${text}`;

  const anthropicKey = process.env.ANTHROPIC_API_KEY || context.config?.ai?.anthropicApiKey;
  const openaiKey = process.env.OPENAI_API_KEY || context.config?.ai?.openaiApiKey;

  if (anthropicKey) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicKey });
    const res = await client.messages.create({
      model: 'claude-haiku',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content[0].text;
  }

  if (openaiKey) {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: openaiKey });
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content;
  }

  // Fallback: basic extraction
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return `Key points:\n${sentences.slice(0, 5).map(s => `• ${s.trim()}`).join('\n')}`;
}
