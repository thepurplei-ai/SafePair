import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { useSession } from '@/lib/session';
import { DEFAULT_SERVER_URL } from '@/lib/storage';
import { useTheme } from '@/lib/theme';

export default function Welcome() {
  const t = useTheme();
  const { register } = useSession();
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await register(serverUrl, name.trim());
      router.replace('/pair');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={[styles.logo, { backgroundColor: t.dangerSoft }]}>
            <Ionicons name="shield-checkmark" size={46} color={t.danger} />
          </View>
          <Text style={[styles.title, { color: t.text }]}>SafePair</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            Stay connected with one person you trust. See each other on a live map, message, and send an
            SOS with one tap.
          </Text>

          <View style={{ marginTop: 32 }}>
            <Label>Your name</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sam"
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="go"
              maxLength={40}
              onSubmitEditing={() => name.trim() && submit()}
              accessibilityLabel="Your name"
            />
            <Text style={{ color: t.muted, marginTop: 6, fontSize: 13 }}>
              This is how your partner will see you.
            </Text>
          </View>

          {showServer ? (
            <View style={{ marginTop: 20 }}>
              <Label>Server address</Label>
              <Input
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Server address"
              />
            </View>
          ) : (
            <Pressable onPress={() => setShowServer(true)} style={{ marginTop: 16 }} accessibilityRole="button">
              <Text style={{ color: t.primary }}>Server settings</Text>
            </Pressable>
          )}

          <ErrorText>{error}</ErrorText>
          <Button title="Get started" onPress={submit} loading={busy} disabled={!name.trim()} style={{ marginTop: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 48 },
  logo: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '800', marginTop: 20 },
  subtitle: { fontSize: 16, lineHeight: 23, marginTop: 8 },
});
