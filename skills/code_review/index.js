/**
 * Code Review Skill
 * AI-powered review of files, PRs, or pasted code.
 */
import { readFileSync, existsSync } from 'fs';
import axios from 'axios';

export default async function execute({ action, path: filePath, repo, pr_number, code, language, focus = 'all' }, context = {}) {
  let codeToReview = '';
  let label = '';

  if (action === 'review_file') {
    if (!filePath) throw new Error('path required');
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    codeToReview = readFileSync(filePath, 'utf-8').substring(0, 8000);
    label = filePath;
  } else if (action === 'review_pr') {
    if (!repo || !pr_number) throw new Error('repo and pr_number required');
    const token = process.env.GITHUB_TOKEN || context.config?.skills?.githubToken;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.diff' };
    const res = await axios.get(`https://api.github.com/repos/${repo}/pulls/${pr_number}`, { headers });
    codeToReview = String(res.data).substring(0, 8000);
    label = `PR #${pr_number} in ${repo}`;
  } else if (action === 'review_text') {
    if (!code) throw new Error('code required');
    codeToReview = code.substring(0, 8000);
    label = language ? `${language} code` : 'code snippet';
  } else {
    throw new Error('action must be: review_file, review_pr, or review_text');
  }

  const focusMap = {
    security: 'Focus heavily on security vulnerabilities, injection risks, and unsafe operations.',
    performance: 'Focus heavily on performance bottlenecks, inefficient algorithms, and memory usage.',
    style: 'Focus on code style, readability, naming conventions, and formatting.',
    bugs: 'Focus on logic errors, edge cases, null pointer issues, and runtime exceptions.',
    all: 'Review for bugs, security, performance, style, and best practices.',
  };

  const prompt = `You are an expert code reviewer. Review this ${label} thoroughly.

${focusMap[focus] || focusMap.all}

Provide:
1. **Summary** — overall quality assessment (1-2 sentences)
2. **Critical Issues** — bugs or security problems that must be fixed
3. **Improvements** — non-critical suggestions
4. **Positives** — what the code does well
5. **Score** — out of 10

Code to review:
\`\`\`
${codeToReview}
\`\`\``;

  const anthropicKey = process.env.ANTHROPIC_API_KEY || context.config?.ai?.anthropicApiKey;
  const openaiKey = process.env.OPENAI_API_KEY || context.config?.ai?.openaiApiKey;

  if (anthropicKey) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicKey });
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content[0].text;
  }

  if (openaiKey) {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: openaiKey });
    const res = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content;
  }

  throw new Error('No AI API key configured for code review (needs ANTHROPIC_API_KEY or OPENAI_API_KEY)');
}
