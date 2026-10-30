import {
  jobs,
  loadJob,
  roleForKey,
  issueKeys,
  newPayment,
  bankDetails,
  maskAccount,
  CODE_RE
} from "../lib/job-auth.mjs";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLOTS = new Set(["entry", "beds", "bathroom", "kitchen", "living", "damage"]);
const NEEDED = ["entry", "beds", "bathroom", "kitchen", "living"];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function cleanText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Access codes never go on a thread. Catches "lockbox 4719", "key safe 4 7 1 9", "door: 47-19".
const CODE_WORDS = /\b(lock\s*box|key\s*safe|keysafe|key\s*box|keypad|code|pin|password|passcode|combo|combination|alarm|gate|door)\b/i;
const DIGIT_RUN = /\d(?:[\s\-./:#*]*\d){3,}/;
const SHORT_RUN = /\d{3,}/;
const CODE_ERROR = "Remove the access code. Phone codes to the desk — never put them on the thread.";

function hasCode(text) {
  return CODE_WORDS.test(text) && (DIGIT_RUN.test(text) || SHORT_RUN.test(text));
}

function newCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHA[b % ALPHA.length]).join("");
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function payment(job) {
  if (!job.payment) job.payment = newPayment(job.beds);
  return job.payment;
}

async function view(store, job, role) {
  const pay = payment(job);
  const out = {
    code: job.code,
    status: job.status,
    suburb: job.suburb,
    beds: job.beds,
    window: job.window,
    accessType: job.accessType || "",
    manager: { name: job.manager?.name || "" },
    cleaner: job.cleaner ? { name: job.cleaner.name || "" } : null,
    events: job.events || [],
    packs: (job.packs || []).map((p) => ({
      id: p.id,
      at: p.at,
      by: p.by,
      role: p.role,
      slots: p.slots,
      note: p.note || "",
      damage: p.damage || ""
    })),
    payment: {
      price: pay.price,
      deposit: pay.deposit,
      balance: pay.price != null && pay.deposit != null ? pay.price - pay.deposit : null,
      depositStatus: pay.depositStatus,
      balanceStatus: pay.balanceStatus,
      payout: pay.payout
    },
    updated: job.updated || "",
    role: role || "",
    readonly: !role,
    legacy: !job.keys
  };
  if (!role) return out;

  out.street = job.street || "";
  out.manager.email = job.manager?.email || "";
  if (out.cleaner) out.cleaner.email = job.cleaner.email || "";
  if (role === "manager") {
    out.cleanerKey = job.cleanerKey || "";
    out.bank = bankDetails();
  }
  if (role === "cleaner") {
    const p = await store.get("payout:" + job.code, { type: "json" });
    out.payoutDetails = p ? { name: p.name, bsb: p.bsb, account: maskAccount(p.account) } : null;
  }
  return out;
}

function addEvent(job, ev) {
  job.events = Array.isArray(job.events) ? job.events : [];
  job.events.push({ id: newId(), at: new Date().toISOString(), ...ev });
  if (job.events.length > 80) job.events = job.events.slice(-80);
  job.updated = new Date().toISOString();
}

function keyFrom(req, body) {
  return String(req.headers.get("x-job-key") || (body && body.key) || "").trim().toLowerCase();
}

export default async (req) => {
  const url = new URL(req.url);
  const store = jobs();

  if (url.pathname === "/api/job-pack" && req.method === "GET") {
    const code = String(url.searchParams.get("code") || "").toUpperCase();
    const pack = cleanText(url.searchParams.get("pack"), 24);
    const slot = cleanText(url.searchParams.get("slot"), 16);
    if (!CODE_RE.test(code) || !SLOTS.has(slot) || !pack) return json({ ok: false }, 404);
    const job = await loadJob(store, code);
    if (!job) return json({ ok: false }, 404);
    // Threads opened before private links stay readable; new threads need a link key.
    if (job.keys && !(await roleForKey(job, keyFrom(req)))) return json({ ok: false, error: "link" }, 403);
    const bytes = await store.get("pack:" + code + ":" + pack + ":" + slot, { type: "arrayBuffer" });
    if (!bytes) return json({ ok: false }, 404);
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" }
    });
  }

  if (url.pathname !== "/api/job-thread") {
    return json({ ok: false, error: "path" }, 404);
  }

  if (req.method === "GET") {
    const code = String(url.searchParams.get("code") || "").toUpperCase();
    const job = await loadJob(store, code);
    if (!job) return json({ ok: false, error: "not found" }, 404);
    const role = await roleForKey(job, keyFrom(req));
    if (!role && job.keys) return json({ ok: false, error: "link" }, 403);
    return json({ ok: true, job: await view(store, job, role) });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  const action = cleanText(body.action, 20);

  if (action === "open") {
    const name = cleanText(body.name, 80);
    const email = cleanText(body.email, 120).toLowerCase();
    const suburb = cleanText(body.suburb, 80);
    const beds = cleanText(body.beds, 4);
    const street = cleanText(body.street, 120);
    if (!name || !suburb || !beds || !email) return json({ ok: false, error: "Add your name, email, suburb and beds." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Check the email address." }, 400);
    if (hasCode(street)) return json({ ok: false, error: CODE_ERROR }, 400);
    let code = newCode();
    for (let i = 0; i < 6; i += 1) {
      if (!(await loadJob(store, code))) break;
      code = newCode();
    }
    const job = {
      code,
      status: "LEAD",
      suburb,
      beds,
      street,
      window: { checkout: cleanText(body.checkout, 40), checkin: cleanText(body.checkin, 40) },
      accessType: cleanText(body.accessType, 20),
      manager: { name, email },
      cleaner: null,
      events: [],
      packs: [],
      payment: newPayment(beds),
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    const links = await issueKeys(job);
    addEvent(job, { kind: "lot_open", role: "manager", by: name, text: suburb + " · " + beds + "-bed · thread opened" });
    if (job.payment.deposit) {
      addEvent(job, {
        kind: "deposit_due",
        role: "desk",
        by: "Inner Turn",
        text: "Deposit $" + job.payment.deposit + " due by bank transfer before the turn is confirmed"
      });
    }
    await store.setJSON("job:" + code, job);
    return json({ ok: true, job: await view(store, job, "manager"), links });
  }

  const code = String(body.code || "").toUpperCase();
  const job = await loadJob(store, code);
  if (!job) return json({ ok: false, error: "not found" }, 404);

  const role = await roleForKey(job, keyFrom(req, body));
  if (!role) {
    return json(
      { ok: false, error: job.keys ? "link" : "This older thread is read-only. Ask the desk for new private links." },
      403
    );
  }
  const party = role === "manager" ? job.manager : job.cleaner;
  const by = (party && party.name) || (role === "manager" ? "Manager" : "Cleaner");
  const save = async () => {
    await store.setJSON("job:" + code, job);
    return json({ ok: true, job: await view(store, job, role) });
  };

  // Sets the caller's own name/email. Nobody can overwrite the other side.
  if (action === "profile" || action === "join") {
    const name = cleanText(body.name, 80);
    const email = cleanText(body.email, 120).toLowerCase();
    if (!name) return json({ ok: false, error: "Add your name." }, 400);
    const first = !party || !party.name;
    const next = { name, email: email || party?.email || "" };
    if (role === "manager") job.manager = next;
    else job.cleaner = next;
    if (first) addEvent(job, { kind: "join", role, by: name, text: name + " joined as " + role });
    else job.updated = new Date().toISOString();
    return save();
  }

  if (action === "note") {
    const text = cleanText(body.text, 400);
    if (!text) return json({ ok: false, error: "Write a message first." }, 400);
    if (hasCode(text)) return json({ ok: false, error: CODE_ERROR }, 400);
    addEvent(job, { kind: "note", role, by, text });
    return save();
  }

  if (action === "missing") {
    job.status = "HOLD";
    addEvent(job, { kind: "pack_missing", role, by, text: "PACK MISSING — pay HOLD until stills are on this thread" });
    return save();
  }

  if (action === "flag") {
    const text = cleanText(body.text, 160) || "Damage flagged on pack";
    if (hasCode(text)) return json({ ok: false, error: CODE_ERROR }, 400);
    job.status = "FLAG";
    addEvent(job, { kind: "damage_flag", role, by, text: "DAMAGE FLAG — " + text });
    return save();
  }

  if (action === "pack-slot") {
    const packId = cleanText(body.packId, 24) || newId();
    const slot = cleanText(body.slot, 16);
    const dataUrl = String(body.image || "");
    if (!SLOTS.has(slot)) return json({ ok: false, error: "bad slot" }, 400);
    const m = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json({ ok: false, error: "jpeg only" }, 400);
    const raw = Buffer.from(m[1], "base64");
    if (raw.length < 800 || raw.length > 450000) return json({ ok: false, error: "Photo is too small or too large." }, 400);
    let pack = (job.packs || []).find((p) => p.id === packId);
    if (!pack) {
      if ((job.packs || []).length >= 12) return json({ ok: false, error: "This thread has the maximum number of packs." }, 400);
      pack = { id: packId, at: new Date().toISOString(), by, role, slots: {}, note: "", damage: "" };
      job.packs = job.packs || [];
      job.packs.push(pack);
    }
    await store.set("pack:" + code + ":" + packId + ":" + slot, raw);
    pack.slots[slot] = true;
    pack.at = new Date().toISOString();
    addEvent(job, { kind: "pack_slot", role, by, text: "Still added — " + slot, packId, slot });
    await store.setJSON("job:" + code, job);
    return json({ ok: true, packId, job: await view(store, job, role) });
  }

  // DONE is only reachable here, with all five stills on the pack.
  if (action === "pack-close") {
    const packId = cleanText(body.packId, 24);
    const pack = (job.packs || []).find((p) => p.id === packId);
    if (!pack) return json({ ok: false, error: "Upload the stills first." }, 400);
    const note = cleanText(body.note, 200);
    const damage = cleanText(body.damage, 160);
    if (hasCode(note) || hasCode(damage)) return json({ ok: false, error: CODE_ERROR }, 400);
    pack.note = note;
    pack.damage = /^(none|nil|no|n\/a|-)$/i.test(damage) ? "" : damage;
    const ready = NEEDED.every((s) => pack.slots[s]);
    job.status = pack.damage ? "FLAG" : ready ? "DONE" : "HOLD";
    addEvent(job, {
      kind: ready ? "pack_sent" : "pack_partial",
      role,
      by,
      packId,
      text: ready
        ? "PACK SENT — " + (pack.damage ? "damage flagged" : "no damage noted")
        : "Pack incomplete — missing " + NEEDED.filter((s) => !pack.slots[s]).join(", ")
    });
    return save();
  }

  if (action === "paid-sent") {
    if (role !== "manager") return json({ ok: false, error: "Manager only." }, 403);
    const pay = payment(job);
    const what = body.what === "balance" ? "balance" : "deposit";
    if (what === "deposit") {
      if (pay.depositStatus === "received") return json({ ok: false, error: "Deposit already received." }, 400);
      pay.depositStatus = "sent";
    } else {
      if (pay.balanceStatus === "paid") return json({ ok: false, error: "Balance already received." }, 400);
      pay.balanceStatus = "sent";
    }
    const amount = what === "deposit" ? pay.deposit : pay.price != null && pay.deposit != null ? pay.price - pay.deposit : null;
    addEvent(job, {
      kind: "payment_sent",
      role,
      by,
      text: (what === "deposit" ? "Deposit" : "Balance") + (amount != null ? " $" + amount : "") +
        " sent by bank transfer (ref " + code + ") — desk to confirm receipt"
    });
    return save();
  }

  if (action === "payout") {
    if (role !== "cleaner") return json({ ok: false, error: "Cleaner only." }, 403);
    const pay = payment(job);
    if (pay.payout === "paid") return json({ ok: false, error: "This turn is already paid." }, 400);
    const name = cleanText(body.accountName, 80);
    const bsb = String(body.bsb || "").replace(/[\s-]/g, "");
    const account = String(body.account || "").replace(/\s/g, "");
    if (name.length < 2 || !/^\d{6}$/.test(bsb) || !/^\d{5,10}$/.test(account)) {
      return json({ ok: false, error: "Check the account name, 6-digit BSB and account number." }, 400);
    }
    const prev = await store.get("payout:" + code, { type: "json" });
    await store.setJSON("payout:" + code, {
      name,
      bsb: bsb.slice(0, 3) + "-" + bsb.slice(3),
      account,
      at: new Date().toISOString()
    });
    pay.payout = "saved";
    addEvent(job, {
      kind: prev ? "payout_changed" : "payout_saved",
      role,
      by,
      text: prev
        ? "Payout bank details CHANGED — desk confirms by phone before paying"
        : "Payout bank details saved (private to the desk)"
    });
    return save();
  }

  return json({ ok: false, error: "action" }, 400);
};

export const config = {
  path: ["/api/job-thread", "/api/job-pack"],
  rateLimit: {
    windowLimit: 90,
    windowSize: 60,
    aggregateBy: ["ip", "domain"]
  }
};
