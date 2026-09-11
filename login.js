const err = document.getElementById("err");
const ok = document.getElementById("ok");

function show(el, msg) {
  err.hidden = true;
  ok.hidden = true;
  if (!msg) return;
  el.hidden = false;
  el.textContent = msg;
}

initIdentity();

if (window.netlifyIdentity) {
  netlifyIdentity.on("init", (user) => {
    if (user && allowedEmail(user.email)) goDesk();
  });
  netlifyIdentity.on("login", (user) => {
    if (!allowedEmail(user.email)) {
      netlifyIdentity.logout();
      show(err, "That email is not on the desk allow-list.");
      return;
    }
    goDesk();
  });
}

if (new URLSearchParams(location.search).get("setup") === "1") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn secondary";
  b.textContent = "Create desk account";
  document.getElementById("form").appendChild(b);
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

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
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
