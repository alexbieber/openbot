/**
 * CLI Agent Command
 * Send a message to the agent via REST API or direct if gateway not running.
 */

import { createInterface } from 'readline';

const GATEWAY = 'http://127.0.0.1:18789';

export async function agent({ message, agent: agentId = 'default', thinking }) {
  // Interactive REPL if no message provided
  if (!message) {
    return startRepl(agentId);
  }

  await sendMessage(message, agentId);
}

async function sendMessage(message, agentId) {
  process.stdout.write('\n🤔 ');

  // Spinner
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const spinner = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} Thinking...`);
  }, 80);

  try {
    const res = await fetch(`${GATEWAY}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, agentId, userId: 'cli-user', channel: 'cli' }),
    });

    clearInterval(spinner);
    process.stdout.write('\r                    \r');

    if (!res.ok) {
      const err = await res.json();
      console.error(`\n⚠️  Error: ${err.error}`);
      return;
    }

    const data = await res.json();
    console.log(`\nOpenBot: ${data.response.content}`);
    if (data.response.toolsUsed?.length) {
      console.log(`\n   [Tools used: ${data.response.toolsUsed.join(', ')}]`);
    }
  } catch (err) {
    clearInterval(spinner);
    process.stdout.write('\r                    \r');
    if (err.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Gateway not running. Start it with: npm start\n');
    } else {
      console.error(`\n⚠️  ${err.message}\n`);
    }
  }
}

async function startRepl(agentId) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nOpenBot — Interactive Chat (Ctrl+C to exit)\n');

  const prompt = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\nGoodbye! 👋\n');
        rl.close();
        return;
      }
      await sendMessage(trimmed, agentId);
      console.log('');
      prompt();
    });
  };

  prompt();
}
