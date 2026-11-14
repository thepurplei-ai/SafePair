// Must be imported at module scope so the background location task is
// registered before the OS wakes the app for a location update.
import '@/lib/location';
import '@/lib/notifications';

import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IncomingSosOverlay } from '@/components/IncomingSosOverlay';
import { SessionProvider } from '@/lib/session';
import { useTheme } from '@/lib/theme';

function useNotificationNavigation() {
  useEffect(() => {
    const go = (data: Record<string, unknown> | undefined) => {
      if (data?.type === 'message') router.navigate('/chat');
      else if (data?.type === 'sos' || data?.type === 'sos-resolved') router.navigate('/map');
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      go(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const t = useTheme();
  useNotificationNavigation();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.card },
            headerTintColor: t.text,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="pair" options={{ title: 'Connect', headerBackVisible: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <IncomingSosOverlay />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
