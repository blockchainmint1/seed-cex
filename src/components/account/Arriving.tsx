import { fmtCoin } from "@/components/account/use-pocket";

/** Grey "+0.019 arriving" note: coins on their way, not in a block yet, never spendable. */
export function Arriving({ amount, symbol, className = "" }: { amount: number; symbol?: string; className?: string }) {
  if (!(amount > 0)) return null;
  return (
    <span data-qa-mask className={`num block text-xs text-muted-foreground ${className}`} title="On its way — not in a block yet. It can't be traded, swapped or withdrawn until it's confirmed.">
      +{fmtCoin(amount)}{symbol ? ` ${symbol}` : ""} arriving
    </span>
  );
}
