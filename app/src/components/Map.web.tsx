import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type LatLng = { latitude: number; longitude: number };

/**
 * Minimal stand-in for react-native-maps on web (used for development
 * previews only). Lists the markers instead of drawing a map.
 */
const MapView = forwardRef(function MapView(
  { style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode; [key: string]: unknown },
  ref,
) {
  useImperativeHandle(ref, () => ({
    animateToRegion() {},
    fitToCoordinates() {},
  }));
  return (
    <View style={[style, styles.root]}>
      <Text style={styles.title}>Map preview (web)</Text>
      <Text style={styles.hint}>Open the app on iOS or Android to see the live map.</Text>
      <View style={{ marginTop: 12, gap: 6 }}>{children}</View>
    </View>
  );
});
export default MapView;
export type MapViewRef = { animateToRegion(...a: unknown[]): void; fitToCoordinates(...a: unknown[]): void };

export function Marker({ coordinate, title }: { coordinate: LatLng; title?: string; [key: string]: unknown }) {
  return (
    <Text style={styles.marker}>
      📍 {title ?? 'Marker'} — {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
    </Text>
  );
}

export function Circle(_props: Record<string, unknown>) {
  return null;
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#DDE7EE', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  hint: { color: '#4A5560', marginTop: 4, textAlign: 'center' },
  marker: { color: '#11181C' },
});
