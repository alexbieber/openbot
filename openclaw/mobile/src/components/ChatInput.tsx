import React, { useState, useRef, useEffect } from 'react';
import {
  View, TextInput, Pressable, Text, StyleSheet,
  Platform, Animated, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSuggestedPromptStore } from '../stores/suggestedPrompt';
import type { Theme } from '../theme';

interface Props {
  onSend: (text: string, attachments?: any[]) => void;
  onStartVoice?: () => void;
  onOpenCamera?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
  fontSize?: number;
  sendOnEnter?: boolean;
  theme: Theme;
}

export default function ChatInput({
  onSend, onStartVoice, onOpenCamera,
  isLoading = false, isStreaming = false,
  onAbort, fontSize = 15, sendOnEnter = false, theme,
}: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const inputRef = useRef<TextInput>(null);
  const consumeSuggested = useSuggestedPromptStore(s => s.consume);

  // Pre-fill when navigating from Skills tab (ClawdBot-style tap-to-ask)
  useFocusEffect(
    React.useCallback(() => {
      const suggested = consumeSuggested();
      if (suggested) {
        setText(suggested);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, [consumeSuggested]),
  );

  // Animated values
  const sendScale = useRef(new Animated.Value(1)).current;
  const sendBg = useRef(new Animated.Value(0)).current; // 0 = inactive, 1 = active

  const canSend = text.trim().length > 0 || attachments.length > 0;
  const isBusy = isLoading || isStreaming;

  // Animate send button when canSend changes
  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendScale, {
        toValue: canSend ? 1.08 : 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 200,
      }),
      Animated.timing(sendBg, {
        toValue: canSend ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [canSend]);

  const animatedBgColor = sendBg.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.surfaceAlt, theme.accent],
  });

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isBusy) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setAttachments(prev => [...prev, ...result.assets]);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (!result.canceled) setAttachments(prev => [...prev, ...result.assets]);
  };

  const removeAttachment = (i: number) =>
    setAttachments(prev => prev.filter((_, j) => j !== i));

  const handleKeyPress = ({ nativeEvent }: any) => {
    if (sendOnEnter && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) handleSend();
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.bg }]}>
      {/* Card */}
      <View style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.inputBorder,
          shadowColor: theme.bg === '#FFFFFF' ? '#00000018' : '#00000040',
        },
      ]}>

        {/* Attachments chips (inside card, above input) */}
        {attachments.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            {attachments.map((a, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Ionicons
                  name={a.type?.startsWith('image') ? 'image-outline' : 'document-outline'}
                  size={12}
                  color={theme.accent}
                />
                <Text style={[styles.chipText, { color: theme.textMuted }]} numberOfLines={1}>
                  {a.name || a.uri?.split('/').pop()?.slice(0, 18) || 'file'}
                </Text>
                <Pressable onPress={() => removeAttachment(i)} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color={theme.textDim} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Divider after chips */}
        {attachments.length > 0 && (
          <View style={[styles.chipsDivider, { backgroundColor: theme.borderSubtle }]} />
        )}

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { fontSize, color: theme.text, lineHeight: fontSize * 1.55 },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Message OpenBot…"
          placeholderTextColor={theme.textDim}
          multiline
          maxLength={4000}
          returnKeyType={sendOnEnter ? 'send' : 'default'}
          onKeyPress={handleKeyPress}
          textAlignVertical="top"
        />

        {/* Toolbar row */}
        <View style={styles.toolbar}>
          {/* Left: action icons */}
          <View style={styles.toolbarLeft}>
            <ToolbarBtn icon="image-outline" onPress={pickImage} theme={theme} label="Photo" />
            {onOpenCamera && (
              <ToolbarBtn icon="camera-outline" onPress={onOpenCamera} theme={theme} label="Camera" />
            )}
            <ToolbarBtn icon="attach-outline" onPress={pickDocument} theme={theme} label="File" />
            {onStartVoice && (
              <ToolbarBtn icon="mic-outline" onPress={onStartVoice} theme={theme} label="Voice" accent />
            )}
          </View>

          {/* Right: stop or send */}
          {isBusy ? (
            <Pressable style={styles.stopBtn} onPress={onAbort}>
              <View style={[styles.stopIcon, { backgroundColor: '#fff' }]} />
            </Pressable>
          ) : (
            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                style={[styles.sendBtnWrapper]}
              >
                <Animated.View style={[styles.sendBtn, { backgroundColor: animatedBgColor }]}>
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={canSend ? '#fff' : theme.textDim}
                  />
                </Animated.View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: theme.textDim }]}>
        OpenBot can make mistakes. Double-check important info.
      </Text>
    </View>
  );
}

function ToolbarBtn({
  icon, onPress, theme, label, accent = false,
}: {
  icon: string;
  onPress: () => void;
  theme: Theme;
  label: string;
  accent?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, damping: 10, stiffness: 300 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 300 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={6}>
      <Animated.View
        style={[
          styles.toolbarIcon,
          {
            backgroundColor: accent ? theme.accentSurface : 'transparent',
            transform: [{ scale }],
          },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={21}
          color={accent ? theme.accent : theme.textMuted}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 26 : 10,
  },

  // ── Card ──────────────────────────────────────────────────
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Attachment chips ──────────────────────────────────────
  chipsScroll: { maxHeight: 44 },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, maxWidth: 110 },
  chipsDivider: { height: 1, marginHorizontal: 14, marginTop: 6 },

  // ── Text input ────────────────────────────────────────────
  input: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    maxHeight: 140,
    minHeight: 46,
  },

  // ── Toolbar ───────────────────────────────────────────────
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toolbarIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Send button ───────────────────────────────────────────
  sendBtnWrapper: {},
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Stop button ───────────────────────────────────────────
  stopBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#E05252',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIcon: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },

  // ── Disclaimer ────────────────────────────────────────────
  disclaimer: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 7,
    letterSpacing: 0.1,
  },
});
