import { useEffect, useState } from "react";
import "./App.css";

type Theme = "light" | "dark";

const STORAGE_KEY = "lcw-theme";

/** Saved choice wins; otherwise fall back to the system preference. */
function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be blocked — fall through to the system preference */
  }
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked — the choice still applies for this visit */
    }
  }

  const nextName = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn btn-quiet theme-toggle"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={`Switch to ${nextName} mode`}
      title={`Switch to ${nextName} mode`}
      onClick={toggle}
    >
      <span className="theme-glyph" aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
      <span className="theme-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
