import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@/lib/useHeaderHeight';
import { formatAgo, openDirections } from '@/lib/geo';
import { useSession, type ChatMessage } from '@/lib/session';
import { useTheme } from '@/lib/theme';

const QUICK_REPLIES = ["I'm OK 👍", 'On my way', 'Where are you?', 'Call me'];

export default function Chat() {
  const t = useTheme();
  const headerHeight = useHeaderHeight();
  const { me, partner, messages, sendMessage, retryMessage, shareMyLocation, sendTyping, partnerTyping, setChatOpen } =
    useSession();
  const [text, setText] = useState('');
  const lastTyping = useRef(0);

  useFocusEffect(
    useCallback(() => {
      setChatOpen(true);
      return () => setChatOpen(false);
    }, [setChatOpen]),
  );

  const data = useMemo(() => messages.slice().reverse(), [messages]);

  const send = (value = text) => {
    if (!value.trim()) return;
    sendMessage(value);
    if (value === text) setText('');
  };

  const onChange = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      sendTyping();
    }
  };

  const shareLocation = async () => {
    try {
      await shareMyLocation();
    } catch (e: any) {
      Alert.alert('Could not share location', e?.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        renderItem={({ item }) => (
          <Bubble message={item} mine={item.from === me?.id} onRetry={() => item.clientId && retryMessage(item.clientId)} />
        )}
        ListHeaderComponent={
          partnerTyping ? (
            <Text style={{ color: t.muted, fontStyle: 'italic', marginVertical: 4 }}>{partner?.name} is typing…</Text>
          ) : undefined
        }
        ListEmptyComponent={
          <Text style={{ color: t.muted, textAlign: 'center', marginTop: 40, transform: [{ scaleY: -1 }] }}>
            Say hi to {partner?.name ?? 'your partner'} 👋
          </Text>
        }
      />

      <View style={styles.quickRow}>
        {QUICK_REPLIES.map((q) => (
          <Pressable
            key={q}
            onPress={() => send(q)}
            style={[styles.quick, { backgroundColor: t.card, borderColor: t.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Send: ${q}`}
          >
            <Text style={{ color: t.text, fontSize: 13 }}>{q}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.composer, { backgroundColor: t.card, borderTopColor: t.border }]}>
        <Pressable onPress={shareLocation} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Share my location">
          <Ionicons name="location" size={24} color={t.primary} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onChange}
          placeholder="Message"
          placeholderTextColor={t.muted}
          multiline
          maxLength={2000}
          style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
          accessibilityLabel="Message"
        />
        <Pressable
          onPress={() => send()}
          disabled={!text.trim()}
          style={[styles.iconBtn, { opacity: text.trim() ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="send" size={22} color={t.primary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message: m, mine, onRetry }: { message: ChatMessage; mine: boolean; onRetry: () => void }) {
  const t = useTheme();

  if (m.kind === 'system' || m.kind === 'sos') {
    const sos = m.kind === 'sos';
    return (
      <Pressable
        disabled={!m.location}
        onPress={() => m.location && openDirections(m.location)}
        style={[styles.system, { backgroundColor: sos ? t.danger : t.card, borderColor: t.border }]}
      >
        <Text style={{ color: sos ? '#fff' : t.muted, fontWeight: sos ? '700' : '400', textAlign: 'center' }}>
          {sos ? '🆘 ' : ''}
          {m.text}
          {sos && m.location ? '\nTap for directions' : ''}
        </Text>
        <Text style={{ color: sos ? '#FFE5E5' : t.muted, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
          {formatAgo(m.createdAt)}
        </Text>
      </Pressable>
    );
  }

  const bg = mine ? t.bubbleMe : t.bubbleThem;
  const fg = mine ? t.bubbleMeText : t.bubbleThemText;
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Pressable
        disabled={!m.location && !m.failed}
        onPress={() => (m.failed ? onRetry() : m.location && openDirections(m.location))}
        style={[
          styles.bubble,
          { backgroundColor: bg, opacity: m.pending ? 0.6 : 1 },
          mine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
        ]}
      >
        {m.kind === 'location' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="location" size={18} color={fg} />
            <Text style={{ color: fg, fontWeight: '600' }}>Shared location · tap for directions</Text>
          </View>
        ) : (
          <Text style={{ color: fg, fontSize: 16 }}>{m.text}</Text>
        )}
      </Pressable>
      <Text style={{ color: m.failed ? t.danger : t.muted, fontSize: 11, marginTop: 2 }}>
        {m.failed ? 'Not sent · tap to retry' : m.pending ? 'Sending…' : formatAgo(m.createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  system: { alignSelf: 'center', padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: '90%' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  quick: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
