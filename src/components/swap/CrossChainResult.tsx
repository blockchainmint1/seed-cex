import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, X } from "lucide-react";
import { PROTOCOL_LABEL, type Protocol, type SwapCoin } from "@/lib/xchain/assets";
import { getSwapApproval, type getSwapQuotes, type getSwapSendContext, sendSwap } from "@/lib/xchain/swap.functions";
import { isOwnPocketDestination, sendBlocker, sendSource, TRACKER_NAME, trackerUrl } from "@/lib/xchain/send-rules";
import { CodeField } from "@/components/account/CodeField";
import { proveTwoFactor } from "@/components/account/two-factor";

const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
const coins = (n: number | null | undefined, digits = 8) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const minutes = (s: number | null) => (s == null ? "—" : s < 90 ? `~${Math.max(1, Math.round(s))}s` : `~${Math.round(s / 60)} min`);

export type XRoute = Awaited<ReturnType<typeof getSwapQuotes>>["routes"][number];

/** THORChain and Maya side by side for one coin → coin swap, each with its fees, checks and send step. */
export function CrossChainRoutes({ routes, fromCoin, toCoin, amount, destination, inputUsd, signedIn, sendCtx, onSent }: {
  routes: XRoute[];
  fromCoin: SwapCoin;
  toCoin: SwapCoin;
  amount: string;
  destination: string;
  inputUsd: number | null;
  signedIn: boolean;
  sendCtx: SendCtx | null;
  onSent: () => void;
}) {
  const bestPrice = routes.filter((r) => r.ok).sort((a, b) => b.expectedOut - a.expectedOut)[0] ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {routes.map((r) => {
        const isBest = bestPrice?.protocol === r.protocol;
        return (
          <article
            key={r.protocol}
            className={`space-y-4 rounded-sm border bg-surface p-5 ${isBest ? "border-primary" : "border-border"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{r.label}</h2>
              {isBest ? (
                <span className="rounded-sm bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary-foreground uppercase">
                  Best price
                </span>
              ) : null}
            </div>
            {r.ok ? (
              <>
                <div>
                  <p className="font-display text-2xl font-bold tabular-nums">
                    {coins(r.expectedOut)} {toCoin.symbol}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    ≈ {usd(r.expectedOutUsd)}
                    {r.minOut != null ? ` · never less than ${coins(r.minOut)}` : ""}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
                  <dt className="text-muted-foreground">Price impact</dt>
                  <dd className="text-right tabular-nums">{coins(r.fees.liquidity)} {toCoin.symbol}</dd>
                  <dt className="text-muted-foreground">Delivery network fee</dt>
                  <dd className="text-right tabular-nums">{coins(r.fees.outbound)} {toCoin.symbol}</dd>
                  <dt className="text-muted-foreground">Seeds fee</dt>
                  <dd className="text-right tabular-nums">{r.fees.affiliate > 0 ? `${coins(r.fees.affiliate)} ${toCoin.symbol}` : "None"}</dd>
                  <dt className="text-muted-foreground">Total cost</dt>
                  <dd className="text-right tabular-nums">
                    {usd(r.fees.totalUsd)}
                    {r.fees.totalBps != null ? ` (${(r.fees.totalBps / 100).toFixed(2)}%)` : ""}
                  </dd>
                  <dt className="text-muted-foreground">Arrives in</dt>
                  <dd className="text-right tabular-nums">{minutes(r.seconds)}</dd>
                </dl>
                <ul className="space-y-1.5 border-t border-border pt-3">
                  {r.checks.map((c) => (
                    <li key={c.label} className="flex gap-2 text-xs">
                      {c.pass ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span>
                        {c.label}
                        <span className="block font-mono text-[10px] text-muted-foreground">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {r.sendReady ? "All send checks passed." : `Not send-ready: ${r.blockedReason}`}
                </p>
                {r.sendReady ? (
                  <SendPanel
                    protocol={r.protocol}
                    signedIn={signedIn}
                    ctx={sendCtx}
                    from={fromCoin}
                    to={toCoin}
                    amount={amount}
                    destination={destination}
                    expectedOut={r.expectedOut}
                    minOut={r.minOut}
                    inputUsd={inputUsd}
                    onSent={onSent}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{r.error ?? "No route."}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export type SendCtx = Awaited<ReturnType<typeof getSwapSendContext>>;

function SendPanel(props: {
  protocol: Protocol;
  signedIn: boolean;
  ctx: SendCtx | null;
  from: SwapCoin;
  to: SwapCoin;
  amount: string;
  destination: string;
  expectedOut: number;
  minOut: number | null;
  inputUsd: number | null;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendSwap);
  const checkApproval = useServerFn(getSwapApproval);
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [approval, setApproval] = useState<{ id: string; expiresAt: string } | null>(null);
  const [approvalEnded, setApprovalEnded] = useState<string | null>(null);
  // Paying anywhere but the member's own pocket needs a fresh code + a Telegram tap (audit H2).
  const outside = !isOwnPocketDestination(props.to, props.ctx?.link?.addresses as Record<string, string> | undefined, props.destination);
  const input = { from: props.from.id, to: props.to.id, amount: props.amount, destination: props.destination, shownOut: props.expectedOut, protocol: props.protocol };
  const mutation = useMutation({
    mutationFn: async (approvalId?: string) => {
      if (outside && !approvalId) await proveTwoFactor(code);
      return send({ data: { ...input, approvalId } });
    },
    onSuccess: (r) => {
      if (r.needsApproval) { setApproval({ id: r.approvalId, expiresAt: r.expiresAt }); setApprovalEnded(null); }
      else setApproval(null);
    },
    onError: () => setApproval(null),
    onSettled: () => { setCode(""); qc.invalidateQueries({ queryKey: ["swap-send-ctx"] }); },
  });
  const tap = useQuery({
    queryKey: ["swap-approval", approval?.id ?? null],
    queryFn: () => checkApproval({ data: { id: approval!.id } }),
    enabled: Boolean(approval) && !mutation.isPending,
    refetchInterval: 3000,
  });
  const tapStatus = tap.data?.status;
  useEffect(() => {
    if (!approval || !tapStatus || mutation.isPending) return;
    if (tapStatus === "approved") mutation.mutate(approval.id);
    else if (tapStatus !== "pending") {
      setApproval(null);
      setApprovalEnded(tapStatus === "declined" ? "You declined it in Telegram. Nothing was sent." : "The Telegram request ended without an Approve tap. Nothing was sent.");
    }
  }, [approval, tapStatus, mutation]);

  if (mutation.data && !mutation.data.needsApproval) {
    return (
      <div className="space-y-2 rounded-sm border border-primary bg-primary/10 p-3 text-xs">
        <p className="font-semibold">Sent. {PROTOCOL_LABEL[props.protocol]} is swapping it now.</p>
        <p className="text-muted-foreground">
          You'll get about {coins(mutation.data.expectedOut)} {props.to.symbol}
          {mutation.data.minOut != null ? `, or a refund if it would be under ${coins(mutation.data.minOut)}` : ""}. Progress shows under “My swaps”.
        </p>
        <a href={trackerUrl(props.protocol, mutation.data.txid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary underline">
          Track on {TRACKER_NAME[props.protocol]} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (!props.signedIn) {
    return (
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        <Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to send this from your trading pocket.
      </p>
    );
  }
  if (!props.ctx) return null;
  const link = props.ctx.link ? { mode: props.ctx.link.mode, hasKey: props.ctx.link.hasKey, pockets: props.ctx.link.pockets as string[] } : null;
  const blocker = sendBlocker({ from: props.from, to: props.to, link, isAdmin: props.ctx.isAdmin, amountUsd: props.inputUsd, protocol: props.protocol });
  if (blocker) return <p className="border-t border-border pt-3 text-xs text-muted-foreground">{blocker}</p>;
  const src = sendSource(props.from, props.protocol)!;
  const fromAddr = (props.ctx.link?.addresses as Record<string, string> | undefined)?.[src.pocket];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-xs">
        Send <span className="num font-semibold">{props.amount} {props.from.symbol}</span> ({usd(props.inputUsd)}) from your trading pocket
        {fromAddr ? <span className="block truncate font-mono text-[10px] text-muted-foreground">{fromAddr}</span> : null}
      </p>
      <p className="text-xs">
        To <span className="block truncate font-mono text-[10px] text-muted-foreground">{props.destination}</span>
      </p>
      {approval ? (
        <div role="status" className="space-y-1 rounded-sm border border-primary bg-primary/10 p-3 text-xs">
          <p className="font-semibold">Check Telegram and tap Approve.</p>
          <p className="text-muted-foreground">Keep this page open: it sends as soon as it sees your tap, after one last price check. Nothing moves until then.</p>
        </div>
      ) : null}
      {approvalEnded ? <p className="text-xs text-muted-foreground">{approvalEnded}</p> : null}
      {outside && !approval ? (
        <div className="space-y-2 rounded-sm border border-border p-3">
          <p className="text-xs text-muted-foreground">
            This pays an outside address, not your own pocket, so it needs the code from your authenticator app and then your Approve tap in Telegram.
          </p>
          <CodeField id="swap-outside-code" value={code} onChange={setCode} />
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
        <span>
          I checked the receiving address. Blockchain sends can't be undone. Beta testers have no Seeds limit on swap size.
        </span>
      </label>
      <button
        type="button"
        disabled={!agree || mutation.isPending || Boolean(approval) || (outside && code.length !== 6)}
        onClick={() => mutation.mutate(undefined)}
        className="h-10 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {mutation.isPending ? "Re-checking and sending…" : approval ? "Waiting for your tap in Telegram…" : outside ? `Ask Telegram to approve ${props.amount} ${props.from.symbol}` : `Send ${props.amount} ${props.from.symbol}`}
      </button>
      {mutation.error ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
