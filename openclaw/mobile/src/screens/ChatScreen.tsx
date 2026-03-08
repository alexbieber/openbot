import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import {
  View, FlatList, Text, StyleSheet,
  Pressable, Alert, KeyboardAvoidingView, Platform,
  Modal, TouchableOpacity, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import CameraCapture from '../components/CameraCapture';
import Sidebar from '../components/Sidebar';
import TypingIndicator from '../components/TypingIndicator';
import AnimatedLogo from '../components/AnimatedLogo';
import { api, type ChatMessage, type Agent } from '../services/api';
import { useChatStore } from '../stores/chat';
import { useSettingsStore } from '../stores/settings';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { useTheme } from '../theme';

let abortController: AbortController | null = null;

// ClawdBot-style: what the AI can do (email, calendar, search, etc.)
const SUGGESTIONS = [
  { icon: 'mail-outline' as const, text: 'Check my email' },
  { icon: 'calendar-outline' as const, text: "What's on my calendar today?" },
  { icon: 'search-outline' as const, text: 'Search the web for latest news' },
  { icon: 'partly-sunny-outline' as const, text: "What's the weather?" },
  { icon: 'document-text-outline' as const, text: 'Summarize something for me' },
  { icon: 'flash-outline' as const, text: 'What can you do?' },
];

// Stable message renderer to avoid re-renders of individual bubbles
const MemoMessageBubble = memo(MessageBubble);

export default function ChatScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const theme = useTheme();
  // Stable timestamp for the streaming bubble — only set once when streaming begins
  const streamingStartTs = useRef(Date.now());

  const {
    currentMessages, addMessage, editMessage, deleteMessage, removeMessagesAfter,
    setLoading, setStreaming,
    isLoading, isStreaming, streamingContent, updateStreamingContent,
    currentAgent, setAgent, setConnected, clearCurrentSession,
  } = useChatStore();

  const { gatewayUrl, streamingEnabled, hapticFeedback, fontSize, showTimestamps, showToolCalls } = useSettingsStore();
  const { isRecording, isProcessing, startRecording, stopAndSend } = usePushToTalk();

  const [agentName, setAgentName] = useState('OpenBot');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentPickerVisible, setAgentPickerVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingContent, setEditingContent] = useState('');

  useEffect(() => {
    api.load().then(() => {
      api.health().then(h => {
        setConnected(true);
        if (h.model) {
          const short = h.model.split('/').pop()?.split('-').slice(0, 3).join('-') ?? 'OpenBot';
          setAgentName(short);
        }
      }).catch(() => setConnected(false));
      api.getAgents().then(list => { if (list.length > 0) setAgents(list); }).catch(() => {});
    });
  }, [gatewayUrl]);

  useEffect(() => {
    const agent = agents.find(a => a.id === currentAgent);
    if (agent) setAgentName(agent.name || agent.id);
  }, [currentAgent, agents]);

  const messages = currentMessages();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length]);

  // Only scroll during streaming, don't cause blink by not touching the footer
  useEffect(() => {
    if (isStreaming && streamingContent) scrollToBottom();
  }, [streamingContent]);

  const sendMessage = useCallback(async (text: string, attachments?: any[], opts?: { noAddUser?: boolean }) => {
    if (!text.trim() && !attachments?.length) return;
    let content = text;
    if (attachments?.length) {
      content = text
        ? `${text}\n\n[Attached: ${attachments.map((a: any) => a.name || 'file').join(', ')}]`
        : `[Attached: ${attachments.map((a: any) => a.name || 'file').join(', ')}]`;
    }

    if (!opts?.noAddUser) {
      addMessage({ id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now() });
    }
    setLoading(true);
    abortController = new AbortController();
    streamingStartTs.current = Date.now();

    try {
      if (streamingEnabled) {
        setStreaming(true, '');
        let fullContent = '';
        await new Promise<void>((resolve, reject) => {
          const cancelStream = api.streamChat(content, {
            agentId: currentAgent,
            onChunk: (chunk) => { fullContent += chunk; updateStreamingContent(fullContent); },
            onDone: (toolsUsed) => {
              addMessage({ id: `ai-${Date.now()}`, role: 'assistant', content: fullContent, timestamp: Date.now(), toolsUsed });
              setStreaming(false, '');
              resolve();
            },
            onError: (err) => reject(new Error(err)),
          });
          abortController?.signal.addEventListener('abort', () => { cancelStream?.(); resolve(); });
        });
      } else {
        const response = await api.chat(content, { agentId: currentAgent });
        addMessage(response);
      }
      if (hapticFeedback) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addMessage({ id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${err.message || 'Failed to reach gateway'}`, timestamp: Date.now() });
      }
    } finally {
      setLoading(false);
      setStreaming(false, '');
    }
  }, [currentAgent, streamingEnabled, hapticFeedback]);

  const handlePTT = useCallback(async () => {
    if (isRecording) {
      const result = await stopAndSend();
      if (result?.transcript) addMessage({ id: `user-${Date.now()}`, role: 'user', content: `🎤 ${result.transcript}`, timestamp: Date.now() });
      if (result?.response) addMessage({ id: `ai-${Date.now()}`, role: 'assistant', content: result.response, timestamp: Date.now(), model: result.model });
    } else {
      await startRecording();
    }
  }, [isRecording, stopAndSend, startRecording, addMessage]);

  const handleAbort = useCallback(() => {
    abortController?.abort();
    setLoading(false);
    setStreaming(false, '');
  }, []);

  const handleClearSession = useCallback(() => {
    Alert.alert('Clear Chat', 'Delete all messages in this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearCurrentSession },
    ]);
  }, [clearCurrentSession]);

  const handleEditMessage = useCallback((message: ChatMessage) => {
    if (message.role !== 'user') return;
    setEditingMessage(message);
    setEditingContent(message.content);
  }, []);

  const handleDeleteMessage = useCallback((message: ChatMessage) => {
    Alert.alert('Delete message', 'Remove this message from the conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(message.id) },
    ]);
  }, [deleteMessage]);

  const handleEditSave = useCallback(() => {
    if (!editingMessage || !editingContent.trim()) return;
    editMessage(editingMessage.id, editingContent.trim());
    setEditingMessage(null);
    setEditingContent('');
  }, [editingMessage, editingContent, editMessage]);

  const handleEditSaveAndResend = useCallback(() => {
    if (!editingMessage || !editingContent.trim()) return;
    const content = editingContent.trim();
    editMessage(editingMessage.id, content);
    removeMessagesAfter(editingMessage.id);
    setEditingMessage(null);
    setEditingContent('');
    sendMessage(content, undefined, { noAddUser: true });
  }, [editingMessage, editingContent, editMessage, removeMessagesAfter, sendMessage]);

  const handleSelectAgent = useCallback((agent: Agent) => {
    setAgent(agent.id);
    setAgentName(agent.name || agent.id);
    setAgentPickerVisible(false);
  }, [setAgent]);

  // Stable renderItem — won't cause FlatList to re-render individual bubbles
  const renderItem = useCallback(({ item }: { item: ChatMessage }) => (
    <MemoMessageBubble
      message={item}
      showTimestamps={showTimestamps}
      showToolCalls={showToolCalls}
      fontSize={fontSize}
      theme={theme}
      onEdit={item.role === 'user' ? handleEditMessage : undefined}
      onDelete={handleDeleteMessage}
    />
  ), [showTimestamps, showToolCalls, fontSize, theme, handleEditMessage, handleDeleteMessage]);

  // Stable streaming bubble — uses ref timestamp, not Date.now() on each render
  const streamingMessage = useMemo<ChatMessage>(() => ({
    id: 'streaming',
    role: 'assistant',
    content: streamingContent + '▊',
    timestamp: streamingStartTs.current,
  }), [streamingContent]);

  // Memoize footer so it doesn't unmount/remount on each chunk → no blink
  const ListFooter = useMemo(() => {
    if (isStreaming && streamingContent) {
      return (
        <MemoMessageBubble
          message={streamingMessage}
          showTimestamps={false}
          showToolCalls={false}
          fontSize={fontSize}
          theme={theme}
          isStreaming={true}
        />
      );
    }
    if (isLoading && !isStreaming) {
      return <TypingIndicator theme={theme} />;
    }
    return null;
  }, [isStreaming, isLoading, streamingContent, streamingMessage, fontSize, theme]);

  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style={theme.statusBar === 'light-content' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => setSidebarVisible(true)} style={s.headerIconBtn}>
          <Ionicons name="menu-outline" size={22} color={theme.textMuted} />
        </Pressable>
        <Pressable style={s.headerCenter} onPress={() => agents.length > 0 && setAgentPickerVisible(true)}>
          <Text style={s.headerTitle} numberOfLines={1}>{agentName}</Text>
          {agents.length > 0 && <Ionicons name="chevron-down" size={13} color={theme.textDim} style={s.chevron} />}
        </Pressable>
        <Pressable onPress={handleClearSession} style={s.headerIconBtn}>
          <Ionicons name="create-outline" size={21} color={theme.textMuted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {messages.length === 0 && !isLoading ? (
          <EmptyState theme={theme} onSuggest={sendMessage} s={s} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            // Pass footer as a prop — memoized above, won't remount on chunk
            ListFooterComponent={ListFooter}
            removeClippedSubviews={false}
          />
        )}

        {isRecording && (
          <View style={[s.recordingBar, { backgroundColor: s.container.backgroundColor }]}>
            <View style={[s.recordingDot, { backgroundColor: theme.danger }]} />
            <Text style={[s.recordingText, { color: theme.textMuted }]}>Recording… tap mic to send</Text>
          </View>
        )}

        <ChatInput
          onSend={sendMessage}
          onStartVoice={handlePTT}
          onOpenCamera={() => setCameraVisible(true)}
          isLoading={isLoading || isProcessing}
          isStreaming={isStreaming}
          onAbort={handleAbort}
          fontSize={fontSize}
          theme={theme}
        />
      </KeyboardAvoidingView>

      <CameraCapture visible={cameraVisible} onClose={() => setCameraVisible(false)} onCapture={(photo) => sendMessage('', [photo])} theme={theme} />
      <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />

      {/* Edit message modal */}
      <Modal visible={!!editingMessage} transparent animationType="fade" onRequestClose={() => setEditingMessage(null)}>
        <View style={s.editModalOverlay}>
          <View style={[s.editModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.editModalTitle, { color: theme.text }]}>Edit message</Text>
            <TextInput
              style={[s.editModalInput, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={editingContent}
              onChangeText={setEditingContent}
              placeholder="Message text"
              placeholderTextColor={theme.textDim}
              multiline
              numberOfLines={4}
            />
            <View style={s.editModalActions}>
              <Pressable style={[s.editModalBtn, { backgroundColor: theme.surfaceAlt }]} onPress={() => { setEditingMessage(null); setEditingContent(''); }}>
                <Text style={[s.editModalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.editModalBtn, { backgroundColor: theme.accent }]} onPress={handleEditSave}>
                <Text style={[s.editModalBtnText, { color: '#fff' }]}>Update</Text>
              </Pressable>
              <Pressable style={[s.editModalBtn, { backgroundColor: theme.accent }]} onPress={handleEditSaveAndResend}>
                <Text style={[s.editModalBtnText, { color: '#fff' }]}>Update & resend</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Agent Picker */}
      <Modal visible={agentPickerVisible} transparent animationType="slide" onRequestClose={() => setAgentPickerVisible(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setAgentPickerVisible(false)}>
          <View style={[s.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={[s.modalHandle, { backgroundColor: theme.border }]} />
            <Text style={[s.modalTitle, { color: theme.text }]}>Switch Model</Text>
            <FlatList
              data={agents}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.agentItem, { borderBottomColor: theme.borderSubtle }]}
                  onPress={() => handleSelectAgent(item)}
                >
                  <View style={[s.agentAvatar, { backgroundColor: item.id === currentAgent ? theme.accentSurface : theme.surfaceAlt }]}>
                    <Text style={[s.agentAvatarText, { color: item.id === currentAgent ? theme.accent : theme.textDim }]}>
                      {(item.name || item.id).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.agentInfo}>
                    <Text style={[s.agentName, { color: item.id === currentAgent ? theme.accent : theme.text }]}>{item.name || item.id}</Text>
                    {item.description && <Text style={[s.agentDesc, { color: theme.textDim }]} numberOfLines={1}>{item.description}</Text>}
                    {item.model && <Text style={[s.agentModel, { color: theme.textDim }]}>{item.model}</Text>}
                  </View>
                  {item.id === currentAgent && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </Pressable>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Extracted to avoid re-rendering when messages arrive
const EmptyState = memo(({ theme, onSuggest, s }: { theme: ReturnType<typeof import('../theme').useTheme>; onSuggest: (t: string) => void; s: any }) => (
  <View style={s.emptyState}>
    <AnimatedLogo theme={theme} isAnimating={false} size={44} />
    <Text style={[s.emptyGreeting, { color: theme.text }]}>How can I help you{'\n'}today?</Text>
    <View style={s.suggestionsGrid}>
      {SUGGESTIONS.map(({ icon, text }) => (
        <Pressable key={text} style={[s.suggestionCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => onSuggest(text)}>
          <Ionicons name={icon} size={17} color={theme.accent} style={s.suggestionIcon} />
          <Text style={[s.suggestionText, { color: theme.text }]}>{text}</Text>
        </Pressable>
      ))}
    </View>
  </View>
));

function makeStyles(theme: ReturnType<typeof import('../theme').useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      height: 50,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.borderSubtle,
    },
    headerIconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
    chevron: { marginLeft: 4 },
    listContent: { paddingTop: 8, paddingBottom: 12 },
    recordingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
    recordingDot: { width: 8, height: 8, borderRadius: 4 },
    recordingText: { fontSize: 13 },
    // Empty state
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 80 },
    emptyLogo: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    emptyLogoText: { fontSize: 24, fontWeight: '900', letterSpacing: -1 },
    emptyGreeting: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 32, marginBottom: 28, letterSpacing: -0.3 },
    suggestionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' },
    suggestionCard: { width: '47%', borderRadius: 14, padding: 14, borderWidth: 1 },
    suggestionIcon: { marginBottom: 8 },
    suggestionText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 40, maxHeight: '72%' },
    modalHandle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
    modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 14 },
    agentItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
    agentAvatar: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    agentAvatarText: { fontSize: 15, fontWeight: '700' },
    agentInfo: { flex: 1, minWidth: 0 },
    agentName: { fontSize: 15, fontWeight: '600' },
    agentDesc: { fontSize: 12, marginTop: 2 },
    agentModel: { fontSize: 11, marginTop: 1 },
    // Edit message modal
    editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    editModalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
    editModalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    editModalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
    editModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    editModalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    editModalBtnText: { fontSize: 15, fontWeight: '600' },
  });
}
