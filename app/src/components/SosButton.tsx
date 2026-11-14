import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';

type Props = {
  active: boolean;
  busy?: boolean;
  onTrigger: () => void;
  onCancel: () => void;
};

/**
 * One tap sends an SOS. While active the button pulses and a tap asks to
 * mark yourself safe again.
 */
export function SosButton({ active, busy, onTrigger, onCancel }: Props) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (active) onCancel();
    else onTrigger();
  };

  return (
    <View style={styles.wrap}>
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderColor: t.danger,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            },
          ]}
        />
      )}
      <Pressable
        onPress={press}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={active ? 'SOS active. Tap to tell your partner you are safe.' : 'Send SOS'}
        accessibilityHint={active ? undefined : 'Immediately alerts your partner with your location'}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: t.danger, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
        ]}
      >
        <Text style={[styles.label, active && styles.labelSmall]}>{active ? 'SAFE' : 'SOS'}</Text>
      </Pressable>
    </View>
  );
}

const SIZE = 84;
const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 4 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1 },
  labelSmall: { fontSize: 16 },
});
