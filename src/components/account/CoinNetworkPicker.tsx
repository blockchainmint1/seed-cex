import { useState } from "react";
import { Search } from "lucide-react";
import { DEPOSIT_ASSETS, type DepositAsset, type DepositNetwork } from "@/lib/account/deposit-options";

/** Step 1 + 2 of deposit/withdraw: choose a coin, then the network it travels on. */
export function CoinNetworkPicker({ asset, net, onAsset, onNetwork, linked, disabledNote }: {
  asset?: DepositAsset;
  net?: DepositNetwork;
  onAsset: (symbol: string) => void;
  onNetwork: (id: string) => void;
  /** Pocket coins the member's link includes; others are dimmed. */
  linked: Set<string>;
  disabledNote?: (n: DepositNetwork) => string | null;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = DEPOSIT_ASSETS.filter((a) => !term || a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term));
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">1</span>Choose a coin</p>
        <label className="relative mb-3 block sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search coins</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins" className="w-full rounded-sm border border-border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {list.map((a) => {
            const on = a.symbol === asset?.symbol;
            const available = a.networks.some((n) => linked.has(n.pocket));
            return (
              <button
                key={a.symbol}
                type="button"
                aria-pressed={on}
                onClick={() => onAsset(a.symbol)}
                className={`rounded-sm border px-3 py-2 text-left transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:border-primary"} ${available ? "" : "opacity-60"}`}
              >
                <span className="block text-sm font-semibold">{a.symbol}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      {asset ? (
        <div>
          <p className="mb-2 text-sm font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">2</span>Choose the network</p>
          <div className="flex flex-wrap gap-2">
            {asset.networks.map((n) => {
              const on = n.id === net?.id;
              const note = disabledNote?.(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onNetwork(n.id)}
                  className={`rounded-sm border px-3 py-2 text-left text-sm transition-colors ${on ? "border-primary bg-primary/10 font-semibold" : "border-border hover:border-primary"}`}
                >
                  {n.label}
                  {note ? <span className="block text-[11px] font-normal text-muted-foreground">{note}</span> : null}
                </button>
              );
            })}
          </div>
          {asset.networks.length > 1 && !net ? <p className="mt-2 text-xs text-muted-foreground">Pick the network you'll send on. Sending on a different network than the one chosen can lose your coins.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
