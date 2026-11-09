/* Cinematic pass. Motion 12.23.24 (vendored, MIT): animate, scroll, inView, stagger.
   Content stays visible without this file. Hide-then-reveal runs only after
   .motion-on is set, and only on elements still below the fold. */
(function start() {
  if (!window.Motion || !window.Motion.animate) {
    start.tries = (start.tries || 0) + 1;
    if (start.tries <= 40) window.setTimeout(start, 25);
    return;
  }
  var Motion = window.Motion;

  var animate = Motion.animate;
  var scroll = Motion.scroll;
  var inView = Motion.inView;
  var stagger = Motion.stagger;
  var EASE = [0.22, 1, 0.36, 1];
  var SPRING = { type: "spring", stiffness: 320, damping: 34, mass: 0.85 };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var drawerToken = 0;
  var drawerAnims = [];

  function shown(drawer, scrim, opening) {
    if (drawer) drawer.hidden = !opening;
    if (scrim) scrim.hidden = !opening;
  }

  function stopDrawerAnims() {
    drawerAnims.forEach(function (anim) {
      try { anim.stop(); } catch (err) { /* already stopped */ }
    });
    drawerAnims = [];
  }

  window.IT_MOTION = {
    drawer: function (drawer, scrim, opening, settle) {
      var done = settle || shown;
      if (!drawer || reduced) {
        done(opening);
        return;
      }
      var token = ++drawerToken;
      stopDrawerAnims();
      try {
        if (opening) {
          done(true);
          drawer.style.transform = "translateX(100%)";
          if (scrim) scrim.style.opacity = "0";
          drawerAnims.push(animate(drawer, { x: "0%" }, SPRING));
          if (scrim) drawerAnims.push(animate(scrim, { opacity: 1 }, { duration: 0.32, ease: EASE }));
        } else if (drawer.hidden) {
          done(false);
        } else {
          var anim = animate(drawer, { x: "100%" }, SPRING);
          drawerAnims.push(anim);
          if (scrim) drawerAnims.push(animate(scrim, { opacity: 0 }, { duration: 0.26, ease: EASE }));
          anim.finished.then(function () {
            if (token !== drawerToken) return;
            drawer.style.transform = "";
            if (scrim) scrim.style.opacity = "";
            done(false);
          });
        }
      } catch (err) {
        done(opening);
      }
    }
  };

  function boot() {
    if (reduced) return;
    document.documentElement.classList.add("motion-on");
    heroEntrance();
    heroParallax();
    reveal();
    stepRails();
    window.setTimeout(function () {
      document.querySelectorAll(".motion-hold").forEach(function (el) {
        el.classList.remove("motion-hold");
      });
    }, 12000);
  }

  function early() {
    return performance.now() < 300;
  }

  function rise(nodes, start) {
    var list = Array.prototype.slice.call(nodes || []).filter(Boolean);
    if (!list.length || !early()) return;
    animate(list, { y: [12, 0] }, {
      duration: 0.26,
      delay: stagger(0.04, { startDelay: start || 0 }),
      ease: EASE
    });
  }

  function heroEntrance() {
    var hero = document.querySelector(".hero-copy");
    if (hero) rise(hero.querySelectorAll(".eyebrow, h1, .lede, .actions"));
    var proof = document.querySelectorAll(".hero .proof li");
    if (proof.length) rise(proof, 0.12);
    var em = document.querySelector(".em-hero .copy");
    if (em) rise(em.querySelectorAll(".em-kicker, h1, .sub, .cta-row"));
    var legal = document.querySelector("main.legal");
    if (legal) {
      rise([legal.querySelector(":scope > .kicker"), legal.querySelector(":scope > h1"), legal.querySelector(":scope > .lede")]);
    }
    var quote = document.querySelector("main.wrap");
    if (quote) rise(quote.querySelectorAll(":scope > .eyebrow, :scope > h1, :scope > .lede, :scope > .lead-only, :scope > .prep"));
  }

  function heroParallax() {
    function bind(node, frame) {
      if (!node || !frame) return;
      scroll(function (progress) {
        var p = Math.min(Math.max(progress, 0), 1);
        if (p === 0) {
          node.style.transform = "";
          return;
        }
        node.style.transform = "translate3d(0, " + (p * 18).toFixed(2) + "px, 0) scale(" + (1 + p * 0.06).toFixed(4) + ")";
      }, { target: frame, offset: ["start start", "end start"] });
    }
    var photo = document.querySelector(".hero-photo");
    bind(photo, photo && photo.closest(".hero"));
    var em = document.querySelector(".em-hero img");
    bind(em, em && em.closest(".em-hero"));
  }

  function belowFold(el) {
    var rect = el.getBoundingClientRect();
    return rect.top > window.innerHeight * 0.92;
  }

  function blocked(el) {
    return !!(el.closest("form, header, footer, #drawer, #event-bar, .hero, .em-hero, .skip") || el.querySelector("form"));
  }

  function reveal() {
    var selectors = [
      ".path-split > article",
      ".compare-grid > article",
      ".process ol > li",
      ".rate-card .rate",
      ".trust-strip li",
      ".reel > article",
      ".cuts > article",
      "ol.hour > li",
      "main.legal > h2",
      "main.legal > ul",
      "main.legal > ol",
      "main.legal > .path-split",
      ".em-scene",
      "main > section.section",
      ".file-trust"
    ];
    var seen = new Set();
    var all = [];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (seen.has(el) || blocked(el) || !belowFold(el)) return;
        seen.add(el);
        all.push(el);
      });
    });
    var fine = all.filter(function (el) {
      return !all.some(function (other) { return other !== el && el.contains(other); });
    });
    var groups = new Map();
    fine.forEach(function (el) {
      var key = el.parentElement || document.body;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    groups.forEach(function (group) {
      inView(group, function () {
        var pending = group.filter(function (el) {
          if (!el.classList.contains("motion-hold")) return false;
          return el.getBoundingClientRect().top < window.innerHeight * 0.96;
        });
        if (!pending.length) return;
        pending.forEach(function (el) { el.classList.remove("motion-hold"); });
        var anim = animate(pending, { opacity: [0, 1], y: [16, 0] }, {
          duration: 0.48,
          delay: stagger(0.06),
          ease: EASE
        });
        anim.finished.then(function () {
          pending.forEach(function (el) {
            el.style.opacity = "";
            el.style.transform = "";
          });
        });
      }, { margin: "0px 0px -8% 0px" });
      group.forEach(function (el) { el.classList.add("motion-hold"); });
    });
  }

  function stepRails() {
    document.querySelectorAll(".process ol, .path-split ol, ol.hour").forEach(function (ol) {
      if (ol.closest("form")) return;
      var items = Array.prototype.slice.call(ol.querySelectorAll(":scope > li"));
      if (items.length < 2) return;
      items.forEach(function (li) {
        li.classList.add("has-step-mark");
        var mark = document.createElement("span");
        mark.className = "step-mark";
        mark.setAttribute("aria-hidden", "true");
        li.appendChild(mark);
      });
      scroll(function (progress) {
        items.forEach(function (li, i) {
          var start = i / items.length;
          var end = (i + 1) / items.length;
          var local = (progress - start) / (end - start);
          var scale = Math.max(0, Math.min(1, local));
          var mark = li.querySelector(".step-mark");
          if (mark) mark.style.transform = "scaleY(" + scale + ")";
        });
      }, { target: ol, offset: ["start 75%", "end 50%"] });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
