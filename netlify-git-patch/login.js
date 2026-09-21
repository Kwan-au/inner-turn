import {
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser
} from "/vendor/netlify-identity.js";
import { allowedEmail, deskHeaders, goDesk, setDeskSession, unlockStatus } from "/auth.js";

const err = document.getElementById("err");
const ok = document.getElementById("ok");
const idForm = document.getElementById("form");
const recoverForm = document.getElementById("recover-form");
const lockForm = document.getElementById("lock-form");
const lockBtn = document.getElementById("lock-btn");
const lockHint = document.getElementById("lock-hint");
const forgotBtn = document.getElementById("forgot-btn");
const wipeBtn = document.getElementById("wipe-btn");
const phraseInput = document.getElementById("phrase");

let fails = 0;
let lockUntil = 0;

function show(el, msg) {
  err.hidden = true;
  ok.hidden = true;
  if (!msg) return;
  el.hidden = false;
  el.textContent = msg;
}

function gated() {
  if (Date.now() < lockUntil) {
    show(err, "Wait a minute, then try again.");
    return true;
  }
  return false;
}

function trip() {
  fails += 1;
  if (fails >= 5) {
    lockUntil = Date.now() + 60 * 1000;
    fails = 0;
  }
}

function showLock(set) {
  idForm.hidden = true;
  recoverForm.hidden = true;
  lockForm.hidden = false;
  lockHint.textContent = set
    ? "Identity passed. Enter the desk unlock phrase — not the mailbox password."
    : "Identity passed. Set a desk unlock phrase (12+ characters). This is the second system. It is not stored in the page.";
  lockBtn.textContent = set ? "Unlock desk" : "Set unlock phrase";
  lockForm.dataset.mode = set ? "unlock" : "set";
  if (wipeBtn) wipeBtn.hidden = !set;
}

function showRecover() {
  idForm.hidden = true;
  lockForm.hidden = true;
  recoverForm.hidden = false;
  show(ok, "Recovery link accepted. Set a new password.");
}

async function afterIdentity() {
  const status = await unlockStatus();
  if (status.unlocked) return goDesk();
  showLock(status.set);
}

try {
  const callback = await handleAuthCallback();
  if (callback && callback.type === "recovery") {
    if (!allowedEmail(callback.user?.email)) {
      await logout().catch(() => {});
      show(err, "That email is not on the desk allow-list.");
    } else {
      showRecover();
    }
  } else {
    const existing = await getUser();
    if (existing && allowedEmail(existing.email)) {
      try {
        await afterIdentity();
      } catch {
        showLock(true);
      }
    }
  }
} catch (ex) {
  show(err, ex.message || "Recovery link failed. Request a new one.");
}

forgotBtn?.addEventListener("click", async () => {
  if (gated()) return;
  const email = document.getElementById("email").value.trim().toLowerCase();
  if (!allowedEmail(email)) {
    trip();
    return show(err, "Not on the allow-list.");
  }
  show(ok, "Sending reset link…");
  try {
    await requestPasswordRecovery(email);
    show(ok, "Reset link sent to " + email + ". Open it within 24 hours.");
  } catch (ex) {
    trip();
    show(err, ex.message || "Could not send reset link.");
  }
});

idForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gated()) return;
  const email = document.getElementById("email").value.trim().toLowerCase();
  const pass = document.getElementById("pass").value;
  if (!allowedEmail(email)) {
    trip();
    return show(err, "Not on the allow-list.");
  }
  if (pass.length < 8) return show(err, "Password too short.");
  show(ok, "Checking Identity…");
  try {
    const user = await login(email, pass);
    if (!allowedEmail(user.email)) {
      await logout();
      trip();
      return show(err, "That email is not on the desk allow-list.");
    }
    fails = 0;
    show(ok, "Email accepted. Second lock next.");
    await afterIdentity();
  } catch (ex) {
    trip();
    show(err, ex.message || "Sign-in failed.");
  }
});

recoverForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gated()) return;
  const p1 = document.getElementById("new-pass").value;
  const p2 = document.getElementById("new-pass2").value;
  if (p1.length < 8) return show(err, "Password too short.");
  if (p1 !== p2) return show(err, "Passwords do not match.");
  show(ok, "Saving new password…");
  try {
    await updateUser({ password: p1 });
    fails = 0;
    show(ok, "Password saved. Unlock the desk next.");
    await afterIdentity();
  } catch (ex) {
    trip();
    show(err, ex.message || "Could not save password.");
  }
});

wipeBtn?.addEventListener("click", async () => {
  if (gated()) return;
  const sure = window.confirm(
    "Reset the unlock phrase? This wipes the stored hash so you can set a new 12+ character phrase. The phrase is never emailed."
  );
  if (!sure) return;
  show(ok, "Clearing unlock phrase…");
  try {
    const res = await fetch("/api/desk-unlock", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "wipe" })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      trip();
      return show(err, "Could not reset the unlock phrase.");
    }
    setDeskSession("");
    if (phraseInput) phraseInput.value = "";
    showLock(false);
    show(ok, "Phrase cleared. Set a new 12+ character unlock phrase.");
  } catch (ex) {
    trip();
    show(err, ex.message || "Could not reset the unlock phrase.");
  }
});

lockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gated()) return;
  const phrase = phraseInput.value;
  if (phrase.length < 12) return show(err, "Unlock phrase must be 12+ characters.");
  const action = lockForm.dataset.mode || "unlock";
  show(ok, action === "set" ? "Saving phrase…" : "Checking unlock…");
  try {
    const res = await fetch("/api/desk-unlock", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, phrase })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      trip();
      const why = data.error === "locked" ? "Too many attempts. Wait 15 minutes." : "Unlock failed.";
      return show(err, why);
    }
    setDeskSession(data.token);
    if (phraseInput) phraseInput.value = "";
    goDesk();
  } catch (ex) {
    trip();
    show(err, ex.message || "Unlock failed.");
  }
});
