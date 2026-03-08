/**
 * ClawdBot-style Skills screen: list what the AI can do and tap to ask.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useSettingsStore } from '../stores/settings';
import { useSuggestedPromptStore } from '../stores/suggestedPrompt';
import { useTheme } from '../theme';

// Map gateway skill names to friendly prompt suggestions (ClawdBot-style)
const SKILL_PROMPTS: Record<string, string> = {
  email: 'Check my email and summarize new messages',
  weather: "What's the weather like?",
  'brave-search': 'Search the web for the latest news',
  'web-search': 'Search the web',
  calendar: "What's on my calendar today?",
  memory: 'What do you remember about me?',
  summarize: 'Summarize the last message',
  news: 'Get the latest news headlines',
  stocks: 'How are my stocks doing?',
  github: 'List my recent GitHub activity',
  shell: 'Run a command: list files in current directory',
  http: 'Fetch a URL and summarize it',
  browser: 'Open a webpage and summarize it',
  translate: 'Translate "Hello" to Spanish',
  pdf: 'Summarize this PDF',
  image: 'Describe this image',
  notes: 'Show my recent notes',
  reminders: 'What reminders do I have?',
  'home-assistant': 'Turn on the living room lights',
  'smart-home': 'What smart home devices are available?',
};

function promptForSkill(name: string, description?: string): string {
  const lower = name.toLowerCase().replace(/\s+/g, '-');
  if (SKILL_PROMPTS[lower]) return SKILL_PROMPTS[lower];
  if (SKILL_PROMPTS[name]) return SKILL_PROMPTS[name];
  if (description) return description;
  return `Use the ${name} skill`;
}

export default function SkillsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { gatewayUrl, authToken } = useSettingsStore();
  const setSuggestedPrompt = useSuggestedPromptStore(s => s.set);

  const [skills, setSkills] = useState<{ name: string; description?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gatewayUrl) {
      setSkills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.load().then(() => api.setGateway(gatewayUrl, authToken));
    api.getSkills()
      .then(setSkills)
      .catch((e) => {
        setError(e.message || 'Failed to load skills');
        setSkills([]);
      })
      .finally(() => setLoading(false));
  }, [gatewayUrl, authToken]);

  const onSkillPress = (skill: { name: string; description?: string }) => {
    const prompt = promptForSkill(skill.name, skill.description);
    setSuggestedPrompt(prompt);
    router.push('/(tabs)');
  };

  const s = makeStyles(theme);
  const numColumns = width > 400 ? 2 : 1;

  return (
    <View style={[s.container, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Text style={s.title}>What I can do</Text>
        <Text style={s.subtitle}>
          Tap a skill to ask OpenBot — same as ClawdBot
        </Text>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.hint}>Loading skills from gateway…</Text>
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.textDim} />
          <Text style={s.errorText}>{error}</Text>
          <Text style={s.hint}>Check Settings → Gateway URL and that the gateway is running.</Text>
        </View>
      ) : skills.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="extension-puzzle-outline" size={48} color={theme.textDim} />
          <Text style={s.emptyTitle}>No skills listed</Text>
          <Text style={s.hint}>Start the gateway with skills loaded, or connect in Settings.</Text>
        </View>
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(item) => item.name}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={s.list}
          columnWrapperStyle={numColumns === 2 ? s.row : undefined}
          renderItem={({ item }) => (
            <Pressable
              style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => onSkillPress(item)}
            >
              <View style={[s.iconWrap, { backgroundColor: theme.accentSurface }]}>
                <Ionicons name="flash" size={22} color={theme.accent} />
              </View>
              <Text style={[s.skillName, { color: theme.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={[s.skillDesc, { color: theme.textDim }]} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof import('../theme').useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { paddingHorizontal: 20, marginBottom: 16 },
    title: { color: theme.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    subtitle: { color: theme.textMuted, fontSize: 14, marginTop: 4 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    hint: { color: theme.textDim, fontSize: 13, marginTop: 12, textAlign: 'center' },
    errorText: { color: theme.danger, fontSize: 15, fontWeight: '600', textAlign: 'center' },
    emptyTitle: { color: theme.textMuted, fontSize: 17, fontWeight: '600', marginTop: 12 },
    list: { padding: 12, paddingBottom: 24 },
    row: { gap: 12, marginBottom: 12 },
    card: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
      minWidth: 0,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    skillName: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
    skillDesc: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  });
}
