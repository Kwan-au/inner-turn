document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(".menu");
  if (menu) menu.addEventListener("click", () => document.body.classList.toggle("nav-open"));

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
});
