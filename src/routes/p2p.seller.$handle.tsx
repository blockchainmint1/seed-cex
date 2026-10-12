import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { getSellerProfile } from "@/lib/p2p.functions";
import { ScorePill, mins } from "@/components/p2p/SellerBadge";
import { STATUS_LABEL } from "@/lib/p2p-config";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/p2p/seller/$handle")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.handle} — Seeds P2P seller profile` },
      { name: "description", content: `Trust score, verified trades, feedback and offers for ${params.handle} on the Seeds P2P marketplace.` },
      { property: "og:title", content: `${params.handle} — Seeds P2P seller` },
      { property: "og:description", content: `Trust score, verified trades and feedback for ${params.handle}.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellerPage,
});

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}

function SellerPage() {
  const { handle } = Route.useParams();
  const fetch = useServerFn(getSellerProfile);
  const q = useQuery({ queryKey: ["p2p-seller", handle], queryFn: () => fetch({ data: { handle } }) });
  if (q.isLoading) return <main className="mx-auto max-w-7xl px-5 py-10 text-muted-foreground">Loading…</main>;
  const p = q.data;
  if (!p) return <main className="mx-auto max-w-7xl px-5 py-10">No seller called {handle}. <Link to="/p2p" className="text-primary">Back to market</Link></main>;
  const s = p.stats;
  const fb = s.positive + s.negative;
  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <Link to="/p2p" className="font-mono text-xs text-muted-foreground hover:text-primary">← Marketplace</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold">{p.handle}</h1>
        <ScorePill score={s.score} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Seller since {new Date(p.since).toLocaleDateString()} {p.location ? `· ${p.location}` : ""}{" "}
        {p.languages.length ? `· ${p.languages.join(", ")}` : ""} {p.hours ? `· ${p.hours}` : ""}
      </p>
      {p.bio ? <p className="mt-4 max-w-2xl whitespace-pre-line">{p.bio}</p> : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Trust score" value={`${s.score}/100`} />
        <Stat label="Verified trades" value={s.trades} />
        <Stat label="Completion" value={`${Math.round(s.completionRate * 100)}%`} />
        <Stat label="Feedback" value={fb ? `${Math.round((s.positive / fb) * 100)}% 👍 (${fb})` : "—"} />
        <Stat label="Avg release" value={mins(s.avgReleaseMin)} />
        <Stat label="Avg response" value={mins(s.avgResponseMin)} />
        <Stat label="Volume" value={`$${Math.round(s.volumeUsd).toLocaleString()}`} />
        <Stat label="Fund flags" value={<span className={s.flags ? "text-destructive" : ""}>{s.flags}</span>} />
      </div>

      <h2 className="mt-10 mb-3 font-display text-sm font-bold tracking-widest uppercase">Live offers</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {p.offers.length === 0 ? <p className="text-sm text-muted-foreground">No live offers.</p> : null}
        {p.offers.map((o) => (
          <div key={o.id} className="rounded-sm border border-border bg-surface p-4">
            <div className="flex justify-between font-mono">
              <span className="text-lg">{o.asset} @ ${o.price.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">fee {Number(o.fee_pct)}%</span>
            </div>
            <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-primary">
              <BadgeCheck className="h-3 w-3" /> {o.verified_balance} {o.asset} verified in trading pocket
            </div>
            <div className="mt-2 text-xs text-muted-foreground">${Number(o.min_fiat)}–${Number(o.max_fiat)} · {o.payment_methods.join(", ")}</div>
          </div>
        ))}
      </div>
      <Link to="/p2p" className="mt-3 inline-block text-sm text-primary">Buy from {p.handle} on the marketplace →</Link>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-sm font-bold tracking-widest uppercase">Feedback</h2>
          {p.feedback.length === 0 ? <p className="text-sm text-muted-foreground">No feedback yet.</p> : null}
          <ul className="space-y-2">
            {p.feedback.map((f, i) => (
              <li key={i} className="rounded-sm border border-border bg-surface p-3 text-sm">
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  {f.positive ? <ThumbsUp className="h-3 w-3 text-primary" /> : <ThumbsDown className="h-3 w-3 text-destructive" />}
                  {f.by} · {fmtAgo(f.at)}
                </div>
                {f.comment ? <p className="mt-1">{f.comment}</p> : null}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 font-display text-sm font-bold tracking-widest uppercase">Trade history</h2>
          <table className="w-full font-mono text-xs">
            <tbody>
              {p.history.map((h, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2">{fmtAgo(h.at)}</td>
                  <td>{h.asset}</td>
                  <td>~${h.fiat}</td>
                  <td className="text-muted-foreground">{h.method}</td>
                  <td className={h.status === "released" ? "text-primary" : "text-muted-foreground"}>
                    {STATUS_LABEL[h.status]} {h.releaseMin !== null ? `· ${mins(h.releaseMin)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.history.length === 0 ? <p className="text-sm text-muted-foreground">No finished trades yet.</p> : null}
        </section>
      </div>
    </main>
  );
}
