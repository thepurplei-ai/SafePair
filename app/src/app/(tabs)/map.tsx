import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from '@/components/Map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SosButton } from '@/components/SosButton';
import {
  bearingDegrees,
  compassPoint,
  distanceMeters,
  formatAgo,
  formatDistance,
  openDirections,
  type LatLng,
} from '@/lib/geo';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function MapScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const now = useNow();
  const {
    me,
    partner,
    myLocation,
    home,
    connected,
    locationPermission,
    requestLocation,
    triggerSos,
    resolveSos,
  } = useSession();
  const [sosBusy, setSosBusy] = useState(false);
  const fittedOnce = useRef(false);

  const partnerLoc = partner?.lastLocation ?? null;
  const partnerInSos = !!partner?.sos;
  const mySosActive = !!me?.sos;

  const fitAll = (animated = true) => {
    const pts: LatLng[] = [myLocation, partnerLoc].filter(Boolean) as LatLng[];
    if (!pts.length) return;
    if (pts.length === 1) {
      mapRef.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, animated ? 500 : 0);
    } else {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 220, right: 60, bottom: 260, left: 60 },
        animated,
      });
    }
  };

  // Frame both people the first time we know where they are.
  useEffect(() => {
    if (!fittedOnce.current && myLocation && (partnerLoc || !partner)) {
      fittedOnce.current = true;
      fitAll(false);
    }
  }, [myLocation, partnerLoc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to the partner when they raise an SOS.
  useEffect(() => {
    if (partnerInSos && partnerLoc) {
      mapRef.current?.animateToRegion({ ...partnerLoc, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 600);
    }
  }, [partnerInSos]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (p: LatLng | null) =>
    p && mapRef.current?.animateToRegion({ ...p, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);

  const onSos = async () => {
    setSosBusy(true);
    try {
      await triggerSos();
    } catch (e: any) {
      Alert.alert('SOS could not be sent', `${e?.message ?? 'Unknown error'}\n\nCall emergency services directly if you are in danger.`);
    } finally {
      setSosBusy(false);
    }
  };

  const onSafe = () =>
    Alert.alert('Are you safe?', `This will let ${partner?.name ?? 'your partner'} know you no longer need help.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "I'm safe",
        onPress: async () => {
          setSosBusy(true);
          try {
            await resolveSos();
          } catch (e: any) {
            Alert.alert('Could not update', e?.message ?? 'Please try again.');
          } finally {
            setSosBusy(false);
          }
        },
      },
    ]);

  const navigateHome = () => {
    if (!home) {
      Alert.alert('No home set', 'Set your home location in Settings to navigate back home.');
      return;
    }
    openDirections(home, 'Home');
  };

  const dist = myLocation && partnerLoc ? distanceMeters(myLocation, partnerLoc) : null;
  const bearing = myLocation && partnerLoc ? bearingDegrees(myLocation, partnerLoc) : null;
  const stale = partnerLoc ? now - partnerLoc.timestamp > 5 * 60_000 : false;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        showsUserLocation={!!locationPermission}
        showsMyLocationButton={false}
        showsCompass
        mapPadding={{ top: insets.top + 140, right: 0, bottom: 200, left: 0 }}
        initialRegion={
          myLocation
            ? { ...myLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : partnerLoc
              ? { ...partnerLoc, latitudeDelta: 0.02, longitudeDelta: 0.02 }
              : undefined
        }
      >
        {partnerLoc && partner && (
          <>
            {partnerLoc.accuracy != null && partnerLoc.accuracy > 15 && (
              <Circle
                center={partnerLoc}
                radius={partnerLoc.accuracy}
                fillColor={partnerInSos ? 'rgba(229,72,77,0.15)' : 'rgba(142,78,198,0.12)'}
                strokeColor={partnerInSos ? 'rgba(229,72,77,0.5)' : 'rgba(142,78,198,0.4)'}
              />
            )}
            <Marker coordinate={partnerLoc} title={partner.name} description={`Updated ${formatAgo(partnerLoc.timestamp, now)}`}>
              <View style={[styles.avatar, { backgroundColor: partnerInSos ? t.danger : t.partner }]}>
                <Text style={styles.avatarText}>{partner.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            </Marker>
          </>
        )}
        {home && (
          <Marker coordinate={home} title="Home">
            <View style={[styles.homePin, { backgroundColor: t.card, borderColor: t.border }]}>
              <Ionicons name="home" size={18} color={t.primary} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Partner status card */}
      <View style={[styles.topCard, { top: insets.top + 10, backgroundColor: t.card, borderColor: partnerInSos ? t.danger : t.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.dot, { backgroundColor: partner?.online ? t.success : t.muted }]} />
          <Text style={[styles.partnerName, { color: t.text }]} numberOfLines={1}>
            {partner?.name ?? 'Partner'}
          </Text>
          {partnerInSos && (
            <View style={[styles.badge, { backgroundColor: t.danger }]}>
              <Text style={styles.badgeText}>SOS</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {!connected && <Text style={{ color: t.muted, fontSize: 12 }}>Reconnecting…</Text>}
        </View>
        <Text style={{ color: t.muted, marginTop: 4 }}>
          {partnerLoc
            ? [
                dist != null ? `${formatDistance(dist)} ${bearing != null ? compassPoint(bearing) : ''}`.trim() : null,
                `updated ${formatAgo(partnerLoc.timestamp, now)}`,
                partnerLoc.battery != null ? `🔋 ${Math.round(partnerLoc.battery * 100)}%` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Waiting for their location…'}
        </Text>
        {stale && (
          <Text style={{ color: t.danger, marginTop: 4, fontSize: 13 }}>
            Location may be out of date — their phone may be offline.
          </Text>
        )}
      </View>

      {locationPermission === false && (
        <Pressable
          onPress={async () => {
            if (!(await requestLocation())) Linking.openSettings();
          }}
          style={[styles.permBanner, { top: insets.top + 110, backgroundColor: t.dangerSoft }]}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text }}>
            Location is off — your partner can&apos;t see you. <Text style={{ fontWeight: '700' }}>Turn on</Text>
          </Text>
        </Pressable>
      )}

      {/* Map controls */}
      <View style={[styles.fabColumn, { top: insets.top + (locationPermission === false ? 170 : 130) }]}>
        <Fab icon="scan" label="Show both" onPress={() => fitAll()} />
        <Fab icon="locate" label="Center on me" onPress={() => focus(myLocation)} />
        <Fab icon="person" label={`Center on ${partner?.name ?? 'partner'}`} onPress={() => focus(partnerLoc)} />
      </View>

      {mySosActive && (
        <View style={[styles.sosBanner, { backgroundColor: t.danger }]} accessibilityLiveRegion="polite">
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            SOS sent — {partner?.name ?? 'your partner'} can see your location.
          </Text>
        </View>
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottom, { paddingBottom: 16 }]}>
        <View style={{ flex: 1, gap: 10 }}>
          <ActionButton
            icon="navigate"
            title={`Find ${partner?.name ?? 'partner'}`}
            disabled={!partnerLoc}
            onPress={() => partnerLoc && openDirections(partnerLoc, partner?.name)}
          />
          <ActionButton icon="home" title="Go home" onPress={navigateHome} />
        </View>
        <SosButton active={mySosActive} busy={sosBusy} onTrigger={onSos} onCancel={onSafe} />
      </View>
    </View>
  );
}

function Fab({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={t.text} />
    </Pressable>
  );
}

function ActionButton({
  icon,
  title,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: t.card, borderColor: t.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color={t.primary} />
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  partnerName: { fontSize: 18, fontWeight: '700', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  permBanner: { position: 'absolute', left: 12, right: 12, padding: 12, borderRadius: 12 },
  fabColumn: { position: 'absolute', right: 12, gap: 10 },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  homePin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBanner: { position: 'absolute', left: 12, right: 12, bottom: 140, padding: 12, borderRadius: 12 },
  bottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
