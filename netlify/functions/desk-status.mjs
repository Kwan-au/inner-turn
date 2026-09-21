import { jsonResponse, requireIdentity } from "../lib/desk-auth.mjs";
import { applyStatus, parseStatusUpdate } from "../lib/desk-status-core.mjs";
import { loadDeskBoard, saveBoardList } from "../lib/desk-store.mjs";

export const config = {
  path: "/api/desk-status",
  method: ["POST"]
};

export default async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method" }, 405);
  const ident = await requireIdentity(req);
  if (!ident.ok) return jsonResponse({ ok: false, error: ident.error }, ident.status);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "body" }, 400);
  }

  const parsed = parseStatusUpdate(body);
  if (!parsed.ok) return jsonResponse({ ok: false, error: parsed.error }, parsed.status);

  try {
    const records = await loadDeskBoard();
    const current = records[parsed.listKey] || [];
    const updated = applyStatus(current, parsed.id, parsed.status);
    if (!updated.found) return jsonResponse({ ok: false, error: "not_found" }, 404);
    await saveBoardList(parsed.listKey, updated.rows);
    return jsonResponse({ ok: true, table: parsed.table, id: parsed.id, status: parsed.status });
  } catch {
    return jsonResponse({ ok: false, error: "status" }, 500);
  }
};
