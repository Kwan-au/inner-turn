import { jsonResponse, requireIdentity } from "../lib/desk-auth.mjs";
import { loadDeskState, saveDeskState } from "../lib/desk-store.mjs";

export const config = {
  path: "/api/desk-state",
  method: ["GET", "POST"]
};

export default async (req) => {
  const ident = await requireIdentity(req);
  if (!ident.ok) return jsonResponse({ ok: false, error: ident.error }, ident.status);

  try {
    if (req.method === "GET") {
      const state = await loadDeskState();
      return jsonResponse({ ok: true, state });
    }
    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ ok: false, error: "body" }, 400);
      }
      const state = await saveDeskState(body);
      return jsonResponse({ ok: true, state });
    }
    return jsonResponse({ ok: false, error: "method" }, 405);
  } catch {
    return jsonResponse({ ok: false, error: "state" }, 500);
  }
};
