import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useTheme } from '../theme';

interface MemoryItem {
  id: string;
  content: string;
  tags?: string[];
  createdAt?: number;
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  const loadMemories = useCallback(async (query?: string) => {
    setIsLoading(true);
    try {
      const items = await api.searchMemory(query || undefined);
      setMemories(items);
    } catch (err: any) {
      console.warn('[Memory] Load failed:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    api.load().then(() => loadMemories());
  }, []);

  useEffect(() => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const t = setTimeout(() => loadMemories(searchQuery), 400);
    setSearchDebounce(t);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setIsSaving(true);
    try {
      const tags = newTags.trim()
        ? newTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      await api.saveMemory(newContent.trim(), tags);
      setNewContent('');
      setNewTags('');
      setAddModalVisible(false);
      loadMemories(searchQuery);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save memory');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item: MemoryItem) => {
    Alert.alert('Delete Memory', 'Remove this memory permanently?', [
      { text: 'Cancel', style: 'cancel' },
        {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteMemory(item.id);
            setMemories(prev => prev.filter(m => m.id !== item.id));
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: MemoryItem }) => (
    <View style={[styles.memoryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardContent}>
        <Text style={[styles.memoryText, { color: theme.text, fontSize: 14 }]}>{item.content}</Text>
        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagRow}>
            {item.tags.map((tag, i) => (
              <View key={i} style={[styles.tag, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.tagText, { color: theme.accent }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {item.createdAt && (
          <Text style={[styles.dateText, { color: theme.textDim }]}>
            {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        )}
      </View>
      <Pressable onPress={() => handleDelete(item)} style={styles.deleteBtn} hitSlop={8}>
        <Ionicons name="trash-outline" size={16} color={theme.danger} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Memory</Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: theme.accent }]}
          onPress={() => setAddModalVisible(true)}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textDim} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search memories..."
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.textDim} />
          </Pressable>
        )}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading memories...</Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={48} color={theme.textDim} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {searchQuery ? 'No memories match your search' : 'No memories yet'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textDim }]}>
                {searchQuery ? 'Try a different search term' : 'OpenBot will automatically remember important information from your conversations'}
              </Text>
              {!searchQuery && (
                <Pressable
                  style={[styles.emptyAddBtn, { backgroundColor: theme.accent }]}
                  onPress={() => setAddModalVisible(true)}
                >
                  <Text style={styles.emptyAddBtnText}>Add a memory</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {/* Add Memory Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Memory</Text>
            <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Content</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={newContent}
              onChangeText={setNewContent}
              placeholder="What should OpenBot remember?"
              placeholderTextColor={theme.textDim}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Tags (comma-separated)</Text>
            <TextInput
              style={[styles.modalInputSingle, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={newTags}
              onChangeText={setNewTags}
              placeholder="e.g. work, personal, coding"
              placeholderTextColor={theme.textDim}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => { setAddModalVisible(false); setNewContent(''); setNewTags(''); }}
              >
                <Text style={[styles.modalCancelText, { color: theme.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, { backgroundColor: theme.accent, opacity: isSaving || !newContent.trim() ? 0.6 : 1 }]}
                onPress={handleAdd}
                disabled={isSaving || !newContent.trim()}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSaveText}>Save Memory</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  list: { padding: 12, gap: 10 },
  memoryCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 14, borderWidth: 1 },
  cardContent: { flex: 1 },
  memoryText: { lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 11, marginTop: 6 },
  deleteBtn: { padding: 4, marginLeft: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyAddBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  emptyAddBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  modalInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 14 },
  modalInputSingle: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: '600', fontSize: 14 },
  modalSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
