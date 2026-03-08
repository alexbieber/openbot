/**
 * Global chat state using Zustand.
 * Persists conversation history in AsyncStorage.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../services/api';

const MAX_HISTORY = 200;
const STORAGE_KEY = 'openbot_chat_history';

interface Session {
  id: string;
  agentId: string;
  label: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatStore {
  sessions: Session[];
  currentSessionId: string;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  currentModel: string;
  currentAgent: string;
  isConnected: boolean;

  // Actions
  loadFromStorage: () => Promise<void>;
  createSession: (agentId?: string, label?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  addMessage: (msg: ChatMessage) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  removeMessagesAfter: (messageId: string) => void;
  updateStreamingContent: (content: string) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean, content?: string) => void;
  setModel: (model: string) => void;
  setAgent: (agent: string) => void;
  setConnected: (connected: boolean) => void;
  clearCurrentSession: () => void;

  // Computed
  currentSession: () => Session | undefined;
  currentMessages: () => ChatMessage[];
}

const defaultSession = (): Session => ({
  id: `session-${Date.now()}`,
  agentId: 'default',
  label: 'New Chat',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [defaultSession()],
  currentSessionId: '',
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  currentModel: '',
  currentAgent: 'default',
  isConnected: false,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { sessions, currentSessionId } = JSON.parse(raw);
        set({ sessions: sessions || [defaultSession()], currentSessionId: currentSessionId || sessions?.[0]?.id || '' });
      } else {
        const session = defaultSession();
        set({ sessions: [session], currentSessionId: session.id });
      }
    } catch {
      const session = defaultSession();
      set({ sessions: [session], currentSessionId: session.id });
    }
  },

  createSession: (agentId = 'default', label = 'New Chat') => {
    const session: Session = { ...defaultSession(), agentId, label };
    set(state => ({ sessions: [...state.sessions, session], currentSessionId: session.id }));
    get()._persist();
    return session.id;
  },

  switchSession: (sessionId) => {
    set({ currentSessionId: sessionId });
  },

  deleteSession: (sessionId) => {
    set(state => {
      const sessions = state.sessions.filter(s => s.id !== sessionId);
      const currentSessionId = state.currentSessionId === sessionId
        ? (sessions[0]?.id || '')
        : state.currentSessionId;
      return { sessions, currentSessionId };
    });
    get()._persist();
  },

  addMessage: (msg) => {
    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id !== state.currentSessionId) return s;
        const messages = [...s.messages, msg].slice(-MAX_HISTORY);
        return { ...s, messages, updatedAt: Date.now(), label: s.label === 'New Chat' && messages.length === 1 ? msg.content.slice(0, 40) : s.label };
      });
      return { sessions };
    });
    get()._persist();
  },

  editMessage: (messageId, content) => {
    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id !== state.currentSessionId) return s;
        const messages = s.messages.map(m =>
          m.id === messageId ? { ...m, content, timestamp: Date.now() } : m,
        );
        return { ...s, messages, updatedAt: Date.now() };
      });
      return { sessions };
    });
    get()._persist();
  },

  deleteMessage: (messageId) => {
    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id !== state.currentSessionId) return s;
        const messages = s.messages.filter(m => m.id !== messageId);
        return { ...s, messages, updatedAt: Date.now() };
      });
      return { sessions };
    });
    get()._persist();
  },

  removeMessagesAfter: (messageId) => {
    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id !== state.currentSessionId) return s;
        const idx = s.messages.findIndex(m => m.id === messageId);
        if (idx < 0) return s;
        const messages = s.messages.slice(0, idx + 1);
        return { ...s, messages, updatedAt: Date.now() };
      });
      return { sessions };
    });
    get()._persist();
  },

  updateStreamingContent: (content) => set({ streamingContent: content }),
  setLoading: (isLoading) => set({ isLoading }),
  setStreaming: (isStreaming, content = '') => set({ isStreaming, streamingContent: content }),
  setModel: (currentModel) => set({ currentModel }),
  setAgent: (currentAgent) => set({ currentAgent }),
  setConnected: (isConnected) => set({ isConnected }),

  clearCurrentSession: () => {
    set(state => {
      const sessions = state.sessions.map(s =>
        s.id === state.currentSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s,
      );
      return { sessions };
    });
    get()._persist();
  },

  currentSession: () => get().sessions.find(s => s.id === get().currentSessionId),
  currentMessages: () => get().sessions.find(s => s.id === get().currentSessionId)?.messages || [],

  _persist: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessions: get().sessions,
        currentSessionId: get().currentSessionId,
      }));
    } catch {}
  },
} as any));
