import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import {
  getWrapDesk,
  listMyWrapOrders,
  openUnwrapOrder,
  openWrapOrder,
  syncWrapOrder,
} from "@/lib/wrap.functions";
import {
  WRAP_ASSETS,
  WRAP_STATUS_LABELS,
  getWrapAsset,
  isTerminalWrapStatus,
  type WrapDirection,
  type WrapStatus,
} from "@/lib/wrap-config";
import { fmtAmount, truncateMiddle } from "@/lib/format";

function statusTone(status: WrapStatus): string {
  if (status === "complete") return "text-primary";
  if (status === "failed" || status === "expired") return "text-destructive";
  return "text-muted-foreground";
}

/**
 * Wrap desk panel.
 *
 * Seeds is a client of the reserve-backed issuer, not the issuer. Every
 * label here says so plainly: while wrapped, the native coin sits in the
 * issuer's reserve, and that leg is custodial even though the exchange
 * itself is not.
 */
export function WrapDesk() {
  const queryClient = useQueryClient();
  const fetchDesk = useServerFn(getWrapDesk);
  const fetchOrders = useServerFn(listMyWrapOrders);
  const wrapFn = useServerFn(openWrapOrder);
  const unwrapFn = useServerFn(openUnwrapOrder);
  const syncFn = useServerFn(syncWrapOrder);

  const [direction, setDirection] = useState<WrapDirection>("wrap");
  const [baseSymbol, setBaseSymbol] = useState(WRAP_ASSETS[0]?.baseSymbol ?? "BTC");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const asset = useMemo(() => getWrapAsset(baseSymbol), [baseSymbol]);

  const desk = useQuery({
    queryKey: ["wrap-desk"],
    queryFn: () => fetchDesk(),
    refetchInterval: 120_000,
  });

  const orders = useQuery({
    queryKey: ["wrap-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: 30_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount.");
      if (!address.trim()) throw new Error("Enter an address.");
      const payload = {
        data: {
          baseSymbol: asset.baseSymbol,
          amount: value,
          counterpartyAddress: address.trim(),
        },
      };
      return direction === "wrap" ? wrapFn(payload) : unwrapFn(payload);
    },
    onSuccess: () => {
      setError(null);
      setAmount("");
      setAddress("");
      void queryClient.invalidateQueries({ queryKey: ["wrap-orders"] });
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not open the order."),
  });

  const sync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wrap-orders"] }),
  });

  const deskOffline = desk.data ? !desk.data.online : false;

  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
            Reserve-backed issuer
          </p>
          <h2 className="font-display text-sm font-bold tracking-[0.1em] text-foreground uppercase">
            Wrap desk
          </h2>
        </div>
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase">
          {desk.isLoading ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : desk.data?.online ? (
            <span className="text-primary">Issuer online</span>
          ) : (
            <span className="text-destructive">Issuer unavailable</span>
          )}
        </p>
      </header>

      <div className="p-5">
        <p className="mb-5 max-w-3xl font-mono text-[11px] leading-relaxed text-muted-foreground">
          Wrapping mints a tradable Omni asset on TEXITcoin against native coin held
          in the issuer's cold reserve, so trades settle in seconds instead of waiting
          on Bitcoin blocks. This leg is <span className="text-foreground">custodial</span> —
          the exchange is not, but the reserve is. Reserve and supply are published
          continuously, and you can redeem 1:1 at any time.
        </p>

        {desk.data?.reserves.length ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {desk.data.reserves.map((r) => (
              <div key={r.asset} className="rounded-sm border border-border px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  {r.asset} reserve
                </p>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {fmtAmount(r.reserve)} held / {fmtAmount(r.supply)} issued
                </p>
                <p
                  className={`mt-1 font-mono text-[11px] ${
                    r.collateralization >= 1 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {(r.collateralization * 100).toFixed(2)}% collateralized
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {desk.data?.message ? (
          <p className="mb-5 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-[11px] leading-relaxed text-destructive">
            {desk.data.message}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div>
            <div className="mb-4 flex gap-2">
              {(["wrap", "unwrap"] as WrapDirection[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`flex-1 rounded-sm border px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase ${
                    direction === d
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {d === "wrap" ? `${asset.baseSymbol} → ${asset.wrappedSymbol}` : `${asset.wrappedSymbol} → ${asset.baseSymbol}`}
                </button>
              ))}
            </div>

            <label className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Asset
            </label>
            <select
              value={baseSymbol}
              onChange={(e) => setBaseSymbol(e.target.value)}
              className="mb-4 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            >
              {WRAP_ASSETS.map((a) => (
                <option key={a.baseSymbol} value={a.baseSymbol}>
                  {a.name} ({a.baseSymbol})
                </option>
              ))}
            </select>

            <label className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Amount ({direction === "wrap" ? asset.baseSymbol : asset.wrappedSymbol})
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={String(asset.minAmount)}
              className="mb-4 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            />

            <label className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {direction === "wrap"
                ? `${asset.baseSymbol} refund address`
                : `${asset.baseSymbol} payout address`}
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={asset.addressHint}
              maxLength={120}
              className="mb-2 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            />
            <p className="mb-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {direction === "wrap"
                ? `Used only if the wrap can't complete and the issuer has to send your ${asset.baseSymbol} back. ${asset.wrappedSymbol} is minted straight to your shared trading branch.`
                : `Where the issuer releases native ${asset.baseSymbol} after burning your ${asset.wrappedSymbol}.`}
            </p>

            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || deskOffline || !desk.data?.configured}
              className="w-full rounded-sm bg-primary px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
            >
              {submit.isPending
                ? "Opening…"
                : direction === "wrap"
                  ? `Wrap ${asset.baseSymbol}`
                  : `Unwrap ${asset.wrappedSymbol}`}
            </button>

            {error ? (
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-destructive">{error}</p>
            ) : null}

            <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Minimum {asset.minAmount} {asset.baseSymbol} · issuer waits{" "}
              {asset.confirmations} confirmation{asset.confirmations === 1 ? "" : "s"} before
              minting.
            </p>
          </div>

          <div>
            <p className="mb-3 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Your wrap orders
            </p>
            {orders.isLoading ? (
              <p className="font-mono text-[11px] text-muted-foreground">Loading…</p>
            ) : !orders.data?.length ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                No wrap orders yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {orders.data.map((o) => (
                  <li key={o.id} className="rounded-sm border border-border px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-mono text-xs text-foreground">
                        {o.direction === "wrap"
                          ? `${o.base_symbol} → ${o.wrapped_symbol}`
                          : `${o.wrapped_symbol} → ${o.base_symbol}`}{" "}
                        · {fmtAmount(Number(o.amount_expected ?? 0))}
                      </p>
                      <p
                        className={`font-mono text-[10px] tracking-[0.14em] uppercase ${statusTone(o.status)}`}
                      >
                        {WRAP_STATUS_LABELS[o.status]}
                      </p>
                    </div>

                    {o.deposit_address && !isTerminalWrapStatus(o.status) ? (
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <div className="rounded-sm bg-primary/10 p-2 ring-1 ring-primary/30">
                          <QRCodeSVG
                            value={o.deposit_address}
                            size={96}
                            bgColor="transparent"
                            fgColor="currentColor"
                            className="text-foreground"
                          />
                        </div>
                        <div className="min-w-0">
                           <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                             Send {o.direction === "wrap" ? o.base_symbol : o.wrapped_symbol} here
                           </p>
                          <p className="mt-1 font-mono text-[11px] break-all text-foreground">
                            {o.deposit_address}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void navigator.clipboard.writeText(o.deposit_address ?? "")
                            }
                            className="mt-2 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <dl className="mt-3 grid gap-1 font-mono text-[10px] text-muted-foreground">
                      {o.deposit_txid ? (
                        <div className="flex gap-2">
                          <dt>Deposit</dt>
                          <dd className="text-foreground">{truncateMiddle(o.deposit_txid, 16)}</dd>
                        </div>
                      ) : null}
                      {o.delivery_txid ? (
                        <div className="flex gap-2">
                          <dt>Delivery</dt>
                          <dd className="text-foreground">{truncateMiddle(o.delivery_txid, 16)}</dd>
                        </div>
                      ) : null}
                      {o.error ? (
                        <div className="text-destructive">{o.error}</div>
                      ) : null}
                    </dl>

                    {!isTerminalWrapStatus(o.status) ? (
                      <button
                        type="button"
                        onClick={() => sync.mutate(o.id)}
                        disabled={sync.isPending}
                        className="mt-3 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase disabled:opacity-50"
                      >
                        {sync.isPending ? "Checking…" : "Refresh status"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
