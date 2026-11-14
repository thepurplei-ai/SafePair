import { router } from 'expo-router';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { distanceMeters, formatAgo, formatDistance, openDirections } from '@/lib/geo';
import { useSession } from '@/lib/session';

/** Full-screen alert shown whenever the partner raises an SOS. */
export function IncomingSosOverlay() {
  const { incomingSos, partner, myLocation, dismissIncomingSos, emergencyNumber } = useSession();
  if (!incomingSos || !partner) return null;

  const loc = incomingSos.location ?? partner.lastLocation;
  const dist = loc && myLocation ? distanceMeters(myLocation, loc) : null;

  return (
    <Modal visible animationType="fade" onRequestClose={dismissIncomingSos} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <View style={styles.body} accessibilityLiveRegion="assertive">
          <Text style={styles.emoji}>🆘</Text>
          <Text style={styles.title} accessibilityRole="header">
            {partner.name} needs help
          </Text>
          {incomingSos.note ? <Text style={styles.note}>“{incomingSos.note}”</Text> : null}
          <Text style={styles.meta}>
            Sent {formatAgo(incomingSos.startedAt)}
            {dist != null ? ` · ${formatDistance(dist)} away` : ''}
            {loc?.battery != null ? ` · 🔋 ${Math.round(loc.battery * 100)}%` : ''}
          </Text>
          {!loc && <Text style={styles.meta}>Their location isn&apos;t available yet.</Text>}
        </View>
        <View style={{ gap: 12 }}>
          {loc && (
            <Button
              title={`Navigate to ${partner.name}`}
              variant="secondary"
              onPress={() => openDirections(loc, partner.name)}
            />
          )}
          {loc && (
            <Button
              title="Show on map"
              variant="secondary"
              onPress={() => {
                dismissIncomingSos();
                router.navigate('/map');
              }}
            />
          )}
          <Button
            title={`Call emergency (${emergencyNumber})`}
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${emergencyNumber}`)}
          />
          <Button title="Dismiss" variant="secondary" onPress={dismissIncomingSos} style={{ opacity: 0.8 }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#C62A2F', padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 72 },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  note: { color: '#fff', fontSize: 18, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
  meta: { color: '#FFE5E5', fontSize: 16, marginTop: 12, textAlign: 'center' },
});
