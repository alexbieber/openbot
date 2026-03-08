# OpenClaw / OpenBot App — Workflow (ClawdBot-style)

This document describes how the app (mobile + gateway) works from startup to chat, skills, and settings.

---

## 1. App startup (mobile)

**Entry:** `app/_layout.tsx` (root layout)

1. **Splash** — `expo-splash-screen` keeps the splash (app icon on dark background) visible until init finishes.
2. **Init (async):**
   - `loadSettings()` — load persisted settings from AsyncStorage (gateway URL, auth token, theme, streaming, etc.).
   - `loadFromStorage()` — load chat sessions and current session from AsyncStorage.
   - `api.load()` — load gateway URL and auth token from SecureStore (or `localStorage` on web).
   - If a gateway URL is set, `api.setGateway(url, authToken)` configures the API client.
   - If notifications are enabled, `registerForPushNotifications()` runs.
3. **Splash hidden** — then the app shows the main UI.
4. **No redirect** — the app opens directly to the **main (tabs)** screen; there is no upfront “connect to gateway” screen. Gateway can be configured later in **Settings**.

---

## 2. Navigation structure

- **Stack (root):**
  - `(tabs)` — main tab navigator (default screen).
  - `onboarding` — optional “Connect to your gateway” screen (reachable via link or deep link, not shown automatically).
- **Tabs** (`app/(tabs)/_layout.tsx`):
  - **Chat** (`index`) — main chat screen.
  - **Skills** — list gateway skills; tap to set a suggested prompt and go to Chat.
  - **Sessions** — list and switch/delete conversations.
  - **Memory** — view/search/save memories (gateway-backed).
  - **Settings** — gateway URL, auth token, theme, streaming, notifications, etc.

---

## 3. Chat flow

**Screen:** `src/screens/ChatScreen.tsx`

1. **Mount** — ChatScreen loads; if `gatewayUrl` is set, it calls `api.health()` and `api.getAgents()` to update connection status and agent list.
2. **Messages** — come from `useChatStore()`: `currentMessages()` for the current session. Sessions and messages are persisted in AsyncStorage via the chat store.
3. **Sending a message:**
   - User types (and/or adds attachments) and sends.
   - `addMessage()` adds the user message to the current session.
   - If **streaming** is on (default): `api.streamChat()` is used — GET `/stream?message=...&agentId=...&userId=...` (SSE). Chunks are applied with `updateStreamingContent()`; on done, the full reply is added as an assistant message.
   - If streaming is off: `api.chat()` — POST `/message` with JSON body; the single response is added as an assistant message.
4. **Abort** — in-stream cancel uses an `AbortController`; the stream is stopped and state is cleared.
5. **Empty state** — ClawdBot-style suggestion chips (email, calendar, search, weather, summarize, “What can you do?”); tapping one sends that as the user message.
6. **Suggested prompt** — from the Skills tab: when the user taps a skill, `useSuggestedPromptStore` is set; ChatInput uses `consume()` on focus to pre-fill and send/focus the input.

**Sidebar (menu):** Slide-in drawer with app icon, gateway URL, connection status, “New conversation”, session list, and links to Memory, Settings, Skills. No drawer navigator — custom `Sidebar` component toggled by menu button.

---

## 4. Gateway connection

- **Storage:** Gateway URL and auth token are in **SecureStore** (mobile) or **localStorage** (web), and also mirrored in the settings store (AsyncStorage) for the UI.
- **Configuration:** User sets **Gateway URL** (and optional **Auth Token**) in **Settings** (or on the onboarding screen if they open it). “Test Connection” calls `api.health()`.
- **API base:** All mobile API calls use the stored base URL (e.g. `http://192.168.1.100:18789`). No automatic redirect to onboarding; app opens straight to Chat.

---

## 5. API ↔ Gateway mapping (mobile → gateway)

| Mobile API | Gateway endpoint | Purpose |
|------------|------------------|--------|
| `api.health()` | GET `/health` | Health check, version, model, skills count |
| `api.chat()` | POST `/message` | Non-streaming chat |
| `api.streamChat()` | GET `/stream?message=...&agentId=...&userId=...` | SSE streaming chat |
| `api.getAgents()` | GET `/agents` | List agents (from gateway) |
| `api.getSkills()` | GET `/skills` | List skills (ClawdBot-style capabilities) |
| `api.getSessions()` | GET `/sessions` | List server-side sessions |
| `api.deleteSession()` | DELETE `/sessions/:id` | Delete a session |
| `api.saveMemory()` | POST `/memory` | Save memory with optional tags |
| `api.searchMemory()` | GET `/memory?q=...` | Search/list memories |
| `api.deleteMemory()` | DELETE `/memory/:id` | Delete a memory |
| `api.uploadFile()` | POST `/upload` | Upload file (multipart) for attachments |
| `api.pushToTalk()` | POST `/push-to-talk` | Voice: send audio, get transcript + response |
| WebSocket | `ws://host/` (root) | Optional real-time messages (identify with `userId`, `agentId`, `channel: 'mobile'`) |

---

## 6. Gateway server (high level)

**Entry:** `gateway/server.js`

- **Config:** Loaded from env + `config/loader.js` + `openbot.json`; `gateway.host` (e.g. `0.0.0.0`) and `gateway.port` (e.g. `18789`).
- **Core services:** AI router, skill engine, memory manager, session manager, agent loader, heartbeat, cron, hooks, agent router, system prompt builder, MCP client, etc.
- **HTTP + WebSocket:** Express app for REST; WebSocket server on the same port (root path). `/message` and `/stream` drive the AI pipeline; skills are executed by the skill engine; memory and sessions are persisted on disk.

---

## 7. Skills (ClawdBot-style)

- **Skills screen:** Fetches `GET /skills` from the gateway and shows a list. Tapping a skill sets a **suggested prompt** (from a fixed map or the skill description) and navigates to **Chat**; the chat input can pre-fill and focus so the user can send or edit.
- **Empty-state chips** on Chat (email, calendar, search, weather, summarize, “What can you do?”) are fixed shortcuts that send that text as the first user message.

---

## 8. Data persistence (mobile)

- **Settings:** AsyncStorage key `openbot_settings` (theme, gateway URL, auth token, streaming, haptics, etc.).
- **Gateway credentials:** SecureStore keys `openbot_gateway_url`, `openbot_auth_token` (and mirrored in settings for display).
- **Chat:** AsyncStorage key `openbot_chat_history` — sessions array and `currentSessionId`; each session has `id`, `agentId`, `label`, `messages`, `createdAt`, `updatedAt`. Max 200 messages per session in memory.

---

## 9. Notifications

- **Setup:** In root layout, if `notificationsEnabled`, `registerForPushNotifications()` runs. Listeners are registered for received and tapped notifications.
- **Devices:** Gateway can register devices (e.g. POST `/devices/register`) for push delivery; the mobile app can receive and handle notifications when the app is in background or closed.

---

## 10. Summary flow (user perspective)

1. **Open app** → Splash (app icon) → Main tab screen (Chat by default).
2. **Optional:** Open **Settings** → set Gateway URL (and token) → Test Connection.
3. **Chat:** Type (or use suggestion chips / Skills tab) → send → streamed or one-shot reply from gateway; sidebar for new conversation and session list.
4. **Skills:** Open Skills tab → tap skill → go to Chat with suggested prompt.
5. **Sessions / Memory:** Managed via tabs and sidebar; data persisted locally (sessions) and on gateway (memory, server-side sessions if used).

This is the workflow of the app built by ClawdBot (OpenClaw/OpenBot mobile + gateway).

---

## Comparison: This repo vs ClawdBot/OpenClaw product (“ours”)

Below is how **this codebase’s workflow** lines up with the **ClawdBot/OpenClaw product** as described publicly (self‑hosted AI that does real tasks, 50+ integrations, chat platforms).

| Aspect | ClawdBot/OpenClaw (product / “ours”) | This repo (implemented workflow) |
|--------|--------------------------------------|-----------------------------------|
| **Access / channels** | WhatsApp, Telegram, Discord, Slack, Signal, iMessage, plus mobile/web app | **Mobile app** (Expo) + **WebSocket/HTTP** as “mobile” channel. Gateway has **Gmail, WeChat, Outlook** webhooks in code; other channels (WhatsApp, Slack, etc.) are gateway-level, not in the mobile app. |
| **Core UX** | Chat with an AI that can run skills (email, calendar, browser, shell, etc.) | **Same idea:** Chat tab, streaming/non‑streaming, suggestion chips, **Skills** tab that lists gateway skills and suggests prompts. Sessions, Memory, Settings. |
| **Skills / capabilities** | Email, calendar, travel, smart home, browser, file system, shell, 50+ integrations | **Gateway** has a skill engine and exposes `GET /skills`. Mobile shows that list and maps skills to suggested prompts (email, weather, search, calendar, etc.). Actual execution is on the gateway (skills folder, MCP, etc.). |
| **Memory** | Persistent memory that learns preferences and past context | **Aligned:** Gateway has MemoryManager; mobile has Memory tab and `saveMemory` / `searchMemory` / `deleteMemory` API. |
| **Agents** | Multiple agents / personas | **Aligned:** Gateway has agent loader and `/agents`; mobile fetches agents and can switch agent in chat. |
| **Self‑hosted** | 100% self‑hosted; data stays on your machine | **Aligned:** Mobile is a client; gateway runs on your server (or LAN). Gateway URL and auth configured in Settings. |
| **Models** | Claude, GPT, Ollama, other APIs | **Gateway** (AI router) handles model config; mobile just sends messages and displays replies. |
| **Voice** | Voice input / push‑to‑talk | **Aligned:** Mobile has push‑to‑talk; gateway exposes `POST /push-to-talk`. |
| **First‑run experience** | Often “connect to backend” or similar | **Ours:** App opens straight to main tabs (no mandatory “connect to gateway” screen); user configures gateway in **Settings** when needed. |
| **Notifications** | Notifications from the assistant | **Aligned:** Mobile registers for push; gateway has `/devices/register` and can send notifications to devices. |

**Summary**

- **Aligned with “ours”:** Chat‑first UX, skills discovery, memory, agents, self‑hosted gateway, streaming, voice (PTT), notifications, optional onboarding.
- **Difference in scope:** “Ours” (product) is described as many **channels** (WhatsApp, Slack, etc.) and **50+ integrations**. In **this repo**, the mobile app is one channel (HTTP + WebSocket); the gateway implements a subset of channels (e.g. Gmail, WeChat, Outlook) and skills. Adding more channels or integrations is done in the **gateway** (and config), not by changing the mobile workflow doc.
- **Intent:** This repo’s workflow is the **mobile app + gateway as implemented**; “ours” is the **product vision**. They match in flow and concepts; the comparison above is where they align and where the repo’s scope is narrower (channel/integration count).
