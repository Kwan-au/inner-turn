const SLOTS = [
  ["entry", "Entry", true],
  ["beds", "Beds", true],
  ["bathroom", "Bathroom", true],
  ["kitchen", "Kitchen", true],
  ["living", "Living", true],
  ["damage", "Damage", false]
];
const CARD = { "1": 149, "2": 189, "3": 229, "4": 279 };
const SAVED = "it-threads";
const REFRESH_MS = 20000;

const state = { code: "", key: "", job: null, packId: "", tab: "overview", feed: "all", images: new Map() };

function $(id) {
  return document.getElementById(id);
}

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- saved threads (this device only) ---------- */

function saved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED) || "[]").filter((t) => t && t.code && t.key);
  } catch {
    return [];
  }
}

function remember(job, key) {
  const all = saved().filter((t) => t.code !== job.code);
  all.unshift({ code: job.code, key, role: job.role, suburb: job.suburb, beds: job.beds, status: job.status, at: Date.now() });
  localStorage.setItem(SAVED, JSON.stringify(all.slice(0, 20)));
}

function forget(code) {
  localStorage.setItem(SAVED, JSON.stringify(saved().filter((t) => t.code !== code)));
}

function linkFor(code, key) {
  return location.origin + "/app?code=" + code + "#k=" + key;
}

function parseLink(text) {
  try {
    const u = new URL(String(text).trim(), location.origin);
    const code = (u.searchParams.get("code") || "").toUpperCase();
    const key = new URLSearchParams(u.hash.slice(1)).get("k") || "";
    return { code, key };
  } catch {
    return { code: "", key: "" };
  }
}

/* ---------- api ---------- */

async function api(payload) {
  const res = await fetch("/api/job-thread", {
    method: "POST",
    headers: { "content-type": "application/json", "x-job-key": state.key },
    body: JSON.stringify({ code: state.code, ...payload })
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error === "link" ? "This link no longer works. Ask the desk for a new one."
        : res.status === 429 ? "Too many requests. Wait a minute and try again."
          : data.error || "Something went wrong. Try again."
    );
  }
  return data;
}

async function fetchJob(code, key) {
  const res = await fetch("/api/job-thread?code=" + encodeURIComponent(code), {
    headers: key ? { "x-job-key": key } : {}
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (res.status === 403) throw new Error("This link doesn't work any more. Ask the manager or the desk for a new one.");
  if (!res.ok || !data.ok) throw new Error("We couldn't find that thread. Check the link.");
  return data.job;
}

/* ---------- screens & feedback ---------- */

function setScreen(id) {
  document.querySelectorAll("[data-screen]").forEach((s) => {
    s.hidden = s.getAttribute("data-screen") !== id;
  });
  if (id !== "thread") stopRefresh();
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`[data-screen="${id}"] h1`);
  if (h) {
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }
}

let toastTimer;
function toast(msg, bad) {
  const t = $("th-msg");
  t.hidden = false;
  t.textContent = msg;
  t.className = "th-toast" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3500);
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast((label || "Copied") + " ✓");
  } catch {
    window.prompt("Copy this:", text);
  }
}

async function shareCleaner() {
  const key = state.job?.cleanerKey;
  if (!key) return;
  const link = linkFor(state.code, key);
  const text = "Inner Turn job " + state.code + " · " + state.job.suburb + " " + state.job.beds + "-bed. Your private cleaner link:";
  if (navigator.share) {
    try {
      await navigator.share({ title: "Inner Turn job " + state.code, text, url: link });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  copy(text + " " + link, "Cleaner link copied");
}

/* ---------- home ---------- */

function drawHome() {
  const list = saved();
  $("my-threads").hidden = !list.length;
  const ul = $("my-list");
  ul.textContent = "";
  list.forEach((t) => {
    const li = el("li");
    const open = el("button", { type: "button", class: "th-mine-open", "data-code": t.code });
    open.append(
      el("strong", null, t.code),
      el("span", { class: "th-chip s-" + (t.status || "LEAD") }, t.status || "LEAD"),
      el("span", null, [t.suburb, t.beds && t.beds + "-bed"].filter(Boolean).join(" · ")),
      el("em", null, t.role === "cleaner" ? "Cleaner" : "Manager")
    );
    const del = el("button", { type: "button", class: "th-mine-x", "data-forget": t.code, "aria-label": "Remove " + t.code + " from this device" }, "×");
    li.append(open, del);
    ul.append(li);
  });
}

function drawPrice() {
  const beds = $("open-beds").value;
  const price = CARD[beds];
  $("open-price").textContent = !beds
    ? ""
    : price
      ? "Card price $" + price + " per turn (GST not charged). A deposit is paid by bank transfer before the turn is confirmed."
      : "5+ bedrooms are quoted. The desk confirms the price and deposit on the thread.";
}

/* ---------- thread ---------- */

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function money(n) {
  return n == null ? "To be quoted" : "$" + n;
}

function currentPack() {
  const packs = state.job?.packs || [];
  return packs.find((p) => p.id === state.packId) || null;
}

function steps(job) {
  const pay = job.payment || {};
  const last = job.role === "cleaner"
    ? ["Cleaner paid", pay.payout === "paid"]
    : ["Paid in full", pay.balanceStatus === "paid"];
  return [
    ["Opened", true],
    ["Cleaner joined", Boolean(job.cleaner && job.cleaner.name)],
    ["Deposit received", pay.depositStatus === "received"],
    ["Photo pack sent", job.status === "DONE"],
    last
  ];
}

function nextStep(job) {
  const pay = job.payment || {};
  if (job.readonly) return "This thread is read-only.";
  if (job.status === "FLAG") return "Damage is flagged. The desk reviews the photos before anything else happens.";
  if (job.status === "HOLD") return "On hold: the photo pack is missing or incomplete. Pay waits until all the photos are in.";
  if (job.role === "manager") {
    if (!job.cleaner?.name) return "Send the cleaner link so the cleaner can join.";
    if (pay.depositStatus === "due") return "Pay the deposit by bank transfer. See the Payment tab.";
    if (pay.depositStatus === "sent") return "Deposit sent. The desk confirms it here when it arrives.";
    if (job.status !== "DONE") return "Turn confirmed. The cleaner sends the photo pack here after the clean.";
    if (pay.balanceStatus !== "paid") return "Photos are in. Pay the balance by bank transfer. See the Payment tab.";
    return "All done. Thanks!";
  }
  if (pay.depositStatus !== "received") return "Waiting for the desk to confirm this turn. Don't start until it shows LIVE.";
  if (job.status !== "DONE") return "After the clean, add a photo for each room in the Photos tab and send the pack.";
  if (pay.payout === "none") return "Add your bank details in the Payment tab so we can pay you.";
  if (pay.payout !== "paid") return "Pack received. You'll be paid by bank transfer within 14 days.";
  return "Paid. Thanks for the turn!";
}

function renderSteps(job) {
  const ol = $("th-steps");
  ol.textContent = "";
  let current = false;
  steps(job).forEach(([label, done]) => {
    const li = el("li", { class: done ? "done" : !current ? "now" : "" });
    if (!done && !current) {
      li.setAttribute("aria-current", "step");
      current = true;
    }
    li.append(el("span", { "aria-hidden": "true" }, done ? "✓" : ""), document.createTextNode(label));
    ol.append(li);
  });
}

function renderOverview(job) {
  $("th-next").textContent = nextStep(job);
  const dl = $("th-facts");
  dl.textContent = "";
  const rows = [
    ["Lot", [job.suburb, job.beds + "-bed", job.street].filter(Boolean).join(" · ")],
    ["Checkout", job.window?.checkout ? fmt(job.window.checkout) : "Not set"],
    ["Next check-in", job.window?.checkin ? fmt(job.window.checkin) : "Not set"],
    ["Access", job.accessType ? job.accessType + " (codes by phone, never on the thread)" : "Not set"],
    ["Manager", [job.manager?.name, job.manager?.email].filter(Boolean).join(" · ") || "—"],
    ["Cleaner", job.cleaner?.name ? [job.cleaner.name, job.cleaner.email].filter(Boolean).join(" · ") : "Not joined yet"]
  ];
  rows.forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v)));
  $("th-share").hidden = !(job.role === "manager" && job.cleanerKey);
}

function slotLabel(slot) {
  return (SLOTS.find((s) => s[0] === slot) || [slot, slot])[1];
}

function renderSlots() {
  const box = $("th-slots");
  box.textContent = "";
  const pack = currentPack();
  SLOTS.forEach(([slot, label, required]) => {
    const done = Boolean(pack && pack.slots && pack.slots[slot]);
    const lab = el("label", { class: "th-slot" + (done ? " done" : ""), for: "slot-" + slot });
    lab.append(
      el("span", { class: "th-slot-mark", "aria-hidden": "true" }, done ? "✓" : "+"),
      el("strong", null, label),
      el("small", null, done ? "Added · tap to replace" : required ? "Required" : "Only if needed")
    );
    const input = el("input", { type: "file", accept: "image/*", id: "slot-" + slot, "data-slot": slot, class: "sr" });
    lab.append(input);
    box.append(lab);
  });
  const missing = SLOTS.filter(([s, , r]) => r && !(pack && pack.slots[s])).map(([, l]) => l);
  $("pack-check").textContent = missing.length
    ? "Still needed: " + missing.join(", ") + ". You can send it now, but it stays on HOLD until all five are in."
    : "All five required photos are in. Ready to send.";
  const have = SLOTS.filter(([s, , r]) => r && pack && pack.slots[s]).length;
  $("count-photos").textContent = have ? have + "/5" : "";
}

async function packImage(code, packId, slot) {
  const k = packId + ":" + slot;
  if (state.images.has(k)) return state.images.get(k);
  const p = fetch("/api/job-pack?code=" + encodeURIComponent(code) + "&pack=" + encodeURIComponent(packId) + "&slot=" + encodeURIComponent(slot), {
    headers: state.key ? { "x-job-key": state.key } : {}
  })
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b ? URL.createObjectURL(b) : ""));
  state.images.set(k, p);
  return p;
}

function renderPacks(job) {
  const box = $("th-packs");
  box.textContent = "";
  const packs = (job.packs || []).slice().reverse();
  if (!packs.length) box.append(el("p", { class: "th-fine" }, "No photos yet."));
  packs.forEach((p) => {
    const art = el("article", { class: "th-pack" });
    const head = el("header");
    head.append(el("strong", null, fmt(p.at)), el("em", null, p.by || ""));
    art.append(head);
    const grid = el("div", { class: "th-stills" });
    Object.keys(p.slots || {}).filter((s) => p.slots[s]).forEach((slot) => {
      const fig = el("figure");
      const img = el("img", { alt: slotLabel(slot) + " photo", loading: "lazy" });
      packImage(job.code, p.id, slot).then((src) => { if (src) img.src = src; });
      const a = el("a", { href: "#", "data-zoom": "1" });
      a.append(img);
      fig.append(a, el("figcaption", null, slotLabel(slot)));
      grid.append(fig);
    });
    art.append(grid);
    if (p.damage) art.append(el("p", { class: "th-flag" }, "Damage: " + p.damage));
    if (p.note) art.append(el("p", null, p.note));
    box.append(art);
  });
}

const KIND_LABEL = {
  lot_open: "Opened", join: "Joined", note: "Message", status: "Status", pack_missing: "Pack missing",
  damage_flag: "Damage", pack_slot: "Photo", pack_sent: "Pack sent", pack_partial: "Pack incomplete",
  payment_sent: "Payment", payment_received: "Payment", deposit_due: "Payment", price_set: "Payment",
  payout_saved: "Payout", payout_changed: "Payout", payout_paid: "Payout", links: "Links"
};

function renderFeed(job) {
  const ul = $("th-feed");
  ul.textContent = "";
  const events = (job.events || []).slice().reverse()
    .filter((ev) => state.feed === "all" ? ev.kind !== "pack_slot" : ev.kind === "note");
  if (!events.length) ul.append(el("li", { class: "th-fine" }, "Nothing here yet."));
  events.forEach((ev) => {
    const mine = ev.role === job.role && ev.kind === "note";
    const li = el("li", { class: "th-ev th-" + ev.kind + " r-" + (ev.role || "desk") + (mine ? " mine" : "") });
    const meta = el("p", { class: "th-ev-meta" });
    meta.append(
      el("b", null, ev.by || ""),
      document.createTextNode(" · " + (ev.role === "desk" ? "Desk" : ev.role === "cleaner" ? "Cleaner" : "Manager") + " · " + (KIND_LABEL[ev.kind] || ev.kind)),
      el("time", { datetime: ev.at }, fmt(ev.at))
    );
    li.append(meta, el("p", null, ev.text || ""));
    ul.append(li);
  });
  const n = (job.events || []).filter((ev) => ev.kind === "note").length;
  $("count-messages").textContent = n ? String(n) : "";
}

function payRow(parent, label, value, status) {
  const row = el("div", { class: "th-payrow" });
  row.append(el("span", null, label), el("strong", null, value));
  if (status) row.append(el("em", { class: "th-paystat " + status[1] }, status[0]));
  parent.append(row);
}

function renderPayment(job) {
  const box = $("pay-body");
  box.textContent = "";
  const pay = job.payment || {};
  const DEP = { due: ["Due", "due"], sent: ["Sent, awaiting desk", "sent"], received: ["Received", "ok"] };
  const BAL = { open: [job.status === "DONE" ? "Due now" : "After the photo pack", job.status === "DONE" ? "due" : ""], sent: ["Sent, awaiting desk", "sent"], paid: ["Paid", "ok"] };
  let attention = false;

  if (job.role === "manager" || job.readonly) {
    const sum = el("div", { class: "th-card" });
    sum.append(el("h2", null, "What you pay"));
    payRow(sum, "Turn price", money(pay.price));
    payRow(sum, "Deposit before the turn", money(pay.deposit), DEP[pay.depositStatus]);
    payRow(sum, "Balance after the photo pack", money(pay.balance), BAL[pay.balanceStatus]);
    sum.append(el("p", { class: "th-fine" }, "GST not charged. The operator is not registered for GST, so this price is the invoice."));
    box.append(sum);
    if (job.readonly) return;

    const bank = el("div", { class: "th-card th-bank" });
    bank.append(el("h2", null, "Pay by bank transfer"));
    if (job.bank) {
      [["Account name", job.bank.name], ["BSB", job.bank.bsb], ["Account number", job.bank.account], ["Reference", job.code]].forEach(([k, v]) => {
        const row = el("div", { class: "th-payrow" });
        const b = el("button", { type: "button", class: "th-copy", "data-copytext": v, "aria-label": "Copy " + k }, "Copy");
        row.append(el("span", null, k), el("strong", null, v), b);
        bank.append(row);
      });
      bank.append(el("p", { class: "th-fine" }, "Always use the job code " + job.code + " as the reference. We never change bank details by email or text. If anyone asks you to pay a different account, phone 0451 224 857 first."));
    } else {
      bank.append(el("p", null, "Our bank details are on your invoice. Email desk@innerturn.com.au or phone 0451 224 857 if you need them. Use " + job.code + " as the reference."));
    }
    const row = el("div", { class: "th-row" });
    if (pay.depositStatus === "due" && pay.deposit != null) {
      row.append(el("button", { type: "button", class: "th-btn", "data-paid": "deposit" }, "I've sent the deposit"));
      attention = true;
    }
    if (pay.depositStatus === "received" && job.status === "DONE" && pay.balanceStatus === "open" && pay.balance) {
      row.append(el("button", { type: "button", class: "th-btn", "data-paid": "balance" }, "I've sent the balance"));
      attention = true;
    }
    bank.append(row);
    box.append(bank);
  } else {
    const sum = el("div", { class: "th-card" });
    sum.append(el("h2", null, "Getting paid"));
    const PO = { none: ["Add your bank details", "due"], saved: [job.status === "DONE" ? "Due within 14 days" : "After the photo pack", "sent"], paid: ["Paid", "ok"] };
    payRow(sum, "This turn", "Rate from your written offer", PO[pay.payout]);
    sum.append(el("p", { class: "th-fine" }, "You're paid by bank transfer within 14 days after the full photo pack is on this thread. Invoice the desk for the turn as usual."));
    box.append(sum);

    const card = el("div", { class: "th-card" });
    card.append(el("h2", null, "Your bank details"));
    if (job.payoutDetails) {
      card.append(el("p", null, job.payoutDetails.name + " · BSB " + job.payoutDetails.bsb + " · Account " + job.payoutDetails.account));
    }
    if (pay.payout !== "paid") {
      const form = el("form", { id: "payout-form", class: "th-form" });
      const f = (id, label, attrs) => {
        const lab = el("label", null, label);
        lab.append(el("input", { id, required: true, ...attrs }));
        return lab;
      };
      form.append(
        f("po-name", "Account name", { maxlength: "80", autocomplete: "name" }),
        f("po-bsb", "BSB", { inputmode: "numeric", maxlength: "7", pattern: "\\d{3}-?\\d{3}", placeholder: "000-000" }),
        f("po-acc", "Account number", { inputmode: "numeric", maxlength: "10", pattern: "\\d{5,10}" }),
        el("p", { class: "th-fine" }, "Only the desk sees these. The manager doesn't. If you change them, the desk phones you to check before paying."),
        el("button", { type: "submit", class: "th-btn" }, job.payoutDetails ? "Update bank details" : "Save bank details")
      );
      card.append(form);
      if (pay.payout === "none") attention = true;
    }
    box.append(card);
  }
  $("dot-payment").hidden = !attention;
}

function renderThread() {
  const job = state.job;
  if (!job) return;
  $("th-code").textContent = job.code;
  const chip = $("th-status");
  chip.textContent = job.status;
  chip.className = "th-chip s-" + job.status;
  $("th-lot").textContent = [job.suburb, job.beds + "-bed", job.window?.checkout && "out " + fmt(job.window.checkout)].filter(Boolean).join(" · ");
  $("th-you").textContent = job.readonly ? "Viewer" : (job.role === "manager" ? "Manager" : "Cleaner") +
    (job[job.role]?.name ? " · " + job[job.role].name : "");
  $("th-readonly").hidden = !job.readonly;
  document.querySelectorAll("#thread [data-write]").forEach((n) => { n.hidden = job.readonly; });
  renderSteps(job);
  renderOverview(job);
  renderSlots();
  renderPacks(job);
  renderFeed(job);
  renderPayment(job);
  if (!job.readonly) remember(job, state.key);
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".th-tabs [role=tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".th-pane").forEach((p) => { p.hidden = p.id !== "pane-" + tab; });
  try { sessionStorage.setItem("it-tab-" + state.code, tab); } catch {}
}

function apply(data) {
  if (data.job) state.job = data.job;
  renderThread();
}

/* ---------- open a thread from a link ---------- */

async function openThread(code, key) {
  state.code = code;
  state.key = key || (saved().find((t) => t.code === code) || {}).key || "";
  try {
    state.packId = sessionStorage.getItem("it-pack-" + code) || "";
  } catch {}
  history.replaceState(null, "", "/app?code=" + code);
  const job = await fetchJob(code, state.key);
  state.job = job;
  if (!job.readonly && !(job[job.role] && job[job.role].name)) {
    $("join-role").textContent = job.role;
    $("join-title").textContent = job.role === "cleaner" ? "Join as the cleaner" : "Confirm your details";
    $("join-lot").textContent = [job.code, job.suburb, job.beds + "-bed", job.window?.checkout && "checkout " + fmt(job.window.checkout)].filter(Boolean).join(" · ");
    setScreen("join");
    $("join-name").focus();
    return;
  }
  renderThread();
  setScreen("thread");
  let tab = "overview";
  try { tab = sessionStorage.getItem("it-tab-" + code) || "overview"; } catch {}
  showTab(tab);
  startRefresh();
}

let refreshTimer;
function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(async () => {
    if (document.hidden || !state.code) return;
    const active = document.activeElement;
    if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && active.value) return;
    try {
      const job = await fetchJob(state.code, state.key);
      if (job.updated !== state.job?.updated || JSON.stringify(job.events) !== JSON.stringify(state.job?.events)) {
        state.job = job;
        renderThread();
      }
    } catch {}
  }, REFRESH_MS);
}
function stopRefresh() {
  clearInterval(refreshTimer);
}

/* ---------- photos ---------- */

function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280;
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = 0.72;
      let out = canvas.toDataURL("image/jpeg", q);
      while (out.length > 480000 && q > 0.4) {
        q -= 0.08;
        out = canvas.toDataURL("image/jpeg", q);
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error("That file isn't a photo we can read."));
    img.src = url;
  });
}

/* ---------- wiring ---------- */

document.addEventListener("DOMContentLoaded", () => {
  ["it-role", "it-name", "it-email"].forEach((k) => localStorage.removeItem(k));

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      const to = go.dataset.go;
      if (to === "home") {
        history.replaceState(null, "", "/app");
        state.code = "";
        drawHome();
      }
      setScreen(to);
      return;
    }
    const share = e.target.closest("[data-share]");
    if (share) return shareCleaner();
    const cp = e.target.closest("[data-copy]");
    if (cp) return copy($(cp.dataset.copy).textContent, "Link copied");
    const ct = e.target.closest("[data-copytext]");
    if (ct) return copy(ct.dataset.copytext, "Copied");
    const zoom = e.target.closest("[data-zoom]");
    if (zoom) {
      e.preventDefault();
      const img = zoom.querySelector("img");
      if (img && img.src) window.open(img.src, "_blank", "noopener");
    }
  });

  $("my-list").addEventListener("click", (e) => {
    const f = e.target.closest("[data-forget]");
    if (f) {
      if (confirm("Remove " + f.dataset.forget + " from this device? Keep a copy of your link if you still need it.")) {
        forget(f.dataset.forget);
        drawHome();
      }
      return;
    }
    const o = e.target.closest("[data-code]");
    if (o) openThread(o.dataset.code).catch((err) => toast(err.message, true));
  });

  $("paste-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const { code, key } = parseLink($("paste-link").value);
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return toast("That doesn't look like a thread link. Paste the whole link.", true);
    openThread(code, key).catch((err) => toast(err.message, true));
  });

  $("open-beds").addEventListener("change", drawPrice);

  $("open-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = e.submitter;
    busy(btn, async () => {
      const res = await fetch("/api/job-thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "open",
          name: $("open-name").value.trim(),
          email: $("open-email").value.trim(),
          suburb: $("open-suburb").value.trim(),
          beds: $("open-beds").value,
          street: $("open-street").value.trim(),
          checkout: $("open-out").value,
          checkin: $("open-in").value,
          accessType: $("open-access").value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(res.status === 429 ? "Too many requests. Wait a minute." : data.error || "Could not open the thread.");
      state.code = data.job.code;
      state.key = data.links.manager;
      state.job = data.job;
      remember(data.job, state.key);
      history.replaceState(null, "", "/app?code=" + state.code);
      $("links-code").textContent = state.code;
      $("link-manager").textContent = linkFor(state.code, data.links.manager);
      $("link-cleaner").textContent = linkFor(state.code, data.links.cleaner);
      e.target.reset();
      drawPrice();
      setScreen("links");
    });
  });

  $("links-go").addEventListener("click", () => openThread(state.code, state.key).catch((err) => toast(err.message, true)));

  $("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      apply(await api({ action: "profile", name: $("join-name").value.trim(), email: $("join-email").value.trim() }));
      setScreen("thread");
      showTab("overview");
      startRefresh();
      toast("You're on the thread.");
    });
  });

  const tabs = [...document.querySelectorAll(".th-tabs [role=tab]")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus();
      showTab(n.dataset.tab);
    });
  });

  document.querySelectorAll("[data-feed]").forEach((b) => {
    b.addEventListener("click", () => {
      state.feed = b.dataset.feed;
      document.querySelectorAll("[data-feed]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderFeed(state.job);
    });
  });

  $("note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("note-text").value.trim();
    if (!text) return;
    busy(e.submitter, async () => {
      apply(await api({ action: "note", text }));
      $("note-text").value = "";
    });
  });
  $("note-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("note-form").requestSubmit();
  });

  $("btn-missing").addEventListener("click", (e) => {
    if (!confirm("Mark the photo pack as missing? This puts pay on HOLD until the photos are in.")) return;
    busy(e.currentTarget, async () => apply(await api({ action: "missing" })));
  });

  $("btn-flag").addEventListener("click", (e) => {
    const text = window.prompt("In one line, what does the damage look like?");
    if (text == null) return;
    busy(e.currentTarget, async () => apply(await api({ action: "flag", text })));
  });

  $("th-slots").addEventListener("change", (e) => {
    const input = e.target.closest("input[data-slot]");
    const file = input && input.files && input.files[0];
    if (!file) return;
    const slot = input.dataset.slot;
    const lab = input.closest(".th-slot");
    lab.classList.add("busy");
    lab.querySelector("small").textContent = "Uploading…";
    busy(null, async () => {
      try {
        const image = await compress(file);
        const data = await api({ action: "pack-slot", packId: state.packId, slot, image });
        state.packId = data.packId;
        try { sessionStorage.setItem("it-pack-" + state.code, state.packId); } catch {}
        apply(data);
        toast(slotLabel(slot) + " photo added ✓");
      } finally {
        renderSlots();
      }
    });
  });

  $("btn-done").addEventListener("click", (e) => {
    if (!state.packId || !currentPack()) return toast("Add the photos first.", true);
    busy(e.currentTarget, async () => {
      apply(await api({
        action: "pack-close",
        packId: state.packId,
        note: $("pack-note").value.trim(),
        damage: $("pack-damage").value.trim()
      }));
      state.packId = "";
      try { sessionStorage.removeItem("it-pack-" + state.code); } catch {}
      $("pack-note").value = "";
      $("pack-damage").value = "";
      renderSlots();
      toast(state.job.status === "DONE" ? "Photo pack sent ✓" : "Pack saved, but it's on HOLD until every room has a photo.", state.job.status !== "DONE");
    });
  });

  $("pay-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-paid]");
    if (!b) return;
    const what = b.dataset.paid;
    if (!confirm("Confirm you've sent the " + what + " by bank transfer with reference " + state.code + "?")) return;
    busy(b, async () => {
      apply(await api({ action: "paid-sent", what }));
      toast("Thanks. The desk confirms it here when it arrives.");
    });
  });

  $("pay-body").addEventListener("submit", (e) => {
    if (e.target.id !== "payout-form") return;
    e.preventDefault();
    busy(e.submitter, async () => {
      apply(await api({
        action: "payout",
        accountName: $("po-name").value.trim(),
        bsb: $("po-bsb").value.trim(),
        account: $("po-acc").value.trim()
      }));
      toast("Bank details saved ✓");
    });
  });

  const params = new URLSearchParams(location.search);
  const code = (params.get("code") || "").toUpperCase();
  const key = new URLSearchParams(location.hash.slice(1)).get("k") || "";
  drawHome();
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    openThread(code, key).catch((err) => {
      setScreen("home");
      toast(err.message, true);
    });
  } else {
    setScreen("home");
  }
});
