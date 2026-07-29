import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewTxcLeg, settleTxc, watchTxc } from "@/lib/settlement.functions";
import { truncateMiddle } from "@/lib/format";

type Leg = {
  status: string;
  expected: number;
  funded: number;
  releaseTxid: string | null;
  confirmations: number;
};

const TX_EXPLORER = "https://mempool.texitcoin.org/tx/";

/**
 * The live TXC leg. Everything here touches the real chain: the preview is a
 * dry run of the exact gates settlement enforces, and "Send on-chain" builds,
 * signs and broadcasts through our own TEXITcoin node.
 */
export function TxcLegPanel({ tradeId, leg }: { tradeId: string; leg: Leg }) {
  const queryClient = useQueryClient();
  const preview = useServerFn(previewTxcLeg);
  const send = useServerFn(settleTxc);
  const watch = useServerFn(watchTxc);

  const broadcast = leg.releaseTxid && !leg.releaseTxid.startsWith("sim-") ? leg.releaseTxid : null;

  const check = useQuery({
    queryKey: ["txc-preview", tradeId],
    queryFn: () => preview({ data: { tradeId } }),
    enabled: !broadcast,
    staleTime: 20_000,
  });

  const confirmations = useQuery({
    queryKey: ["txc-confirmations", tradeId],
    queryFn: () => watch({ data: { tradeId } }),
    enabled: Boolean(broadcast),
    refetchInterval: 30_000,
  });

  const settle = useMutation({
    mutationFn: () => send({ data: { tradeId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["txc-preview", tradeId] });
    },
  });

  const depth = confirmations.data?.confirmations ?? leg.confirmations;

  return (
    <div className="rounded-sm border border-primary/40 bg-background p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="tracking-[0.16em] text-primary uppercase">txc · live chain</span>
        <span className="text-muted-foreground">{leg.status}</span>
      </div>

      <p className="mt-1 tabular-nums">
        {leg.funded.toFixed(4)} / {leg.expected.toFixed(4)} TXC
      </p>

      {broadcast ? (
        <div className="mt-2 space-y-1">
          <a
            href={`${TX_EXPLORER}${broadcast}`}
            target="_blank"
            rel="noreferrer"
            className="block text-primary underline-offset-4 hover:underline"
          >
            {truncateMiddle(broadcast, 12, 8)}
          </a>
          <p className="text-muted-foreground tabular-nums">
            {depth === null || depth === undefined
              ? "waiting for the node…"
              : depth === 0
                ? "in mempool · 0 confirmations"
                : `${depth} confirmation${depth === 1 ? "" : "s"}`}
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {check.isLoading ? (
            <p className="text-muted-foreground">checking authorization…</p>
          ) : check.data?.ready ? (
            <>
              <p className="text-muted-foreground">
                {check.data.fromAddress ? truncateMiddle(check.data.fromAddress, 8, 6) : "—"} →{" "}
                {check.data.toAddress ? truncateMiddle(check.data.toAddress, 8, 6) : "—"}
              </p>
              <p className="text-muted-foreground tabular-nums">
                branch balance {check.data.balance?.toFixed(4)} TXC · {check.data.feeRate} sat/vB
              </p>
            </>
          ) : (
            <p className="text-destructive">{check.data?.reason ?? "not ready"}</p>
          )}

          <button
            onClick={() => settle.mutate()}
            disabled={!check.data?.ready || settle.isPending}
            className="w-full rounded-sm border border-primary/60 bg-primary/10 px-2 py-1 tracking-wider text-primary uppercase disabled:opacity-40"
          >
            {settle.isPending ? "broadcasting…" : "Send on-chain"}
          </button>

          {settle.error ? (
            <p className="text-destructive">
              {settle.error instanceof Error ? settle.error.message : "Broadcast failed"}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
