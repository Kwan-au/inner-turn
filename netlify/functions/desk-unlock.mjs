import { randomInt } from "node:crypto";
import {
  DESK_INBOX,
  KDF,
  MIN_PHRASE,
  alertText,
  audit,
  clientMeta,
  configProblem,
  deskStore,
  hashPhrase,
  hmac,
  identityUser,
  isAllowed,
  json,
  limitKeys,
  limitResponse,
  limitState,
  phraseMatches,
  readSession,
  recordFailure,
  recordSuccess,
  revokeAllSessions,
  same,
  sendDeskMail,
  issueSession
} from "../lib/desk-auth.mjs";

const GATE_KEY = "unlock";
const CODE_KEY = "reset-code";
const CODE_MS = 15 * 60 * 1000;
const CODE_GAP_MS = 2 * 60 * 1000;
const CODE_TRIES = 5;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Sign-in code: the everyday second lock, emailed to the desk inbox after Identity passes.
const LOGIN_KEY = "login-code";
const LOGIN_MS = 10 * 60 * 1000;
const LOGIN_GAP_MS = 60 * 1000;
const LOGIN_TRIES = 5;

function newLoginCode() {
  return String(randomInt(1000000)).padStart(6, "0");
}

// Single-use, bound to the Identity account that asked for it; wrong guesses burn it after LOGIN_TRIES.
async function loginCodeMatches(desk, user, raw) {
  const code = String(raw || "").replace(/\D/g, "");
  if (code.length !== 6) return false;
  const row = await desk.get(LOGIN_KEY, { type: "json" }).catch(() => null);
  if (!row || !row.hash || row.exp < Date.now()) return false;
  if (row.uid === user.id && same(hmac("login-code." + user.id + "." + code), row.hash)) {
    await desk.delete(LOGIN_KEY);
    return true;
  }
  row.tries = (row.tries || 0) + 1;
  if (row.tries >= LOGIN_TRIES) await desk.delete(LOGIN_KEY);
  else await desk.setJSON(LOGIN_KEY, row);
  return false;
}

function newCode() {
  let s = "";
  for (let i = 0; i < 10; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

function normCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function saveGate(desk, email, phrase) {
  await desk.setJSON(GATE_KEY, { ...(await hashPhrase(phrase)), setAt: new Date().toISOString(), setBy: email });
}

// A valid code is single-use; wrong guesses burn it after CODE_TRIES.
async function codeMatches(desk, user, raw) {
  const code = normCode(raw);
  if (code.length !== 10) return false;
  const row = await desk.get(CODE_KEY, { type: "json" }).catch(() => null);
  if (!row || !row.hash || row.exp < Date.now()) return false;
  if (row.uid === user.id && same(hmac("reset-code." + code), row.hash)) {
    await desk.delete(CODE_KEY);
    return true;
  }
  row.tries = (row.tries || 0) + 1;
  if (row.tries >= CODE_TRIES) await desk.delete(CODE_KEY);
  else await desk.setJSON(CODE_KEY, row);
  return false;
}

export default async (req, context) => {
  if (configProblem()) return json({ ok: false, error: "config" }, 503);

  const meta = clientMeta(req, context);
  const user = await identityUser(req, context);
  if (!user) return json({ ok: false, error: "identity" }, 401);

  const desk = deskStore();
  const who = { ...meta, email: user.email };
  if (!isAllowed(user.email)) {
    await audit(desk, { ...who, event: "denied", result: "not on allow-list", detail: "/api/desk-unlock" });
    await recordFailure(desk, limitKeys(meta.ip, ""), "identity", who);
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const keys = limitKeys(meta.ip, user.email);
  const gate = (await desk.get(GATE_KEY, { type: "json" })) || null;
  const isSet = Boolean(gate && gate.hash);

  if (req.method === "GET") {
    const lock = await limitState(desk, keys);
    const session = await readSession(desk, req, user);
    return json({
      ok: true,
      set: isSet,
      unlocked: Boolean(session),
      minLength: MIN_PHRASE,
      mail: Boolean(process.env.RESEND_API_KEY),
      blocked: lock.blocked ? lock.reason : ""
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }
  const action = String(body.action || "");
  const phrase = String(body.phrase || "");

  const lock = await limitState(desk, keys);
  if (lock.blocked) {
    await audit(desk, { ...who, event: action || "unlock", result: "blocked", detail: lock.reason });
    return limitResponse(lock);
  }

  const failed = async (event, error, status = 403) => {
    const tripped = await recordFailure(desk, keys, "unlock", who);
    await audit(desk, { ...who, event, result: "fail", detail: error });
    return json({ ok: false, error: tripped === "hard" ? "hard" : tripped || error }, tripped === "hard" ? 423 : tripped ? 429 : status);
  };

  const opened = async (extra = {}) => {
    await recordSuccess(desk, keys);
    const s = await issueSession(desk, req, user, meta);
    return json({ ok: true, exp: new Date(s.exp).toISOString(), ...extra }, 200, { "set-cookie": s.cookie });
  };

  if (action === "send-code") {
    if (!process.env.RESEND_API_KEY) return json({ ok: false, error: "mail" }, 503);
    const prev = await desk.get(LOGIN_KEY, { type: "json" }).catch(() => null);
    if (prev && prev.uid === user.id && prev.created > Date.now() - LOGIN_GAP_MS && prev.exp > Date.now()) {
      return json({ ok: true, sentTo: DESK_INBOX, recent: true });
    }
    const code = newLoginCode();
    await desk.setJSON(LOGIN_KEY, {
      hash: hmac("login-code." + user.id + "." + code),
      uid: user.id,
      email: user.email,
      created: Date.now(),
      exp: Date.now() + LOGIN_MS,
      tries: 0
    });
    const sent = await sendDeskMail(
      "Inner Turn desk: sign-in code",
      alertText(
        [
          "Desk sign-in code for " + user.email + ":",
          "",
          "    " + code.slice(0, 3) + " " + code.slice(3),
          "",
          "It works once, only for that Identity account, and expires in 10 minutes.",
          "Asking for a new code cancels this one.",
          "If you are not signing in right now, someone has the Identity password: do not share the code."
        ],
        meta
      )
    );
    if (!sent.sent) {
      await desk.delete(LOGIN_KEY).catch(() => {});
      return json({ ok: false, error: "mail" }, 502);
    }
    await audit(desk, { ...who, event: "login_code", result: "sent", detail: "to " + DESK_INBOX });
    return json({ ok: true, sentTo: DESK_INBOX });
  }

  if (action === "code") {
    if (!(await loginCodeMatches(desk, user, body.code))) return failed("unlock", "bad code");
    await audit(desk, { ...who, event: "unlock", result: "ok", detail: "emailed code" });
    return opened();
  }

  if (action === "unlock") {
    if (!isSet) return json({ ok: false, error: "not set" }, 400);
    if (!(await phraseMatches(gate, user.email, phrase))) return failed("unlock", "denied");
    if (gate.kdf !== KDF) await saveGate(desk, gate.setBy || user.email, phrase);
    await audit(desk, { ...who, event: "unlock", result: "ok" });
    return opened();
  }

  if (action === "set") {
    // First phrase only. Changing an existing phrase goes through "reset".
    if (isSet) return failed("phrase_set", "already set");
    if (phrase.length < MIN_PHRASE) return json({ ok: false, error: "short", minLength: MIN_PHRASE }, 400);
    await saveGate(desk, user.email, phrase);
    await revokeAllSessions(desk);
    await audit(desk, { ...who, event: "phrase_set", result: "ok" });
    await sendDeskMail(
      "Inner Turn desk: unlock phrase was set",
      alertText(["The desk unlock phrase was set for the first time by " + user.email + "."], meta)
    );
    return opened({ set: true });
  }

  if (action === "reset-code") {
    if (!isSet) return json({ ok: false, error: "not set" }, 400);
    if (!process.env.RESEND_API_KEY) return json({ ok: false, error: "mail" }, 503);
    const prev = await desk.get(CODE_KEY, { type: "json" }).catch(() => null);
    if (prev && prev.created > Date.now() - CODE_GAP_MS) return json({ ok: false, error: "wait" }, 429);
    const code = newCode();
    await desk.setJSON(CODE_KEY, {
      hash: hmac("reset-code." + code),
      uid: user.id,
      email: user.email,
      created: Date.now(),
      exp: Date.now() + CODE_MS,
      tries: 0
    });
    const sent = await sendDeskMail(
      "Inner Turn desk: phrase reset code",
      alertText(
        [
          "A desk phrase reset was requested by " + user.email + ".",
          "",
          "Reset code: " + code.slice(0, 5) + "-" + code.slice(5),
          "",
          "It works once, only for that Identity account, and expires in 15 minutes.",
          "If you did not ask for this, do not use the code."
        ],
        meta
      )
    );
    if (!sent.sent) {
      await desk.delete(CODE_KEY).catch(() => {});
      return json({ ok: false, error: "mail" }, 502);
    }
    await audit(desk, { ...who, event: "reset_code", result: "sent", detail: "to " + DESK_INBOX });
    return json({ ok: true, sentTo: DESK_INBOX });
  }

  if (action === "reset") {
    if (!isSet) return json({ ok: false, error: "not set" }, 400);
    if (phrase.length < MIN_PHRASE) return json({ ok: false, error: "short", minLength: MIN_PHRASE }, 400);
    const current = String(body.current || "");
    const code = String(body.code || "");
    let proof = "";
    if (current && (await phraseMatches(gate, user.email, current))) proof = "current phrase";
    else if (code && (await codeMatches(desk, user, code))) proof = "emailed code";
    if (!proof) return failed("phrase_reset", current || code ? "current" : "proof");
    await saveGate(desk, user.email, phrase);
    await revokeAllSessions(desk);
    await audit(desk, { ...who, event: "phrase_reset", result: "ok", detail: "via " + proof });
    await sendDeskMail(
      "Inner Turn desk: unlock phrase was changed",
      alertText(
        ["The desk unlock phrase was changed by " + user.email + " using the " + proof + ".", "All other desk sessions were signed out."],
        meta
      )
    );
    return opened({ set: true });
  }

  return json({ ok: false, error: "action" }, 400);
};

export const config = {
  path: "/api/desk-unlock"
};
