import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { coinGiveawayBudget, listingRevenue, LISTING_FINDER_RATE, type BusinessPlan, type PlanBlock, type PlanItem, type PlanLive, type PlanStatus } from "@/lib/business-plan";
import { LISTING_PACKAGES, type PackageId } from "@/lib/listing";
import { Card, Note, fieldLabel, inputCls } from "@/components/account/ui";
import { Stat } from "@/components/admin/ui";

const LAUNCH = Date.UTC(2026, 10, 30);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<PlanStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "border-primary/40 bg-primary/10 text-primary" },
  built: { label: "Built", cls: "border-primary/40 bg-primary/10 text-primary" },
  proposed: { label: "Proposed", cls: "border-border bg-muted/60 text-muted-foreground" },
  decide: { label: "Your call", cls: "border-warn/60 bg-warn/10 text-foreground" },
};

function Badge({ s }: { s: PlanStatus }) {
  return <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}

function Items({ title, items }: { title?: string; items: PlanItem[] }) {
  return (
    <div>
      {title ? <h4 className={`${fieldLabel} mb-2`}>{title}</h4> : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {items.map((it) => (
          <li key={it.title} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-sm font-bold">{it.title}</p>
              {it.status ? <Badge s={it.status} /> : null}
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">{it.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ title, head, rows }: { title?: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      {title ? <h4 className={`${fieldLabel} mb-2`}>{title}</h4> : null}
      {/* Phones: one stacked card per row so no column hides off-screen. */}
      <ul className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((r) => (
          <li key={r.join("|")} className="px-4 py-3">
            <p className="font-display text-sm font-bold">{r[0]}</p>
            <dl className="mt-1.5 space-y-1">
              {r.slice(1).map((c, i) => (
                <div key={i} className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
                  <dt className="font-mono text-[10px] leading-5 tracking-[0.12em] text-muted-foreground uppercase">{head[i + 1]}</dt>
                  <dd className="min-w-0 break-words text-muted-foreground">{c}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/40 text-left">{head.map((h) => <th key={h} className="px-3 py-2 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => <tr key={r.join("|")}>{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "font-semibold" : "text-muted-foreground"}`}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1, prefix }: { label: string; value: number; onChange: (n: number) => void; step?: number; prefix?: string }) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabel}>{label}</span>
      <div className="relative mt-1">
        {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span> : null}
        <input type="number" inputMode="decimal" min={0} step={step} value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))} className={`${inputCls} ${prefix ? "pl-7" : ""}`} />
      </div>
    </label>
  );
}

function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-display tabular-nums ${strong ? "text-lg font-extrabold text-primary" : "text-sm font-bold"}`}>{value}</span>
    </div>
  );
}

function ListingCalc() {
  const [mix, setMix] = useState<Record<PackageId, number>>({ seed: 6, sapling: 3, grove: 1 });
  const [referred, setReferred] = useState(50);
  const r = listingRevenue(mix, referred / 100);
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
      <h4 className="font-display text-sm font-bold">Listing income calculator</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">How many coin teams per year on each package, and how many came through a finder ({Math.round(LISTING_FINDER_RATE * 100)}% fee).</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LISTING_PACKAGES.map((p) => <Num key={p.id} label={`${p.name} (${money(p.priceUsd)})`} value={mix[p.id]} onChange={(n) => setMix({ ...mix, [p.id]: n })} />)}
        <Num label="% via a finder" value={referred} onChange={(n) => setReferred(Math.min(100, Math.max(0, n)))} step={5} />
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <Result label="Listing fees" value={money(r.gross)} />
        <Result label="Finder's fees paid out" value={`− ${money(r.finderFees)}`} />
        <Result label="Seeds keeps" value={money(r.net)} strong />
      </div>
    </div>
  );
}

function CoinCalc() {
  const [v, setV] = useState({ coins: 5000, unitCost: 3.47, setup: 150, rewardUsd: 0, claimRate: 10 });
  const b = coinGiveawayBudget({ ...v, claimRate: v.claimRate / 100 });
  const set = (k: keyof typeof v) => (n: number) => setV({ ...v, [k]: n });
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
      <h4 className="font-display text-sm font-bold">Giveaway coin budget</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">Starts at 5,000 two-inch coins (the 2,000-coin price; ask for a bulk quote). The claim rate is a guess; real numbers come from the first event.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Num label="Coins" value={v.coins} onChange={set("coins")} step={100} />
        <Num label="Cost per coin" value={v.unitCost} onChange={set("unitCost")} step={0.01} prefix="$" />
        <Num label="Mold & setup" value={v.setup} onChange={set("setup")} step={10} prefix="$" />
        <Num label="Reward per claim" value={v.rewardUsd} onChange={set("rewardUsd")} step={1} prefix="$" />
        <Num label="% who claim" value={v.claimRate} onChange={(n) => set("claimRate")(Math.min(100, Math.max(0, n)))} step={1} />
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <Result label="Making the coins" value={money2(b.making)} />
        <Result label={`Rewards (${b.claims.toLocaleString("en-US")} claims)`} value={money2(b.rewards)} />
        <Result label="Total" value={money2(b.total)} />
        <Result label="Cost per new member" value={b.perSignup == null ? "—" : money2(b.perSignup)} strong />
      </div>
    </div>
  );
}

function Block({ b }: { b: PlanBlock }): ReactNode {
  switch (b.kind) {
    case "text": return <p className="text-sm leading-relaxed">{b.text}</p>;
    case "items": return <Items title={b.title} items={b.items} />;
    case "table": return <Table title={b.title} head={b.head} rows={b.rows} />;
    case "note": return <Note tone={b.tone}>{b.text}</Note>;
    case "calc": return b.calc === "listing" ? <ListingCalc /> : <CoinCalc />;
  }
}

/** The business plan page body (admin-only data passed in). */
export function PlanView({ plan, live }: { plan: BusinessPlan; live: PlanLive }) {
  const days = Math.max(0, Math.ceil((LAUNCH - Date.now()) / 86_400_000));
  return (
    <>
          <section aria-label="Where we are today">
            <h3 className={`${fieldLabel} mb-2`}>Where we are today</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Days to launch" value={String(days)} />
              <Stat label="Members" value={String(live.members)} />
              <Stat label="Wallets linked" value={String(live.linkedWallets)} tone="good" />
              <Stat label="Flight School seats paid" value={`${live.igniteSeats} / ${live.igniteCapacity}`} />
              <Stat label="Listing applications" value={String(live.listingApplications)} tone={live.listingApplications ? undefined : "warn"} />
              <Stat label="Coins listed" value={String(live.listingsLive)} />
            </div>
          </section>

          <nav aria-label="Plan sections" className="flex flex-wrap gap-2">
            {plan.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold transition-colors hover:border-primary/50 hover:text-primary">{s.title}</a>
            ))}
          </nav>

          <Link to="/admin/plan/lbtc" className="group flex items-center gap-4 rounded-md border border-border bg-surface p-4 transition-colors hover:border-primary/50">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className={`${fieldLabel} block`}>Research</span>
              <span className="block font-semibold">Why LocalBitcoins died</span>
              <span className="block text-xs text-muted-foreground">The post-mortem behind our P2P desk: what killed it, who replaced it, and what Seeds should copy or refuse.</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Labels:</span>
            {(Object.keys(STATUS) as PlanStatus[]).filter((s) => s !== "built").map((s) => <Badge key={s} s={s} />)}
            <span>Unlabelled items are plan steps.</span>
          </div>

          {plan.sections.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-24">
              <Card title={s.title} desc={s.summary}>
                <div className="space-y-5">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
              </Card>
            </div>
          ))}
    </>
  );
}
