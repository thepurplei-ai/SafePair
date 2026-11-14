import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#11181C',
  muted: '#687076',
  border: '#E6E8EB',
  primary: '#0A7EA4',
  primaryText: '#FFFFFF',
  danger: '#E5484D',
  dangerSoft: '#FFE5E5',
  success: '#30A46C',
  me: '#0A7EA4',
  partner: '#8E4EC6',
  bubbleMe: '#0A7EA4',
  bubbleMeText: '#FFFFFF',
  bubbleThem: '#FFFFFF',
  bubbleThemText: '#11181C',
};

const dark: typeof light = {
  bg: '#0E1113',
  card: '#1A1D1F',
  text: '#ECEDEE',
  muted: '#9BA1A6',
  border: '#2B2F31',
  primary: '#3FB5DC',
  primaryText: '#0E1113',
  danger: '#F2555A',
  dangerSoft: '#3B1219',
  success: '#3DD68C',
  me: '#3FB5DC',
  partner: '#B57EEB',
  bubbleMe: '#0A7EA4',
  bubbleMeText: '#FFFFFF',
  bubbleThem: '#22272A',
  bubbleThemText: '#ECEDEE',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
