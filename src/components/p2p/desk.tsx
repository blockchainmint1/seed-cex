import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { blockTrader, getMyP2p, getP2pMarketPrices, saveOffer, saveP2pProfile, setP2pAway } from "@/lib/p2p.functions";
import { fmtCoinPrice, P2P_ASSET_IDS, PAYMENT_METHODS, STATUS_LABEL, type P2pAsset } from "@/lib/p2p-config";
import { ScorePill, mins } from "@/components/p2p/SellerBadge";
import { Card } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES, timeZones } from "@/lib/countries";
import { fmtAgo } from "@/lib/format";

/**
 * P2P desk pieces shown inside Account → P2P (trader profile, listings, trades).
 * All tabs share one "p2p-me" query so saving on one tab refreshes the others.
 */

export type P2pDeskData = Awaited<ReturnType<typeof getMyP2p>>;
type Data = P2pDeskData;
type OfferRow = Data["offers"][number];

export const P2P_ME_QUERY = ["p2p-me"] as const;

export function useMyP2p() {
  const fetch = useServerFn(getMyP2p);
  return useQuery({ queryKey: P2P_ME_QUERY, queryFn: () => fetch(), refetchInterval: 20_000 });
}

/** Trades waiting on someone (open, paid, disputed). */
export function liveTrades(d: Data) {
  return d.trades.filter((t) => ["open", "paid", "disputed"].includes(t.status));
}

function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

/** The seller's listings with live funds status, plus the new/edit form. */
export function OfferList({ data: d }: { data: Data }) {
  const [editing, setEditing] = useState<OfferRow | "new" | null>(null);
  return (
    <div className="space-y-5">
      {editing ? <OfferForm key={editing === "new" ? "new" : editing.id} offer={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      <Card
        title={`My listings${d.offers.length ? ` (${d.offers.length})` : ""}`}
        desc="Sell ads and buy ads buyers and sellers see on the P2P marketplace."
        right={d.profile && editing !== "new" ? <Button size="sm" onClick={() => setEditing("new")}>New listing</Button> : null}
      >
        {!d.profile ? (
          <p className="text-sm text-muted-foreground">
            Set up your <Link to="/account/p2p" className="text-primary underline">trader profile</Link> first — buyers need a name to trade with.
          </p>
        ) : null}
        {d.profile && !d.offers.length ? <p className="text-sm text-muted-foreground">No listings yet. Tap <b>New listing</b> to post your first ad.</p> : null}
        <ul className="space-y-2">
          {d.offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono"><span className={o.side === "buy" ? "text-primary" : "text-destructive"}>{o.side === "buy" ? "BUY" : "SELL"}</span> {o.asset} @ {o.priceMode === "market" ? `market ${o.marginPct >= 0 ? "+" : ""}${o.marginPct}%` : `$${fmtCoinPrice(o.price)}`} <span className="text-xs text-muted-foreground">fee {o.feePct}% · ${o.minFiat}–${o.maxFiat}</span></div>
                {o.side === "sell" ? <div className={`flex items-center gap-1 font-mono text-[11px] ${o.verified > 0 ? "text-primary" : "text-destructive"}`}>
                  <BadgeCheck className="h-3 w-3 shrink-0" />
                  {o.verified > 0
                    ? `${o.verified} ${o.asset} verified & available in your HME trading pocket`
                    : o.pocketBlocker
                      ? `Not live yet: ${o.pocketBlocker}`
                      : `No ${o.asset} in your HME trading pocket yet — deposit some from Account → Balances`}
                </div> : null}
                {o.side === "sell" && o.shown && o.verified > 0 ? (
                  o.shown.live ? (
                    o.shown.reduced ? (
                      <div className="text-xs text-foreground">
                        Buyers see <b>${o.shown.min.toLocaleString()}–${Math.floor(o.shown.max).toLocaleString()}</b>: your pocket covers up to ${Math.floor(o.shown.max).toLocaleString()} of your ${o.maxFiat.toLocaleString()} max. Add about {fmtShort(o.shown.shortCoins)} {o.asset} to offer the full range.
                      </div>
                    ) : null
                  ) : (
                    <div className="text-xs text-destructive">Hidden from buyers: your pocket can't cover your ${o.minFiat.toLocaleString()} minimum. Add {o.asset} or lower the minimum.</div>
                  )
                ) : null}
                <div className="text-xs text-muted-foreground">{o.methods.join(", ")} · {o.active ? "Live" : "Paused"}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(o)}>Edit</Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Only coins in your HME trading pocket count, and only once two-factor and Telegram are on.{" "}
          <Link to="/account/security" className="text-primary">Security settings</Link> ·{" "}
          <Link to="/account/balances" className="text-primary">Balances</Link>
        </p>
      </Card>
    </div>
  );
}

/** Blocked traders with one-tap unblock. */
export function BlockedList({ data: d }: { data: Data }) {
  return (
    <Card title={`Blocked traders (${d.blocked.length})`} desc="You and anyone you block can't open trades with each other.">
      {d.blocked.length ? (
        <ul className="flex flex-wrap gap-2">{d.blocked.map((b) => <BlockedChip key={b.id} id={b.id} handle={b.handle} />)}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody blocked. You can block a trader from any trade chat.</p>
      )}
    </Card>
  );
}

export function TradeList({ trades }: { trades: Data["trades"] }) {
  return (
    <>
    {/* Phones: one tappable row per trade, so "Open" never hides off the edge. */}
    <ul className="divide-y divide-border sm:hidden">
      {trades.map((t) => (
        <li key={t.id}>
          <Link to="/p2p/trade/$id" params={{ id: t.id }} className="flex items-center justify-between gap-3 py-2.5 font-mono text-xs">
            <span className="min-w-0">
              <span className={t.role === "seller" ? "text-destructive" : "text-primary"}>{t.role === "seller" ? "Selling" : "Buying"}</span> {t.crypto} {t.asset} · ${t.fiat.toFixed(2)}
              <span className="block truncate text-muted-foreground">{t.counterparty} · {t.method} · {fmtAgo(t.at)}</span>
            </span>
            <span className="shrink-0 text-right">
              {STATUS_LABEL[t.status] ?? t.status}{t.flagged ? <span className="text-destructive"> ⚠</span> : null}
              <span className="block text-primary">Open →</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto sm:block">
    <table className="w-full min-w-[36rem] font-mono text-xs">
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-0">
            <td className="py-2 pr-3 whitespace-nowrap">{fmtAgo(t.at)}</td>
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
    </div>
    </>
  );
}

export function ProfileForm({ data }: { data: Data }) {
  const qc = useQueryClient();
  const save = useServerFn(saveP2pProfile);
  const p = data.profile;
  const [f, setF] = useState({ handle: "", bio: "", country: "", languages: "", hoursFrom: "", hoursTo: "", tz: "", quick: "" });
  useEffect(() => {
    if (p) setF({
      handle: p.handle,
      bio: p.bio,
      country: p.country ?? "",
      languages: p.languages.join(", "),
      hoursFrom: p.hours_from != null ? String(p.hours_from) : "",
      hoursTo: p.hours_to != null ? String(p.hours_to) : "",
      tz: p.tz ?? "",
      quick: (p.quick_replies ?? []).join("\n"),
    });
  }, [p]);
  useEffect(() => {
    if (!p && data.displayName) {
      const suggested = data.displayName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
      if (suggested.length >= 3) setF((f) => (f.handle ? f : { ...f, handle: suggested }));
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTz) setF((f) => (f.tz ? f : { ...f, tz: localTz }));
    }
  }, [p, data.displayName]);
  const m = useMutation({
    mutationFn: () =>
      save({ data: { handle: f.handle, bio: f.bio, country: f.country, hoursFrom: f.hoursFrom === "" ? null : Number(f.hoursFrom), hoursTo: f.hoursTo === "" ? null : Number(f.hoursTo), tz: f.tz, languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean), quickReplies: f.quick.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10) } }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: P2P_ME_QUERY }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const s = data.stats;
  return (
    <Card title="Trader profile" desc="Your public name and how buyers reach you. Shown on every listing." right={p ? <Link to="/p2p/seller/$handle" params={{ handle: p.handle }} className="font-mono text-xs text-primary">Public page →</Link> : null}>
      {p ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
          <ScorePill score={s.score} /> {s.trades} trades · {Math.round(s.completionRate * 100)}% done · release {mins(s.avgReleaseMin)}
        </div>
      ) : null}
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] text-muted-foreground uppercase">Handle (public name) — from your Honest.Money profile</span>
          <Input placeholder="Handle (public name)" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
        </label>
        <Textarea placeholder="About you — why buyers should trust you" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <label className="block space-y-1">
          <span className="font-mono text-[11px] text-muted-foreground uppercase">Country</span>
          <Select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            <option value="">Choose a country…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </label>
        <Input placeholder="Languages (comma separated)" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />
        <div className="space-y-1">
          <span className="font-mono text-[11px] text-muted-foreground uppercase">Hours you're online</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Select value={f.hoursFrom} onChange={(e) => setF({ ...f, hoursFrom: e.target.value })}>
              <option value="">From…</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </Select>
            <Select value={f.hoursTo} onChange={(e) => setF({ ...f, hoursTo: e.target.value })}>
              <option value="">To…</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </Select>
            <Select value={f.tz} onChange={(e) => setF({ ...f, tz: e.target.value })} className="col-span-2 sm:col-span-1">
              <option value="">Time zone…</option>
              {timeZones().map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
        </div>
        <label className="block"><span className="font-mono text-[11px] text-muted-foreground uppercase">Quick replies (one per line — tap to send in chat)</span>
          <Textarea rows={3} placeholder={"Payment received, releasing now.\nPlease include the memo code."} value={f.quick} onChange={(e) => setF({ ...f, quick: e.target.value })} />
        </label>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : p ? "Save profile" : "Create trader profile"}</Button>
      </div>
    </Card>
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
    side: (offer?.side ?? "sell") as "sell" | "buy",
    autoReply: offer?.autoReply ?? "",
    newBuyerMax: String(offer?.newBuyerMax ?? 0),
    minTrades: String(offer?.minTrades ?? 0),
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
          side: f.side,
          autoReply: f.autoReply,
          newBuyerMax: Number(f.newBuyerMax) || 0,
          minTrades: Number(f.minTrades) || 0,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        f.side === "buy" ? "Buy ad saved"
        : !r.verified ? "Saved, but no verified funds yet"
        : r.shown && !r.shown.live ? `Saved, but hidden: your pocket can't cover the $${r.shown.min} minimum yet`
        : r.shown?.reduced ? `Saved — buyers see up to $${Math.floor(r.shown.max).toLocaleString()} until your pocket covers your full $${Number(f.maxFiat).toLocaleString()}`
        : `Saved — ${r.verified} ${f.asset} verified`,
      );
      qc.invalidateQueries({ queryKey: P2P_ME_QUERY });
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const lbl = "font-mono text-[11px] text-muted-foreground uppercase";
  return (
    <Card title={offer ? "Edit listing" : "New listing"} right={<button onClick={onDone} className="font-mono text-xs text-muted-foreground">Close</button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex rounded-sm border border-border text-xs">
            {(["sell", "buy"] as const).map((x) => (
              <button key={x} type="button" disabled={Boolean(offer)} onClick={() => setF({ ...f, side: x })} className={`flex-1 px-2 py-1.5 ${f.side === x ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {x === "sell" ? "I want to sell" : "I want to buy"}
              </button>
            ))}
          </div>
          <label className="block"><span className={lbl}>{f.side === "sell" ? "Coin you're selling" : "Coin you want to buy"}</span>
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
                      ? <>Market ${fmtCoinPrice(market.data[f.asset]!)} → you sell at <b className="text-foreground">${fmtCoinPrice(market.data[f.asset]! * (1 + (Number(f.marginPct) || 0) / 100))}</b></>
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
          {f.side === "buy" ? (
            <p className="rounded-sm border border-border p-2 text-xs text-muted-foreground">Sellers who answer your ad send you their own payment details. Coins are reserved in their pocket before you pay.</p>
          ) : null}
          {f.side === "sell" ? <>
          <label className="block"><span className={lbl}>Payment instructions (only shown to your buyer)</span>
            <Textarea rows={6} placeholder={"Zelle: you@email.com (Jane D.)\nPut the trade code in the memo. No crypto words in the memo."} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          </label>
          <label className="block"><span className={lbl}>Auto-reply (sent the moment a trade opens)</span>
            <Textarea rows={2} placeholder="Hi! I'm online — send payment and upload the receipt, I'll release fast." value={f.autoReply} onChange={(e) => setF({ ...f, autoReply: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={lbl}>New buyer max $ (0 = no limit)</span><Input value={f.newBuyerMax} onChange={(e) => setF({ ...f, newBuyerMax: e.target.value })} /></label>
            <label><span className={lbl}>Min trades required</span><Input value={f.minTrades} onChange={(e) => setF({ ...f, minTrades: e.target.value })} /></label>
          </div>
          </> : (
            <label className="block"><span className={lbl}>Min trades a seller needs</span><Input value={f.minTrades} onChange={(e) => setF({ ...f, minTrades: e.target.value })} /></label>
          )}
          <label className="block"><span className={lbl}>Public terms</span>
            <Textarea rows={3} placeholder="First-time buyers max $200. Same-name accounts only." value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
          </label>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Verifying funds…" : "Save listing"}</Button>
        </div>
      </div>
    </Card>
  );
}

export function AwayToggle({ away }: { away: boolean }) {
  const qc = useQueryClient();
  const set = useServerFn(setP2pAway);
  const m = useMutation({
    mutationFn: () => set({ data: { away: !away } }),
    onSuccess: () => { toast.success(away ? "You're online — ads are live" : "Away — your ads are hidden"); qc.invalidateQueries({ queryKey: P2P_ME_QUERY }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button variant={away ? "outline" : "default"} disabled={m.isPending} onClick={() => m.mutate()}>
      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${away ? "bg-muted-foreground" : "bg-primary-foreground"}`} />
      {away ? "Away (ads hidden)" : "Online"}
    </Button>
  );
}

function BlockedChip({ id, handle }: { id: string; handle: string }) {
  const qc = useQueryClient();
  const block = useServerFn(blockTrader);
  const m = useMutation({ mutationFn: () => block({ data: { userId: id, unblock: true } }), onSuccess: () => qc.invalidateQueries({ queryKey: P2P_ME_QUERY }) });
  return (
    <li className="flex items-center gap-2 rounded-sm border border-border px-2 py-1 text-xs">
      {handle} <button className="text-primary" onClick={() => m.mutate()}>Unblock</button>
    </li>
  );
}

/** Coins with a sensible number of digits ("50", "1.25", "0.0042"). */
function fmtShort(n: number): string {
  if (!(n > 0)) return "0";
  return n >= 100 ? Math.ceil(n).toLocaleString() : Number(n.toPrecision(3)).toString();
}
