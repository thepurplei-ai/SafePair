// Must be first: reports startup errors on screen in release builds.
import '@/lib/crashReporter';
// Must be imported at module scope so the background location task is
// registered before the OS wakes the app for a location update.
import '@/lib/location';
import '@/lib/notifications';

import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import { Button } from '@/components/ui';
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

/** Shown by Expo Router instead of crashing when a screen throws while rendering. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Something went wrong</Text>
      <Text selectable style={{ fontFamily: 'monospace' }}>
        {error.name}: {error.message}
      </Text>
      <Text selectable style={{ fontSize: 11, color: '#687076' }}>
        {(error.stack ?? '').split('\n').slice(0, 8).join('\n')}
      </Text>
      <Button title="Try again" onPress={retry} />
    </ScrollView>
  );
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
