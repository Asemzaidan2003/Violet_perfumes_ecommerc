// Add-to-cart flight: an image clone arcs from the product photo to the visible cart button.
// Web Animations only; RTL-aware for free since it works off real screen coordinates.
import { motion } from "./fx.js";

function visibleCartButton() {
  for (const el of document.querySelectorAll("[data-open-cart]")) {
    if (el.getClientRects().length) return el;
  }
  return null;
}

// flyToCart(sourceImg) → Promise<void>. Without motion, or if either element is missing/hidden,
// resolves immediately (no-op) so callers can always `await` it before opening the cart.
export function flyToCart(sourceImg) {
  const cartBtn = visibleCartButton();
  if (!motion || !sourceImg || !cartBtn) return Promise.resolve();
  const start = sourceImg.getBoundingClientRect();
  const end = cartBtn.getBoundingClientRect();
  if (!start.width || !end.width) return Promise.resolve();

  const clone = sourceImg.cloneNode(true);
  clone.removeAttribute("data-vt-img");
  clone.className = "fx-flight";
  clone.style.cssText = `left:${start.left}px; top:${start.top}px; width:${start.width}px; height:${start.height}px;`;
  document.body.appendChild(clone);

  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const lift = -Math.max(80, Math.abs(dx) * 0.4); // arc upward regardless of RTL/LTR direction

  navigator.vibrate?.(10);

  const anim = clone.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.6}px, ${dy * 0.6 + lift}px) scale(.5)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${dx}px, ${dy}px) scale(.1)`, opacity: .3, offset: 1 },
  ], { duration: 550, easing: "cubic-bezier(.2,.7,.2,1)" });

  return anim.finished.catch(() => {}).then(() => {
    clone.remove();
    cartBtn.animate(
      [{ scale: 1 }, { scale: 1.3 }, { scale: 1 }],
      { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)" },
    );
  });
}
