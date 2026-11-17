import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { aiSeriesQuery, type AiCoin } from "@/lib/ai/market";
import { fmtPct, fmtUsd } from "@/lib/ai/series";
import { tone } from "./ui";

function Row({ coin }: { coin: AiCoin }) {
  const { data } = useQuery(aiSeriesQuery(coin.id));
  const c = data?.closes ?? [];
  const last = c.at(-1);
  const ch = (n: number) => (c.length > n ? c[c.length - 1]! / c[c.length - 1 - n]! - 1 : NaN);
  return (
    <tr className="border-t border-border hover:bg-muted/40">
      <td className="py-2.5 pl-4">
        <Link to="/ai/coin/$id" params={{ id: coin.id }} className="flex items-center gap-2 pr-4 font-semibold whitespace-nowrap hover:text-primary">
          {coin.image ? <img src={coin.image} alt="" className="h-5 w-5 rounded-full" loading="lazy" /> : null}
          {coin.name} <span className="font-mono text-[11px] text-muted-foreground uppercase">{coin.symbol}</span>
        </Link>
      </td>
      <td className="num py-2.5 pl-4 text-right whitespace-nowrap">{last ? fmtUsd(last) : data ? "no data yet" : "…"}</td>
      {[7, 30, 365].map((n) => (
        <td key={n} className={`num py-2.5 pl-4 text-right whitespace-nowrap ${tone(ch(n))}`}>{fmtPct(ch(n))}</td>
      ))}
      <td className="num py-2.5 pr-4 pl-4 text-right text-muted-foreground">{data?.days[0] ?? ""}</td>
    </tr>
  );
}

export function CoinsTable({ coins }: { coins: AiCoin[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="label-caps text-left">
          <tr>
            <th className="py-2.5 pl-4 font-normal">Coin</th>
            <th className="pl-4 text-right font-normal whitespace-nowrap">Last close</th>
            <th className="pl-4 text-right font-normal whitespace-nowrap">7 days</th>
            <th className="pl-4 text-right font-normal whitespace-nowrap">30 days</th>
            <th className="pl-4 text-right font-normal whitespace-nowrap">1 year</th>
            <th className="pr-4 pl-4 text-right font-normal whitespace-nowrap">History from</th>
          </tr>
        </thead>
        <tbody>{coins.map((c) => <Row key={c.id} coin={c} />)}</tbody>
      </table>
    </div>
  );
}
