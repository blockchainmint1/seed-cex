import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { searchCoinList } from "@/lib/markets/coin-search.functions";

/** Search box: types into `onChange` (e.g. to filter a table) and lists any matching coin to research. */
export function CoinSearch({ value, onChange, placeholder = "Search any coin — e.g. Hyperliquid, BTC, Solana" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [q, setQ] = useState(value.trim());
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setQ(value.trim()), 250); return () => clearTimeout(t); }, [value]);
  const r = useQuery({
    queryKey: ["coin-search", q.toLowerCase()],
    queryFn: () => searchCoinList({ data: { q } }),
    enabled: q.length >= 1,
    staleTime: 10 * 60_000,
  });
  const results = r.data ?? [];
  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label="Search coins"
        className="w-full rounded-sm border border-border bg-surface py-2.5 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      {open && q.length >= 1 ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-lg">
          <p className="border-b border-border px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Research a coin</p>
          {r.isLoading ? <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p> : null}
          {!r.isLoading && !results.length ? <p className="px-3 py-3 text-sm text-muted-foreground">No coins match "{q}".</p> : null}
          <ul className="max-h-80 overflow-y-auto">
            {results.map((c) => (
              <li key={c.id}>
                <Link to="/research/$id" params={{ id: String(c.id) }} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-surface">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-foreground">{c.name}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{c.symbol}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {c.onSeeds ? <span className="mr-2 rounded-sm border border-primary px-1.5 py-0.5 text-primary">On Seeds</span> : null}
                    {c.rank ? `#${c.rank}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
