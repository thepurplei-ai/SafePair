import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Index() {
  const { status, me } = useSession();
  const t = useTheme();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (!me?.partnerId) return <Redirect href="/pair" />;
  return <Redirect href="/map" />;
}
