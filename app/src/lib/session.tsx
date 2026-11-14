import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { createApi, normalizeServerUrl, register as apiRegister, type Api } from './api';
import {
  currentLocation,
  requestForegroundPermission,
  startBackgroundSharing,
  stopBackgroundSharing,
  watchForeground,
} from './location';
import { notifyNow, registerForPushToken } from './notifications';
import {
  clearCredentials,
  DEFAULT_EMERGENCY_NUMBER,
  loadBackgroundSharing,
  loadCredentials,
  loadEmergencyNumber,
  loadHome,
  saveBackgroundSharing,
  saveCredentials,
  saveEmergencyNumber,
  saveHome,
  type Credentials,
} from './storage';
import type { Home, Location, Me, Message, Partner, SessionPayload, Sos } from './types';

export type ChatMessage = Message & { pending?: boolean; failed?: boolean };

type Status = 'loading' | 'signedOut' | 'ready';

type SessionValue = {
  status: Status;
  serverUrl: string | null;
  me: Me | null;
  partner: Partner | null;
  connected: boolean;
  myLocation: Location | null;
  locationPermission: boolean | null;
  backgroundSharing: boolean;
  home: Home | null;
  emergencyNumber: string;
  messages: ChatMessage[];
  unread: number;
  partnerTyping: boolean;
  /** Set when the partner raised an SOS that we haven't dismissed on screen yet. */
  incomingSos: Sos | null;

  register(serverUrl: string, name: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  rename(name: string): Promise<void>;
  createPairCode(): Promise<{ code: string; expiresAt: number }>;
  joinPair(code: string): Promise<void>;
  unpair(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  retryMessage(clientId: string): Promise<void>;
  shareMyLocation(): Promise<void>;
  sendTyping(): void;
  markRead(): void;
  /** Chat screen reports whether it's on screen (for unread counts / banners). */
  setChatOpen(open: boolean): void;
  triggerSos(note?: string): Promise<void>;
  resolveSos(): Promise<void>;
  dismissIncomingSos(): void;
  setHome(home: Home | null): Promise<void>;
  setBackgroundSharing(on: boolean): Promise<void>;
  setEmergencyNumber(num: string): Promise<void>;
  requestLocation(): Promise<boolean>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

const SOS_VIBRATION = [0, 800, 300, 800, 300, 800];

let clientIdCounter = 0;
const newClientId = () => `${Date.now().toString(36)}-${(clientIdCounter++).toString(36)}`;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [connected, setConnected] = useState(false);
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [backgroundSharing, setBackgroundSharingState] = useState(true);
  const [home, setHomeState] = useState<Home | null>(null);
  const [emergencyNumber, setEmergencyNumberState] = useState(DEFAULT_EMERGENCY_NUMBER);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [incomingSos, setIncomingSos] = useState<Sos | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const meRef = useRef<Me | null>(null);
  const partnerRef = useRef<Partner | null>(null);
  const myLocationRef = useRef<Location | null>(null);
  // Latest partner fix received over the socket. Kept separately so a location
  // that arrives while /api/me is still in flight isn't lost.
  const partnerLocRef = useRef<Location | null>(null);
  const chatOpenRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    meRef.current = me;
    partnerRef.current = partner;
  }, [me, partner]);

  const api: Api | null = useMemo(
    () => (creds ? createApi(creds.serverUrl, creds.token) : null),
    [creds],
  );

  const applySession = useCallback((s: SessionPayload) => {
    setMe(s.user);
    if (!s.partner) partnerLocRef.current = null;
    const live = partnerLocRef.current;
    const stored = s.partner?.lastLocation;
    setPartner(
      s.partner && live && (!stored || live.timestamp > stored.timestamp)
        ? { ...s.partner, lastLocation: live }
        : s.partner,
    );
    if (s.partner?.sos) setIncomingSos(s.partner.sos);
    else setIncomingSos(null);
  }, []);

  // ---- boot: restore credentials & local prefs --------------------------------
  useEffect(() => {
    (async () => {
      const [c, h, bg, em] = await Promise.all([
        loadCredentials(),
        loadHome(),
        loadBackgroundSharing(),
        loadEmergencyNumber(),
      ]);
      setHomeState(h);
      setEmergencyNumberState(em);
      setBackgroundSharingState(bg);
      if (c) setCreds(c);
      else setStatus('signedOut');
    })();
  }, []);

  const loadMessages = useCallback(async (a: Api) => {
    const { messages: list } = await a.messages();
    setMessages(list);
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    const s = await api.me();
    applySession(s);
    if (s.user.partnerId) await loadMessages(api);
    else setMessages([]);
  }, [api, applySession, loadMessages]);

  // ---- once signed in: load profile, register push -----------------------------
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setStatus('ready');
      } catch (e: any) {
        if (e?.status === 401) {
          await clearCredentials();
          if (!cancelled) {
            setCreds(null);
            setStatus('signedOut');
          }
          return;
        }
        // Offline: still let the user in with what we have; socket will retry.
        if (!cancelled) setStatus('ready');
      }
      const token = await registerForPushToken();
      if (token && !cancelled) {
        pushTokenRef.current = token;
        api.updateMe({ pushToken: token }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refresh]);

  // ---- realtime socket -----------------------------------------------------------
  useEffect(() => {
    if (!creds) return;
    const socket = io(creds.serverUrl, {
      auth: { token: creds.token },
      transports: ['websocket'],
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Re-send our last fix so the partner sees us even if we haven't moved.
      if (meRef.current?.partnerId && myLocationRef.current) {
        socket.emit('location:update', myLocationRef.current);
      }
      refresh().catch(() => {});
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('partner:location', (loc: Location) => {
      partnerLocRef.current = loc;
      setPartner((p) => (p ? { ...p, lastLocation: loc, sos: p.sos ? { ...p.sos, location: loc } : p.sos } : p));
    });
    socket.on('partner:status', ({ online }: { online: boolean }) =>
      setPartner((p) => (p ? { ...p, online } : p)),
    );
    socket.on('partner:typing', () => {
      setPartnerTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setPartnerTyping(false), 3000);
    });
    socket.on('pair:updated', () => refresh().catch(() => {}));

    socket.on('sos:alert', ({ from, sos }: { from: { name: string }; sos: Sos }) => {
      setPartner((p) => (p ? { ...p, sos, lastLocation: sos.location ?? p.lastLocation } : p));
      setIncomingSos(sos);
      Vibration.vibrate(SOS_VIBRATION);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // The server also sends a push; only add a local one if we don't have push.
      if (!pushTokenRef.current) {
        notifyNow(`🆘 ${from.name} needs help!`, sos.note || 'Open SafePair to see where they are.', 'sos', {
          type: 'sos',
        }).catch(() => {});
      }
    });
    socket.on('sos:resolved', () => {
      setPartner((p) => (p ? { ...p, sos: null } : p));
      setIncomingSos(null);
      Vibration.cancel();
    });
    socket.on('sos:status', (sos: Sos | null) => setMe((m) => (m ? { ...m, sos } : m)));

    socket.on('message:new', (msg: Message) => {
      setMessages((list) => {
        if (list.some((m) => m.id === msg.id)) return list;
        const i = msg.clientId ? list.findIndex((m) => m.clientId === msg.clientId) : -1;
        if (i >= 0) {
          const copy = list.slice();
          copy[i] = msg;
          return copy;
        }
        return [...list, msg];
      });
      if (msg.from !== meRef.current?.id) {
        setPartnerTyping(false);
        const visible = chatOpenRef.current && AppState.currentState === 'active';
        if (!visible) setUnread((n) => n + 1);
        // App is open but chat isn't on screen (or app just backgrounded): local banner.
        if (!visible && msg.kind !== 'sos' && msg.kind !== 'system') {
          notifyNow(partnerRef.current?.name ?? 'SafePair', msg.text, 'messages', {
            type: 'message',
          }).catch(() => {});
        }
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [creds, refresh]);

  // ---- foreground location ---------------------------------------------------------
  const requestLocation = useCallback(async () => {
    const ok = await requestForegroundPermission();
    setLocationPermission(ok);
    return ok;
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    requestForegroundPermission().then(setLocationPermission);
  }, [status]);

  useEffect(() => {
    if (!locationPermission || status !== 'ready') return;
    let sub: { remove(): void } | null = null;
    let cancelled = false;
    watchForeground((loc) => {
      myLocationRef.current = loc;
      setMyLocation(loc);
      if (meRef.current?.partnerId) socketRef.current?.emit('location:update', loc);
    }).then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [locationPermission, status]);

  // Background sharing whenever paired and enabled.
  const paired = !!me?.partnerId;

  // Send our current position as soon as we become paired.
  useEffect(() => {
    if (paired && myLocationRef.current) socketRef.current?.emit('location:update', myLocationRef.current);
  }, [paired]);
  useEffect(() => {
    if (!locationPermission) return;
    if (paired && backgroundSharing) startBackgroundSharing();
    else stopBackgroundSharing();
  }, [paired, backgroundSharing, locationPermission]);

  // ---- actions ------------------------------------------------------------------------

  const register = useCallback(async (serverUrl: string, name: string) => {
    const url = normalizeServerUrl(serverUrl);
    const res = await apiRegister(url, name);
    const c = { token: res.token, serverUrl: url };
    await saveCredentials(c);
    applySession(res);
    setMessages([]);
    setCreds(c);
  }, [applySession]);

  const signOut = useCallback(async () => {
    await stopBackgroundSharing();
    await clearCredentials();
    setCreds(null);
    setMe(null);
    setPartner(null);
    setMessages([]);
    setIncomingSos(null);
    setStatus('signedOut');
  }, []);

  const requireApi = () => {
    if (!api) throw new Error('Not signed in');
    return api;
  };

  const rename = async (name: string) => applySession(await requireApi().updateMe({ name }));
  const createPairCode = () => requireApi().createPairCode();
  const joinPair = async (code: string) => {
    const a = requireApi();
    applySession(await a.joinPair(code.trim()));
    await loadMessages(a);
  };
  const unpair = async () => {
    applySession(await requireApi().unpair());
    setMessages([]);
    setUnread(0);
  };

  const deliver = async (clientId: string, payload: { text?: string; location?: Location | null }) => {
    const socket = socketRef.current;
    const markFailed = () =>
      setMessages((list) => list.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
    if (!socket?.connected) return markFailed();
    try {
      const res = await socket.timeout(10_000).emitWithAck('message:send', { ...payload, clientId });
      if (!res?.ok) markFailed();
    } catch {
      markFailed();
    }
  };

  const enqueue = async (payload: { text?: string; location?: Location | null }, kind: Message['kind']) => {
    if (!me?.partnerId) return;
    const clientId = newClientId();
    setMessages((list) => [
      ...list,
      {
        id: `local-${clientId}`,
        clientId,
        from: me.id,
        to: me.partnerId!,
        kind,
        text: payload.text || '📍 Shared a location',
        location: payload.location ?? null,
        createdAt: Date.now(),
        pending: true,
      },
    ]);
    await deliver(clientId, payload);
  };

  const sendMessage = async (text: string) => {
    const t = text.trim();
    if (t) await enqueue({ text: t }, 'text');
  };

  const retryMessage = async (clientId: string) => {
    const msg = messages.find((m) => m.clientId === clientId);
    if (!msg) return;
    setMessages((list) => list.map((m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m)));
    await deliver(clientId, msg.kind === 'location' ? { location: msg.location } : { text: msg.text });
  };

  const shareMyLocation = async () => {
    const loc = myLocation ?? (await currentLocation());
    if (!loc) throw new Error('Your location is not available yet.');
    await enqueue({ location: loc }, 'location');
  };

  const sendTyping = () => socketRef.current?.emit('typing');
  const markRead = useCallback(() => setUnread(0), []);
  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open;
    if (open) setUnread(0);
  }, []);

  const triggerSos = async (note?: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const location = myLocation ?? (await currentLocation());
    const payload = { location, note };
    const socket = socketRef.current;
    if (socket?.connected) {
      try {
        const res = await socket.timeout(5_000).emitWithAck('sos:trigger', payload);
        if (res?.ok) return;
        throw new Error(res?.error ?? 'SOS failed');
      } catch {
        // fall through to HTTP
      }
    }
    await requireApi().triggerSos(payload);
    setMe((m) => (m ? { ...m, sos: { active: true, startedAt: Date.now(), note: note ?? null, location } } : m));
  };

  const resolveSos = async () => {
    await requireApi().resolveSos();
    setMe((m) => (m ? { ...m, sos: null } : m));
  };

  const dismissIncomingSos = () => {
    Vibration.cancel();
    setIncomingSos(null);
  };

  const setHome = async (h: Home | null) => {
    await saveHome(h);
    setHomeState(h);
  };

  const setBackgroundSharing = async (on: boolean) => {
    await saveBackgroundSharing(on);
    setBackgroundSharingState(on);
  };

  const setEmergencyNumber = async (num: string) => {
    const clean = num.replace(/[^\d+*#]/g, '') || DEFAULT_EMERGENCY_NUMBER;
    await saveEmergencyNumber(clean);
    setEmergencyNumberState(clean);
  };

  const value: SessionValue = {
    status,
    serverUrl: creds?.serverUrl ?? null,
    me,
    partner,
    connected,
    myLocation,
    locationPermission,
    backgroundSharing,
    home,
    emergencyNumber,
    messages,
    unread,
    partnerTyping,
    incomingSos,
    register,
    signOut,
    refresh,
    rename,
    createPairCode,
    joinPair,
    unpair,
    sendMessage,
    retryMessage,
    shareMyLocation,
    sendTyping,
    markRead,
    setChatOpen,
    triggerSos,
    resolveSos,
    dismissIncomingSos,
    setHome,
    setBackgroundSharing,
    setEmergencyNumber,
    requestLocation,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
