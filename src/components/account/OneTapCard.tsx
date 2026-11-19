import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyOneTapLimit, setMyOneTapLimit } from "@/lib/ai/one-tap.functions";
import { Button } from "@/components/ui/button";
import { Card, Note, fieldLabel, inputCls } from "@/components/account/ui";
import { CodeField } from "@/components/account/CodeField";
import { proveTwoFactor } from "@/components/account/two-factor";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/**
 * Account → Alerts: how big a Seeds AI trade day can be and still be approved with one
 * tap in Telegram. Seeds sets the default; lowering is free, raising needs a code.
 */
export function OneTapCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyOneTapLimit);
  const save = useServerFn(setMyOneTapLimit);
  const q = useQuery({ queryKey: ["my-one-tap"], queryFn: () => load() });
  const d = q.data;
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (d) setAmount(String(d.limit)); }, [d]);

  const typed = amount.trim() === "" ? NaN : Number(amount);
  const raising = (next: number | null) => d != null && (next ?? d.adminDefault) > d.limit;
  const m = useMutation({
    mutationFn: async (next: number | null) => {
      if (raising(next) && d?.twoFactorOn) await proveTwoFactor(code);
      return save({ data: { limitUsd: next } });
    },
    onSuccess: (r) => { setNote({ ok: true, text: `Saved. Trade days up to ${usd(r.limit)} can be approved with one tap.` }); qc.invalidateQueries({ queryKey: ["my-one-tap"] }); qc.invalidateQueries({ queryKey: ["ai-my-plans"] }); },
    onError: (e: Error) => setNote({ ok: false, text: e.message }),
    onSettled: () => setCode(""),
  });

  if (!d) return <Card title="One-tap approvals" desc="Seeds AI trade days you can approve with one tap in Telegram."><p className="text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p></Card>;
  const typedRaises = Number.isFinite(typed) && raising(typed);
  const needsCode = typedRaises && d.twoFactorOn;
  const blocked = typedRaises && !d.twoFactorOn;
  return (
    <Card title="One-tap approvals" desc="How big a Seeds AI trade day can be and still be approved with one tap in Telegram. Bigger days are confirmed on Seeds.">
      <div className="space-y-3">
        {note ? <Note tone={note.ok ? "ok" : "error"}>{note.text}</Note> : null}
        <p className="text-sm">
          Your limit: <b>{usd(d.limit)}</b>{" "}
          <span className="text-muted-foreground">{d.own == null ? "(Seeds default)" : `(your own · Seeds default is ${usd(d.adminDefault)})`}</span>
        </p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (Number.isFinite(typed)) m.mutate(typed); }}>
          <label className="block" htmlFor="one-tap-amount">
            <span className={fieldLabel}>New limit ($0 – {usd(d.adminMax)})</span>
            <input id="one-tap-amount" className={`${inputCls} mt-1 block !w-40`} type="number" inputMode="decimal" min={0} max={d.adminMax} step="1"
              value={amount} onChange={(e) => { setNote(null); setAmount(e.target.value); }} />
          </label>
          {needsCode ? <CodeField id="one-tap-code" value={code} onChange={setCode} /> : null}
          <Button type="submit" disabled={m.isPending || !Number.isFinite(typed) || typed === d.limit || blocked || (needsCode && code.length !== 6)}>
            {m.isPending ? "Saving…" : "Save limit"}
          </Button>
          {d.own != null ? (
            <Button type="button" variant="ghost" disabled={m.isPending || (raising(null) && (!d.twoFactorOn || code.length !== 6))} onClick={() => m.mutate(null)}>
              Use Seeds default ({usd(d.adminDefault)})
            </Button>
          ) : null}
        </form>
        {blocked || (d.own != null && raising(null) && !d.twoFactorOn) ? (
          <Note tone="warn">Raising your limit{d.own != null && raising(null) ? ` (going back to the ${usd(d.adminDefault)} default counts too)` : ""} needs two-factor sign-in. <Link to="/account/security" className="font-semibold text-primary underline">Turn it on in Security</Link>, then come back.</Note>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Lowering it (or setting $0 to always confirm on Seeds) works any time. Raising it needs the code from your authenticator app, and Seeds tells your Telegram whenever it changes.
        </p>
      </div>
    </Card>
  );
}
