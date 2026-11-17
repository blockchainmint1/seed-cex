import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiCoinsQuery, aiSeriesQuery } from "@/lib/ai/market";
import { evaluateTheories } from "@/lib/ai/theories";
import { fmtPct, fmtUsd } from "@/lib/ai/series";
import { Chip } from "@/components/ai/ui";

export const Route = createFileRoute("/ai/coin/$id")({
  staticData: { sitemap: false },
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} chart & 10 tested theories — Seeds AI` },
      { name: "description", content: `Full daily price history for ${params.id} and how 10 popular chart theories actually played out.` },
      { property: "og:title", content: `${params.id} — 10 theories tested | Seeds AI` },
      { property: "og:description", content: "Daily price history and real back-tests of popular chart beliefs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoinPage,
});

const RANGES = { "1Y": 365, "3Y": 1095, All: 99999 } as const;

function CoinPage() {
  const { id } = Route.useParams();
  const coins = useQuery(aiCoinsQuery);
  const coin = coins.data?.find((c) => c.id === id);
  const s = useQuery(aiSeriesQuery(id));
  const btc = useQuery(aiSeriesQuery("bitcoin"));
  const [range, setRange] = useState<keyof typeof RANGES>("All");
  const [log, setLog] = useState(true);

  const chart = useMemo(() => {
    if (!s.data) return [];
    const c = s.data.closes; const out = [];
    for (let i = Math.max(0, c.length - RANGES[range]); i < c.length; i++) {
      const avg = (n: number) => (i >= n - 1 ? c.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n : null);
      out.push({ day: s.data.days[i], close: c[i], ma50: avg(50), ma200: avg(200) });
    }
    return out;
  }, [s.data, range]);
  const theories = useMemo(
    () => (s.data && s.data.closes.length > 60 ? evaluateTheories(s.data, id === "bitcoin" ? undefined : btc.data) : []),
    [s.data, btc.data, id],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-14">
      <div>
        <Link to="/ai" className="text-sm text-muted-foreground hover:text-primary">← Seeds AI</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight">
            {coin?.image ? <img src={coin.image} alt="" className="h-8 w-8 rounded-full" /> : null}
            {coin?.name ?? id} <span className="font-mono text-base text-muted-foreground uppercase">{coin?.symbol}</span>
          </h1>
          <div className="flex gap-1">
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => <Chip key={r} on={range === r} onClick={() => setRange(r)}>{r}</Chip>)}
            <Chip on={log} onClick={() => setLog(!log)}>Log scale</Chip>
          </div>
        </div>
      </div>

      <div className="h-80 rounded-sm border border-border bg-surface p-3">
        {s.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading prices…</p> : !chart.length ? <p className="p-4 text-sm text-muted-foreground">No saved prices for this coin yet.</p> : (
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" minTickGap={60} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis scale={log ? "log" : "auto"} domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={70} tickFormatter={(v) => fmtUsd(v)} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
              <Line dataKey="close" name="Close" stroke="var(--chart-2)" dot={false} strokeWidth={1.5} />
              <Line dataKey="ma50" name="50-day avg" stroke="var(--chart-1)" dot={false} strokeWidth={1} />
              <Line dataKey="ma200" name="200-day avg" stroke="var(--chart-3)" dot={false} strokeWidth={1} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {s.data ? <p className="-mt-6 text-xs text-muted-foreground">{s.data.closes.length.toLocaleString()} daily closes, {s.data.days[0]} to {s.data.days.at(-1)}.</p> : null}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-extrabold">10 theories, checked against this coin's history</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each theory is a common chart belief. We find every day it happened, then compare what followed with an ordinary day.
          "Held up" means it beat an ordinary day in both the older and newer half of the history — past patterns can still stop working.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {theories.map((t) => (
            <div key={t.id} className="rounded-sm border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{t.title}</h3>
                <span className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[11px] ${t.verdict === "Held up" ? "bg-bid/15 text-bid" : t.verdict === "Did not hold" ? "bg-ask/15 text-ask" : "bg-muted text-muted-foreground"}`}>{t.verdict}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.idea}</p>
              <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Times seen</dt><dd>{t.occurrences}</dd></div>
                <div><dt className="text-muted-foreground">Avg next {t.horizon}d</dt><dd>{fmtPct(t.avgAfter)} <span className="text-muted-foreground">vs {fmtPct(t.baseline)}</span></dd></div>
                <div><dt className="text-muted-foreground">Up afterwards</dt><dd>{fmtPct(t.hitRate, 0).replace("+", "")} <span className="text-muted-foreground">vs {fmtPct(t.baseHit, 0).replace("+", "")}</span></dd></div>
              </dl>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Not financial advice. <Link to="/risk" className="underline">Risk disclosure</Link>.</p>
      </section>
    </div>
  );
}
