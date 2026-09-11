function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

const PIPE = "inner-turn-pipeline";
const QUOTA = "inner-turn-quota";
const list = document.getElementById("list");

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function readPipe() {
  try { return JSON.parse(localStorage.getItem(PIPE) || "[]"); } catch { return []; }
}
function readQuota() {
  const raw = JSON.parse(localStorage.getItem(QUOTA) || "{}");
  if (raw.day !== todayKey()) return { day: todayKey(), email: 0, li: 0, walk: 0 };
  return raw;
}
function saveQuota(q) {
  localStorage.setItem(QUOTA, JSON.stringify(q));
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

document.getElementById("quota-box").addEventListener("click", (e) => {
  const key = e.target.dataset.q;
  if (!key) return;
  const q = readQuota();
  q[key] = (q[key] || 0) + 1;
  saveQuota(q);
  drawQuota();
});

function drawPipe() {
  const rows = readPipe();
  list.innerHTML = rows.map((r, i) =>
    `<li><strong>${esc(r.kind)}</strong> · ${esc(r.stage || "LEAD")} · ${esc(r.who)}<br><span>${esc(r.note || "")}</span><button type="button" data-i="${i}">x</button></li>`
  ).join("") || "<li>Empty. Log the first reply.</li>";
}

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
  localStorage.setItem(PIPE, JSON.stringify(rows));
  e.target.reset();
  drawPipe();
});

list.addEventListener("click", (e) => {
  if (e.target.dataset.i == null) return;
  const rows = readPipe();
  rows.splice(+e.target.dataset.i, 1);
  localStorage.setItem(PIPE, JSON.stringify(rows));
  drawPipe();
});

document.getElementById("logout").addEventListener("click", () => {
  if (window.netlifyIdentity && netlifyIdentity.currentUser()) netlifyIdentity.logout();
  location.replace("/login.html");
});

drawQuota();
drawPipe();
