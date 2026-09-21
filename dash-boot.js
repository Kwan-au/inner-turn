initIdentity();

function startDesk() {
  requireDesk();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDesk);
} else {
  startDesk();
}
