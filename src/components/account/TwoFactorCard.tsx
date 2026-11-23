import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, Note } from "@/components/account/ui";
import { CodeField } from "@/components/account/CodeField";
import { myAuthenticator, proveTwoFactor } from "@/components/account/two-factor";
import { syncMyTwoFactor } from "@/lib/two-factor.functions";
import { cleanCode } from "@/lib/two-factor";
import { useMyIdentity } from "@/components/account/use-identity";
import { keyThing } from "@/lib/account/sign-in-kind";

export const TWO_FACTOR_QUERY = ["my-two-factor"] as const;

/** Is two-factor on for me? Shared by the Security checkup and this card. */
export function useMyTwoFactor() {
  return useQuery({ queryKey: TWO_FACTOR_QUERY, queryFn: () => myAuthenticator() });
}

type Setup = { factorId: string; uri: string; secret: string };

/** Turn an authenticator-app code on or off for this Seeds account. */
export function TwoFactorCard() {
  const qc = useQueryClient();
  const sync = useServerFn(syncMyTwoFactor);
  const status = useMyTwoFactor();
  const identity = useMyIdentity();
  const keyKind = identity.keyKind;
  // HME Wallet pockets re-link HME Wallet; coin / wallet pockets refresh by signing in again with that key,
  // or (Honest.Money members who linked one) by linking it again.
  const pk = identity.pocketKeyKind;
  const relink = pk ? (identity.pocketViaLink ? `link ${keyThing(pk)} again` : `sign in again with ${keyThing(pk)}`) : "re-link your HME Wallet";
  const [setup, setSetup] = useState<Setup | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const after = async (msg: string) => {
    await sync().catch(() => null); // best effort: stores the state and sends the security email
    await qc.invalidateQueries({ queryKey: TWO_FACTOR_QUERY });
    await qc.invalidateQueries({ queryKey: ["withdrawals"] });
    await qc.invalidateQueries({ queryKey: ["admin-gate"] });
    await qc.invalidateQueries({ queryKey: ["factor-trust"] });
    setSetup(null); setTurningOff(false); setCode(""); setDone(msg);
  };

  async function start() {
    setBusy(true); setErr(null); setDone(null);
    try {
      // Clear any half-finished setups first, so only one QR code is ever valid.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Seeds", friendlyName: `Seeds ${Date.now()}` });
      if (error || !data) {
        console.error("two-factor enroll failed", error);
        throw new Error("Couldn't start setup. Refresh and try again.");
      }
      setSetup({ factorId: data.id, uri: data.totp.uri, secret: data.totp.secret });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start setup.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!setup) return;
    const c = cleanCode(code);
    if (!c) { setErr("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code: c });
      if (error) throw new Error("That code didn't work. Use the newest code in your app and check your phone's clock is set automatically.");
      await after(pk
        ? `Two-factor is on. Next: connect Telegram (Account → Alerts), then ${relink} using the button on this page to allow withdrawals. Every withdrawal will ask for a code.`
        : "Two-factor is on. Now re-link your HME Wallet on this page to allow withdrawals. Every withdrawal will ask for a code.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't turn it on.");
    } finally { setBusy(false); }
  }

  async function cancelSetup() {
    if (setup) await supabase.auth.mfa.unenroll({ factorId: setup.factorId }).catch(() => null);
    setSetup(null); setCode(""); setErr(null);
  }

  async function turnOff() {
    const f = status.data;
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      await proveTwoFactor(code);
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw new Error("Couldn't turn it off. Try again with a new code.");
      await supabase.auth.refreshSession().catch(() => null);
      await after(`Two-factor is off. Withdrawals are off until you turn it back on and ${relink}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't turn it off.");
    } finally { setBusy(false); }
  }

  const on = Boolean(status.data);
  return (
    <Card
      title="Two-factor sign-in"
      desc={keyKind ? `A 6-digit code from an app on your phone, on top of signing in with ${keyThing(keyKind)}.` : "A 6-digit code from an app on your phone, on top of your Honest.Money sign-in."}
      right={status.isPending ? null : on
        ? <span className="inline-flex items-center gap-1 font-mono text-xs text-primary uppercase"><ShieldCheck className="h-3.5 w-3.5" /> On</span>
        : <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground uppercase"><ShieldOff className="h-3.5 w-3.5" /> Off</span>}
    >
      {status.isPending ? <p className="text-sm text-muted-foreground">Checking…</p> : status.error ? (
        <Note tone="error">Couldn't check two-factor sign-in. Refresh to retry.</Note>
      ) : setup ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open an authenticator app on your phone (Google Authenticator, Authy, 1Password, Microsoft Authenticator…).</li>
            <li>Scan this code, or type the setup key by hand.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="self-start rounded-sm border border-border bg-qr p-3 text-qr-foreground">
              <QRCodeSVG value={setup.uri} size={168} bgColor="transparent" fgColor="currentColor" aria-label="Two-factor setup QR code" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Setup key</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code data-qa-mask className="min-w-0 break-all rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs">{setup.secret}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    <Copy /> {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <CodeField id="tf-setup-code" value={code} onChange={setCode} />
            </div>
          </div>
          {err ? <Note tone="error">{err}</Note> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={busy}>{busy ? "Checking…" : "Turn on"}</Button>
            <Button variant="outline" onClick={cancelSetup} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : on ? (
        <div className="space-y-3">
          <p className="text-sm">
            Every withdrawal asks for a fresh code. Withdrawals only go out from a wallet link made after two-factor was turned on.
          </p>
          <p className="text-xs text-muted-foreground">
            Lost your phone? Email support@honest.money. After checking it's really you, an admin can remove the old authenticator so you can set up a new one.
          </p>
          {turningOff ? (
            <div className="space-y-3 rounded-sm border border-border p-3">
              <Note tone="warn">Turning it off stops withdrawals until you turn it back on and {relink}.</Note>
              <CodeField id="tf-off-code" value={code} onChange={setCode} />
              {err ? <Note tone="error">{err}</Note> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" onClick={turnOff} disabled={busy}>{busy ? "Checking…" : "Turn off two-factor"}</Button>
                <Button variant="outline" onClick={() => { setTurningOff(false); setCode(""); setErr(null); }} disabled={busy}>Keep it on</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setTurningOff(true); setDone(null); }}>Turn off</Button>
          )}
          {done ? <Note tone="ok">{done}</Note> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {pk
              ? <>Needed for <b>every withdrawal</b>. Turn it on, connect Telegram, then {relink} once. Then someone who gets hold of a Seeds sign-in can't withdraw without your phone and your Telegram.</>
              : <>Needed for <b>every withdrawal</b>. Turn it on first, then link (or re-link) your trading pocket. Then someone who gets into your Honest.Money account can't withdraw without your phone and your wallet.</>}
          </p>
          {err ? <Note tone="error">{err}</Note> : null}
          {done ? <Note tone="ok">{done}</Note> : null}
          <Button onClick={start} disabled={busy}><ShieldCheck /> {busy ? "Starting…" : "Set up two-factor"}</Button>
        </div>
      )}
    </Card>
  );
}
