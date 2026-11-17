import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "seeds-theme";


/** Dark-first theme toggle; persists to localStorage and toggles `.dark` on <html>. */
export function useTheme() {
  // Server and first client render agree on "dark"; the saved choice is read
  // after hydration (the inline head script has already applied it to <html>).
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "light") setTheme("light");
    } catch {
      /* private mode */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme, ready]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle };
}
