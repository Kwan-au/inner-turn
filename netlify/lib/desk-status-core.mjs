export const STATUSES = ["LEAD", "FILE", "LIVE", "HOLD", "DEAD"];
export const BOARD_TABLES = {
  lot_packs: "lotPacks",
  cleaner_files: "cleanerFiles",
  parties: "parties"
};

export function parseStatusUpdate(body) {
  const table = String(body?.table || "");
  const status = String(body?.status || "").toUpperCase();
  const id = body?.id;
  if (!Object.hasOwn(BOARD_TABLES, table)) return { ok: false, error: "table", status: 400 };
  if (id == null || String(id).trim() === "") return { ok: false, error: "id", status: 400 };
  if (!STATUSES.includes(status)) return { ok: false, error: "status", status: 400 };
  return { ok: true, table, id, status, listKey: BOARD_TABLES[table] };
}

export function applyStatus(rows, id, status) {
  const list = Array.isArray(rows) ? rows : [];
  let found = false;
  const next = list.map((row) => {
    if (String(row?.id) !== String(id)) return row;
    found = true;
    return { ...row, status };
  });
  return { found, rows: next };
}
