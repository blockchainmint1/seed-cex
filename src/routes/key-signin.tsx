import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { claimKeySignin, startKeySignin } from "@/lib/key-signin/key-signin.functions";
import { takeReturnPath } from "@/lib/return-path";
import { Button } from "@/components/ui/button";

type Kind = "coin" | "wallet";

export const Route = createFileRoute("/key-signin")({
  staticData: { sitemap: false },
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { kind: Kind } => ({ kind: s.kind === "wallet" ? "wallet" : "coin" }),
  head: () => ({
    meta: [
      { title: "Start with a coin or wallet — Seeds" },
      { name: "description", content: "Open a Seeds account by scanning your Cold Storage Coin or signing with MetaMask, Ledger, Trezor or Phantom. Your recovery phrase never reaches Seeds." },
      { property: "og:title", content: "Start with a coin or wallet — Seeds" },
      { property: "og:description", content: "Scan your coin or sign with your wallet on the Seeds Key page. Seeds never sees your recovery phrase." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: KeySignin,
});

type Req = { id: string; secret: string; keyPageUrl: string | null; expiresAt: string };

function KeySignin() {
  const { kind } = Route.useSearch();
  const start = useServerFn(startKeySignin);
  const claim = useServerFn(claimKeySignin);
  const navigate = useNavigate();
  const [req, setReq] = useState<Req | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"starting" | "waiting" | "signing" | "expired">("starting");
  const started = useRef<string | null>(null);

  async function begin() {
    setError(null);
    setState("starting");
    try {
      const r = await start({ data: { origin: window.location.origin, kind } });
      // Kept in this tab only: the Seeds Key page may open in this same tab and come back.
      sessionStorage.setItem("seeds-key-req", JSON.stringify({ ...r, kind }));
      setReq(r);
      setState("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Try again.");
    }
  }

  useEffect(() => {
    if (started.current === kind) return;
    started.current = kind;
    try {
      const saved = JSON.parse(sessionStorage.getItem("seeds-key-req") ?? "null") as (Req & { kind: Kind }) | null;
      if (saved && saved.kind === kind && new Date(saved.expiresAt) > new Date()) { setReq(saved); setState("waiting"); return; }
    } catch { /* start fresh */ }
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (!req || state !== "waiting") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await claim({ data: { id: req.id, secret: req.secret } });
        if (r.status === "ready") {
          stop = true;
          setState("signing");
          sessionStorage.removeItem("seeds-key-req");
          const { error: err } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
          if (err) throw err;
          navigate({ href: r.isNew ? "/welcome" : takeReturnPath(), replace: true });
          return;
        }
        if (r.status === "expired" || r.status === "used") { stop = true; sessionStorage.removeItem("seeds-key-req"); setState("expired"); return; }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
      if (!stop) setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(t); };
  }, [req, state, claim, navigate]);

  const coin = kind === "coin";
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <div className="max-w-xl">
        <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Seeds never sees your recovery phrase</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{coin ? "Start with your coin" : "Use your own wallet"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {coin
            ? "Scan the QR on your Cold Storage Coin on the Seeds Key page. It works out your sign-in and a small trading pocket on your phone, forgets the phrase, and sends Seeds only those two things."
            : "Sign one message with MetaMask, Ledger, Trezor, Phantom or a phone wallet on the Seeds Key page. That signature becomes your Seeds trading pocket on your device. The same wallet can always rebuild it."}
        </p>

        <div className="mt-6 flex gap-2 text-sm">
          <Link to="/key-signin" search={{ kind: "coin" }} className={`rounded-md border px-3 py-1.5 ${coin ? "border-primary text-primary" : "border-border text-muted-foreground"}`}><KeyRound className="mr-1 inline h-4 w-4" />Coin</Link>
          <Link to="/key-signin" search={{ kind: "wallet" }} className={`rounded-md border px-3 py-1.5 ${!coin ? "border-primary text-primary" : "border-border text-muted-foreground"}`}><Wallet className="mr-1 inline h-4 w-4" />Other wallet</Link>
        </div>

        <section className="mt-6 rounded-md border border-border bg-surface p-5">
          {state === "starting" ? <p className="text-sm text-muted-foreground">Getting a one-time sign-in ready…</p> : null}
          {state === "signing" ? <p className="text-sm text-primary">Signed in. Opening your account…</p> : null}
          {state === "expired" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">That sign-in request ran out or was already used.</p>
              <Button onClick={() => void begin()}>Start again</Button>
            </div>
          ) : null}
          {state === "waiting" && req ? (
            req.keyPageUrl ? (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-md border border-border bg-background p-3 text-foreground">
                  <QRCodeSVG value={req.keyPageUrl} size={168} bgColor="transparent" fgColor="currentColor" />
                </div>
                <div className="min-w-0 space-y-3 text-sm">
                  <p><b>On a computer?</b> Scan this with your phone's camera to open the Seeds Key page{coin ? ", then scan your coin." : "."}</p>
                  <p><b>On your phone?</b> Open it right here.</p>
                  <Button asChild><a href={req.keyPageUrl}><ExternalLink /> Open Seeds Key</a></Button>
                  <p className="font-mono text-[11px] text-muted-foreground">Waiting for the Seeds Key page… this works once, for 10 minutes.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">The Seeds Key page isn't switched on yet. For now, sign in with Honest.Money.</p>
            )
          ) : null}
          {error ? <p className="mt-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{error}</p> : null}
        </section>

        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Seeds only gets the keys to your trading pocket, the same as an HME Wallet link. You can revoke them any time in Account → Security.</li>
          {coin ? <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Treat the coin like cash. Anyone holding it, or a photo of its QR, can open this account. Move your funds before you give it away.</li> : null}
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Withdrawals to outside addresses unlock once you add an email (or join Honest.Money), with 2FA and Telegram like everyone else.</li>
        </ul>
        <p className="mt-6 text-sm"><Link to="/auth" className="text-primary underline-offset-4 hover:underline">← Sign in with Honest.Money instead</Link></p>
      </div>
    </div>
  );
}
