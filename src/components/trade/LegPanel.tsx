import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChain, getLeg, type LegId } from "@/lib/chains";
import { previewLeg, settleLeg, watchLeg } from "@/lib/settlement.functions";
import { truncateMiddle } from "@/lib/format";

type Leg = {
  leg: string;
  status: string;
  expected: number;
  funded: number;
  releaseTxid: string | null;
  confirmations: number;
};

/** Transaction explorer for whichever chain actually carried the leg. */
function txExplorer(legId: LegId, chainId?: string | null): string {
  const def = getLeg(legId);
  const chain = getChain(chainId ?? def.chain ?? def.evmChains?.[0] ?? "txc");
  return chain.explorer.replace(/\/address\/?$/, "/tx/");
}

/**
 * One settlement leg of a trade — live on whichever chain it belongs to.
 *
 * The preview is a dry run of the exact gates settlement enforces; "Send
 * on-chain" builds, signs, and broadcasts through the delegated branch key.
 */
export function LegPanel({ tradeId, leg }: { tradeId: string; leg: Leg }) {
  const legId = leg.leg as LegId;
  const def = getLeg(legId);
  const queryClient = useQueryClient();
  const preview = useServerFn(previewLeg);
  const send = useServerFn(settleLeg);
  const watch = useServerFn(watchLeg);

  const broadcast = leg.releaseTxid && !leg.releaseTxid.startsWith("sim-") ? leg.releaseTxid : null;

  const check = useQuery({
    queryKey: ["leg-preview", legId, tradeId],
    queryFn: () => preview({ data: { tradeId, leg: legId } }),
    enabled: !broadcast,
    staleTime: 20_000,
  });

  const confirmations = useQuery({
    queryKey: ["leg-confirmations", legId, tradeId],
    queryFn: () => watch({ data: { tradeId, leg: legId } }),
    enabled: Boolean(broadcast),
    refetchInterval: 30_000,
  });

  const settle = useMutation({
    mutationFn: () => send({ data: { tradeId, leg: legId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["leg-preview", legId, tradeId] });
    },
  });

  const depth = confirmations.data?.confirmations ?? leg.confirmations;
  const data = check.data;
  const chainId =
    (confirmations.data as { chain?: string } | undefined)?.chain ??
    (data as { chain?: string } | undefined)?.chain ??
    null;
  const venue =
    def.kind === "omni"
      ? "omni #39"
      : ((data as { chainName?: string | null } | undefined)?.chainName?.toLowerCase() ??
        getChain(def.chain ?? def.evmChains?.[0] ?? "txc").name.toLowerCase());

  return (
    <div className="rounded-sm border border-primary/40 bg-background p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="tracking-[0.16em] text-primary uppercase">
          {def.symbol} · {venue}
        </span>
        <span className="text-muted-foreground">{leg.status}</span>
      </div>

      <p className="mt-1 tabular-nums">
        {leg.funded.toFixed(4)} / {leg.expected.toFixed(4)} {def.symbol}
      </p>

      {broadcast ? (
        <div className="mt-2 space-y-1">
          <a
            href={`${txExplorer(legId, chainId)}${broadcast}`}
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
          ) : data?.ready ? (
            <>
              <p className="text-muted-foreground">
                {data.fromAddress ? truncateMiddle(data.fromAddress, 8, 6) : "—"} →{" "}
                {data.toAddress ? truncateMiddle(data.toAddress, 8, 6) : "—"}
              </p>
              <p className="text-muted-foreground tabular-nums">
                branch balance {data.balance?.toFixed(4)} {def.symbol}
              </p>
            </>
          ) : (
            <p className="text-destructive">{data?.reason ?? "not ready"}</p>
          )}

          <button
            onClick={() => settle.mutate()}
            disabled={!data?.ready || settle.isPending}
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
