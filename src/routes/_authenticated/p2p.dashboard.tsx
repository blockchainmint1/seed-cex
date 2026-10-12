import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { getMyP2p, saveOffer, saveP2pProfile } from "@/lib/p2p.functions";
import { P2P_ASSET_IDS, PAYMENT_METHODS, STATUS_LABEL, type P2pAsset } from "@/lib/p2p-config";
import { ScorePill, mins } from "@/components/p2p/SellerBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/p2p/dashboard")({
  head: () => ({
    meta: [
      { title: "My P2P Desk — Seeds" },
      { name: "description", content: "Manage your seller profile, P2P offers and peer-to-peer trades on Seeds." },
      { property: "og:title", content: "My P2P Desk — Seeds" },
      { property: "og:description", content: "Seller profile, offers and P2P trades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Desk,
});

type Data = Awaited<ReturnType<typeof getMyP2p>>;
type OfferRow = Data["offers"][number];

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.18em] uppercase">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Desk() {
  const fetch = useServerFn(getMyP2p);
  const q = useQuery({ queryKey: ["p2p-me"], queryFn: () => fetch(), refetchInterval: 20_000 });
  const [editing, setEditing] = useState<OfferRow | "new" | null>(null);
  if (q.isLoading || !q.data) return <main className="mx-auto max-w-7xl px-5 py-10 text-muted-foreground">Loading…</main>;
  const d = q.data;
  const live = d.trades.filter((t) => ["open", "paid", "disputed"].includes(t.status));
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">My P2P desk</h1>
          <p className="text-sm text-muted-foreground">Sell from your own trading pocket. Buyers pay you directly.</p>
        </div>
        <Link to="/p2p"><Button variant="outline">Marketplace</Button></Link>
      </div>

      {live.length ? (
        <Panel title={`Action needed (${live.length})`}>
          <TradeList trades={live} />
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <ProfileForm data={d} />
        <Panel title="My offers" right={d.profile ? <Button size="sm" onClick={() => setEditing("new")}>New offer</Button> : null}>
          {!d.profile ? <p className="text-sm text-muted-foreground">Create your seller profile first.</p> : null}
          {d.profile && !d.offers.length ? <p className="text-sm text-muted-foreground">No offers yet.</p> : null}
          <ul className="space-y-2">
            {d.offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-sm border border-border p-3">
                <div>
                  <div className="font-mono">{o.asset} @ {o.priceMode === "market" ? `market ${o.marginPct >= 0 ? "+" : ""}${o.marginPct}%` : `$${o.price}`} <span className="text-xs text-muted-foreground">fee {o.feePct}% · ${o.minFiat}–${o.maxFiat}</span></div>
                  <div className={`flex items-center gap-1 font-mono text-[11px] ${o.verified > 0 ? "text-primary" : "text-destructive"}`}>
                    <BadgeCheck className="h-3 w-3" />
                    {o.verified > 0 ? `${o.verified} ${o.asset} verified & available` : `No verified ${o.asset} — authorize and fund your trading pocket on the Wallet page`}
                  </div>
                  <div className="text-xs text-muted-foreground">{o.methods.join(", ")} · {o.active ? "Live" : "Paused"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(o)}>Edit</Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Only coins in your authorized trading pocket count. <Link to="/wallet" className="text-primary">Fund it on the Wallet page.</Link>
          </p>
        </Panel>
      </div>
      {editing ? <OfferForm offer={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}

      <Panel title="All my P2P trades">
        {d.trades.length ? <TradeList trades={d.trades} /> : <p className="text-sm text-muted-foreground">No trades yet.</p>}
      </Panel>
    </main>
  );
}

function TradeList({ trades }: { trades: Data["trades"] }) {
  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-0">
            <td className="py-2">{fmtAgo(t.at)}</td>
            <td className={t.role === "seller" ? "text-destructive" : "text-primary"}>{t.role === "seller" ? "Selling" : "Buying"}</td>
            <td>{t.crypto} {t.asset}</td>
            <td>${t.fiat.toFixed(2)}</td>
            <td className="text-muted-foreground">{t.counterparty} · {t.method}</td>
            <td>{STATUS_LABEL[t.status] ?? t.status}{t.flagged ? <span className="text-destructive"> ⚠</span> : null}</td>
            <td className="text-right"><Link to="/p2p/trade/$id" params={{ id: t.id }} className="text-primary">Open →</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProfileForm({ data }: { data: Data }) {
  const qc = useQueryClient();
  const save = useServerFn(saveP2pProfile);
  const p = data.profile;
  const [f, setF] = useState({ handle: "", bio: "", location: "", languages: "", hours: "" });
  useEffect(() => {
    if (p) setF({ handle: p.handle, bio: p.bio, location: p.location, languages: p.languages.join(", "), hours: p.hours });
  }, [p]);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { ...f, languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["p2p-me"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const s = data.stats;
  return (
    <Panel title="Seller profile" right={p ? <Link to="/p2p/seller/$handle" params={{ handle: p.handle }} className="font-mono text-xs text-primary">Public page →</Link> : null}>
      {p ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
          <ScorePill score={s.score} /> {s.trades} trades · {Math.round(s.completionRate * 100)}% done · release {mins(s.avgReleaseMin)}
        </div>
      ) : null}
      <div className="space-y-3">
        <Input placeholder="Handle (public name)" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
        <Textarea placeholder="About you — why buyers should trust you" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <Input placeholder="Location (e.g. Austin, TX)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <Input placeholder="Languages (comma separated)" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />
        <Input placeholder="Hours you're online (e.g. 9am–9pm CT)" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{p ? "Save profile" : "Create seller profile"}</Button>
      </div>
    </Panel>
  );
}

function OfferForm({ offer, onDone }: { offer: OfferRow | null; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveOffer);
  const fetchMarket = useServerFn(getP2pMarketPrices);
  const market = useQuery({ queryKey: ["p2p-market-prices"], queryFn: () => fetchMarket(), refetchInterval: 60_000 });
  const [f, setF] = useState({
    asset: (offer?.asset ?? "TSD") as P2pAsset,
    price: String(offer?.price ?? "1"),
    priceMode: (offer?.priceMode ?? "market") as "fixed" | "market",
    marginPct: String(offer?.marginPct ?? "2"),
    feePct: String(offer?.feePct ?? "1"),
    minFiat: String(offer?.minFiat ?? "20"),
    maxFiat: String(offer?.maxFiat ?? "1000"),
    methods: offer?.methods ?? ["Zelle"],
    custom: "",
    instructions: offer?.instructions ?? "",
    terms: offer?.terms ?? "",
    windowMinutes: String(offer?.windowMinutes ?? 30),
    active: offer?.active ?? true,
  });
  const toggle = (m: string) =>
    setF({ ...f, methods: f.methods.includes(m) ? f.methods.filter((x) => x !== m) : [...f.methods, m] });
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: offer?.id,
          asset: f.asset,
          price: f.priceMode === "market" && market.data?.[f.asset] ? +(market.data[f.asset]! * (1 + Number(f.marginPct) / 100)).toFixed(8) : Number(f.price),
          priceMode: f.priceMode,
          marginPct: Number(f.marginPct) || 0,
          feePct: Number(f.feePct),
          minFiat: Number(f.minFiat),
          maxFiat: Number(f.maxFiat),
          methods: [...f.methods, ...f.custom.split(",").map((s) => s.trim()).filter(Boolean)],
          instructions: f.instructions,
          terms: f.terms,
          windowMinutes: Number(f.windowMinutes),
          active: f.active,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.verified ? `Saved — ${r.verified} ${f.asset} verified` : "Saved, but no verified funds yet");
      qc.invalidateQueries({ queryKey: ["p2p-me"] });
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const lbl = "font-mono text-[11px] text-muted-foreground uppercase";
  return (
    <Panel title={offer ? "Edit offer" : "New offer"} right={<button onClick={onDone} className="font-mono text-xs text-muted-foreground">Close</button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block"><span className={lbl}>Coin you're selling</span>
            <select value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value as P2pAsset })} className="mt-1 h-9 w-full rounded-sm border border-border bg-background px-2">
              {P2P_ASSET_IDS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <span className={lbl}>Price</span>
              <div className="mt-1 flex rounded-sm border border-border text-xs">
                {(["market", "fixed"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setF({ ...f, priceMode: m })} className={`flex-1 px-2 py-1.5 ${f.priceMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                    {m === "market" ? "Follow the market" : "Fixed price"}
                  </button>
                ))}
              </div>
              {f.priceMode === "market" ? (
                <div className="mt-2 grid grid-cols-2 items-end gap-2">
                  <label><span className={lbl}>Above / below market %</span><Input value={f.marginPct} onChange={(e) => setF({ ...f, marginPct: e.target.value })} /></label>
                  <p className="pb-2 font-mono text-xs text-muted-foreground">
                    {market.data?.[f.asset]
                      ? <>Market ${market.data[f.asset]!.toLocaleString(undefined, { maximumFractionDigits: 6 })} → you sell at <b className="text-foreground">${(market.data[f.asset]! * (1 + (Number(f.marginPct) || 0) / 100)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</b></>
                      : "Market price unavailable right now"}
                  </p>
                </div>
              ) : (
                <label className="mt-2 block"><span className={lbl}>Price per coin (USD)</span><Input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
              )}
            </div>
            <label><span className={lbl}>Your fee %</span><Input value={f.feePct} onChange={(e) => setF({ ...f, feePct: e.target.value })} /></label>
            <label><span className={lbl}>Min trade $</span><Input value={f.minFiat} onChange={(e) => setF({ ...f, minFiat: e.target.value })} /></label>
            <label><span className={lbl}>Max trade $</span><Input value={f.maxFiat} onChange={(e) => setF({ ...f, maxFiat: e.target.value })} /></label>
            <label><span className={lbl}>Minutes to pay</span><Input value={f.windowMinutes} onChange={(e) => setF({ ...f, windowMinutes: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Live</label>
          </div>
          <div>
            <span className={lbl}>Payment methods</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => toggle(m)} className={`rounded-sm border px-2 py-1 text-xs ${f.methods.includes(m) ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{m}</button>
              ))}
            </div>
            <Input className="mt-2" placeholder="Other methods, comma separated (e.g. Apple Cash, Wise)" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} />
          </div>
        </div>
        <div className="space-y-3">
          <label className="block"><span className={lbl}>Payment instructions (only shown to your buyer)</span>
            <Textarea rows={6} placeholder={"Zelle: you@email.com (Jane D.)\nPut the trade code in the memo. No crypto words in the memo."} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          </label>
          <label className="block"><span className={lbl}>Public terms</span>
            <Textarea rows={3} placeholder="First-time buyers max $200. Same-name accounts only." value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
          </label>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Verifying funds…" : "Save offer"}</Button>
        </div>
      </div>
    </Panel>
  );
}
