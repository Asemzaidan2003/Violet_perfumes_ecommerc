import { useSyncExternalStore } from "react";

const KEY = "nsamat-admin-theme";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: theme just isn't remembered */ } };

export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function initTheme() {
  applyTheme(read() === "dark" ? "dark" : "light");
}

const subscribe = (cb) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
};
const getTheme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");

// One source of truth: the <html class="dark"> state, so every mounted consumer (both UserActions, the toaster) stays in sync.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    write(next);
    applyTheme(next);
  };
  return { theme, toggle };
}
