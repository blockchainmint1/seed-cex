import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { confirmAccountEmail, requestAccountEmail } from "@/lib/key-signin/key-signin.functions";
import { useJoinHonestMoney, useMyIdentity } from "@/components/account/use-identity";
import { IDENTITY_LABEL } from "@/lib/key-signin/rules";
import { Button } from "@/components/ui/button";
import { Card, Note, fieldLabel, inputCls } from "@/components/account/ui";
import { useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { proveTwoFactor } from "@/components/account/two-factor";

/** Coin / outside-wallet accounts: how they sign in, add an email, join Honest.Money. */
export function KeyIdentityCard() {
  const qc = useQueryClient();
  const ask = useServerFn(requestAccountEmail);
  const confirm = useServerFn(confirmAccountEmail);
  const id = useMyIdentity();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  // The email becomes a withdrawal factor, so with two-factor on, adding it needs a fresh code.
  const twoFactorOn = Boolean(useMyTwoFactor().data);
  const [tfa, setTfa] = useState("");
  const joinHonestMoney = useJoinHonestMoney();

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
    onSuccess: () => { setSentTo(null); setCode(""); qc.invalidateQueries({ queryKey: ["my-identity"] }); qc.invalidateQueries({ queryKey: ["withdrawals"] }); },
  });

  const d = id.data;
  if (!d || d.kind === "hme") return null;

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
          <p className="text-sm text-foreground"><b>Join Honest.Money (optional).</b> You get Ignite, referrals and one login across the Honest.Money ecosystem, and your membership email comes with it, which withdrawals need. Your coins, pocket number and history stay exactly where they are, and you can still sign in with your coin.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={joinHonestMoney}>Join with Honest.Money</Button>
            <Button asChild variant="ghost"><a href="https://honest.money" target="_blank" rel="noreferrer">Become a member</a></Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
