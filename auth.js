// Desk client helpers. Access rules (allow-list, rate limits, session) are enforced on the
// server; this file only carries the Identity token and lets the browser send the HttpOnly
// desk cookie. The cookie cannot be read from script.
const API = "https://www.innerturn.com.au/.netlify/identity";
const DESK_STORAGE = ["inner-turn-pipeline", "inner-turn-quota"];

// Tokens from an older build lived in sessionStorage; they are no longer accepted.
try { sessionStorage.removeItem("inner-turn-desk-session"); } catch {}

let signedInUser = null;

function setSignedInUser(user) {
  signedInUser = user || null;
}

function identityUser() {
  if (signedInUser) return signedInUser;
  try {
    return window.netlifyIdentity ? netlifyIdentity.currentUser() : null;
  } catch {
    return null;
  }
}

// user.jwt() refreshes an expired access token.
async function identityToken() {
  const user = identityUser();
  if (!user) return "";
  try {
    if (typeof user.jwt === "function") return await user.jwt();
  } catch {}
  return user.token?.access_token || "";
}

function identityReady() {
  return new Promise((resolve) => {
    if (!window.netlifyIdentity) return resolve(null);
    const existing = identityUser();
    if (existing) return resolve(existing);
    netlifyIdentity.on("init", (user) => resolve(user || null));
    setTimeout(() => resolve(identityUser()), 2500);
  });
}

function goLogin() {
  location.replace("/login.html");
}

function goDesk() {
  location.replace("/dash.html");
}

async function deskHeaders() {
  const headers = {};
  const id = await identityToken();
  if (id) headers.Authorization = "Bearer " + id;
  return headers;
}

async function deskFetch(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(await deskHeaders()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || "request failed");
    err.code = data.error || String(res.status);
    err.status = res.status;
    err.retryAfter = data.retryAfter;
    throw err;
  }
  return data;
}

function unlockStatus() {
  return deskFetch("/api/desk-unlock");
}

function submitUnlock(body) {
  return deskFetch("/api/desk-unlock", { method: "POST", body });
}

function clearDeskStorage() {
  for (const k of DESK_STORAGE) {
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.removeItem(k); } catch {}
  }
}

async function deskSignOut() {
  try {
    await deskFetch("/api/desk-session", { method: "POST", body: { action: "signout" } });
  } catch {}
  clearDeskStorage();
  setSignedInUser(null);
  try { if (window.netlifyIdentity) await netlifyIdentity.logout(); } catch {}
  goLogin();
}

// Resolves to the user when both locks are open; otherwise sends the browser to /login.html.
async function requireDesk() {
  const root = document.getElementById("desk-root");
  const user = await identityReady();
  if (!user) {
    goLogin();
    return null;
  }
  try {
    const status = await unlockStatus();
    if (!status.unlocked) {
      goLogin();
      return null;
    }
  } catch (err) {
    if (err.code === "forbidden") return deskSignOut().then(() => null);
    goLogin();
    return null;
  }
  if (root) root.hidden = false;
  return user;
}

function hideIdentityWidget() {
  try {
    if (window.netlifyIdentity) netlifyIdentity.close();
  } catch {}
  document.documentElement.classList.add("desk-id-hidden");
}

function initIdentity() {
  if (!window.netlifyIdentity) return;
  netlifyIdentity.init({ APIUrl: API, logo: false });
  hideIdentityWidget();
  netlifyIdentity.on("open", hideIdentityWidget);
  netlifyIdentity.on("login", hideIdentityWidget);
  netlifyIdentity.on("close", hideIdentityWidget);
}

const DESK_ERRORS = {
  pause: "Too many failed attempts. Wait a minute, then try again.",
  locked: "Too many failed unlocks. The desk is locked for 15 minutes.",
  hard: "Locked after 20 failed attempts in 24 hours. The desk owner has been emailed and must clear the lock in Netlify.",
  denied: "Sign-in failed.",
  forbidden: "That account is not allowed on the desk.",
  "bad code": "That code is wrong, used or expired. Check the newest email, or send a new code.",
  current: "The current phrase or reset code does not match.",
  proof: "Enter the current phrase or the emailed reset code.",
  short: "New phrase must be 16+ characters.",
  "already set": "A phrase is already set. Use “Forgot or change phrase”.",
  "not set": "No phrase is set yet.",
  wait: "A reset code was sent less than 2 minutes ago. Check desk@innerturn.com.au.",
  mail: "The code could not be emailed. Use the unlock phrase instead.",
  config: "The desk server is not configured yet (DESK_ALLOWED_EMAILS / DESK_SESSION_SECRET).",
  identity: "Identity sign-in expired. Sign in again.",
  unlock: "Desk session ended. Unlock again.",
  upstream: "Identity is not answering. Try again shortly."
};

function deskError(err) {
  return DESK_ERRORS[err && err.code] || "Could not reach the desk. Check the network and try once more.";
}
