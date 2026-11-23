import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BadgeCheck, Ban, Bot, Check, Clock, Coins, Handshake, ShieldCheck, Tag, Trophy, Users, Wallet } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { checkListingPromo, getListingPrices, getMyListingApplications, startListingCheckout, submitListingApplication } from "@/lib/listing.functions";
import { DEFAULT_PRICES, LISTING_NETWORKS, PAYMENT_LABEL, packageById, pricedPackages, type ListingPrices, type PackageId, type PaymentStatus } from "@/lib/listing";
import { LAUNCH_DATE_LABEL } from "@/lib/launch";
import { shownEmail } from "@/lib/key-signin/rules";

const TITLE = "List on Seeds — bring your community, keep your holders safe";
const desc = (from: number) => `List your coin on Seeds from ${usd(from)}. No trading-volume minimum, no liquidity or market-maker requirements, and no Seeds fee on trades, ever. Holders keep their coins in their own wallets.`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/list")({
  staticData: { sitemap: true },
  // ?package= keeps the chosen package across the Honest.Money sign-in round trip.
  // ?paid= is where NectarPay sends the team back after checkout.
  validateSearch: (s: Record<string, unknown>): { package?: PackageId; paid?: string } => ({
    package: typeof s.package === "string" && packageById(s.package) ? (s.package as PackageId) : undefined,
    paid: typeof s.paid === "string" && UUID_RE.test(s.paid) ? s.paid : undefined,
  }),
  loader: async (): Promise<ListingPrices> => {
    try { return await getListingPrices(); } catch { return DEFAULT_PRICES; }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: TITLE },
      { name: "description", content: desc(Math.min(...Object.values(loaderData ?? DEFAULT_PRICES))) },
      { property: "og:title", content: "List on Seeds" },
      { property: "og:description", content: desc(Math.min(...Object.values(loaderData ?? DEFAULT_PRICES))) },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListOnSeeds,
});

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const WHY: { icon: typeof Wallet; title: string; body: ReactNode }[] = [
  { icon: ShieldCheck, title: "Stop getting rugged", body: "Seeds never holds your holders’ coins. Trades settle wallet to wallet, so there is no exchange balance to freeze, lose or run off with." },
  { icon: Clock, title: "No trading requirements", body: "No minimum daily volume, and no delisting because a week was quiet. Your market stays open while your community grows." },
  { icon: Coins, title: "No fees on trades from us. Ever.", body: "Seeds charges nothing to buy, sell or trade. Your holders only pay the network’s fee and any outside service’s fee, passed on at cost — we never mark them up." },
  { icon: Ban, title: "No liquidity or market-maker rules", body: "No liquidity deposit, no token allocation, no market-maker contract. You don’t hand tokens to anyone who could dump them on your holders." },
  { icon: Bot, title: "In Seeds AI baskets", body: "Members can add your coin to their Seeds AI baskets, test it on real price history and build plans around it." },
  { icon: Trophy, title: "Trading contests", body: "Sapling and Grove include trading contests for your coin, to bring new traders in. Contests start after trading goes live." },
];

const compareRows = (prices: ListingPrices): [string, string, string][] => [
  ["Listing price", "About $2,000–$15,000 at starter exchanges, often plus tokens", `${usd(prices.seed)}, ${usd(prices.sapling)} or ${usd(prices.grove)}`],
  ["Liquidity deposit or market maker", "Often required — from a few hundred dollars per market to $20,000+ in coins", "None"],
  ["Minimum trading volume", "Common; quiet coins get delisted", "None"],
  ["Trading fees on your holders", "Usually about 0.1–0.2% of every trade", "None from Seeds — only network and outside fees, at cost"],
  ["Who holds your holders’ coins", "The exchange", "Your holders, in their own wallets"],
];

const STEPS = [
  { title: "Apply and pay", body: "Pick a package, tell us about your coin and pay in crypto through NectarPay. Takes about five minutes." },
  { title: "We review", body: "We check the coin and its network. We can say no — and if we do, we refund your payment in full." },
  { title: "We set it up", body: "We add your markets, make sure coins can move in and out of members’ wallets safely, and agree a start date." },
  { title: "Your market opens", body: `Trading on Seeds opens ${LAUNCH_DATE_LABEL}. Listings go live from then.` },
];

function ListOnSeeds() {
  const search = Route.useSearch();
  const prices = Route.useLoaderData() ?? DEFAULT_PRICES;
  const packages = pricedPackages(prices);
  const [pkg, setPkg] = useState<PackageId>(search.package ?? "sapling");
  const choose = (id: PackageId) => {
    setPkg(id);
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 lg:pt-20">
      {/* Hero */}
      <section className="max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">List on Seeds</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl">
          Bring your community to Seeds.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A place to trade your coin where your holders keep their own coins, nobody takes a cut of their trades, and your market doesn’t disappear when volume is quiet.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#packages" className="inline-flex items-center gap-2 rounded-md bg-action px-6 py-3 text-sm font-semibold text-action-foreground transition-[filter] hover:brightness-110">
            See the packages <ArrowRight aria-hidden className="size-4" />
          </a>
          <a href="#apply" className="inline-flex items-center rounded-md border border-foreground/70 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5">
            Apply to list
          </a>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Trading on Seeds opens {LAUNCH_DATE_LABEL}. Applications are open now.</p>
      </section>

      {/* Why */}
      <section className="mt-20" aria-labelledby="why">
        <h2 id="why" className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">Why bring your community here</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary"><Icon aria-hidden className="size-5" /></span>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rugged */}
      <section className="mt-20 grid gap-8 rounded-3xl border border-primary/40 bg-card p-6 sm:p-10 lg:grid-cols-2" aria-labelledby="rugged">
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Stop getting rugged</p>
          <h2 id="rugged" className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">Your holders’ coins never leave their hands.</h2>
          <p className="mt-5 text-muted-foreground">
            Communities usually get hurt in one of three ways: the exchange freezes or loses the coins it was holding, a market maker dumps the tokens it was given, or the coin quietly gets delisted. Seeds is built so none of those can happen through us.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            See for yourself: <Link to="/proof/code" className="font-semibold text-foreground underline underline-offset-4">our code</Link> and the{" "}
            <Link to="/custody" className="font-semibold text-foreground underline underline-offset-4">custody ledger</Link> are public.
          </p>
        </div>
        <ul className="space-y-4">
          {[
            ["Wallet to wallet", "Every trade settles from one member’s own wallet to the other’s. Seeds keeps no pool of coins to freeze or lose."],
            ["Nothing handed over", "No market-maker allocation and no liquidity deposit, so no one is sitting on a pile of your tokens."],
            ["Checked before it lists", "We check every coin for hidden sell blocks and transfer taxes that would trap buyers, and that it can really move in and out of members’ wallets."],
            ["No volume delisting", "We never remove a coin because trading is quiet. We only pause a market if a coin turns out to trap holders or its network stops working."],
          ].map(([t, b]) => (
            <li key={t} className="flex gap-3">
              <Check aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
              <div><p className="font-semibold text-foreground">{t}</p><p className="mt-0.5 text-sm text-muted-foreground">{b}</p></div>
            </li>
          ))}
        </ul>
      </section>

      {/* Packages */}
      <section id="packages" className="mt-20 scroll-mt-24" aria-labelledby="packages-h">
        <h2 id="packages-h" className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">Packages</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">One price per coin, paid by your team. Traders never pay to trade your coin on Seeds.</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {packages.map((p) => {
            const mid = p.id === "sapling";
            return (
              <div key={p.id} className={`flex flex-col rounded-2xl border bg-card p-6 sm:p-8 ${mid ? "border-primary" : "border-border"}`}>
                <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">{p.tag}</p>
                <h3 className="mt-2 font-display text-2xl text-foreground">{p.name}</h3>
                <p className="num mt-3 text-4xl font-bold tracking-tight text-foreground">{usd(p.priceUsd)}</p>
                <p className="text-xs text-muted-foreground">per coin</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) =>
                    f.endsWith("plus:") ? (
                      <li key={f} className="font-semibold text-foreground">{f}</li>
                    ) : (
                      <li key={f} className="flex gap-2.5 text-foreground"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> {f}</li>
                    ),
                  )}
                  {(p.later ?? []).map((f) => (
                    <li key={f} className="flex gap-2.5 text-foreground">
                      <Trophy aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f} <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">after launch</span></span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition ${mid ? "bg-action text-action-foreground hover:brightness-110" : "border border-foreground/70 text-foreground hover:bg-foreground/5"}`}
                >
                  Apply with {p.name}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Contest prize pools are put up by your team; Seeds runs the contest and the leaderboard. Every package includes the safety check. If we decline a coin, we refund the full payment. A listing is not a recommendation to buy a coin, and paid spotlights are marked as sponsored to members.</p>
      </section>

      {/* Compare */}
      <section className="mt-20" aria-labelledby="compare">
        <h2 id="compare" className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">How that compares</h2>
        {/* Phones: one card per row so the Seeds answer is never hidden off to the side. */}
        <ul className="mt-6 space-y-3 sm:hidden">
          {compareRows(prices).map(([row, them, us]) => (
            <li key={row} className="rounded-2xl border border-border p-4">
              <p className="font-semibold text-foreground">{row}</p>
              <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Typical exchange</p>
              <p className="text-sm text-muted-foreground">{them}</p>
              <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-primary uppercase">Seeds</p>
              <p className="text-sm font-semibold text-foreground">{us}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-border sm:block">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-muted/50 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              <tr><th className="px-4 py-3 font-normal"> </th><th className="px-4 py-3 font-normal">Typical exchange</th><th className="px-4 py-3 font-normal text-primary">Seeds</th></tr>
            </thead>
            <tbody>
              {compareRows(prices).map(([row, them, us]) => (
                <tr key={row} className="border-t border-border align-top">
                  <th scope="row" className="px-4 py-3 font-semibold text-foreground">{row}</th>
                  <td className="px-4 py-3 text-muted-foreground">{them}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Typical figures come from public listing price lists checked in November 2026. Bigger exchanges commonly ask $20,000–$100,000 or more. Every exchange prices differently.</p>
      </section>

      {/* Steps */}
      <section className="mt-20" aria-labelledby="how">
        <h2 id="how" className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">How listing works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border p-6">
              <p className="num font-mono text-sm text-primary">0{i + 1}</p>
              <p className="mt-2 font-semibold text-foreground">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Coins on TEXITcoin (Omni tokens), PulseChain, Ethereum, Base and BNB Chain to start. On another network? Apply anyway and tell us — we’ll say plainly whether we can support it.
        </p>
      </section>

      <ApplySection pkg={pkg} setPkg={setPkg} prices={prices} paidId={search.paid ?? null} />
    </div>
  );
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const label = "mb-1.5 block text-sm font-medium text-foreground";

type Quote = { code: string; label: string; listPriceUsd: number; discountUsd: number; amountUsd: number };

function PayBadge({ status }: { status: string }) {
  const tone = status === "paid" || status === "free" ? "border-primary/60 text-primary" : status === "underpaid" ? "border-destructive/60 text-destructive" : "border-border text-muted-foreground";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${tone}`}>{PAYMENT_LABEL[status as PaymentStatus] ?? status}</span>;
}

function ApplySection({ pkg, setPkg, prices, paidId }: { pkg: PackageId; setPkg: (p: PackageId) => void; prices: ListingPrices; paidId: string | null }) {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const submit = useServerFn(submitListingApplication);
  const loadMine = useServerFn(getMyListingApplications);
  const checkPromo = useServerFn(checkListingPromo);
  const pay = useServerFn(startListingCheckout);
  const mine = useQuery({
    queryKey: ["my-listing-apps"], queryFn: () => loadMine(), enabled: Boolean(user),
    // While a checkout is waiting, check again every 15 s so "Paid" shows up on its own.
    refetchInterval: (q) => (q.state.data ?? []).some((a) => a.payment_status === "pending") ? 15_000 : false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [codeText, setCodeText] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);

  // A code was checked for one package; picking another means checking again.
  useEffect(() => { setQuote(null); setCodeMsg(null); }, [pkg]);

  const listPrice = prices[pkg];
  const due = quote ? quote.amountUsd : listPrice;
  const returned = paidId ? mine.data?.find((a) => a.id === paidId) ?? null : null;

  async function onCheckCode() {
    if (!codeText.trim()) return;
    setChecking(true); setCodeMsg(null); setQuote(null);
    try {
      const r = await checkPromo({ data: { code: codeText, package: pkg } });
      if (r.ok) setQuote({ code: r.code, label: r.label, listPriceUsd: r.listPriceUsd, discountUsd: r.discountUsd, amountUsd: r.amountUsd });
      else setCodeMsg(r.message);
    } catch (x) {
      setCodeMsg(x instanceof Error ? x.message : "Couldn't check that code.");
    } finally { setChecking(false); }
  }

  async function onPay(id: string) {
    setPayingId(id); setPayErr(null);
    try {
      const r = await pay({ data: { id, origin: window.location.origin } });
      window.location.assign(r.checkoutUrl);
    } catch (x) {
      setPayErr(x instanceof Error ? x.message : "Checkout couldn't open.");
      setPayingId(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await submit({ data: { ...f, package: pkg, promoCode: quote?.code ?? (codeText.trim() || null), origin: window.location.origin } });
      qc.invalidateQueries({ queryKey: ["my-listing-apps"] });
      if (r.checkoutUrl) { window.location.assign(r.checkoutUrl); return; }
      form.reset(); setQuote(null); setCodeText("");
      setDone(r.amountUsd <= 0
        ? `Thanks — we have your ${packageById(pkg)!.name} application for ${String(f.coinName)}. Your code covers the full price, so there's nothing to pay. We'll reply by email.`
        : `Thanks — we have your ${packageById(pkg)!.name} application for ${String(f.coinName)}. ${r.checkoutError ?? "Checkout couldn't open."} Use the Pay button under “Your applications” to try again.`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="apply" className="mt-20 scroll-mt-24 rounded-3xl border border-border bg-card p-6 sm:p-10" aria-labelledby="apply-h">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Apply</p>
          <h2 id="apply-h" className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">Apply to list your coin</h2>
          <p className="mt-4 text-muted-foreground">You pay when you apply, in crypto through NectarPay — the money goes straight to Seeds’ own wallet. We review every coin, and if we decline yours, we refund the full payment.</p>
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2.5"><BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> You’re on the coin’s team, or have the team’s OK to apply.</li>
            <li className="flex gap-2.5"><Users aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> The coin has a website and a community people can join.</li>
            <li className="flex gap-2.5"><Handshake aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> Questions first? Email support@honest.money before you apply and we’ll answer.</li>
          </ul>
          {returned ? (
            <p role="status" className={`mt-6 rounded-lg border px-4 py-3 text-sm text-foreground ${returned.payment_status === "paid" ? "border-primary/50 bg-primary/10" : "border-border bg-background"}`}>
              {returned.payment_status === "paid"
                ? `Payment received for ${returned.coin_name}. Thank you — we’ll be in touch by email.`
                : returned.payment_status === "underpaid"
                  ? `We got part of your payment for ${returned.coin_name}. Email support@honest.money and we’ll sort out the rest.`
                  : `Thanks — we’re waiting for NectarPay to confirm your payment for ${returned.coin_name}. This page updates on its own; crypto payments can take a few minutes.`}
            </p>
          ) : null}
          {user && mine.data && mine.data.length > 0 ? (
            <div className="mt-8">
              <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Your applications</p>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {mine.data.map((a) => {
                  const canPay = a.amount_usd > 0 && ["unpaid", "pending"].includes(a.payment_status) && a.status !== "declined";
                  return (
                    <li key={a.id} className="space-y-2 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-foreground">{a.coin_name} <span className="text-muted-foreground">({a.ticker}) · {packageById(a.package)?.name}</span></span>
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">{a.status === "new" ? "received" : a.status}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="num text-muted-foreground">
                          {usd(a.amount_usd)}{a.discount_usd > 0 ? <> <s className="opacity-70">{usd(a.list_price_usd)}</s> · {a.promo_code}</> : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <PayBadge status={a.payment_status} />
                          {canPay ? (
                            <button type="button" onClick={() => onPay(a.id)} disabled={payingId === a.id} className="rounded-md bg-action px-3 py-1 text-xs font-semibold text-action-foreground transition hover:brightness-110 disabled:opacity-60">
                              {payingId === a.id ? "Opening…" : a.payment_status === "pending" ? "Back to checkout" : "Pay"}
                            </button>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {payErr ? <p role="alert" className="mt-2 text-sm text-destructive">{payErr}</p> : null}
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Checking sign-in…</p>
        ) : !user ? (
          <div className="self-start rounded-2xl border border-border bg-background p-6">
            <p className="font-semibold text-foreground">Sign in to apply</p>
            <p className="mt-1 text-sm text-muted-foreground">Seeds uses your Honest.Money account, so we know who we’re talking to. Joining is free, and you’ll come straight back here.</p>
            <Link to="/auth" search={{ redirect: `/list?package=${pkg}#apply` }} className="mt-5 inline-flex items-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-semibold text-action-foreground transition hover:brightness-110">
              Sign in with Honest.Money <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
            <fieldset>
              <legend className={label}>Package</legend>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                {pricedPackages(prices).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={pkg === p.id}
                    onClick={() => setPkg(p.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${pkg === p.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className="block font-semibold">{p.name}</span>
                    <span className="num">{usd(p.priceUsd)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div><label className={label} htmlFor="coinName">Coin name</label><input id="coinName" name="coinName" required maxLength={60} className={field} /></div>
              <div><label className={label} htmlFor="ticker">Ticker</label><input id="ticker" name="ticker" required maxLength={13} placeholder="TSD" className={`${field} uppercase`} /></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
              <div>
                <label className={label} htmlFor="network">Network</label>
                <select id="network" name="network" required defaultValue="" className={field}>
                  <option value="" disabled>Choose…</option>
                  {LISTING_NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <div><label className={label} htmlFor="contract">Contract address or Omni property # <span className="font-normal text-muted-foreground">(optional)</span></label><input id="contract" name="contract" maxLength={120} className={`${field} font-mono`} /></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
              <div><label className={label} htmlFor="website">Website</label><input id="website" name="website" required maxLength={200} placeholder="yourcoin.com" className={field} /></div>
              <div><label className={label} htmlFor="community">Community link <span className="font-normal text-muted-foreground">(Telegram, Discord, X)</span></label><input id="community" name="community" maxLength={200} className={field} /></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-3 [&>*]:min-w-0">
              <div><label className={label} htmlFor="contactName">Your name</label><input id="contactName" name="contactName" required maxLength={80} autoComplete="name" className={field} /></div>
              <div><label className={label} htmlFor="contactEmail">Email</label><input id="contactEmail" name="contactEmail" type="email" required maxLength={200} defaultValue={shownEmail(user.email) ?? ""} autoComplete="email" className={field} /></div>
              <div><label className={label} htmlFor="contactTelegram">Telegram <span className="font-normal text-muted-foreground">(optional)</span></label><input id="contactTelegram" name="contactTelegram" maxLength={33} placeholder="@username" className={field} /></div>
            </div>
            <div><label className={label} htmlFor="notes">Anything we should know? <span className="font-normal text-muted-foreground">(optional)</span></label><textarea id="notes" name="notes" rows={4} maxLength={2000} className={field} /></div>
            <div>
              <label className={label} htmlFor="promoCode">Promo code <span className="font-normal text-muted-foreground">(optional)</span></label>
              <div className="flex gap-2">
                <input id="promoCode" value={codeText} onChange={(e) => { setCodeText(e.target.value); setQuote(null); setCodeMsg(null); }} maxLength={30} autoComplete="off" placeholder="CODE" className={`${field} font-mono uppercase`} />
                <button type="button" onClick={onCheckCode} disabled={checking || !codeText.trim()} className="shrink-0 rounded-lg border border-foreground/70 px-4 text-sm font-semibold text-foreground transition hover:bg-foreground/5 disabled:opacity-50">
                  {checking ? "Checking…" : "Apply"}
                </button>
              </div>
              {quote ? <p className="mt-1.5 flex items-center gap-1.5 text-sm text-primary"><Tag aria-hidden className="size-3.5" /> {quote.code}: {quote.label}</p> : null}
              {codeMsg ? <p className="mt-1.5 text-sm text-destructive">{codeMsg}</p> : null}
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <span className="text-sm text-muted-foreground">{packageById(pkg)!.name} package</span>
              <span className="num text-right">
                {quote && quote.discountUsd > 0 ? <s className="mr-2 text-sm text-muted-foreground">{usd(listPrice)}</s> : null}
                <span className="text-lg font-bold text-foreground">{due <= 0 ? "Free" : usd(due)}</span>
              </span>
            </div>
            {err ? <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground">{err}</p> : null}
            {done ? <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-foreground">{done}</p> : null}
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-action px-6 py-3 text-sm font-semibold text-action-foreground transition hover:brightness-110 disabled:opacity-60">
                {busy ? "Sending…" : due <= 0 ? `Send ${packageById(pkg)!.name} application` : `Apply and pay ${usd(due)}`}
              </button>
              <p className="text-xs text-muted-foreground">{due <= 0 ? "Nothing to pay." : "Next you’ll pay in crypto on NectarPay’s checkout. Refunded in full if we decline your coin."}</p>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
