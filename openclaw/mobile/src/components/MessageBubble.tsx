import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import AnimatedLogo from './AnimatedLogo';
import type { ChatMessage } from '../services/api';
import type { Theme } from '../theme';

interface Props {
  message: ChatMessage;
  showTimestamps?: boolean;
  showToolCalls?: boolean;
  fontSize?: number;
  theme: Theme;
  isStreaming?: boolean;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
}

// ─────────────────────────────────────────────────────────
//  Code block with language header + copy button
// ─────────────────────────────────────────────────────────
function CodeBlock({ code, language, theme, baseFontSize }: { code: string; language?: string; theme: Theme; baseFontSize: number }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[codeStyles.wrap, { backgroundColor: theme.codeBg, borderColor: theme.border }]}>
      {/* Header bar */}
      <View style={[codeStyles.header, { borderBottomColor: theme.border }]}>
        <Text style={[codeStyles.lang, { color: theme.textDim }]}>
          {language || 'code'}
        </Text>
        <TouchableOpacity onPress={copy} hitSlop={8} style={codeStyles.copyRow}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={13}
            color={copied ? theme.success : theme.textDim}
          />
          <Text style={[codeStyles.copyLabel, { color: copied ? theme.success : theme.textDim }]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Scrollable code */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          style={[codeStyles.code, {
            fontSize: baseFontSize - 2,
            color: theme.text,
            lineHeight: (baseFontSize - 2) * 1.7,
          }]}
          selectable
        >
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  lang: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'lowercase' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyLabel: { fontSize: 11 },
  code: { paddingHorizontal: 14, paddingVertical: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});

// ─────────────────────────────────────────────────────────
//  Markdown rules override — code_block & fence → CodeBlock
// ─────────────────────────────────────────────────────────
function buildRules(theme: Theme, fontSize: number) {
  return {
    fence: (node: any, children: any, parent: any, styles: any) => {
      const lang = node.sourceInfo?.trim() || '';
      return (
        <CodeBlock
          key={node.key}
          code={node.content?.trim() ?? ''}
          language={lang}
          theme={theme}
          baseFontSize={fontSize}
        />
      );
    },
    code_block: (node: any) => (
      <CodeBlock
        key={node.key}
        code={node.content?.trim() ?? ''}
        theme={theme}
        baseFontSize={fontSize}
      />
    ),
  };
}

// ─────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────
export default function MessageBubble({
  message,
  showTimestamps = true,
  showToolCalls = true,
  fontSize = 15,
  theme,
  isStreaming = false,
  onEdit,
  onDelete,
}: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [message.content]);

  // ── Markdown style map ──────────────────────────────────
  const textColor = isUser ? theme.userBubbleText : theme.aiBubbleText;

  const mdStyles = {
    body: {
      color: textColor,
      fontSize,
      lineHeight: fontSize * 1.65,
    },
    paragraph: {
      color: textColor,
      marginTop: 0,
      marginBottom: fontSize * 0.5,
    },
    // inline code
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : theme.codeBg,
      borderRadius: 5,
      paddingHorizontal: 6,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: fontSize - 1.5,
      color: isUser ? theme.userBubbleText : theme.accentLight,
    },
    link: { color: isUser ? theme.userBubbleText : theme.accentLight, textDecorationLine: 'underline' as const },
    strong: { fontWeight: '700' as const, color: textColor },
    em: { fontStyle: 'italic' as const, color: textColor },
    s: { textDecorationLine: 'line-through' as const },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: isUser ? 'rgba(255,255,255,0.4)' : theme.accent,
      paddingLeft: 12,
      marginLeft: 0,
      marginVertical: 8,
    },
    list_item: { marginBottom: fontSize * 0.3, color: textColor },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    bullet_list_icon: { color: isUser ? theme.userBubbleText : theme.accent, marginTop: 4 },
    ordered_list_icon: { color: isUser ? theme.userBubbleText : theme.accent },
    table: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, marginVertical: 8, overflow: 'hidden' as const },
    th: { backgroundColor: theme.surfaceAlt, paddingHorizontal: 12, paddingVertical: 8, fontWeight: '600' as const },
    td: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
    tr: { borderBottomWidth: 0 },
    heading1: { fontSize: fontSize + 8, fontWeight: '800' as const, color: textColor, marginTop: 16, marginBottom: 6, lineHeight: (fontSize + 8) * 1.25, letterSpacing: -0.5 },
    heading2: { fontSize: fontSize + 5, fontWeight: '700' as const, color: textColor, marginTop: 14, marginBottom: 5, lineHeight: (fontSize + 5) * 1.25 },
    heading3: { fontSize: fontSize + 3, fontWeight: '600' as const, color: textColor, marginTop: 12, marginBottom: 4, lineHeight: (fontSize + 3) * 1.3 },
    heading4: { fontSize: fontSize + 1, fontWeight: '600' as const, color: textColor, marginTop: 10, marginBottom: 3 },
    hr: { borderColor: theme.border, marginVertical: 14 },
  };

  const rules = buildRules(theme, fontSize);

  // ── USER bubble ─────────────────────────────────────────
  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userGroup}>
          <Pressable
            onLongPress={handleCopy}
            style={[
              styles.userBubble,
              { backgroundColor: theme.userBubble },
            ]}
          >
            <Markdown style={mdStyles} rules={rules}>
              {message.content}
            </Markdown>
          </Pressable>
          <View style={styles.userFooter}>
            {showTimestamps && (
              <Text style={[styles.userMeta, { color: theme.textDim }]}>
                {formatTime(message.timestamp)}
              </Text>
            )}
            <View style={[styles.messageActions, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSubtle }]}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(message)} style={styles.messageActionBtn} activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={18} color={theme.accent} />
                  <Text style={[styles.messageActionLabel, { color: theme.accent }]}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleCopy} style={styles.messageActionBtn} activeOpacity={0.7}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? theme.success : theme.accent} />
                <Text style={[styles.messageActionLabel, { color: copied ? theme.success : theme.accent }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
              {onDelete && (
                <TouchableOpacity onPress={() => onDelete(message)} style={styles.messageActionBtn} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color={theme.accent} />
                  <Text style={[styles.messageActionLabel, { color: theme.accent }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── AI message ──────────────────────────────────────────
  return (
    <View style={styles.aiRow}>
      {/* Animated logo avatar */}
      <View style={styles.avatarWrap}>
        <AnimatedLogo theme={theme} isAnimating={isStreaming} size={28} />
      </View>

      {/* Content column */}
      <View style={styles.aiBody}>
        {/* Message text */}
        <Pressable onLongPress={handleCopy}>
          <Markdown style={mdStyles} rules={rules}>
            {message.content}
          </Markdown>
        </Pressable>

        {/* Tool chips */}
        {showToolCalls && message.toolsUsed && message.toolsUsed.length > 0 && (
          <View style={styles.toolRow}>
            {message.toolsUsed.slice(0, 6).map((tool, i) => (
              <View key={i} style={[styles.toolChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSubtle }]}>
                <Ionicons name="flash" size={9} color={theme.accent} />
                <Text style={[styles.toolChipText, { color: theme.textMuted }]}>{tool}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Compact footer — only if timestamps are on */}
        <View style={styles.actionBar}>
          {showTimestamps && (
            <Text style={[styles.timestamp, { color: theme.textDim }]}>
              {formatTime(message.timestamp)}
              {message.model
                ? ` · ${message.model.split('/').pop()?.split('-').slice(0, 3).join('-')}`
                : ''}
            </Text>
          )}
          <View style={[styles.actionBtnRow, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSubtle }]}>
            <TouchableOpacity onPress={handleCopy} style={styles.actionBtnLarge} activeOpacity={0.7}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? theme.success : theme.accent} />
              <Text style={[styles.actionBtnLabel, { color: copied ? theme.success : theme.accent }]}>{copied ? 'Copied' : 'Copy'}</Text>
            </TouchableOpacity>
            {onDelete && (
              <TouchableOpacity onPress={() => onDelete(message)} style={styles.actionBtnLarge} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={18} color={theme.accent} />
                <Text style={[styles.actionBtnLabel, { color: theme.accent }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  // ── User ───────────────────────────────────────────────
  userRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    alignItems: 'flex-end',
  },
  userGroup: { alignItems: 'flex-end', maxWidth: '82%' },
  userBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 8,
  },
  userMeta: {
    fontSize: 10,
    marginRight: 6,
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  messageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 36,
  },
  messageActionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── AI ─────────────────────────────────────────────────
  aiRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
    alignItems: 'flex-start',
  },
  avatarWrap: {
    flexShrink: 0,
    marginTop: -4,
    marginLeft: -4,
    marginRight: -6,
  },
  aiBody: { flex: 1, minWidth: 0, paddingTop: 4 },

  // ── Tools ──────────────────────────────────────────────
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  toolChipText: { fontSize: 10, fontWeight: '500' },

  // ── Action bar (always visible for Copy/Delete) ────────
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 0,
    flexWrap: 'wrap',
    gap: 8,
  },
  timestamp: { fontSize: 10 },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  actionBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 36,
  },
  actionBtnLabel: { fontSize: 12, fontWeight: '600' },
});
