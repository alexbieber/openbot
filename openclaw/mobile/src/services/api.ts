/**
 * OpenBot gateway API client.
 * Connects to a self-hosted OpenBot gateway (HTTP + WebSocket + SSE).
 * Stored gateway URL and auth token are persisted in SecureStore.
 *
 * Endpoint mapping (matches real gateway):
 *   POST /message          — send a message (non-streaming)
 *   GET  /stream?message=  — SSE streaming response
 *   GET  /health           — health check
 *   GET  /agents           — list agents
 *   GET  /sessions         — list sessions
 *   DELETE /sessions/:id   — delete/reset a session
 *   POST /memory           — save memory
 *   GET  /memory?q=        — search/list memories
 *   WS   ws://host/        — WebSocket (root path, no /ws suffix)
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_URL = 'openbot_gateway_url';
const KEY_TOKEN = 'openbot_auth_token';

// expo-secure-store is native-only; fall back to localStorage on web
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
export const DEFAULT_GATEWAY_URL = '';  // User must configure in Settings

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  toolsUsed?: string[];
}

export interface GatewayHealth {
  status: string;
  version: string;
  model: string;
  skills: number;
  agents: number;
  uptime: number;
  platform: string;
  node: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  model?: string;
  skills?: string[];
}

export interface Session {
  sessionId: string;
  userId: string;
  agentId: string;
}

class OpenBotAPI {
  private _url: string = DEFAULT_GATEWAY_URL;
  private _token: string = '';
  private _ws: WebSocket | null = null;
  private _messageHandlers: ((msg: ChatMessage) => void)[] = [];
  private _statusHandlers: ((connected: boolean) => void)[] = [];
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async load() {
    this._url = (await secureGet(KEY_URL)) || DEFAULT_GATEWAY_URL;
    this._token = (await secureGet(KEY_TOKEN)) || '';
  }

  async setGateway(url: string, token?: string) {
    this._url = url.replace(/\/$/, '');
    this._token = token || '';
    await secureSet(KEY_URL, this._url);
    if (this._token) await secureSet(KEY_TOKEN, this._token);
  }

  get gatewayUrl() { return this._url; }
  get hasToken() { return !!this._token; }

  private _headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  }

  // ── Health ──────────────────────────────────────────────────────────────
  async health(): Promise<GatewayHealth> {
    const res = await fetch(`${this._url}/health`, { headers: this._headers() });
    if (!res.ok) throw new Error(`Gateway health check failed: ${res.status}`);
    return res.json();
  }

  // ── Chat (non-streaming) ────────────────────────────────────────────────
  async chat(message: string, opts?: {
    agentId?: string;
    sessionId?: string;
    userId?: string;
    model?: string;
  }): Promise<ChatMessage> {
    const { agentId = 'default', sessionId, userId = 'mobile-user', model } = opts || {};

    // Real gateway endpoint: POST /message
    const res = await fetch(`${this._url}/message`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ message, agentId, userId, sessionId, model, channel: 'mobile' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Chat error: ${res.status}`);
    }
    const data = await res.json();
    return {
      id: data.id || String(Date.now()),
      role: 'assistant',
      content: data.response || data.content || data.text || '',
      timestamp: Date.now(),
      model: data.model,
      toolsUsed: data.toolsUsed,
    };
  }

  // ── Streaming chat via SSE ──────────────────────────────────────────────
  // Real gateway: GET /stream?message=...&agentId=...&userId=...
  streamChat(
    message: string,
    opts: {
      agentId?: string;
      sessionId?: string;
      userId?: string;
      onChunk: (chunk: string) => void;
      onDone: (toolsUsed?: string[]) => void;
      onError: (err: string) => void;
    }
  ): () => void {
    const { agentId = 'default', userId = 'mobile-user', onChunk, onDone, onError } = opts;
    const params = new URLSearchParams({ message, agentId, userId });
    if (opts.sessionId) params.set('sessionId', opts.sessionId);

    // SSE streaming — React Native uses EventSource polyfill or fetch stream
    const url = `${this._url}/stream?${params.toString()}`;
    let aborted = false;

    (async () => {
      try {
        const res = await fetch(url, {
          headers: { ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}) },
        });
        if (!res.ok) { onError(`HTTP ${res.status}`); return; }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('event:') && !line.startsWith('data:')) continue;
            if (line.startsWith('event: token')) continue; // skip event line, handled on data
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim();
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed.token) { onChunk(parsed.token); }
                else if (parsed.toolsUsed !== undefined) { onDone(parsed.toolsUsed); return; }
                else if (parsed.error) { onError(parsed.error); return; }
              } catch {}
            }
          }
        }
        if (!aborted) onDone();
      } catch (e: any) {
        if (!aborted) onError(e.message);
      }
    })();

    return () => { aborted = true; };
  }

  // ── WebSocket ───────────────────────────────────────────────────────────
  // Real gateway: WebSocket at root path (ws://host:18789/) — no /ws suffix
  connectWebSocket(
    onMessage: (msg: ChatMessage) => void,
    onStatus: (connected: boolean) => void
  ) {
    if (this._ws?.readyState === WebSocket.OPEN) return;

    this._messageHandlers = this._messageHandlers.filter(() => false);
    this._statusHandlers = this._statusHandlers.filter(() => false);
    this._messageHandlers.push(onMessage);
    this._statusHandlers.push(onStatus);

    // Root path, not /ws
    const wsUrl = this._url.replace(/^http/, 'ws').replace(/\/$/, '');
    try {
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => {
        this._statusHandlers.forEach(h => h(true));
        // Identify ourselves to the gateway
        this._ws?.send(JSON.stringify({
          type: 'identify',
          role: 'user',
          userId: 'mobile-user',
          agentId: 'default',
          channel: 'mobile',
          ...(this._token ? { token: this._token } : {}),
        }));
      };

      this._ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle assistant message responses
          if ((data.type === 'message' || data.type === 'response') && data.content) {
            const msg: ChatMessage = {
              id: data.id || String(Date.now()),
              role: 'assistant',
              content: data.content,
              timestamp: Date.now(),
              model: data.model,
              toolsUsed: data.toolsUsed,
            };
            this._messageHandlers.forEach(h => h(msg));
          }
          // Handle stream tokens from WS
          if (data.type === 'token' && data.token) {
            this._messageHandlers.forEach(h => h({
              id: 'stream',
              role: 'assistant',
              content: data.token,
              timestamp: Date.now(),
            }));
          }
        } catch {}
      };

      this._ws.onerror = () => {
        this._statusHandlers.forEach(h => h(false));
      };

      this._ws.onclose = () => {
        this._statusHandlers.forEach(h => h(false));
        // Auto-reconnect after 5s
        if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
        this._wsReconnectTimer = setTimeout(() => {
          this.connectWebSocket(onMessage, onStatus);
        }, 5000);
      };
    } catch {}
  }

  disconnectWebSocket() {
    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
    this._ws?.close();
    this._ws = null;
  }

  sendViaWebSocket(message: string, agentId = 'default') {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: 'message',
        content: message,
        agentId,
        userId: 'mobile-user',
      }));
    }
  }

  // ── Sessions ────────────────────────────────────────────────────────────
  async getSessions(): Promise<Session[]> {
    const res = await fetch(`${this._url}/sessions`, { headers: this._headers() });
    return res.ok ? res.json() : [];
  }

  async deleteSession(sessionId: string): Promise<void> {
    await fetch(`${this._url}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this._headers(),
    });
  }

  // ── Agents ──────────────────────────────────────────────────────────────
  async getAgents(): Promise<Agent[]> {
    const res = await fetch(`${this._url}/agents`, { headers: this._headers() });
    return res.ok ? res.json() : [];
  }

  // ── Skills (ClawdBot-style capabilities) ────────────────────────────────
  async getSkills(): Promise<{ name: string; description?: string }[]> {
    if (!this._url) return [];
    const res = await fetch(`${this._url}/skills`, { headers: this._headers() });
    return res.ok ? res.json() : [];
  }

  // ── Memory ──────────────────────────────────────────────────────────────
  async saveMemory(content: string, tags?: string[]): Promise<string> {
    const res = await fetch(`${this._url}/memory`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ content, tags: tags || [] }),
    });
    const data = await res.json();
    return data.id;
  }

  async searchMemory(query?: string): Promise<any[]> {
    const url = query
      ? `${this._url}/memory?q=${encodeURIComponent(query)}`
      : `${this._url}/memory`;
    const res = await fetch(url, { headers: this._headers() });
    return res.ok ? res.json() : [];
  }

  async deleteMemory(id: string): Promise<void> {
    await fetch(`${this._url}/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this._headers(),
    });
  }

  // ── File upload (for attachments) ───────────────────────────────────────
  async uploadFile(uri: string, filename: string, mimeType: string): Promise<{ url?: string; content?: string }> {
    const form = new FormData();
    form.append('file', { uri, name: filename, type: mimeType } as any);
    const headers: Record<string, string> = {};
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    const res = await fetch(`${this._url}/upload`, {
      method: 'POST',
      headers,
      body: form,
    });
    return res.ok ? res.json() : { content: 'Upload failed' };
  }

  // ── Push-to-Talk ────────────────────────────────────────────────────────
  async pushToTalk(audioBase64: string, agentId = 'default'): Promise<{ response: string; transcript?: string }> {
    const res = await fetch(`${this._url}/push-to-talk`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ audio: audioBase64, agentId, userId: 'mobile-user' }),
    });
    if (!res.ok) throw new Error(`PTT error: ${res.status}`);
    return res.json();
  }
}

export const api = new OpenBotAPI();
