import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Animated, TouchableOpacity, Dimensions, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AnimatedLogo from './AnimatedLogo';

const APP_ICON = require('../../assets/icon.png');
import { useChatStore } from '../stores/chat';
import { useSettingsStore } from '../stores/settings';
import { useTheme } from '../theme';

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.82, 320);

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
}

export default function Sidebar({ visible, onClose }: SidebarProps) {
  const theme = useTheme();
  const router = useRouter();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const { sessions, currentSessionId, switchSession, createSession, deleteSession, isConnected } = useChatStore();
  const { gatewayUrl } = useSettingsStore();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateX, { toValue: -SIDEBAR_WIDTH, useNativeDriver: true, damping: 20, stiffness: 240 }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleNewChat = () => { createSession(); onClose(); };
  const handleSwitchSession = (id: string) => { switchSession(id); onClose(); };
  const goTo = (route: string) => { onClose(); setTimeout(() => router.push(route as any), 280); };

  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { backgroundColor: theme.surface, borderRightColor: theme.borderSubtle, transform: [{ translateX }] }]}>

        {/* Top header — app icon + name */}
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <Image source={APP_ICON} style={styles.appIcon} resizeMode="contain" />
          <View style={styles.headerText}>
            <Text style={[styles.appName, { color: theme.text }]}>OpenBot</Text>
            <Text style={[styles.gatewayText, { color: theme.textDim }]} numberOfLines={1}>
              {gatewayUrl.replace(/^https?:\/\//, '')}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: isConnected ? '#1A3A26' : '#3A1A1A' }]}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#4CAF7D' : '#E05252' }]} />
          </View>
        </View>

        {/* New Chat button */}
        <View style={styles.newChatWrap}>
          <Pressable style={[styles.newChatBtn, { backgroundColor: theme.accentSurface, borderColor: theme.accent + '40' }]} onPress={handleNewChat}>
            <Ionicons name="add" size={17} color={theme.accent} />
            <Text style={[styles.newChatText, { color: theme.accent }]}>New conversation</Text>
          </Pressable>
        </View>

        {/* Session list */}
        <Text style={[styles.sectionLabel, { color: theme.textDim }]}>Recent</Text>
        <FlatList
          data={sortedSessions}
          keyExtractor={item => item.id}
          style={styles.sessionList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = item.id === currentSessionId;
            const msgCount = item.messages.length;
            return (
              <Pressable
                style={[
                  styles.sessionItem,
                  { borderRadius: 10 },
                  isActive && { backgroundColor: theme.accentSurface },
                ]}
                onPress={() => handleSwitchSession(item.id)}
              >
                <View style={[styles.sessionDot, { backgroundColor: isActive ? theme.accent : theme.surfaceAlt }]} />
                <View style={styles.sessionBody}>
                  <Text
                    style={[styles.sessionLabel, { color: isActive ? theme.accent : theme.text }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text style={[styles.sessionMeta, { color: theme.textDim }]}>
                    {msgCount} {msgCount === 1 ? 'message' : 'messages'} · {formatRelative(item.updatedAt)}
                  </Text>
                </View>
                {sessions.length > 1 && (
                  <Pressable
                    onPress={() => deleteSession(item.id)}
                    style={styles.deleteBtn}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={13} color={theme.textDim} />
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          {[
            { icon: 'flash-outline', label: 'Skills', route: '/(tabs)/skills' },
            { icon: 'library-outline', label: 'Memory', route: '/(tabs)/memory' },
            { icon: 'settings-outline', label: 'Settings', route: '/(tabs)/settings' },
          ].map(({ icon, label, route }) => (
            <Pressable key={route} style={[styles.footerBtn, { borderRadius: 10 }]} onPress={() => goTo(route)}>
              <Ionicons name={icon as any} size={18} color={theme.textMuted} />
              <Text style={[styles.footerBtnText, { color: theme.textMuted }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  logoMarkText: { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  headerText: { flex: 1, minWidth: 0 },
  appName: { fontSize: 15, fontWeight: '700' },
  gatewayText: { fontSize: 11, marginTop: 1 },
  statusPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  newChatWrap: { paddingHorizontal: 12, marginBottom: 16 },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
  },
  newChatText: { fontSize: 14, fontWeight: '600' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sessionList: { flex: 1, paddingHorizontal: 8 },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginVertical: 1,
  },
  sessionDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0, marginTop: 2 },
  sessionBody: { flex: 1, minWidth: 0 },
  sessionLabel: { fontSize: 13, fontWeight: '500' },
  sessionMeta: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 3, flexShrink: 0 },
  footer: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  footerBtnText: { fontSize: 13, fontWeight: '500' },
});
