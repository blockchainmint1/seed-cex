import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { CoinNetworkPicker } from "@/components/account/CoinNetworkPicker";
import { fmtCoin, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { depositState, findAsset, findNetwork, withdrawRoute } from "@/lib/account/deposit-options";
import { usePulseWithdrawals } from "@/components/account/PulseWithdraw";

type Search = { coin?: string; network?: string };

export const Route = createFileRoute("/_authenticated/account/balances/deposit")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): Search => ({
    coin: typeof s.coin === "string" && /^[A-Za-z]{2,6}$/.test(s.coin) ? s.coin.toUpperCase() : undefined,
    network: typeof s.network === "string" && /^[a-z-]{2,12}$/.test(s.network) ? s.network : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Deposit crypto — Seeds" },
      { name: "description", content: "Deposit TSD, TXC, BTC, ETH, USDC, USDT, LTC, ISK, BNB, ZCU, PLS, HEX and more into your own HME trading pocket, with QR code and network warnings." },
      { property: "og:title", content: "Deposit crypto — Seeds" },
      { property: "og:description", content: "Pick a coin and network, then send to your own HME trading-pocket address." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Deposit,
});

function Deposit() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const link = usePocketLink();
  const l = link.data;
  const { rows } = usePocketBalances(l?.addresses, l?.id);
  const asset = findAsset(search.coin);
  const net = findNetwork(asset, search.network);
  const linked = new Set(Object.keys(l?.addresses ?? {}));
  const pulse = usePulseWithdrawals(Boolean(l));
  const seedsBlocker = pulse.data ? pulse.data.blocker : undefined;
  const state = net ? depositState(net, Boolean(l), l?.addresses ?? {}, seedsBlocker) : null;
  const balance = net ? rows.find((r) => r.asset.symbol === asset?.symbol && r.net.id === net.id)?.balance ?? null : null;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5">
      <TabTitle title="Deposit" desc="Coins go straight to your own HME trading pocket. Seeds never holds them — your HME Wallet keeps the keys." />
      {!link.isPending && !l ? (
        <Note tone="warn">Link your HME Wallet trading pocket first — <Link to="/account/security" className="text-primary underline">go to Security</Link>.</Note>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CoinNetworkPicker
            asset={asset}
            net={net}
            linked={linked}
            onAsset={(coin) => { setCopied(false); navigate({ search: { coin, network: undefined }, replace: true }); }}
            onNetwork={(network) => { setCopied(false); navigate({ search: (p) => ({ ...p, network }), replace: true }); }}
            disabledNote={(n) => (l && !depositState(n, true, l.addresses, seedsBlocker).ok ? "Not available" : null)}
          />
          {net && state ? (
            <div className="mt-6 border-t border-border pt-6">
              <p className="mb-3 text-sm font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">3</span>Send to this address</p>
              {state.ok ? (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="mx-auto shrink-0 rounded-md bg-accent p-4 text-foreground ring-1 ring-primary/30 sm:mx-0">
                    <QRCodeSVG value={state.address} size={168} bgColor="transparent" fgColor="currentColor" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{asset!.symbol} address · {net.label}</p>
                      <p className="mt-1 break-all rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm">{state.address}</p>
                    </div>
                    <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(state.address); setCopied(true); } catch { setCopied(false); } }}>
                      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy address"}
                    </Button>
                    <p className="text-xs text-muted-foreground">In your pocket now: <span className="num text-foreground">{fmtCoin(balance)} {asset!.symbol}</span></p>
                    <ul className="space-y-1.5">
                      {[`Only send ${asset!.symbol} on ${net.label} to this address.`, ...net.notes].map((n) => (
                        <li key={n} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> <span>{n}</span></li>
                      ))}
                    </ul>
                    {withdrawRoute(net) === "swap" ? <Note tone="warn">This coin can only leave your pocket by swapping it to TSD on Seeds — HME Wallet can't send it.</Note> : null}
                  </div>
                </div>
              ) : (
                <Note tone="warn">{state.reason}</Note>
              )}
            </div>
          ) : null}
        </Card>
        <aside className="space-y-4 text-sm">
          <Card title="Good to know">
            <ul className="space-y-3 text-muted-foreground">
              <li><b className="text-foreground">Your address, not ours.</b> This is your trading pocket's own receive address from HME Wallet.</li>
              <li><b className="text-foreground">How long?</b> Balances show once the network confirms the payment — minutes for most coins, longer for Bitcoin when the network is busy.</li>
              <li><b className="text-foreground">Wrong network?</b> Coins sent on a network you didn't pick may only be recoverable with your recovery phrase in another wallet.</li>
              <li><b className="text-foreground">From HME Wallet?</b> Move funds from your main wallet into the Trading pocket inside HME Wallet — same result, no copy-paste.</li>
            </ul>
          </Card>
          <Button asChild variant="ghost" className="w-full"><Link to="/account/balances">See all balances</Link></Button>
        </aside>
      </div>
    </div>
  );
}
