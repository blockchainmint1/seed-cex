import type { TokenRow } from "./erc-tokens";

export type TokenChoice = "show" | "hide" | "spam" | "remove";
export type TokenPreferences = { hideSpam: boolean; choices: Record<string, TokenChoice> };
export const defaultTokenPreferences = (): TokenPreferences => ({ hideSpam: true, choices: {} });
export const tokenId = (t: Pick<TokenRow, "chain" | "contract">) => `${t.chain}:${t.contract.toLowerCase()}`;

export function hiddenReason(t: TokenRow, prefs: TokenPreferences): string | null {
  const choice = prefs.choices[tokenId(t)];
  if (choice === "remove") return "Removed from balances";
  if (choice === "spam") return "Marked as spam";
  if (choice === "hide") return "Hidden by you";
  if (choice === "show") return null;
  if (prefs.hideSpam && !t.swappable) return t.suspectedSpam ? "Suspected spam" : "Not checked by Seeds";
  return null;
}

/** Browser data is untrusted and never grants a token a trading action. */
export function readTokenPreferences(raw: string | null): TokenPreferences {
  const out = defaultTokenPreferences();
  if (!raw) return out;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return out;
    const d = data as Record<string, unknown>;
    if (typeof d["hideSpam"] === "boolean") out.hideSpam = d["hideSpam"];
    const choices = d["choices"];
    if (choices && typeof choices === "object") {
      for (const [id, choice] of Object.entries(choices)) {
        if (/^(ethereum|base):0x[0-9a-f]{40}$/.test(id) && (choice === "show" || choice === "hide" || choice === "spam" || choice === "remove")) out.choices[id] = choice;
      }
    }
  } catch { /* Start safely when a saved preference is unreadable. */ }
  return out;
}