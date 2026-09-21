import { deskHeaders, signOutDesk } from "/auth.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

const PIPE = "inner-turn-pipeline";
const QUOTA = "inner-turn-quota";
const STATUSES = ["LEAD", "FILE", "LIVE", "HOLD", "DEAD"];
const GRAND_FINAL_YMD = "2026-09-26";
const list = document.getElementById("list");
const syncEl = document.getElementById("desk-sync");
let boardData = null;
let statusFilter = "ALL";
let boardTimer = 0;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function readPipe() {
  try { return JSON.parse(localStorage.getItem(PIPE) || "[]"); } catch { return []; }
}
function writePipe(rows) {
  localStorage.setItem(PIPE, JSON.stringify(rows));
}
function readQuota() {
  const raw = JSON.parse(localStorage.getItem(QUOTA) || "{}");
  if (raw.day !== todayKey()) return { day: todayKey(), email: 0, li: 0, walk: 0 };
  return raw;
}
function saveQuota(q) {
  localStorage.setItem(QUOTA, JSON.stringify(q));
}

function setSync(text) {
  if (syncEl) syncEl.textContent = text;
}

async function pullRemote() {
  try {
    const res = await fetch("/api/desk-state", {
      headers: await deskHeaders()
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.state || null;
  } catch {
    setSync("Blob unreachable. Working from this browser. Export before the second live door.");
    return null;
  }
}

async function pushRemote() {
  try {
    const res = await fetch("/api/desk-state", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pipe: readPipe(), quota: readQuota() })
    });
    if (!res.ok) throw new Error(String(res.status));
    setSync("Synced to Netlify Blobs. Survives a new browser.");
  } catch {
    setSync("Save failed. Row is on this device only — use Export.");
  }
}

function drawQuota() {
  const q = readQuota();
  const items = [
    { key: "email", label: "Named emails", cap: 10 },
    { key: "li", label: "LinkedIn DMs", cap: 5 },
    { key: "walk", label: "Walk-ins / calls", cap: 2 }
  ];
  document.getElementById("quota-box").innerHTML = items.map((it) => {
    const n = q[it.key] || 0;
    return `<div class="q-card"><span>${esc(it.label)}</span><strong>${n} / ${it.cap}</strong><button type="button" data-q="${it.key}">+1</button></div>`;
  }).join("");
}

function drawBench() {
  const el = document.getElementById("bench-count");
  if (!el) return;
  const rows = readPipe();
  const file = rows.filter((r) => r.kind === "cleaner" && (r.stage === "FILE" || r.stage === "LIVE")).length;
  const live = rows.filter((r) => r.kind === "manager" && r.stage === "LIVE").length;
  el.textContent = file
    ? file + " cleaner(s) on FILE/LIVE · " + live + " manager book(s) LIVE"
    : "Cleaner file empty. No dispatch until ABN + CoC + written 1/2/3 rate.";
}

function drawPipe() {
  const rows = readPipe();
  list.innerHTML = rows.map((r, i) =>
    `<li><strong>${esc(r.kind)}</strong> · ${esc(r.stage || "LEAD")} · ${esc(r.who)}<br><span>${esc(r.note || "")}</span><button type="button" data-i="${i}">x</button></li>`
  ).join("") || "<li>Empty. Log the first reply.</li>";
  drawBench();
}

function statusSelect(table, id, current) {
  const opts = STATUSES.map(
    (s) => `<option value="${s}"${s === current ? " selected" : ""}>${s}</option>`
  ).join("");
  return `<label class="board-status">Status
    <select data-status-table="${esc(table)}" data-status-id="${esc(id)}">${opts}</select>
  </label>`;
}

function missingList(row) {
  const missing = Array.isArray(row.missingFields) ? row.missingFields : [];
  return missing.length
    ? `<ul>${missing.map((f) => `<li>Missing: ${esc(f)}</li>`).join("")}</ul>`
    : "";
}

function matchesFilter(row) {
  if (statusFilter === "ALL") return true;
  return String(row?.status || "LEAD") === statusFilter;
}

function melbourneYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function daysToGrandFinal(now = new Date()) {
  const today = melbourneYmd(now);
  const a = Date.parse(`${today}T00:00:00+10:00`);
  const b = Date.parse(`${GRAND_FINAL_YMD}T00:00:00+10:00`);
  return Math.round((b - a) / 86400000);
}

function todayFromBoard(data) {
  if (data.today && typeof data.today === "object") return data.today;
  const summary = data.summary || {};
  const executablePacks = summary.executablePacks || 0;
  const fileReady = summary.fileReady || 0;
  return {
    executablePacks,
    fileReady,
    canDispatch: executablePacks >= 1 && fileReady >= 1,
    daysToGrandFinal: daysToGrandFinal(),
    answerLine: executablePacks < 1 ? "Need lot pack" : fileReady < 1 ? "Need FILE cleaner" : "Ready to book"
  };
}

function drawToday(data) {
  const today = todayFromBoard(data);
  const answer = document.getElementById("today-answer");
  const metrics = document.getElementById("today-metrics");
  const actions = document.getElementById("today-actions");
  if (!answer || !metrics || !actions) return;

  const days = today.daysToGrandFinal;
  const dayLabel = days == null
    ? "—"
    : days === 0
      ? "today"
      : days > 0
        ? `${days} day${days === 1 ? "" : "s"}`
        : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;

  answer.textContent = today.answerLine || "Need lot pack";
  metrics.innerHTML = [
    ["Executable packs", today.executablePacks ?? 0, "Need ≥1 to dispatch"],
    ["FILE-ready cleaners", today.fileReady ?? 0, "FILE or LIVE"],
    ["Can dispatch", today.canDispatch ? "YES" : "NO", "Pack + FILE cleaner"],
    ["Grand Final 26 Sep", dayLabel, "Melbourne calendar"]
  ].map(([label, value, hint]) =>
    `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><em>${esc(hint)}</em></article>`
  ).join("");

  const next = Array.isArray(data.nextActions) ? data.nextActions : [];
  actions.innerHTML = next.map((row) =>
    `<li><strong>${esc(row.title)}</strong> · ${esc(row.reason)}</li>`
  ).join("") || "<li>No listed gaps on the board.</li>";
}

function drawBoard(data) {
  boardData = data;
  const summary = data.summary || {};
  const sumEl = document.getElementById("board-summary");
  const kpiEl = document.getElementById("board-kpis");
  const lotsEl = document.getElementById("board-lots");
  const cleanEl = document.getElementById("board-cleaners");
  const partyEl = document.getElementById("board-parties");
  if (!sumEl || !kpiEl || !lotsEl || !cleanEl || !partyEl) return;

  drawToday(data);

  sumEl.textContent =
    `${summary.executablePacks || 0} executable lot pack${summary.executablePacks === 1 ? "" : "s"} · ` +
    `${summary.fileReady || 0} FILE-ready cleaner${summary.fileReady === 1 ? "" : "s"} · ` +
    `${summary.parties || 0} part${summary.parties === 1 ? "y" : "ies"}`;

  kpiEl.innerHTML = [
    ["Lot packs", summary.lotPacks],
    ["Executable", summary.executablePacks],
    ["Cleaner files", summary.cleanerFiles],
    ["FILE-ready", summary.fileReady],
    ["Parties", summary.parties]
  ]
    .map(
      ([label, n]) =>
        `<article><span>${esc(label)}</span><strong>${esc(n ?? 0)}</strong><em>From desk DB</em></article>`
    )
    .join("");

  const lots = (Array.isArray(data.lotPacks) ? data.lotPacks : []).filter(matchesFilter);
  lotsEl.innerHTML =
    lots
      .map((row) => {
        const title = row.contactName || row.companyName || row.email || "Unnamed lot pack";
        const place = [row.suburb, row.beds ? `${row.beds} bed` : ""].filter(Boolean).join(" · ");
        return `<article class="agent-card">
      <div class="agent-meta"><strong>lot pack</strong><span>${esc(row.status)}</span>${
          row.executable ? "<b>executable</b>" : "<span>incomplete</span>"
        }</div>
      <h3>${esc(title)}</h3>
      <p>${esc(place)}</p>
      <p>${esc(row.email || "")}${row.phone ? ` · ${esc(row.phone)}` : ""}</p>
      ${missingList(row)}
      ${statusSelect("lot_packs", row.id, row.status)}
    </article>`;
      })
      .join("") || `<p class="note">${statusFilter === "ALL" ? "No lot packs yet. Manager forms land here after processing." : "No lot packs in " + statusFilter + "."}</p>`;

  const cleaners = (Array.isArray(data.cleanerFiles) ? data.cleanerFiles : []).filter(matchesFilter);
  cleanEl.innerHTML =
    cleaners
      .map((row) => {
        const title = row.namedPerson || row.contactName || row.companyName || row.email || "Unnamed cleaner";
        const rates = [
          row.rate1bed != null ? `1$${row.rate1bed}` : null,
          row.rate2bed != null ? `2$${row.rate2bed}` : null,
          row.rate3bed != null ? `3$${row.rate3bed}` : null,
          row.rate4bed != null ? `4$${row.rate4bed}` : null
        ]
          .filter(Boolean)
          .join(" · ");
        return `<article class="agent-card">
      <div class="agent-meta"><strong>cleaner</strong><span>${esc(row.status)}</span>${
          row.payLockOk ? "<b>pay lock ok</b>" : "<span>pay lock</span>"
        }</div>
      <h3>${esc(title)}</h3>
      <p>${esc(row.email || "")}${row.mobile ? ` · ${esc(row.mobile)}` : ""}${
          row.abn ? ` · ABN ${esc(row.abn)}` : ""
        }</p>
      ${rates ? `<p>${esc(rates)}</p>` : ""}
      ${
        missingList(row) || `<p class="agent-clear">No blocking gaps listed.</p>`
      }
      ${statusSelect("cleaner_files", row.id, row.status)}
    </article>`;
      })
      .join("") || `<p class="note">${statusFilter === "ALL" ? "No cleaner files yet. Cleaner applications land here after processing." : "No cleaners in " + statusFilter + "."}</p>`;

  const parties = (Array.isArray(data.parties) ? data.parties : []).filter(matchesFilter);
  partyEl.innerHTML =
    parties
      .map((row) => {
        const title = row.contactName || row.name || row.email || "Unnamed party";
        return `<article class="agent-card">
      <div class="agent-meta"><strong>party</strong>${
          row.lane ? `<span>${esc(row.lane)}</span>` : "<span>no lane</span>"
        }<span>${esc(row.status || "LEAD")}</span></div>
      <h3>${esc(title)}</h3>
      <p>${esc(row.email || "")}</p>
      ${row.note ? `<p>${esc(row.note)}</p>` : ""}
      ${missingList(row)}
      ${statusSelect("parties", row.id, row.status)}
    </article>`;
      })
      .join("") || `<p class="note">${statusFilter === "ALL" ? "No parties yet." : "No parties in " + statusFilter + "."}</p>`;
}

async function loadBoard() {
  const sumEl = document.getElementById("board-summary");
  const answer = document.getElementById("today-answer");
  if (!sumEl) return;
  try {
    const res = await fetch("/api/desk-board", { headers: await deskHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    drawBoard(data);
  } catch {
    sumEl.textContent = "Board database unavailable. Blob pipeline remains available.";
    if (answer && answer.textContent === "Loading desk board…") {
      answer.textContent = "Board unavailable";
    }
  }
}

async function setRowStatus(table, id, status, selectEl) {
  selectEl.disabled = true;
  try {
    const res = await fetch("/api/desk-status", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ table, id, status })
    });
    if (!res.ok) throw new Error(String(res.status));
    await loadBoard();
  } catch {
    selectEl.disabled = false;
    const sumEl = document.getElementById("board-summary");
    if (sumEl) sumEl.textContent = "Status update failed. Check unlock session and try again.";
  }
}

function startBoardRefresh() {
  if (boardTimer) clearInterval(boardTimer);
  boardTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadBoard();
  }, 60000);
}

document.getElementById("board")?.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-status-table]");
  if (!sel) return;
  setRowStatus(sel.dataset.statusTable, sel.dataset.statusId, sel.value, sel);
});

document.querySelector(".board-filters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  statusFilter = btn.dataset.filter;
  document.querySelectorAll(".board-filters [data-filter]").forEach((el) => {
    el.classList.toggle("on", el === btn);
  });
  if (boardData) drawBoard(boardData);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadBoard();
});

document.getElementById("quota-box").addEventListener("click", (e) => {
  const key = e.target.dataset.q;
  if (!key) return;
  const q = readQuota();
  q[key] = (q[key] || 0) + 1;
  saveQuota(q);
  drawQuota();
  pushRemote();
});

document.getElementById("add").addEventListener("submit", (e) => {
  e.preventDefault();
  const rows = readPipe();
  rows.unshift({
    who: who.value.trim().slice(0, 120),
    kind: kind.value,
    stage: stage.value,
    note: note.value.trim().slice(0, 240),
    at: new Date().toISOString()
  });
  writePipe(rows);
  e.target.reset();
  drawPipe();
  pushRemote();
});

list.addEventListener("click", (e) => {
  if (e.target.dataset.i == null) return;
  const rows = readPipe();
  rows.splice(+e.target.dataset.i, 1);
  writePipe(rows);
  drawPipe();
  pushRemote();
});

document.getElementById("logout").addEventListener("click", signOutDesk);

const exp = document.getElementById("desk-export");
if (exp) {
  exp.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ pipe: readPipe(), quota: readQuota() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inner-turn-desk.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

const imp = document.getElementById("desk-import");
if (imp) {
  imp.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.pipe)) writePipe(data.pipe);
      if (data.quota && typeof data.quota === "object") saveQuota(data.quota);
      drawQuota();
      drawPipe();
      pushRemote();
    } catch {
      setSync("Import failed. Need inner-turn-desk.json.");
    }
    e.target.value = "";
  });
}

async function boot() {
  drawQuota();
  drawPipe();
  const remote = await pullRemote();
  if (remote) {
    if (Array.isArray(remote.pipe) && remote.pipe.length >= readPipe().length) writePipe(remote.pipe);
    else if (Array.isArray(remote.pipe) && remote.pipe.length && !readPipe().length) writePipe(remote.pipe);
    if (remote.quota && remote.quota.day === todayKey()) saveQuota(remote.quota);
    drawQuota();
    drawPipe();
    if (readPipe().length && (!remote.pipe || remote.pipe.length < readPipe().length)) pushRemote();
    else setSync("Synced to Netlify Blobs. Survives a new browser.");
  }
}

async function loadIntakes() {
  const mount = document.getElementById("agent-list");
  const status = document.getElementById("agent-status");
  if (!mount || !status) return;
  try {
    const res = await fetch("/api/desk-intakes", { headers: await deskHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const { rows } = await res.json();
    status.textContent = `${rows.length} intake record${rows.length === 1 ? "" : "s"} · newest first`;
    mount.innerHTML = rows.map((row) => `<article class="agent-card">
      <div class="agent-meta"><strong>${esc(row.kind)}</strong><span>${esc(row.status)}</span>${
        row.lane ? `<span>${esc(row.lane)}</span>` : ""
      }${row.executable ? "<b>executable</b>" : ""}<b>${esc(row.priority)}/100</b><span>${esc(row.serviceRegion || "review")}</span></div>
      <h3>${esc(row.contactName || row.email || "Unnamed intake")}</h3>
      <p>${esc(row.suburb || "")}${row.postcode ? ` · ${esc(row.postcode)}` : ""}</p>
      <p>${esc(row.summary || "Awaiting review.")}</p>
      ${row.flags?.length ? `<ul>${row.flags.map((flag) => `<li>${esc(flag)}</li>`).join("")}</ul>` : `<p class="agent-clear">Required fields passed.</p>`}
      ${row.matchReason ? `<p><strong>Coverage match:</strong> ${esc(row.matchReason)}</p>` : ""}
      <details><summary>Review follow-up draft</summary><textarea readonly rows="7">${esc(row.followUpDraft || "")}</textarea><button type="button" data-copy>Copy draft</button></details>
    </article>`).join("") || `<p class="note">No submissions yet. New manager and cleaner forms appear here after processing.</p>`;
  } catch {
    status.textContent = "Intake database unavailable. Existing pipeline remains available.";
  }
}

document.getElementById("agent-list")?.addEventListener("click", async (event) => {
  if (!event.target.matches("[data-copy]")) return;
  const text = event.target.closest("details")?.querySelector("textarea")?.value || "";
  try { await navigator.clipboard.writeText(text); event.target.textContent = "Copied"; } catch { event.target.textContent = "Select and copy"; }
});

boot();
loadBoard();
loadIntakes();
startBoardRefresh();
