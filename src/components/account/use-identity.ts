import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyIdentity } from "@/lib/key-signin/key-signin.functions";
import { isKeyKind, type KeyKind } from "@/lib/account/sign-in-kind";

/** How this member signs in (Honest.Money, coin or outside wallet), their real email and HME membership. */
export function useMyIdentity() {
  const load = useServerFn(getMyIdentity);
  const q = useQuery({ queryKey: ["my-identity"], queryFn: () => load(), staleTime: 30_000 });
  const kind = q.data?.kind ?? "hme";
  const pocket = q.data?.pocket ?? { kind: "hme" as const, viaLink: false };
  return {
    ...q,
    /** How the member signs in: a coin / wallet key, or null for Honest.Money. */
    keyKind: isKeyKind(kind) ? (kind as KeyKind) : null,
    /** The key their trading pocket comes from (also when an Honest.Money member linked a coin or wallet), or null for HME Wallet. */
    pocketKeyKind: isKeyKind(pocket.kind) ? (pocket.kind as KeyKind) : null,
    /** True when that key was linked to an Honest.Money account: "re-link" = link it again, not sign in with it. */
    pocketViaLink: pocket.viaLink,
  };
}

/** Opens the Honest.Money sign-in popup that joins an HME membership to this coin / wallet account. */
export function useJoinHonestMoney() {
  const qc = useQueryClient();
  const listener = useRef<((ev: MessageEvent) => void) | null>(null);
  useEffect(() => () => { if (listener.current) window.removeEventListener("message", listener.current); }, []);
  return () => {
    try { localStorage.setItem("seeds-sso-attach", String(Date.now())); } catch { /* ignore */ }
    const url = `https://honest.money/sso-login?popup=1&return_to=${encodeURIComponent(`${window.location.origin}/sso`)}`;
    const w = window.open(url, "hm-sso", "width=440,height=720");
    if (!w) { window.location.href = url.replace("popup=1&", ""); return; }
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== "seeds-sso-done") return;
      qc.invalidateQueries();
    };
    if (listener.current) window.removeEventListener("message", listener.current);
    listener.current = onMsg;
    window.addEventListener("message", onMsg);
  };
}
