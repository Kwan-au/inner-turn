(() => {
  "use strict";
  const form = document.querySelector('form[name="events-enquiry"]');
  if (!form) return;
  const done = document.getElementById("events-done");
  const messages = {
    event: "Name the event.",
    dates: "Add the dates you need covered.",
    suburb: "Add the suburb.",
    beds: "Choose how many bedrooms.",
    contact: "Add an email or a phone number."
  };

  function errEl(input) {
    return document.getElementById(input.id + "-err");
  }

  function setError(input, message) {
    const err = errEl(input);
    input.setAttribute("aria-invalid", "true");
    if (err) {
      err.hidden = false;
      err.textContent = message;
    }
  }

  function clearError(input) {
    const err = errEl(input);
    input.removeAttribute("aria-invalid");
    if (err) err.hidden = true;
  }

  function contactOk(value) {
    if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  function checkField(input) {
    const value = (input.value || "").trim();
    if (!value) {
      setError(input, messages[input.name] || "This is needed.");
      return false;
    }
    if (input.name === "contact" && !contactOk(value)) {
      setError(input, "Use an email like you@agency.com.au, or a phone number like 0412 345 678.");
      return false;
    }
    clearError(input);
    return true;
  }

  function validate() {
    let first = null;
    let ok = true;
    ["event", "dates", "suburb", "beds", "contact"].forEach((name) => {
      const input = form.elements[name];
      if (!checkField(input)) {
        ok = false;
        first = first || input;
      }
    });
    if (first) first.focus();
    return ok;
  }

  form.querySelectorAll("input, select").forEach((input) => {
    if (!input.name || input.name === "bot-field" || input.name === "form-name") return;
    input.addEventListener("blur", () => {
      if (form.dataset.tried) checkField(input);
    });
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid")) checkField(input);
    });
    input.addEventListener("change", () => {
      if (input.getAttribute("aria-invalid")) checkField(input);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    form.dataset.tried = "1";
    if (!validate()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const body = new URLSearchParams(new FormData(form)).toString();
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      if (!res.ok) throw new Error(String(res.status));
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch (_) {
      button.disabled = false;
      button.textContent = "Send enquiry";
      const contact = form.elements.contact;
      setError(contact, "That didn’t send. Try again, or email desk@innerturn.com.au.");
    }
  }, true);
})();
