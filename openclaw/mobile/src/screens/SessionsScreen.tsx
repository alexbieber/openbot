import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '../stores/chat';
import { useTheme } from '../theme';

export default function SessionsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sessions, currentSessionId, switchSession, deleteSession, createSession } = useChatStore();
  const theme = useTheme();

  const handleNewSession = () => {
    createSession('default', 'New Chat');
    navigation?.navigate?.('Chat');
  };

  const handleDeleteSession = (id: string) => {
    if (sessions.length === 1) {
      Alert.alert('Cannot delete', 'Keep at least one conversation.');
      return;
    }
    Alert.alert('Delete Conversation', 'Remove this conversation and all its messages?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(id) },
    ]);
  };

  const s = makeStyles(theme);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Conversations</Text>
        <Pressable style={s.newBtn} onPress={handleNewSession}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.newBtnText}>New</Text>
        </Pressable>
      </View>

      <FlatList
        data={[...sessions].sort((a, b) => b.updatedAt - a.updatedAt)}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Pressable
            style={[s.sessionItem, item.id === currentSessionId && s.activeSession]}
            onPress={() => { switchSession(item.id); navigation?.navigate?.('Chat'); }}
          >
            <View style={s.sessionInfo}>
              <View style={s.sessionRow}>
                <Ionicons
                  name={item.id === currentSessionId ? 'chatbubbles' : 'chatbubbles-outline'}
                  size={18}
                  color={item.id === currentSessionId ? theme.accent : theme.textDim}
                />
                <Text style={[s.sessionLabel, item.id === currentSessionId && s.activeName]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <Text style={s.sessionMeta}>
                {item.messages.length} message{item.messages.length !== 1 ? 's' : ''} · {formatDate(item.updatedAt)}
              </Text>
            </View>
            <Pressable onPress={() => handleDeleteSession(item.id)} style={s.deleteBtn} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No conversations yet</Text>
            <Pressable style={s.emptyBtn} onPress={handleNewSession}>
              <Text style={s.emptyBtnText}>Start a conversation</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function makeStyles(theme: ReturnType<typeof import('../theme').useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
    title: { color: theme.text, fontSize: 22, fontWeight: '700' },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    newBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    list: { padding: 12, gap: 8 },
    sessionItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border },
    activeSession: { borderColor: theme.accent },
    sessionInfo: { flex: 1 },
    sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    sessionLabel: { color: theme.textMuted, fontSize: 15, fontWeight: '500', flex: 1 },
    activeName: { color: theme.text },
    sessionMeta: { color: theme.textDim, fontSize: 12 },
    deleteBtn: { padding: 6 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: theme.textDim, fontSize: 16, marginBottom: 16 },
    emptyBtn: { backgroundColor: theme.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    emptyBtnText: { color: '#fff', fontWeight: '600' },
  });
}
