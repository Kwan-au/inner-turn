document.addEventListener('DOMContentLoaded', () => {
  const AREAS = [
    ['/richmond', 'Richmond'],
    ['/south-yarra', 'South Yarra'],
    ['/southbank', 'Southbank'],
    ['/docklands', 'Docklands'],
    ['/east-melbourne', 'East Melbourne'],
    ['/fitzroy', 'Fitzroy'],
    ['/collingwood', 'Collingwood'],
    ['/st-kilda', 'St Kilda']
  ];

  const path = (location.pathname.replace(/\.html$/, '') || '/').replace(/\/+$/, '') || '/';
  const isDesk = document.body.classList.contains('desk-body') || !!document.getElementById('logout') || !!document.getElementById('form') && /Desk login/.test(document.title);
  const isCleaners = path === '/cleaners';
  const isApp = path === '/app';
  const suburbOpen = AREAS.some(([href]) => path === href);

  const areaLinks = AREAS.map(([href, label]) =>
    `<a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');

  const quoteHref = path === '/' ? '/#quote' : path === '/quote' ? '#quote' : '/quote';
  const QUOTE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 4h10l4 4v12H5z M14 4v5h5 M8 13h8 M8 17h5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  const primaryHref = isCleaners ? '#apply' : isApp ? '#open' : quoteHref;
  const primaryLabel = isCleaners ? 'Join the file' : isApp ? 'Start a job' : 'Get a quote';

  const DRAWER = `
<div id="nav-scrim" class="nav-scrim" hidden></div>
<nav id="drawer" class="drawer" hidden>
  <div class="drawer-top">
    <a class="drawer-brand" href="/">Inner Turn<span>.</span></a>
    <button class="drawer-close" type="button" aria-label="Close menu">
      <span aria-hidden="true"></span>
    </button>
  </div>
  <div class="drawer-list">
    <a href="/">Home</a>
    <a href="/how-it-works">How it works</a>
    <a href="/pricing">Pricing</a>
    <a href="/services">Services</a>
    <a href="/who-we-work-with">Who we work with</a>
    <div class="drawer-block${suburbOpen || path === '/areas' ? ' open' : ''}" data-acc>
      <div class="drawer-areas">
        <a href="/areas">Areas</a>
        <button class="drawer-toggle" type="button" aria-expanded="${suburbOpen || path === '/areas' ? 'true' : 'false'}" aria-label="Show suburbs"><span></span></button>
      </div>
      <div class="drawer-links">
        ${areaLinks}
      </div>
    </div>
    <a href="/lot-pack">For managers</a>
    <a href="/cleaners">For cleaners</a>
    <a class="drawer-primary" href="${isCleaners ? '#apply' : isApp ? '#open' : quoteHref}" data-cta="drawer">${isCleaners ? 'Join the file' : isApp ? 'Start a job' : 'Get a quote'}</a>
  </div>
  <div class="drawer-list drawer-legal">
    <a href="/photo-pack">Photo pack</a>
    <a href="/same-day">Same-day / 8pm</a>
    <a href="/trust">Trust</a>
    <a href="/terms">Terms</a>
    <a href="/policies">Policies</a>
    <a href="/privacy">Privacy</a>
  </div>
  <p class="drawer-contact">
    <a href="tel:+61451224857">0451 224 857</a>
    <a href="mailto:desk@innerturn.com.au">desk@innerturn.com.au</a>
  </p>
</nav>`;

  function current(el) {
    try {
      const href = el.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return;
      let p = u.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
      if (p === path) el.setAttribute('aria-current', 'page');
    } catch (_) { /* ignore */ }
  }

  function paintHamburger(btn) {
    if (!btn) return;
    btn.setAttribute('aria-controls', 'drawer');
    btn.setAttribute('aria-label', 'Open menu');
    if (!btn.querySelector('.menu-bars')) {
      btn.textContent = '';
      const bars = document.createElement('span');
      bars.className = 'menu-bars';
      bars.setAttribute('aria-hidden', 'true');
      btn.appendChild(bars);
    }
  }

  function bindDrop(wrap) {
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';
    const chev = wrap.querySelector('.drop-chev');
    const set = (on) => {
      wrap.classList.toggle('open', on);
      chev?.setAttribute('aria-expanded', String(on));
    };
    chev?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      set(!wrap.classList.contains('open'));
    });
    wrap.addEventListener('mouseenter', () => { if (window.matchMedia('(min-width:851px)').matches) set(true); });
    wrap.addEventListener('mouseleave', () => set(false));
    wrap.addEventListener('focusout', (e) => {
      if (!wrap.contains(e.relatedTarget)) set(false);
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) set(false);
    });
  }

  function enhanceDesktopNav(nav) {
    if (!nav) return;
    const areasCurrent = path === '/areas' || suburbOpen ? ' aria-current="page"' : '';
    nav.innerHTML = `
    <a href="/">Home</a>
    <a href="/how-it-works">How it works</a>
    <a href="/pricing">Pricing</a>
    <a href="/services">Services</a>
    <a href="/who-we-work-with">Who we work with</a>
    <div class="has-drop">
      <a class="drop-parent" href="/areas"${areasCurrent}>Areas</a>
      <button class="drop-chev" type="button" aria-expanded="false" aria-controls="areas-menu" aria-label="Open inner ring list"></button>
      <div class="drop-panel" id="areas-menu" role="group" aria-label="Inner ring suburbs">
        <p>Inner ring</p>
        <div class="drop-grid">${areaLinks}</div>
        <a class="drop-all" href="/areas">All service areas</a>
      </div>
    </div>
    <a href="/lot-pack">For managers</a>
    <a href="/cleaners">For cleaners</a>
    <a class="nav-quote" href="${quoteHref}" data-cta="nav">Get a quote</a>`;
    nav.querySelectorAll('.has-drop').forEach(bindDrop);
    const header = nav.closest('header');
    if (header && !header.querySelector('.head-quote')) {
      const q = document.createElement('a');
      q.className = 'head-quote';
      q.href = quoteHref;
      q.dataset.cta = 'header-mobile';
      q.innerHTML = QUOTE_ICON + 'Get a quote';
      nav.after(q);
    }
  }

  if (!isDesk) {
    if (!document.getElementById('drawer')) {
      document.body.insertAdjacentHTML('beforeend', DRAWER);
    }
    const headerNav = document.querySelector('header nav#nav, header nav#site-nav, header nav');
    if (headerNav) enhanceDesktopNav(headerNav);
    document.querySelectorAll('header nav a, #drawer a').forEach(current);
  }

  if (!document.getElementById('site-foot') && !isDesk) {
    document.body.insertAdjacentHTML('beforeend', `
<footer id="site-foot">
  <div class="footer-mark">
    <a class="mark" href="/">Inner Turn<span>.</span></a>
    <p>Turns only. You keep the guest thread.</p>
    <p>ABN 20 235 092 068 · Melbourne VIC</p>
  </div>
  <div>
    <small>Desk</small>
    <a href="mailto:desk@innerturn.com.au">desk@innerturn.com.au</a>
    <a href="tel:+61451224857">0451 224 857</a>
    <a href="/app">App</a>
    <a href="/#enquire">Send a lot pack</a>
  </div>
  <div>
    <small>Pages</small>
    <a href="/">Home</a>
    <a href="/how-it-works">How it works</a>
    <a href="/pricing">Pricing</a>
    <a href="/services">Services</a>
    <a href="/who-we-work-with">Who we work with</a>
    <a href="/areas">Areas</a>
    <a href="/lot-pack">For managers</a>
    <a href="/cleaners">For cleaners</a>
    <a href="/quote" data-cta="footer">Get a quote</a>
    <a href="/photo-pack">Photo pack</a>
    <a href="/same-day">Same-day / 8pm</a>
  </div>
  <div>
    <small>Legal</small>
    <a href="/trust">Trust</a>
    <a href="/policies">Policies</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </div>
  <p class="copy">© 2026 Inner Turn · Melbourne VIC · Form is a lead, not a booking.</p>
</footer>`);
    document.querySelectorAll('footer.site-ruler').forEach((el) => el.remove());
  }

  if (!isDesk && !document.getElementById('event-bar') && !sessionStorage.getItem('it-event-bar')) {
    document.body.insertAdjacentHTML('afterbegin', `
<div id="event-bar" class="event-bar" role="status">
  <p>
    <span class="event-lead"><strong>Event weeks +25%</strong> when checkout or check-in falls in a published window.</span>
    <span class="event-next"><span>Next: Australian Open 11–31 Jan 2027</span><span>F1 1–4 Apr 2027</span><a href="/pricing">Card</a></span>
  </p>
  <button type="button" class="event-bar-x" aria-label="Dismiss event bar">×</button>
</div>`);
    document.querySelector('.event-bar-x')?.addEventListener('click', () => {
      document.getElementById('event-bar')?.remove();
      sessionStorage.setItem('it-event-bar', '1');
    });
  }

  // The event bar and drawer are injected after the browser's first jump to a #hash; land it again.
  if (location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('nav-scrim');
  let rawBtn = document.querySelector('.menu, button[aria-controls="nav"], button[aria-controls="site-nav"], button[aria-controls="drawer"]');
  if (rawBtn && rawBtn.parentNode) {
    const fresh = rawBtn.cloneNode(true);
    rawBtn.parentNode.replaceChild(fresh, rawBtn);
    rawBtn = fresh;
  }
  const btn = rawBtn;
  paintHamburger(btn);

  const close = () => {
    document.body.classList.remove('nav-open');
    if (drawer) drawer.hidden = true;
    if (scrim) scrim.hidden = true;
    btn?.setAttribute('aria-expanded', 'false');
    btn?.setAttribute('aria-label', 'Open menu');
  };
  const open = () => {
    document.body.classList.add('nav-open');
    if (drawer) drawer.hidden = false;
    if (scrim) scrim.hidden = false;
    btn?.setAttribute('aria-expanded', 'true');
    btn?.setAttribute('aria-label', 'Close menu');
    drawer?.querySelector('.drawer-close')?.focus();
  };

  if (!isDesk) {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.contains('nav-open') ? close() : open();
    });
    drawer?.querySelector('.drawer-close')?.addEventListener('click', close);
    scrim?.addEventListener('click', close);
    drawer?.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    drawer?.querySelectorAll('[data-acc]').forEach((block) => {
      const toggle = block.querySelector('.drawer-toggle');
      toggle?.addEventListener('click', () => {
        const on = block.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(on));
      });
    });
  } else if (btn) {
    const nav = document.querySelector('header nav');
    const setOpen = (on) => {
      document.body.classList.toggle('nav-open', on);
      btn.setAttribute('aria-expanded', String(on));
      btn.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(!document.body.classList.contains('nav-open'));
    });
    nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  const CARD = { '1': 149, '2': 189, '3': 229, '4': 279 };
  const SAME = { '1': 40, '2': 50, '3': 60, '4': 70 };
  const EVENTS = [
    { name: 'Caulfield Cup', start: '2026-10-17', end: '2026-10-17' },
    { name: 'Cox Plate', start: '2026-10-24', end: '2026-10-24' },
    { name: 'Cup carnival', start: '2026-10-31', end: '2026-11-07' },
    { name: 'Boxing Day Test', start: '2026-12-26', end: '2026-12-30' },
    { name: 'AO', start: '2027-01-11', end: '2027-01-31' },
    { name: 'F1', start: '2027-04-01', end: '2027-04-04' }
  ];
  function ymd(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }
  function inEvent(day) {
    if (!day) return null;
    return EVENTS.find((w) => day >= w.start && day <= w.end) || null;
  }
  function bindInvoice(form) {
    if (!form || form.getAttribute('name') !== 'manager-enquire') return;
    if (form.querySelector('.quote-card')) return;
    const box = document.createElement('aside');
    box.className = 'quote-card';
    box.innerHTML = `
      <p class="quote-kicker">Invoice preview · GST not charged</p>
      <p class="quote-total" data-quote-total>Select beds</p>
      <ul class="quote-lines" data-quote-lines></ul>
      <label class="quote-same"><input type="checkbox" name="same_day" value="yes"> Same-day extra (window moved after 8pm last night)</label>
      <p class="quote-note">Not an invoice until the desk confirms the contractor. Trial −$15 is once, written, if the desk still keeps its floor. 5+ and houses are quoted.</p>
      <input type="hidden" name="quote_base" value="">
      <input type="hidden" name="quote_sameday" value="0">
      <input type="hidden" name="quote_event" value="">
      <input type="hidden" name="quote_total" value="">
    `;
    const btn = form.querySelector('button[type="submit"], .submit');
    if (btn) form.insertBefore(box, btn);
    else form.appendChild(box);
    const paint = () => {
      const beds = (form.querySelector('[name="beds"]')?.value || '').trim();
      const checkout = ymd(form.querySelector('[name="checkout"]')?.value);
      const checkin = ymd(form.querySelector('[name="checkin"]')?.value);
      const sameOn = form.querySelector('[name="same_day"]')?.checked;
      const ev = inEvent(checkout) || inEvent(checkin);
      const lines = box.querySelector('[data-quote-lines]');
      const totalEl = box.querySelector('[data-quote-total]');
      const setHidden = (n, v) => { const el = form.querySelector('[name="'+n+'"]'); if (el) el.value = v; };
      if (!beds) {
        totalEl.textContent = 'Select beds';
        lines.innerHTML = '';
        setHidden('quote_base',''); setHidden('quote_sameday','0'); setHidden('quote_event',''); setHidden('quote_total','');
        return;
      }
      if (beds === '5+' || !CARD[beds]) {
        totalEl.textContent = 'Quoted';
        lines.innerHTML = '<li>5+ beds and houses — desk writes the invoice.</li>';
        setHidden('quote_base','quoted'); setHidden('quote_sameday','0'); setHidden('quote_event', ev ? ev.name : ''); setHidden('quote_total','quoted');
        return;
      }
      const base = CARD[beds];
      const extra = sameOn ? (SAME[beds] || 0) : 0;
      let sum = base + extra;
      const bits = [`<li>Card ${beds}-bed · $${base}</li>`];
      if (extra) bits.push(`<li>Same-day extra · +$${extra}</li>`);
      if (ev) {
        const bump = Math.round(sum * 0.25);
        sum += bump;
        bits.push(`<li>Event ${ev.name} +25% · +$${bump}</li>`);
      }
      bits.push('<li>GST not charged</li>');
      totalEl.textContent = '$' + sum;
      lines.innerHTML = bits.join('');
      setHidden('quote_base', String(base));
      setHidden('quote_sameday', String(extra));
      setHidden('quote_event', ev ? ev.name : '');
      setHidden('quote_total', String(sum));
    };
    form.addEventListener('change', paint);
    form.addEventListener('input', paint);
    const checkout = form.querySelector('[name="checkout"]');
    checkout?.addEventListener('change', () => {
      const boxSame = form.querySelector('[name="same_day"]');
      if (!boxSame || !checkout.value) return;
      try {
        const day = ymd(checkout.value);
        const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
        if (day === now) boxSame.checked = true;
      } catch (_) { /* ignore */ }
      paint();
    });
    paint();
  }
  document.querySelectorAll('form[name="manager-enquire"]').forEach((form) => {
    bindInvoice(form);
    const dwelling = form.querySelector('[name="dwelling"]');
    const unit = form.querySelector('[name="unit"]');
    const syncUnit = () => {
      if (!unit) return;
      const need = dwelling && dwelling.value === 'unit';
      unit.required = Boolean(need);
      unit.placeholder = need ? 'e.g. 12 / L8' : 'Leave blank for a house';
    };
    dwelling?.addEventListener('change', syncUnit);
    unit?.addEventListener('input', () => {
      if (/lock\s*box|pin|code|#\s*\d{4,}/i.test(unit.value || '')) {
        unit.setCustomValidity('Unit / level only. Do not paste a lockbox code.');
      } else {
        unit.setCustomValidity('');
      }
    });
    syncUnit();
  });

  document.querySelectorAll('form[data-netlify], form[name="manager-enquire"]').forEach((f) => {
    if (f.getAttribute('name') === 'listing-quote-v2') return;
    if (f.querySelector('input[name="started"]')) return;
    const s = document.createElement('input');
    s.type = 'hidden';
    s.name = 'started';
    s.value = String(Date.now());
    f.appendChild(s);
    f.addEventListener('submit', (e) => {
      f.classList.add('tried');
      const notes = f.querySelector('textarea[name="notes"], input[name="notes"]');
      if (notes && /lock\s*box|pin\s*code|access\s*code|#\s*\d{3,}/i.test(notes.value || '')) {
        notes.setCustomValidity('Do not paste lockbox codes or PINs. Write access type only.');
      } else if (notes) {
        notes.setCustomValidity('');
      }
      const tooBig = Array.from(f.querySelectorAll('input[type="file"]')).some((inp) =>
        Array.from(inp.files || []).some((file) => file.size > 1800000)
      );
      if (tooBig) {
        e.preventDefault();
        alert('Each still must be under 1.8 MB. Compress the photo and try again.');
        return;
      }
      if (!f.checkValidity() || Date.now() - Number(s.value) < 1200) {
        e.preventDefault();
        f.querySelector(':invalid')?.focus();
      }
    });
  });

  const thanksFrom = (location.search.match(/from=([a-z-]+)/) || [])[1];
  if (thanksFrom === 'cleaners' || thanksFrom === 'quote') {
    const lead = document.getElementById('thanks-lead');
    const shown = document.getElementById(thanksFrom === 'cleaners' ? 'thanks-file' : 'thanks-quote-req');
    if (lead) lead.hidden = true;
    if (shown) shown.hidden = false;
    document.getElementById('thanks-quote')?.remove();
    // Cleaner applicants are the wrong audience for manager quote links.
    if (thanksFrom === 'cleaners') document.querySelectorAll('a[data-cta]').forEach((a) => a.remove());
  }

  function validABN(value) {
    const d = String(value || '').replace(/\D/g, '').split('').map(Number);
    if (d.length !== 11) return false;
    const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    d[0] -= 1;
    return d.reduce((sum, n, i) => sum + n * w[i], 0) % 89 === 0;
  }
  document.querySelectorAll('form[name="cleaner-file"] input[name="abn"]').forEach((input) => {
    input.addEventListener('blur', () => {
      if (!input.value.trim()) { input.setCustomValidity(''); return; }
      input.setCustomValidity(validABN(input.value) ? '' : 'ABN must be an 11-digit Australian Business Number');
    });
  });

  const covRoot = document.querySelector('[data-coverage]');
  if (covRoot) {
    const buttons = covRoot.querySelectorAll('[data-cov]');
    const pins = covRoot.querySelectorAll('[data-band]');
    const setBand = (band) => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-cov') === band)));
      pins.forEach((el) => {
        const match = band === 'all' || el.getAttribute('data-band') === band;
        el.classList.toggle('is-off', !match);
      });
    };
    buttons.forEach((b) => b.addEventListener('click', () => setBand(b.getAttribute('data-cov'))));
    setBand('card');
  }

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const el = document.getElementById(btn.getAttribute('data-copy') || '');
      if (!el) return;
      try {
        await navigator.clipboard.writeText(el.innerText.trim());
        btn.setAttribute('data-copied', '1');
        const old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = old; btn.removeAttribute('data-copied'); }, 1600);
      } catch (_) { /* ignore */ }
    });
  });

  try {
    const payload = JSON.stringify({
      path: location.pathname.slice(0, 180),
      ref: document.referrer ? new URL(document.referrer).host : ''
    });
    const body = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/pageview', body);
    else fetch('/api/pageview', { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'application/json' } });
  } catch (_) { /* ignore */ }
});

// Keep the fixed bottom CTA off the hero, the quote form, and focused fields.
document.addEventListener('DOMContentLoaded', () => {
  const cta = document.querySelector('.mobile-cta');
  if (!cta) return;
  const hero = document.querySelector('.hero');
  const forms = document.querySelectorAll('form, #quote');
  const seen = new Set();
  let overHero = !!hero;
  const sync = () => {
    const typing = !!document.activeElement?.closest?.('form');
    const overForm = seen.size > 0;
    document.body.classList.toggle('cta-tucked', typing);
    document.body.classList.toggle('cta-over-hero', overHero);
    document.body.classList.toggle('cta-over-form', overForm);
    document.body.classList.toggle('cta-show', !overHero && !overForm && !typing);
  };
  document.addEventListener('focusin', (e) => { if (e.target.closest('form')) sync(); });
  document.addEventListener('focusout', () => setTimeout(sync, 0));
  if ('IntersectionObserver' in window) {
    if (hero) {
      const heroIO = new IntersectionObserver((entries) => {
        overHero = entries.some((en) => en.isIntersecting && en.intersectionRatio > 0.28);
        sync();
      }, { threshold: [0, 0.28, 0.6] });
      heroIO.observe(hero);
    } else {
      overHero = false;
    }
    const formIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
      sync();
    }, { rootMargin: '0px 0px -10% 0px' });
    forms.forEach((f) => formIO.observe(f));
  } else {
    overHero = false;
  }
  sync();
});
