import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp, parseLocation } from '../src/app.js';
import { Store } from '../src/store.js';

let server;
let base;
const pushes = [];
const sockets = [];

before(async () => {
  server = createApp({ store: new Store(), push: async (p) => pushes.push(p) });
  await new Promise((r) => server.httpServer.listen(0, r));
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
  await new Promise((r) => server.httpServer.close(r));
});

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function socketFor(token) {
  const s = connect(base, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}

const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, payload) => new Promise((r) => s.emit(ev, payload, r));

async function pairedUsers() {
  const a = (await api('/api/register', { method: 'POST', body: { name: 'Alice' } })).body;
  const b = (await api('/api/register', { method: 'POST', body: { name: 'Bob' } })).body;
  const { code } = (await api('/api/pair/code', { method: 'POST', token: a.token })).body;
  const joined = await api('/api/pair/join', { method: 'POST', token: b.token, body: { code } });
  assert.equal(joined.status, 200);
  return { a, b };
}

test('parseLocation validates coordinates', () => {
  assert.equal(parseLocation(null), null);
  assert.equal(parseLocation({ latitude: 91, longitude: 0 }), null);
  assert.equal(parseLocation({ latitude: '1', longitude: 2 }), null);
  const loc = parseLocation({ latitude: 1, longitude: 2, battery: 5, timestamp: 10 });
  assert.equal(loc.battery, null);
  assert.equal(loc.timestamp, 10);
});

test('register requires a name and auth is enforced', async () => {
  assert.equal((await api('/api/register', { method: 'POST', body: {} })).status, 400);
  assert.equal((await api('/api/me')).status, 401);
  assert.equal((await api('/api/me', { token: 'nope' })).status, 401);
  const r = await api('/api/register', { method: 'POST', body: { name: '  Carol  ' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.name, 'Carol');
  assert.equal(r.body.partner, null);
  const me = await api('/api/me', { token: r.body.token });
  assert.equal(me.body.user.id, r.body.user.id);
});

test('pairing: codes work once, no self pairing, no double pairing', async () => {
  const a = (await api('/api/register', { method: 'POST', body: { name: 'A' } })).body;
  const b = (await api('/api/register', { method: 'POST', body: { name: 'B' } })).body;
  const c = (await api('/api/register', { method: 'POST', body: { name: 'C' } })).body;
  const { code } = (await api('/api/pair/code', { method: 'POST', token: a.token })).body;
  assert.match(code, /^\d{6}$/);

  const self = await api('/api/pair/join', { method: 'POST', token: a.token, body: { code } });
  assert.equal(self.status, 400);

  const ok = await api('/api/pair/join', { method: 'POST', token: b.token, body: { code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.partner.name, 'A');

  const reuse = await api('/api/pair/join', { method: 'POST', token: c.token, body: { code } });
  assert.equal(reuse.status, 400);

  const again = await api('/api/pair/code', { method: 'POST', token: a.token });
  assert.equal(again.status, 400);

  const meA = await api('/api/me', { token: a.token });
  assert.equal(meA.body.partner.name, 'B');

  await api('/api/pair', { method: 'DELETE', token: b.token });
  const after = await api('/api/me', { token: a.token });
  assert.equal(after.body.partner, null);
});

test('live location is relayed to the partner', async () => {
  const { a, b } = await pairedUsers();
  const sa = await socketFor(a.token);
  const sb = await socketFor(b.token);
  const got = once(sb, 'partner:location');
  const res = await emit(sa, 'location:update', { latitude: 52.5, longitude: 13.4, accuracy: 5 });
  assert.equal(res.ok, true);
  const loc = await got;
  assert.equal(loc.latitude, 52.5);
  const bad = await emit(sa, 'location:update', { latitude: 'x' });
  assert.equal(bad.ok, false);

  // Also via REST fallback (background task).
  const got2 = once(sb, 'partner:location');
  const r = await api('/api/location', { method: 'POST', token: a.token, body: { latitude: 1, longitude: 2 } });
  assert.equal(r.status, 200);
  assert.equal((await got2).longitude, 2);

  const me = await api('/api/me', { token: b.token });
  assert.equal(me.body.partner.lastLocation.latitude, 1);
  assert.equal(me.body.partner.online, true);
});

test('SOS alerts partner, pushes, and can be resolved', async () => {
  const { a, b } = await pairedUsers();
  await api('/api/me', { method: 'PATCH', token: b.token, body: { pushToken: 'ExponentPushToken[bob]' } });
  const sa = await socketFor(a.token);
  const sb = await socketFor(b.token);
  pushes.length = 0;

  const alert = once(sb, 'sos:alert');
  const res = await emit(sa, 'sos:trigger', { location: { latitude: 10, longitude: 20 } });
  assert.equal(res.ok, true);
  const payload = await alert;
  assert.equal(payload.from.name, 'Alice');
  assert.equal(payload.sos.location.latitude, 10);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, 'ExponentPushToken[bob]');
  assert.equal(pushes[0].priority, 'high');

  const meB = await api('/api/me', { token: b.token });
  assert.equal(meB.body.partner.sos.active, true);

  const resolved = once(sb, 'sos:resolved');
  await emit(sa, 'sos:resolve', {});
  await resolved;
  const meB2 = await api('/api/me', { token: b.token });
  assert.equal(meB2.body.partner.sos, null);

  const { messages } = (await api('/api/messages', { token: b.token })).body;
  assert.deepEqual(messages.map((m) => m.kind), ['sos', 'system']);
});

test('SOS requires a partner', async () => {
  const a = (await api('/api/register', { method: 'POST', body: { name: 'Solo' } })).body;
  const r = await api('/api/sos', { method: 'POST', token: a.token, body: {} });
  assert.equal(r.status, 400);
});

test('messaging delivers in realtime and pushes when partner offline', async () => {
  const { a, b } = await pairedUsers();
  await api('/api/me', { method: 'PATCH', token: b.token, body: { pushToken: 'ExponentPushToken[b2]' } });
  const sa = await socketFor(a.token);
  pushes.length = 0;

  // Bob offline → push.
  const r1 = await emit(sa, 'message:send', { text: 'hi bob', clientId: 'c1' });
  assert.equal(r1.ok, true);
  assert.equal(r1.message.clientId, 'c1');
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].body, 'hi bob');

  // Bob online → realtime, no push.
  const sb = await socketFor(b.token);
  const incoming = once(sb, 'message:new');
  await emit(sa, 'message:send', { text: 'you there?' });
  assert.equal((await incoming).text, 'you there?');
  assert.equal(pushes.length, 1);

  const empty = await emit(sa, 'message:send', { text: '   ' });
  assert.equal(empty.ok, false);

  const loc = await emit(sb, 'message:send', { location: { latitude: 1, longitude: 1 } });
  assert.equal(loc.message.kind, 'location');

  const { messages } = (await api('/api/messages', { token: a.token })).body;
  assert.equal(messages.length, 3);
});

test('presence: partner gets online/offline status', async () => {
  const { a, b } = await pairedUsers();
  const sb = await socketFor(b.token);
  const online = once(sb, 'partner:status');
  const sa = await socketFor(a.token);
  assert.deepEqual(await online, { online: true });
  const offline = once(sb, 'partner:status');
  sa.close();
  assert.deepEqual(await offline, { online: false });
});

test('sockets reject bad tokens', async () => {
  await assert.rejects(socketFor('bogus'), /Unauthorized/);
});
