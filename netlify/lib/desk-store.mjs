function envGet(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env?.get) {
      const value = Netlify.env.get(name);
      if (value != null && value !== "") return value;
    }
  } catch {
    // Fall through to process.env for local tests.
  }
  return process.env[name] || "";
}

function deskStore(raw) {
  return {
    getJSON: (key) => raw.get(key, { type: "json" }),
    setJSON: (key, value) => raw.setJSON(key, value)
  };
}

export async function openDeskBlobs(options = {}) {
  if (options.store) return options.store;
  const { getStore } = await import("@netlify/blobs");
  return deskStore(getStore({ name: "desk", consistency: "strong" }));
}

function camelKey(key) {
  return String(key).replace(/_([a-z0-9])/gi, (_, ch) => String(ch).toUpperCase());
}

function asMissing(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function first(...values) {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return undefined;
}

export function mapLotPack(row) {
  if (!row || typeof row !== "object") return null;
  const n = {};
  for (const [key, value] of Object.entries(row)) n[camelKey(key)] = value;
  return {
    id: first(n.id, row.id),
    contactName: first(n.contactName, n.name),
    companyName: first(n.companyName),
    email: first(n.email),
    phone: first(n.phone, n.mobile),
    suburb: first(n.suburb),
    beds: first(n.beds),
    status: first(n.status, "LEAD"),
    executable: Boolean(n.executable),
    missingFields: asMissing(first(n.missingFields, row.missing_fields))
  };
}

export function mapCleanerFile(row) {
  if (!row || typeof row !== "object") return null;
  const n = {};
  for (const [key, value] of Object.entries(row)) n[camelKey(key)] = value;
  const payLock = first(n.payLockOk, n.paylockOk, row.pay_lock_ok);
  return {
    id: first(n.id, row.id),
    namedPerson: first(n.namedPerson, n.contactName),
    contactName: first(n.contactName, n.namedPerson),
    companyName: first(n.companyName),
    email: first(n.email),
    mobile: first(n.mobile, n.phone),
    abn: first(n.abn),
    status: first(n.status, "LEAD"),
    rate1bed: first(n.rate1bed, n.rate1Bed, row.rate_1bed),
    rate2bed: first(n.rate2bed, n.rate2Bed, row.rate_2bed),
    rate3bed: first(n.rate3bed, n.rate3Bed, row.rate_3bed),
    rate4bed: first(n.rate4bed, n.rate4Bed, row.rate_4bed),
    payLockOk: payLock == null ? undefined : Boolean(payLock),
    missingFields: asMissing(first(n.missingFields, row.missing_fields))
  };
}

export function mapParty(row) {
  if (!row || typeof row !== "object") return null;
  const n = {};
  for (const [key, value] of Object.entries(row)) n[camelKey(key)] = value;
  return {
    id: first(n.id, row.id),
    contactName: first(n.contactName, n.name, n.who),
    email: first(n.email),
    lane: first(n.lane, ""),
    status: first(n.status, "LEAD"),
    note: first(n.note, n.next, ""),
    missingFields: asMissing(first(n.missingFields, row.missing_fields))
  };
}

async function readList(store, keys) {
  for (const key of keys) {
    const value = await store.getJSON(key);
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.rows)) return value.rows;
  }
  return [];
}

async function trySqlLists() {
  const url = envGet("NETLIFY_DATABASE_URL") || envGet("NETLIFY_DB_URL") || envGet("DATABASE_URL");
  if (!url) return null;
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { ssl: "require", max: 1 });
    try {
      const [lotPacks, cleanerFiles, parties, intakes] = await Promise.all([
        sql`select * from lot_packs`.catch(() => []),
        sql`select * from cleaner_files`.catch(() => []),
        sql`select * from parties`.catch(() => []),
        sql`select count(*)::int as n from intakes`.catch(() => [{ n: 0 }])
      ]);
      return {
        lotPacks: lotPacks.map(mapLotPack).filter(Boolean),
        cleanerFiles: cleanerFiles.map(mapCleanerFile).filter(Boolean),
        parties: parties.map(mapParty).filter(Boolean),
        intakes: intakes[0]?.n || 0
      };
    } finally {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  } catch {
    return null;
  }
}

export async function loadDeskBoard(options = {}) {
  const fromSql = options.skipSql ? null : await trySqlLists();
  const store = await openDeskBlobs(options);
  const [lotPacks, cleanerFiles, parties, intakeRows] = await Promise.all([
    readList(store, ["lot_packs", "lotPacks"]),
    readList(store, ["cleaner_files", "cleanerFiles"]),
    readList(store, ["parties"]),
    readList(store, ["intakes", "intakeRows"])
  ]);

  const mappedLots = lotPacks.map(mapLotPack).filter(Boolean);
  const mappedCleaners = cleanerFiles.map(mapCleanerFile).filter(Boolean);
  const mappedParties = parties.map(mapParty).filter(Boolean);

  if (fromSql) {
    return {
      lotPacks: fromSql.lotPacks.length ? fromSql.lotPacks : mappedLots,
      cleanerFiles: fromSql.cleanerFiles.length ? fromSql.cleanerFiles : mappedCleaners,
      parties: fromSql.parties.length ? fromSql.parties : mappedParties,
      intakes: fromSql.intakes || intakeRows.length
    };
  }

  return {
    lotPacks: mappedLots,
    cleanerFiles: mappedCleaners,
    parties: mappedParties,
    intakes: intakeRows.length
  };
}

export async function saveBoardList(listKey, rows, options = {}) {
  const store = await openDeskBlobs(options);
  const blobKey = listKey === "lotPacks"
    ? "lot_packs"
    : listKey === "cleanerFiles"
      ? "cleaner_files"
      : "parties";
  await store.setJSON(blobKey, rows);
}

export async function loadDeskState(options = {}) {
  const store = await openDeskBlobs(options);
  const state = await store.getJSON("state");
  return state && typeof state === "object" ? state : { pipe: [], quota: {} };
}

export async function saveDeskState(state, options = {}) {
  const store = await openDeskBlobs(options);
  const pipe = Array.isArray(state?.pipe) ? state.pipe : [];
  const quota = state?.quota && typeof state.quota === "object" ? state.quota : {};
  const next = { pipe, quota };
  await store.setJSON("state", next);
  return next;
}
