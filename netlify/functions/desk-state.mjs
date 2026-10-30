import { deny, json, requireDesk } from "../lib/desk-auth.mjs";

const STAGES = new Set(["LEAD", "FILE", "LIVE", "HOLD", "DEAD"]);
const KINDS = new Set(["manager", "cleaner"]);

function cleanRow(r) {
  if (!r || typeof r !== "object") return null;
  const who = String(r.who || "").trim().slice(0, 120);
  if (!who) return null;
  const kind = KINDS.has(r.kind) ? r.kind : "manager";
  const stage = STAGES.has(r.stage) ? r.stage : "LEAD";
  const row = {
    who,
    kind,
    stage,
    note: String(r.note || "").trim().slice(0, 240),
    at: String(r.at || new Date().toISOString()).slice(0, 40)
  };
  const email = String(r.email || "").trim().toLowerCase().slice(0, 120);
  const source = String(r.source || "").trim().slice(0, 40);
  const formId = r.formId != null ? String(r.formId).slice(0, 80) : "";
  if (email) row.email = email;
  if (source) row.source = source;
  if (formId) row.formId = formId;
  return row;
}

function rowKey(r) {
  const id = String(r.email || r.who || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return id + "|" + (r.kind || "manager");
}

function mergePipe(existing, incoming) {
  const map = new Map();
  for (const r of existing) map.set(rowKey(r), r);
  for (const r of incoming) {
    const k = rowKey(r);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      continue;
    }
    const newer = Date.parse(r.at || 0) >= Date.parse(prev.at || 0);
    map.set(k, {
      ...prev,
      ...r,
      note: r.note || prev.note,
      at: newer ? r.at : prev.at,
      source: r.source || prev.source,
      email: r.email || prev.email,
      formId: r.formId || prev.formId
    });
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, 200);
}

function counts(pipe) {
  const c = {
    LIVE: 0,
    FILE: 0,
    LEAD: 0,
    HOLD: 0,
    DEAD: 0,
    cleanersFILE: 0,
    managersLIVE: 0,
    total: pipe.length
  };
  for (const r of pipe) {
    if (c[r.stage] != null) c[r.stage] += 1;
    if (r.kind === "cleaner" && (r.stage === "FILE" || r.stage === "LIVE")) c.cleanersFILE += 1;
    if (r.kind === "manager" && r.stage === "LIVE") c.managersLIVE += 1;
  }
  return c;
}

// Desk agent drafts live under agent/<formId>, outside the synced pipe.
async function readDrafts(desk, pipe) {
  const ids = pipe.filter((r) => r.formId && r.stage === "LEAD").slice(0, 40).map((r) => r.formId);
  const out = {};
  await Promise.all(
    ids.map(async (id) => {
      const d = await desk.get("agent/" + id, { type: "json" }).catch(() => null);
      if (d) out[id] = d;
    })
  );
  return out;
}

function emptyState() {
  return {
    pipe: [],
    quota: { day: "", email: 0, li: 0, walk: 0 },
    updated: null
  };
}

export default async (req, context) => {
  const gate = await requireDesk(req, context);
  if (!gate.ok) return deny(gate);

  const { email, desk } = gate;

  if (req.method === "GET") {
    const state = (await desk.get("state", { type: "json" })) || emptyState();
    const pipe = Array.isArray(state.pipe) ? state.pipe.map(cleanRow).filter(Boolean) : [];
    return json({
      ok: true,
      state: { ...state, pipe },
      counts: counts(pipe),
      drafts: await readDrafts(desk, pipe)
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "bad json" }, 400);
    }

    const incoming = (Array.isArray(body.pipe) ? body.pipe : []).map(cleanRow).filter(Boolean);
    const current = (await desk.get("state", { type: "json" })) || emptyState();
    const existing = Array.isArray(current.pipe) ? current.pipe.map(cleanRow).filter(Boolean) : [];
    const pipe = body.merge === false ? incoming.slice(0, 200) : mergePipe(existing, incoming);

    const quotaIn = body.quota && typeof body.quota === "object" ? body.quota : current.quota || {};
    const state = {
      pipe,
      quota: {
        day: String(quotaIn.day || "").slice(0, 10),
        email: Number(quotaIn.email) || 0,
        li: Number(quotaIn.li) || 0,
        walk: Number(quotaIn.walk) || 0
      },
      updated: new Date().toISOString(),
      by: email
    };
    await desk.setJSON("state", state);
    return json({ ok: true, state, counts: counts(pipe), merged: body.merge !== false });
  }

  return json({ ok: false, error: "method" }, 405);
};

export const config = {
  path: "/api/desk-state"
};
