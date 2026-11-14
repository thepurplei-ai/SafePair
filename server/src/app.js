import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { Store } from './store.js';
import { sendExpoPush } from './push.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 40;

// ---- validation helpers ---------------------------------------------------

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Returns a sanitized location object or null if invalid. */
export function parseLocation(input) {
  if (!input || typeof input !== 'object') return null;
  const { latitude, longitude } = input;
  if (!isFiniteNum(latitude) || !isFiniteNum(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const opt = (v) => (isFiniteNum(v) ? v : null);
  return {
    latitude,
    longitude,
    accuracy: opt(input.accuracy),
    heading: opt(input.heading),
    speed: opt(input.speed),
    battery: isFiniteNum(input.battery) && input.battery >= 0 && input.battery <= 1 ? input.battery : null,
    timestamp: isFiniteNum(input.timestamp) ? input.timestamp : Date.now(),
  };
}

const cleanName = (name) =>
  typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';

export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    lastLocation: u.lastLocation,
    sos: u.sos,
  };

// ---- app ------------------------------------------------------------------

export function createApp({ store = new Store(), push = sendExpoPush, corsOrigin = '*' } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });

  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', corsOrigin);
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const isOnline = (userId) => (io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0;
  const emitTo = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);

  const sessionPayload = (user) => {
    const partner = user.partnerId ? store.getUser(user.partnerId) : null;
    return {
      user: { ...publicUser(user), partnerId: user.partnerId },
      partner: partner ? { ...publicUser(partner), online: isOnline(partner.id) } : null,
    };
  };

  // ---- shared actions (used by both REST and sockets) ----------------------

  function updateLocation(user, raw) {
    const location = parseLocation(raw);
    if (!location) return { ok: false, error: 'Invalid location' };
    store.updateUser(user.id, { lastLocation: location });
    if (user.sos) store.updateUser(user.id, { sos: { ...user.sos, location } });
    if (user.partnerId) emitTo(user.partnerId, 'partner:location', location);
    return { ok: true };
  }

  function triggerSos(user, { location: raw, note } = {}) {
    if (!user.partnerId) return { ok: false, error: 'Not paired' };
    const location = parseLocation(raw) ?? user.lastLocation;
    if (location) store.updateUser(user.id, { lastLocation: location });
    const sos = {
      active: true,
      startedAt: Date.now(),
      note: typeof note === 'string' ? note.slice(0, 200) : null,
      location,
    };
    store.updateUser(user.id, { sos });
    const partner = store.getUser(user.partnerId);
    emitTo(partner.id, 'sos:alert', { from: publicUser(user), sos });
    emitTo(user.id, 'sos:status', sos);
    // SOS is always pushed, even if the partner has the app open, so it
    // reaches them if the app is backgrounded but the socket hasn't dropped yet.
    push({
      to: partner.pushToken,
      title: `🆘 ${user.name} needs help!`,
      body: sos.note || 'Tap to see their location.',
      data: { type: 'sos', userId: user.id },
      priority: 'high',
      channelId: 'sos',
    });
    const msg = store.addMessage(user.id, partner.id, {
      kind: 'sos',
      text: sos.note || 'SOS – I need help!',
      location,
    });
    emitTo(partner.id, 'message:new', msg);
    emitTo(user.id, 'message:new', msg);
    return { ok: true, sos };
  }

  function resolveSos(user) {
    if (!user.sos) return { ok: true };
    store.updateUser(user.id, { sos: null });
    emitTo(user.id, 'sos:status', null);
    if (user.partnerId) {
      const partner = store.getUser(user.partnerId);
      emitTo(partner.id, 'sos:resolved', { from: publicUser(user) });
      push({
        to: partner.pushToken,
        title: `✅ ${user.name} is safe`,
        body: 'The SOS alert was cancelled.',
        data: { type: 'sos-resolved', userId: user.id },
        channelId: 'sos',
      });
      const msg = store.addMessage(user.id, partner.id, { kind: 'system', text: "I'm safe now." });
      emitTo(partner.id, 'message:new', msg);
      emitTo(user.id, 'message:new', msg);
    }
    return { ok: true };
  }

  function sendMessage(user, { text, clientId, location: raw } = {}) {
    if (!user.partnerId) return { ok: false, error: 'Not paired' };
    const location = raw ? parseLocation(raw) : null;
    const body = typeof text === 'string' ? text.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
    if (!body && !location) return { ok: false, error: 'Empty message' };
    const partner = store.getUser(user.partnerId);
    const msg = store.addMessage(user.id, partner.id, {
      kind: location ? 'location' : 'text',
      text: body || '📍 Shared a location',
      location,
      clientId: typeof clientId === 'string' ? clientId.slice(0, 64) : null,
    });
    emitTo(partner.id, 'message:new', msg);
    emitTo(user.id, 'message:new', msg);
    if (!isOnline(partner.id)) {
      push({
        to: partner.pushToken,
        title: user.name,
        body: msg.text,
        data: { type: 'message', userId: user.id },
        channelId: 'messages',
      });
    }
    return { ok: true, message: msg };
  }

  // ---- REST ----------------------------------------------------------------

  const auth = (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = store.userForToken(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  };

  const reply = (res, result) =>
    result.ok ? res.json(result) : res.status(400).json({ error: result.error });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/register', (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { user, token } = store.createUser(name);
    res.status(201).json({ token, ...sessionPayload(user) });
  });

  app.get('/api/me', auth, (req, res) => res.json(sessionPayload(req.user)));

  app.patch('/api/me', auth, (req, res) => {
    const patch = {};
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
      patch.name = name;
    }
    if (req.body?.pushToken !== undefined) {
      patch.pushToken = typeof req.body.pushToken === 'string' ? req.body.pushToken : null;
    }
    const user = store.updateUser(req.user.id, patch);
    if (user.partnerId) emitTo(user.partnerId, 'pair:updated');
    res.json(sessionPayload(user));
  });

  app.post('/api/pair/code', auth, (req, res) => {
    if (req.user.partnerId) return res.status(400).json({ error: 'Already paired' });
    res.json(store.createPairCode(req.user.id));
  });

  app.post('/api/pair/join', auth, (req, res) => {
    const result = store.redeemPairCode(req.user.id, req.body?.code);
    if (!result.ok) return res.status(400).json({ error: result.error });
    emitTo(result.partner.id, 'pair:updated');
    emitTo(req.user.id, 'pair:updated');
    // Make sure both sockets start receiving presence for each other.
    emitTo(result.partner.id, 'partner:status', { online: isOnline(req.user.id) });
    res.json(sessionPayload(req.user));
  });

  app.delete('/api/pair', auth, (req, res) => {
    const formerPartner = store.unpair(req.user.id);
    if (formerPartner) emitTo(formerPartner, 'pair:updated');
    emitTo(req.user.id, 'pair:updated');
    res.json(sessionPayload(req.user));
  });

  // HTTP fallbacks for the background location task / unreliable sockets.
  app.post('/api/location', auth, (req, res) => reply(res, updateLocation(req.user, req.body)));
  app.post('/api/sos', auth, (req, res) => reply(res, triggerSos(req.user, req.body)));
  app.delete('/api/sos', auth, (req, res) => reply(res, resolveSos(req.user)));

  app.get('/api/messages', auth, (req, res) => {
    if (!req.user.partnerId) return res.json({ messages: [] });
    const before = Number(req.query.before) || Infinity;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.json({ messages: store.listMessages(req.user.id, req.user.partnerId, { before, limit }) });
  });

  app.post('/api/messages', auth, (req, res) => reply(res, sendMessage(req.user, req.body)));

  // ---- sockets -------------------------------------------------------------

  io.use((socket, next) => {
    const user = store.userForToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('Unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    // Always re-read the user so pair changes made over REST are picked up.
    const me = () => store.getUser(userId);
    const ack = (cb, result) => typeof cb === 'function' && cb(result);

    const wasOnline = isOnline(userId);
    socket.join(`user:${userId}`);
    const partnerId = me()?.partnerId;
    if (partnerId && !wasOnline) emitTo(partnerId, 'partner:status', { online: true });

    socket.on('location:update', (loc, cb) => ack(cb, updateLocation(me(), loc)));
    socket.on('sos:trigger', (payload, cb) => ack(cb, triggerSos(me(), payload)));
    socket.on('sos:resolve', (_payload, cb) => ack(cb, resolveSos(me())));
    socket.on('message:send', (payload, cb) => ack(cb, sendMessage(me(), payload)));
    socket.on('typing', () => {
      const p = me()?.partnerId;
      if (p) emitTo(p, 'partner:typing');
    });

    socket.on('disconnect', () => {
      const p = me()?.partnerId;
      if (p && !isOnline(userId)) emitTo(p, 'partner:status', { online: false });
    });
  });

  return { app, httpServer, io, store };
}
