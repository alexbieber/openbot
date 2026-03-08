import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '../src/services/api';
import { useSettingsStore } from '../src/stores/settings';

export default function OnboardingScreen() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const { update } = useSettingsStore();

  const handleConnect = async () => {
    if (!url.trim()) { Alert.alert('Enter a gateway URL'); return; }
    setTesting(true);
    try {
      await api.setGateway(url.trim(), token.trim());
      const health = await api.health();
      await update({ gatewayUrl: url.trim(), authToken: token.trim() });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Connected!', `Gateway v${health.version} · ${health.skills} skills · ${health.model}`, [
        { text: 'Start chatting', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Connection failed', err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.emoji}>🤖</Text>
          <Text style={styles.title}>OpenBot</Text>
          <Text style={styles.subtitle}>Your self-hosted AI assistant</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect to your gateway</Text>
          <Text style={styles.cardDesc}>
            Enter the URL of your OpenBot gateway server. This can be on your local network, a VPS, or accessible via Tailscale.
          </Text>

          <Text style={styles.label}>Gateway URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.100:18789"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>Auth Token (optional)</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Leave empty for no auth"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            secureTextEntry
          />

          <Pressable style={styles.connectBtn} onPress={handleConnect} disabled={testing}>
            {testing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.connectBtnText}>Connect & Start →</Text>}
          </Pressable>
        </View>

        <Pressable style={styles.skipBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </Pressable>

        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>Quick start tips</Text>
          {[
            '🖥️  Start gateway: cd gateway && node server.js',
            '📱  Use your PC IP (e.g. 192.168.1.5:18789) — localhost won\'t work on phone',
            '🔑  Set a token in openbot.json for security',
            '📱  Use the same gateway from multiple devices',
          ].map((tip, i) => (
            <Text key={i} style={styles.tip}>{tip}</Text>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  scroll: { padding: 24, paddingBottom: 48 },
  hero: { alignItems: 'center', paddingVertical: 32 },
  emoji: { fontSize: 72, marginBottom: 12 },
  title: { color: '#f1f5f9', fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#64748b', fontSize: 16, marginTop: 6 },
  card: { backgroundColor: '#0f172a', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1e293b' },
  cardTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  cardDesc: { color: '#64748b', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#1e293b', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16 },
  connectBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4 },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipBtnText: { color: '#475569', fontSize: 14 },
  tips: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#1e293b' },
  tipsTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tip: { color: '#64748b', fontSize: 13, marginBottom: 6, lineHeight: 18 },
});
