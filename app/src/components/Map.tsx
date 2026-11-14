import Constants from 'expo-constants';
import { Platform } from 'react-native';
import NativeMap, { Circle as NativeCircle, Marker as NativeMarker } from 'react-native-maps';
import Fallback, { Circle as FallbackCircle, Marker as FallbackMarker } from './MapFallback';

// Google Maps on Android aborts the app if no API key was built in, so use a
// placeholder until GOOGLE_MAPS_ANDROID_API_KEY is configured. iOS uses Apple Maps.
const useFallback = Platform.OS === 'android' && !Constants.expoConfig?.extra?.hasAndroidMapsKey;

const MapView = (useFallback ? Fallback : NativeMap) as unknown as typeof NativeMap;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type MapView = NativeMap;
export const Marker = (useFallback ? FallbackMarker : NativeMarker) as unknown as typeof NativeMarker;
export const Circle = (useFallback ? FallbackCircle : NativeCircle) as unknown as typeof NativeCircle;
export default MapView;
