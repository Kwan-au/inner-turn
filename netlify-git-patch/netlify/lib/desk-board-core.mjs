export const STATUSES = ["LEAD", "FILE", "LIVE", "HOLD", "DEAD"];
export const GRAND_FINAL_YMD = "2026-09-26";
export const MELBOURNE_TZ = "Australia/Melbourne";
export const NEXT_ACTIONS_LIMIT = 5;

export function melbourneYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function daysBetweenYmd(fromYmd, toYmd) {
  const a = Date.parse(`${fromYmd}T00:00:00+10:00`);
  const b = Date.parse(`${toYmd}T00:00:00+10:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function daysToGrandFinal(now = new Date()) {
  return daysBetweenYmd(melbourneYmd(now), GRAND_FINAL_YMD);
}

export function listMissing(row) {
  if (!Array.isArray(row?.missingFields)) return [];
  return row.missingFields.filter((field) => field != null && String(field).trim()).map((field) => String(field));
}

export function isExecutablePack(row) {
  return Boolean(row?.executable);
}

export function isFileReadyCleaner(row) {
  const status = String(row?.status || "");
  return status === "FILE" || status === "LIVE";
}

export function packLabel(row) {
  return row?.contactName || row?.companyName || row?.email || "Unnamed lot pack";
}

export function cleanerLabel(row) {
  return row?.namedPerson || row?.contactName || row?.companyName || row?.email || "Unnamed cleaner";
}

export function partyLabel(row) {
  return row?.contactName || row?.name || row?.who || row?.email || "Unnamed party";
}

export function answerLine({ executablePacks, fileReady }) {
  if (executablePacks < 1) return "Need lot pack";
  if (fileReady < 1) return "Need FILE cleaner";
  return "Ready to book";
}

function packGaps(lotPacks) {
  if (!lotPacks.length) {
    return [{
      id: null,
      kind: "lot_pack",
      title: "Need lot pack",
      reason: "No lot packs on the board",
      missingFields: [],
      status: null
    }];
  }
  return lotPacks
    .filter((row) => !isExecutablePack(row))
    .map((row) => {
      const missing = listMissing(row);
      return {
        id: row.id ?? null,
        kind: "lot_pack",
        title: packLabel(row),
        reason: missing.length ? `Incomplete pack: ${missing.join(", ")}` : "Incomplete pack",
        missingFields: missing,
        status: row.status || "LEAD"
      };
    });
}

function cleanerGaps(cleanerFiles) {
  if (!cleanerFiles.length) {
    return [{
      id: null,
      kind: "cleaner",
      title: "Need FILE cleaner",
      reason: "No cleaner files on the board",
      missingFields: [],
      status: null
    }];
  }
  const actions = [];
  for (const row of cleanerFiles) {
    const missing = listMissing(row);
    const status = row.status || "LEAD";
    if (status === "LEAD") {
      actions.push({
        id: row.id ?? null,
        kind: "cleaner",
        title: cleanerLabel(row),
        reason: missing.length ? `LEAD cleaner: ${missing.join(", ")}` : "LEAD cleaner — not FILE-ready",
        missingFields: missing,
        status
      });
      continue;
    }
    if (missing.length) {
      actions.push({
        id: row.id ?? null,
        kind: "cleaner",
        title: cleanerLabel(row),
        reason: `Missing: ${missing.join(", ")}`,
        missingFields: missing,
        status
      });
    }
  }
  if (!cleanerFiles.some(isFileReadyCleaner) && !actions.length) {
    actions.push({
      id: null,
      kind: "cleaner",
      title: "Need FILE cleaner",
      reason: "No FILE or LIVE cleaner on the board",
      missingFields: [],
      status: null
    });
  }
  return actions;
}

function partyGaps(parties) {
  return parties
    .filter((row) => {
      const status = row.status || "LEAD";
      return status === "LEAD" || status === "HOLD";
    })
    .map((row) => {
      const missing = listMissing(row);
      const status = row.status || "LEAD";
      const note = String(row.note || row.next || "").trim();
      return {
        id: row.id ?? null,
        kind: "party",
        title: partyLabel(row),
        reason: missing.length ? `${status} · ${missing.join(", ")}` : (note ? `${status} · ${note}` : `${status} party`),
        missingFields: missing,
        status,
        lane: row.lane || null
      };
    });
}

export function buildNextActions(records = {}, limit = NEXT_ACTIONS_LIMIT) {
  const lotPacks = Array.isArray(records.lotPacks) ? records.lotPacks : [];
  const cleanerFiles = Array.isArray(records.cleanerFiles) ? records.cleanerFiles : [];
  const parties = Array.isArray(records.parties) ? records.parties : [];
  const executablePacks = lotPacks.filter(isExecutablePack).length;
  const fileReady = cleanerFiles.filter(isFileReadyCleaner).length;
  const packs = packGaps(lotPacks);
  const cleaners = cleanerGaps(cleanerFiles);
  const waiting = partyGaps(parties);

  const ordered = executablePacks < 1
    ? [...packs, ...cleaners, ...waiting]
    : fileReady < 1
      ? [...cleaners, ...packs, ...waiting]
      : [...packs, ...cleaners, ...waiting];

  return ordered.slice(0, limit);
}

export function buildDeskBoard(records = {}, options = {}) {
  const lotPacks = Array.isArray(records.lotPacks) ? records.lotPacks : [];
  const cleanerFiles = Array.isArray(records.cleanerFiles) ? records.cleanerFiles : [];
  const parties = Array.isArray(records.parties) ? records.parties : [];
  const intakes = Number.isFinite(records.intakes)
    ? records.intakes
    : (Array.isArray(records.intakeRows) ? records.intakeRows.length : 0);
  const now = options.now || new Date();
  const executablePacks = lotPacks.filter(isExecutablePack).length;
  const fileReady = cleanerFiles.filter(isFileReadyCleaner).length;
  const canDispatch = executablePacks >= 1 && fileReady >= 1;

  return {
    lotPacks,
    cleanerFiles,
    parties,
    summary: {
      lotPacks: lotPacks.length,
      executablePacks,
      cleanerFiles: cleanerFiles.length,
      fileReady,
      intakes,
      parties: parties.length
    },
    today: {
      executablePacks,
      fileReady,
      canDispatch,
      daysToGrandFinal: daysToGrandFinal(now),
      answerLine: answerLine({ executablePacks, fileReady }),
      asOf: melbourneYmd(now)
    },
    nextActions: buildNextActions({ lotPacks, cleanerFiles, parties }, NEXT_ACTIONS_LIMIT)
  };
}
