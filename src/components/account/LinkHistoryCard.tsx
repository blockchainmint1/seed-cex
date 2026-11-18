import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link2, RefreshCw, Unlink } from "lucide-react";
import { getMyHmeLinkHistory } from "@/lib/hme-link.functions";
import { linkEventTitle, shortWallet, type LinkEvent } from "@/lib/hme-link-history";
import { Card } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { usePocketLink } from "@/components/account/use-pocket";

const PAGE = 10;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const access = (m: LinkEvent["mode"]) => (m === "access" ? "Instant trades" : "Approve every trade");

function Icon({ e }: { e: LinkEvent }) {
  if (e.kind === "linked") return <Link2 className="h-4 w-4 text-primary" aria-hidden />;
  if (e.kind === "updated") return <RefreshCw className="h-4 w-4 text-primary" aria-hidden />;
  return <Unlink className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

function detail(e: LinkEvent): string {
  if (e.kind === "updated") {
    const bits: string[] = [];
    if (e.added.length) bits.push(`Added ${e.added.join(", ")}`);
    if (e.removed.length) bits.push(`Dropped ${e.removed.join(", ")}`);
    if (e.modeBefore) bits.push(`Changed to ${access(e.mode).toLowerCase()}`);
    return bits.length ? `${bits.join(". ")}. Same pocket, no coins moved.` : "Same pocket and coins, no coins moved.";
  }
  if (e.kind === "revoked_seeds") return "You revoked it here. Seeds deleted its trading key.";
  if (e.kind === "revoked_telegram") return "You tapped Revoke in a Seeds Telegram alert. Seeds deleted its trading key.";
  if (e.kind === "revoked_wallet") return "Revoked from your HME Wallet app. Seeds deleted its trading key.";
  if (e.kind === "replaced") return "A newer link took its place. Seeds deleted this link's trading key.";
  if (e.kind === "revoked") return "Seeds deleted its trading key.";
  return e.mode === "access" ? "Seeds can sign trades from this pocket without asking each time." : "You approve every trade in HME Wallet.";
}

/** Account → Security: every time this member's HME Wallet was linked, updated or revoked. */
export function LinkHistoryCard() {
  const load = useServerFn(getMyHmeLinkHistory);
  const link = usePocketLink();
  const key = link.data ? `${link.data.id}` : "none";
  const history = useQuery({ queryKey: ["hme-link-history", key], queryFn: () => load(), enabled: !link.isPending });
  const [showAll, setShowAll] = useState(false);
  const rows = history.data ?? [];
  const shown = showAll ? rows : rows.slice(0, PAGE);

  return (
    <Card title="Wallet link history" desc="Every time your HME Wallet was linked, updated or revoked. Kept permanently, and it can't be edited.">
      {history.isPending || link.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : history.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">Couldn&rsquo;t load your link history. Try again in a minute.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No wallet links yet. When you link your HME Wallet, it shows up here.</p>
      ) : (
        <>
          <ol className="divide-y divide-border">
            {shown.map((e) => (
              <li key={e.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 shrink-0"><Icon e={e} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold">
                      {linkEventTitle(e)}
                      {e.current ? <span className="ml-2 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-primary uppercase">Active now</span> : null}
                    </p>
                    <time dateTime={e.at} className="font-mono text-[11px] text-muted-foreground">{when(e.at)}</time>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail(e)}</p>
                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                    <div className="flex gap-1"><dt>Pocket</dt><dd className="text-foreground">#{e.account}</dd></div>
                    <div className="flex gap-1"><dt>Access</dt><dd className="text-foreground">{access(e.mode)}</dd></div>
                    <div className="flex gap-1"><dt>Wallet</dt><dd className="text-foreground" title={e.wallet}>{shortWallet(e.wallet)}</dd></div>
                    <div className="flex min-w-0 gap-1"><dt>Coins</dt><dd className="min-w-0 break-words text-foreground">{e.coins.length ? e.coins.join(", ") : "—"}</dd></div>
                  </dl>
                </div>
              </li>
            ))}
          </ol>
          {rows.length > PAGE ? (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
