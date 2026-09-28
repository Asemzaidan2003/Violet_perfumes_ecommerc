// Capability gate for the immersive layer. Runs once per page, as early as possible.
// Everything downstream (CSS reveals, later tasks' 3D/flight/entrance) is additive and no-ops
// when its flag is false — nothing is ever hidden without html.fx-motion (added below).
function hasWebGL2() {
  try { return !!document.createElement("canvas").getContext("webgl2"); }
  catch { return false; }
}

export const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
export const rich3d = motion && hasWebGL2() && !navigator.connection?.saveData
  && (navigator.deviceMemory ?? 4) >= 4 && (navigator.hardwareConcurrency ?? 4) >= 4;
export const homeHero3d = rich3d && matchMedia("(pointer: fine) and (min-width: 1024px)").matches;

if (motion) document.documentElement.classList.add("fx-motion");

// Scroll reveals: CSS drives them under @supports (animation-timeline: view()); everywhere else
// (older Safari/Firefox) an IntersectionObserver toggles .is-in once, to the same end state.
if (motion && !CSS.supports("animation-timeline", "view()")) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -10% 0px" });
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
}

// Hero spotlight parallax: only the background beam layer moves, never the copy. A single rAF-
// throttled, passive scroll listener; no-ops (never attaches) without motion.
if (motion) {
  const heroArt = document.querySelector(".hero-display");
  if (heroArt) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = heroArt.getBoundingClientRect();
      heroArt.style.setProperty("--fx-parallax", `${Math.max(-24, Math.min(24, r.top * -0.06))}px`);
    };
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }
}

// View transitions: name the clicked card's image so it morphs into the product page's hero photo.
// Assigned at click time (not baked into markup) because the same product sits on several shelves
// and ObjectIds aren't valid CSS identifiers; the product page's own hero image is named in CSS.
document.addEventListener("click", (e) => {
  if (!document.startViewTransition && !("onpageswap" in window)) return;
  const link = e.target.closest("a.card-link");
  if (!link) return;
  const img = link.closest(".card")?.querySelector("[data-vt-img]");
  if (!img) return;
  img.style.viewTransitionName = "product-hero";
  setTimeout(() => { img.style.viewTransitionName = ""; }, 2000); // safety net if navigation never happens
});
