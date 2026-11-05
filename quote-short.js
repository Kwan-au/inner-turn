(() => {
  "use strict";
  const form = document.getElementById("lq");
  const done = document.getElementById("done");
  if (!form || !done) return;

  const messages = {
    suburb: "Add the suburb so we know where the turn is.",
    package: "Choose how many bedrooms.",
    start_date: "Add the checkout date.",
    turn_window: "Add the checkout time.",
    contact: "Add an email or a phone number so we can reply.",
    email: "That email doesn’t look complete. Try name@domain.com.au.",
    mobile: "Use a phone number we can call or text, like 0412 345 678.",
    past: "That date has already passed. Pick today or a later day."
  };

  const dateInput = form.elements.start_date;
  const today = new Date();
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
  dateInput.min = iso;

  function errEl(id) {
    return document.getElementById(id);
  }

  function setError(input, errId, message) {
    const err = errEl(errId);
    input.setAttribute("aria-invalid", "true");
    if (err) {
      err.hidden = false;
      err.textContent = message;
    }
  }

  function clearError(input, errId) {
    const err = errEl(errId);
    input.removeAttribute("aria-invalid");
    if (err) err.hidden = true;
  }

  function emailOk(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function phoneOk(value) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  function check(focus) {
    let ok = true;
    let first = null;
    const fail = (input, errId, message) => {
      setError(input, errId, message);
      ok = false;
      first = first || input;
    };

    const suburb = form.elements.suburb;
    if (!suburb.value.trim()) fail(suburb, "suburb-err", messages.suburb);
    else clearError(suburb, "suburb-err");

    const beds = form.elements.package;
    if (!beds.value) fail(beds, "package-err", messages.package);
    else clearError(beds, "package-err");

    const date = form.elements.start_date;
    if (!date.value) fail(date, "date-err", messages.start_date);
    else if (date.value < iso) fail(date, "date-err", messages.past);
    else clearError(date, "date-err");

    const time = form.elements.turn_window;
    if (!time.value) fail(time, "time-err", messages.turn_window);
    else clearError(time, "time-err");

    const email = form.elements.email;
    const mobile = form.elements.mobile;
    const emailValue = email.value.trim();
    const mobileValue = mobile.value.trim();
    if (emailValue && !emailOk(emailValue)) fail(email, "email-err", messages.email);
    else clearError(email, "email-err");
    if (mobileValue && !phoneOk(mobileValue)) fail(mobile, "mobile-err", messages.mobile);
    else clearError(mobile, "mobile-err");
    const contactErr = errEl("contact-err");
    if (!emailValue && !mobileValue) {
      setError(email, "email-err", messages.contact);
      if (contactErr) {
        contactErr.hidden = false;
        contactErr.textContent = messages.contact;
      }
      ok = false;
      first = first || email;
    } else if (contactErr && (emailValue || mobileValue)) {
      contactErr.hidden = true;
    }

    if (focus && first) first.focus();
    return ok;
  }

  form.querySelectorAll("input, select").forEach((input) => {
    const refresh = () => {
      if (form.dataset.tried) check(false);
    };
    input.addEventListener("blur", refresh);
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid")) check(false);
    });
    input.addEventListener("change", () => {
      if (input.getAttribute("aria-invalid")) check(false);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.dataset.tried = "1";
    const sendErr = document.getElementById("send-err");
    sendErr.hidden = true;
    if (!check(true)) return;
    const button = document.getElementById("send");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString()
      });
      if (!res.ok) throw new Error(String(res.status));
      const email = form.elements.email.value.trim();
      const mobile = form.elements.mobile.value.trim();
      const line = document.getElementById("done-email");
      if (email) line.textContent = "Kwan will reply to " + email + " with a written price.";
      else line.textContent = "Kwan will reply using " + mobile + ".";
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch (_) {
      sendErr.textContent = "That didn’t send. Try again, or email desk@innerturn.com.au.";
      sendErr.hidden = false;
      button.disabled = false;
      button.textContent = "Get my free quote";
    }
  });
})();
