function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

// Working copy for this tab only; Blobs is the record. Older builds kept it in localStorage.
const PIPE = "inner-turn-pipeline";
let drafts = {};
const QUOTA = "inner-turn-quota";
const list = document.getElementById("list");
const syncEl = document.getElementById("desk-sync");
const filterEl = document.getElementById("pipe-filter");
const searchEl = document.getElementById("pipe-search");
const mergeEl = document.getElementById("pipe-merge");

let filter = "ALL";

try {
  localStorage.removeItem(PIPE);
  localStorage.removeItem(QUOTA);
} catch {}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function readPipe() {
  try {
    return JSON.parse(sessionStorage.getItem(PIPE) || "[]");
  } catch {
    return [];
  }
}
function writePipe(rows) {
  sessionStorage.setItem(PIPE, JSON.stringify(rows));
}
function readQuota() {
  const raw = JSON.parse(sessionStorage.getItem(QUOTA) || "{}");
  if (raw.day !== todayKey()) return { day: todayKey(), email: 0, li: 0, walk: 0 };
  return raw;
}
function saveQuota(q) {
  sessionStorage.setItem(QUOTA, JSON.stringify(q));
}

function setSync(text) {
  if (syncEl) syncEl.textContent = text;
}

function token() {
  return identityUser() ? "signed-in" : "";
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
    if (data.drafts && typeof data.drafts === "object") drafts = data.drafts;
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
  document.getElementById("quota-box").innerHTML = items
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

function draftHtml(r) {
  const d = r.formId && drafts[r.formId];
  if (!d) return "";
  const href = r.email
    ? `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(d.subject || "")}&body=${encodeURIComponent(d.reply || "")}`
    : "";
  return `<details class="pipe-draft prio-${esc(d.priority || "normal")}">
    <summary>Agent draft · ${esc(d.priority || "normal")} · ${esc(d.summary || "")}</summary>
    ${d.flags && d.flags.length ? `<ul>${d.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    <p class="pipe-draft-subj">Subject: ${esc(d.subject || "")}</p>
    <pre>${esc(d.reply || "")}</pre>
    ${href ? `<a href="${esc(href)}">Open reply to ${esc(r.email)}</a>` : "<span>No email on the form. Reply by phone.</span>"}
    <span class="pipe-draft-meta">${d.emailed ? "Also emailed to desk@" : "Not emailed (email sending off)"}</span>
  </details>`;
}

function drawPipe() {
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
              ${["LEAD", "FILE", "LIVE", "HOLD", "DEAD"].map((s) => `<option${(r.stage || "LEAD") === s ? " selected" : ""}>${s}</option>`).join("")}
            </select>
            <span>${esc(r.who)}</span>
          </div>
          <span class="pipe-note">${esc(r.note || "")}</span>
          ${draftHtml(r)}
          <button type="button" data-i="${i}" class="pipe-x" aria-label="Remove">x</button>
        </li>`;
      })
      .join("") || "<li class='pipe-empty'>No rows in this filter. Log a reply or Import JSON.</li>";
  drawBench();
}

document.getElementById("quota-box").addEventListener("click", (e) => {
  const key = e.target.dataset.q;
  if (!key) return;
  const q = readQuota();
  q[key] = (q[key] || 0) + 1;
  saveQuota(q);
  drawQuota();
  pushRemote(true);
});

const board = document.getElementById("pipe-board");
if (board) {
  board.addEventListener("click", (e) => {
    const f = e.target.dataset.filter;
    if (!f) return;
    filter = f;
    drawPipe();
  });
}
if (searchEl) searchEl.addEventListener("input", drawPipe);

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
  pushRemote(true);
});

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

document.getElementById("logout").addEventListener("click", deskSignOut);

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
}

window.deskReady.then((ok) => ok && boot());
