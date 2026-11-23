// Browser-only: remembers the first invite code this browser arrived with (Seeds' own copy,
// alongside Honest.Money's hm_ref cookie) so a new member's sign-up can be credited.
import { REF_REMEMBER_MS, cleanCode } from "./affiliates";

const KEY = "seeds_ref";

/** Saves ?ref= from the address bar if this browser has no fresh code yet (first code wins). */
export function captureRefFromUrl(search: string) {
  try {
    const code = cleanCode(new URLSearchParams(search).get("ref"));
    if (!code) return;
    const prev = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (prev?.code && prev.at && Date.now() - prev.at < REF_REMEMBER_MS) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch { /* storage blocked */ }
}

/** Honest.Money's saved code first (it decides the official sponsor), then Seeds' own copies. */
export function storedSignupRef(): string | null {
  try {
    const cookie = (name: string) => {
      const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
      return m ? decodeURIComponent(m[1]!) : "";
    };
    const hm = cleanCode(cookie("hm_ref") || localStorage.getItem("hm_ref") || "");
    if (hm) return hm;
    const mine = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (mine?.code && mine.at && Date.now() - mine.at < REF_REMEMBER_MS) return cleanCode(mine.code);
    return cleanCode(cookie(KEY));
  } catch {
    return null;
  }
}

/** Has this browser already sent its code for this account? */
export const refSentKey = (userId: string) => `seeds_ref_sent:${userId}`;
