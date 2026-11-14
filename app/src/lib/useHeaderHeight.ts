import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Approximate height of the default navigation header (for keyboard offsets). */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + (Platform.OS === 'ios' ? 44 : 56);
}
