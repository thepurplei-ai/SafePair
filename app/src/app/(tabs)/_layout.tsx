import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { status, me, unread } = useSession();

  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (status === 'ready' && !me?.partnerId) return <Redirect href="/pair" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}
