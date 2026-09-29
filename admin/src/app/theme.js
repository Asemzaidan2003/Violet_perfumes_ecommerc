import { useState } from "react";

const KEY = "nsamat-admin-theme";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: theme just isn't remembered */ } };

export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function initTheme() {
  applyTheme(read() === "dark" ? "dark" : "light");
}

export function useTheme() {
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    write(next);
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}
