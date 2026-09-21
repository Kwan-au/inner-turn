import { jsonResponse, requireIdentity } from "../lib/desk-auth.mjs";
import { buildDeskBoard } from "../lib/desk-board-core.mjs";

export const config = {
  path: "/api/desk-board",
  method: ["GET"]
};

const LOADERS = [
  "../lib/desk-board-data.mjs",
  "../lib/desk-db.mjs",
  "../lib/desk-data.mjs",
  "../lib/desk-records.mjs",
  "../lib/desk-store.mjs"
];
const LOADER_FNS = ["loadDeskBoard", "loadBoardRecords", "getDeskBoard", "readDeskBoard"];

async function loadLiveRecords() {
  for (const path of LOADERS) {
    try {
      const mod = await import(path);
      for (const name of LOADER_FNS) {
        if (typeof mod[name] !== "function") continue;
        const records = await mod[name]();
        if (records && typeof records === "object") return records;
      }
    } catch {
      // Live tree may not have this helper. Try the next one.
    }
  }
  return { lotPacks: [], cleanerFiles: [], parties: [], intakes: 0 };
}

export default async (req) => {
  if (req.method !== "GET") return jsonResponse({ ok: false, error: "method" }, 405);
  const ident = await requireIdentity(req);
  if (!ident.ok) return jsonResponse({ ok: false, error: ident.error }, ident.status);

  try {
    const records = await loadLiveRecords();
    return jsonResponse(buildDeskBoard(records));
  } catch {
    return jsonResponse({ ok: false, error: "board" }, 500);
  }
};
