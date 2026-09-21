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
const searchEl = document.getElementById("pipe-search");
const mergeEl = document.getElementById("pipe-merge");

let filter = "ALL";
let boardData = null;
let statusFilter = "ALL";
let boardTimer = 0;

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function readPipe() {
  try {
    return JSON.parse(localStorage.getItem(PIPE) || "[]");
  } catch {
    return [];
  }
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

function token() {
  try {
    return window.netlifyIdentity?.currentUser()?.token?.access_token || "";
  } catch {
    return "";
  }
}

function rowKey(r) {
  return String(r.email || r.who || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim() + "|" + (r.kind || "manager");
}

function mergeRows(existing, incoming) {
  const map = new Map();
  for (const r of existing) map.set(rowKey(r), r);
  for (const r of incoming) {
    const k = rowKey(r);
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, ...r, note: r.note || prev.note, at: r.at || prev.at } : r);
  }
  return [...map.values()].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 200);
}

async function pullRemote() {
  const t = token();
  if (!t) {
    setSync("Local only — sign-in token missing. Export JSON before you change machines.");
    return null;
  }
  try {
    const res = await fetch("/api/desk-state", { headers: await deskHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.state || null;
  } catch {
    setSync("Blob unreachable. Working from this browser. Export before the second live door.");
    return null;
  }
}

async function pushRemote(merge) {
  const t = token();
  if (!t) return;
  try {
    const res = await fetch("/api/desk-state", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pipe: readPipe(),
        quota: readQuota(),
        merge: merge !== false
      })
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
  const box = document.getElementById("quota-box");
  if (!box) return;
  box.innerHTML = items
    .map((it) => {
      const n = q[it.key] || 0;
      return `<div class="q-card"><span>${esc(it.label)}</span><strong>${n} / ${it.cap}</strong><button type="button" data-q="${it.key}">+1</button></div>`;
    })
    .join("");
}

function drawBench() {
  const el = document.getElementById("bench-count");
  const board = document.getElementById("pipe-board");
  const rows = readPipe();
  const file = rows.filter((r) => r.kind === "cleaner" && (r.stage === "FILE" || r.stage === "LIVE")).length;
  const live = rows.filter((r) => r.kind === "manager" && r.stage === "LIVE").length;
  const lead = rows.filter((r) => r.stage === "LEAD").length;
  const hold = rows.filter((r) => r.stage === "HOLD").length;
  if (el) {
    el.textContent = file
      ? file + " cleaner(s) on FILE/LIVE · " + live + " manager book(s) LIVE · " + lead + " LEAD"
      : "Cleaner file empty on this board. No dispatch until ABN + CoC + written 1/2/3 rate.";
  }
  if (board) {
    board.innerHTML = [
      ["LIVE", live],
      ["FILE", file],
      ["LEAD", lead],
      ["HOLD", hold],
      ["ALL", rows.length]
    ]
      .map(([k, n]) => `<button type="button" class="chip${filter === k ? " on" : ""}" data-filter="${k}">${k} ${n}</button>`)
      .join("");
  }
}

function drawPipe() {
  if (!list) return;
  const rows = readPipe();
  const q = (searchEl && searchEl.value ? searchEl.value : "").toLowerCase().trim();
  const shown = rows.filter((r) => {
    if (filter === "FILE") return r.kind === "cleaner" && (r.stage === "FILE" || r.stage === "LIVE");
    if (filter === "LIVE") return r.kind === "manager" && r.stage === "LIVE";
    if (filter !== "ALL" && r.stage !== filter) return false;
    if (!q) return true;
    return (r.who + " " + (r.note || "") + " " + (r.email || "")).toLowerCase().includes(q);
  });
  list.innerHTML =
    shown
      .map((r) => {
        const i = rows.indexOf(r);
        return `<li data-i="${i}" class="pipe-row stage-${esc(r.stage || "LEAD")}">
          <div class="pipe-meta">
            <strong>${esc(r.kind)}</strong>
            <select data-stage="${i}" aria-label="Stage">
              ${STATUSES.map((s) => `<option${(r.stage || "LEAD") === s ? " selected" : ""}>${s}</option>`).join("")}
            </select>
            <span>${esc(r.who)}</span>
          </div>
          <span class="pipe-note">${esc(r.note || "")}</span>
          <button type="button" data-i="${i}" class="pipe-x" aria-label="Remove">x</button>
        </li>`;
      })
      .join("") || "<li class='pipe-empty'>No rows in this filter. Log a reply or Import JSON.</li>";
  drawBench();
}

function statusChip(status) {
  const s = String(status || "LEAD").toUpperCase();
  const cls = {
    LEAD: "chip-lead",
    FILE: "chip-file",
    LIVE: "chip-live",
    HOLD: "chip-hold",
    DEAD: "chip-dead"
  }[s] || "chip-lead";
  return `<span class="${cls}">${esc(s)}</span>`;
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
      <div class="agent-meta"><strong>lot pack</strong>${statusChip(row.status)}${
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
      <div class="agent-meta"><strong>cleaner</strong>${statusChip(row.status)}${
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
        }${statusChip(row.status || "LEAD")}</div>
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

document.getElementById("quota-box")?.addEventListener("click", (e) => {
  const key = e.target.dataset.q;
  if (!key) return;
  const q = readQuota();
  q[key] = (q[key] || 0) + 1;
  saveQuota(q);
  drawQuota();
  pushRemote(true);
});

const pipeBoard = document.getElementById("pipe-board");
if (pipeBoard) {
  pipeBoard.addEventListener("click", (e) => {
    const f = e.target.dataset.filter;
    if (!f) return;
    filter = f;
    drawPipe();
  });
}
if (searchEl) searchEl.addEventListener("input", drawPipe);

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

document.getElementById("add")?.addEventListener("submit", (e) => {
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
  pushRemote(true);
});

if (list) {
  list.addEventListener("click", (e) => {
    if (e.target.dataset.i == null || e.target.tagName !== "BUTTON") return;
    if (!confirm("Remove this row from the board?")) return;
    const rows = readPipe();
    rows.splice(+e.target.dataset.i, 1);
    writePipe(rows);
    drawPipe();
    pushRemote(true);
  });

  list.addEventListener("change", (e) => {
    const i = e.target.dataset.stage;
    if (i == null) return;
    const rows = readPipe();
    if (!rows[+i]) return;
    rows[+i].stage = e.target.value;
    rows[+i].at = new Date().toISOString();
    writePipe(rows);
    drawPipe();
    pushRemote(true);
  });
}

document.getElementById("logout")?.addEventListener("click", () => {
  setDeskSession("");
  if (window.netlifyIdentity && netlifyIdentity.currentUser()) netlifyIdentity.logout();
  location.replace("/login.html");
});

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
      if (Array.isArray(data.pipe)) {
        const merge = !mergeEl || mergeEl.checked;
        writePipe(merge ? mergeRows(readPipe(), data.pipe) : data.pipe);
      }
      if (data.quota && typeof data.quota === "object") saveQuota(data.quota);
      drawQuota();
      drawPipe();
      pushRemote(true);
      setSync("Imported " + readPipe().length + " rows. Synced if unlock is live.");
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
    if (Array.isArray(remote.pipe) && remote.pipe.length) {
      writePipe(mergeRows(readPipe(), remote.pipe));
    }
    if (remote.quota && remote.quota.day === todayKey()) saveQuota(remote.quota);
    drawQuota();
    drawPipe();
    if (readPipe().length) pushRemote(true);
    else setSync("Synced to Netlify Blobs. Board empty.");
  }
  await loadBoard();
  startBoardRefresh();
}

boot();
