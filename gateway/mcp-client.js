/**
 * MCP (Model Context Protocol) Client
 * Connects OpenBot to any MCP server — stdio, HTTP SSE, or WebSocket transport.
 * Every ClawHub skill in ClawdBot is an MCP server; this makes OpenBot compatible.
 *
 * Spec: https://modelcontextprotocol.io/
 *
 * Config (openbot.json):
 *   mcp:
 *     servers:
 *       github:
 *         command: "npx"
 *         args: ["-y", "@modelcontextprotocol/server-github"]
 *         env: { GITHUB_TOKEN: "..." }
 *       filesystem:
 *         command: "npx"
 *         args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
 *       brave-search:
 *         command: "npx"
 *         args: ["-y", "@modelcontextprotocol/server-brave-search"]
 *         env: { BRAVE_API_KEY: "..." }
 *       postgres:
 *         command: "npx"
 *         args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]
 *       remote-sse:
 *         url: "https://mcp.example.com/sse"
 *         headers: { Authorization: "Bearer ..." }
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

const MCP_VERSION = '2024-11-05';

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────
function rpcRequest(method, params, id) {
  return JSON.stringify({ jsonrpc: '2.0', id: id || randomBytes(4).toString('hex'), method, params });
}
function rpcNotification(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', method, params });
}

// ── Stdio transport ───────────────────────────────────────────────────────────
class StdioTransport extends EventEmitter {
  constructor({ command, args = [], env = {}, cwd }) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this._proc = null;
    this._rl = null;
    this._pendingResponses = new Map();
  }

  async connect() {
    this._proc = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._proc.on('exit', (code) => {
      this.emit('close', code);
    });

    this._proc.stderr.on('data', (d) => {
      if (process.env.MCP_DEBUG) console.error(`[MCP:${this.command}]`, d.toString().trim());
    });

    this._rl = createInterface({ input: this._proc.stdout });
    this._rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        this._handleMessage(msg);
      } catch {}
    });
  }

  _handleMessage(msg) {
    if (msg.id && this._pendingResponses.has(msg.id)) {
      const { resolve, reject } = this._pendingResponses.get(msg.id);
      this._pendingResponses.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      this.emit('notification', msg);
    }
  }

  send(json) {
    if (this._proc?.stdin?.writable) {
      this._proc.stdin.write(json + '\n');
    }
  }

  async request(method, params, timeoutMs = 30000) {
    const id = randomBytes(4).toString('hex');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingResponses.delete(id);
        reject(new Error(`MCP timeout: ${method}`));
      }, timeoutMs);

      this._pendingResponses.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.send(rpcRequest(method, params, id));
    });
  }

  close() {
    this._proc?.kill('SIGTERM');
    this._rl?.close();
  }
}

// ── HTTP SSE transport ────────────────────────────────────────────────────────
class SSETransport extends EventEmitter {
  constructor({ url, headers = {} }) {
    super();
    this.url = url;
    this.headers = headers;
    this._pendingResponses = new Map();
    this._postUrl = null;
    this._eventSource = null;
  }

  async connect() {
    // Fetch SSE stream
    const res = await fetch(this.url, {
      headers: { Accept: 'text/event-stream', ...this.headers },
    });
    if (!res.ok) throw new Error(`MCP SSE connect failed: ${res.status}`);

    // Extract endpoint URL from first event
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { this.emit('close'); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.startsWith('http')) {
              this._postUrl = data.trim(); // endpoint for sending
            } else {
              try {
                const msg = JSON.parse(data);
                this._handleMessage(msg);
              } catch {}
            }
          }
        }
      }
    };
    pump();
  }

  _handleMessage(msg) {
    if (msg.id && this._pendingResponses.has(msg.id)) {
      const { resolve, reject } = this._pendingResponses.get(msg.id);
      this._pendingResponses.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      this.emit('notification', msg);
    }
  }

  async send(json) {
    const url = this._postUrl || this.url.replace('/sse', '/message');
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: json,
    });
  }

  async request(method, params, timeoutMs = 30000) {
    const id = randomBytes(4).toString('hex');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingResponses.delete(id);
        reject(new Error(`MCP SSE timeout: ${method}`));
      }, timeoutMs);
      this._pendingResponses.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.send(rpcRequest(method, params, id));
    });
  }

  close() {}
}

// ── MCP Server connection ─────────────────────────────────────────────────────
class MCPServer {
  constructor(name, cfg) {
    this.name = name;
    this.cfg = cfg;
    this._transport = null;
    this._tools = [];
    this._resources = [];
    this._prompts = [];
    this._connected = false;
  }

  async connect() {
    if (this.cfg.url) {
      this._transport = new SSETransport({ url: this.cfg.url, headers: this.cfg.headers });
    } else {
      this._transport = new StdioTransport({
        command: this.cfg.command,
        args: this.cfg.args || [],
        env: this.cfg.env || {},
        cwd: this.cfg.cwd,
      });
    }

    await this._transport.connect();

    // Initialize handshake
    const initResult = await this._transport.request('initialize', {
      protocolVersion: MCP_VERSION,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: 'openbot', version: '1.0.0' },
    });

    // Send initialized notification
    this._transport.send(rpcNotification('notifications/initialized', {}));

    this._connected = true;

    // Discover tools
    await this._discoverCapabilities();

    console.log(`[MCP] Connected: ${this.name} (${this._tools.length} tools, ${this._resources.length} resources)`);
    return this;
  }

  async _discoverCapabilities() {
    try {
      const toolsResult = await this._transport.request('tools/list', {});
      this._tools = toolsResult?.tools || [];
    } catch {}

    try {
      const resourcesResult = await this._transport.request('resources/list', {});
      this._resources = resourcesResult?.resources || [];
    } catch {}

    try {
      const promptsResult = await this._transport.request('prompts/list', {});
      this._prompts = promptsResult?.prompts || [];
    } catch {}
  }

  async callTool(name, args = {}) {
    const result = await this._transport.request('tools/call', { name, arguments: args });
    return result;
  }

  async readResource(uri) {
    return this._transport.request('resources/read', { uri });
  }

  async getPrompt(name, args = {}) {
    return this._transport.request('prompts/get', { name, arguments: args });
  }

  get tools() { return this._tools; }
  get resources() { return this._resources; }
  get connected() { return this._connected; }

  disconnect() {
    this._transport?.close();
    this._connected = false;
  }
}

// ── MCP Client Manager ────────────────────────────────────────────────────────
export class MCPClient {
  constructor(config = {}) {
    this._servers = new Map();
    this._config = config?.mcp?.servers || {};
  }

  async connectAll() {
    const entries = Object.entries(this._config);
    if (!entries.length) return;

    console.log(`[MCP] Connecting to ${entries.length} server(s)...`);
    await Promise.allSettled(entries.map(async ([name, cfg]) => {
      try {
        const server = new MCPServer(name, cfg);
        await server.connect();
        this._servers.set(name, server);
      } catch (err) {
        console.warn(`[MCP] Failed to connect "${name}": ${err.message}`);
      }
    }));
  }

  async connectServer(name, cfg) {
    const server = new MCPServer(name, cfg);
    await server.connect();
    this._servers.set(name, server);
    return server;
  }

  disconnectServer(name) {
    this._servers.get(name)?.disconnect();
    this._servers.delete(name);
  }

  /**
   * Get all tools from all connected MCP servers, formatted for AI providers.
   * Returns tools in Anthropic/OpenAI tool format.
   */
  getAllTools(format = 'anthropic') {
    const tools = [];
    for (const [serverName, server] of this._servers) {
      for (const tool of server.tools) {
        const prefixedName = `${serverName}__${tool.name}`;
        if (format === 'anthropic') {
          tools.push({
            name: prefixedName,
            description: `[${serverName}] ${tool.description || tool.name}`,
            input_schema: tool.inputSchema || { type: 'object', properties: {} },
          });
        } else {
          tools.push({
            type: 'function',
            function: {
              name: prefixedName,
              description: `[${serverName}] ${tool.description || tool.name}`,
              parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
          });
        }
      }
    }
    return tools;
  }

  /**
   * Execute an MCP tool call.
   * toolName format: "serverName__toolName" or "serverName.toolName"
   */
  async executeTool(toolName, args = {}) {
    const sep = toolName.includes('__') ? '__' : '.';
    const [serverName, ...rest] = toolName.split(sep);
    const actualToolName = rest.join(sep);

    const server = this._servers.get(serverName);
    if (!server) throw new Error(`MCP server not found: ${serverName}`);
    if (!server.connected) throw new Error(`MCP server not connected: ${serverName}`);

    const result = await server.callTool(actualToolName, args);

    // Extract text content from MCP result
    if (Array.isArray(result?.content)) {
      const texts = result.content.filter(c => c.type === 'text').map(c => c.text);
      return { ok: !result.isError, output: texts.join('\n'), raw: result };
    }
    return { ok: true, output: JSON.stringify(result), raw: result };
  }

  isMCPTool(toolName) {
    const sep = toolName.includes('__') ? '__' : '.';
    const serverName = toolName.split(sep)[0];
    return this._servers.has(serverName);
  }

  listServers() {
    return [...this._servers.values()].map(s => ({
      name: s.name,
      connected: s.connected,
      tools: s.tools.length,
      resources: s.resources.length,
    }));
  }

  listAllTools() {
    const result = [];
    for (const [serverName, server] of this._servers) {
      for (const tool of server.tools) {
        result.push({ server: serverName, name: tool.name, description: tool.description });
      }
    }
    return result;
  }

  disconnectAll() {
    for (const server of this._servers.values()) server.disconnect();
    this._servers.clear();
  }
}
