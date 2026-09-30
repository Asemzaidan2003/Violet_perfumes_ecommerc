// Browser Back/Forward guard for BrowserRouter (no useBlocker): while active, a sentinel history entry
// (same URL) sits on top; Back pops it, we re-push it and ask. `win` is injectable for tests.
export function installBackGuard(win, onBack) {
  const push = () => win.history.pushState({ ...win.history.state, guard: true }, "", win.location.href);
  const onPop = () => {
    if (win.history.state?.guard) return; // landed on the sentinel (e.g. Forward): nothing to do
    push(); // one sentinel at a time: re-pushed only after it was popped
    onBack();
  };
  win.addEventListener("popstate", onPop);
  push();
  const detach = () => win.removeEventListener("popstate", onPop);
  return {
    // Remove the sentinel without leaving the page (dirty cleared, submit started, unmount).
    dispose() { detach(); if (win.history.state?.guard) win.history.back(); },
    // Really leave via Back: sentinel + form entry are both behind us.
    exit() { detach(); win.history.go(-2); },
    // In-app navigation: drop the sentinel first so no dead-end entry stays behind.
    leaveTo(fn) {
      detach();
      if (!win.history.state?.guard) return fn();
      win.addEventListener("popstate", () => fn(), { once: true });
      win.history.back();
    },
  };
}
