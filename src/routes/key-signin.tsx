import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanQr } from "@/components/site/ScanQr";
import { ExternalLink, KeyRound, ShieldCheck, Vault, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { claimKeyLink, claimKeySignin, confirmKeyLink, confirmKeyReplace, dropKeyLink, dropKeyReplace, startKeyLink, startKeySignin } from "@/lib/key-signin/key-signin.functions";
import { takeReturnPath } from "@/lib/return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepUp, type StepUpProof } from "@/components/account/StepUp";

/** "vault" = HME Vault: signs in as a coin account, but the Seeds Key page opens its Vault scan straight away. */
type Kind = "coin" | "wallet" | "vault";

export const Route = createFileRoute("/key-signin")({
  staticData: { sitemap: false },
  ssr: false,
  // link=true: a member signed in with Honest.Money links this key as their trading pocket (same account, stays signed in).
  validateSearch: (s: Record<string, unknown>): { kind: Kind; link?: boolean } => {
    const kind: Kind = s.kind === "wallet" || s.kind === "vault" ? s.kind : "coin";
    return s.link === true || s.link === "true" || s.link === 1 || s.link === "1" ? { kind, link: true } : { kind };
  },
  head: () => ({
    meta: [
      { title: "Start with a coin, HME Vault or wallet — Seeds" },
      { name: "description", content: "Open a Seeds account with your Cold Storage Coin, HME Vault, or MetaMask, Ledger, Trezor or Phantom. Your recovery phrase never reaches Seeds." },
      { property: "og:title", content: "Start with a coin, HME Vault or wallet — Seeds" },
      { property: "og:description", content: "Scan your coin, use HME Vault or sign with your wallet on the Seeds Key page. Seeds never sees your recovery phrase." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: KeySignin,
});

type Req = { id: string; secret: string; keyPageUrl: string | null; expiresAt: string; pairCode?: string; vaultReady?: boolean };
type Ready = { tokenHash: string; isNew: boolean; who: string };
/** A sign-in that would replace the active pocket link with different keys (held until approved here). */
type Held = { id: string; secret: string; who: string; needsCode: boolean };
type State = "starting" | "waiting" | "confirm" | "replace" | "signing" | "expired" | "refused" | "link_confirm" | "linked" | "needs_signin";

/** The one real Seeds Key address, shown so members can spot a fake (auditor K4). Never changes. */
const KEY_HOST = "key.seeds.honest.money";

function KeySignin() {
  const { kind, link: linkMode = false } = Route.useSearch();
  const start = useServerFn(startKeySignin);
  const claim = useServerFn(claimKeySignin);
  const confirmReplace = useServerFn(confirmKeyReplace);
  const dropReplace = useServerFn(dropKeyReplace);
  const startLink = useServerFn(startKeyLink);
  const claimLink = useServerFn(claimKeyLink);
  const confirmLink = useServerFn(confirmKeyLink);
  const dropLink = useServerFn(dropKeyLink);
  const store = linkMode ? "seeds-key-link" : "seeds-key-req";
  const navigate = useNavigate();
  const [req, setReq] = useState<Req | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<State>("starting");
  // Link mode: "confirm it's you" before the held key may become the pocket (auditor H1).
  const [stepUp, setStepUp] = useState<{ ready: boolean; proof: StepUpProof }>({ ready: false, proof: null });
  const [stepUpKey, setStepUpKey] = useState(0);
  const [ready, setReady] = useState<Ready | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [code, setCode] = useState("");
  const started = useRef<string | null>(null);

  async function begin() {
    setError(null);
    setState("starting");
    try {
      if (linkMode) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { setState("needs_signin"); return; }
      }
      const r = linkMode
        ? await startLink({ data: { origin: window.location.origin, kind } })
        : await start({ data: { origin: window.location.origin, kind } });
      // Kept in this tab only: the Seeds Key page may open in this same tab and come back.
      sessionStorage.setItem(store, JSON.stringify({ ...r, kind }));
      setReq(r);
      setState("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Try again.");
    }
  }

  useEffect(() => {
    const startKey = `${linkMode ? "link" : "signin"}:${kind}`;
    if (started.current === startKey) return;
    started.current = startKey;
    try {
      const saved = JSON.parse(sessionStorage.getItem(store) ?? "null") as (Req & { kind: Kind }) | null;
      if (saved && saved.kind === kind && saved.pairCode && new Date(saved.expiresAt) > new Date()) { setReq(saved); setState("waiting"); return; }
    } catch { /* start fresh */ }
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, linkMode]);

  useEffect(() => {
    if (!req || state !== "waiting") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      if (linkMode) {
        try {
          const r = await claimLink({ data: { id: req.id, secret: req.secret } });
          if (r.status === "confirm") {
            stop = true;
            sessionStorage.removeItem(store);
            setHeld({ id: req.id, secret: req.secret, who: r.who, needsCode: r.needsCode });
            setState("link_confirm");
            return;
          }
          if (r.status === "linked") { stop = true; sessionStorage.removeItem(store); setState("linked"); return; }
          if (r.status === "expired") { stop = true; sessionStorage.removeItem(store); setState("expired"); return; }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Linking failed");
        }
        if (!stop) setTimeout(tick, 2000);
        return;
      }
      try {
        const r = await claim({ data: { id: req.id, secret: req.secret } });
        if (r.status === "ready") {
          // Don't open the account yet: show who signed in and let the member say it's them (auditor K2).
          stop = true;
          sessionStorage.removeItem("seeds-key-req");
          setReady({ tokenHash: r.tokenHash, isNew: r.isNew, who: r.who });
          setState("confirm");
          return;
        }
        if (r.status === "replace") {
          stop = true;
          sessionStorage.removeItem("seeds-key-req");
          setHeld({ id: req.id, secret: req.secret, who: r.who, needsCode: r.needsCode });
          setState("replace");
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
  }, [req, state, claim, claimLink, linkMode, store, navigate]);

  async function openAccount() {
    if (!ready) return;
    setState("signing");
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: ready.tokenHash });
      if (err) throw err;
      navigate({ href: ready.isNew ? "/welcome" : takeReturnPath(), replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setState("expired");
    }
  }

  function refuse() {
    setReady(null);
    if (held) void (linkMode ? dropLink : dropReplace)({ data: { id: held.id, secret: held.secret, code: null } }).catch(() => undefined);
    setHeld(null);
    setState("refused");
  }

  async function approveReplace() {
    if (!held) return;
    setError(null);
    const c = code.replace(/\s+/g, "");
    if (held.needsCode && !/^\d{6}$/.test(c)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setState("signing");
    try {
      const r = await confirmReplace({ data: { id: held.id, secret: held.secret, code: held.needsCode ? c : null } });
      const { error: err } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
      if (err) throw err;
      navigate({ href: takeReturnPath(), replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
      setState(/ran out|already used|Too many|changed in the meantime|Start again/i.test(msg) ? "expired" : "replace");
    }
  }

  async function approveLink() {
    if (!held) return;
    setError(null);
    if (!stepUp.ready) { setError("First confirm it's you (above)."); return; }
    setState("signing");
    try {
      await confirmLink({ data: { id: held.id, secret: held.secret, proof: stepUp.proof } });
      setHeld(null);
      setState("linked");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Linking failed";
      setError(msg);
      setStepUp({ ready: false, proof: null });
      setStepUpKey((k) => k + 1); // a spent proof can't be reused: show the check again
      setState(/ran out|already used|Too many|in the meantime|Start again/i.test(msg) ? "expired" : "link_confirm");
    }
  }

  const coin = kind === "coin";
  const vault = kind === "vault";
  const wallet = kind === "wallet";
  const tab = (on: boolean) => `rounded-md border px-3 py-1.5 ${on ? "border-primary text-primary" : "border-border text-muted-foreground"}`;
  const title = linkMode
    ? (vault ? "Link HME Vault" : coin ? "Link your Cold Storage Coin" : "Link your own wallet")
    : (vault ? "Use HME Vault" : coin ? "Start with your coin" : "Use your own wallet");
  const intro = linkMode
    ? `Your trading pocket will come from this ${vault ? "Vault" : coin ? "coin" : "wallet"}. You stay signed in with Honest.Money, on the same Seeds account. ${vault ? "Scan back and forth with your HME Vault phone on the Seeds Key page; Vault works out the pocket offline." : coin ? "Scan the QR on your coin on the Seeds Key page; it works out the pocket on your phone and forgets the phrase." : "Sign one message with MetaMask, Ledger, Trezor, Phantom or a phone wallet on the Seeds Key page."} Seeds only ever gets the pocket keys, never your recovery phrase.`
    : vault
    ? "Open the Seeds Key page, then scan back and forth with your HME Vault phone. Vault checks the request really came from Seeds, works out your sign-in and trading pocket offline, and sends Seeds only those two things — never your recovery phrase."
    : coin
      ? "Scan the QR on your Cold Storage Coin on the Seeds Key page. It works out your sign-in and a small trading pocket on your phone, forgets the phrase, and sends Seeds only those two things."
      : "Sign one message with MetaMask, Ledger, Trezor, Phantom or a phone wallet on the Seeds Key page. That signature becomes your Seeds trading pocket on your device. The same wallet can always rebuild it.";
  const thing = vault ? "Vault" : coin ? "coin" : "wallet";
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <div className="max-w-xl">
        <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Seeds never sees your recovery phrase</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link to="/key-signin" search={linkMode ? { kind: "coin", link: true } : { kind: "coin" }} className={tab(coin)}><KeyRound className="mr-1 inline h-4 w-4" />Coin</Link>
          <Link to="/key-signin" search={linkMode ? { kind: "vault", link: true } : { kind: "vault" }} className={tab(vault)}><Vault className="mr-1 inline h-4 w-4" />HME Vault</Link>
          <Link to="/key-signin" search={linkMode ? { kind: "wallet", link: true } : { kind: "wallet" }} className={tab(wallet)}><Wallet className="mr-1 inline h-4 w-4" />Other wallet</Link>
        </div>

        <section className="mt-6 rounded-md border border-border bg-surface p-5">
          {state === "starting" ? <p className="text-sm text-muted-foreground">{linkMode ? "Getting a one-time link ready…" : "Getting a one-time sign-in ready…"}</p> : null}
          {state === "signing" ? <p className="text-sm text-primary">{linkMode ? "Linking your trading pocket…" : "Opening your account…"}</p> : null}
          {state === "needs_signin" ? (
            <div className="space-y-3 text-sm">
              <p>Sign in to your Seeds account first, then come back here to link this {thing}.</p>
              <Button asChild><Link to="/auth" search={{ redirect: `/key-signin?kind=${kind}&link=true` }}>Sign in</Link></Button>
            </div>
          ) : null}
          {state === "link_confirm" && held ? (
            <div className="space-y-4">
              <p className="text-sm">
                The Seeds Key page brought the pocket keys for <b className="font-mono">{held.who}</b>.
              </p>
              <p className="text-sm text-muted-foreground">
                Is that the {vault ? "Vault you just used" : coin ? "coin you just scanned" : "wallet you just used"}? The Seeds Key page shows the same name.
                If yes, it becomes your trading pocket (pocket 1106). Its addresses are different from any pocket you had before, so deposit to the new ones.
                If you didn't just do this yourself, or the name is different, choose "No" — nothing changes.
              </p>
              <StepUp key={stepUpKey} purpose="key_link" subject={{ kind: "link", id: held.id, secret: held.secret }} onChange={(ready, proof) => setStepUp({ ready, proof })} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!stepUp.ready} onClick={() => void approveLink()}>Yes, that's mine — link it</Button>
                <Button variant="outline" onClick={refuse}>No, that's not mine</Button>
              </div>
            </div>
          ) : null}
          {state === "linked" ? (
            <div className="space-y-3">
              <p className="text-sm">Done. Your trading pocket now comes from this {thing}. Seeds never saw your recovery phrase, and nothing moved.</p>
              <Button onClick={() => navigate({ href: takeReturnPath(), replace: true })}>Back to my account</Button>
            </div>
          ) : null}
          {state === "confirm" && ready ? (
            <div className="space-y-4">
              <p className="text-sm">
                The Seeds Key page signed in as <b className="font-mono">{ready.who}</b>{ready.isNew ? " — a brand-new Seeds account" : ""}.
              </p>
              <p className="text-sm text-muted-foreground">
                Is that the {vault ? "Vault you just used" : coin ? "coin you just scanned" : "wallet you just used"}? The Seeds Key page shows the same name. If you didn't just do this yourself, or the name is different, someone else may have used your code — don't continue.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void openAccount()}>Yes, that's mine — open it</Button>
                <Button variant="outline" onClick={refuse}>No, that's not mine</Button>
              </div>
            </div>
          ) : null}
          {state === "replace" && held ? (
            <div className="space-y-4">
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                <b>This sign-in would replace your trading-pocket keys.</b> The Seeds Key page signed in as{" "}
                <b className="font-mono">{held.who}</b>, but brought different pocket keys than the ones Seeds already has.
              </p>
              <p className="text-sm text-muted-foreground">
                Your own {thing} always brings the same keys, so this usually means the Seeds Key page you used wasn't the real one
                ({KEY_HOST}). Seeds has messaged your Telegram and email. If you didn't just do this yourself, choose "No" — nothing changes.
              </p>
              {held.needsCode ? (
                <label className="block max-w-xs text-sm">
                  Code from your authenticator app
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 font-mono tracking-[0.3em]" />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" onClick={() => void approveReplace()}>Yes, it's me — replace my pocket keys</Button>
                <Button variant="outline" onClick={refuse}>No, keep everything as it is</Button>
              </div>
            </div>
          ) : null}
          {state === "refused" ? (
            <div className="space-y-3">
              <p className="text-sm">{linkMode ? "Nothing was linked, and your account is unchanged." : "Nothing was opened, and nothing was signed into on this screen."}</p>
              <p className="text-sm text-muted-foreground">Start again, and keep the QR code to yourself until you've scanned it.</p>
              <Button onClick={() => void begin()}>Start again</Button>
            </div>
          ) : null}
          {state === "expired" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{linkMode ? "That link request ran out or was already used." : "That sign-in request ran out or was already used."}</p>
              <Button onClick={() => void begin()}>Start again</Button>
            </div>
          ) : null}
          {state === "waiting" && req ? (
            vault && !req.vaultReady ? (
              <div className="space-y-3 text-sm">
                <p>HME Vault sign-in only works on the live Seeds site (seeds.honest.money), so it isn't available on this screen.</p>
                <p className="text-muted-foreground">{linkMode ? "You can still link your Cold Storage Coin or another wallet." : "You can still start with your Cold Storage Coin, sign in with Honest.Money, or use another wallet."}</p>
                <Button asChild variant="outline"><Link to="/key-signin" search={linkMode ? { kind: "coin", link: true } : { kind: "coin" }}><KeyRound /> {linkMode ? "Link a coin instead" : "Start with a coin instead"}</Link></Button>
              </div>
            ) : req.keyPageUrl ? (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-md border border-border bg-background p-3 text-foreground">
                  <ScanQr value={req.keyPageUrl} size={168} />
                </div>
                <div className="min-w-0 space-y-3 text-sm">
                  {req.pairCode ? (
                    <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                      Match code <b data-qa-mask className="font-mono text-lg tracking-[0.3em] text-primary">{req.pairCode}</b>
                      <span className="block text-xs text-muted-foreground">The Seeds Key page shows the same three digits. Only continue there if they match.</span>
                    </p>
                  ) : null}
                  <p><b>On a computer?</b> Scan this with your phone's camera to open the Seeds Key page{vault ? ", then scan back and forth with your HME Vault phone." : coin ? ", then scan your coin." : "."}</p>
                  <p><b>On your phone?</b> Open it right here.</p>
                  <Button asChild><a href={req.keyPageUrl}><ExternalLink /> Open Seeds Key</a></Button>
                  <p className="font-mono text-[11px] text-muted-foreground">Waiting for the Seeds Key page… this works once, for 10 minutes. Don't share or show this QR.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">The Seeds Key page isn't switched on yet. For now, sign in with Honest.Money.</p>
            )
          ) : null}
          {error ? <p className="mt-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{error}</p> : null}
        </section>

        <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          The real Seeds Key page is only ever <b className="font-mono">{KEY_HOST}</b>, and Seeds always opens it for you from this screen.
          Never type it in yourself, and never scan a Seeds Key QR or link that someone else gives you.{" "}
          <Link to="/help/$slug" params={{ slug: "start-with-coin" }} className="text-primary underline-offset-4 hover:underline">How it works</Link>
        </p>

        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Seeds only gets the keys to your trading pocket, the same as an HME Wallet link. You can revoke them any time in Account → Security.</li>
          {vault ? <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Your HME Vault phone stays offline. It only shows a QR answer after it checks the request really came from Seeds and matches the three digits.</li> : null}
          {coin ? <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{linkMode ? "Treat the coin like cash. Anyone holding it, or a photo of its QR, can rebuild your trading pocket. Move your funds before you give it away." : "Treat the coin like cash. Anyone holding it, or a photo of its QR, can open this account. Move your funds before you give it away."}</li> : null}
          {linkMode
            ? <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Withdrawals use the same rules as always: this link must come after two-factor and Telegram are on.</li>
            : <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Withdrawals to outside addresses unlock once you add an email (or join Honest.Money), with 2FA and Telegram like everyone else.</li>}
        </ul>
        <p className="mt-6 text-sm">
          {linkMode
            ? <Link to="/account/security" className="text-primary underline-offset-4 hover:underline">← Back to Security</Link>
            : <Link to="/auth" className="text-primary underline-offset-4 hover:underline">← Sign in with Honest.Money instead</Link>}
        </p>
      </div>
    </div>
  );
}
