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

// Runs `step` every `ms` while nothing pauses it: the visitor's pause toggle, hover, focus inside
// `root`, a hidden tab or `root`, or reduced motion. `restart()` resets the countdown after a
// manual change; `setPaused()` is the visible pause control (WCAG 2.2.2).
function autoplay(root, ms, step) {
  let timer = 0;
  let hover = false;
  let focus = false;
  let paused = false;
  const stop = () => { clearInterval(timer); timer = 0; };
  const start = () => {
    stop();
    if (root.hidden || paused || hover || focus || document.hidden || reducedMotion.matches) return;
    timer = setInterval(step, ms);
  };
  root.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hover = true; stop(); } });
  root.addEventListener("pointerleave", () => { hover = false; start(); });
  root.addEventListener("focusin", () => { focus = true; stop(); });
  root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) { focus = false; start(); } });
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", start);
  start();
  return { restart: start, stop, setPaused: (v) => { paused = v; start(); } };
}

// --- Announcement bar: dismissed for the session; several items rotate.
function initAnnouncement(bar) {
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked: show it */ }
  if (dismissed) { bar.hidden = true; return; }
  const items = [...bar.querySelectorAll(".announce-item")];
  const play = items.length > 1 && autoplay(bar, ANNOUNCE_MS, () => {
    const i = items.findIndex((el) => !el.hidden);
    const next = items[(i + 1) % items.length];
    items[i].hidden = true;
    next.hidden = false;
    bar.classList.replace(items[i].dataset.theme, next.dataset.theme); // each item keeps its own theme
  });
  bar.querySelector("[data-announce-close]").addEventListener("click", () => {
    bar.hidden = true;
    if (play) play.stop();
    // The session cookie lets the server leave the bar out (no flash or shift on the next page);
    // sessionStorage covers a blocked cookie.
    document.cookie = `${DISMISS_KEY}=1; path=/; SameSite=Lax`;
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* hidden for this page only */ }
    document.getElementById("main")?.focus();
  });
}

// --- Hero slider: arrows, dots, swipe and auto-advance. Slides cross-fade in one grid cell.
function initHero(hero) {
  const slides = [...hero.querySelectorAll("[data-slide]")];
  const dots = [...hero.querySelectorAll("[data-hero-dot]")];
  const pause = hero.querySelector("[data-hero-pause]");
  let current = 0;
  const show = (n) => {
    current = (n + slides.length) % slides.length;
    slides.forEach((s, i) => {
      s.classList.toggle("is-active", i === current);
      s.inert = i !== current; // off-screen slides are neither focusable nor read out
    });
    dots.forEach((d, i) => (i === current ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    // hero3d.js (Task 4) listens for this to pause the 3D bottle when the brand slide isn't active.
    hero.dispatchEvent(new CustomEvent("hero:change", { detail: { index: current, active: slides[current] } }));
  };
  const play = autoplay(hero, SLIDE_MS, () => show(current + 1));
  const go = (n) => { show(n); play.restart(); };

  hero.querySelector("[data-hero-next]").addEventListener("click", () => go(current + 1));
  hero.querySelector("[data-hero-prev]").addEventListener("click", () => go(current - 1));
  for (const d of dots) d.addEventListener("click", () => go(Number(d.dataset.heroDot)));
  pause.addEventListener("click", () => {
    const paused = pause.getAttribute("aria-pressed") !== "true";
    pause.setAttribute("aria-pressed", String(paused));
    pause.setAttribute("aria-label", paused ? "تشغيل العرض التلقائي" : "إيقاف العرض التلقائي");
    play.setPaused(paused);
  });

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
  hero.classList.add("is-live"); // reveals the controls (their space is reserved from first paint)
}

for (const bar of document.querySelectorAll("[data-announce]")) safely(() => initAnnouncement(bar));
for (const hero of document.querySelectorAll("[data-hero-slider]")) safely(() => initHero(hero));
