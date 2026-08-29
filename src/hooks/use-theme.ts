import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "seeds-theme";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(KEY);
  return saved === "light" ? "light" : "dark";
}

/** Dark-first theme toggle; persists to localStorage and toggles `.dark` on <html>. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle };
}
