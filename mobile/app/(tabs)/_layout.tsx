import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';

const TABS = [
  { name: 'index', title: 'Chat', icon: 'chatbubble-ellipses' },
  { name: 'skills', title: 'Skills', icon: 'flash' },
  { name: 'sessions', title: 'Sessions', icon: 'layers' },
  { name: 'memory', title: 'Memory', icon: 'library' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
] as const;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // On Android, add the bottom inset so the tab bar sits above the system nav bar
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 56 + bottomInset,
          paddingBottom: 8 + bottomInset,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? icon : `${icon}-outline` as any}
                size={22}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
