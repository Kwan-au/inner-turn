document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".nav nav");
  if (menu) {
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

});
