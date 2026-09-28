// Promotion slots (loaded only when a placement is live): announcement rotation and dismissal,
// and the hero slider. Entry module, no exports. Motion is off under prefers-reduced-motion.
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const DISMISS_KEY = "nsamat_announce_dismissed";
const ANNOUNCE_MS = 5000;
const SLIDE_MS = 6000;
const SWIPE_PX = 40;

function safely(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// Runs `step` every `ms` while nothing pauses it: hover, focus inside `root`, a hidden tab, or
// reduced motion. `restart()` resets the countdown after a manual change.
function autoplay(root, ms, step) {
  let timer = 0;
  let hover = false;
  let focus = false;
  const stop = () => { clearInterval(timer); timer = 0; };
  const start = () => {
    stop();
    if (!hover && !focus && !document.hidden && !reducedMotion.matches) timer = setInterval(step, ms);
  };
  root.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hover = true; stop(); } });
  root.addEventListener("pointerleave", () => { hover = false; start(); });
  root.addEventListener("focusin", () => { focus = true; stop(); });
  root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) { focus = false; start(); } });
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", start);
  start();
  return { restart: start, stop };
}

// --- Announcement bar: dismissed for the session; several items rotate.
function initAnnouncement(bar) {
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked: show it */ }
  if (dismissed) { bar.hidden = true; return; }
  const items = [...bar.querySelectorAll(".announce-item")];
  const play = items.length > 1 && autoplay(bar, ANNOUNCE_MS, () => {
    const i = items.findIndex((el) => !el.hidden);
    items[i].hidden = true;
    items[(i + 1) % items.length].hidden = false;
  });
  bar.querySelector("[data-announce-close]").addEventListener("click", () => {
    if (play) play.stop();
    bar.hidden = true;
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* hidden for this page only */ }
    document.getElementById("main")?.focus();
  });
}

// --- Hero slider: arrows, dots, swipe and auto-advance. Slides cross-fade in one grid cell.
function initHero(hero) {
  const slides = [...hero.querySelectorAll("[data-slide]")];
  const dots = [...hero.querySelectorAll("[data-hero-dot]")];
  const controls = hero.querySelector("[data-hero-controls]");
  let current = 0;
  const show = (n) => {
    current = (n + slides.length) % slides.length;
    slides.forEach((s, i) => {
      s.classList.toggle("is-active", i === current);
      s.inert = i !== current; // off-screen slides are neither focusable nor read out
    });
    dots.forEach((d, i) => (i === current ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  };
  const play = autoplay(hero, SLIDE_MS, () => show(current + 1));
  const go = (n) => { show(n); play.restart(); };

  hero.querySelector("[data-hero-next]").addEventListener("click", () => go(current + 1));
  hero.querySelector("[data-hero-prev]").addEventListener("click", () => go(current - 1));
  for (const d of dots) d.addEventListener("click", () => go(Number(d.dataset.heroDot)));

  // Swipe: horizontal pointer drags past a threshold. RTL: dragging towards the right is "next".
  let startX = null;
  const track = hero.querySelector("[data-hero-track]");
  track.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") startX = e.clientX; });
  track.addEventListener("pointerup", (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    const rtl = getComputedStyle(hero).direction === "rtl";
    go(current + ((dx > 0) === rtl ? 1 : -1));
  });
  track.addEventListener("pointercancel", () => { startX = null; });

  show(0);
  controls.hidden = false;
  hero.classList.add("is-live");
}

for (const bar of document.querySelectorAll("[data-announce]")) safely(() => initAnnouncement(bar));
for (const hero of document.querySelectorAll("[data-hero-slider]")) safely(() => initHero(hero));
