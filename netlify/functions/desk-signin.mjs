import {
  audit,
  clientMeta,
  configProblem,
  deskStore,
  identityPasswordGrant,
  identityUser,
  isAllowed,
  json,
  limitKeys,
  limitResponse,
  limitState,
  recordFailure,
  recordSuccess
} from "../lib/desk-auth.mjs";

// Desk Identity stage. Password sign-in runs through here so failures are counted per IP and
// per email in Blobs. Google sign-in returns through the Identity widget and is recorded with
// action "oauth".
export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (configProblem()) return json({ ok: false, error: "config" }, 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const meta = clientMeta(req, context);
  const desk = deskStore();

  if (body.action === "oauth") {
    const user = await identityUser(req, context);
    if (!user) return json({ ok: false, error: "identity" }, 401);
    const who = { ...meta, email: user.email };
    if (!isAllowed(user.email)) {
      await audit(desk, { ...who, event: "signin", result: "denied", detail: "external provider, not on allow-list" });
      await recordFailure(desk, limitKeys(meta.ip, ""), "identity", who);
      return json({ ok: false, error: "forbidden" }, 403);
    }
    await audit(desk, { ...who, event: "signin", result: "ok", detail: "external provider" });
    return json({ ok: true });
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password || "");
  const who = { ...meta, email };
  const keys = limitKeys(meta.ip, email);

  const lock = await limitState(desk, keys);
  if (lock.blocked) {
    await audit(desk, { ...who, event: "signin", result: "blocked", detail: lock.reason });
    return limitResponse(lock);
  }

  const failed = async (detail) => {
    const tripped = await recordFailure(desk, keys, "identity", who);
    await audit(desk, { ...who, event: "signin", result: "fail", detail });
    if (tripped === "hard") return json({ ok: false, error: "hard" }, 423);
    if (tripped) return json({ ok: false, error: tripped }, 429);
    return json({ ok: false, error: "denied" }, 403);
  };

  // Same answer for unknown emails and wrong passwords.
  if (!email || !password || !isAllowed(email)) return failed(isAllowed(email) ? "missing password" : "not on allow-list");

  let grant;
  try {
    grant = await identityPasswordGrant(email, password);
  } catch {
    return json({ ok: false, error: "upstream" }, 502);
  }
  if (!grant.ok) {
    if (grant.status >= 500) return json({ ok: false, error: "upstream" }, 502);
    return failed("wrong password or unconfirmed account");
  }

  await recordSuccess(desk, keys);
  await audit(desk, { ...who, event: "signin", result: "ok", detail: "password" });
  const { access_token, refresh_token, expires_in, token_type } = grant.data || {};
  return json({ ok: true, tokens: { access_token, refresh_token, expires_in, token_type } });
};

export const config = {
  path: "/api/desk-signin"
};
