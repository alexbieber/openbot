<div align="center">
  <img src="ui/logo.svg" alt="OpenBot" width="100" height="100"/>
  <h1>OpenBot</h1>
  <p><strong>Your personal AI assistant. Self-hosted. Any platform. Any model.</strong></p>

  [![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
  [![License](https://img.shields.io/badge/License-MIT-a78bfa)](LICENSE)
  [![Skills](https://img.shields.io/badge/Skills-57-10b981)](skills/)
  [![Channels](https://img.shields.io/badge/Channels-22-2563eb)](gateway/channels/)
  [![Providers](https://img.shields.io/badge/AI%20Providers-28-7c3aed)](gateway/ai-router.js)
  [![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Linux%20%7C%20Windows-8b949e)](install.sh)
</div>

---

**Your personal AI assistant. Self-hosted. Any platform. Any model.**

OpenBot is a fully self-hosted AI agent you run on your own machine or server. Chat through a web browser, Telegram, Discord, WhatsApp, or 19 other messaging platforms — all powered by the AI model of your choice.

---

## Quick Start (2 minutes)

**Requirements:** Node.js 20+

```bash
# 1. Install dependencies
npm install

# 2. Add your API key (.env.example has all options)
cp .env.example .env
# Open .env and add:  ANTHROPIC_API_KEY=sk-ant-...

# 3. Start the gateway
npm start

# 4. Open the dashboard
# http://localhost:18789
```

That's it. The web UI opens at `http://localhost:18789`.

---

## Getting an API Key

OpenBot works with **28 AI providers**. Pick one:

| Provider | Get Key | Cost |
|---|---|---|
| **Anthropic Claude** (recommended) | [console.anthropic.com](https://console.anthropic.com) | Pay per use |
| **OpenAI GPT-4o** | [platform.openai.com](https://platform.openai.com) | Pay per use |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | Very cheap |
| **OpenRouter** (200+ models) | [openrouter.ai/keys](https://openrouter.ai/keys) | Pay per use |
| **Ollama** (local, free) | [ollama.ai](https://ollama.ai) | Free forever |
| **Groq** (fast, free tier) | [console.groq.com](https://console.groq.com) | Free tier |

Set the key in `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
# or
OPENAI_API_KEY=sk-your-key-here
# or
OLLAMA_URL=http://localhost:11434   # no key needed
```

---

## Features

### 57 Built-in Skills
| Category | Skills |
|---|---|
| Web | `web-search`, `browser`, `http`, `rss`, `firecrawl` |
| Files | `file`, `pdf`, `zip`, `markdown`, `json`, `base64` |
| Code | `shell`, `git`, `github`, `docker`, `database`, `code_review` |
| Media | `image`, `voice`, `screenshot`, `ocr`, `qr-code` |
| Info | `weather`, `news`, `stocks`, `crypto`, `translate` |
| Tools | `calendar`, `email`, `reminders`, `notes`, `memory` |
| System | `system`, `ping`, `dns`, `port-scan`, `ssl-check` |
| AI | `llm-task`, `summarize`, `canvas` |

### 22 Messaging Channels
Telegram · Discord · Slack · WhatsApp · Signal · iMessage · Matrix · Microsoft Teams · Google Chat · LINE · Mattermost · IRC · WeChat · Feishu · Zalo · Nostr · Synology Chat · Twitch · Nextcloud Talk · Outlook · Gmail PubSub · Web UI

### 5 Agents (from AGENTS.md)
- `@default` — General assistant
- `@coder` — Software engineering specialist
- `@researcher` — Deep research and analysis
- `@creative` — Writing and creative tasks
- `@devops` — Infrastructure and operations

---

## Configuration

All configuration lives in two places:

**`.env`** — API keys and secrets (never commit this file)
```bash
cp .env.example .env
# Edit .env with your keys
```

**`openbot.json`** — Gateway behavior (safe to commit)
```json5
{
  "model": "claude-sonnet-4-6",
  "port": 18789,
  "tools": { "exec": { "security": "deny" } }
}
```

**`SOUL.md`** — Agent personality
```markdown
---
name: OpenBot
personality: helpful, concise
---
You are a helpful AI assistant...
```

**`AGENTS.md`** — Define multiple agents
```markdown
## @coder
model: claude-opus-4-5
skills: [shell, git, github, file, web-search]
```

---

## Messaging Channels

Add your tokens to `.env` and they start automatically:

**Telegram:**
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
# Get from @BotFather on Telegram
```

**Discord:**
```bash
DISCORD_BOT_TOKEN=your_bot_token
# Create at discord.com/developers
```

**WhatsApp:**
```bash
# No token needed — scan QR code on first run
# Check the Channels panel at http://localhost:18789
```

**Slack:**
```bash
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_APP_TOKEN=xapp-your-app-token
```

---

## CLI

```bash
# Interactive setup wizard
openbot onboard

# Check everything is configured correctly
openbot doctor

# Manage agents
openbot agent list
openbot agent create

# Memory management
openbot memory search "python"
openbot memory add "My name is John"

# Run as background daemon
openbot daemon start
openbot daemon status
openbot daemon stop

# Manage cron jobs
openbot cron list
openbot cron add "0 9 * * *" "Give me a morning briefing"

# Gateway controls
openbot gateway start
openbot gateway status

# See all commands
openbot --help
```

---

## Directory Structure

```
openbot/
├── gateway/          # Core server (Express + WebSocket)
│   ├── server.js     # Main gateway entry point
│   ├── ai-router.js  # Routes to 28 AI providers
│   ├── skill-engine.js
│   ├── memory-manager.js
│   ├── session-manager.js
│   ├── channels/     # 22 messaging integrations
│   └── routes/       # REST API routes
├── skills/           # 57 built-in skills
├── agents/           # Agent definition files
├── cli/              # Command-line interface
│   └── commands/     # 28+ CLI commands
├── ui/               # Web dashboard (served at /)
├── mobile/           # React Native mobile app (Expo)
├── SOUL.md           # Agent personality
├── AGENTS.md         # Agent definitions
├── openbot.json      # Gateway configuration
└── .env              # Your API keys (never commit)
```

---

## Running in Production

**With PM2:**
```bash
npm install -g pm2
pm2 start gateway/server.js --name openbot
pm2 save
pm2 startup
```

**As a system daemon:**
```bash
openbot daemon install   # installs as launchd / systemd / Task Scheduler
openbot daemon start
```

**With Docker:**
```bash
docker-compose up -d
```

**On Cloudflare Workers:**
```bash
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your account ID
wrangler deploy
```

---

## Troubleshooting

**Chat returns "API key not configured"**
```bash
# Make sure .env has a key:
cat .env | grep API_KEY

# Then restart:
npm start
```

**Port 18789 already in use**
```bash
# Use a different port:
GATEWAY_PORT=3001 npm start
# or in openbot.json: "port": 3001
```

**Skills not loading**
```bash
openbot doctor        # diagnoses common issues
openbot skills list   # shows all loaded skills
```

**WebSocket disconnects**
The UI auto-reconnects. If persistent, check your firewall or reverse proxy settings (enable WebSocket upgrade).

---

## Mobile App

The mobile app (React Native / Expo) connects to your self-hosted gateway.

```bash
cd mobile
npm install
npx expo start
```

Set your gateway URL in the app's Settings screen: `http://your-server-ip:18789`

---

## License

MIT — use it, fork it, build on it.

---

## Acknowledgements

Built with: Node.js · Express · Anthropic SDK · OpenAI SDK · Discord.js · node-telegram-bot-api · whatsapp-web.js · Expo
