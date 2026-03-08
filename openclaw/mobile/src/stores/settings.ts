/**
 * App settings store. Persists in AsyncStorage.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'openbot_settings';

interface Settings {
  gatewayUrl: string;
  authToken: string;
  defaultModel: string;
  defaultAgent: string;
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  streamingEnabled: boolean;
  hapticFeedback: boolean;
  notificationsEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  language: string;
  sendOnEnter: boolean;
  showTimestamps: boolean;
  showToolCalls: boolean;
}

interface SettingsStore extends Settings {
  isLoaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
}

const defaults: Settings = {
  gatewayUrl: '',  // Must be set in Settings or Onboarding — localhost doesn't work on a phone
  authToken: '',
  defaultModel: '',
  defaultAgent: 'default',
  theme: 'dark',
  fontSize: 15,
  streamingEnabled: true,
  hapticFeedback: true,
  notificationsEnabled: true,
  wakeWordEnabled: false,
  wakeWord: 'hey openbot',
  language: 'en',
  sendOnEnter: false,
  showTimestamps: true,
  showToolCalls: true,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaults,
  isLoaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({ ...defaults, ...saved, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  update: async (patch) => {
    set(patch);
    try {
      const current = get();
      const toSave: Partial<Settings> = {};
      for (const key of Object.keys(defaults) as (keyof Settings)[]) {
        (toSave as any)[key] = (current as any)[key];
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  },

  reset: async () => {
    set(defaults);
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
}));
