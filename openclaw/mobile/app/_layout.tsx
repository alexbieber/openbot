import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { api } from '../src/services/api';
import { useChatStore } from '../src/stores/chat';
import { useSettingsStore } from '../src/stores/settings';
import { registerForPushNotifications, setupNotificationListeners } from '../src/services/notifications';
import { useTheme } from '../src/theme';

const SPLASH_BG = '#0f172a';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const { loadFromStorage } = useChatStore();
  const { load: loadSettings, gatewayUrl, authToken, notificationsEnabled } = useSettingsStore();
  const theme = useTheme();

  useEffect(() => {
    async function init() {
      await loadSettings();
      await loadFromStorage();
      await api.load();

      const url = gatewayUrl || '';
      if (url) await api.setGateway(url, authToken);

      if (notificationsEnabled) {
        await registerForPushNotifications();
      }

      await SplashScreen.hideAsync();
      setAppReady(true);
    }

    init();

    const cleanup = setupNotificationListeners(
      (n) => console.log('[Notification received]', n.request.content.title),
      (r) => console.log('[Notification tapped]', r.notification.request.content.data),
    );
    return cleanup;
  }, []);

  if (!appReady) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG }]}>
        <StatusBar style="light" />
        <View style={splashStyles.center}>
          <Image source={require('../assets/icon.png')} style={splashStyles.logo} resizeMode="contain" />
          <Text style={splashStyles.title}>OpenBot</Text>
          <Text style={splashStyles.subtitle}>Your self-hosted AI assistant</Text>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={theme.statusBar === 'dark-content' ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const splashStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    marginTop: 8,
  },
});
