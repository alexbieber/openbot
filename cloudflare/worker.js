/**
 * OpenBot Cloudflare Worker
 * Runs the AI gateway as a serverless Cloudflare Worker (global edge, zero ops).
 *
 * Features:
 * - Stateless HTTP + WebSocket via Durable Objects
 * - Sessions stored in KV (SESSIONS binding)
 * - Memory stored in KV (MEMORY binding)
 * - All AI providers supported via fetch() (no Node.js dependencies)
 * - Telegram/Discord webhooks via POST
 * - /chat REST endpoint
 * - /health endpoint
 *
 * Deploy:
 *   npm run deploy:cf
 *   OR: npx wrangler deploy
 *
 * Configure:
 *   npx wrangler secret put ANTHROPIC_API_KEY
 *   npx wrangler secret put TELEGRAM_TOKEN
 *   npx wrangler secret put OPENAI_API_KEY
 */

export { ConnectionManager } from './connection-manager.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Health check ─────────────────────────────────────────────────────────
    if (path === '/health') {
      return Response.json({
        status: 'ok',
        version: env.OPENBOT_VERSION || '1.0.0',
        runtime: 'cloudflare-workers',
        region: request.cf?.colo || 'unknown',
        model: env.DEFAULT_MODEL || 'claude-sonnet-4-6',
        timestamp: new Date().toISOString(),
      }, { headers: corsHeaders });
    }

    // ── Auth middleware ───────────────────────────────────────────────────────
    const authToken = env.GATEWAY_AUTH_TOKEN;
    if (authToken && path !== '/health') {
      const bearer = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (bearer !== authToken) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
    }

    // ── WebSocket upgrade → Durable Object ───────────────────────────────────
    if (request.headers.get('Upgrade') === 'websocket') {
      const id = env.CONNECTIONS.idFromName('main');
      const stub = env.CONNECTIONS.get(id);
      return stub.fetch(request);
    }

    // ── Chat REST endpoint ────────────────────────────────────────────────────
    if (path === '/chat' && method === 'POST') {
      try {
        const { message, agentId = 'default', sessionId, model } = await request.json();
        if (!message) return Response.json({ error: 'message required' }, { status: 400, headers: corsHeaders });

        const resolvedSessionId = sessionId || `${agentId}-default`;
        const history = await getHistory(env.SESSIONS, resolvedSessionId);

        history.push({ role: 'user', content: message });

        const response = await callAI(env, model || env.DEFAULT_MODEL || 'claude-sonnet-4-6', history);

        history.push({ role: 'assistant', content: response.content });
        await saveHistory(env.SESSIONS, resolvedSessionId, history.slice(-50)); // keep last 50 msgs

        return Response.json({
          response: response.content,
          model: response.model,
          sessionId: resolvedSessionId,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ── Telegram webhook ──────────────────────────────────────────────────────
    if (path === '/channels/telegram/webhook' && method === 'POST') {
      const token = env.TELEGRAM_TOKEN;
      if (!token) return new Response('TELEGRAM_TOKEN not set', { status: 503 });

      try {
        const body = await request.json();
        const message = body.message || body.edited_message;
        if (!message?.text) return new Response('ok');

        const chatId = message.chat.id;
        const userId = String(message.from?.id || chatId);
        const text = message.text;

        const history = await getHistory(env.SESSIONS, `telegram-${userId}`);
        history.push({ role: 'user', content: text });

        const ai = await callAI(env, env.DEFAULT_MODEL || 'claude-sonnet-4-6', history);
        history.push({ role: 'assistant', content: ai.content });
        await saveHistory(env.SESSIONS, `telegram-${userId}`, history.slice(-50));

        await sendTelegram(token, chatId, ai.content);
        return new Response('ok');
      } catch (err) {
        console.error('[CF:Telegram]', err.message);
        return new Response('ok');
      }
    }

    // ── Sessions ──────────────────────────────────────────────────────────────
    if (path === '/sessions/reset' && method === 'POST') {
      const { sessionId } = await request.json().catch(() => ({}));
      if (sessionId) await env.SESSIONS.delete(sessionId);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // ── Memory ────────────────────────────────────────────────────────────────
    if (path === '/memory' && method === 'GET') {
      const key = url.searchParams.get('key') || 'default';
      const value = await env.MEMORY.get(key);
      return Response.json({ key, value }, { headers: corsHeaders });
    }
    if (path === '/memory' && method === 'POST') {
      const { key, value } = await request.json();
      await env.MEMORY.put(key, JSON.stringify(value));
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json({ error: `Not found: ${path}` }, { status: 404, headers: corsHeaders });
  },
};

// ── KV helpers ────────────────────────────────────────────────────────────────

async function getHistory(kv, sessionId) {
  try {
    const raw = await kv.get(sessionId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveHistory(kv, sessionId, history) {
  await kv.put(sessionId, JSON.stringify(history), { expirationTtl: 7 * 24 * 3600 }); // 7 day TTL
}

// ── AI caller (Anthropic, OpenAI, Gemini — all via fetch) ────────────────────

async function callAI(env, model, history) {
  const lower = model.toLowerCase();

  if (lower.includes('claude')) {
    return callAnthropic(env, model, history);
  } else if (lower.includes('gemini')) {
    return callGemini(env, model, history);
  } else {
    return callOpenAI(env, model, history);
  }
}

async function callAnthropic(env, model, history) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const systemMsg = history.find(m => m.role === 'system');
  const msgs = history.filter(m => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model === 'claude' ? 'claude-sonnet-4-6-20250514' : model,
      max_tokens: 4096,
      system: systemMsg?.content || 'You are OpenBot, a helpful AI assistant.',
      messages: msgs,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic API error: ${JSON.stringify(data)}`);
  return { content: data.content?.[0]?.text || '', model };
}

async function callOpenAI(env, model, history) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model === 'gpt' ? 'gpt-4o' : model, messages: history, max_tokens: 4096 }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  return { content: data.choices?.[0]?.message?.content || '', model };
}

async function callGemini(env, model, history) {
  const key = env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const geminiModel = model.replace(/^gemini[-/]?/i, '') || '2.5-flash-preview-04-17';
  const contents = history
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const systemMsg = history.find(m => m.role === 'system');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-${geminiModel}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
        generationConfig: { maxOutputTokens: 4096 },
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(data)}`);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return { content: text, model };
}

// ── Telegram sender ───────────────────────────────────────────────────────────

async function sendTelegram(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
