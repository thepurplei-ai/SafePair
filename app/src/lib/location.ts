import * as Battery from 'expo-battery';
import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { createApi } from './api';
import { loadCredentials } from './storage';
import type { Location } from './types';

export const BACKGROUND_LOCATION_TASK = 'safepair-background-location';

async function batteryLevel(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? level : null;
  } catch {
    return null;
  }
}

export async function toLocation(obj: ExpoLocation.LocationObject): Promise<Location> {
  return {
    latitude: obj.coords.latitude,
    longitude: obj.coords.longitude,
    accuracy: obj.coords.accuracy ?? null,
    heading: obj.coords.heading != null && obj.coords.heading >= 0 ? obj.coords.heading : null,
    speed: obj.coords.speed != null && obj.coords.speed >= 0 ? obj.coords.speed : null,
    battery: await batteryLevel(),
    timestamp: obj.timestamp,
  };
}

/**
 * Background task: runs while the app is backgrounded or closed and posts
 * the newest fix over HTTP (sockets don't survive in the background).
 * Must be defined at module scope, so this file is imported from the root layout.
 */
TaskManager.defineTask<{ locations: ExpoLocation.LocationObject[] }>(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const creds = await loadCredentials();
    if (!creds) return;
    const latest = data.locations[data.locations.length - 1];
    try {
      await createApi(creds.serverUrl, creds.token).postLocation(await toLocation(latest));
    } catch {
      // Network hiccup; the next update will try again.
    }
  },
);

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Starts background updates if permission allows. Returns whether it is running. */
export async function startBackgroundSharing(): Promise<boolean> {
  try {
    const fg = await ExpoLocation.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    let bg = await ExpoLocation.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') bg = await ExpoLocation.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    if (!(await ExpoLocation.isBackgroundLocationAvailableAsync())) return false;
    if (await ExpoLocation.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return true;
    await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: ExpoLocation.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 60_000,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: ExpoLocation.ActivityType.Other,
      foregroundService: {
        notificationTitle: 'SafePair is sharing your location',
        notificationBody: 'Your partner can see where you are.',
        notificationColor: '#E5484D',
      },
    });
    return true;
  } catch (e) {
    // Expo Go does not support background location; needs a development build.
    console.warn('[location] background sharing unavailable:', e);
    return false;
  }
}

export async function stopBackgroundSharing() {
  try {
    if (await ExpoLocation.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // not running
  }
}

/** High-frequency updates while the app is in the foreground. */
export function watchForeground(onLocation: (loc: Location) => void) {
  return ExpoLocation.watchPositionAsync(
    { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 5, timeInterval: 5_000 },
    async (obj) => onLocation(await toLocation(obj)),
  );
}

export async function currentLocation(): Promise<Location | null> {
  try {
    const obj =
      (await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High })) ??
      (await ExpoLocation.getLastKnownPositionAsync());
    return obj ? toLocation(obj) : null;
  } catch {
    const last = await ExpoLocation.getLastKnownPositionAsync().catch(() => null);
    return last ? toLocation(last) : null;
  }
}
