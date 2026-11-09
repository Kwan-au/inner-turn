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

  const primaryHref = isCleaners ? '#apply' : isApp ? '#lot' : '/#enquire';
  const primaryLabel = isCleaners ? 'Send rate file' : 'Send a lot pack';

  const DRAWER = `
<div id="nav-scrim" class="nav-scrim" hidden></div>
<nav id="drawer" class="drawer" hidden>
  <div class="drawer-top">
    <a class="drawer-brand" href="/">Inner Turn<span>.</span></a>
    <button class="drawer-close" type="button" aria-label="Close menu">
      <span aria-hidden="true"></span>
    </button>
  </div>
  <a class="drawer-primary" href="${primaryHref}">${primaryLabel}</a>
  <div class="drawer-list">
    <a href="/pricing">Pricing</a>
    <a href="/how-it-works">How it books</a>
    <a href="/app">App</a>
    <a href="/photo-pack">Photo pack</a>
    <a href="/same-day">Same-day / 8pm</a>
  </div>
  <div class="drawer-block${suburbOpen || path === '/areas' ? ' open' : ''}" data-acc>
    <button class="drawer-toggle" type="button" aria-expanded="${suburbOpen || path === '/areas' ? 'true' : 'false'}">Inner ring <span></span></button>
    <div class="drawer-links">
      ${areaLinks}
      <a href="/areas"${path === '/areas' ? ' aria-current="page"' : ''}>All areas</a>
    </div>
  </div>
  <div class="drawer-list drawer-legal">
    <a href="/cleaners">Cleaners</a>
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
    if (!nav.querySelector('.has-drop')) {
      const existing = Array.from(nav.querySelectorAll('a')).find((a) => {
        const href = (a.getAttribute('href') || '').replace(/\.html$/, '');
        return href === '/areas';
      });
      const drop = document.createElement('div');
      drop.className = 'has-drop';
      drop.innerHTML = `
      <a class="drop-parent" href="/areas"${path === '/areas' || suburbOpen ? ' aria-current="page"' : ''}>Areas</a>
      <button class="drop-chev" type="button" aria-expanded="false" aria-controls="areas-menu" aria-label="Open inner ring list"></button>
      <div class="drop-panel" id="areas-menu" role="group" aria-label="Inner ring suburbs">
        <p>Inner ring</p>
        <div class="drop-grid">${areaLinks}</div>
        <a class="drop-all" href="/areas">All service areas</a>
      </div>`;
      if (existing) existing.replaceWith(drop);
      else {
        const cta = nav.querySelector('.nav-cta, .ghost, a[href*="enquire"], a[href="#lot"], a[href="#apply"]');
        if (cta) nav.insertBefore(drop, cta);
        else nav.appendChild(drop);
      }
    }
    nav.querySelectorAll('.has-drop').forEach(bindDrop);
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
    <a href="/pricing">Pricing</a>
    <a href="/how-it-works">How it books</a>
    <a href="/areas">Areas</a>
    <a href="/photo-pack">Photo pack</a>
    <a href="/same-day">Same-day / 8pm</a>
    <a href="/cleaners">Cleaners</a>
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
  <div class="event-bar-inner">
    <p class="event-bar-rule"><strong>Event weeks +25%</strong> when checkout or check-in falls in a published window.</p>
    <ul class="event-bar-windows" aria-label="Next published windows">
      <li><span class="event-bar-next">Next</span> GF Sat 26 Sep 2026</li>
      <li>Cup Tue 3 Nov</li>
      <li>AO 12 Jan–1 Feb</li>
      <li>F1 5–8 Mar</li>
    </ul>
    <a class="event-bar-cta" href="/policies#events">Event windows</a>
  </div>
  <button type="button" class="event-bar-x" aria-label="Dismiss event bar">×</button>
</div>`);
    document.querySelector('.event-bar-x')?.addEventListener('click', () => {
      document.getElementById('event-bar')?.remove();
      sessionStorage.setItem('it-event-bar', '1');
    });
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

  document.querySelectorAll('form[data-netlify], form[name="manager-enquire"]').forEach((f) => {
    if (f.querySelector('input[name="started"]')) return;
    const s = document.createElement('input');
    s.type = 'hidden';
    s.name = 'started';
    s.value = String(Date.now());
    f.appendChild(s);
    f.addEventListener('submit', (e) => {
      f.classList.add('tried');
      if (!f.checkValidity() || Date.now() - Number(s.value) < 1200) {
        e.preventDefault();
        f.querySelector(':invalid')?.focus();
      }
    });
  });

  if (/from=cleaners/.test(location.search)) {
    const lead = document.getElementById('thanks-lead');
    const file = document.getElementById('thanks-file');
    if (lead) lead.hidden = true;
    if (file) file.hidden = false;
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
