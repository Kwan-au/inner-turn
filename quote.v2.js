(() => {
  'use strict';
  document.documentElement.classList.add('js');

  /* ---------------- CONFIG: single source of truth (keep in sync with /pricing) --------------- */
  const SUBMIT_ENDPOINT = '/';               // Netlify Forms: POST urlencoded to the site root.
  const PROTOTYPE_MODE = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]demo=1/.test(location.search);
  const CARD = { '1': 149, '2': 189, '3': 229, '4': 279 };
  const SAME = { '1': 40, '2': 50, '3': 60, '4': 70 };
  const EVENT_UPLIFT = 0.25;
  // Brief: +25% applies to the BASE only. The live manager form applies it to base + same-day.
  // Flip to true if Kwan confirms same-day should also be uplifted.
  const EVENT_ON_SAME_DAY = false;
  const TRIAL_OFF = 15;
  const EVENTS = [
    { name: 'Caulfield Cup', start: '2026-10-17', end: '2026-10-17', label: 'Caulfield Cup · Sat 17 Oct 2026' },
    { name: 'Cox Plate', start: '2026-10-24', end: '2026-10-24', label: 'Cox Plate · Sat 24 Oct 2026' },
    { name: 'Cup carnival', start: '2026-10-31', end: '2026-11-07', label: 'Melbourne Cup carnival · 31 Oct – 7 Nov 2026' },
    { name: 'Boxing Day Test', start: '2026-12-26', end: '2026-12-30', label: 'Boxing Day Test · 26 – 30 Dec 2026' },
    { name: 'Australian Open', start: '2027-01-11', end: '2027-01-31', label: 'Australian Open · 11 – 31 Jan 2027' },
    { name: 'F1 Grand Prix', start: '2027-04-01', end: '2027-04-04', label: 'F1 Albert Park · 1 – 4 Apr 2027' }
  ];
  // Coverage as published on innerturn.com.au/areas (18 Oct 2026). Confirm before changing.
  const ON_CARD = ['richmond','south yarra','southbank','docklands','east melbourne','fitzroy','collingwood','st kilda','saint kilda'];
  const ON_CARD_PC = ['3121','3141','3006','3008','3002','3065','3066','3182'];
  const QUOTED = ['melbourne','cbd','carlton','brunswick','prahran','windsor','port melbourne','elwood','hawthorn','abbotsford','cremorne'];
  const INCLUDED_COMMON = [
    'An insured contractor on file, sent to the listing (Kwan doesn\'t attend)',
    'Bathroom and kitchen guest-ready, floors vacuumed and mopped, bins out',
    'Time-stamped photos of each room on your job thread before the next guest'
  ];
  const INC = {
    '1': ['Bed stripped and made with your fresh linen', ...INCLUDED_COMMON, 'Same-day +$40, only with the contractor\'s written yes'],
    '2': ['Both beds stripped and made with your fresh linen', ...INCLUDED_COMMON, 'Same-day +$50, only with the contractor\'s written yes'],
    '3': ['All three beds stripped and made with your fresh linen', ...INCLUDED_COMMON, 'Same-day +$60, only with the contractor\'s written yes'],
    '4': ['All four beds stripped and made with your fresh linen', ...INCLUDED_COMMON, 'Same-day +$70, only with the contractor\'s written yes'],
    '5': ['Bigger places vary a lot, so we price them in writing', 'Tell us bedrooms, bathrooms and anything unusual in step 3', 'Same inclusions as the card: contractor on file, guest-ready, photos on the thread'],
    '6': ['Each listing is priced by its size on the card: $149 / $189 / $229 / $279', 'List the mix in step 3 and the written quote shows each one', 'Volume pricing isn\'t published. Ask in the notes if you have a lot of turns']
  };
  const NOT_INCLUDED = ['Linen supply or laundering', 'Restocking, unless agreed in your written quote', 'Guest messaging, keys, or listing management'];

  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const form = $('#lq');
  if (!form) return;
  // On / the form sits inside the landing page: leave the URL and the page chrome alone.
  const EMBED = !!form.closest('.lq2');
  const steps = $$('.step', form);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (n) => { const el = form.elements[n]; if (!el) return ''; if (el instanceof RadioNodeList) return el.value || ''; if (el.type === 'checkbox') return el.checked ? el.value : ''; return (el.value || '').trim(); };
  const setHidden = (n, v) => { form.elements[n].value = v; };
  const inEvent = (d) => d ? EVENTS.find((w) => d >= w.start && d <= w.end) || null : null;

  /* ---------------- build inclusions + event list ---------------- */
  $$('.inc').forEach((ul) => {
    const k = ul.id.split('-')[1];
    const items = INC[k].map((t) => `<li>${esc(t)}</li>`);
    if (+k <= 4) items.push('<li class="inc-head">Not included</li>', ...NOT_INCLUDED.map((t) => `<li class="not">${esc(t)}</li>`));
    ul.innerHTML = items.join('');
  });
  $('#events-list').innerHTML = EVENTS.map((e) => `<li class="${e.end < today ? 'past' : ''}">${esc(e.label)}${e.end < today ? ' <span class="sr-only">(past)</span>' : ''}</li>`).join('');
  $('#suburb-list').innerHTML = ['Richmond','South Yarra','Southbank','Docklands','East Melbourne','Fitzroy','Collingwood','St Kilda'].map((s) => `<option value="${s}">`).join('');

  /* ---------------- inclusions disclosure: tap pins, hover previews ---------------- */
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  $$('.pack').forEach((pack) => {
    const btn = $('.eye', pack); const list = document.getElementById(btn.getAttribute('aria-controls'));
    let pinned = false;
    const show = (on) => { btn.setAttribute('aria-expanded', String(on)); list.hidden = !on; };
    btn.addEventListener('click', () => { pinned = !pinned; show(pinned); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = false; show(false); } });
    let t; pack.addEventListener('mouseenter', () => { if (fine.matches && !pinned) { t = setTimeout(() => show(true), 130); } });
    pack.addEventListener('mouseleave', () => { clearTimeout(t); if (fine.matches && !pinned) show(false); });
  });

  /* ---------------- coverage hint ---------------- */
  function coverage(v) {
    const s = v.toLowerCase();
    if (!s) return { band: '', msg: '' };
    if (ON_CARD.some((x) => s.includes(x)) || ON_CARD_PC.some((p) => s.includes(p))) return { band: 'on-card', msg: '✓ On the published card.' };
    if (QUOTED.some((x) => s.includes(x))) return { band: 'quoted', msg: 'Outside our eight card suburbs, so we\'ll quote this one in writing.' };
    return { band: 'check', msg: 'We\'ll check this area and tell you honestly if we can cover it.' };
  }
  $('#f-suburb').addEventListener('input', (e) => { const c = coverage(e.target.value); $('#suburb-cover').textContent = c.msg; setHidden('coverage_band', c.band); });

  /* ---------------- estimate ---------------- */
  function estimate() {
    const pk = form.querySelector('[name=package]:checked');
    const beds = pk ? pk.dataset.beds : '';
    const sameOn = !!val('same_day');
    const start = val('start_date');
    const ev = inEvent(start);
    const totalEl = $('#est-total'), lines = $('#est-lines'), warn = $('#est-warn');
    let out = { base: '', same: '', event: ev ? ev.name : '', uplift: '', total: '', trial: '' };
    warn.innerHTML = '';
    if (!beds) { totalEl.textContent = 'Pick a size'; lines.innerHTML = '<li><span>1-bed to 4-bed</span><span>$149–$279</span></li>'; }
    else if (beds === '5+') { totalEl.innerHTML = 'Quoted'; lines.innerHTML = '<li><span>5+ beds or a house</span><span>Written price</span></li>'; out.base = out.total = 'quoted'; }
    else if (beds === 'mix') { totalEl.innerHTML = '$149–$279 <small>per turn</small>'; lines.innerHTML = '<li><span>Priced by size</span><span>see card</span></li>' + (sameOn ? '<li><span>Same-day extra</span><span>+$40–$70</span></li>' : '') + (ev ? `<li><span>${esc(ev.name)} +25%</span><span>on base</span></li>` : ''); out.base = out.total = 'mix'; }
    else {
      const base = CARD[beds], same = sameOn ? SAME[beds] : 0;
      const uplift = ev ? Math.round((base + (EVENT_ON_SAME_DAY ? same : 0)) * EVENT_UPLIFT * 100) / 100 : 0;
      const total = base + same + uplift;
      const L = [`<li><span>${beds}-bed turn</span><span>${money(base)}</span></li>`];
      if (same) L.push(`<li><span>Same-day extra</span><span>+${money(same)}</span></li>`);
      if (uplift) L.push(`<li><span>${esc(ev.name)} week +25%</span><span>+${money(uplift)}</span></li>`);
      L.push('<li><span>GST</span><span>Not charged</span></li>');
      L.push(`<li class="maybe"><span>First-turn trial (may apply)</span><span>−${money(TRIAL_OFF)}</span></li>`);
      totalEl.innerHTML = `${money(total)} <small>per turn</small>`;
      lines.innerHTML = L.join('');
      out = { base, same, event: ev ? ev.name : '', uplift, total, trial: `Trial -$${TRIAL_OFF} may apply once (first turn could be ${money(total - TRIAL_OFF)})` };
    }
    if (ev) warn.innerHTML = `<p class="warn">Your start date is in <strong>${esc(ev.name)}</strong> week. Turns with checkout or check-in in that window are +25% on the base rate.</p>`;
    else if (start) {
      const next = EVENTS.find((w) => w.start > start);
      if (next) { const days = Math.round((new Date(next.start) - new Date(start)) / 864e5); if (days <= 45) warn.innerHTML = `<p class="warn">Heads-up: ${esc(next.label)} is ${days} day${days === 1 ? '' : 's'} after your start date. Turns in that window are +25%.</p>`; }
    }
    const bar = $('#est-bar'); if (bar && $('#done').hidden) { bar.hidden = false; document.body.classList.add('has-bar'); $('#est-bar-total').textContent = totalEl.textContent.replace(/\s+/g, ' ').trim(); }
    if (val('restock')) lines.insertAdjacentHTML('beforeend', '<li class="maybe"><span>Restocking</span><span>In written quote</span></li>');
    setHidden('est_base', out.base); setHidden('est_same_day', out.same); setHidden('est_event', out.event);
    setHidden('est_event_uplift', out.uplift); setHidden('est_per_turn', out.total); setHidden('est_trial_note', out.trial);
    return out;
  }
  form.addEventListener('change', estimate); form.addEventListener('input', estimate);

  /* ---------------- validation ---------------- */
  const CODE_RE = /lock\s*box\s*(code)?\s*[:#]?\s*\d|pin\s*(code)?\s*[:#]?\s*\d|access\s*code|door\s*code|code\s*(is|:)\s*\d|#\s*\d{3,}/i;
  const rules = {
    name: { ok: (v) => v.length > 0 },
    email: { ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) },
    mobile: { ok: (v) => !v || /^(\+?61|0)4\d{8}$/.test(v.replace(/[\s()-]/g, '')) },
    suburb: { ok: (v) => v.length > 1 },
    listings: { ok: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 500 },
    start_date: { ok: (v) => !v || v >= today },
    beds_mix: { ok: (v) => { const b = (form.querySelector('[name=package]:checked') || {}).dataset?.beds; return !(b === '5+' || b === 'mix') || v.length > 2; } },
    notes: { ok: (v) => !CODE_RE.test(v) }
  };
  const ERR_ID = { name: 'name-err', email: 'email-err', mobile: 'mobile-err', suburb: 'suburb-err', listings: 'listings-err', start_date: 'start-err', beds_mix: 'mix-err', notes: 'notes-err' };
  function check(n) {
    const el = form.elements[n]; const ok = rules[n].ok(val(n));
    document.getElementById(ERR_ID[n]).hidden = ok;
    ok ? el.removeAttribute('aria-invalid') : el.setAttribute('aria-invalid', 'true');
    return ok;
  }
  Object.keys(rules).forEach((n) => {
    const el = form.elements[n];
    el.addEventListener('blur', () => { if (el.value || form.dataset.tried3) check(n); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid')) check(n); });
  });
  $('#f-start').min = today;
  function radioOk(name, errId) { const ok = !!form.querySelector(`[name="${name}"]:checked`); document.getElementById(errId).hidden = ok; return ok; }
  function syncMix() { const b = (form.querySelector('[name=package]:checked') || {}).dataset?.beds; const need = b === '5+' || b === 'mix'; $('#mix-tag').textContent = need ? 'required for this package' : 'optional'; form.elements.beds_mix.required = need; }
  form.addEventListener('change', (e) => { if (e.target.name === 'package') syncMix(); if (e.target.name === 'interest' && form.dataset.tried1) radioOk('interest', 'need-err'); if ((e.target.name === 'package' || e.target.name === 'linen') && form.dataset.tried2) { radioOk('package', 'pkg-err'); radioOk('linen', 'linen-err'); } });

  function validateStep(i) {
    if (i === 1) { form.dataset.tried1 = 1; const ok = radioOk('interest', 'need-err'); if (!ok) form.querySelector('[name=interest]').focus(); return ok; }
    if (i === 2) { form.dataset.tried2 = 1; const a = radioOk('package', 'pkg-err'), b = radioOk('linen', 'linen-err'); if (!a) form.querySelector('[name=package]').focus(); else if (!b) form.querySelector('[name=linen]').focus(); return a && b; }
    if (i === 3) {
      form.dataset.tried3 = 1;
      const bad = Object.keys(rules).filter((n) => !check(n));
      const box = $('#err-summary');
      if (bad.length) {
        $('ul', box).innerHTML = bad.map((n) => `<li><a href="#${form.elements[n].id}">${esc(document.getElementById(ERR_ID[n]).textContent)}</a></li>`).join('');
        box.hidden = false; box.focus();
        $$('a', box).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(a.getAttribute('href')).focus(); }));
        return false;
      }
      box.hidden = true; return true;
    }
    return true;
  }

  /* ---------------- step navigation ---------------- */
  let current = 1;
  const prog = $('#progress'); prog.style.display = 'flex';
  function go(n, focus = true) {
    current = n;
    steps.forEach((s) => { const k = +s.dataset.step; if (k === n) s.removeAttribute('data-hidden'); else s.setAttribute('data-hidden', ''); });
    $$('li', prog).forEach((li) => { const k = +li.dataset.p; li.classList.toggle('done', k < n); if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    if (n === 4) buildReview();
    if (focus) { const h = $(`[data-step="${n}"] h2`); h.focus(); h.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    if (!EMBED) history.replaceState(null, '', '#step-' + n);
  }
  $$('[data-next]').forEach((b) => b.addEventListener('click', () => { if (validateStep(current)) go(current + 1); }));
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => go(current - 1)));

  function buildReview() {
    const e = estimate();
    const rows = [
      ['What you need', val('interest'), 1], ['Package', val('package'), 2],
      ['Same-day price shown', val('same_day') ? 'Yes' : 'No', 2], ['Linen', val('linen'), 2], ['Restocking', val('restock') ? 'Asked about' : 'Not asked', 2],
      ['Name', val('name'), 3], ['Company', val('company') || '—', 3], ['Email', val('email'), 3], ['Mobile', val('mobile') || '—', 3],
      ['Suburb / postcode', val('suburb'), 3], ['Listings', val('listings'), 3], ['Turns per week', val('turns_per_week') || '—', 3],
      ['First turn', val('start_date') || '—', 3], ['Usual window', val('turn_window') || '—', 3], ['Mix / layout', val('beds_mix') || '—', 3],
      ['Estimate per turn', typeof e.total === 'number' ? money(e.total) + (e.event ? ` (incl. ${e.event} +25%)` : '') : (e.total === 'mix' ? '$149–$279 by size' : 'Quoted'), 2]
    ];
    const dl = $('#review-list'); dl.style.display = 'grid';
    dl.innerHTML = rows.map(([k, v, s]) => `<dt>${esc(k)}</dt><dd>${esc(v)} <a href="#" class="edit" data-go="${s}">Edit<span class="sr-only"> ${esc(k)}</span></a></dd>`).join('');
    $$('[data-go]', dl).forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); go(+a.dataset.go); }));
  }

  /* ---------------- attribution + timing gate ---------------- */
  const qs = new URLSearchParams(location.search);
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => setHidden(k, (qs.get(k) || '').slice(0, 80)));
  try { setHidden('referrer', document.referrer ? new URL(document.referrer).host : ''); } catch (_) {}
  setHidden('started', String(Date.now()));

  /* ---------------- submit ---------------- */
  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const i of [1, 2, 3]) { if (!validateStep(i)) { go(i, false); validateStep(i); return; } }
    if (sending) return;
    const err = $('#send-err'); err.hidden = true;
    if (Date.now() - Number(val('started')) < 3000) { err.textContent = 'That was very quick. Please check your details and press send again.'; err.hidden = false; setHidden('started', String(Date.now() - 3000)); return; }
    const est = estimate();
    sending = true; const btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      if (PROTOTYPE_MODE) {
        console.info('[Inner Turn prototype] Not sent. Payload would be:', Object.fromEntries(new FormData(form)));
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const res = await fetch(SUBMIT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() });
        if (!res.ok) throw new Error(String(res.status));
      }
      const first = val('name').split(/\s+/)[0];
      $('#done-h').textContent = `Thanks, ${first}. Your quote request is in.`;
      $('#done-email').innerHTML = `Kwan will reply to <strong>${esc(val('email'))}</strong> with a written price.`;
      $('#done-est').textContent = typeof est.total === 'number' ? `Your estimate from the card was ${money(est.total)} per turn${est.event ? ` (including ${est.event} +25%)` : ''}. The written quote is what counts.` : (est.total === 'mix' ? 'Your listings are a mix of sizes, so the written quote will price each one by the card.' : 'Your place is 5+ bedrooms or a house, so Kwan will write you a price.');
      form.hidden = true; $('#progress').style.display = 'none'; const bar = $('#est-bar'); if (bar) bar.hidden = true; document.body.classList.remove('has-bar');
      const done = $('#done'); done.hidden = false; done.focus();
      if (!EMBED) history.replaceState(null, '', '#sent');
    } catch (_) {
      err.innerHTML = 'Sorry, that didn\'t send. Please try again, or email <a href="mailto:desk@innerturn.com.au">desk@innerturn.com.au</a>.';
      err.hidden = false;
    } finally { sending = false; btn.disabled = false; btn.textContent = 'Get my free quote'; }
  });

  /* ---------------- init ---------------- */
  // Deep links: /quote?size=2&interest=event preselect (useful in outreach emails).
  const size = qs.get('size'); if (size) { const r = form.querySelector(`[name=package][data-beds="${CSS.escape(size)}"]`); if (r) r.checked = true; }
  const intMap = { single: 'Single listing turns', portfolio: 'Portfolio or overflow cover', event: 'Event-week capacity', sameday: 'Same-day backup' };
  const it = intMap[qs.get('interest')]; if (it) { const r = form.querySelector(`[name=interest][value="${it}"]`); if (r) r.checked = true; }
  syncMix(); estimate(); go(it ? 2 : 1, false); // skip step 1 when an outreach link already says what they want
})();
