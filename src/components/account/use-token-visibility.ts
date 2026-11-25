import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultTokenPreferences, readTokenPreferences, tokenId, type TokenChoice, type TokenPreferences } from "@/lib/account/token-visibility";
import type { TokenRow } from "@/lib/account/erc-tokens";

/** Account-scoped, browser-only display choices; never used by balances or sends. */
export function useTokenVisibility(userId: string | undefined) {
  const key = userId ? `seeds:token-visibility:v1:${userId}` : null;
  const [saved, setSaved] = useState<{ key: string | null; prefs: TokenPreferences }>({ key: null, prefs: defaultTokenPreferences() });
  useEffect(() => {
    if (!key) return;
    const load = () => {
      try { setSaved({ key, prefs: readTokenPreferences(localStorage.getItem(key)) }); }
      catch { setSaved({ key, prefs: defaultTokenPreferences() }); }
    };
    load();
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) load(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const prefs = saved.key === key ? saved.prefs : defaultTokenPreferences();
  const update = (next: TokenPreferences) => {
    if (!key) return;
    setSaved({ key, prefs: next });
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { toast.error("This browser couldn't save your token choices. They'll reset when you reload."); }
  };
  return {
    prefs,
    setHideSpam: (hideSpam: boolean) => update({ ...prefs, hideSpam }),
    choose: (token: TokenRow, choice: TokenChoice) => update({ ...prefs, choices: { ...prefs.choices, [tokenId(token)]: choice } }),
  };
}