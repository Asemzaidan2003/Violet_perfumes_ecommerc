// Procedural signature glass bottle, and the shared render stage used by both the product 360°
// viewer (viewer360.js, Task 3) and the desktop home hero (hero3d.js, Task 4). No model files:
// everything below is built from primitives so `three` stays the only asset request.
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// createBottle(THREE, { tint, label }) → Promise<THREE.Group>
export async function createBottle(THREE, { tint = "#D4AF37", label = "نسمات" } = {}) {
  const group = new THREE.Group();

  // Body profile (LatheGeometry): base → shoulder → neck → lip.
  const profile = [
    [0, 0], [0.55, 0], [0.6, 0.15], [0.55, 1.6], [0.3, 1.75], [0.22, 2.0], [0.22, 2.2], [0, 2.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 48),
    new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, ior: 1.5, thickness: 0.5, color: 0xffffff, clearcoat: 0.2 })
  );
  group.add(glass);

  // Inner liquid, slightly narrower than the glass, tinted with the product's family swatch.
  const liquidProfile = profile.slice(0, 4).map((p) => new THREE.Vector2(p.x * 0.88, p.y));
  const liquid = new THREE.Mesh(
    new THREE.LatheGeometry(liquidProfile, 48),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint), transmission: 0.6, roughness: 0.2, ior: 1.33 })
  );
  group.add(liquid);

  // Metallic gold cap.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 0.35, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.25 })
  );
  cap.position.y = 2.375;
  group.add(cap);

  // Label: a canvas texture, drawn only after the Arabic display face is ready.
  await document.fonts.load('700 48px "El Messiri"');
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.direction = "rtl";
  ctx.fillStyle = "#f4efe6";
  ctx.font = '700 48px "El Messiri"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6 })
  );
  labelMesh.position.set(0, 1.0, 0.56);
  group.add(labelMesh);

  return group;
}

// createStage(THREE, canvas) → { renderer, scene, camera, render(), dispose() }
// The caller drives its own requestAnimationFrame loop and calls render() each tick; render()
// self-guards: it no-ops off-screen, on a hidden tab, or once the running average frame time
// exceeds 50ms over ~2s (it then keeps whatever was last painted).
export function createStage(THREE, canvas) {
  window.__fxRenderers = (window.__fxRenderers || 0) + 1;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 1.1, 5);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  let visible = true;
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.01 })
    : null;
  io?.observe(canvas);

  let stalled = false;
  let lastTime = null;
  const frameTimes = [];

  function render() {
    if (stalled || document.hidden || !visible) return;
    const now = performance.now();
    if (lastTime != null) {
      frameTimes.push(now - lastTime);
      if (frameTimes.length > 40) frameTimes.shift();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      if (frameTimes.length >= 20 && avg > 50) { stalled = true; return; } // keep the last painted frame
    }
    lastTime = now;
    renderer.render(scene, camera);
  }

  function dispose() {
    io?.disconnect();
    pmrem.dispose();
    renderer.dispose();
    scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).filter(Boolean).forEach((m) => m.dispose?.());
    });
    window.__fxRenderers = Math.max(0, (window.__fxRenderers || 1) - 1);
  }

  return { renderer, scene, camera, render, dispose };
}
