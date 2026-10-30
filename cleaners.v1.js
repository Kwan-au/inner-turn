// /cleaners: contractor file form. Inline errors, ABN checksum, and the same
// 3-second minimum-time gate as listing-quote-v2. Posts to Netlify Forms with
// fetch so the success message shows in place; without JS the form posts to /thanks.
(() => {
  const form = document.getElementById('cf-form');
  if (!form) return;
  const $ = (s, root = form) => root.querySelector(s);
  const $$ = (s, root = form) => Array.from(root.querySelectorAll(s));
  const MAX_FILE = 4 * 1024 * 1024;
  const MIN_MS = 3000;
  // Native validation stays on without JS; with JS the inline messages take over.
  form.noValidate = true;

  const started = $('[name="started"]');
  started.value = String(Date.now());

  function validABN(value) {
    const d = String(value || '').replace(/\D/g, '').split('').map(Number);
    if (d.length !== 11) return false;
    const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    d[0] -= 1;
    return d.reduce((sum, n, i) => sum + n * w[i], 0) % 89 === 0;
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  const expiry = $('#cf-expiry');
  expiry.min = today;

  const otherBox = $('#cf-area-other');
  const otherWrap = $('#cf-other-wrap');
  const syncOther = () => { otherWrap.hidden = !otherBox.checked; };
  otherBox.addEventListener('change', syncOther);
  syncOther();

  // Each check returns true when the field is fine; `el` gets .is-bad otherwise.
  const checks = [
    { el: $('#cf-name').closest('.cf-field'), ok: () => $('#cf-name').value.trim().length > 1, focus: '#cf-name' },
    { el: $('#cf-mobile').closest('.cf-field'), ok: () => $('#cf-mobile').checkValidity(), focus: '#cf-mobile' },
    { el: $('#cf-email').closest('.cf-field'), ok: () => $('#cf-email').checkValidity(), focus: '#cf-email' },
    { el: $('#cf-abn').closest('.cf-field'), ok: () => validABN($('#cf-abn').value), focus: '#cf-abn' },
    { el: $('#cf-insurer').closest('.cf-field'), ok: () => $('#cf-insurer').value.trim().length > 1, focus: '#cf-insurer' },
    { el: expiry.closest('.cf-field'), ok: () => !!expiry.value && expiry.value >= today, focus: '#cf-expiry' },
    {
      el: $('#cf-policy').closest('.cf-field'),
      ok: () => Array.from($('#cf-policy').files || []).every((f) => f.size <= MAX_FILE),
      focus: '#cf-policy'
    },
    { el: $('#cf-areas'), ok: () => $$('[name="areas[]"]:checked').length > 0, focus: '[name="areas[]"]' },
    { el: $('#cf-avail'), ok: () => $$('[name="availability[]"]:checked').length > 0, focus: '[name="availability[]"]' },
    { el: $('[name="experience"]').closest('fieldset'), ok: () => !!$('[name="experience"]:checked'), focus: '[name="experience"]' },
    { el: $('[name="linen"]').closest('fieldset'), ok: () => !!$('[name="linen"]:checked'), focus: '[name="linen"]' },
    { el: $('[name="vehicle"]').closest('fieldset'), ok: () => !!$('[name="vehicle"]:checked'), focus: '[name="vehicle"]' },
    { el: $('#cf-consent').closest('.cf-field'), ok: () => $('#cf-consent').checked, focus: '#cf-consent' }
  ];

  let tried = false;
  const paint = (c) => {
    const bad = !c.ok();
    c.el.classList.toggle('is-bad', bad);
    $$('input:not([type="checkbox"]):not([type="radio"])', c.el).forEach((i) => i.setAttribute('aria-invalid', String(bad)));
    return !bad;
  };
  // After the first send attempt, errors clear as the person fixes them.
  form.addEventListener('input', () => { if (tried) checks.forEach(paint); });
  form.addEventListener('change', () => { if (tried) checks.forEach(paint); });
  $('#cf-abn').addEventListener('blur', () => { if ($('#cf-abn').value.trim()) paint(checks[3]); });

  const err = $('#cf-send-err');
  const btn = $('#cf-send');
  let sending = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    tried = true;
    err.hidden = true;
    const firstBad = checks.find((c) => !paint(c));
    checks.forEach(paint);
    if (firstBad) { $(firstBad.focus)?.focus(); return; }
    if (Date.now() - Number(started.value) < MIN_MS) {
      err.textContent = 'That was very quick. Please check your details and press send again.';
      err.hidden = false;
      started.value = String(Date.now() - MIN_MS);
      return;
    }
    sending = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      // multipart so the optional policy file comes through; the browser sets the boundary.
      const res = await fetch('/', { method: 'POST', body: new FormData(form) });
      if (!res.ok) throw new Error(String(res.status));
      form.hidden = true;
      const done = document.getElementById('cf-done');
      done.hidden = false;
      done.focus();
      history.replaceState(null, '', '#apply');
    } catch (_) {
      err.innerHTML = 'Sorry, that didn\'t send. Please try again, or email <a href="mailto:desk@innerturn.com.au">desk@innerturn.com.au</a>.';
      err.hidden = false;
    } finally {
      sending = false;
      btn.disabled = false;
      btn.textContent = 'Send my details';
    }
  });
})();
