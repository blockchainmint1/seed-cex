import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgeCheck, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { listOffers, openTrade } from "@/lib/p2p.functions";
import { P2P_ASSET_IDS, P2P_ASSETS, PAYMENT_METHODS, type P2pAsset } from "@/lib/p2p-config";
import { SellerBadge } from "@/components/p2p/SellerBadge";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const title = "P2P Marketplace — Buy crypto from real people | Seeds";
const description =
  "Buy TSD, TXC, BTC, USDC and USDT directly from verified sellers with Zelle, Venmo, Cash App, bank transfer or cash. Seller funds are verified on-chain.";

export const Route = createFileRoute("/p2p/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Market,
});

type Offer = Awaited<ReturnType<typeof listOffers>>[number];

function Market() {
  const [asset, setAsset] = useState<P2pAsset | undefined>();
  const [method, setMethod] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [buying, setBuying] = useState<Offer | null>(null);
  const fetchOffers = useServerFn(listOffers);
  const offers = useQuery({
    queryKey: ["p2p-offers", asset, method, amount],
    queryFn: () =>
      fetchOffers({ data: { asset, method: method || undefined, amount: Number(amount) || undefined } }),
    refetchInterval: 60_000,
  });

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <section className="mb-8 grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="font-mono text-xs tracking-widest text-primary uppercase">Peer to peer</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Buy crypto from real people.
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Pay a seller with Zelle, Venmo, a bank transfer or cash. Every seller's coins sit in their own trading pocket
            and we check them on-chain before you pay. Nobody here holds your money, us included.
          </p>
          <div className="mt-5 flex gap-3">
            <Link to="/p2p/dashboard"><Button>Sell crypto</Button></Link>
            <Link to="/p2p/jury"><Button variant="outline">Community jury</Button></Link>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          {[
            [BadgeCheck, "Verified funds", "Seller coins checked on-chain and reserved for your trade."],
            [Lock, "Lock + watch", "If a seller moves reserved coins, the trade is flagged instantly."],
            [Users, "Jury + admins", "Disputes reviewed by experienced traders, finalized by Seeds."],
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-sm border border-border">
          {[undefined, ...P2P_ASSET_IDS].map((a) => (
            <button
              key={a ?? "all"}
              onClick={() => setAsset(a)}
              className={`px-3 py-1.5 font-mono text-xs uppercase ${asset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {a ?? "All"}
            </button>
          ))}
        </div>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="h-9 rounded-sm border border-border bg-background px-2 text-sm"
        >
          <option value="">Any payment method</option>
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <Input className="h-9 w-40" placeholder="I want to spend $" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>

      <section className="rounded-sm border border-border bg-surface">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1.4fr_auto] gap-4 border-b border-border px-4 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase md:grid">
          <span>Seller</span><span>Price</span><span>Limits</span><span>Payment</span><span />
        </div>
        {offers.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Checking seller pockets on-chain…</p>
        ) : !offers.data?.length ? (
          <p className="p-6 text-sm text-muted-foreground">
            No verified sellers match yet. <Link to="/p2p/dashboard" className="text-primary">Be the first to list.</Link>
          </p>
        ) : (
          offers.data.map((o) => (
            <div key={o.id} className="grid gap-3 border-b border-border px-4 py-4 last:border-0 md:grid-cols-[2fr_1fr_1fr_1.4fr_auto] md:items-center md:gap-4">
              <SellerBadge handle={o.seller.handle} stats={o.seller.stats} />
              <div>
                <div className="font-mono text-lg">${o.price.toLocaleString()} <span className="text-xs text-muted-foreground">/ {o.asset}</span></div>
                <div className="font-mono text-[11px] text-muted-foreground">fee {o.feePct}%{o.priceMode === "market" ? ` · market ${o.marginPct >= 0 ? "+" : ""}${o.marginPct}%` : ""}</div>
              </div>
              <div className="font-mono text-xs">
                ${o.minFiat.toLocaleString()} – ${Math.floor(o.maxFiat).toLocaleString()}
                <div className="flex items-center gap-1 text-[11px] text-primary">
                  <BadgeCheck className="h-3 w-3" /> {o.verified.toLocaleString(undefined, { maximumFractionDigits: 6 })} {o.asset} verified
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {o.methods.map((m) => (
                  <span key={m} className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]">{m}</span>
                ))}
              </div>
              <Button onClick={() => setBuying(o)}>Buy {o.asset}</Button>
            </div>
          ))
        )}
      </section>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        Sellers ranked by trust score, verified funds we can reach and how fast they respond.
      </p>

      {buying ? <BuyDialog offer={buying} onClose={() => setBuying(null)} /> : null}
    </main>
  );
}

function BuyDialog({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const [fiat, setFiat] = useState(String(offer.minFiat));
  const [method, setMethod] = useState(offer.methods[0]);
  const open = useServerFn(openTrade);
  const n = Number(fiat) || 0;
  const fee = n * (offer.feePct / 100);
  const get = (n - fee) / offer.price;
  const m = useMutation({
    mutationFn: () => open({ data: { offerId: offer.id, fiat: n, method } }),
    onSuccess: (r) => navigate({ to: "/p2p/trade/$id", params: { id: r.id } }),
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Buy {offer.asset} from {offer.seller.handle}</DialogTitle></DialogHeader>
        {!user ? (
          <div className="space-y-3 text-sm">
            <p>Sign in to start a trade.</p>
            <Link to="/auth"><Button>Sign in with Honest.Money</Button></Link>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="font-mono text-[11px] text-muted-foreground uppercase">You pay (USD)</span>
              <Input value={fiat} onChange={(e) => setFiat(e.target.value)} inputMode="decimal" />
              <span className="font-mono text-[11px] text-muted-foreground">${offer.minFiat} – ${Math.floor(offer.maxFiat)}</span>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] text-muted-foreground uppercase">Pay with</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-border bg-background px-2">
                {offer.methods.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <div className="space-y-1 rounded-sm border border-border bg-surface p-3 font-mono text-xs">
              <div className="flex justify-between"><span>Price</span><span>${offer.price.toLocaleString()} / {offer.asset}</span></div>
              <div className="flex justify-between"><span>Seller fee ({offer.feePct}%)</span><span>${fee.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm text-primary"><span>You get</span><span>{get > 0 ? get.toFixed(P2P_ASSETS[offer.asset].decimals) : "0"} {offer.asset}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Time to pay</span><span>{offer.windowMinutes} min</span></div>
            </div>
            {offer.terms ? <p className="text-xs text-muted-foreground">Seller terms: {offer.terms}</p> : null}
            <p className="text-xs text-muted-foreground">Coins go to your own Seeds wallet address. Payment instructions appear once the trade opens.</p>
            <Button className="w-full" disabled={m.isPending || n < offer.minFiat || n > offer.maxFiat} onClick={() => m.mutate()}>
              {m.isPending ? "Verifying seller funds…" : "Open trade"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
