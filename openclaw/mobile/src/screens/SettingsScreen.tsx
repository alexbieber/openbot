import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Switch, ScrollView,
  Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useSettingsStore } from '../stores/settings';
import { useChatStore } from '../stores/chat';
import { useTheme } from '../theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const { setConnected } = useChatStore();
  const theme = useTheme();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<null | { ok: boolean; msg: string }>(null);

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      await api.setGateway(settings.gatewayUrl, settings.authToken);
      const health = await api.health();
      setConnectionStatus({ ok: true, msg: `Connected · v${health.version} · ${health.model}` });
      setConnected(true);
    } catch (err: any) {
      setConnectionStatus({ ok: false, msg: err.message || 'Failed' });
      setConnected(false);
    } finally {
      setTestingConnection(false);
    }
  };

  const s = makeStyles(theme);

  return (
    <ScrollView style={[s.container, { paddingTop: insets.top }]} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Settings</Text>

      {/* Gateway */}
      <Section title="Gateway Connection" theme={theme}>
        <LabeledInput
          label="Gateway URL"
          value={settings.gatewayUrl}
          onChangeText={(v: string) => settings.update({ gatewayUrl: v })}
          placeholder="http://your-server:18789"
          autoCapitalize="none"
          theme={theme}
        />
        <LabeledInput
          label="Auth Token (optional)"
          value={settings.authToken}
          onChangeText={(v: string) => settings.update({ authToken: v })}
          placeholder="Leave empty if no auth"
          secureTextEntry
          autoCapitalize="none"
          theme={theme}
        />
        <Pressable style={s.testBtn} onPress={testConnection} disabled={testingConnection}>
          {testingConnection
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.testBtnText}>Test Connection</Text>}
        </Pressable>
        {connectionStatus && (
          <Text style={[s.connectionStatus, { color: connectionStatus.ok ? theme.success : theme.danger }]}>
            {connectionStatus.ok ? '✓' : '✗'} {connectionStatus.msg}
          </Text>
        )}
      </Section>

      {/* AI */}
      <Section title="AI" theme={theme}>
        <LabeledInput
          label="Default Model (overrides gateway)"
          value={settings.defaultModel}
          onChangeText={(v: string) => settings.update({ defaultModel: v })}
          placeholder="e.g. claude-3-5-sonnet, gpt-4o, gemini-2.5-flash"
          autoCapitalize="none"
          theme={theme}
        />
        <LabeledInput
          label="Default Agent"
          value={settings.defaultAgent}
          onChangeText={(v: string) => settings.update({ defaultAgent: v })}
          placeholder="default"
          autoCapitalize="none"
          theme={theme}
        />
        <ToggleRow
          label="Streaming responses"
          description="Show text as it's generated"
          value={settings.streamingEnabled}
          onChange={(v: boolean) => settings.update({ streamingEnabled: v })}
          theme={theme}
        />
        <ToggleRow
          label="Show tool calls"
          description="Display which tools were used"
          value={settings.showToolCalls}
          onChange={(v: boolean) => settings.update({ showToolCalls: v })}
          theme={theme}
        />
      </Section>

      {/* Display */}
      <Section title="Display" theme={theme}>
        <ThemeSelector
          value={settings.theme}
          onChange={(v: 'dark' | 'light' | 'system') => settings.update({ theme: v })}
          theme={theme}
        />
        <ToggleRow
          label="Show timestamps"
          value={settings.showTimestamps}
          onChange={(v: boolean) => settings.update({ showTimestamps: v })}
          theme={theme}
        />
        <ToggleRow
          label="Haptic feedback"
          value={settings.hapticFeedback}
          onChange={(v: boolean) => settings.update({ hapticFeedback: v })}
          theme={theme}
        />
        <SliderRow
          label={`Font size: ${settings.fontSize}pt`}
          value={settings.fontSize}
          min={12} max={20}
          onChange={(v: number) => settings.update({ fontSize: v })}
          theme={theme}
        />
      </Section>

      {/* Voice */}
      <Section title="Voice" theme={theme}>
        <ToggleRow
          label="Wake word detection"
          description="Always-on listening for 'hey openbot'"
          value={settings.wakeWordEnabled}
          onChange={(v: boolean) => settings.update({ wakeWordEnabled: v })}
          theme={theme}
        />
        <LabeledInput
          label="Wake word"
          value={settings.wakeWord}
          onChangeText={(v: string) => settings.update({ wakeWord: v })}
          placeholder="hey openbot"
          autoCapitalize="none"
          theme={theme}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications" theme={theme}>
        <ToggleRow
          label="Push notifications"
          description="Receive alerts when messages arrive"
          value={settings.notificationsEnabled}
          onChange={(v: boolean) => settings.update({ notificationsEnabled: v })}
          theme={theme}
        />
      </Section>

      {/* Data */}
      <Section title="Data" theme={theme}>
        <Pressable
          style={s.dangerBtn}
          onPress={() => Alert.alert('Reset Settings', 'Restore all settings to defaults?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: settings.reset },
          ])}
        >
          <Text style={s.dangerBtnText}>Reset All Settings</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children, theme }: { title: string; children: React.ReactNode; theme: ReturnType<typeof useTheme> }) {
  const s = makeStyles(theme);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionContent}>{children}</View>
    </View>
  );
}

function LabeledInput({ label, theme, ...props }: { label: string; theme: ReturnType<typeof useTheme> } & any) {
  const s = makeStyles(theme);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.fieldInput} placeholderTextColor={theme.textDim} {...props} />
    </View>
  );
}

function ToggleRow({ label, description, value, onChange, theme }: any) {
  const s = makeStyles(theme);
  return (
    <View style={s.toggleRow}>
      <View style={s.toggleText}>
        <Text style={s.toggleLabel}>{label}</Text>
        {description && <Text style={s.toggleDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.surfaceAlt }}
        thumbColor={value ? '#fff' : theme.textDim}
      />
    </View>
  );
}

function SliderRow({ label, value, min, max, onChange, theme }: any) {
  const s = makeStyles(theme);
  return (
    <View style={s.toggleRow}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={s.stepperRow}>
        <Pressable style={s.stepBtn} onPress={() => value > min && onChange(value - 1)}>
          <Text style={s.stepBtnText}>−</Text>
        </Pressable>
        <Text style={s.stepValue}>{value}</Text>
        <Pressable style={s.stepBtn} onPress={() => value < max && onChange(value + 1)}>
          <Text style={s.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ThemeSelector({ value, onChange, theme }: { value: string; onChange: (v: any) => void; theme: ReturnType<typeof useTheme> }) {
  const s = makeStyles(theme);
  const options: { id: 'dark' | 'light' | 'system'; label: string; icon: string }[] = [
    { id: 'dark', label: 'Dark', icon: 'moon-outline' },
    { id: 'light', label: 'Light', icon: 'sunny-outline' },
    { id: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  ];
  return (
    <View style={s.themeRow}>
      <Text style={s.toggleLabel}>Theme</Text>
      <View style={s.themeOptions}>
        {options.map(opt => (
          <Pressable
            key={opt.id}
            style={[s.themeOption, value === opt.id && s.themeOptionActive]}
            onPress={() => onChange(opt.id)}
          >
            <Ionicons
              name={opt.icon as any}
              size={16}
              color={value === opt.id ? '#fff' : theme.textMuted}
            />
            <Text style={[s.themeOptionText, value === opt.id && s.themeOptionTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 40 },
    pageTitle: { color: theme.text, fontSize: 28, fontWeight: '700', marginBottom: 24 },
    section: { marginBottom: 24 },
    sectionTitle: { color: theme.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
    sectionContent: { backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden' },
    field: { padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
    fieldLabel: { color: theme.textMuted, fontSize: 12, marginBottom: 6 },
    fieldInput: { color: theme.text, fontSize: 14, backgroundColor: theme.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
    toggleText: { flex: 1, marginRight: 12 },
    toggleLabel: { color: theme.text, fontSize: 14 },
    toggleDescription: { color: theme.textDim, fontSize: 12, marginTop: 2 },
    testBtn: { margin: 12, backgroundColor: theme.accent, borderRadius: 10, padding: 12, alignItems: 'center' },
    testBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    connectionStatus: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
    dangerBtn: { margin: 12, backgroundColor: theme.surface, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.danger },
    dangerBtnText: { color: theme.danger, fontWeight: '600', fontSize: 14 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { color: theme.text, fontSize: 18, lineHeight: 22 },
    stepValue: { color: theme.text, fontSize: 14, minWidth: 24, textAlign: 'center' },
    themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
    themeOptions: { flexDirection: 'row', gap: 6 },
    themeOption: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.surfaceAlt },
    themeOptionActive: { backgroundColor: theme.accent },
    themeOptionText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
    themeOptionTextActive: { color: '#fff' },
  });
}
