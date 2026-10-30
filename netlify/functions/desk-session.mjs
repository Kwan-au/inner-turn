import {
  alertText,
  audit,
  clearCookie,
  clientMeta,
  cookieSid,
  deny,
  deskStore,
  identityUser,
  json,
  readAudit,
  requireDesk,
  revokeAllSessions,
  sendDeskMail
} from "../lib/desk-auth.mjs";

// GET: last 20 audit entries. POST signout: end this session. POST revoke-all: "Not me? Lock desk now".
export default async (req, context) => {
  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* empty body = sign out */
    }

    if ((body.action || "signout") === "signout") {
      // Works even when the Identity token has expired: the server copy of the session is deleted.
      const desk = deskStore();
      const meta = clientMeta(req, context);
      const sid = cookieSid(req);
      if (sid) await desk.delete("session:" + sid).catch(() => {});
      const user = await identityUser(req, context);
      await audit(desk, { ...meta, email: user?.email || "", event: "signout", result: sid ? "ok" : "no session" });
      return json({ ok: true }, 200, { "set-cookie": clearCookie() });
    }

    if (body.action === "revoke-all") {
      const gate = await requireDesk(req, context);
      if (!gate.ok) return deny(gate);
      await revokeAllSessions(gate.desk);
      await audit(gate.desk, { ...gate.meta, email: gate.email, event: "revoke_all", result: "ok", detail: "Not me? Lock desk now" });
      await sendDeskMail(
        "Inner Turn desk: all sessions revoked",
        alertText(
          [
            gate.email + " pressed \"Not me? Lock desk now\". Every desk session was signed out.",
            "Next: change the Identity password and the desk unlock phrase."
          ],
          gate.meta
        )
      );
      return json({ ok: true }, 200, { "set-cookie": clearCookie() });
    }

    return json({ ok: false, error: "action" }, 400);
  }

  if (req.method !== "GET") return json({ ok: false, error: "method" }, 405);
  const gate = await requireDesk(req, context);
  if (!gate.ok) return deny(gate);
  return json({ ok: true, entries: await readAudit(gate.desk, 20), session: { exp: new Date(gate.session.exp).toISOString() } });
};

export const config = {
  path: "/api/desk-session"
};
