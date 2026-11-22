import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySetAsides } from "@/lib/set-asides.functions";
import { rowSetAsides } from "@/lib/set-asides";
import type { BalanceRow } from "@/components/account/use-pocket";

export const rowKey = (r: BalanceRow) => `${r.asset.symbol}-${r.net.id}`;

/** Coins set aside for open orders and trades, matched to the Balances rows. */
export function useSetAsides(rows: BalanceRow[], enabled = true) {
  const read = useServerFn(getMySetAsides);
  const q = useQuery({ queryKey: ["my-set-asides"], queryFn: () => read(), enabled, refetchInterval: 30_000 });
  const byRow = q.data
    ? rowSetAsides(rows.map((r) => ({ key: rowKey(r), symbol: r.asset.symbol, network: r.net.id, balance: r.balance })), q.data.byLeg)
    : {};
  const any = Object.values(byRow).some((n) => n > 1e-8);
  return { byRow, any, query: q };
}
