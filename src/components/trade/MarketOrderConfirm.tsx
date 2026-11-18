import { AlertTriangle, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { MarketEstimate, MarketNote } from "@/lib/market-order";
import { fmtAmount } from "@/lib/format";

/**
 * "Here's what's likely to happen" popup shown before every market order, so
 * nobody is surprised by the price they get or a part fill.
 */
export function MarketOrderConfirm({
  open,
  onOpenChange,
  estimate,
  notes,
  canPlace,
  base,
  quote,
  slippagePct,
  px,
  onConfirm,
  onUseLimit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimate: MarketEstimate;
  notes: MarketNote[];
  canPlace: boolean;
  base: string;
  quote: string;
  slippagePct: number;
  px: (n: number) => string;
  onConfirm: () => void;
  onUseLimit: () => void;
}) {
  const buying = estimate.side === "buy";
  const verb = buying ? "buy" : "sell";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {canPlace ? `Before you ${verb} at market` : `A market ${verb} can't fill right now`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {canPlace
              ? "A market order trades right away at the best prices other members are offering. Here's what's likely to happen."
              : "There's nothing on the other side of the order book to trade against."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {canPlace ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm">
              <dt className="text-muted-foreground">You {verb} about</dt>
              <dd className="num text-right font-semibold text-foreground">
                {fmtAmount(estimate.filled, 4)} {base}
              </dd>
              <dt className="text-muted-foreground">Average price</dt>
              <dd className="num text-right text-foreground">
                {estimate.avgPrice != null ? px(estimate.avgPrice) : "—"} {quote}
              </dd>
              <dt className="text-muted-foreground">{buying ? "You pay about" : "You get about"}</dt>
              <dd className="num text-right font-semibold text-foreground">
                {fmtAmount(estimate.total, 4)} {quote}
              </dd>
              <dt className="text-muted-foreground">{buying ? "Never more than" : "Never less than"}</dt>
              <dd className="num text-right text-foreground">
                {estimate.limitPrice != null ? px(estimate.limitPrice) : "—"} {quote} each
              </dd>
            </dl>

            {notes.length > 0 ? (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.text}
                    className="flex gap-2 rounded-md border border-warn/50 bg-warn/10 p-3 text-sm text-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Prices can move in the moment between now and when your order lands. Your price
                  protection is {slippagePct}%: Seeds won't {buying ? "pay more" : "accept less"} than{" "}
                  {estimate.limitPrice != null ? px(estimate.limitPrice) : "—"} {quote} per {base}. Anything
                  that can't fill at that price or better is cancelled. Nothing is left waiting on the book.
                </span>
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Once matched, the trade settles wallet to wallet on the blockchain. That can take a few
                  minutes; you can follow it under "Your escrows". If either side's coins aren't ready,
                  the trade is cancelled and nothing is sent.
                </span>
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>Seeds charges no trading fee. The blockchain's own small network fee still applies.</span>
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>These numbers come from the order book a few seconds ago. Once it fills, it can't be undone.</span>
              </li>
            </ul>
          </>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.text} className="flex gap-2 rounded-md border border-warn/50 bg-warn/10 p-3 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          {canPlace ? (
            <AlertDialogAction
              onClick={onConfirm}
              className={buying ? "bg-bid text-background hover:bg-bid/90" : "bg-ask text-background hover:bg-ask/90"}
            >
              Yes, {verb} {base} at market
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={onUseLimit}>Use a limit order instead</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
