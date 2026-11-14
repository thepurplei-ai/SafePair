import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { Home } from './types';

const KEYS = {
  token: 'safepair.token',
  serverUrl: 'safepair.serverUrl',
  home: 'safepair.home',
  sharing: 'safepair.sharing',
  emergency: 'safepair.emergencyNumber',
} as const;

export const DEFAULT_SERVER_URL: string =
  (Constants.expoConfig?.extra?.serverUrl as string | undefined) ?? 'http://localhost:4000';

export type Credentials = { token: string; serverUrl: string };

export async function loadCredentials(): Promise<Credentials | null> {
  const [token, serverUrl] = await Promise.all([
    AsyncStorage.getItem(KEYS.token),
    AsyncStorage.getItem(KEYS.serverUrl),
  ]);
  return token ? { token, serverUrl: serverUrl ?? DEFAULT_SERVER_URL } : null;
}

export async function saveCredentials({ token, serverUrl }: Credentials) {
  await AsyncStorage.multiSet([
    [KEYS.token, token],
    [KEYS.serverUrl, serverUrl],
  ]);
}

export async function clearCredentials() {
  await AsyncStorage.multiRemove([KEYS.token, KEYS.serverUrl]);
}

export async function loadHome(): Promise<Home | null> {
  const raw = await AsyncStorage.getItem(KEYS.home);
  return raw ? (JSON.parse(raw) as Home) : null;
}

export async function saveHome(home: Home | null) {
  if (home) await AsyncStorage.setItem(KEYS.home, JSON.stringify(home));
  else await AsyncStorage.removeItem(KEYS.home);
}

/** Whether the user wants background location sharing. Defaults to on. */
export async function loadBackgroundSharing(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.sharing)) !== 'off';
}

export async function saveBackgroundSharing(on: boolean) {
  await AsyncStorage.setItem(KEYS.sharing, on ? 'on' : 'off');
}

export const DEFAULT_EMERGENCY_NUMBER = '112';

export async function loadEmergencyNumber(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.emergency)) || DEFAULT_EMERGENCY_NUMBER;
}

export async function saveEmergencyNumber(num: string) {
  await AsyncStorage.setItem(KEYS.emergency, num);
}
