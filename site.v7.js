document.addEventListener("DOMContentLoaded", () => {
  const ownedByPublic = !!document.querySelector('script[src*="inner-turn.js"]');
  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".nav nav, header nav");
  if (menu && !ownedByPublic) {
    const setOpen = (open) => {
      document.body.classList.toggle("nav-open", open);
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    };
    menu.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));
    if (nav) {
      nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  const started = String(Date.now());
  document.querySelectorAll("form[data-netlify]").forEach((form) => {
    let field = form.querySelector('input[name="started"]');
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = "started";
      form.appendChild(field);
    }
    field.value = started;
    form.addEventListener("submit", (e) => {
      const block = form.closest(".form-block");
      if (block) block.classList.add("tried");
      if (!form.checkValidity()) {
        e.preventDefault();
        const bad = form.querySelector(":invalid");
        if (bad) bad.focus();
        return;
      }
      if (Date.now() - Number(started) < 1200) e.preventDefault();
    });
  });

  const mapBox = document.getElementById("area-map");
  if (mapBox && mapBox.dataset.map) {
    const mount = () => {
      if (mapBox.querySelector("iframe")) return;
      const frame = document.createElement("iframe");
      frame.src = mapBox.dataset.map;
      frame.title = mapBox.dataset.label || "Inner Turn inner ring";
      frame.loading = "eager";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      frame.allow = "fullscreen";
      const fallback = mapBox.querySelector(".map-fallback");
      if (fallback) fallback.remove();
      mapBox.prepend(frame);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          mount();
          io.disconnect();
        }
      }, { rootMargin: "280px 0px" });
      io.observe(mapBox);
    } else {
      mount();
    }
  }

  if (/from=cleaners/.test(location.search)) {
    const lead = document.getElementById("thanks-lead");
    const file = document.getElementById("thanks-file");
    if (lead) lead.hidden = true;
    if (file) file.hidden = false;
  }

  function validABN(value) {
    const d = String(value || "").replace(/\D/g, "").split("").map(Number);
    if (d.length !== 11) return false;
    const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    d[0] -= 1;
    return d.reduce((sum, n, i) => sum + n * w[i], 0) % 89 === 0;
  }
  document.querySelectorAll('form[name="cleaner-file"] input[name="abn"]').forEach((input) => {
    input.addEventListener("blur", () => {
      if (!input.value.trim()) { input.setCustomValidity(""); return; }
      input.setCustomValidity(validABN(input.value) ? "" : "ABN must be an 11-digit Australian Business Number");
    });
  });
});
