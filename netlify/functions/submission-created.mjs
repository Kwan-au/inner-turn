import { deskStore } from "../lib/desk-auth.mjs";
import { draftLead, emailDesk } from "../lib/lead-agent.mjs";

function pick(data, keys) {
  const out = {};
  for (const k of keys) {
    // Checkbox groups arrive as `areas[]` or `areas`, as an array or a joined string.
    let v = data ? (data[k] ?? data[k + "[]"]) : null;
    if (Array.isArray(v)) v = v.join(", ");
    if (v != null && typeof v === "object") v = v.url || v.filename || "";
    if (v != null && String(v).trim()) out[k] = String(v).trim().slice(0, 200);
  }
  return out;
}

// listing-quote-v2 sets `started` (client ms timestamp) on page load. A missing
// value, or a send under 3 seconds later, is treated as a bot.
const QUOTE_MIN_MS = 3000;

function tooQuick(payload, data) {
  const started = Number(String(data.started ?? "").trim());
  if (!started) return true;
  const at = Date.parse(payload.created_at || "") || Date.now();
  return at - started < QUOTE_MIN_MS;
}

// Flags the submission as spam in Netlify Forms. Needs a personal access token
// in FORMS_API_TOKEN; without one the submission is only kept out of the desk.
async function markSpam(submissionId) {
  const token = process.env.FORMS_API_TOKEN;
  if (!token || !submissionId) return false;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/submissions/${encodeURIComponent(submissionId)}/spam`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) console.error("mark spam failed", res.status);
    return res.ok;
  } catch (err) {
    console.error("mark spam failed", err && err.message);
    return false;
  }
}

function rowKey(r) {
  const id = String(r.email || r.who || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return id + "|" + (r.kind || "manager");
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false }, { status: 405 });
  }

  let payload;
  try {
    const body = await req.json();
    payload = body.payload || body;
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }

  const form = String(payload.form_name || payload.formName || "").toLowerCase();
  const data = payload.data || payload.form_data || {};
  if (data.bot || data["bot-c"] || data["bot-field"] || data.website) {
    return Response.json({ ok: true, skipped: "honeypot" });
  }
  if (form === "listing-quote-v2" && tooQuick(payload, data)) {
    const marked = await markSpam(payload.id);
    return Response.json({ ok: true, skipped: "spam", marked });
  }

  const isCleaner = form.includes("cleaner");
  const isQuote = form.includes("listing-quote") || form.includes("quote");
  const fields = isCleaner
    ? pick(data, [
        "name", "person", "email", "abn", "rate1", "rate2", "rate3", "rate4", "phone",
        // contractor file v2 (/cleaners, 2026-10-18)
        "mobile", "trading_name", "insurer", "insurance_expiry", "areas", "areas_other", "availability",
        "experience", "linen", "vehicle", "notes", "consent", "police_check"
      ])
    : isQuote
    ? pick(data, [
        "name", "company", "email", "mobile", "suburbs", "lots", "beds_mix", "start", "notes", "need", "package", "source",
        // listing-quote-v2 (4-step form on /quote)
        "interest", "same_day", "linen", "restock", "suburb", "listings", "turns_week", "first_turn",
        "checkout_time", "checkin_time", "heard", "utm_source", "utm_campaign", "estimate_total",
        // field names used by the standalone /quote page
        "turns_per_week", "start_date", "turn_window", "heard_about", "utm_medium", "est_per_turn"
      ])
    : pick(data, ["address", "suburb", "beds", "checkout", "checkin", "access", "email", "phone", "notes", "source"]);

  const who = isCleaner
    ? fields.person || fields.name || fields.email || "cleaner form"
    : fields.name || fields.email || fields.address || fields.suburb || fields.suburbs || "manager form";

  const note = isCleaner
    ? [
        "site form",
        fields.abn && ("ABN " + fields.abn),
        fields.insurer && ("PL " + fields.insurer + (fields.insurance_expiry ? " exp " + fields.insurance_expiry : "")),
        fields.areas,
        fields.availability,
        fields.experience && ("exp " + fields.experience),
        fields.police_check && ("police check: " + fields.police_check),
        fields.rate1 && ("1-bed " + fields.rate1),
        fields.mobile || fields.phone
      ]
        .filter(Boolean)
        .join(" · ")
    : isQuote
    ? [
        "quote",
        fields.need || fields.interest,
        fields.package,
        fields.same_day && "same-day",
        fields.linen && ("linen: " + fields.linen),
        fields.suburbs || fields.suburb,
        fields.lots && (fields.lots + " lots"),
        fields.listings && (fields.listings + " listings"),
        (fields.turns_week || fields.turns_per_week) && ((fields.turns_week || fields.turns_per_week) + "/wk"),
        (fields.first_turn || fields.start_date) && ("first " + (fields.first_turn || fields.start_date)),
        fields.turn_window,
        (fields.estimate_total || fields.est_per_turn) && ("est " + (fields.estimate_total || fields.est_per_turn)),
        fields.beds_mix,
        fields.company,
        fields.mobile,
        "GST not charged"
      ]
        .filter(Boolean)
        .join(" · ")
    : [
        fields.source === "app" ? "app" : "site",
        fields.address || fields.suburb,
        fields.beds && fields.beds + "-bed",
        fields.access,
        fields.checkout && ("out " + fields.checkout),
        fields.checkin && ("in " + fields.checkin),
        fields.phone
      ]
        .filter(Boolean)
        .join(" · ");

  const desk = deskStore();
  const state = (await desk.get("state", { type: "json" })) || { pipe: [], quota: {} };
  const pipe = Array.isArray(state.pipe) ? state.pipe.slice() : [];
  const id = String(payload.id || payload.number || Date.now());
  if (pipe.some((row) => row.formId === id)) {
    return Response.json({ ok: true, deduped: true });
  }

  const nextRow = {
    who: String(who).slice(0, 120),
    kind: isCleaner ? "cleaner" : "manager",
    stage: "LEAD",
    note: String(note).slice(0, 240),
    at: new Date().toISOString(),
    formId: id,
    source: "netlify-form",
    email: String(fields.email || "").toLowerCase().slice(0, 120)
  };

  const key = rowKey(nextRow);
  const idx = pipe.findIndex((row) => rowKey(row) === key);
  if (idx >= 0) {
    const keepStage = pipe[idx].stage && pipe[idx].stage !== "DEAD" ? pipe[idx].stage : "LEAD";
    pipe[idx] = { ...pipe[idx], ...nextRow, stage: keepStage };
  } else {
    pipe.unshift(nextRow);
  }

  const next = {
    ...state,
    pipe: pipe.slice(0, 200),
    updated: new Date().toISOString(),
    by: "form"
  };
  await desk.setJSON("state", next);

  // Desk agent: draft a reply for review. A failure here never loses the lead.
  let agent = "skipped";
  try {
    const kind = nextRow.kind;
    const draft = await draftLead({ kind, form, fields });
    const mail = await emailDesk({ draft, kind, fields, formId: id });
    await desk.setJSON("agent/" + id, {
      ...draft,
      formId: id,
      who: nextRow.who,
      email: nextRow.email,
      emailed: mail.sent,
      at: new Date().toISOString()
    });
    agent = mail.sent ? "emailed" : "drafted";
  } catch (err) {
    console.error("lead-agent failed", err && err.message);
    agent = "failed";
  }
  return Response.json({ ok: true, agent });
};

export const config = {
  name: "submission-created"
};
