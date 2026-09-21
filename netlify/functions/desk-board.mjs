import { jsonResponse, requireIdentity } from "../lib/desk-auth.mjs";
import { buildDeskBoard } from "../lib/desk-board-core.mjs";
import { loadDeskBoard } from "../lib/desk-store.mjs";

export const config = {
  path: "/api/desk-board",
  method: ["GET"]
};

export default async (req) => {
  if (req.method !== "GET") return jsonResponse({ ok: false, error: "method" }, 405);
  const ident = await requireIdentity(req);
  if (!ident.ok) return jsonResponse({ ok: false, error: ident.error }, ident.status);

  try {
    const records = await loadDeskBoard();
    return jsonResponse(buildDeskBoard(records));
  } catch {
    return jsonResponse({ ok: false, error: "board" }, 500);
  }
};
