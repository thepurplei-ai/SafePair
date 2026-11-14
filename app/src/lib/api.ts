import type { Location, Message, SessionPayload } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const normalizeServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

async function request<T>(
  serverUrl: string,
  path: string,
  { token, method = 'GET', body }: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(normalizeServerUrl(serverUrl) + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Can't reach the server at ${serverUrl}`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Thin typed client for the SafePair server REST API. */
export function createApi(serverUrl: string, token: string) {
  const r = <T>(path: string, opts: { method?: string; body?: unknown } = {}) =>
    request<T>(serverUrl, path, { ...opts, token });
  return {
    me: () => r<SessionPayload>('/api/me'),
    updateMe: (patch: { name?: string; pushToken?: string | null }) =>
      r<SessionPayload>('/api/me', { method: 'PATCH', body: patch }),
    createPairCode: () =>
      r<{ code: string; expiresAt: number }>('/api/pair/code', { method: 'POST' }),
    joinPair: (code: string) =>
      r<SessionPayload>('/api/pair/join', { method: 'POST', body: { code } }),
    unpair: () => r<SessionPayload>('/api/pair', { method: 'DELETE' }),
    postLocation: (loc: Partial<Location>) =>
      r<{ ok: true }>('/api/location', { method: 'POST', body: loc }),
    triggerSos: (body: { location?: Partial<Location> | null; note?: string }) =>
      r<{ ok: true }>('/api/sos', { method: 'POST', body }),
    resolveSos: () => r<{ ok: true }>('/api/sos', { method: 'DELETE' }),
    messages: (before?: number) =>
      r<{ messages: Message[] }>(`/api/messages${before ? `?before=${before}` : ''}`),
  };
}

export type Api = ReturnType<typeof createApi>;

export const register = (serverUrl: string, name: string) =>
  request<SessionPayload & { token: string }>(serverUrl, '/api/register', {
    method: 'POST',
    body: { name },
  });
