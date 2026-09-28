// Home-only "doors of light" entrance. Loaded on / only (see storefront.Routs.js).
// The overlay markup (home.js) is aria-hidden and hidden in CSS unless html carries both
// .fx-motion and .fx-entrance — so no-JS and reduced-motion visitors never see it, and this
// module is the only thing that ever adds .fx-entrance.
import { motion } from "./fx.js";

const STAMP_KEY = "nsamat_entrance";
const STAMP_TTL_MS = 30 * 24 * 60 * 60_000;

function alreadyShown() {
  try {
    const t = Number(localStorage.getItem(STAMP_KEY));
    return Number.isFinite(t) && Date.now() - t < STAMP_TTL_MS;
  } catch { return false; } // storage blocked: fail open (skip), never crash the entrance
}

function stamp() {
  try { localStorage.setItem(STAMP_KEY, String(Date.now())); } catch { /* private mode */ }
}

const overlay = document.querySelector("[data-fx-entrance]");

function play() {
  if (!motion || !overlay || alreadyShown()) return;
  stamp(); // written at the start, per spec — a reload mid-play must not replay it
  const html = document.documentElement;
  html.classList.add("fx-entrance");

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    html.classList.remove("fx-entrance");
    overlay.remove();
    removeEventListener("pointerdown", finish, true);
    removeEventListener("keydown", finish, true);
    removeEventListener("scroll", finish, true);
  };
  // pointer-events: none is set in CSS from the first frame (no JS needed for that part), but any
  // input still cancels the animation outright so it never lingers.
  addEventListener("pointerdown", finish, true);
  addEventListener("keydown", finish, true);
  addEventListener("scroll", finish, true);
  overlay.querySelector(".fx-entrance-sweep")?.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 900); // safety net just past the 800ms budget
}

play();
