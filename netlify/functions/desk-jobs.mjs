import { deny, json, requireDesk } from "../lib/desk-auth.mjs";
import { jobs, loadJob, issueKeys, newPayment, CARD } from "../lib/job-auth.mjs";

const STATUSES = new Set(["LEAD", "FILE", "LIVE", "HOLD", "DONE", "FLAG"]);

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function addEvent(job, text, kind) {
  job.events = Array.isArray(job.events) ? job.events : [];
  job.events.push({ id: newId(), at: new Date().toISOString(), kind, role: "desk", by: "Inner Turn desk", text });
  if (job.events.length > 80) job.events = job.events.slice(-80);
  job.updated = new Date().toISOString();
}

async function summary(store, job) {
  const pay = job.payment || newPayment(job.beds);
  return {
    code: job.code,
    status: job.status,
    suburb: job.suburb,
    beds: job.beds,
    street: job.street || "",
    window: job.window || {},
    manager: job.manager || null,
    cleaner: job.cleaner || null,
    payment: pay,
    payoutDetails: (await store.get("payout:" + job.code, { type: "json" })) || null,
    packs: (job.packs || []).length,
    legacy: !job.keys,
    updated: job.updated || job.created || ""
  };
}

export default async (req, context) => {
  const gate = await requireDesk(req, context);
  if (!gate.ok) return deny(gate);

  const store = jobs();

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "job:" });
    const all = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null)))).filter(Boolean);
    all.sort((a, b) => Date.parse(b.updated || b.created || 0) - Date.parse(a.updated || a.created || 0));
    const out = await Promise.all(all.slice(0, 60).map((j) => summary(store, j)));
    return json({ ok: true, jobs: out });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const code = String(body.code || "").toUpperCase();
  const job = await loadJob(store, code);
  if (!job) return json({ ok: false, error: "not found" }, 404);
  job.payment = job.payment || newPayment(job.beds);
  const pay = job.payment;
  const action = String(body.action || "");
  let links = null;

  if (action === "deposit-received") {
    pay.depositStatus = "received";
    if (job.status === "LEAD" || job.status === "FILE") job.status = "LIVE";
    addEvent(job, "Deposit" + (pay.deposit != null ? " $" + pay.deposit : "") + " received — turn confirmed", "payment_received");
  } else if (action === "balance-received") {
    pay.balanceStatus = "paid";
    addEvent(job, "Balance received — invoice paid in full", "payment_received");
  } else if (action === "payout-paid") {
    if (job.status !== "DONE") return json({ ok: false, error: "Pay the cleaner only after the pack is DONE." }, 400);
    if (!(await store.get("payout:" + code, { type: "json" }))) return json({ ok: false, error: "No payout details saved." }, 400);
    pay.payout = "paid";
    addEvent(job, "Cleaner paid by bank transfer", "payout_paid");
  } else if (action === "set-price") {
    const price = Math.round(Number(body.price));
    const deposit = Math.round(Number(body.deposit));
    if (!(price > 0) || !(deposit >= 0) || deposit > price) return json({ ok: false, error: "Check price and deposit." }, 400);
    pay.price = price;
    pay.deposit = deposit;
    addEvent(job, "Price set $" + price + " · deposit $" + deposit + " by bank transfer before the turn", "price_set");
  } else if (action === "status") {
    const status = String(body.status || "");
    if (!STATUSES.has(status)) return json({ ok: false, error: "bad status" }, 400);
    job.status = status;
    addEvent(job, "Status " + status + " (desk)", "status");
  } else if (action === "reissue") {
    links = await issueKeys(job);
    addEvent(job, "Private links reissued by the desk — old links no longer work", "links");
  } else {
    return json({ ok: false, error: "action" }, 400);
  }

  await store.setJSON("job:" + code, job);
  return json({ ok: true, job: await summary(store, job), links, card: CARD });
};

export const config = {
  path: "/api/desk-jobs"
};
