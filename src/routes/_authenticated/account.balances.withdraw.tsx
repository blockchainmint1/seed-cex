import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Repeat } from "lucide-react";
import { swapPairForCoinSymbol } from "@/lib/account/swap-link";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { CoinNetworkPicker } from "@/components/account/CoinNetworkPicker";
import { fmtCoin, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { rowKey, useSetAsides } from "@/components/account/use-set-asides";
import { findAsset, findNetwork, withdrawRoute, type DepositNetwork } from "@/lib/account/deposit-options";
import { SeedsWithdraw } from "@/components/account/SeedsWithdraw";
import { withdrawCoin } from "@/lib/withdraw/catalog";
import { useMyIdentity } from "@/components/account/use-identity";
import { keyThing } from "@/lib/account/sign-in-kind";

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
      { name: "description", content: "Withdraw any coin from your HME trading pocket: Seeds sends it after an email code, your authenticator code and a Telegram tap, or send it yourself from HME Wallet." },
      { property: "og:title", content: "Withdraw crypto — Seeds" },
      { property: "og:description", content: "How to move coins out of your HME trading pocket, coin by coin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Withdraw,
});

const FEE_COIN: Record<string, string> = { "txc-omni": "TXC", ethereum: "ETH", base: "ETH", bsc: "BNB", zcu: "ZCU", pulsechain: "PLS", hyperevm: "HYPE", avalanche: "AVAX" };

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
  const held = useSetAsides(rows, Boolean(l));
  const inTrades = row ? (held.byRow[rowKey(row)] ?? 0) : 0;
  const free = row?.balance == null ? null : Math.max(0, row.balance - inTrades);
  const coin = withdrawCoin(asset?.symbol, net?.id);
  // Coin / outside-wallet members have no HME Wallet: Seeds is the only way to send, and "re-link" = sign in again.
  const identity = useMyIdentity();
  const keyKind = identity.pocketKeyKind;
  const again = keyKind ? (identity.pocketViaLink ? `link ${keyThing(keyKind)} again` : `sign in again with ${keyThing(keyKind)}`) : "";

  return (
    <div className="space-y-5">
      <TabTitle
        title="Withdraw"
        desc={`Seeds can send any coin in your trading pocket to an outside address. Every withdrawal needs a code we email you, your authenticator code and your tap in Telegram, then your level's wait.${keyKind ? "" : " Coins HME Wallet supports can also be sent from HME Wallet yourself."}`}
      />
      {!link.isPending && !l ? (
        <Note tone="warn">
          {identity.keyKind ? `You have no active trading pocket. Sign in again with ${keyThing(identity.keyKind)} to set one up — ` : "Link a trading pocket first (HME Wallet, a Cold Storage Coin, HME Vault or another wallet) — "}
          <Link to="/account/security" className="text-primary underline">go to Security</Link>.
        </Note>
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
                      <p data-qa-mask className="num mt-0.5 text-lg font-semibold">{fmtCoin(free)} {asset.symbol}</p>
                      {inTrades > 0 ? <p data-qa-mask className="num text-xs text-muted-foreground">{fmtCoin(inTrades)} more in trades</p> : null}
                    </div>
                    <div className="min-w-0 rounded-sm border border-border bg-background px-3 py-2">
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">From pocket #{l.account}</p>
                      <p className="mt-0.5 truncate font-mono text-xs">{row.address}</p>
                    </div>
                  </div>
                  {coin ? (
                    <>
                      {inTrades > 0 ? (
                        <Note>
                          {fmtCoin(inTrades)} {asset.symbol} is set aside for your open orders and trades, so it can't be withdrawn.{" "}
                          <Link to="/activity" className="text-primary underline">Cancel an order</Link> to free it.
                        </Note>
                      ) : null}
                      <SeedsWithdraw coin={coin} from={row.address} balance={free} />
                      {withdrawRoute(net) === "hme" && !keyKind ? (
                        <details className="rounded-sm border border-border px-3 py-2 text-sm">
                          <summary className="cursor-pointer font-semibold">Or send it yourself from HME Wallet</summary>
                          <div className="mt-3"><Steps net={net} symbol={asset.symbol} account={l.account} /></div>
                          {inTrades > 0 ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                              If you send coins that are in trades this way, Seeds cancels the newest orders they no longer cover and tells you.
                            </p>
                          ) : null}
                        </details>
                      ) : null}
                    </>
                  ) : keyKind ? (
                    <Note tone="warn">Seeds can't send {asset.symbol} on {net.label} for you yet. It stays safely in your pocket under your own key.</Note>
                  ) : (
                    <Steps net={net} symbol={asset.symbol} account={l.account} />
                  )}
                </>
              )}
            </div>
          ) : null}
        </Card>
        <aside className="space-y-4 text-sm">
          <Card title="How Seeds keeps withdrawals safe">
            <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
              <li>
                {keyKind
                  ? `Add an email, turn on two-factor and connect Telegram, then ${again}. A pocket link made before two-factor and Telegram can't withdraw — so someone who gets into your sign-in can't add their own phone and take your coins.`
                  : "Turn on two-factor and connect Telegram first, then link your HME Wallet. A link made before both can't withdraw — so someone who gets into your sign-in can't add their own phone and take your coins."}
              </li>
              <li>Every withdrawal: an email code for that exact amount and address, your authenticator code, and your Approve tap in Telegram.</li>
              <li>Then your level's wait (at least 24 hours for members). You get an email straight away and can cancel until it goes out.</li>
              <li>API keys and AI assistants can never withdraw.</li>
            </ul>
          </Card>
          <Card title="Before you revoke">
            {keyKind ? (
              <p className="text-muted-foreground">
                Withdraw first. After a revoke Seeds deletes its key for this pocket, so it can't trade, swap or send from it for you any more.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Withdraw (or swap back to TSD) any DOGE, BCH, XRP, TRX, SOL, PLS or pHEX first. HME Wallet can't send those coins, and after a
                revoke Seeds deletes its key, so you'd need your recovery phrase in another wallet to move them.
              </p>
            )}
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
        <Button asChild><Link to="/swap" search={swapPairForCoinSymbol(symbol) ?? {}}><Repeat /> Swap {symbol} to TSD</Link></Button>
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
