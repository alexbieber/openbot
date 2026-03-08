# OpenBot on Cloudflare Workers

Run OpenBot as a **serverless edge function** on Cloudflare's global network.
Zero ops, scales automatically, free tier includes 100,000 requests/day.

## Architecture

```
Internet → Cloudflare Edge → Worker (HTTP + WebSocket via Durable Objects)
                                       ↓
                              KV Store (sessions, memory)
                                       ↓
                        AI API (Anthropic, OpenAI, Gemini)
```

## Quick Deploy

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

# Create KV namespaces
npx wrangler kv:namespace create SESSIONS
npx wrangler kv:namespace create MEMORY
# → Copy the IDs into wrangler.toml

# Set secrets
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put GATEWAY_AUTH_TOKEN  # optional

# Deploy
npm run deploy:cf
# → https://openbot-gateway.YOUR-SUBDOMAIN.workers.dev
```

## Configure Telegram Webhook

After deploying, register your Cloudflare URL with Telegram:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=https://openbot-gateway.YOUR-SUBDOMAIN.workers.dev/channels/telegram/webhook"
```

## Available Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check, returns version + region |
| `/chat` | POST | Chat REST API: `{ message, agentId, sessionId, model }` |
| `/sessions/reset` | POST | Reset a session: `{ sessionId }` |
| `/memory` | GET/POST | KV memory read/write |
| `/channels/telegram/webhook` | POST | Telegram webhook receiver |
| WebSocket `/` | WS | Real-time WebSocket connection |

## Differences from Local Gateway

| Feature | Local Gateway | Cloudflare Worker |
|---|---|---|
| Skills / tools | 57 built-in skills | REST + AI only (no Node.js exec) |
| Channels | 20 channels | Telegram via webhook |
| Memory | Files + SQLite | Cloudflare KV |
| Sessions | Disk | Cloudflare KV (7-day TTL) |
| Wake word | ✅ | ❌ |
| Docker sandbox | ✅ | ❌ |
| Cost | Self-hosted | Free tier: 100K req/day |
| Latency | ~5ms (local) | ~50ms (global edge) |

## Custom Domain

Uncomment and edit in `wrangler.toml`:
```toml
routes = [
  { pattern = "bot.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```
