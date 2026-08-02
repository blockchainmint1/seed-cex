import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewTsdLeg, settleTsd, watchTsd } from "@/lib/settlement.functions";
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
 * The live TSD leg — Omni property #39 on the TEXITcoin chain. The node builds
 * the carrier transaction, we sign it here, and it broadcasts for real.
 */
export function TsdLegPanel({ tradeId, leg }: { tradeId: string; leg: Leg }) {
  const queryClient = useQueryClient();
  const preview = useServerFn(previewTsdLeg);
  const send = useServerFn(settleTsd);
  const watch = useServerFn(watchTsd);

  const broadcast = leg.releaseTxid && !leg.releaseTxid.startsWith("sim-") ? leg.releaseTxid : null;

  const check = useQuery({
    queryKey: ["tsd-preview", tradeId],
    queryFn: () => preview({ data: { tradeId } }),
    enabled: !broadcast,
    staleTime: 20_000,
  });

  const confirmations = useQuery({
    queryKey: ["tsd-confirmations", tradeId],
    queryFn: () => watch({ data: { tradeId } }),
    enabled: Boolean(broadcast),
    refetchInterval: 30_000,
  });

  const settle = useMutation({
    mutationFn: () => send({ data: { tradeId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["tsd-preview", tradeId] });
    },
  });

  const depth = confirmations.data?.confirmations ?? leg.confirmations;

  return (
    <div className="rounded-sm border border-primary/40 bg-background p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="tracking-[0.16em] text-primary uppercase">tsd · omni #39</span>
        <span className="text-muted-foreground">{leg.status}</span>
      </div>

      <p className="mt-1 tabular-nums">
        {leg.funded.toFixed(2)} / {leg.expected.toFixed(2)} TSD
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
          {confirmations.data?.valid === false ? (
            <p className="text-destructive">
              Omni rejected this transfer: {confirmations.data.invalidReason ?? "unknown"}
            </p>
          ) : null}
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
                branch holds {check.data.balance?.toFixed(2)} TSD ·{" "}
                {check.data.feeBalance?.toFixed(4)} TXC for fees
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
