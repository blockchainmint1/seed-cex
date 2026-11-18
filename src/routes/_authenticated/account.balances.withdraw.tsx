import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { CoinNetworkPicker } from "@/components/account/CoinNetworkPicker";
import { fmtCoin, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { findAsset, findNetwork, withdrawRoute, type DepositNetwork } from "@/lib/account/deposit-options";
import { PulseWithdraw } from "@/components/account/PulseWithdraw";
import { isPulseCoin } from "@/lib/pulse/withdraw-rules";

type Search = { coin?: string; network?: string };

export const Route = createFileRoute("/_authenticated/account/balances/withdraw")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): Search => ({
    coin: typeof s.coin === "string" && /^[A-Za-z]{2,6}$/.test(s.coin) ? s.coin.toUpperCase() : undefined,
    network: typeof s.network === "string" && /^[a-z-]{2,12}$/.test(s.network) ? s.network : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Withdraw crypto — Seeds" },
      { name: "description", content: "Withdraw from your HME trading pocket: HME Wallet sends HME-supported coins with your own keys; PulseChain coins are sent by Seeds after a hold; other coins swap back to TSD first." },
      { property: "og:title", content: "Withdraw crypto — Seeds" },
      { property: "og:description", content: "How to move coins out of your HME trading pocket, coin by coin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Withdraw,
});

const FEE_COIN: Record<string, string> = { "txc-omni": "TXC", ethereum: "ETH", base: "ETH", bsc: "BNB", zcu: "ZCU", pulsechain: "PLS" };

function Withdraw() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const link = usePocketLink();
  const l = link.data;
  const { rows } = usePocketBalances(l?.addresses, l?.id);
  const asset = findAsset(search.coin);
  const net = findNetwork(asset, search.network);
  const linked = new Set(Object.keys(l?.addresses ?? {}));
  const row = net ? rows.find((r) => r.asset.symbol === asset?.symbol && r.net.id === net.id) : undefined;

  return (
    <div className="space-y-5">
      <TabTitle
        title="Withdraw"
        desc="Your HME Wallet holds the keys to your trading pocket, so withdrawals to outside addresses are signed by you in HME Wallet. The one exception is PulseChain, which HME Wallet can't send on yet: there Seeds sends for you, after a hold you can cancel."
      />
      {!link.isPending && !l ? (
        <Note tone="warn">Link your HME Wallet trading pocket first — <Link to="/account/security" className="text-primary underline">go to Security</Link>.</Note>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CoinNetworkPicker
            asset={asset}
            net={net}
            linked={linked}
            onAsset={(coin) => navigate({ search: { coin, network: undefined }, replace: true })}
            onNetwork={(network) => navigate({ search: (p) => ({ ...p, network }), replace: true })}
          />
          {asset && net && l ? (
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <p className="text-sm font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">3</span>Send it out</p>
              {!row ? (
                <Note tone="warn">Your linked pocket doesn't include {asset.symbol} on {net.label}, so there's nothing to withdraw here.</Note>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-sm border border-border bg-background px-3 py-2">
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Available</p>
                      <p className="num mt-0.5 text-lg font-semibold">{fmtCoin(row.balance)} {asset.symbol}</p>
                    </div>
                    <div className="min-w-0 rounded-sm border border-border bg-background px-3 py-2">
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">From pocket #{l.account}</p>
                      <p className="mt-0.5 truncate font-mono text-xs">{row.address}</p>
                    </div>
                  </div>
                  {withdrawRoute(net) === "seeds" && isPulseCoin(asset.symbol) ? (
                    <PulseWithdraw coin={asset.symbol} from={row.address} balance={row.balance} />
                  ) : (
                    <Steps net={net} symbol={asset.symbol} account={l.account} />
                  )}
                </>
              )}
            </div>
          ) : null}
        </Card>
        <aside className="space-y-4 text-sm">
          <Card title="Why withdraw in HME Wallet?">
            <p className="text-muted-foreground">
              When your own wallet signs, a hacked Seeds account or a stolen API key can't drain your pocket to a stranger.
              PulseChain is the one exception (HME Wallet can't send there yet): Seeds sends only after a hold of at least 24 hours, tells
              you by email straight away, and you can cancel. API keys can never do this.
            </p>
          </Card>
          <Card title="Before you revoke">
            <p className="text-muted-foreground">
              Swap any DOGE, BCH, XRP, TRX or SOL back to TSD first. HME Wallet can't hold those coins, and after a revoke Seeds
              deletes its key. Withdraw PLS and pHEX first too: they stay safe at your EVM address, but HME Wallet won't show them,
              and you'd need your recovery phrase in a PulseChain wallet to move them.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Steps({ net, symbol, account }: { net: DepositNetwork; symbol: string; account: number }) {
  const route = withdrawRoute(net);
  if (route === "seeds") return <Note tone="warn">Seeds sends {symbol} on {net.label} for you — this coin can't be sent from here.</Note>;
  if (route === "none") return <Note tone="warn">Seeds can't send {symbol} yet. Keep it where it is; nothing should be deposited on this network until sending is built.</Note>;
  if (route === "swap")
    return (
      <div className="space-y-3">
        <Note tone="warn">HME Wallet can't send {symbol}. Take it out in two steps:</Note>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Swap your {symbol} to TSD on Seeds (it lands back in this pocket).</li>
          <li>Withdraw the TSD from HME Wallet → Trading pocket #{account} → Send.</li>
        </ol>
        <Button asChild><Link to="/swap"><Repeat /> Swap {symbol} to TSD</Link></Button>
      </div>
    );
  const fee = FEE_COIN[net.id];
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>Open HME Wallet and choose <b>Trading pocket #{account}</b>.</li>
        <li>Pick <b>{symbol}</b> on <b>{net.label}</b> and tap <b>Send</b>.</li>
        <li>Paste the destination address, check it twice, and confirm in your wallet.</li>
      </ol>
      {fee && fee !== symbol ? <p className="text-xs text-muted-foreground">You'll need a little {fee} in the pocket for the network fee.</p> : null}
      <Button asChild><a href="https://mobile.honest.money" target="_blank" rel="noreferrer"><ExternalLink /> Open HME Wallet</a></Button>
    </div>
  );
}
