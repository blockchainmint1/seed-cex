import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Note, fieldLabel, inputCls } from "@/components/account/ui";
import { cancelPulseWithdrawalFn, getPulseWithdrawals, requestPulseWithdrawalFn } from "@/lib/pulse/withdraw.functions";
import { destinationProblem, PULSE_MIN_GAS_PLS, WITHDRAW_STATUS, type PulseCoin } from "@/lib/pulse/withdraw-rules";
import { fmtCoin } from "@/components/account/use-pocket";

/** Shared cache: whether Seeds can send PulseChain coins for this member, plus their PulseChain withdrawals. */
export function usePulseWithdrawals(enabled: boolean) {
  const read = useServerFn(getPulseWithdrawals);
  return useQuery({ queryKey: ["pulse-withdrawals"], queryFn: () => read(), enabled, refetchInterval: 30_000 });
}

const EXPLORER_TX = "https://scan.pulsechain.com/tx/";

/** PLS / pHEX withdrawal: Seeds signs, only to the address typed here, after a hold the member can cancel. */
export function PulseWithdraw({ coin, from, balance }: { coin: PulseCoin; from: string; balance: number | null }) {
  const qc = useQueryClient();
  const ctx = usePulseWithdrawals(true);
  const request = useServerFn(requestPulseWithdrawalFn);
  const cancel = useServerFn(cancelPulseWithdrawalFn);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["pulse-withdrawals"] });

  const submit = useMutation({
    mutationFn: () => request({ data: { coin, amount: amount.trim(), to: to.trim() } }),
    onSuccess: (r) => {
      setDone(`Set up: ${r.amount} ${coin} (about $${r.amountUsd}). Seeds sends it in ${r.holdHours} hours — we emailed you a way to cancel.`);
      setAmount(""); setTo(""); setChecked(false); refresh();
    },
  });
  const stop = useMutation({ mutationFn: (id: string) => cancel({ data: { id } }), onSuccess: refresh });

  const d = ctx.data;
  const toProblem = to.trim() ? destinationProblem(to, from) : null;
  const rows = (d?.withdrawals ?? []).filter((w) => w.coin === coin);

  return (
    <div className="space-y-4">
      <Note tone="warn">
        HME Wallet can't send on PulseChain yet, so Seeds sends {coin} out for you: only to the address you type below, after a{" "}
        {d?.holdHours ?? 24}-hour hold. You can cancel during the hold, and we email you the moment it's set up.
      </Note>
      {d?.blocker ? (
        <Note tone="info">{d.blocker}</Note>
      ) : d ? (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); setDone(null); submit.mutate(); }}
        >
          <label className="block">
            <span className={fieldLabel}>Amount ({coin})</span>
            <div className="mt-1 flex gap-2">
              <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              {balance != null && balance > 0 ? (
                <Button type="button" variant="outline" onClick={() => setAmount(String(coin === "PLS" ? Math.max(0, Math.floor(balance - PULSE_MIN_GAS_PLS)) : balance))}>Max</Button>
              ) : null}
            </div>
            {coin === "PLS" ? <span className="mt-1 block text-xs text-muted-foreground">{PULSE_MIN_GAS_PLS} PLS (a fraction of a cent) stays behind for the network fee.</span> : null}
          </label>
          <label className="block">
            <span className={fieldLabel}>Send to (PulseChain address)</span>
            <input className={`${inputCls} mt-1 font-mono`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
            {toProblem ? <span className="mt-1 block text-xs text-destructive">{toProblem}</span> : null}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I checked the address. It's on <b>PulseChain</b>, and coins sent to a wrong address can't be brought back.</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Limits during the test: ${d.limits.perWithdrawalUsd} per withdrawal, ${d.limits.dailyUsd.toLocaleString("en-US")} a day, {d.limits.maxWaiting} waiting at once.
          </p>
          {submit.error ? <Note tone="error">{submit.error.message}</Note> : null}
          {done ? <Note tone="ok">{done}</Note> : null}
          <Button type="submit" disabled={!checked || !amount.trim() || !to.trim() || Boolean(toProblem) || submit.isPending}>
            {submit.isPending ? "Checking…" : `Withdraw ${coin}`}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {rows.length ? (
        <div className="border-t border-border pt-4">
          <p className={fieldLabel}>Your {coin} withdrawals</p>
          <ul className="mt-2 divide-y divide-border rounded-sm border border-border">
            {rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p><span className="num font-semibold">{fmtCoin(Number(w.amount))} {w.coin}</span> <span className="text-muted-foreground">(${Number(w.amount_usd).toFixed(2)})</span></p>
                  <p className="truncate font-mono text-xs text-muted-foreground">to {w.to_address}</p>
                  <p className="text-xs text-muted-foreground">
                    {WITHDRAW_STATUS[w.status] ?? w.status}
                    {w.status === "held" ? ` · sends ${new Date(w.release_at).toLocaleString()}` : ""}
                    {w.error && (w.status === "failed" || w.status === "unknown") ? ` · ${w.error}` : ""}
                  </p>
                </div>
                {w.status === "held" ? (
                  <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate(w.id)}>Cancel</Button>
                ) : w.txid ? (
                  <a className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" href={`${EXPLORER_TX}${w.txid}`} target="_blank" rel="noreferrer">
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
