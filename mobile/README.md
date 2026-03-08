# OpenBot Mobile

React Native (Expo) app for iOS and Android. Connects to your self-hosted OpenBot gateway.

## Features

- Full chat UI with Markdown rendering, code blocks, tables
- Streaming responses (SSE)
- File/image attachments
- Multiple conversation sessions
- Push notifications via Expo Notifications
- Dark mode, adjustable font size
- Gateway URL + auth token configuration
- Wake word detection support
- Camera, GPS, document picker integration
- Onboarding screen for gateway setup

## Development

```bash
# Install dependencies
cd mobile
npm install

# Start dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

## Build & Submit

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Build for both platforms
npm run build:preview

# Submit to App Store / Play Store
npm run submit:ios
npm run submit:android
```

## Configuration

Edit `app.json`:
- `expo.ios.bundleIdentifier` — your Apple bundle ID (e.g. `ai.yourname.openbot`)
- `expo.android.package` — your Android package name
- `expo.plugins[1]` — Expo Notifications project ID from EAS dashboard

## Architecture

```
mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout (init, push notifications)
│   ├── onboarding.tsx      # First-run gateway setup
│   └── (tabs)/             # Tab navigation
│       ├── index.tsx       # Chat tab
│       ├── sessions.tsx    # Sessions tab
│       └── settings.tsx    # Settings tab
├── src/
│   ├── components/
│   │   ├── MessageBubble.tsx  # Chat message with Markdown
│   │   └── ChatInput.tsx      # Input bar with attachments
│   ├── screens/
│   │   ├── ChatScreen.tsx     # Main chat screen
│   │   ├── SessionsScreen.tsx # Conversation manager
│   │   └── SettingsScreen.tsx # Gateway & app settings
│   ├── services/
│   │   ├── api.ts             # Gateway HTTP/WS client
│   │   └── notifications.ts   # Push notification setup
│   └── stores/
│       ├── chat.ts            # Chat state (Zustand)
│       └── settings.ts        # Settings state (Zustand)
└── assets/                    # Icons, splash screen
```
