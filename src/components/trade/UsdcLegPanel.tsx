import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewUsdcLeg, settleUsdc, watchUsdc } from "@/lib/settlement.functions";
import { truncateMiddle } from "@/lib/format";

type Leg = {
  status: string;
  expected: number;
  funded: number;
  releaseTxid: string | null;
  confirmations: number;
};

const EXPLORER: Record<string, string> = {
  base: "https://basescan.org/tx/",
  ethereum: "https://etherscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
};

/**
 * The live USDC leg. A real ERC-20 transfer signed from the authorized trading
 * branch on whichever EVM chain the sender authorized.
 */
export function UsdcLegPanel({ tradeId, leg }: { tradeId: string; leg: Leg }) {
  const queryClient = useQueryClient();
  const preview = useServerFn(previewUsdcLeg);
  const send = useServerFn(settleUsdc);
  const watch = useServerFn(watchUsdc);

  const broadcast = leg.releaseTxid && !leg.releaseTxid.startsWith("sim-") ? leg.releaseTxid : null;

  const check = useQuery({
    queryKey: ["usdc-preview", tradeId],
    queryFn: () => preview({ data: { tradeId } }),
    enabled: !broadcast,
    staleTime: 20_000,
  });

  const confirmations = useQuery({
    queryKey: ["usdc-confirmations", tradeId],
    queryFn: () => watch({ data: { tradeId } }),
    enabled: Boolean(broadcast),
    refetchInterval: 20_000,
  });

  const settle = useMutation({
    mutationFn: () => send({ data: { tradeId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["usdc-preview", tradeId] });
    },
  });

  const depth = confirmations.data?.confirmations ?? leg.confirmations;
  const chain = confirmations.data?.chain ?? check.data?.chain ?? "base";
  const explorer = EXPLORER[chain] ?? EXPLORER.base;

  return (
    <div className="rounded-sm border border-primary/40 bg-background p-3 font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <span className="tracking-[0.16em] text-primary uppercase">
          usdc · {check.data?.chainName ?? confirmations.data?.chain ?? "evm"}
        </span>
        <span className="text-muted-foreground">{leg.status}</span>
      </div>

      <p className="mt-1 tabular-nums">
        {leg.funded.toFixed(2)} / {leg.expected.toFixed(2)} USDC
      </p>

      {broadcast ? (
        <div className="mt-2 space-y-1">
          <a
            href={`${explorer}${broadcast}`}
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
                ? "pending · 0 confirmations"
                : `${depth} confirmation${depth === 1 ? "" : "s"}`}
          </p>
          {confirmations.data?.success === false ? (
            <p className="text-destructive">the transaction reverted on-chain</p>
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
                branch balance {check.data.balance?.toFixed(2)} USDC
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
