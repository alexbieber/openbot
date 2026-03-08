# OpenBot: App vs Web App vs ClawdBot-style

This document compares **(1)** the native app vs the web app (same codebase, different platforms) and **(2)** OpenBot with a **ClawdBot-style** assistant (the UX pattern referenced in code: suggestion chips and capability-focused prompts).

---

## 1. App vs Web App

OpenBot uses a **single codebase**: Expo (React Native) with `react-native-web`. The **app** is the native build (iOS/Android); the **web app** is the same source run in the browser.

| Aspect | Native app (iOS/Android) | Web app (browser) |
|--------|---------------------------|-------------------|
| **Codebase** | Same (`openclaw/mobile`) | Same |
| **Entry** | Expo app / EAS build | `expo start --web` or Metro web bundler |
| **Storage** | `expo-secure-store` (keychain/Keystore) | `localStorage` (see `api.ts`) |
| **Push notifications** | Expo push; device token sent to gateway | Not supported (`notifications.ts` returns `null` on web) |
| **Camera / location** | Native permissions (infoPlist / Android permissions) | Browser APIs (getUserMedia, geolocation) where supported |
| **Haptics** | `expo-haptics` | No-op or limited in browser |
| **Keyboard** | `KeyboardAvoidingView` with OS-specific `behavior` (iOS `padding`, Android `height`) | Same component; behavior may differ by browser |
| **Safe area** | `react-native-safe-area-context` (notch, home indicator) | Same; insets from browser viewport |
| **Tabs / layout** | Bottom tabs; Android gets extra bottom inset for nav bar | Same UI |
| **Features** | Chat, Skills, Sessions, Memory, Settings, voice (PTT), camera, agent picker | Same features; voice/camera depend on browser support |

**Summary:** The web app is the same product with: **no push notifications**, **localStorage instead of SecureStore**, and **browser-dependent** behavior for camera, mic, and location. All core flows (gateway, chat, streaming, agents, memory, sessions, skills) are shared.

---

## 2. OpenBot vs ClawdBot-style

The codebase refers to **“ClawdBot-style”** in `ChatScreen.tsx`: suggestion chips that describe what the AI can do (e.g. email, calendar, search, weather, summarize). Below is a direct comparison of **OpenBot** (app + web) with that style of assistant.

| Feature | ClawdBot-style (reference) | OpenBot (app + web) |
|--------|----------------------------|----------------------|
| **Suggestion chips** | Short capability prompts (email, calendar, search, weather, summarize, “What can you do?”) | Same idea: `SUGGESTIONS` in `ChatScreen` — “Check my email”, “What’s on my calendar today?”, “Search the web…”, “What’s the weather?”, “Summarize…”, “What can you do?” |
| **Hosting** | Often cloud / vendor-hosted | Self-hosted: you set **Gateway URL** (and optional auth) in Settings; all traffic to your OpenBot gateway |
| **Agents / models** | Single bot or fixed set | **Multi-agent**: list from gateway, switch in UI (agent picker); default model override in Settings |
| **Streaming** | Common in modern chatbots | **Yes**: optional in Settings; SSE streaming with abort; typing indicator and streaming bubble |
| **Tools / skills** | Depends on product | **Skills** tab lists gateway skills (e.g. web-search, brave-search, browser, email, calendar); tool calls can be shown in messages (Settings) |
| **Sessions** | Sometimes single thread | **Sessions** tab: list from gateway; delete/reset per session |
| **Memory** | Sometimes none or limited | **Memory** tab: save and search memories via gateway (`/memory`) |
| **Voice** | Optional | **Push-to-talk** in app (and web if browser supports mic); transcript + response sent as messages |
| **Attachments / camera** | Varies | **Camera** and attachments: capture or pick image, send with message |
| **Notifications** | Common on mobile | **Push** on native app only; token registered with gateway; web has no push |
| **Theme** | Varies | Light/dark/system in Settings; consistent theme across app and web |

**Summary:** OpenBot already follows a **ClawdBot-style** empty state (suggestion chips for capabilities). It adds **self-hosted gateway**, **multi-agent**, **sessions**, **memory**, **skills visibility**, **streaming**, **voice (PTT)**, and **camera/attachments**. The main gap vs a typical “always-on” cloud assistant is **no push on web** and **no wake word** (only PTT).

---

## 3. Quick reference

- **App** = Native (iOS/Android) build of `openclaw/mobile`; full push and secure storage.
- **Web app** = Same code in the browser; no push; storage in `localStorage`.
- **ClawdBot-style** = UX pattern of “what the AI can do” suggestion chips; OpenBot implements this and extends it with gateway, agents, sessions, memory, and tools.

For implementation details, see `openclaw/mobile/src/screens/ChatScreen.tsx` (SUGGESTIONS, streaming, PTT), `openclaw/mobile/src/services/api.ts` (gateway, storage, web vs native), and `openclaw/mobile/src/services/notifications.ts` (push only when not web).
