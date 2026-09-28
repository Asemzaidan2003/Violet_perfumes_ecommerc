// Desktop home hero 3D bottle. Dynamically imported only when `homeHero3d` is true (fx.js, via
// requestIdleCallback) — never requested on mobile, under reduced motion, or without WebGL2.
import * as THREE from "three";
import { createBottle, createStage, frameCameraToObject } from "./bottle3d.js";

const MAX_TILT_DEG = 12;

// startHero3d(slotEl) — slotEl is the `.hero-display` element; it already holds the static SVG
// (kept as the LCP-safe fallback) and an empty `canvas.hero3d-canvas[hidden]`.
export async function startHero3d(slotEl) {
  const canvas = slotEl.querySelector(".hero3d-canvas");
  if (!canvas) return;

  const stage = createStage(THREE, canvas);
  const bottle = await createBottle(THREE);
  stage.scene.add(bottle);
  const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
  key.position.set(2, 4, 3);
  const rim = new THREE.DirectionalLight(0xd4af37, 0.9);
  rim.position.set(-3, 2, -2);
  stage.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

  function resize() {
    const rect = slotEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height || w);
    stage.renderer.setSize(w, h, false);
    stage.camera.aspect = w / h;
    stage.camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const center = frameCameraToObject(THREE, stage.camera, bottle, 1.3);
  const baseRotation = bottle.rotation.y;

  await stage.renderer.compileAsync(stage.scene, stage.camera);

  // Reveal the canvas over the SVG only after the first real frame is painted — the SVG stays
  // the LCP element until then.
  stage.render();
  canvas.hidden = false;
  requestAnimationFrame(() => canvas.classList.add("is-in"));

  // Pointer tilt: lerped, capped at MAX_TILT_DEG, RTL-agnostic (screen-space).
  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  function onPointerMove(e) {
    const rect = slotEl.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    targetX = Math.max(-1, Math.min(1, nx));
    targetY = Math.max(-1, Math.min(1, ny));
  }
  addEventListener("pointermove", onPointerMove);

  // Pause guards: off-screen and hidden-tab are handled inside stage.render() itself; this adds
  // "not the active hero slide" on top (promo.js dispatches hero:change on the slider element).
  let slideActive = true;
  const hero = slotEl.closest(".hero");
  function onHeroChange(e) {
    const brandActive = e.detail?.index === 0;
    slideActive = brandActive;
  }
  if (hero?.hasAttribute("data-hero-slider")) {
    hero.addEventListener("hero:change", onHeroChange);
  }

  let closed = false;
  let raf = null;
  function tick() {
    if (closed) return;
    raf = requestAnimationFrame(tick);
    if (!slideActive) return;
    curX += (targetX - curX) * 0.08;
    curY += (targetY - curY) * 0.08;
    const max = (MAX_TILT_DEG * Math.PI) / 180;
    bottle.rotation.y = baseRotation + curX * max;
    bottle.rotation.x = curY * max * 0.6;
    stage.render();
  }
  tick();

  function dispose() {
    if (closed) return;
    closed = true;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("pointermove", onPointerMove);
    removeEventListener("pagehide", dispose);
    hero?.removeEventListener("hero:change", onHeroChange);
    stage.dispose();
  }
  addEventListener("pagehide", dispose);

  return { dispose, center };
}
