/**
 * ACP — Agent Communication Protocol
 * Allows multiple OpenBot gateways to discover and communicate with each other.
 * Implements a lightweight JSON-RPC over HTTP + WebSocket bus.
 *
 * Features:
 * - Gateway registry (announce self, discover peers)
 * - Direct agent-to-agent message routing
 * - Remote skill invocation
 * - Shared session handoff
 * - Event pub/sub across gateways
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';

const ACP_VERSION = '1.0';
const MULTICAST_PORT = parseInt(process.env.ACP_PORT || '18790');

export class ACPBus {
  constructor(config = {}) {
    this.nodeId = config.nodeId || randomBytes(8).toString('hex');
    this.nodeName = config.nodeName || 'openbot';
    this.port = config.port || 18789;
    this.peers = new Map(); // nodeId → { url, name, agents, lastSeen }
    this.handlers = new Map(); // method → handler
    this._ws = null;
    this._clients = new Set();
    this._subscriptions = new Map(); // topic → Set<handler>

    // Register built-in methods
    this._registerBuiltins();
  }

  _registerBuiltins() {
    this.on('acp.ping', () => ({ pong: true, nodeId: this.nodeId, name: this.nodeName }));
    this.on('acp.info', () => ({
      nodeId: this.nodeId, name: this.nodeName, version: ACP_VERSION,
      port: this.port, peers: this.peers.size,
    }));
    this.on('acp.peers.list', () => [...this.peers.values()]);
    this.on('acp.peers.announce', ({ nodeId, name, url, agents }) => {
      this.peers.set(nodeId, { nodeId, name, url, agents, lastSeen: new Date().toISOString() });
      return { ok: true };
    });
  }

  // Register an RPC handler
  on(method, handler) {
    this.handlers.set(method, handler);
  }

  // Subscribe to a topic (pub/sub)
  subscribe(topic, handler) {
    if (!this._subscriptions.has(topic)) this._subscriptions.set(topic, new Set());
    this._subscriptions.get(topic).add(handler);
  }

  // Publish to a topic (local + broadcast to peers)
  async publish(topic, data) {
    const handlers = this._subscriptions.get(topic) || [];
    for (const h of handlers) h(data);
    // Broadcast to connected peers
    for (const client of this._clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'event', topic, data, from: this.nodeId }));
      }
    }
  }

  // Call a method on a specific peer
  async call(peerNodeId, method, params = {}) {
    const peer = this.peers.get(peerNodeId);
    if (!peer) throw new Error(`Peer not found: ${peerNodeId}`);
    const res = await fetch(`${peer.url}/acp/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomBytes(4).toString('hex'), method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  // Handle incoming RPC request
  async _handleRPC(req) {
    const { method, params, id } = req;
    const handler = this.handlers.get(method);
    if (!handler) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    try {
      const result = await handler(params || {});
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }

  // Announce self to a specific peer URL
  async announceTo(peerUrl) {
    try {
      const res = await fetch(`${peerUrl}/acp/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: '1', method: 'acp.peers.announce',
          params: { nodeId: this.nodeId, name: this.nodeName, url: `http://localhost:${this.port}`, agents: [] },
        }),
      });
      const json = await res.json();
      if (json.result?.ok) {
        // Fetch their info
        const infoRes = await this.call(undefined, 'acp.info').catch(() => null);
      }
    } catch {}
  }

  // Auto-discover local peers
  async discoverLocal() {
    const knownPorts = [18789, 18790, 18791, 18792, 18793];
    for (const p of knownPorts) {
      if (p === this.port) continue;
      try {
        const res = await fetch(`http://127.0.0.1:${p}/acp/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'acp.info', params: {} }),
          signal: AbortSignal.timeout(1000),
        });
        const json = await res.json();
        if (json.result?.nodeId) {
          this.peers.set(json.result.nodeId, { ...json.result, url: `http://127.0.0.1:${p}`, lastSeen: new Date().toISOString() });
          await this.announceTo(`http://127.0.0.1:${p}`);
        }
      } catch {}
    }
  }

  // Mount ACP routes on an Express app
  mount(app, wss) {
    // JSON-RPC endpoint
    app.post('/acp/rpc', express_json_handler(async (req, res) => {
      const result = await this._handleRPC(req.body);
      res.json(result);
    }));

    // Peer info
    app.get('/acp/info', (req, res) => res.json({
      nodeId: this.nodeId, name: this.nodeName, version: ACP_VERSION, peers: [...this.peers.values()],
    }));

    // Handle WS connections for ACP events
    if (wss) {
      wss.on('connection', (ws, req) => {
        if (!req.url?.includes('/acp')) return;
        this._clients.add(ws);
        ws.send(JSON.stringify({ type: 'hello', nodeId: this.nodeId, name: this.nodeName }));
        ws.on('message', async data => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'rpc') {
              const result = await this._handleRPC(msg);
              ws.send(JSON.stringify({ type: 'rpc_result', ...result }));
            } else if (msg.type === 'event') {
              const handlers = this._subscriptions.get(msg.topic) || [];
              for (const h of handlers) h(msg.data);
            }
          } catch {}
        });
        ws.on('close', () => this._clients.delete(ws));
      });
    }

    // Auto-discover peers on startup
    setTimeout(() => this.discoverLocal().catch(() => {}), 3000);

    // Re-announce every 60s
    setInterval(() => {
      for (const peer of this.peers.values()) {
        this.announceTo(peer.url).catch(() => {});
      }
    }, 60000);
  }
}

// Simple middleware helper
function express_json_handler(fn) {
  return async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); }
  };
}
