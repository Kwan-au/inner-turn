const ALLOWED = ["desk@innerturn.com.au", "kwan.ajak87@gmail.com"];
const API = "https://innerturn.com.au/.netlify/identity";

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
    if (root) root.hidden = false;
    return user;
  }
  if (user && !allowedEmail(user.email)) {
    try { netlifyIdentity.logout(); } catch {}
  }
  goLogin();
  return null;
}

function initIdentity() {
  if (!window.netlifyIdentity) return;
  netlifyIdentity.init({ APIUrl: API });
}
