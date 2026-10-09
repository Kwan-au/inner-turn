import { getStore } from "@netlify/blobs";
import { jsonResponse, requireIdentity } from "../lib/desk-auth.mjs";
import { handleDeskUnlock } from "../lib/desk-unlock-core.mjs";

export const config = {
  path: "/api/desk-unlock",
  method: ["GET", "POST"]
};

function blobs() {
  const raw = getStore({ name: "desk", consistency: "strong" });
  return {
    getJSON: (key) => raw.get(key, { type: "json" }),
    setJSON: (key, value) => raw.setJSON(key, value),
    delete: (key) => raw.delete(key),
    list: async (prefix) => {
      const { blobs: rows = [] } = await raw.list({ prefix });
      return rows.map((row) => row.key);
    }
  };
}

function clientIp(req, context) {
  return context?.ip
    || req.headers.get("x-nf-client-connection-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export default async (req, context) => {
  const ident = await requireIdentity(req);
  if (!ident.ok) return jsonResponse({ ok: false, error: ident.error }, ident.status);

  let body;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "body" }, 400);
    }
  }

  const result = await handleDeskUnlock({
    method: req.method,
    body,
    email: ident.email,
    sessionToken: req.headers.get("x-desk-session") || "",
    ip: clientIp(req, context),
    store: blobs()
  });
  return jsonResponse(result.body, result.status);
};
