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
    new THREE.MeshPhysicalMaterial({
      transmission: 1,
      roughness: 0.05,
      ior: 1.5,
      thickness: 0.4,
      color: 0xffffff,
      opacity: 0.35,
      transparent: true,
      attenuationColor: new THREE.Color(0xd9b45e),
      attenuationDistance: 1.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.4,
    })
  );
  group.add(glass);

  // Inner liquid — visibly gold-amber, smaller than the glass so it reads as contents, not the vessel.
  const liquidProfile = profile.slice(0, 4).map((p) => new THREE.Vector2(p.x * 0.8, p.y * 0.92));
  const liquid = new THREE.Mesh(
    new THREE.LatheGeometry(liquidProfile, 48),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(tint),
      transmission: 0.4,
      roughness: 0.15,
      ior: 1.33,
      attenuationColor: new THREE.Color(tint),
      attenuationDistance: 0.6,
      envMapIntensity: 1.2,
    })
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

// frameCameraToObject(THREE, camera, object, marginFactor) — fits the camera distance to the
// object's bounding box for the camera's fov/aspect, with a margin, and centres the camera on it.
// Returns the box centre (useful as an OrbitControls target).
export function frameCameraToObject(THREE, camera, object, marginFactor = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fovV = camera.fov * (Math.PI / 180);
  const distV = (size.y / 2) / Math.tan(fovV / 2);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * (camera.aspect || 1));
  const distH = (size.x / 2) / Math.tan(fovH / 2);
  const distance = Math.max(distV, distH) * marginFactor;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return center;
}

// createStage(THREE, canvas) → { renderer, scene, camera, render(), dispose() }
// The caller drives its own requestAnimationFrame loop and calls render() each tick; render()
// self-guards: it no-ops off-screen, on a hidden tab, or once the running average frame time
// exceeds 50ms over ~2s (it then keeps whatever was last painted).
export function createStage(THREE, canvas) {
  window.__fxRenderers = (window.__fxRenderers || 0) + 1;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  let badStreak = 0;
  const frameTimes = [];

  function render() {
    if (stalled || document.hidden || !visible) return;
    const now = performance.now();
    if (lastTime != null) {
      const dt = now - lastTime;
      frameTimes.push(dt);
      if (frameTimes.length > 40) frameTimes.shift();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      if (frameTimes.length >= 20 && avg > 50) { stalled = true; return; } // keep the last painted frame
      // A pathologically slow single frame (e.g. a software/CPU rasterizer with no real GPU) would
      // otherwise take ~2s of consecutive bad frames before the rolling average above reacts —
      // three such frames in a row is enough to stop immediately instead of grinding the main
      // thread further.
      badStreak = dt > 500 ? badStreak + 1 : 0;
      if (badStreak >= 3) { stalled = true; return; }
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
