import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChain, getLeg, type LegId } from "@/lib/chains";
import { previewLeg, settleLeg, watchLeg } from "@/lib/settlement.functions";
import { truncateMiddle } from "@/lib/format";
import { confirmationsNeeded } from "@/lib/settle/confirm-rules";

/** Plain words for each side's state. */
const LEG_STATUS: Record<string, string> = {
  awaiting_funding: "not sent yet",
  funding_seen: "seen on the network",
  confirmed: "confirmed",
  released: "sent",
  refunded: "refunded",
};

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
  // Same depth the server waits for before the other side is paid (settle/confirm-rules.ts).
  const needed = confirmationsNeeded(def.kind === "evm" ? chainId : def.kind === "omni" ? "txc" : (def.chain as string));
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
        <span className="text-muted-foreground">{LEG_STATUS[leg.status] ?? leg.status.replace(/_/g, " ")}</span>
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
              : `${depth} of ${needed} confirmations${depth >= needed ? " · confirmed" : depth === 0 ? " · waiting for a block" : ""}`}
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

          {(data as { source?: string } | undefined)?.source === "pocket" ? (
            <p className="text-muted-foreground">
              {(() => {
                const st = (data as { approval?: string | null }).approval;
                if (st === "approved") return "approved in Telegram · sending once both sides approve";
                if (st === "pending") return "waiting for the sender's Telegram approval";
                if (st === "declined" || st === "expired" || st === "cancelled") return `send ${st} · nothing was sent`;
                return "sends from the HME pocket after a Telegram approval";
              })()}
            </p>
          ) : (
          <button
            onClick={() => settle.mutate()}
            disabled={!data?.ready || settle.isPending}
            className="w-full rounded-sm border border-primary/60 bg-primary/10 px-2 py-1 tracking-wider text-primary uppercase disabled:opacity-40"
          >
            {settle.isPending ? "broadcasting…" : "Send on-chain"}
          </button>
          )}

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
