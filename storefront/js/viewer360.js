// Product page 360° viewer. Dynamically imported only after the visitor clicks "عرض 360°"
// (product.js) — this file, and `three` itself, are never requested before that click.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBottle, createStage, frameCameraToObject } from "./bottle3d.js";

// openViewer360(galleryEl, { tint, label }) → { close() }
export async function openViewer360(galleryEl, { tint = "#D4AF37", label = "نسمات" } = {}) {
  const others = [...galleryEl.children];
  const restore = others.map((el) => [el, el.hidden]);
  others.forEach((el) => { el.hidden = true; });

  const wrap = document.createElement("div");
  wrap.className = "viewer360";

  const canvas = document.createElement("canvas");
  canvas.className = "viewer360-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `عرض ثلاثي الأبعاد لـ ${label}`);
  canvas.dataset.yaw = "0";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "viewer360-reset btn-icon";
  resetBtn.setAttribute("aria-label", "إعادة ضبط العرض");
  resetBtn.textContent = "↺";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "viewer360-close btn-icon";
  closeBtn.setAttribute("aria-label", "إغلاق العرض ثلاثي الأبعاد");
  closeBtn.textContent = "✕";

  wrap.append(canvas, resetBtn, closeBtn);
  galleryEl.append(wrap);

  const stage = createStage(THREE, canvas);
  const bottle = await createBottle(THREE, { tint, label });
  stage.scene.add(bottle);
  const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
  key.position.set(2, 4, 3);
  const rim = new THREE.DirectionalLight(0xd4af37, 0.9);
  rim.position.set(-3, 2, -2);
  stage.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height || w);
    stage.renderer.setSize(w, h, false);
    stage.camera.aspect = w / h;
    stage.camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const center = frameCameraToObject(THREE, stage.camera, bottle, 1.2);

  const controls = new OrbitControls(stage.camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.2;
  controls.target.copy(center);
  controls.update();
  controls.saveState();

  await stage.renderer.compileAsync(stage.scene, stage.camera);

  let closed = false;
  let raf = null;
  const stopAutoRotate = () => { controls.autoRotate = false; };
  canvas.addEventListener("pointerdown", stopAutoRotate, { once: true });

  function tick() {
    if (closed) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    canvas.dataset.yaw = controls.getAzimuthalAngle().toFixed(3);
    stage.render();
  }
  tick();

  function onReset() {
    controls.reset();
    controls.autoRotate = true;
    controls.update();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  function close() {
    if (closed) return;
    closed = true;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("pagehide", close);
    document.removeEventListener("keydown", onKey);
    controls.dispose();
    stage.dispose();
    wrap.remove();
    restore.forEach(([el, hidden]) => { el.hidden = hidden; });
  }

  closeBtn.addEventListener("click", close);
  resetBtn.addEventListener("click", onReset);
  document.addEventListener("keydown", onKey);
  addEventListener("pagehide", close);

  return { close };
}
