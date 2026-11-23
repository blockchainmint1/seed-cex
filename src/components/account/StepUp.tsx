import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Mail, Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rememberReturnPath } from "@/lib/return-path";
import { checkMyStepUp, getMyStepUp, startMyStepUp, verifyMyStepUpEmail } from "@/lib/step-up/step-up.functions";
import type { StepUpPurpose } from "@/lib/step-up/rules";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/account/CodeField";
import { proveTwoFactor } from "@/components/account/two-factor";

export type StepUpProof = { id: string; secret: string } | null;
/** What the fresh sign-in must come after (server resolves the time). Unlink/replace Telegram uses a server stamp instead. */
export type StepUpSubject = { kind: "link"; id: string; secret: string } | { kind: "totp"; factorId: string } | { kind: "telegram" };

// The unlink/replace stamp survives a sign-in round trip (the coin / wallet sign-in leaves this page).
const INTENT_STORE = "seeds-stepup-intent";
const readStoredIntent = (purpose: StepUpPurpose): string | null => {
  try { return window.sessionStorage.getItem(`${INTENT_STORE}:${purpose}`); } catch { return null; }
};
const storeIntent = (purpose: StepUpPurpose, token: string | null) => {
  try { if (token) window.sessionStorage.setItem(`${INTENT_STORE}:${purpose}`, token); } catch { /* private mode */ }
};

/** Open the Honest.Money sign-in window, forcing the password box. Resolves when this tab has the new session. */
function signInAgainWithHme(): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `https://honest.money/sso-login?popup=1&prompt=login&return_to=${encodeURIComponent(`${window.location.origin}/sso`)}`;
    const w = window.open(url, "hm-sso", "width=440,height=720");
    if (!w) { reject(new Error("Your browser blocked the sign-in window. Allow pop-ups for Seeds, then try again.")); return; }
    const onMsg = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== "seeds-sso-done") return;
      window.removeEventListener("message", onMsg);
      await supabase.auth.getSession();
      resolve();
    };
    window.addEventListener("message", onMsg);
  });
}

/**
 * "Confirm it's you" (auditor H1). Offers a fresh sign-in first, then — when the member has them — a tap in a
 * day-old Telegram chat, a code from day-old 2FA apps, or a code to their Honest.Money email.
 * Calls onChange(true, proof) once the step is unlocked; the server re-checks everything.
 */
export function StepUp({ purpose, subject, onChange, returnTo }: {
  purpose: StepUpPurpose;
  /** Needed for key_link and confirm_factor; unlink/replace Telegram uses the stored stamp. */
  subject?: StepUpSubject;
  onChange: (ready: boolean, proof: StepUpProof, intent: string | null) => void;
  returnTo?: string;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getMyStepUp);
  const start = useServerFn(startMyStepUp);
  const check = useServerFn(checkMyStepUp);
  const verifyEmail = useServerFn(verifyMyStepUpEmail);
  const subjectKey = subject ? JSON.stringify(subject) : "";
  const q = useQuery({
    queryKey: ["step-up", purpose, subjectKey],
    queryFn: async () => {
      const s = purpose === "telegram_unlink" ? { kind: "intent" as const, token: readStoredIntent(purpose) } : subject ?? null;
      const r = await load({ data: { purpose, subject: s } });
      if (purpose === "telegram_unlink") storeIntent(purpose, r.intent);
      return r;
    },
    staleTime: 0,
  });
  const [proof, setProof] = useState<StepUpProof>(null);
  const [pending, setPending] = useState<{ method: "telegram" | "email"; id: string; secret: string; sentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  const ready = Boolean(q.data?.fresh) || proof != null;
  const intent = q.data?.intent ?? null;
  useEffect(() => { cb.current(ready, proof, intent); }, [ready, proof, intent]);

  // Wait for the Telegram tap.
  useEffect(() => {
    if (!pending || pending.method !== "telegram") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await check({ data: { id: pending.id, secret: pending.secret } }).catch(() => null);
      if (r?.status === "approved") { setProof({ id: pending.id, secret: pending.secret }); setPending(null); return; }
      if (r?.status === "declined") { setPending(null); setNote("Declined in Telegram. Nothing changed."); return; }
      if (r?.status === "expired" || r?.status === "used") { setPending(null); setNote("That check ran out. Try again."); return; }
      setTimeout(tick, 2000);
    };
    void tick();
    return () => { stop = true; };
  }, [pending, check]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null);
    try { await fn(); } catch (e) { setNote(e instanceof Error ? e.message : "That didn't work. Try again."); } finally { setBusy(false); }
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["step-up", purpose, subjectKey] });

  if (q.isLoading) return <p className="text-xs text-muted-foreground">Checking…</p>;
  if (q.error) return <p className="text-xs text-destructive">Couldn't load the security check. Refresh and try again.</p>;
  const o = q.data!;
  if (ready) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-primary"><Check className="h-3.5 w-3.5" />
        {proof ? "Confirmed it's you." : "You signed in again after this started, so this counts as you."}
      </p>
    );
  }
  const keyPath = returnTo ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/account/security");
  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm">
      <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> First, confirm it's you</p>
      <p className="text-xs text-muted-foreground">This keeps someone who got hold of your open Seeds tab from changing where your coins go. Signing in again counts even if you signed in a few minutes ago — it has to happen after this started.</p>
      {o.signIn === "hme" ? (
        <Button size="sm" disabled={busy} onClick={() => run(async () => { await signInAgainWithHme(); await refresh(); })}>
          <KeyRound /> Sign in again with Honest.Money
        </Button>
      ) : (
        <Button size="sm" asChild><Link to="/key-signin" search={{ kind: "coin" }} onClick={() => rememberReturnPath(keyPath)}><KeyRound /> Sign in again with your coin or wallet</Link></Button>
      )}
      {o.telegram || o.totp || o.email ? <p className="text-xs text-muted-foreground">Or:</p> : null}
      <div className="space-y-3">
        {o.telegram ? (
          pending?.method === "telegram"
            ? <p className="text-xs">Tap <b>Yes, it's me</b> in Telegram… this updates by itself.</p>
            : <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await start({ data: { purpose, method: "telegram" } }); setPending({ method: "telegram", ...r }); })}><Send /> Send a tap to my Telegram</Button>
        ) : null}
        {o.totp ? (
          <div className="flex flex-wrap items-end gap-2">
            <CodeField id={`stepup-totp-${purpose}`} value={code} onChange={setCode} />
            <Button size="sm" variant="outline" disabled={busy || code.length !== 6} onClick={() => run(async () => { await proveTwoFactor(code); setCode(""); await refresh(); })}>Use authenticator code</Button>
          </div>
        ) : null}
        {o.email ? (
          pending?.method === "email" ? (
            <div className="flex flex-wrap items-end gap-2">
              <CodeField id={`stepup-email-${purpose}`} value={emailCode} onChange={setEmailCode} />
              <Button size="sm" variant="outline" disabled={busy || emailCode.length !== 6} onClick={() => run(async () => {
                await verifyEmail({ data: { id: pending.id, secret: pending.secret, code: emailCode } });
                setProof({ id: pending.id, secret: pending.secret }); setPending(null); setEmailCode("");
              })}>Use email code</Button>
              <p className="basis-full text-xs text-muted-foreground">Sent to {pending.sentTo}. It works once, for 10 minutes.</p>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await start({ data: { purpose, method: "email" } }); setPending({ method: "email", ...r }); })}><Mail /> Email me a code</Button>
          )
        ) : null}
      </div>
      {note ? <p className="text-xs text-destructive">{note}</p> : null}
    </div>
  );
}
