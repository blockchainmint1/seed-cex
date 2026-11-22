import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, KeyRound, Lock, RefreshCw } from "lucide-react";
import { cancelLoan, getLoan, refreshLoan, startLoanSend } from "@/lib/loans/loans.functions";
import { aprOf, liquidationPrice, ltvPct, STATUS_LABEL } from "@/lib/loans/rules";
import { fmt, fmtCoin, fmtUsd, LtvBar } from "@/components/loans/LoanBits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/loans/$id")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Your loan | Seeds Lend" },
      { name: "description", content: "Track a Seeds Lend loan: its lockbox, health, payments and history." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Your loan | Seeds Lend" },
      { property: "og:description", content: "Track a Seeds Lend loan: its lockbox, health, payments and history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoanRoom,
});

type Data = Awaited<ReturnType<typeof getLoan>>;

function LoanRoom() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchLoan = useServerFn(getLoan);
  const q = useQuery({ queryKey: ["loan", id], queryFn: () => fetchLoan({ data: { id } }), refetchInterval: 20_000 });
  const refresh = useServerFn(refreshLoan);
  const check = useMutation({
    mutationFn: () => refresh({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loan", id] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <div className="mx-auto max-w-7xl px-5 py-10 text-sm text-muted-foreground">Loading the loan…</div>;
  if (q.error || !q.data) return <div className="mx-auto max-w-7xl px-5 py-10 text-sm">Loan not found. <Link to="/loans" className="text-primary">Back to Seeds Lend</Link></div>;
  const d = q.data;
  const l = d.loan;
  const locked = Number(l.collateral_seen);
  const liveLtv = l.last_price ? ltvPct(l.owed, locked || l.collateral_amount, l.last_price) : null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <Link to="/loans" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Seeds Lend</Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-primary uppercase">{l.ref} · you're the {d.role}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            {fmt(l.amount)} {l.coin} for {l.days} days
          </h1>
          <p className="mt-1 text-muted-foreground">{d.names.borrower} borrows from {d.names.lender} · {fmt(l.rate_pct)}% for the term (≈ {fmt(aprOf(l.rate_pct, l.days))}%/yr)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-sm px-2.5 py-1 font-mono text-xs uppercase ${l.status === "closed" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
            {l.status === "closed" ? l.outcome : STATUS_LABEL[l.status]}
          </span>
          <Button size="sm" variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${check.isPending ? "animate-spin" : ""}`} /> Check now
          </Button>
        </div>
      </header>

      <Stepper d={d} />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-4">
          <ActionCard d={d} />
          <section className="rounded-sm border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-bold">Loan health</h2>
            <div className="mt-3"><LtvBar ltv={l.status === "active" ? (l.last_ltv_pct ?? liveLtv) : l.start_ltv_pct} /></div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Stat k="Owed at the end" v={`${fmt(l.owed)} ${l.coin}`} />
              <Stat k="TXC locked" v={`${fmtCoin(locked)} / ${fmtCoin(l.collateral_amount)}`} />
              <Stat k="TXC price" v={fmtUsd(l.last_price ?? l.price_at_start)} />
              <Stat k="Loan-to-value" v={l.last_ltv_pct != null ? `${fmt(l.last_ltv_pct)}%` : `${fmt(l.start_ltv_pct)}% at start`} />
              <Stat k="Liquidated if TXC hits" v={fmtUsd(liquidationPrice(l.owed, locked || l.collateral_amount))} />
              <Stat k="Due" v={l.due_at ? new Date(l.due_at).toLocaleString() : "Starts when the loan is sent"} />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Warnings start at {d.rules.marginCallLtv}% loan-to-value. At {d.rules.liquidationLtv}% — confirmed by six price checks over 30 minutes — the lockbox pays the lender.
              The borrower can add TXC to the lockbox address at any time to bring it down.
            </p>
          </section>
          <section className="rounded-sm border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-bold">History</h2>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {d.events.map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <p>{e.body}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {new Date(e.at).toLocaleString()}{e.txid ? <> · tx <span data-qa-mask>{e.txid.slice(0, 12)}…</span></> : null}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="grid content-start gap-4">
          <section className="rounded-sm border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Lock className="h-4 w-4 text-primary" /> The lockbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">This loan's collateral lives at its own TEXITcoin address. Any two of these three keys can move it — never one alone.</p>
            <p className="mt-3 break-all rounded-sm border border-border bg-background p-2 font-mono text-xs" data-qa-mask>{l.escrow_address}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {[
                ["Borrower + Seeds", "return the TXC to the borrower (repaid or never started)"],
                ["Lender + Seeds", "pay the lender (liquidation or default)"],
                ["Borrower + lender", "together, without Seeds, from their own wallets"],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-2"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span><b>{k}</b> <span className="text-muted-foreground">{v}</span></span></li>
              ))}
            </ul>
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
              <p className="mt-2 text-muted-foreground">2-of-3 P2SH multisig. Redeem script:</p>
              <p className="mt-1 break-all font-mono" data-qa-mask>{l.redeem_script}</p>
              <p className="mt-2 text-muted-foreground">Payouts go to the borrower's TXC pocket <span className="font-mono" data-qa-mask>{l.borrower_collateral_address}</span> and the lender's <span className="font-mono" data-qa-mask>{l.lender_collateral_address}</span>.</p>
            </details>
          </section>
          <section className="rounded-sm border border-border bg-surface p-5 text-sm">
            <h2 className="font-display text-lg font-bold">What Seeds takes</h2>
            <p className="mt-2"><b>Nothing</b> <span className="text-muted-foreground">on this loan or its interest.</span></p>
            <p className="mt-1 text-muted-foreground">Only if it's liquidated or defaults: {fmt(l.fee_pct)}% of what's owed, taken from the borrower's leftover TXC after the lender is paid in full — never from the lender.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div><dt className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{k}</dt><dd className="mt-0.5 font-mono">{v}</dd></div>;
}

function Stepper({ d }: { d: Data }) {
  const l = d.loan;
  const bad = l.outcome === "liquidated" || l.outcome === "defaulted";
  const steps: [string, boolean][] = [
    ["Terms agreed", true],
    ["Collateral locked", !!l.collateral_confirmed_at],
    ["Loan sent", !!l.funding_confirmed_at],
    [bad ? (l.outcome === "liquidated" ? "Liquidated" : "Defaulted") : "Repaid", !!l.repaid_confirmed_at || bad],
    [l.outcome === "cancelled" ? "Cancelled · TXC returned" : "Lockbox paid out", l.status === "closed"],
  ];
  return (
    <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {steps.map(([label, done], i) => (
        <li key={label} className={`flex items-center gap-2 rounded-sm border p-2.5 text-sm ${done ? "border-primary/40 bg-primary/10" : "border-border"}`}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {done ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ActionCard({ d }: { d: Data }) {
  const qc = useQueryClient();
  const l = d.loan;
  const send = useServerFn(startLoanSend);
  const cancel = useServerFn(cancelLoan);
  const go = useMutation({
    mutationFn: (kind: "loan_collateral" | "loan_funding" | "loan_repay") => send({ data: { id: l.id, kind } }),
    onSuccess: () => { toast.success("Check Telegram — tap Approve to send."); qc.invalidateQueries({ queryKey: ["loan", l.id] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const stop = useMutation({
    mutationFn: () => cancel({ data: { id: l.id } }),
    onSuccess: () => { toast.success("Cancelled."); qc.invalidateQueries({ queryKey: ["loan", l.id] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const pending = d.pending[0];
  const left = Math.max(0, l.collateral_amount - Number(l.collateral_seen));
  let body: React.ReactNode = null;

  if (pending) {
    body = <p className="text-sm">Waiting for a Telegram tap: <b>{fmtCoin(pending.amount)} {pending.asset}</b>. The request ends {new Date(pending.expiresAt).toLocaleTimeString()}.</p>;
  } else if (l.status === "awaiting_collateral") {
    body = d.role === "borrower" ? (
      <>
        <p className="text-sm">Lock <b>{fmtCoin(left)} TXC</b> in the lockbox by {new Date(l.collateral_deadline).toLocaleString()}. Send it from your trading pocket below, or from any TXC wallet to the lockbox address.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => go.mutate("loan_collateral")} disabled={go.isPending || !d.tester}>Lock {fmtCoin(left)} TXC</Button>
          <Button variant="ghost" onClick={() => stop.mutate()} disabled={stop.isPending}>Cancel loan</Button>
        </div>
      </>
    ) : <p className="text-sm">Waiting for {d.names.borrower} to lock {fmtCoin(l.collateral_amount)} TXC. You'll get a Telegram message the moment it's confirmed.</p>;
  } else if (l.status === "awaiting_funding") {
    body = d.role === "lender" ? (
      l.funding_txid ? <p className="text-sm">Sent — waiting for the network to confirm it.</p> : (
        <>
          <p className="text-sm">The collateral is locked and confirmed. Send <b>{fmt(l.amount)} {l.coin}</b> to {d.names.borrower} by {l.funding_deadline ? new Date(l.funding_deadline).toLocaleString() : "the deadline"}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => go.mutate("loan_funding")} disabled={go.isPending || !d.tester}>Send the loan</Button>
            <Button variant="ghost" onClick={() => stop.mutate()} disabled={stop.isPending}>Cancel</Button>
          </div>
        </>
      )
    ) : <p className="text-sm">Your TXC is locked. Waiting for {d.names.lender} to send {fmt(l.amount)} {l.coin}{l.funding_txid ? " — it's on its way." : "."}</p>;
  } else if (l.status === "active") {
    body = d.role === "borrower" ? (
      l.repay_txid ? <p className="text-sm">Repayment sent — your TXC comes back as soon as it confirms.</p> : (
        <>
          <p className="text-sm">Repay <b>{fmt(l.owed)} {l.coin}</b> any time before {l.due_at ? new Date(l.due_at).toLocaleString() : "the due date"}. The moment it confirms, your TXC is released.</p>
          <div className="mt-3"><Button onClick={() => go.mutate("loan_repay")} disabled={go.isPending || !d.tester}>Repay {fmt(l.owed)} {l.coin}</Button></div>
        </>
      )
    ) : <p className="text-sm">The loan is running. {d.names.borrower} owes you {fmt(l.owed)} {l.coin}{l.due_at ? ` by ${new Date(l.due_at).toLocaleDateString()}` : ""}. If TXC falls too far or it's 72 hours late, you're paid from the lockbox automatically.</p>;
  } else if (l.status === "closing") {
    body = <p className="text-sm">The lockbox payout is on the network. This loan closes once it confirms.</p>;
  } else {
    body = <p className="text-sm">This loan is closed ({l.outcome}).</p>;
  }

  return (
    <section className="rounded-sm border border-primary/40 bg-primary/5 p-5">
      <h2 className="font-display text-lg font-bold">Next step</h2>
      <div className="mt-2">{body}</div>
      {!d.tester && l.status !== "closed" && d.role !== "viewer" ? <p className="mt-2 text-xs text-muted-foreground">Real sends are open to beta testers only during the private beta.</p> : null}
    </section>
  );
}
