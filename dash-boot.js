initIdentity();
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

requireDesk().then((user) => {
  const form = document.getElementById("desk-unlock-form");
  const msg = document.getElementById("desk-lock-msg");
  const resetBtn = document.getElementById("desk-reset");
  const title = document.getElementById("desk-lock-title");
  const copy = document.getElementById("desk-lock-copy");
  const actionBtn = document.getElementById("desk-unlock-btn");
  const wrap2 = document.getElementById("desk-phrase-2-wrap");
  const input2 = document.getElementById("desk-phrase-2");
  if (!form || !user) return;

  let mode = "unlock";

  const paint = (next) => {
    mode = next;
    form.dataset.mode = next;
    if (title) title.textContent = next === "unlock" ? "Desk unlock" : "Set a new desk phrase";
    if (copy) {
      copy.textContent = next === "unlock"
        ? "Identity is signed in. Enter the desk phrase to open the pipeline."
        : "This replaces the current phrase. Type the same 12+ character phrase twice. It is not emailed.";
    }
    if (actionBtn) actionBtn.textContent = next === "unlock" ? "Unlock desk" : "Save new phrase";
    if (wrap2) wrap2.hidden = next === "unlock";
    if (input2) input2.required = next !== "unlock";
    if (resetBtn) resetBtn.textContent = next === "unlock" ? "Forgot phrase — set a new one" : "Use existing phrase";
  };

  resetBtn?.addEventListener("click", () => {
    paint(mode === "unlock" ? "reset" : "unlock");
    if (msg) msg.hidden = true;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const phrase = (document.getElementById("desk-phrase") || {}).value || "";
    if (phrase.length < 12) {
      if (msg) { msg.hidden = false; msg.textContent = "Phrase must be 12+ characters."; }
      return;
    }
    if (mode !== "unlock") {
      const again = (input2 && input2.value) || "";
      if (again !== phrase) {
        if (msg) { msg.hidden = false; msg.textContent = "The two phrases do not match."; }
        return;
      }
    }
    if (msg) {
      msg.hidden = false;
      msg.textContent = mode === "unlock" ? "Checking unlock…" : "Saving new phrase…";
    }
    try {
      const status = await unlockStatus();
      const action = mode === "unlock" ? (status && status.set ? "unlock" : "set") : "reset";
      await submitUnlock(phrase, action);
      location.replace("/dash.html");
    } catch (ex) {
      if (msg) {
        msg.hidden = false;
        const code = ex && ex.code;
        msg.textContent = code === "locked"
          ? "Too many attempts. Wait 15 minutes."
          : code === "denied"
            ? "That phrase does not match. Use “set a new one” if you need to replace it."
            : "Unlock failed.";
      }
    }
  });
});
