import { aprOf, amountOwed, collateralNeeded, LIQUIDATION_LTV, LOAN_COINS, LOAN_LIMITS, MARGIN_CALL_LTV, termsProblem, type LoanCoin, type LoanTerms } from "@/lib/loans/rules";
import { Input } from "@/components/ui/input";

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) > 0 && n % 1 ? 2 : 0 });
export const fmtCoin = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 8 }));
export const fmtUsd = (n: number | null | undefined, d = 4) => (n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 2 })}`);

export type TermsDraft = { coin: LoanCoin; amount: string; ratePct: string; days: string; startLtvPct: string };

export function draftToTerms(d: TermsDraft): LoanTerms {
  return { coin: d.coin, collateralCoin: "TXC", amount: Number(d.amount), ratePct: Number(d.ratePct), days: Number(d.days), startLtvPct: Number(d.startLtvPct) };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function TermsFields({ value, onChange, lockCoin }: { value: TermsDraft; onChange: (v: TermsDraft) => void; lockCoin?: boolean }) {
  const set = (k: keyof TermsDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Coin">
        <select value={value.coin} onChange={set("coin")} disabled={lockCoin} className="h-10 rounded-sm border border-border bg-background px-2 text-sm">
          {LOAN_COINS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Amount">
        <Input inputMode="decimal" value={value.amount} onChange={set("amount")} />
      </Field>
      <Field label="Interest for the whole term (%)" hint={`≈ ${fmt(aprOf(Number(value.ratePct) || 0, Number(value.days) || 0))}% a year`}>
        <Input inputMode="decimal" value={value.ratePct} onChange={set("ratePct")} />
      </Field>
      <Field label="Term (days)" hint={`${LOAN_LIMITS.minDays}–${LOAN_LIMITS.maxDays} days`}>
        <Input inputMode="numeric" value={value.days} onChange={set("days")} />
      </Field>
      <Field label="Starting loan-to-value (%)" hint={`Lower = more TXC locked, safer. ${LOAN_LIMITS.minStartLtvPct}–${LOAN_LIMITS.maxStartLtvPct}%`}>
        <Input inputMode="decimal" value={value.startLtvPct} onChange={set("startLtvPct")} />
      </Field>
    </div>
  );
}

/** Live numbers for a set of terms at today's TXC price. */
export function TermsMath({ terms, price }: { terms: LoanTerms; price: number | null }) {
  const problem = termsProblem(terms);
  if (problem) return <p className="rounded-sm border border-border bg-surface p-3 text-sm text-muted-foreground">{problem}</p>;
  const owed = amountOwed(terms);
  const coll = price ? collateralNeeded(terms, price) : null;
  const liq = coll ? owed / (coll * (LIQUIDATION_LTV / 100)) : null;
  const call = coll ? owed / (coll * (MARGIN_CALL_LTV / 100)) : null;
  const rows: [string, string][] = [
    ["Repay at the end", `${fmt(owed)} ${terms.coin}`],
    ["TXC to lock", coll ? `${fmtCoin(coll)} TXC` : "needs a live TXC price"],
    ["TXC price now", fmtUsd(price)],
    [`Warning if TXC falls to`, fmtUsd(call)],
    [`Liquidated if TXC falls to`, fmtUsd(liq)],
    ["Seeds' cut", "None"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-sm border border-border bg-surface p-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Loan-to-value bar with the warning and liquidation lines marked. */
export function LtvBar({ ltv }: { ltv: number | null }) {
  const pct = ltv == null || !Number.isFinite(ltv) ? null : Math.min(100, Math.max(0, ltv));
  const tone = pct == null ? "bg-muted" : pct >= LIQUIDATION_LTV ? "bg-destructive" : pct >= MARGIN_CALL_LTV ? "bg-warning" : "bg-primary";
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        {pct != null ? <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} /> : null}
        <span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${MARGIN_CALL_LTV}%` }} />
        <span className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: `${LIQUIDATION_LTV}%` }} />
      </div>
      <div className="relative mt-1 h-4 font-mono text-[10px] text-muted-foreground">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${MARGIN_CALL_LTV}%` }}>{MARGIN_CALL_LTV}%</span>
        <span className="absolute -translate-x-1/2 text-destructive" style={{ left: `${LIQUIDATION_LTV}%` }}>{LIQUIDATION_LTV}%</span>
      </div>
    </div>
  );
}
