// The Identity widget mounts into <body>; this file loads in <head>.
if (document.body) initIdentity();
else document.addEventListener("DOMContentLoaded", initIdentity, { once: true });
hideIdentityWidget();

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector(".menu");
  const nav = document.querySelector("header nav#site-nav");
  if (btn && nav) {
    const setOpen = (on) => {
      document.body.classList.toggle("nav-open", on);
      btn.setAttribute("aria-expanded", String(on));
    };
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setOpen(!document.body.classList.contains("nav-open"));
    });
    nav.querySelectorAll("a,button").forEach((el) => el.addEventListener("click", () => setOpen(false)));
  }
});

// Everything on the desk waits for this. Both locks are checked by the server; the page holds
// no desk data until these authenticated calls answer.
const domReady = new Promise((r) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", r, { once: true }) : r()));
window.deskReady = domReady.then(requireDesk).then((user) => Boolean(user));

function auditCell(text) {
  const td = document.createElement("td");
  td.textContent = text || "";
  return td;
}

function shortDevice(ua) {
  const s = String(ua || "");
  const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : /curl/i.test(s) ? "curl" : "";
  return [br, os].filter(Boolean).join(" · ") || s.slice(0, 40);
}

async function loadAudit() {
  const rows = document.getElementById("audit-rows");
  const msg = document.getElementById("audit-msg");
  if (!rows) return;
  try {
    const data = await deskFetch("/api/desk-session");
    rows.replaceChildren(
      ...data.entries.map((e) => {
        const tr = document.createElement("tr");
        const when = new Date(e.at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "short", timeStyle: "short" });
        const dev = auditCell(shortDevice(e.ua));
        dev.title = e.ua || "";
        tr.append(auditCell(when), auditCell(e.event), auditCell(e.email), auditCell(e.ip), dev, auditCell([e.result, e.detail].filter(Boolean).join(" · ")));
        return tr;
      })
    );
    if (msg) msg.textContent = data.entries.length ? "Session ends " + new Date(data.session.exp).toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", timeStyle: "short" }) + " or after 30 minutes idle." : "No entries yet.";
  } catch (err) {
    if (err.code === "unlock" || err.code === "identity") return goLogin();
    if (msg) msg.textContent = "Could not load the access log.";
  }
}

window.deskReady.then(async (ok) => {
  if (!ok) return;
  try {
    const view = await deskFetch("/api/desk-view");
    // Static desk copy from the server, no user data in it.
    const brief = document.getElementById("desk-brief");
    const contact = document.getElementById("desk-contact");
    if (brief) brief.innerHTML = view.brief;
    if (contact) contact.innerHTML = view.contact;
  } catch (err) {
    if (err.code === "unlock" || err.code === "identity") return goLogin();
  }
  loadAudit();

  const lockNow = document.getElementById("lock-now");
  lockNow?.addEventListener("click", async () => {
    if (!confirm("Sign out every desk session on every device now? You will need a new emailed sign-in code to get back in.")) return;
    lockNow.disabled = true;
    try {
      await deskFetch("/api/desk-session", { method: "POST", body: { action: "revoke-all" } });
    } catch {}
    deskSignOut();
  });
});
