import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Note, fieldLabel, inputCls } from "@/components/account/ui";
import { CodeField } from "@/components/account/CodeField";
import { proveTwoFactor } from "@/components/account/two-factor";
import { fmtCoin } from "@/components/account/use-pocket";
import { cancelWithdrawalFn, getWithdrawals, requestWithdrawalFn, sendWithdrawalCodeFn } from "@/lib/withdraw/withdraw.functions";
import { WITHDRAW_STATUS } from "@/lib/withdraw/rules";
import type { WithdrawCoin } from "@/lib/withdraw/catalog";
import { isKeyKind, keyThing } from "@/lib/account/sign-in-kind";

/** Shared cache: whether Seeds can send this coin for the member, the rules, and their withdrawals. */
export function useWithdrawals(key: string | null, enabled: boolean) {
  const read = useServerFn(getWithdrawals);
  return useQuery({ queryKey: ["withdrawals", key], queryFn: () => read({ data: { key } }), enabled, refetchInterval: 20_000 });
}

/**
 * One withdrawal form for every coin. Three checks, in order: a code emailed for exactly this
 * withdrawal, the member's authenticator code, then an Approve tap in Telegram. Then the hold.
 */
export function SeedsWithdraw({ coin, from, balance }: { coin: WithdrawCoin; from: string; balance: number | null }) {
  const qc = useQueryClient();
  const ctx = useWithdrawals(coin.key, true);
  const sendCode = useServerFn(sendWithdrawalCodeFn);
  const request = useServerFn(requestWithdrawalFn);
  const cancel = useServerFn(cancelWithdrawalFn);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [tag, setTag] = useState("");
  const [checked, setChecked] = useState(false);
  const [sent, setSent] = useState<{ sentTo: string; amountUsd: number } | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["withdrawals"] });
  const details = { symbol: coin.symbol, network: coin.network, amount: amount.trim(), to: to.trim(), tag: coin.kind === "xrp" ? tag.trim() : undefined };
  // The emailed code is for these exact details; any edit needs a new code.
  const edit = (f: (v: string) => void) => (v: string) => { f(v); setSent(null); setEmailCode(""); setDone(null); };

  const codeStep = useMutation({
    mutationFn: () => sendCode({ data: details }),
    onSuccess: (r) => { setSent({ sentTo: r.sentTo, amountUsd: r.amountUsd }); setDone(null); },
  });
  const submit = useMutation({
    mutationFn: async () => {
      await proveTwoFactor(authCode);
      return request({ data: { ...details, emailCode } });
    },
    onSuccess: (r) => {
      setDone(`Check Telegram now: tap Approve within 15 minutes for ${r.amount} ${coin.symbol} (about $${r.amountUsd}). ${r.holdHours > 0 ? `Then Seeds waits ${r.holdHours} hours before sending — you can cancel until then.` : "Beta tester, so no wait: it goes out a few minutes after your tap."}`);
      setAmount(""); setTo(""); setTag(""); setChecked(false); setSent(null); setEmailCode(""); refresh();
    },
    onSettled: () => setAuthCode(""),
  });
  const stop = useMutation({ mutationFn: (id: string) => cancel({ data: { id } }), onSuccess: refresh });

  const d = ctx.data;
  const rows = (d?.withdrawals ?? []).filter((w) => w.coin === coin.symbol && w.chain === coin.network);
  const ready = checked && amount.trim() && to.trim().length >= 20;

  return (
    <div className="space-y-4">
      <Note tone="info">
        Seeds sends {coin.symbol} on {coin.networkLabel} for you, only to the address you type below. Every withdrawal needs three checks: a code we email you,
        the code from your authenticator app, and your tap in Telegram. {d?.tester ? "As a beta tester you have no wait after the tap." : `After your tap there's a ${d?.holdHours ?? 24}-hour wait you can cancel.`}
      </Note>
      {d?.blocker ? (
        <div className="space-y-2">
          <Note tone="warn">{d.blocker}</Note>
          {d.needsEmail ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/account/profile">Add an email</Link></Button>
            </div>
          ) : d.readiness && d.readiness !== "ready" ? (
            <div className="flex flex-wrap gap-2">
              {d.readiness === "needs_2fa" ? <Button asChild size="sm" variant="outline"><Link to="/account/security">Turn on two-factor</Link></Button> : null}
              {d.readiness === "needs_telegram" || d.readiness === "needs_2fa" ? <Button asChild size="sm" variant="outline"><Link to="/account/alerts">Connect Telegram</Link></Button> : null}
              <Button asChild size="sm" variant="outline">
                <Link to="/account/security">{isKeyKind(d.signIn) ? `Sign in again with ${keyThing(d.signIn)}` : "Re-link HME Wallet"}</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : d ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (sent) submit.mutate(); else codeStep.mutate(); }}>
          <label className="block">
            <span className={fieldLabel}>Amount ({coin.symbol})</span>
            <div className="mt-1 flex gap-2">
              <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => edit(setAmount)(e.target.value)} placeholder="0" />
              {coin.feeCoin && balance != null && balance > 0 ? (
                <Button type="button" variant="outline" onClick={() => edit(setAmount)(String(balance))}>Max</Button>
              ) : null}
            </div>
            {coin.keepNote ? <span className="mt-1 block text-xs text-muted-foreground">{coin.keepNote}</span> : null}
          </label>
          <label className="block">
            <span className={fieldLabel}>Send to ({coin.networkLabel} address)</span>
            <input className={`${inputCls} mt-1 font-mono`} value={to} onChange={(e) => edit(setTo)(e.target.value)} placeholder={coin.addressHint} spellCheck={false} autoComplete="off" />
          </label>
          {coin.kind === "xrp" ? (
            <label className="block">
              <span className={fieldLabel}>Destination tag (if the receiver gave you one)</span>
              <input className={`${inputCls} mt-1 font-mono`} inputMode="numeric" value={tag} onChange={(e) => edit(setTag)(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Optional" />
              <span className="mt-1 block text-xs text-muted-foreground">Exchanges usually need one. Without it, coins sent to an exchange can get stuck.</span>
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I checked the address. It's on <b>{coin.networkLabel}</b>, and coins sent to a wrong address can't be brought back.</span>
          </label>
          <div className="rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p>
              {d.tester ? (
                <span className="font-semibold text-foreground">Beta tester · no Seeds withdrawal limit, no wait ({d.limits.maxWaiting} waiting at once).</span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">Your withdrawal level: {d.level.name}</span>
                  {" "}· up to ${d.limits.perWithdrawalUsd.toLocaleString("en-US")} each, ${d.limits.dailyUsd.toLocaleString("en-US")} a day,
                  {" "}{d.holdHours}-hour wait, {d.limits.maxWaiting} waiting at once.
                </>
              )}
            </p>
            {!d.tester ? <p className="mt-0.5">{d.level.next ?? (d.level.setByAdmin ? "Set by the Seeds team." : "You're on the top level.")}</p> : null}
          </div>

          {sent ? (
            <div className="space-y-3 rounded-sm border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm">We emailed a code to <b>{sent.sentTo}</b>. It works only for this exact withdrawal and ends in 10 minutes.</p>
              <div className="flex flex-wrap gap-4">
                <CodeField id={`email-code-${coin.key}`} label="Code from the Seeds email" value={emailCode} onChange={setEmailCode} />
                <CodeField id={`auth-code-${coin.key}`} value={authCode} onChange={setAuthCode} />
              </div>
            </div>
          ) : null}
          {codeStep.error ? <Note tone="error">{codeStep.error.message}</Note> : null}
          {submit.error ? <Note tone="error">{submit.error.message}</Note> : null}
          {done ? <Note tone="ok">{done}</Note> : null}
          {sent ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={submit.isPending || emailCode.length !== 6 || authCode.length !== 6}>
                <Send /> {submit.isPending ? "Checking…" : "Approve and ask Telegram"}
              </Button>
              <button type="button" className="text-xs font-semibold text-primary hover:underline" disabled={codeStep.isPending} onClick={() => codeStep.mutate()}>
                Send a new email code
              </button>
            </div>
          ) : (
            <Button type="submit" disabled={!ready || codeStep.isPending}>
              <Mail /> {codeStep.isPending ? "Checking…" : "Email me a code"}
            </Button>
          )}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {rows.length ? (
        <div className="border-t border-border pt-4">
          <p className={fieldLabel}>Your {coin.symbol} withdrawals on {coin.networkLabel}</p>
          <ul className="mt-2 divide-y divide-border rounded-sm border border-border">
            {rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p><span className="num font-semibold">{fmtCoin(Number(w.amount))} {w.coin}</span> <span className="text-muted-foreground">(${Number(w.amount_usd).toFixed(2)})</span></p>
                  <p className="truncate font-mono text-xs text-muted-foreground">to {w.to_address}{w.destination_tag != null ? ` · tag ${w.destination_tag}` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {WITHDRAW_STATUS[w.status] ?? w.status}
                    {w.status === "held" ? ` · sends ${new Date(w.release_at).toLocaleString()}` : ""}
                    {w.error && (w.status === "failed" || w.status === "unknown" || w.status === "cancelled") ? ` · ${w.error}` : ""}
                  </p>
                </div>
                {w.status === "held" || w.status === "approving" ? (
                  <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate(w.id)}>Cancel</Button>
                ) : w.txid ? (
                  <a className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" href={`${coin.explorerTx}${w.txid}`} target="_blank" rel="noreferrer">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          {stop.error ? <div className="mt-2"><Note tone="error">{stop.error.message}</Note></div> : null}
        </div>
      ) : null}
    </div>
  );
}
