import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'SafePair',
  slug: 'safepair',
  owner: 'thepurplei_ai',
  scheme: 'safepair',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.thepurpleiai.safepair',
    infoPlist: {
      // Only standard HTTPS/TLS is used, which is exempt from export compliance.
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
    },
  },
  android: {
    package: 'com.thepurpleiai.safepair',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'VIBRATE',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'SafePair shares your location with your paired partner, even when the app is closed, so they can find you and help in an emergency.',
        locationWhenInUsePermission:
          'SafePair shares your location with your paired partner so you can find each other.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#E5484D',
      },
    ],
    [
      'react-native-maps',
      {
        // Required for Google Maps on Android. iOS uses Apple Maps by default.
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
  extra: {
    // Default server; can be overridden in the app's welcome/settings screen.
    serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:4000',
    eas: {
      projectId: '7c0d01e3-1891-4151-b3db-96cccb1c59a5',
    },
  },
};

export default config;
