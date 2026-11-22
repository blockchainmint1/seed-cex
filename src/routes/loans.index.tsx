import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, HandCoins, KeyRound, Lock, Scale, ShieldCheck, Sprout } from "lucide-react";
import { answerProposal, createLoanOffer, getLoanDesk, getLoanMarket, proposeLoan, setLoanOfferStatus } from "@/lib/loans/loans.functions";
import { aprOf, LIQUIDATION_LTV, LOAN_COINS, MARGIN_CALL_LTV, SEEDS_DEFAULT_FEE_PCT, STATUS_LABEL, type LoanCoin, type LoanStatus } from "@/lib/loans/rules";
import { draftToTerms, fmt, fmtUsd, TermsFields, TermsMath, type TermsDraft } from "@/components/loans/LoanBits";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const title = "Seeds Lend — peer-to-peer loans, no middleman cut | Seeds";
const description =
  "Borrow against your crypto or lend stablecoins to real people. Every loan has its own lockbox, and Seeds never takes a cut. Switched off for now while the rules are reworked.";

export const Route = createFileRoute("/loans/")({
  // Private preview: unlinked and kept out of search until beta access is set up.
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

type Market = Awaited<ReturnType<typeof getLoanMarket>>;
type Offer = Market["offers"][number];
type Desk = Awaited<ReturnType<typeof getLoanDesk>>;
type Proposal = Desk["proposals"][number];

const blankDraft = (coin: LoanCoin = "TSD"): TermsDraft => ({ coin, amount: "500", ratePct: "4", days: "90", startLtvPct: "50" });

function LoansPage() {
  const { user } = useSession();
  const market = useQuery({ queryKey: ["loan-market"], queryFn: useServerFn(getLoanMarket), refetchInterval: 60_000 });
  const deskFn = useServerFn(getLoanDesk);
  const desk = useQuery({ queryKey: ["loan-desk", user?.id], queryFn: () => deskFn(), enabled: !!user, refetchInterval: 30_000 });
  const [side, setSide] = useState<"lend" | "borrow">("lend");
  const [coin, setCoin] = useState<LoanCoin | "all">("all");
  const [taking, setTaking] = useState<Offer | null>(null);
  const [posting, setPosting] = useState(false);
  const price = market.data?.txcPrice ?? null;
  const open = market.data?.open ?? false;
  const mine = useMemo(() => new Set((desk.data?.offers ?? []).map((o) => o.id)), [desk.data]);

  const rows = useMemo(
    () => (market.data?.offers ?? []).filter((o) => o.side === side && (coin === "all" || o.coin === coin)).sort((a, b) => a.ratePct / a.days - b.ratePct / b.days),
    [market.data, side, coin],
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <section className="mb-10 grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-primary uppercase">
            <Sprout className="h-3.5 w-3.5" /> Seeds Lend · private preview
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Borrow against your crypto.<br />Lend to real people.
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Lenders post what they'll lend, borrowers post what they need, and you work out the terms together. Every loan gets its
            own lockbox — nothing is pooled, nothing is lent out again, and Seeds never takes a cut of your loan or your interest.
          </p>
          {!open && !market.isLoading ? (
            <div role="status" className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <b className="font-display">Seeds Lend is switched off for now.</b>{" "}
              <span className="text-muted-foreground">
                We're reworking the rules before anyone can lend or borrow. Nothing can be offered, accepted or sent here until it's back.
              </span>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {!open ? null : user ? (
              <Button onClick={() => setPosting(true)} className="bg-action text-action-foreground hover:brightness-105">Post an offer</Button>
            ) : (
              <Button asChild className="bg-action text-action-foreground hover:brightness-105"><Link to="/auth" search={{ redirect: "/loans" }}>Sign in to lend or borrow</Link></Button>
            )}
            {open ? <Button variant="outline" asChild><a href="#how">How it works</a></Button> : null}
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          {[
            [Lock, "One lockbox per loan", "Your collateral sits in an address made just for this loan. Never pooled, never re-lent."],
            [KeyRound, "Two of three keys", "Borrower, lender and Seeds each hold one. Seeds can only ever pay the two of you, by the terms you agreed."],
            [HandCoins, "Seeds takes no cut", `0% on every loan. Only a liquidation or default carries a ${SEEDS_DEFAULT_FEE_PCT}% fee — from the borrower's leftover, never the lender's.`],
          ].map(([Icon, h, b]) => {
            const I = Icon as typeof Lock;
            return (
              <div key={h as string} className="flex gap-3 rounded-sm border border-border bg-surface p-3">
                <I className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div><b>{h as string}</b> <span className="text-muted-foreground">{b as string}</span></div>
              </div>
            );
          })}
        </div>
      </section>

      {user && desk.data ? <DeskPanel desk={desk.data} price={price} /> : null}

      {/* Switched off (and TXC collateral retired): the market and the TXC walkthrough stay hidden. */}
      {open ? (<>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-sm border border-border text-sm">
          {(["lend", "borrow"] as const).map((x) => (
            <button key={x} onClick={() => setSide(x)} className={`px-4 py-2 font-display font-bold ${side === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {x === "lend" ? "Borrow from lenders" : "Lend to borrowers"}
            </button>
          ))}
        </div>
        <div className="flex rounded-sm border border-border">
          {(["all", ...LOAN_COINS] as const).map((c) => (
            <button key={c} onClick={() => setCoin(c)} className={`px-3 py-1.5 font-mono text-xs uppercase ${coin === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{c}</button>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-sm border border-border bg-surface">
        <div className="hidden min-w-[760px] grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_auto] gap-4 border-b border-border px-4 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase md:grid">
          <span>{side === "lend" ? "Lender" : "Borrower"}</span><span>Amount</span><span>Interest</span><span>Term</span><span>{side === "lend" ? "Max LTV" : "LTV offered"}</span><span />
        </div>
        {market.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading offers…</p>
        ) : !rows.length ? (
          <p className="p-6 text-sm text-muted-foreground">
            {side === "lend" ? "No lenders yet." : "No borrowers yet."} {user && open ? <button className="text-primary" onClick={() => setPosting(true)}>Be the first to post.</button> : null}
          </p>
        ) : (
          rows.map((o) => (
            <div key={o.id} className="grid gap-3 border-b border-border px-4 py-4 last:border-0 md:min-w-[760px] md:grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_auto] md:items-center md:gap-4">
              <div>
                <b className="font-display">{o.name}</b>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                  {o.record.repaid + o.record.lent > 0 ? `${o.record.repaid} repaid · ${o.record.lent} lent` : "New to Seeds Lend"}
                  {o.record.bad > 0 ? <span className="text-destructive"> · {o.record.bad} liquidated/defaulted</span> : null}
                </div>
                {o.note ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">“{o.note}”</p> : null}
              </div>
              <div className="font-mono text-sm">{fmt(o.minAmount)}–{fmt(o.maxAmount)} <span className="text-muted-foreground">{o.coin}</span></div>
              <div className="text-sm"><b className="font-mono">{fmt(o.ratePct)}%</b> <span className="text-xs text-muted-foreground">≈ {fmt(aprOf(o.ratePct, o.days))}%/yr</span></div>
              <div className="font-mono text-sm">{o.days} days</div>
              <div className="font-mono text-sm">{fmt(o.maxLtvPct)}%</div>
              <div>
                {mine.has(o.id) ? (
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">Your offer</span>
                ) : user ? (
                  <Button size="sm" onClick={() => setTaking(o)}>{o.side === "lend" ? "Borrow" : "Lend"} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                ) : (
                  <Button size="sm" variant="outline" asChild><Link to="/auth" search={{ redirect: "/loans" }}>Sign in</Link></Button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Collateral is TXC for now, priced at {fmtUsd(price)}. Interest is one flat percentage for the whole term, agreed up front.
      </p>

      <HowItWorks />
      </>) : null}

      {taking ? <ProposeDialog offer={taking} price={price} onClose={() => setTaking(null)} /> : null}
      {posting ? <PostOfferDialog price={price} onClose={() => setPosting(false)} /> : null}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Agree", "Pick an offer or post your own. Go back and forth on amount, interest, term and loan-to-value until you both say yes."],
    ["Lock", "The borrower locks TXC in the loan's own lockbox — straight from their pocket, with one Telegram tap."],
    ["Lend", "Once the TXC is confirmed, the lender sends the loan from their pocket to the borrower's, also with a Telegram tap."],
    ["Repay", "The borrower repays what's owed any time before the due date. As soon as it confirms, the TXC goes back to them."],
    ["Protect", `If TXC falls and the loan reaches ${LIQUIDATION_LTV}% loan-to-value (warnings start at ${MARGIN_CALL_LTV}%), or it's 72 hours overdue, the lender is paid from the lockbox.`],
  ];
  return (
    <section id="how" className="mt-14 scroll-mt-24">
      <p className="font-mono text-xs tracking-widest text-primary uppercase">How a loan works</p>
      <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">Five steps, two people, zero middleman.</h2>
      <ol className="mt-6 grid gap-3 md:grid-cols-5">
        {steps.map(([h, b], i) => (
          <li key={h} className="rounded-sm border border-border bg-surface p-4">
            <span className="font-mono text-xs text-primary">0{i + 1}</span>
            <h3 className="mt-1 font-display text-lg font-bold">{h}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{b}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-sm border border-border p-4 text-sm">
          <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
          <b>Liquidations can't be faked.</b> <span className="text-muted-foreground">Seeds checks the TXC price every 5 minutes and only acts when the newest price and the middle of the last six checks both cross the line. One strange price can't trigger it.</span>
        </div>
        <div className="rounded-sm border border-border p-4 text-sm">
          <Scale className="mb-2 h-4 w-4 text-primary" />
          <b>Lender first, then fee, then borrower.</b> <span className="text-muted-foreground">A payout gives the lender TXC worth what they're owed. Seeds' {SEEDS_DEFAULT_FEE_PCT}% only comes from what's left after that, and the rest goes back to the borrower.</span>
        </div>
        <div className="rounded-sm border border-border p-4 text-sm">
          <KeyRound className="mb-2 h-4 w-4 text-primary" />
          <b>Works even without Seeds.</b> <span className="text-muted-foreground">Borrower and lender hold two of the three keys between them, so together they can always move the lockbox with their own wallets.</span>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- dialogs -------------------------------- */

function ProposeDialog({ offer, price, onClose, counter }: { offer: Offer; price: number | null; onClose: () => void; counter?: Proposal }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TermsDraft>(() => ({
    coin: offer.coin as LoanCoin,
    amount: String(counter?.amount ?? Math.min(offer.maxAmount, Math.max(offer.minAmount, 500))),
    ratePct: String(counter?.ratePct ?? offer.ratePct),
    days: String(counter?.days ?? offer.days),
    startLtvPct: String(counter?.startLtvPct ?? Math.min(offer.maxLtvPct, 50)),
  }));
  const [note, setNote] = useState("");
  const propose = useServerFn(proposeLoan);
  const m = useMutation({
    mutationFn: () => propose({ data: { offerId: offer.id, terms: draftToTerms(draft), note: note || undefined } }),
    onSuccess: () => { toast.success("Sent. They have 48 hours to accept, counter or decline."); qc.invalidateQueries({ queryKey: ["loan-desk"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const borrowing = offer.side === "lend";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{borrowing ? `Borrow from ${offer.name}` : `Lend to ${offer.name}`}</DialogTitle>
          <DialogDescription>
            Their terms: {fmt(offer.minAmount)}–{fmt(offer.maxAmount)} {offer.coin}, {fmt(offer.ratePct)}% for {offer.days} days, up to {fmt(offer.maxLtvPct)}% loan-to-value. Change anything — they can accept, counter or decline.
          </DialogDescription>
        </DialogHeader>
        <TermsFields value={draft} onChange={setDraft} lockCoin />
        <TermsMath terms={draftToTerms(draft)} price={price} />
        <Textarea placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Sending…" : "Send these terms"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function PostOfferDialog({ price, onClose }: { price: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<"lend" | "borrow">("lend");
  const [draft, setDraft] = useState<TermsDraft>(blankDraft());
  const [minAmount, setMinAmount] = useState("100");
  const [note, setNote] = useState("");
  const create = useServerFn(createLoanOffer);
  const m = useMutation({
    mutationFn: () => {
      const t = draftToTerms(draft);
      return create({ data: { side, coin: t.coin, minAmount: side === "lend" ? Number(minAmount) : t.amount, maxAmount: t.amount, ratePct: t.ratePct, days: t.days, maxLtvPct: t.startLtvPct, note: note || undefined } });
    },
    onSuccess: () => { toast.success("Your offer is live."); qc.invalidateQueries({ queryKey: ["loan-market"] }); qc.invalidateQueries({ queryKey: ["loan-desk"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Post an offer</DialogTitle>
          <DialogDescription>Nothing is locked or sent until someone agrees terms with you.</DialogDescription>
        </DialogHeader>
        <div className="flex rounded-sm border border-border text-sm">
          {(["lend", "borrow"] as const).map((x) => (
            <button key={x} onClick={() => setSide(x)} className={`flex-1 px-3 py-2 font-display font-bold ${side === x ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {x === "lend" ? "I want to lend" : "I want to borrow"}
            </button>
          ))}
        </div>
        <TermsFields value={draft} onChange={setDraft} />
        {side === "lend" ? (
          <label className="grid gap-1 text-sm">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Smallest loan you'll make</span>
            <Input inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </label>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {side === "lend" ? "Amount is the most you'll lend; loan-to-value is the most you'll accept." : "Loan-to-value is what you're offering — lower means more TXC locked and a safer loan for the lender."}
        </p>
        <TermsMath terms={draftToTerms(draft)} price={price} />
        <Textarea placeholder="A note for the other side (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Posting…" : "Post offer"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function CounterDialog({ p, price, onClose }: { p: Proposal; price: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TermsDraft>({ coin: p.coin as LoanCoin, amount: String(p.amount), ratePct: String(p.ratePct), days: String(p.days), startLtvPct: String(p.startLtvPct) });
  const [note, setNote] = useState("");
  const answer = useServerFn(answerProposal);
  const m = useMutation({
    mutationFn: () => answer({ data: { id: p.id, action: "counter", terms: draftToTerms(draft), note: note || undefined } }),
    onSuccess: () => { toast.success("Counter-offer sent."); qc.invalidateQueries({ queryKey: ["loan-desk"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Counter-offer</DialogTitle>
          <DialogDescription>Change the terms and send them back. Round {p.round + 1}.</DialogDescription>
        </DialogHeader>
        <TermsFields value={draft} onChange={setDraft} lockCoin />
        <TermsMath terms={draftToTerms(draft)} price={price} />
        <Textarea placeholder="Why? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Sending…" : "Send counter-offer"}</Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- desk ---------------------------------- */

function DeskPanel({ desk, price }: { desk: Desk; price: number | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const answer = useServerFn(answerProposal);
  const setStatus = useServerFn(setLoanOfferStatus);
  const [countering, setCountering] = useState<Proposal | null>(null);
  const act = useMutation({
    mutationFn: (v: { id: string; action: "accept" | "decline" | "withdraw" }) => answer({ data: v }),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ["loan-desk"] });
      if (v.action === "accept" && "loanId" in r && r.loanId) navigate({ to: "/loans/$id", params: { id: r.loanId } });
      else toast.success(v.action === "decline" ? "Declined." : "Withdrawn.");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const offerMut = useMutation({
    mutationFn: (v: { id: string; status: "open" | "paused" | "closed" }) => setStatus({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loan-desk"] }); qc.invalidateQueries({ queryKey: ["loan-market"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const live = desk.proposals.filter((p) => p.status === "pending" && Date.parse(p.expiresAt) > Date.now());
  const mine = (p: Proposal) => p.proposerId === desk.me;
  const otherName = (p: Proposal) => (p.borrowerId === desk.me ? p.lenderName : p.borrowerName);
  const openLoans = desk.loans.filter((l) => l.status !== "closed");
  const closedLoans = desk.loans.filter((l) => l.status === "closed");
  if (!live.length && !desk.loans.length && !desk.offers.length) return null;

  return (
    <section className="mb-10 grid gap-4 lg:grid-cols-2">
      {!desk.tester ? (
        <p className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm lg:col-span-2">
          Private beta: you can post and negotiate, but real loans start only between beta testers for now.
        </p>
      ) : null}
      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-bold">Negotiations</h2>
        {!live.length ? <p className="mt-2 text-sm text-muted-foreground">Nothing waiting.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {live.map((p) => (
              <li key={p.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <b>{p.borrowerId === desk.me ? "Borrow" : "Lend"} {fmt(p.amount)} {p.coin}</b> · {fmt(p.ratePct)}% for {p.days} days · {fmt(p.startLtvPct)}% LTV
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground uppercase">with {otherName(p)} · round {p.round}</span>
                </div>
                {p.note ? <p className="mt-1 text-xs text-muted-foreground">“{p.note}”</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {mine(p) ? (
                    <>
                      <span className="text-xs text-muted-foreground">Waiting for {otherName(p)}…</span>
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, action: "withdraw" })}>Withdraw</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => act.mutate({ id: p.id, action: "accept" })} disabled={act.isPending}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => setCountering(p)}>Counter</Button>
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, action: "decline" })}>Decline</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-bold">Your loans</h2>
        {!desk.loans.length ? <p className="mt-2 text-sm text-muted-foreground">No loans yet.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {[...openLoans, ...closedLoans.slice(0, 5)].map((l) => (
              <li key={l.id} className="py-2.5">
                <Link to="/loans/$id" params={{ id: l.id }} className="flex flex-wrap items-center justify-between gap-2 text-sm hover:text-primary">
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{l.ref}</span>{" "}
                    <b>{l.role === "borrower" ? "Borrowed" : "Lent"} {fmt(l.amount)} {l.coin}</b> · {l.role === "borrower" ? "from" : "to"} {l.other}
                  </span>
                  <span className={`font-mono text-[10px] uppercase ${l.status === "closed" ? "text-muted-foreground" : "text-primary"}`}>
                    {l.status === "closed" ? l.outcome : STATUS_LABEL[l.status as LoanStatus]}
                    {l.ltv != null && l.status === "active" ? ` · ${fmt(l.ltv)}% LTV` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {desk.offers.length ? (
        <div className="rounded-sm border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Your offers</h2>
          <ul className="mt-3 divide-y divide-border">
            {desk.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  <b>{o.side === "lend" ? "Lending" : "Borrowing"} {fmt(o.minAmount)}–{fmt(o.maxAmount)} {o.coin}</b> · {fmt(o.ratePct)}% for {o.days} days · {fmt(o.maxLtvPct)}% LTV
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground uppercase">{o.status}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => offerMut.mutate({ id: o.id, status: o.status === "open" ? "paused" : "open" })}>{o.status === "open" ? "Pause" : "Reopen"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => offerMut.mutate({ id: o.id, status: "closed" })}>Close</Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {countering ? <CounterDialog p={countering} price={price} onClose={() => setCountering(null)} /> : null}
    </section>
  );
}
