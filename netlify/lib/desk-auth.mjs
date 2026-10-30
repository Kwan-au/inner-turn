import { getStore } from "@netlify/blobs";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Server-side desk security: allow-list, Identity check, signed session cookie,
// per-IP / per-email rate limits, audit log and email alerts. Nothing here trusts the browser.

export const DESK_INBOX = "desk@innerturn.com.au";
export const MIN_PHRASE = 16;

const IDENTITY = "https://www.innerturn.com.au/.netlify/identity";
const COOKIE = "__Host-inner-turn-desk";
const SESSION_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const TOUCH_MS = 60 * 1000;

const PAUSE_AT = 5;
const PAUSE_MS = 60 * 1000;
const UNLOCK_AT = 8;
const UNLOCK_MS = 15 * 60 * 1000;
const HARD_AT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export class ConfigError extends Error {}

export function deskStore() {
  return getStore("inner-turn-desk", { consistency: "strong" });
}

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

// ---------- allow-list ----------

export function allowedEmails() {
  return String(process.env.DESK_ALLOWED_EMAILS || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email) {
  const e = String(email || "").trim().toLowerCase();
  return Boolean(e) && allowedEmails().includes(e);
}

function sessionSecret() {
  const s = process.env.DESK_SESSION_SECRET || "";
  if (s.length < 32) throw new ConfigError("DESK_SESSION_SECRET missing or shorter than 32 characters");
  return s;
}

export function configProblem() {
  if (!allowedEmails().length) return "DESK_ALLOWED_EMAILS";
  try {
    sessionSecret();
  } catch {
    return "DESK_SESSION_SECRET";
  }
  return "";
}

// ---------- request meta ----------

export function clientMeta(req, context) {
  const ip = String(context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown").slice(0, 64);
  const ua = String(req.headers.get("user-agent") || "").slice(0, 200);
  return { ip, ua };
}

// ---------- Identity ----------

function userFrom(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.sub || raw.id || "").trim();
  const email = String(raw.email || "").trim().toLowerCase();
  return id && email ? { id, email } : null;
}

// Netlify verifies the Identity JWT signature before filling clientContext.user. When the
// runtime does not provide it, the token is checked against Identity itself.
export async function identityUser(req, context) {
  const fromGateway = userFrom(context?.clientContext?.user);
  if (fromGateway) return fromGateway;

  const header = req.headers.get("authorization") || "";
  if (!/^Bearer\s+[\w.-]+$/i.test(header)) return null;
  try {
    const res = await fetch(IDENTITY + "/user", { headers: { Authorization: header }, redirect: "error" });
    if (!res.ok) return null;
    return userFrom(await res.json());
  } catch {
    return null;
  }
}

export async function identityPasswordGrant(email, password) {
  const res = await fetch(IDENTITY + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", username: email, password }),
    redirect: "error"
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---------- helpers ----------

export function newToken() {
  return randomBytes(32).toString("hex");
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hmac(text) {
  return createHmac("sha256", sessionSecret()).update(text).digest("base64url");
}

// ---------- phrase hashing (scrypt) ----------

const scrypt = promisify(scryptCb);
export const KDF = "scrypt-n32768-r8-p1";
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPhrase(phrase) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(String(phrase).normalize("NFKC"), salt, 32, SCRYPT)).toString("hex");
  return { kdf: KDF, salt, hash };
}

async function pbkdf2Hex(phrase, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, key, 256);
  return Buffer.from(bits).toString("hex");
}

// Older gates (PBKDF2, and SHA-256 of email + phrase before that) still unlock once and are
// rewritten as scrypt on that unlock.
export async function phraseMatches(gate, email, phrase) {
  if (!gate || !gate.hash) return false;
  const p = String(phrase || "");
  if (gate.kdf === KDF) {
    const got = (await scrypt(p.normalize("NFKC"), gate.salt, 32, SCRYPT)).toString("hex");
    return same(got, gate.hash);
  }
  if (gate.kdf === "pbkdf2-sha256-310k" && gate.salt) return same(await pbkdf2Hex(p, gate.salt), gate.hash);
  return same(await sha256Hex(email + "\n" + p), gate.hash);
}

// ---------- audit log ----------

export async function audit(desk, entry) {
  const row = {
    at: new Date().toISOString(),
    event: String(entry.event || "").slice(0, 40),
    email: String(entry.email || "").slice(0, 120),
    ip: String(entry.ip || "").slice(0, 64),
    ua: String(entry.ua || "").slice(0, 200),
    result: String(entry.result || "").slice(0, 40),
    detail: String(entry.detail || "").slice(0, 200)
  };
  // Newest first in key order.
  const key = "audit/" + String(9e15 - Date.now()).padStart(16, "0") + "-" + randomBytes(3).toString("hex");
  console.log(JSON.stringify({ kind: "desk-audit", ...row, ua: undefined }));
  try {
    await desk.setJSON(key, row);
  } catch (err) {
    console.error("desk audit write failed", err?.message);
  }
}

export async function readAudit(desk, n = 20) {
  const { blobs } = await desk.list({ prefix: "audit/" });
  const keys = blobs.map((b) => b.key).sort();
  if (keys.length > 2000) {
    await Promise.all(keys.slice(2000).map((k) => desk.delete(k).catch(() => {})));
  }
  const rows = await Promise.all(keys.slice(0, n).map((k) => desk.get(k, { type: "json" }).catch(() => null)));
  return rows.filter(Boolean);
}

// ---------- email alerts ----------

export async function sendDeskMail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("desk mail not sent (no RESEND_API_KEY):", subject);
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DESK_AGENT_FROM || "Inner Turn desk <agent@innerturn.com.au>",
        to: [DESK_INBOX],
        subject,
        text
      })
    });
    if (!res.ok) console.error("desk mail failed", res.status);
    return { sent: res.ok };
  } catch (err) {
    console.error("desk mail failed", err?.message);
    return { sent: false };
  }
}

export function alertText(lines, meta) {
  return [
    ...lines,
    "",
    "Time: " + new Date().toISOString(),
    "IP: " + (meta.ip || "unknown"),
    "Device: " + (meta.ua || "unknown"),
    "",
    "Not you? Open /dash.html and press \"Not me? Lock desk now\", then change the Identity password."
  ].join("\n");
}

// ---------- rate limits ----------

export function limitKeys(ip, email) {
  const keys = ["rl/ip/" + String(ip || "unknown").replace(/[^0-9a-fA-F:.]/g, "_")];
  // Per-email counters only for desk emails, so random addresses cannot fill the store.
  if (isAllowed(email)) keys.push("rl/email/" + String(email).toLowerCase());
  return keys;
}

function blankLimit() {
  return { n: 0, un: 0, day: [], until: 0, reason: "", hard: false };
}

async function readLimit(desk, key) {
  const row = (await desk.get(key, { type: "json" }).catch(() => null)) || blankLimit();
  row.day = (Array.isArray(row.day) ? row.day : []).filter((t) => t > Date.now() - DAY_MS);
  return row;
}

export async function limitState(desk, keys) {
  let out = { blocked: false };
  for (const key of keys) {
    const row = await readLimit(desk, key);
    if (row.hard) return { blocked: true, reason: "hard", key };
    if (row.until > Date.now() && (!out.blocked || row.until > out.until)) {
      out = { blocked: true, reason: row.reason || "pause", until: row.until, key };
    }
  }
  return out;
}

export async function hardLocked(desk, keys) {
  for (const key of keys) {
    if ((await readLimit(desk, key)).hard) return true;
  }
  return false;
}

// Stage is "identity" or "unlock". Returns the strongest lock this failure set, if any.
export async function recordFailure(desk, keys, stage, meta) {
  let worst = "";
  for (const key of keys) {
    const row = await readLimit(desk, key);
    const now = Date.now();
    row.n += 1;
    row.day.push(now);
    if (stage === "unlock") row.un += 1;
    if (!row.hard && row.day.length >= HARD_AT) {
      row.hard = true;
      row.hardAt = new Date().toISOString();
      worst = "hard";
      await audit(desk, { ...meta, event: "lockout", result: "hard", detail: key + " · " + HARD_AT + " failures in 24h" });
      await sendDeskMail(
        "Inner Turn desk LOCKED: " + HARD_AT + " failed attempts in 24 hours",
        alertText(
          [
            "The desk login has been locked until it is cleared by hand.",
            "Locked counter: " + key,
            "Last attempted email: " + (meta.email || "unknown"),
            "",
            "To clear it: Netlify → Blobs → inner-turn-desk → delete the entry " + key + "."
          ],
          meta
        )
      );
    } else if (!row.hard && stage === "unlock" && row.un >= UNLOCK_AT) {
      row.until = now + UNLOCK_MS;
      row.reason = "locked";
      row.un = 0;
      row.n = 0;
      if (worst !== "hard") worst = "locked";
      await audit(desk, { ...meta, event: "lockout", result: "15 min", detail: key });
    } else if (!row.hard && row.n >= PAUSE_AT) {
      row.until = now + PAUSE_MS;
      row.reason = "pause";
      row.n = 0;
      if (!worst) worst = "pause";
      await audit(desk, { ...meta, event: "lockout", result: "1 min", detail: key });
    }
    await desk.setJSON(key, row);
  }
  return worst;
}

export async function recordSuccess(desk, keys) {
  for (const key of keys) {
    const row = await readLimit(desk, key);
    if (row.hard) continue;
    await desk.setJSON(key, { ...row, n: 0, un: 0, until: 0, reason: "" });
  }
}

export function limitResponse(state) {
  const retry = state.until ? Math.max(1, Math.ceil((state.until - Date.now()) / 1000)) : 0;
  return json(
    { ok: false, error: state.reason, retryAfter: retry || undefined },
    state.reason === "hard" ? 423 : 429,
    retry ? { "retry-after": String(retry) } : {}
  );
}

// ---------- session cookie ----------

function readCookie(req) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === COOKIE) return part.slice(i + 1);
  }
  return "";
}

function parseCookie(value) {
  const m = /^v1\.([a-f0-9]{64})\.(\d{10,16})\.([\w-]{43})$/.exec(value || "");
  return m ? { sid: m[1], exp: Number(m[2]), sig: m[3] } : null;
}

export function cookieSid(req) {
  return parseCookie(readCookie(req))?.sid || "";
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function revokedBefore(desk) {
  const row = await desk.get("sessions-epoch", { type: "json" }).catch(() => null);
  return row && row.at ? Date.parse(row.at) : 0;
}

export async function readSession(desk, req, user) {
  const c = parseCookie(readCookie(req));
  if (!c || !user) return null;
  if (!same(hmac(`v1.${c.sid}.${user.id}.${c.exp}`), c.sig)) return null;
  const now = Date.now();
  if (c.exp < now) return null;
  const row = await desk.get("session:" + c.sid, { type: "json" }).catch(() => null);
  if (!row || row.uid !== user.id || row.email !== user.email || row.exp !== c.exp) return null;
  if (row.exp < now || now - (row.last || 0) > IDLE_MS || row.created < (await revokedBefore(desk))) {
    await desk.delete("session:" + c.sid).catch(() => {});
    return null;
  }
  if (now - row.last > TOUCH_MS) {
    row.last = now;
    await desk.setJSON("session:" + c.sid, row);
  }
  return { ...row, sid: c.sid };
}

// Always a fresh id; the session the browser held before is deleted.
export async function issueSession(desk, req, user, meta) {
  const old = cookieSid(req);
  if (old) await desk.delete("session:" + old).catch(() => {});
  const sid = newToken();
  const now = Date.now();
  const exp = now + SESSION_MS;
  await desk.setJSON("session:" + sid, {
    uid: user.id,
    email: user.email,
    created: now,
    last: now,
    exp,
    ip: meta.ip,
    ua: meta.ua
  });
  const value = `v1.${sid}.${exp}.${hmac(`v1.${sid}.${user.id}.${exp}`)}`;
  return {
    exp,
    cookie: `${COOKIE}=${value}; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}; HttpOnly; Secure; SameSite=Strict`
  };
}

export async function revokeAllSessions(desk) {
  await desk.setJSON("sessions-epoch", { at: new Date().toISOString() });
  const { blobs } = await desk.list({ prefix: "session:" });
  await Promise.all(blobs.map((b) => desk.delete(b.key).catch(() => {})));
}

// ---------- gate for every desk API ----------

// Identity JWT (401) → allow-list (403) → not hard-locked (423) → session cookie (403 "unlock").
export async function requireDesk(req, context) {
  const missing = configProblem();
  if (missing) return { ok: false, status: 503, error: "config" };

  const meta = clientMeta(req, context);
  const user = await identityUser(req, context);
  if (!user) return { ok: false, status: 401, error: "identity" };

  const desk = deskStore();
  if (!isAllowed(user.email)) {
    await audit(desk, { ...meta, email: user.email, event: "denied", result: "not on allow-list", detail: new URL(req.url).pathname });
    await recordFailure(desk, limitKeys(meta.ip, ""), "identity", { ...meta, email: user.email });
    return { ok: false, status: 403, error: "forbidden" };
  }
  if (await hardLocked(desk, limitKeys(meta.ip, user.email))) {
    return { ok: false, status: 423, error: "hard" };
  }
  const session = await readSession(desk, req, user);
  if (!session) return { ok: false, status: 403, error: "unlock", user, email: user.email, desk, meta };
  return { ok: true, user, email: user.email, desk, session, meta };
}

export function deny(gate) {
  return json({ ok: false, error: gate.error }, gate.status);
}
