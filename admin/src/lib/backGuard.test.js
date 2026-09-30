import { test, expect } from "vitest";
import { installBackGuard, waitForGuardClear } from "./backGuard.js";

// Minimal history: entries [{state}], index; back/go dispatch popstate synchronously.
function fakeWin() {
  const entries = [{ state: { idx: 0 } }, { state: { idx: 1 } }];
  let i = 1;
  const ls = [];
  const win = {
    location: { href: "http://x/admin/p" },
    history: {
      get state() { return entries[i].state; },
      pushState(state) { entries.splice(i + 1); entries.push({ state }); i++; },
      go(n) { i += n; win.fire(); },
      back() { this.go(-1); },
    },
    addEventListener(_t, fn, opts) { ls.push({ fn, once: opts?.once }); },
    removeEventListener(_t, fn) { const k = ls.findIndex((l) => l.fn === fn); if (k >= 0) ls.splice(k, 1); },
    fire() { for (const l of [...ls]) { if (l.once) ls.splice(ls.indexOf(l), 1); l.fn(); } },
    entries: () => entries.length, index: () => i, listeners: () => ls.length,
  };
  return win;
}

test("Back asks once, keeps a single sentinel, Stay leaves state unchanged", () => {
  const w = fakeWin();
  let asked = 0;
  installBackGuard(w, () => asked++);
  expect(w.entries()).toBe(3);
  w.history.back();
  expect(asked).toBe(1);
  expect(w.history.state.guard).toBe(true); // re-pushed
  expect(w.entries()).toBe(3); // not stacked
  w.history.back();
  expect(asked).toBe(2);
  expect(w.entries()).toBe(3);
});

test("exit goes two entries back (really leaves)", () => {
  const w = fakeWin();
  const g = installBackGuard(w, () => {});
  w.history.back();
  g.exit();
  expect(w.index()).toBe(0);
  expect(w.listeners()).toBe(0);
});

test("dispose removes the sentinel and the listener; leaveTo drops it before navigating", () => {
  const w = fakeWin();
  installBackGuard(w, () => {}).dispose();
  expect(w.index()).toBe(1);
  expect(w.listeners()).toBe(0);
  const w2 = fakeWin();
  let at = null;
  installBackGuard(w2, () => {}).leaveTo(() => { at = w2.index(); });
  expect(at).toBe(1);
});

test("waitForGuardClear resolves immediately when guard is already falsy", async () => {
  const w = fakeWin();
  installBackGuard(w, () => {}).dispose(); // clears the sentinel
  const start = Date.now();
  await waitForGuardClear(w);
  expect(Date.now() - start).toBeLessThan(20);
});

test("waitForGuardClear resolves once guard clears after polling", async () => {
  const w = fakeWin();
  installBackGuard(w, () => {});
  expect(w.history.state.guard).toBe(true);
  setTimeout(() => { w.history.state.guard = false; }, 40);
  await waitForGuardClear(w);
  expect(w.history.state.guard).toBe(false);
});
