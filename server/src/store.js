import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_MESSAGES_PER_PAIR = 1000;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Small persistent store. Everything lives in memory and is flushed to a JSON
 * file (debounced) when a file path is given. Good enough for a two-person app
 * on a single server; swap for a real database if you need to scale out.
 */
export class Store {
  constructor({ file = null, now = () => Date.now() } = {}) {
    this.file = file;
    this.now = now;
    this.data = { users: {}, tokens: {}, pairCodes: {}, messages: {} };
    this.flushTimer = null;
    if (file && existsSync(file)) {
      this.data = { ...this.data, ...JSON.parse(readFileSync(file, 'utf8')) };
    }
  }

  save() {
    if (!this.file || this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 250);
    this.flushTimer.unref?.();
  }

  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }

  // ---- users -------------------------------------------------------------

  createUser(name) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const user = {
      id,
      name,
      createdAt: this.now(),
      partnerId: null,
      pushToken: null,
      lastLocation: null,
      sos: null,
    };
    this.data.users[id] = user;
    this.data.tokens[hashToken(token)] = id;
    this.save();
    return { user, token };
  }

  getUser(id) {
    return this.data.users[id] ?? null;
  }

  userForToken(token) {
    if (typeof token !== 'string' || !token) return null;
    const id = this.data.tokens[hashToken(token)];
    return id ? this.getUser(id) : null;
  }

  updateUser(id, patch) {
    const user = this.getUser(id);
    if (!user) return null;
    Object.assign(user, patch);
    this.save();
    return user;
  }

  // ---- pairing -----------------------------------------------------------

  createPairCode(userId) {
    this.prunePairCodes();
    // Drop any older code this user still has outstanding.
    for (const [code, entry] of Object.entries(this.data.pairCodes)) {
      if (entry.userId === userId) delete this.data.pairCodes[code];
    }
    let code;
    do {
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    } while (this.data.pairCodes[code]);
    const expiresAt = this.now() + PAIR_CODE_TTL_MS;
    this.data.pairCodes[code] = { userId, expiresAt };
    this.save();
    return { code, expiresAt };
  }

  prunePairCodes() {
    const now = this.now();
    for (const [code, entry] of Object.entries(this.data.pairCodes)) {
      if (entry.expiresAt <= now) delete this.data.pairCodes[code];
    }
  }

  /** Returns { ok: true, partner } or { ok: false, error }. */
  redeemPairCode(userId, code) {
    this.prunePairCodes();
    const key = String(code ?? '').trim();
    const entry = this.data.pairCodes[key];
    if (!entry) return { ok: false, error: 'Invalid or expired code' };
    if (entry.userId === userId) return { ok: false, error: 'You cannot pair with yourself' };
    const me = this.getUser(userId);
    const other = this.getUser(entry.userId);
    if (!me || !other) return { ok: false, error: 'User not found' };
    if (me.partnerId) return { ok: false, error: 'You are already paired. Unpair first.' };
    if (other.partnerId) return { ok: false, error: 'That person is already paired' };

    delete this.data.pairCodes[key];
    me.partnerId = other.id;
    other.partnerId = me.id;
    this.save();
    return { ok: true, partner: other };
  }

  /** Unpairs both sides. Returns the former partner id (or null). */
  unpair(userId) {
    const me = this.getUser(userId);
    if (!me?.partnerId) return null;
    const partnerId = me.partnerId;
    const partner = this.getUser(partnerId);
    delete this.data.messages[pairKey(userId, partnerId)];
    me.partnerId = null;
    me.sos = null;
    if (partner) {
      partner.partnerId = null;
      partner.sos = null;
    }
    this.save();
    return partnerId;
  }

  // ---- messages ----------------------------------------------------------

  addMessage(fromId, toId, { text, kind = 'text', location = null, clientId = null }) {
    const key = pairKey(fromId, toId);
    const list = (this.data.messages[key] ??= []);
    const message = {
      id: randomUUID(),
      clientId,
      from: fromId,
      to: toId,
      kind,
      text,
      location,
      createdAt: this.now(),
    };
    list.push(message);
    if (list.length > MAX_MESSAGES_PER_PAIR) list.splice(0, list.length - MAX_MESSAGES_PER_PAIR);
    this.save();
    return message;
  }

  listMessages(a, b, { before = Infinity, limit = 50 } = {}) {
    const list = this.data.messages[pairKey(a, b)] ?? [];
    const filtered = list.filter((m) => m.createdAt < before);
    return filtered.slice(-limit);
  }
}

export const pairKey = (a, b) => [a, b].sort().join(':');
