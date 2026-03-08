/**
 * openbot tui — terminal chat with streaming, model label, SSH-aware
 * Features: streaming responses, provider/model display, session context,
 *           slash commands, multi-agent switching
 */

import { createInterface } from 'readline';
import WebSocket from 'ws';
import axios from 'axios';

const PORT = process.env.GATEWAY_PORT || 18789;
const BASE = `http://127.0.0.1:${PORT}`;
const WS_BASE = `ws://127.0.0.1:${PORT}`;

const R = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const CLEAR_LINE = '\x1b[2K\r';

function detectProvider(model = '') {
  const m = model.toLowerCase();
  if (m.includes('claude')) return 'Anthropic';
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')) return 'OpenAI';
  if (m.includes('deepseek')) return 'DeepSeek';
  if (m.includes('gemini')) return 'Google';
  if (m.includes('llama') || m.includes('mistral') || m.includes('qwen')) return 'Local/Ollama';
  if (m.includes('kimi') || m.includes('moonshot')) return 'Moonshot';
  return 'Unknown';
}

export async function tui(opts = {}) {
  const agentId = opts.agent || 'default';
  const userId = `tui-${Date.now()}`;
  let currentModel = opts.model || '';
  let tokenUsage = { input: 0, output: 0 };

  // Check gateway
  let health;
  try {
    health = (await axios.get(`${BASE}/health`, { timeout: 3000 })).data;
    currentModel = currentModel || health.model || '';
  } catch {
    console.error(`${RED}✗ Gateway not running. Start with: openbot daemon start${R}`);
    process.exit(1);
  }

  const provider = detectProvider(currentModel);

  console.clear();
  console.log(`${BOLD}OpenBot TUI${R}`);
  console.log(`${DIM}  Agent:    ${agentId}${R}`);
  console.log(`${DIM}  Model:    ${currentModel || '?'} ${CYAN}(${provider})${R}`);
  console.log(`${DIM}  Skills:   ${health.skills || '?'}  Agents: ${health.agents || '?'}${R}`);
  console.log(`${DIM}  Type /help for commands · Ctrl+C to exit${R}\n`);
  console.log('─'.repeat(60));

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  function prompt() {
    const modelLabel = currentModel ? `${DIM}[${provider}/${currentModel.split('-').slice(-2).join('-')}]${R} ` : '';
    rl.setPrompt(`\n${modelLabel}${GREEN}You ›${R} `);
    rl.prompt();
  }

  let ws;
  let waitingResponse = false;

  function connectWS() {
    ws = new WebSocket(`${WS_BASE}?userId=${userId}&agentId=${agentId}`);

    ws.on('open', () => {
      if (process.env.DEBUG) console.log(`${DIM}[WS connected]${R}`);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'typing') {
          if (msg.typing) process.stdout.write(`\r${DIM}${CYAN}${agentId} is thinking...${R}`);
          return;
        }

        if (msg.type === 'token') {
          process.stdout.write(CLEAR_LINE);
          if (!waitingResponse) { process.stdout.write(`\n${MAGENTA}${agentId}${R} › `); waitingResponse = true; }
          process.stdout.write(msg.token);
          return;
        }

        if (msg.type === 'message') {
          process.stdout.write(CLEAR_LINE);
          if (waitingResponse) { process.stdout.write('\n'); waitingResponse = false; }
          else process.stdout.write(`\n${MAGENTA}${agentId}${R} › `);
          console.log(msg.content);

          // Show model/tokens if available
          if (msg.model) {
            const p = detectProvider(msg.model);
            const tok = msg.tokensUsed ? ` · ${msg.tokensUsed.input || 0}↑ ${msg.tokensUsed.output || 0}↓` : '';
            console.log(`${DIM}    ↳ ${p}/${msg.model}${tok}${R}`);
            currentModel = msg.model;
            if (msg.tokensUsed) { tokenUsage.input += msg.tokensUsed.input || 0; tokenUsage.output += msg.tokensUsed.output || 0; }
          }

          // Canvas notification
          if (msg.canvas) console.log(`${DIM}    ↳ Canvas updated: ${msg.canvas.title || msg.canvas.type}${R}`);

          waitingResponse = false;
          prompt();
          return;
        }

        if (msg.type === 'error') {
          process.stdout.write(CLEAR_LINE);
          console.log(`\n${RED}Error:${R} ${msg.error || msg.content}`);
          waitingResponse = false;
          prompt();
        }

        if (msg.type === 'canvas') {
          console.log(`\n${CYAN}[Canvas]${R} ${msg.canvas?.title || 'Updated'} — view in dashboard`);
        }
      } catch {}
    });

    ws.on('close', () => {
      console.log(`\n${YELLOW}[WS disconnected — reconnecting...]${R}`);
      setTimeout(connectWS, 2000);
    });

    ws.on('error', (err) => {
      if (process.env.DEBUG) console.error(`${RED}[WS error]${R}`, err.message);
    });
  }

  connectWS();

  // Give WS a moment to connect
  await new Promise(r => setTimeout(r, 500));
  prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { prompt(); return; }

    // Built-in slash commands
    if (text === '/quit' || text === '/exit') {
      console.log(`\n${DIM}Session tokens: ${tokenUsage.input}↑ ${tokenUsage.output}↓${R}\nGoodbye!`);
      ws?.close();
      process.exit(0);
    }
    if (text === '/clear') { console.clear(); prompt(); return; }
    if (text === '/help') {
      console.log(`
${BOLD}TUI Commands${R}
  ${CYAN}/clear${R}              Clear screen
  ${CYAN}/new${R} · ${CYAN}/reset${R}       Start new session
  ${CYAN}/model [name]${R}       Show or switch model
  ${CYAN}/agent [id]${R}         Switch agent
  ${CYAN}/skills${R}             List loaded skills
  ${CYAN}/context${R}            Context window usage
  ${CYAN}/compact${R}            Compress old context
  ${CYAN}/status${R}             Gateway + session info
  ${CYAN}/tokens${R}             Session token usage
  ${CYAN}/quit${R}               Exit TUI
`);
      prompt(); return;
    }
    if (text === '/tokens') {
      console.log(`\n${DIM}Session tokens: ${tokenUsage.input.toLocaleString()}↑ input · ${tokenUsage.output.toLocaleString()}↓ output${R}`);
      try {
        const usage = (await axios.get(`${BASE}/tokens`, { timeout: 2000 })).data;
        console.log(`${DIM}Total (all sessions): ${(usage.total_input||0).toLocaleString()}↑ · ${(usage.total_output||0).toLocaleString()}↓${R}`);
        if (usage.cache?.saved_tokens) console.log(`${DIM}Cache saved: ${usage.cache.saved_tokens.toLocaleString()} tokens${R}`);
      } catch {}
      prompt(); return;
    }
    if (text.startsWith('/model')) {
      const newModel = text.split(' ')[1];
      if (newModel) { currentModel = newModel; console.log(`${DIM}Model set to: ${newModel} (${detectProvider(newModel)})${R}`); }
      else console.log(`${DIM}Current model: ${currentModel || '?'} (${provider})${R}`);
      prompt(); return;
    }
    if (text.startsWith('/status')) {
      try {
        const h = (await axios.get(`${BASE}/health`, { timeout: 2000 })).data;
        console.log(`\n${BOLD}Gateway Status${R}`);
        console.log(`  Model:   ${h.model}  (${detectProvider(h.model)})`);
        console.log(`  Skills:  ${h.skills}   Agents: ${h.agents}`);
        console.log(`  Uptime:  ${Math.round(h.uptime)}s   Node: ${h.node}`);
      } catch { console.log(`${RED}Gateway unreachable${R}`); }
      prompt(); return;
    }

    // Send via WebSocket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log(`${YELLOW}Not connected to gateway. Reconnecting...${R}`);
      prompt(); return;
    }

    waitingResponse = false;
    ws.send(JSON.stringify({ type: 'message', content: text, agentId, userId }));
  });

  rl.on('close', () => {
    console.log(`\n${DIM}Session ended. Tokens: ${tokenUsage.input}↑ ${tokenUsage.output}↓${R}`);
    ws?.close();
    process.exit(0);
  });
}

export function registerTUICommand(program) {
  program.command('tui')
    .description('Interactive terminal chat with streaming')
    .option('-a, --agent <id>', 'Agent to use', 'default')
    .option('-m, --model <name>', 'Override model')
    .option('--no-stream', 'Disable streaming (polling mode)')
    .action((opts) => tui(opts));
}
