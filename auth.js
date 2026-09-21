const ALLOWED = ["desk@innerturn.com.au", "kwan.ajak87@gmail.com"];
const API = "https://innerturn.com.au/.netlify/identity";
const SESSION_KEY = "inner-turn-desk-session";

function allowedEmail(email) {
  return ALLOWED.includes(String(email || "").trim().toLowerCase());
}

function identityUser() {
  try {
    return window.netlifyIdentity ? netlifyIdentity.currentUser() : null;
  } catch {
    return null;
  }
}

function identityReady() {
  return new Promise((resolve) => {
    if (!window.netlifyIdentity) return resolve(null);
    const existing = netlifyIdentity.currentUser();
    if (existing) return resolve(existing);
    netlifyIdentity.on("init", (user) => resolve(user || null));
    setTimeout(() => resolve(netlifyIdentity.currentUser()), 2500);
  });
}

function deskSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function setDeskSession(token) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode can block sessionStorage.
  }
}

async function identityToken() {
  const user = identityUser();
  if (!user) return "";
  try {
    if (typeof user.jwt === "function") return await user.jwt();
  } catch {
    // Fall through to the cached access token.
  }
  return user.token?.access_token || "";
}

async function deskHeaders() {
  const headers = {};
  const identity = await identityToken();
  const lock = deskSession();
  if (identity) headers.Authorization = "Bearer " + identity;
  if (lock) headers["X-Desk-Session"] = lock;
  return headers;
}

async function unlockStatus() {
  const res = await fetch("/api/desk-unlock", { headers: await deskHeaders() });
  if (!res.ok) throw new Error("unlock-status");
  return res.json();
}

function goLogin() {
  location.replace("/login.html");
}

function goDesk() {
  location.replace("/dash.html");
}

async function requireDesk() {
  const root = document.getElementById("desk-root");
  const user = await identityReady();
  if (user && allowedEmail(user.email)) {
    try {
      const status = await unlockStatus();
      if (status.unlocked) {
        if (root) root.hidden = false;
        return user;
      }
    } catch {
      // Fall through to login so the second lock can be set or reset.
    }
    goLogin();
    return null;
  }
  if (user && !allowedEmail(user.email)) {
    setDeskSession("");
    try { netlifyIdentity.logout(); } catch {}
  }
  goLogin();
  return null;
}

function signOutDesk() {
  setDeskSession("");
  if (window.netlifyIdentity && netlifyIdentity.currentUser()) netlifyIdentity.logout();
  goLogin();
}

function initIdentity() {
  if (!window.netlifyIdentity) return;
  netlifyIdentity.init({ APIUrl: API });
}
