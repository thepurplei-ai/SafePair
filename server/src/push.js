const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a push notification through Expo's push service.
 * Failures are logged, never thrown: a push is best-effort on top of the
 * realtime socket channel.
 */
export async function sendExpoPush({ to, title, body, data = {}, priority = 'default', channelId }) {
  if (!to || !/^Expo(nent)?PushToken\[.+\]$/.test(to)) return { skipped: true };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ to, title, body, data, priority, sound: 'default', channelId }),
    });
    if (!res.ok) console.warn(`[push] HTTP ${res.status}: ${await res.text()}`);
    return { ok: res.ok };
  } catch (err) {
    console.warn('[push] failed:', err.message);
    return { ok: false };
  }
}
