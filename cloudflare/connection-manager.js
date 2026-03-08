/**
 * Durable Object for WebSocket connection management in Cloudflare Workers.
 * Handles persistent WS connections across the global edge.
 */

export class ConnectionManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);

    server.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'handshake') {
          const sessionKey = `${msg.userId || 'anon'}-${msg.agentId || 'default'}`;
          this.sessions.set(server, { userId: msg.userId, agentId: msg.agentId, sessionKey });
          server.send(JSON.stringify({ type: 'handshake_ack', ok: true }));
          return;
        }

        if (msg.type === 'message') {
          const session = this.sessions.get(server) || {};
          const sessionId = session.sessionKey || 'default';

          const history = await this._getHistory(sessionId);
          history.push({ role: 'user', content: msg.content });

          const model = this.env.DEFAULT_MODEL || 'claude-sonnet-4-6';
          const aiResult = await this._callAI(model, history);

          history.push({ role: 'assistant', content: aiResult.content });
          await this._saveHistory(sessionId, history.slice(-50));

          server.send(JSON.stringify({ type: 'message', content: aiResult.content, model: aiResult.model }));
        }
      } catch (err) {
        server.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async _getHistory(sessionId) {
    try {
      const raw = await this.env.SESSIONS.get(sessionId);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async _saveHistory(sessionId, history) {
    await this.env.SESSIONS.put(sessionId, JSON.stringify(history), { expirationTtl: 7 * 24 * 3600 });
  }

  async _callAI(model, history) {
    const lower = model.toLowerCase();
    if (lower.includes('claude')) return this._callAnthropic(model, history);
    if (lower.includes('gemini')) return this._callGemini(model, history);
    return this._callOpenAI(model, history);
  }

  async _callAnthropic(model, history) {
    const key = this.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model === 'claude' ? 'claude-sonnet-4-6-20250514' : model,
        max_tokens: 4096,
        system: 'You are OpenBot, a helpful AI assistant.',
        messages: history.filter(m => m.role !== 'system'),
      }),
    });
    const data = await res.json();
    return { content: data.content?.[0]?.text || '', model };
  }

  async _callOpenAI(model, history) {
    const key = this.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model === 'gpt' ? 'gpt-4o' : model, messages: history, max_tokens: 4096 }),
    });
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', model };
  }

  async _callGemini(model, history) {
    const key = this.env.GEMINI_API_KEY || this.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    const geminiModel = model.replace(/^gemini[-/]?/i, '') || '2.5-flash-preview-04-17';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-${geminiModel}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: history.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: 4096 },
        }),
      },
    );
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return { content: text, model };
  }
}
