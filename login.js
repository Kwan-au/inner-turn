const err = document.getElementById("err");
const ok = document.getElementById("ok");
const idForm = document.getElementById("form");
const lockForm = document.getElementById("lock-form");
const lockBtn = document.getElementById("lock-btn");
const lockHint = document.getElementById("lock-hint");
const phraseInput = document.getElementById("phrase");
const nextWrap = document.getElementById("next-wrap");
const nextInput = document.getElementById("next-phrase");
const wipeBtn = document.getElementById("wipe-btn");
const changeBtn = document.getElementById("change-btn");
const cancelChangeBtn = document.getElementById("cancel-change-btn");
const phraseCaption = document.getElementById("phrase-caption");

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

function clearPhraseFields() {
  phraseInput.value = "";
  if (nextInput) nextInput.value = "";
}

function showLock(set, mode) {
  idForm.hidden = true;
  lockForm.hidden = false;
  const nextMode = mode || (set ? "unlock" : "set");
  lockForm.dataset.mode = nextMode;
  const changing = nextMode === "change";
  nextWrap.hidden = !changing;
  nextInput.required = changing;
  wipeBtn.hidden = nextMode !== "unlock";
  changeBtn.hidden = nextMode !== "unlock";
  cancelChangeBtn.hidden = !changing;
  phraseCaption.textContent = changing ? "Current phrase" : "Unlock phrase";
  if (nextMode === "set") {
    lockHint.textContent = "Identity passed. Set a desk unlock phrase (12+ characters). This is the second system. It is never emailed.";
    lockBtn.textContent = "Set unlock phrase";
  } else if (changing) {
    lockHint.textContent = "Enter the current phrase and a new 12+ character phrase.";
    lockBtn.textContent = "Change phrase";
  } else {
    lockHint.textContent = "Identity passed. Enter the desk unlock phrase — not the mailbox password.";
    lockBtn.textContent = "Unlock desk";
  }
}

async function afterIdentity() {
  try {
    const status = await unlockStatus();
    if (status.unlocked) return goDesk();
    showLock(status.set);
  } catch {
    showLock(true);
  }
}

initIdentity();

if (window.netlifyIdentity) {
  netlifyIdentity.on("init", (user) => {
    if (user && allowedEmail(user.email)) afterIdentity();
  });
  netlifyIdentity.on("login", (user) => {
    if (!allowedEmail(user.email)) {
      netlifyIdentity.logout();
      show(err, "That email is not on the desk allow-list.");
      return;
    }
    afterIdentity();
  });
}

if (new URLSearchParams(location.search).get("setup") === "1") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn secondary";
  b.textContent = "Create desk account";
  idForm.appendChild(b);
  b.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const pass = document.getElementById("pass").value;
    if (!allowedEmail(email)) return show(err, "Not on the allow-list.");
    if (pass.length < 8) return show(err, "Password must be 8+ characters.");
    try {
      await netlifyIdentity.gotrue.signup(email, pass);
      show(ok, "Confirm the mail on " + email + " then sign in.");
    } catch (ex) {
      show(err, ex.message || "Could not create account.");
    }
  });
}

idForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gated()) return;
  const email = document.getElementById("email").value.trim().toLowerCase();
  const pass = document.getElementById("pass").value;
  if (!allowedEmail(email)) return show(err, "Not on the allow-list.");
  show(ok, "Signing in…");
  try {
    await netlifyIdentity.gotrue.login(email, pass, true);
  } catch (ex) {
    show(err, ex.message || "Sign-in failed.");
  }
});

wipeBtn.addEventListener("click", async () => {
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
    clearPhraseFields();
    showLock(false);
    show(ok, "Phrase cleared. Set a new 12+ character unlock phrase.");
  } catch (ex) {
    trip();
    show(err, ex.message || "Could not reset the unlock phrase.");
  }
});

changeBtn.addEventListener("click", () => {
  clearPhraseFields();
  showLock(true, "change");
  show(ok, "");
});

cancelChangeBtn.addEventListener("click", () => {
  clearPhraseFields();
  showLock(true, "unlock");
  show(ok, "");
});

lockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gated()) return;
  const phrase = phraseInput.value;
  const next = nextInput.value;
  const action = lockForm.dataset.mode || "unlock";
  if (phrase.length < 12) return show(err, "Unlock phrase must be 12+ characters.");
  if (action === "change" && next.length < 12) {
    return show(err, "New unlock phrase must be 12+ characters.");
  }
  show(ok, action === "set" ? "Saving phrase…" : action === "change" ? "Changing phrase…" : "Checking unlock…");
  try {
    const payload = action === "change" ? { action, phrase, next } : { action, phrase };
    const res = await fetch("/api/desk-unlock", {
      method: "POST",
      headers: {
        ...(await deskHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      trip();
      const why = data.error === "locked" ? "Too many attempts. Wait 15 minutes." : "Unlock failed.";
      return show(err, why);
    }
    if (data.token) setDeskSession(data.token);
    clearPhraseFields();
    goDesk();
  } catch (ex) {
    trip();
    show(err, ex.message || "Unlock failed.");
  }
});
