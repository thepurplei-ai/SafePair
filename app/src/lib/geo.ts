import { Linking, Platform } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, in degrees 0–360. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassPoint = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 30) return 'just now';
  if (s < 90) return '1 min ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Opens turn-by-turn walking directions in the platform's maps app. */
export async function openDirections(to: LatLng, label = 'Destination') {
  const ll = `${to.latitude},${to.longitude}`;
  const urls =
    Platform.OS === 'ios'
      ? [
          `maps://?daddr=${ll}&dirflg=w&q=${encodeURIComponent(label)}`,
          `https://maps.apple.com/?daddr=${ll}&dirflg=w`,
        ]
      : [
          `google.navigation:q=${ll}&mode=w`,
          `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`,
        ];
  for (const url of urls) {
    try {
      if (await Linking.canOpenURL(url)) return await Linking.openURL(url);
    } catch {
      // try the next one
    }
  }
  return Linking.openURL(urls[urls.length - 1]);
}

export const mapsLink = (p: LatLng) =>
  `https://maps.google.com/?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
