import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Input, Label } from '@/components/ui';
import { currentLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Settings() {
  const t = useTheme();
  const {
    me,
    partner,
    serverUrl,
    connected,
    home,
    myLocation,
    backgroundSharing,
    emergencyNumber,
    rename,
    unpair,
    signOut,
    setHome,
    setBackgroundSharing,
    setEmergencyNumber,
  } = useSession();
  // Drafts are null while not being edited, so they always reflect saved values.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [emergencyDraft, setEmergencyDraft] = useState<string | null>(null);
  const [settingHome, setSettingHome] = useState(false);
  const name = nameDraft ?? me?.name ?? '';
  const emergency = emergencyDraft ?? emergencyNumber;

  const saveName = async () => {
    const next = name.trim();
    try {
      if (next && next !== me?.name) await rename(next);
    } catch (e: any) {
      Alert.alert('Could not rename', e?.message);
    } finally {
      setNameDraft(null);
    }
  };

  const saveEmergency = async () => {
    await setEmergencyNumber(emergency);
    setEmergencyDraft(null);
  };

  const setHomeHere = async () => {
    setSettingHome(true);
    try {
      const loc = myLocation ?? (await currentLocation());
      if (!loc) throw new Error('Your location is not available. Check location permissions.');
      await setHome({ latitude: loc.latitude, longitude: loc.longitude, label: 'Home' });
      Alert.alert('Home saved', 'Use "Go home" on the map to get directions back here.');
    } catch (e: any) {
      Alert.alert('Could not set home', e?.message);
    } finally {
      setSettingHome(false);
    }
  };

  const confirmUnpair = () =>
    Alert.alert(
      `Disconnect from ${partner?.name}?`,
      'You will stop seeing each other’s location and your message history will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpair();
              router.replace('/pair');
            } catch (e: any) {
              Alert.alert('Could not disconnect', e?.message);
            }
          },
        },
      ],
    );

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to pair again after signing back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (partner) await unpair();
          } catch {
            // still sign out locally
          }
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Label>Your name</Label>
        <Input value={name} onChangeText={setNameDraft} onEndEditing={saveName} maxLength={40} returnKeyType="done" />
      </Card>

      <Card>
        <Label>Connected with</Label>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: partner?.online ? t.success : t.muted }]} />
          <Text style={[styles.value, { color: t.text }]}>{partner?.name ?? '—'}</Text>
          <Text style={{ color: t.muted }}>{partner?.online ? 'online' : 'offline'}</Text>
        </View>
        <Button title="Disconnect" variant="secondary" onPress={confirmUnpair} style={{ marginTop: 12 }} />
      </Card>

      <Card>
        <Label>Location sharing</Label>
        <View style={styles.row}>
          <Text style={{ color: t.text, flex: 1, fontSize: 16 }}>Share in the background</Text>
          <Switch
            value={backgroundSharing}
            onValueChange={setBackgroundSharing}
            accessibilityLabel="Share location in the background"
          />
        </View>
        <Text style={{ color: t.muted, marginTop: 6, fontSize: 13 }}>
          Keeps your partner updated when the app is closed. Turn off to share only while SafePair is open.
        </Text>
      </Card>

      <Card>
        <Label>Home</Label>
        <Text style={{ color: home ? t.text : t.muted, fontSize: 16 }}>
          {home ? `${home.latitude.toFixed(5)}, ${home.longitude.toFixed(5)}` : 'Not set'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button
            title={home ? 'Update to here' : 'Set to current location'}
            onPress={setHomeHere}
            loading={settingHome}
            style={{ flex: 1 }}
          />
          {home && <Button title="Clear" variant="secondary" onPress={() => setHome(null)} />}
        </View>
      </Card>

      <Card>
        <Label>Emergency number</Label>
        <Input
          value={emergency}
          onChangeText={setEmergencyDraft}
          onEndEditing={saveEmergency}
          keyboardType="phone-pad"
          maxLength={15}
          accessibilityLabel="Emergency phone number"
        />
        <Text style={{ color: t.muted, marginTop: 6, fontSize: 13 }}>
          Shown on SOS alerts. e.g. 112 (EU), 911 (US/Canada), 999 (UK), 000 (Australia).
        </Text>
      </Card>

      <Card>
        <Label>Server</Label>
        <Text style={{ color: t.text }} selectable>
          {serverUrl}
        </Text>
        <Text style={{ color: connected ? t.success : t.muted, marginTop: 4 }}>
          {connected ? 'Connected' : 'Not connected'}
        </Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  value: { fontSize: 18, fontWeight: '600', flex: 1 },
});
