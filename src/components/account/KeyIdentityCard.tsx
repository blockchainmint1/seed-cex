import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { confirmAccountEmail, getMyIdentity, requestAccountEmail } from "@/lib/key-signin/key-signin.functions";
import { IDENTITY_LABEL } from "@/lib/key-signin/rules";
import { Button } from "@/components/ui/button";
import { Card, Note, fieldLabel, inputCls } from "@/components/account/ui";
import { useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { proveTwoFactor } from "@/components/account/two-factor";

/** Coin / outside-wallet accounts: how they sign in, add an email, join Honest.Money. */
export function KeyIdentityCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyIdentity);
  const ask = useServerFn(requestAccountEmail);
  const confirm = useServerFn(confirmAccountEmail);
  const id = useQuery({ queryKey: ["my-identity"], queryFn: () => load() });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  // The email becomes a withdrawal factor, so with two-factor on, adding it needs a fresh code.
  const twoFactorOn = Boolean(useMyTwoFactor().data);
  const [tfa, setTfa] = useState("");
  const listener = useRef<((ev: MessageEvent) => void) | null>(null);
  useEffect(() => () => { if (listener.current) window.removeEventListener("message", listener.current); }, []);

  const send = useMutation({
    mutationFn: async () => {
      if (twoFactorOn) await proveTwoFactor(tfa);
      return ask({ data: { email } });
    },
    onSuccess: (r) => setSentTo(r.sentTo),
    onSettled: () => setTfa(""),
  });
  const done = useMutation({
    mutationFn: () => confirm({ data: { code } }),
    onSuccess: () => { setSentTo(null); setCode(""); qc.invalidateQueries({ queryKey: ["my-identity"] }); },
  });

  const d = id.data;
  if (!d || d.kind === "hme") return null;

  function joinHonestMoney() {
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
  }

  return (
    <Card title="How you sign in" desc="You started on Seeds with your own key. Seeds never saw your recovery phrase.">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0"><dt className={fieldLabel}>Sign-in</dt><dd className="mt-1 text-sm">{IDENTITY_LABEL[d.kind]} via the Seeds Key page</dd></div>
        <div className="min-w-0"><dt className={fieldLabel}>Key address</dt><dd className="mt-1 truncate font-mono text-sm">{d.identityAddress ?? "—"}</dd></div>
        <div className="min-w-0"><dt className={fieldLabel}>Email</dt><dd className={`mt-1 truncate text-sm ${d.email ? "text-primary" : "text-muted-foreground"}`}>{d.email ?? "None yet"}</dd></div>
        <div className="min-w-0"><dt className={fieldLabel}>Honest.Money</dt><dd className={`mt-1 text-sm ${d.hmeMember ? "text-primary" : "text-muted-foreground"}`}>{d.hmeMember ? "Joined" : "Not joined"}</dd></div>
      </dl>

      {!d.email ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">Add an email to unlock withdrawals. Seeds emails a code for every withdrawal and tells you about account changes. Your Telegram is told too.</p>
          {!sentTo ? (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
              <label className="block min-w-0 flex-1 sm:max-w-sm">
                <span className={fieldLabel}>Email</span>
                <input type="email" required className={`${inputCls} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              {twoFactorOn ? (
                <label className="block">
                  <span className={fieldLabel}>Authenticator code</span>
                  <input inputMode="numeric" maxLength={6} required className={`${inputCls} mt-1 w-36 font-mono`} value={tfa} onChange={(e) => setTfa(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
                </label>
              ) : null}
              <Button type="submit" disabled={send.isPending || (twoFactorOn && tfa.length !== 6)}>{send.isPending ? "Sending…" : "Send code"}</Button>
            </form>
          ) : (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); done.mutate(); }}>
              <label className="block">
                <span className={fieldLabel}>Code sent to {sentTo}</span>
                <input inputMode="numeric" maxLength={6} required className={`${inputCls} mt-1 w-40 font-mono`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
              </label>
              <Button type="submit" disabled={done.isPending || code.length !== 6}>{done.isPending ? "Checking…" : "Confirm email"}</Button>
              <Button type="button" variant="ghost" onClick={() => setSentTo(null)}>Use a different email</Button>
            </form>
          )}
          {send.error ? <Note tone="error">{(send.error as Error).message}</Note> : null}
          {done.error ? <Note tone="error">{(done.error as Error).message}</Note> : null}
        </div>
      ) : null}

      {!d.hmeMember ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">Already an Honest.Money member? Join your membership to this account to get Ignite, referrals and one login across the ecosystem. Your coins, pocket and history stay exactly where they are.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={joinHonestMoney}>Join with Honest.Money</Button>
            <Button asChild variant="ghost"><a href="https://honest.money" target="_blank" rel="noreferrer">Become a member</a></Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
