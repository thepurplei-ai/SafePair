import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Pair() {
  const t = useTheme();
  const { me, createPairCode, joinPair, connected } = useSession();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [entered, setEntered] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Once paired (either side), go to the map.
  useEffect(() => {
    if (me?.partnerId) router.replace('/map');
  }, [me?.partnerId]);

  const newCode = useCallback(async () => {
    try {
      const c = await createPairCode();
      setCode(c);
      setCodeError(null);
    } catch (e: any) {
      setCodeError(e?.message ?? 'Could not create a code');
    }
  }, [createPairCode]);

  // Get a code on arrival; when it expires, fetch a fresh one.
  const myId = me?.id;
  const needsCode = !!me && !me.partnerId;
  const expiresAt = code?.expiresAt;
  useEffect(() => {
    if (!myId || !needsCode) return;
    const delay = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
    const id = setTimeout(newCode, delay);
    return () => clearTimeout(id);
  }, [myId, needsCode, expiresAt, newCode]);

  // Countdown tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const join = async () => {
    setJoinError(null);
    setJoining(true);
    try {
      await joinPair(entered);
    } catch (e: any) {
      setJoinError(e?.message ?? 'Could not connect');
    } finally {
      setJoining(false);
    }
  };

  const remaining = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;
  const pretty = code ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : '';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 16, lineHeight: 22 }}>
        Hi {me?.name}! Connect with the person you want to stay safe with. One of you shares a code, the
        other enters it.
      </Text>

      <Card>
        <Label>Your code</Label>
        {code ? (
          <>
            <Pressable
              onPress={() => Share.share({ message: `Join me on SafePair with code ${code.code}` })}
              accessibilityRole="button"
              accessibilityLabel={`Your pairing code is ${code.code.split('').join(' ')}. Tap to share.`}
            >
              <Text style={[styles.code, { color: t.text }]} selectable>
                {pretty}
              </Text>
            </Pressable>
            <Text style={{ color: t.muted, textAlign: 'center' }}>
              Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} · Tap to share
            </Text>
          </>
        ) : codeError ? (
          <>
            <ErrorText>{codeError}</ErrorText>
            <Button title="Try again" variant="secondary" onPress={newCode} style={{ marginTop: 12 }} />
          </>
        ) : (
          <ActivityIndicator style={{ marginVertical: 24 }} color={t.primary} />
        )}
        {code && (
          <View style={styles.waiting}>
            <ActivityIndicator size="small" color={t.muted} />
            <Text style={{ color: t.muted }}>
              {connected ? 'Waiting for your partner…' : 'Connecting to server…'}
            </Text>
          </View>
        )}
      </Card>

      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: t.border }]} />
        <Text style={{ color: t.muted }}>or</Text>
        <View style={[styles.line, { backgroundColor: t.border }]} />
      </View>

      <Card>
        <Label>Enter their code</Label>
        <Input
          value={entered}
          onChangeText={(v) => setEntered(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          style={styles.codeInput}
          accessibilityLabel="Partner's pairing code"
        />
        <ErrorText>{joinError}</ErrorText>
        <Button
          title="Connect"
          onPress={join}
          loading={joining}
          disabled={entered.length !== 6}
          style={{ marginTop: 12 }}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  code: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    marginVertical: 12,
    fontVariant: ['tabular-nums'],
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  waiting: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
