import { Alert } from 'react-native';

/**
 * In release builds an uncaught JS error closes the app without a word.
 * Show the error instead, so a user can report what went wrong.
 * Imported first in the root layout so it is active before anything else runs.
 */
type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
const ErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): ErrorHandler; setGlobalHandler(h: ErrorHandler): void } })
  .ErrorUtils;

if (ErrorUtils && !__DEV__) {
  const previous = ErrorUtils.getGlobalHandler();
  let shown = false;
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) return previous(error, isFatal);
    if (shown) return;
    shown = true;
    const e = error as { name?: string; message?: string; stack?: string };
    const details = `${e?.name ?? 'Error'}: ${e?.message ?? String(error)}\n\n${(e?.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
    // Keep the app open so the message can be read / screenshotted.
    Alert.alert('SafePair hit an error', details, [{ text: 'Close app', onPress: () => previous(error, isFatal) }]);
  });
}

export {};
