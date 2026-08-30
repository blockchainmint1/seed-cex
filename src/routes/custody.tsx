import { createFileRoute, Link } from "@tanstack/react-router";
import { getCustodySnapshot } from "@/lib/custody.functions";
import { getNodeStatus } from "@/lib/rpc.functions";

export const Route = createFileRoute("/custody")({
  head: () => ({
    meta: [
      { title: "Custody Ledger — How Many Keys Seeds Holds" },
      {
        name: "description",
        content:
          "A live count of delegated trading keys Seeds holds, the next expiry, and an hourly log of keys wiped when their timer ran out.",
      },
      { property: "og:title", content: "Custody Ledger — How Many Keys Seeds Holds" },
      {
        property: "og:description",
        content: "Expiring keys, wiped on schedule. A public count of exactly what Seeds holds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({
    custody: await getCustodySnapshot(),
    nodes: await getNodeStatus(),
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl px-5 py-16 font-mono text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-5 py-16 text-muted-foreground">Not found.</div>
  ),
  component: Custody,
});

type NodeCard = {
  chain: string;
  label: string;
  online: boolean;
  synced: boolean;
  blocks: number | null;
  connections: number | null;
  mempoolCount: number | null;
  version: string | null;
};


function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Custody() {
  const { custody: data, nodes } = Route.useLoaderData();

  const stats = [
    { label: "Keys held right now", value: String(data.keysHeld) },
    { label: "Next automatic wipe", value: fmt(data.nextExpiry) },
    { label: "Last sweep", value: fmt(data.lastSweep) },
    { label: "Wiped in last sweep", value: String(data.lastWiped) },
  ];


  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
        Custody ledger
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] font-black tracking-tight text-foreground uppercase">
        Every key we hold
        <br />
        <span className="text-primary">has a timer on it.</span>
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted-foreground">
        When you share your trading branch, you set an expiry. At that moment the encrypted key is
        deleted outright — not flagged, not archived. A sweep runs every hour and writes the
        surviving count to a public log, so the number below is the whole of what Seeds can sign
        with. Your savings branch is never shared and never appears here.
      </p>

      <dl className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface px-5 py-6">
            <dt className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              {s.label}
            </dt>
            <dd className="mt-2 font-display text-2xl font-bold text-foreground tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-14 font-display text-lg font-bold tracking-tight text-foreground uppercase">
        Nodes we run
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Seeds settles against its own full nodes — no third-party API sits between your order and
        the chain. Live tip height, peer count and mempool below.
      </p>
      <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {(nodes as NodeCard[]).map((n) => (
          <div key={n.chain} className="space-y-3 bg-surface px-5 py-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold tracking-tight text-foreground uppercase">
                {n.label}
              </span>
              <span
                className={`flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${
                  n.online ? "text-primary" : "text-destructive"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    n.online ? "bg-primary" : "bg-destructive"
                  }`}
                />
                {n.online ? (n.synced ? "synced" : "syncing") : "offline"}
              </span>
            </div>
            <dl className="space-y-1.5 font-mono text-xs">
              {[
                ["Tip", n.blocks !== null ? `#${n.blocks.toLocaleString()}` : "—"],
                ["Peers", n.connections !== null ? String(n.connections) : "—"],
                [
                  "Mempool",
                  n.mempoolCount !== null ? `${n.mempoolCount} tx` : "—",
                ],
                ["Client", n.version ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right tabular-nums text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>



      <h2 className="mt-14 font-display text-lg font-bold tracking-tight text-foreground uppercase">
        Sweep log
      </h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full font-mono text-xs">
          <thead className="bg-surface text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-normal tracking-wider uppercase">Timestamp</th>
              <th className="px-4 py-3 text-right font-normal tracking-wider uppercase">Held</th>
              <th className="px-4 py-3 text-right font-normal tracking-wider uppercase">Wiped</th>
            </tr>
          </thead>
          <tbody>
            {data.history.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  No sweeps recorded yet.
                </td>
              </tr>
            ) : (
              data.history.map((h: { takenAt: string; keysHeld: number; keysWiped: number }) => (
                <tr key={h.takenAt} className="border-t border-border/60">
                  <td className="px-4 py-3 text-muted-foreground">{fmt(h.takenAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{h.keysHeld}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-primary">{h.keysWiped}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Want none of this? Revoke on the{" "}
        <Link to="/wallet" className="text-primary underline-offset-4 hover:underline">
          wallet page
        </Link>{" "}
        — revocation deletes the ciphertext immediately rather than waiting for the timer.
      </p>
    </div>
  );
}
