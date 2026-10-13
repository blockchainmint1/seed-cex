import { useState } from "react";
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

export function HmePocketBalances({ addresses, linkId }: { addresses: Record<string, string>; linkId: string }) {
  const txcRead = useServerFn(getAddressStats);
  const tsdRead = useServerFn(getTsdBalance);
  const utxoRead = useServerFn(getUtxoBalances);
  const btcRead = useServerFn(getBtcBalance);
  const evmRead = useServerFn(getEvmPortfolio);
  const query = useQuery({
    queryKey: ["hme-pocket-balances", linkId, addresses],
    queryFn: async () => {
      const results = await Promise.allSettled([
        addresses.TXC ? txcRead({ data: { address: addresses.TXC } }) : Promise.resolve(null),
        addresses.TXC ? tsdRead({ data: { address: addresses.TXC } }) : Promise.resolve(null),
        utxoRead({ data: { ltcAddress: addresses.LTC, iskAddress: addresses.ISK } }),
        addresses.BTC ? btcRead({ data: { address: addresses.BTC } }) : Promise.resolve(null),
        addresses.EVM ? evmRead({ data: { address: addresses.EVM } }) : Promise.resolve(null),
      ]);
      const [txc, tsd, utxo, btc, evm] = results;
      return {
        txc: txc.status === "fulfilled" ? txc.value : null,
        tsd: tsd.status === "fulfilled" ? tsd.value : null,
        utxo: utxo.status === "fulfilled" ? utxo.value : [],
        btc: btc.status === "fulfilled" ? btc.value : null,
        evm: evm.status === "fulfilled" ? evm.value : [],
      };
    },
    refetchInterval: 60_000,
  });
  const [receive, setReceive] = useState<{ symbol: string; network: string; address: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const d = query.data;
  const rows = [
    { symbol: "TSD", network: "TEXITcoin · Omni #39", address: addresses.TXC, balance: d?.tsd?.online ? d.tsd.balance : null },
    { symbol: "TXC", network: "TEXITcoin", address: addresses.TXC, balance: d?.txc?.online ? d.txc.confirmed : null },
    { symbol: "BTC", network: "Bitcoin", address: addresses.BTC, balance: d?.btc?.online ? d.btc.confirmed : null },
    ...["LTC", "ISK"].map((symbol) => {
      const b = d?.utxo.find((r) => r.symbol === symbol);
      return { symbol, network: symbol === "LTC" ? "Litecoin" : "Iskandercoin", address: addresses[symbol], balance: b?.online ? b.balance : null };
    }),
    ...(d?.evm ?? []).map((r) => ({ symbol: r.symbol, network: `${r.chainName} · EVM`, address: addresses.EVM, balance: r.online ? r.balance : null })),
  ].filter((r) => Boolean(r.address));

  return <div className="mt-7">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-base font-bold">Trading pocket balances</h3>
      <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>
        <RefreshCw className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /> {query.isFetching ? "Syncing…" : "Refresh"}
      </Button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-border font-mono text-xs text-muted-foreground"><tr><th className="py-3 pr-3">Asset</th><th className="py-3 pr-3">Network</th><th className="py-3 text-right">In pocket</th><th className="py-3 text-right">Receive</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={`${r.symbol}-${r.network}`} className="border-b border-border/60">
          <td className="py-3 pr-3 font-semibold">{r.symbol}</td><td className="py-3 pr-3 text-muted-foreground">{r.network}</td>
          <td className="py-3 text-right font-mono text-xs tabular-nums">{r.balance === null ? (query.isFetching ? "Checking…" : "Not available") : r.balance.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
          <td className="py-2 pl-3 text-right"><Button variant="ghost" size="icon" title={`Receive ${r.symbol} on ${r.network}`} aria-label={`Receive ${r.symbol} on ${r.network}`} onClick={() => { if (r.address) { setCopied(false); setReceive({ ...r, address: r.address }); } }}><QrCode /></Button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Confirmed funds at this pocket’s receive addresses. Native BTC, LTC and ETH are separate from their exchange-settlement tokens.</p>
    {query.isError ? <p role="alert" className="mt-2 text-sm text-destructive">Balances could not be synced. Refresh to retry.</p> : null}
    <Dialog open={Boolean(receive)} onOpenChange={(open) => { if (!open) setReceive(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm">
        <DialogTitle>Receive {receive?.symbol}</DialogTitle>
        <DialogDescription>{receive?.network} · HME trading pocket</DialogDescription>
        {receive ? <>
          <div className="mx-auto bg-accent p-4 text-foreground"><QRCodeSVG value={receive.address} size={192} bgColor="transparent" fgColor="currentColor" /></div>
          <p className="break-all text-center font-mono text-xs">{receive.address}</p>
          <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(receive.address); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy address"}</Button>
        </> : null}
      </DialogContent>
    </Dialog>
  </div>;
}