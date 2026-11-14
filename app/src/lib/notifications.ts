import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('sos', {
    name: 'SOS alerts',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 600, 200, 600, 200, 600],
    lightColor: '#E5484D',
    bypassDnd: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * Asks for notification permission and returns an Expo push token, or null
 * when unavailable (simulator, permission denied, no EAS project id).
 */
export async function registerForPushToken(): Promise<string | null> {
  try {
    await setupNotificationChannels();
    if (!Device.isDevice) return null;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[notifications] No EAS projectId configured; push disabled.');
      return null;
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('[notifications] push registration failed:', e);
    return null;
  }
}

/** Shows a notification right away (used for realtime events while app is open). */
export function notifyNow(title: string, body: string, channelId: 'sos' | 'messages', data = {}) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
      priority:
        channelId === 'sos'
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}
