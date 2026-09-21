import { randomBytes, timingSafeEqual } from "node:crypto";
import { hashUnlockPhrase } from "./desk-auth.mjs";

export const UNLOCK_KEY = "unlock";
export const SESSION_PREFIX = "session:";
export const FAIL_PREFIX = "fail:";
export const MIN_PHRASE = 12;
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const FAIL_LIMIT = 8;
export const FAIL_LOCK_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function phraseOk(phrase) {
  return typeof phrase === "string" && phrase.length >= MIN_PHRASE;
}

async function readUnlock(store) {
  const row = await store.getJSON(UNLOCK_KEY);
  return row && typeof row.hash === "string" ? row : null;
}

async function readFail(store, ip) {
  return (await store.getJSON(FAIL_PREFIX + ip)) || { count: 0, lockedUntil: 0 };
}

async function writeFail(store, ip, row) {
  await store.setJSON(FAIL_PREFIX + ip, row);
}

async function clearFail(store, ip) {
  await store.delete(FAIL_PREFIX + ip);
}

async function lockedOut(store, ip, now) {
  const fail = await readFail(store, ip);
  if (fail.lockedUntil && now < fail.lockedUntil) {
    return { locked: true, fail };
  }
  if (fail.lockedUntil && now >= fail.lockedUntil) {
    const reset = { count: 0, lockedUntil: 0 };
    await writeFail(store, ip, reset);
    return { locked: false, fail: reset };
  }
  return { locked: false, fail };
}

async function registerFail(store, ip, fail, now) {
  const count = (fail.count || 0) + 1;
  const next = count >= FAIL_LIMIT
    ? { count: 0, lockedUntil: now + FAIL_LOCK_MS }
    : { count, lockedUntil: 0 };
  await writeFail(store, ip, next);
  return next.lockedUntil > now;
}

async function issueSession(store, email, now) {
  const token = randomBytes(32).toString("hex");
  await store.setJSON(SESSION_PREFIX + token, {
    email,
    exp: now + SESSION_MS
  });
  return token;
}

async function validSession(store, email, token, now) {
  if (!token) return false;
  const row = await store.getJSON(SESSION_PREFIX + token);
  return Boolean(row && row.email === email && row.exp > now);
}

async function wipeSessions(store) {
  const keys = await store.list(SESSION_PREFIX);
  await Promise.all(keys.map((key) => store.delete(key)));
}

function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function handleDeskUnlock({
  method,
  body,
  email,
  sessionToken = "",
  ip = "unknown",
  store,
  now = Date.now()
}) {
  if (!email) return { status: 401, body: { ok: false, error: "identity" } };

  if (method === "GET") {
    const row = await readUnlock(store);
    const set = Boolean(row);
    const unlocked = set && await validSession(store, email, sessionToken, now);
    return { status: 200, body: { ok: true, set, unlocked } };
  }

  if (method !== "POST") {
    return { status: 405, body: { ok: false, error: "method" } };
  }

  const payload = parseBody(body);
  if (!payload) return { status: 400, body: { ok: false, error: "body" } };

  const action = String(payload.action || "").trim().toLowerCase();
  const row = await readUnlock(store);
  const set = Boolean(row);

  if (action === "wipe") {
    await store.delete(UNLOCK_KEY);
    await wipeSessions(store);
    return { status: 200, body: { ok: true, set: false } };
  }

  const { locked, fail } = await lockedOut(store, ip, now);
  if (locked) return { status: 429, body: { ok: false, error: "locked" } };

  if (action === "set") {
    if (set) return { status: 409, body: { ok: false, error: "exists" } };
    if (!phraseOk(payload.phrase)) {
      return { status: 400, body: { ok: false, error: "phrase" } };
    }
    await store.setJSON(UNLOCK_KEY, { hash: hashUnlockPhrase(email, payload.phrase) });
    await clearFail(store, ip);
    const token = await issueSession(store, email, now);
    return { status: 200, body: { ok: true, set: true, token } };
  }

  if (action === "unlock") {
    if (!set) return { status: 400, body: { ok: false, error: "unset" } };
    if (!phraseOk(payload.phrase) || !safeEqual(row.hash, hashUnlockPhrase(email, payload.phrase))) {
      const nowLocked = await registerFail(store, ip, fail, now);
      return {
        status: nowLocked ? 429 : 401,
        body: { ok: false, error: nowLocked ? "locked" : "unlock" }
      };
    }
    await clearFail(store, ip);
    const token = await issueSession(store, email, now);
    return { status: 200, body: { ok: true, set: true, token } };
  }

  if (action === "change") {
    if (!set) return { status: 400, body: { ok: false, error: "unset" } };
    if (!phraseOk(payload.phrase) || !safeEqual(row.hash, hashUnlockPhrase(email, payload.phrase))) {
      const nowLocked = await registerFail(store, ip, fail, now);
      return {
        status: nowLocked ? 429 : 401,
        body: { ok: false, error: nowLocked ? "locked" : "unlock" }
      };
    }
    if (!phraseOk(payload.next)) {
      return { status: 400, body: { ok: false, error: "phrase" } };
    }
    await store.setJSON(UNLOCK_KEY, { hash: hashUnlockPhrase(email, payload.next) });
    await wipeSessions(store);
    await clearFail(store, ip);
    const token = await issueSession(store, email, now);
    return { status: 200, body: { ok: true, set: true, token } };
  }

  return { status: 400, body: { ok: false, error: "action" } };
}
