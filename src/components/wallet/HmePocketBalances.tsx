import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, QrCode, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getAddressStats } from "@/lib/txc.functions";
import { getTsdBalance } from "@/lib/omni.functions";
import { getUtxoBalances } from "@/lib/utxo.functions";
import { getBtcBalance } from "@/lib/wrap.functions";
import { getEvmPortfolio } from "@/lib/evm.functions";
import { getMyExtraPocketBalances } from "@/lib/pockets/pockets.functions";
import { POCKET_SPECS, type PocketCoin } from "@/lib/pockets/coins";
import { HME_WALLET_CANT_HOLD, listCoins, revokeCheck } from "@/lib/pockets/hme-support";
import { Link } from "@tanstack/react-router";
import { arrivingShown } from "@/lib/account/arriving";
import { Arriving } from "@/components/account/Arriving";

export function HmePocketBalances({ addresses, linkId }: { addresses: Record<string, string>; linkId: string }) {
  const txcRead = useServerFn(getAddressStats);
  const tsdRead = useServerFn(getTsdBalance);
  const utxoRead = useServerFn(getUtxoBalances);
  const btcRead = useServerFn(getBtcBalance);
  const evmRead = useServerFn(getEvmPortfolio);
  const extraRead = useServerFn(getMyExtraPocketBalances);
  const hasExtra = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL"].some((c) => Boolean(addresses[c]));
  const freshNext = useRef(false);
  const query = useQuery({
    queryKey: ["hme-pocket-balances", linkId, addresses],
    queryFn: async () => {
      const fresh = freshNext.current;
      freshNext.current = false;
      const results = await Promise.allSettled([
        addresses.TXC ? txcRead({ data: { address: addresses.TXC, fresh } }) : Promise.resolve(null),
        addresses.TXC ? tsdRead({ data: { address: addresses.TXC, fresh } }) : Promise.resolve(null),
        utxoRead({ data: { ltcAddress: addresses.LTC, iskAddress: addresses.ISK, fresh } }),
        addresses.BTC ? btcRead({ data: { address: addresses.BTC, fresh } }) : Promise.resolve(null),
        addresses.EVM ? evmRead({ data: { address: addresses.EVM, fresh } }) : Promise.resolve(null),
        hasExtra ? extraRead({ data: { fresh } }) : Promise.resolve([]),
      ]);
      const [txc, tsd, utxo, btc, evm, extra] = results;
      return {
        txc: txc.status === "fulfilled" ? txc.value : null,
        tsd: tsd.status === "fulfilled" ? tsd.value : null,
        utxo: utxo.status === "fulfilled" ? utxo.value : [],
        btc: btc.status === "fulfilled" ? btc.value : null,
        evm: evm.status === "fulfilled" ? evm.value : [],
        extra: extra.status === "fulfilled" && Array.isArray(extra.value) ? extra.value : [],
      };
    },
    refetchInterval: 120_000,
  });
  const [receive, setReceive] = useState<{ symbol: string; network: string; address: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const d = query.data;
  const rows = [
    { symbol: "TSD", network: "TEXITcoin · Omni #39", address: addresses.TXC, balance: d?.tsd?.online ? d.tsd.balance : null, arriving: d?.tsd?.online ? arrivingShown("TSD", d.tsd.arriving) : 0 },
    { symbol: "TXC", network: "TEXITcoin", address: addresses.TXC, balance: d?.txc?.online ? d.txc.confirmed : null, arriving: d?.txc?.online ? arrivingShown("TXC", d.txc.arriving) : 0 },
    { symbol: "BTC", network: "Bitcoin", address: addresses.BTC, balance: d?.btc?.online ? d.btc.confirmed : null, arriving: d?.btc?.online ? arrivingShown("BTC", d.btc.arriving) : 0 },
    ...["LTC", "ISK"].map((symbol) => {
      const b = d?.utxo.find((r) => r.symbol === symbol);
      return { symbol, network: symbol === "LTC" ? "Litecoin" : "Iskandercoin", address: addresses[symbol], balance: b?.online ? b.balance : null, arriving: b?.online ? arrivingShown(symbol, b.arriving) : 0 };
    }),
    // Coins Seeds can't send out yet get no receive code (a deposit would be a one-way trip);
    // they're listed only if something already sits there. Monero can't be read at all.
    ...HME_WALLET_CANT_HOLD.filter((c: PocketCoin) => POCKET_SPECS[c].balanceReadable).map((c: PocketCoin) => ({
      symbol: c, network: POCKET_SPECS[c].name, address: addresses[c], notInHme: true,
      canReceive: POCKET_SPECS[c].signing === "ready",
      balance: (d?.extra ?? []).find((r) => r.coin === c)?.balance ?? null,
      arriving: arrivingShown(c, (d?.extra ?? []).find((r) => r.coin === c)?.arriving),
    })).filter((r) => r.canReceive || (r.balance ?? 0) > 0 || r.arriving > 0),
    ...(d?.evm ?? []).map((r) => ({ symbol: r.symbol, network: `${r.chainName} · EVM`, address: addresses.EVM, balance: r.online ? r.balance : null, arriving: 0 })),
  ].filter((r) => Boolean(r.address));
  const stranded = revokeCheck(d?.extra ?? []).stranded;
  const visibleRows = rows.filter((r, i) => showAll || i < 5 || r.balance === null || r.balance > 0 || r.arriving > 0);

  return <div className="mt-7">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-base font-bold">Trading pocket balances</h3>
      <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { freshNext.current = true; void query.refetch(); }}>
        <RefreshCw className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /> {query.isFetching ? "Syncing…" : "Refresh"}
      </Button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-border font-mono text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Asset</th><th className="py-3 pr-3">Network</th><th className="py-3 text-right">In pocket</th><th className="py-3 text-right">Receive</th></tr></thead>
        <tbody>{visibleRows.map((r) => <tr key={`${r.symbol}-${r.network}`} className="border-b border-border/60">
          <td className="py-3 pr-3 font-semibold">{r.symbol}</td><td className="py-3 pr-3 text-muted-foreground">{r.network}</td>
          <td data-qa-mask className="py-3 text-right num text-xs">{r.balance === null ? (query.isFetching ? "Checking…" : "Not available") : r.balance.toLocaleString("en-US", { maximumFractionDigits: 8 })}<Arriving amount={r.arriving} /></td>
          <td className="py-2 pl-3 text-right">{"canReceive" in r && r.canReceive === false ? null : <Button variant="ghost" size="icon" title={`Receive ${r.symbol} on ${r.network}`} aria-label={`Receive ${r.symbol} on ${r.network}`} onClick={() => { if (r.address) { setCopied(false); setReceive({ ...r, address: r.address }); } }}><QrCode /></Button>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {rows.length > 5 ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide empty EVM balances" : "Show all networks"}</Button> : null}
    {stranded.length ? (
      <p role="status" className="mt-3 border-l-2 border-warn pl-3 text-sm text-foreground">
        You have {listCoins(stranded.map((r) => r.coin))} here. HME Wallet can’t hold {stranded.length > 1 ? "these coins" : "this coin"}, so{" "}
        <Link to="/swap" className="text-primary underline">swap {stranded.length > 1 ? "them" : "it"} back to TSD</Link> before you revoke Seeds’ access.
      </p>
    ) : null}
    <p className="mt-3 text-xs text-muted-foreground">Confirmed funds at this pocket’s receive addresses; coins still waiting for a block show as “arriving” and can’t be spent yet. Native BTC, LTC and ETH are separate from their exchange-settlement tokens.</p>
    {query.isError ? <p role="alert" className="mt-2 text-sm text-destructive">Balances could not be synced. Refresh to retry.</p> : null}
    <Dialog open={Boolean(receive)} onOpenChange={(open) => { if (!open) setReceive(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
        <DialogTitle>Receive {receive?.symbol}</DialogTitle>
        <DialogDescription>{receive?.network} · HME trading pocket</DialogDescription>
        {receive ? <>
          <div className="mx-auto bg-accent p-4 text-foreground"><QRCodeSVG value={receive.address} size={192} bgColor="transparent" fgColor="currentColor" /></div>
          <p data-qa-mask className="break-all text-center font-mono text-xs">{receive.address}</p>
          <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(receive.address); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy address"}</Button>
        </> : null}
      </DialogContent>
    </Dialog>
  </div>;
}