const err = document.getElementById("err");
const ok = document.getElementById("ok");
const idForm = document.getElementById("form");
const lockForm = document.getElementById("lock-form");
const lockBtn = document.getElementById("lock-btn");
const lockHint = document.getElementById("lock-hint");
const statusEl = document.getElementById("status");
const signoutBtn = document.getElementById("signout");
const modeBtn = document.getElementById("mode-btn");
const currentWrap = document.getElementById("current-wrap");
const codeWrap = document.getElementById("code-wrap");
const phrase2Wrap = document.getElementById("phrase2-wrap");
const phraseLabel = document.getElementById("phrase-label");
const sendCodeBtn = document.getElementById("send-code");
const codeForm = document.getElementById("code-form");
const codeHint = document.getElementById("code-hint");
const codeInput = document.getElementById("login-code");
const codeStatus = document.getElementById("code-status");
const resendBtn = document.getElementById("resend-code");
const usePhraseBtn = document.getElementById("use-phrase");
const useCodeBtn = document.getElementById("use-code");

const MIN_NEW = 16;
const wantReset = new URLSearchParams(location.search).get("reset") === "1";
let phraseSet = true;

function show(el, msg) {
  err.hidden = true;
  ok.hidden = true;
  if (!msg) return;
  el.hidden = false;
  el.textContent = msg;
}

function setStatus(locked) {
  for (const el of [statusEl, codeStatus]) {
    if (!el) continue;
    el.textContent = locked ? "Locked" : "Unlocked";
    el.className = "status " + (locked ? "locked" : "ok");
  }
}

// unlock: existing phrase · set: first phrase twice · reset: current phrase or emailed code, new phrase twice
const MODES = {
  unlock: ["Identity passed. Enter the desk unlock phrase — not the mailbox password.", "Desk unlock phrase", "Unlock existing desk", "Forgot or change phrase"],
  set: ["Identity passed. No phrase is set yet. Choose one (16+ characters) and type it twice. It is stored only as a slow salted hash.", "New unlock phrase", "Set unlock phrase", ""],
  reset: ["Change the phrase: enter the current phrase, or a reset code emailed to desk@innerturn.com.au, then the new phrase (16+ characters) twice. All other sessions are signed out.", "New unlock phrase", "Save new phrase and open desk", "Back to unlock"]
};

let mailOn = true;

function phraseMode() {
  return phraseSet ? "unlock" : "set";
}

// Default second lock: a one-time code emailed to the desk inbox.
function showCode() {
  idForm.hidden = true;
  lockForm.hidden = true;
  codeForm.hidden = false;
  if (signoutBtn) signoutBtn.hidden = false;
  usePhraseBtn.textContent = phraseSet ? "Use the unlock phrase instead" : "Set a backup unlock phrase";
  setStatus(true);
  sendLoginCode();
}

async function sendLoginCode() {
  resendBtn.disabled = true;
  codeHint.textContent = "Sending a 6-digit sign-in code to desk@innerturn.com.au…";
  try {
    const data = await submitUnlock({ action: "send-code" });
    codeHint.textContent = data.recent
      ? "A code was sent to " + data.sentTo + " less than a minute ago. Use the newest email; it expires 10 minutes after sending."
      : "Code sent to " + data.sentTo + ". Enter it below. It expires in 10 minutes and works once.";
    codeInput.focus();
  } catch (ex) {
    codeHint.textContent = "No code was sent.";
    show(err, deskError(ex));
    if (ex.code === "mail") return showLock(phraseMode());
  }
  setTimeout(() => { resendBtn.disabled = false; }, 30000);
}

function showLock(mode) {
  idForm.hidden = true;
  codeForm.hidden = true;
  lockForm.hidden = false;
  useCodeBtn.hidden = !mailOn || mode === "reset";
  if (signoutBtn) signoutBtn.hidden = false;
  const [hint, label, btn, toggle] = MODES[mode];
  lockForm.dataset.mode = mode;
  lockHint.textContent = hint;
  phraseLabel.textContent = label;
  lockBtn.textContent = btn;
  currentWrap.hidden = mode !== "reset";
  codeWrap.hidden = mode !== "reset";
  phrase2Wrap.hidden = mode === "unlock";
  document.getElementById("phrase").setAttribute("autocomplete", mode === "unlock" ? "off" : "new-password");
  modeBtn.hidden = !toggle;
  modeBtn.textContent = toggle;
  setStatus(true);
}

async function afterIdentity() {
  try {
    const status = await unlockStatus();
    phraseSet = Boolean(status.set);
    mailOn = status.mail !== false;
    if (status.unlocked && !wantReset) return goDesk();
    if (status.blocked) {
      showLock(phraseMode());
      return show(err, deskError({ code: status.blocked }));
    }
    if (wantReset && phraseSet) return showLock("reset");
    if (mailOn) return showCode();
    showLock(phraseMode());
  } catch (ex) {
    if (ex.code === "forbidden") {
      try { netlifyIdentity.logout(); } catch {}
      setSignedInUser(null);
      return show(err, deskError(ex));
    }
    if (ex.code === "identity") return show(err, deskError(ex));
    show(err, deskError(ex));
    showLock(phraseMode());
  }
}

document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.for);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "Show" : "Hide";
  });
});

initIdentity();
hideIdentityWidget();

if (window.netlifyIdentity) {
  netlifyIdentity.on("init", (user) => {
    if (user) afterIdentity();
  });
  // Only external-provider (Google) sign-ins arrive here; password sign-in uses /api/desk-signin.
  netlifyIdentity.on("login", async (user) => {
    if (signedInUser) return;
    setSignedInUser(user);
    try {
      await deskFetch("/api/desk-signin", { method: "POST", body: { action: "oauth" } });
    } catch (ex) {
      try { netlifyIdentity.logout(); } catch {}
      setSignedInUser(null);
      return show(err, deskError(ex));
    }
    show(ok, "Password accepted. Check desk@innerturn.com.au for the sign-in code.");
    afterIdentity();
  });
}

idForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const pass = document.getElementById("pass").value;
  if (pass.length < 12) return show(err, "Password must be 12+ characters.");
  show(ok, "Checking Identity…");
  try {
    const data = await deskFetch("/api/desk-signin", { method: "POST", body: { email, password: pass } });
    const user = await netlifyIdentity.gotrue.createUser(data.tokens, true);
    setSignedInUser(user);
    document.getElementById("pass").value = "";
    show(ok, "Password accepted. Check desk@innerturn.com.au for the sign-in code.");
    afterIdentity();
  } catch (ex) {
    show(err, deskError(ex));
  }
});

codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.replace(/\D/g, "");
  if (code.length !== 6) return show(err, "Enter the 6-digit code from the email.");
  show(ok, "Checking code…");
  try {
    await submitUnlock({ action: "code", code });
    codeForm.reset();
    setStatus(false);
    goDesk();
  } catch (ex) {
    setStatus(true);
    codeInput.select();
    show(err, deskError(ex));
  }
});

resendBtn.addEventListener("click", () => {
  show(err, "");
  sendLoginCode();
});

usePhraseBtn.addEventListener("click", () => {
  show(err, "");
  showLock(phraseMode());
});

useCodeBtn.addEventListener("click", () => {
  show(err, "");
  showCode();
});

modeBtn.addEventListener("click", () => {
  show(err, "");
  showLock(lockForm.dataset.mode === "reset" ? "unlock" : "reset");
});

sendCodeBtn.addEventListener("click", async () => {
  sendCodeBtn.disabled = true;
  try {
    const data = await submitUnlock({ action: "reset-code" });
    show(ok, "Reset code sent to " + data.sentTo + ". It expires in 15 minutes.");
  } catch (ex) {
    show(err, deskError(ex));
  }
  setTimeout(() => { sendCodeBtn.disabled = false; }, 5000);
});

lockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = lockForm.dataset.mode || "unlock";
  const phrase = document.getElementById("phrase").value;
  if (!phrase) return show(err, "Enter the phrase.");
  const body = { action: mode, phrase };
  if (mode !== "unlock") {
    if (phrase.length < MIN_NEW) return show(err, "New phrase must be 16+ characters.");
    if (document.getElementById("phrase2").value !== phrase) return show(err, "The two new phrases do not match.");
  }
  if (mode === "reset") {
    body.current = document.getElementById("current").value;
    body.code = document.getElementById("code").value;
    if (!body.current && !body.code) return show(err, deskError({ code: "proof" }));
  }
  show(ok, mode === "unlock" ? "Checking unlock…" : "Saving phrase…");
  try {
    await submitUnlock(body);
    lockForm.reset();
    setStatus(false);
    goDesk();
  } catch (ex) {
    setStatus(true);
    show(err, ex.code === "denied" ? "That phrase does not match." : deskError(ex));
  }
});

if (signoutBtn) signoutBtn.addEventListener("click", deskSignOut);
