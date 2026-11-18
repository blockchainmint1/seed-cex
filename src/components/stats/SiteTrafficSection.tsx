import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getSiteTraffic, type TrafficItem } from "@/lib/site-traffic.functions";
import { TRAFFIC_RANGES, sourceLabel } from "@/lib/site-traffic";

const nf = (n: number) => n.toLocaleString("en-US");

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
const countryLabel = (c: string) => (c ? (countryNames?.of(c) ?? c) : "Unknown");
const deviceLabel = (d: string) => (d ? d[0].toUpperCase() + d.slice(1) : "Unknown");
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function BarList({ title, items, label }: { title: string; items: TrafficItem[]; label?: (s: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="rounded-sm border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{title}</h3>
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Visits</span>
      </div>
      <ul className="mt-4 space-y-1.5">
        {items.length === 0 && <li className="text-sm text-muted-foreground">No visits counted yet.</li>}
        {items.map((i) => (
          <li key={i.label || "none"} className="relative overflow-hidden rounded-sm">
            <div className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${(i.value / max) * 100}%` }} aria-hidden />
            <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{label ? label(i.label) : i.label}</span>
              <span className="font-semibold tabular-nums">{nf(i.value)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DailyChart({ data }: { data: { day: string; visits: number; pageviews: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.pageviews));
  return (
    <div className="rounded-sm border border-border bg-surface p-5">
      <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Daily traffic (Texas time)</h3>
      {data.every((d) => d.pageviews === 0) ? (
        <p className="mt-4 text-sm text-muted-foreground">No visits counted yet in this period.</p>
      ) : (
        <>
          <div className="mt-6 flex h-48 items-end gap-[3px]" role="img" aria-label={`Daily visits and page views over ${data.length} days`}>
            {data.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${shortDay(d.day)}: ${nf(d.visits)} visits · ${nf(d.pageviews)} page views`}>
                <div className="relative w-full rounded-t-sm bg-primary/25" style={{ height: d.pageviews ? `${Math.max(2, (d.pageviews / max) * 100)}%` : "0%" }}>
                  <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-primary" style={{ height: `${d.pageviews ? (d.visits / d.pageviews) * 100 : 0}%` }} />
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-background px-2 py-1 text-xs shadow-sm group-hover:block">
                  {shortDay(d.day)}: {nf(d.visits)} visits · {nf(d.pageviews)} views
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{shortDay(data[0].day)}</span>
            <span>{shortDay(data[data.length - 1].day)}</span>
          </div>
        </>
      )}
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-primary" /> Visits</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-primary/25" /> Page views</span>
      </div>
    </div>
  );
}

export function SiteTrafficSection() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["site-traffic", days],
    queryFn: () => getSiteTraffic({ data: { days } }),
    refetchInterval: 60_000,
  });
  const t = data?.totals;
  const show = (v: number | undefined) => (isLoading || v == null ? "—" : nf(v));

  return (
    <section aria-labelledby="traffic-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Open books</p>
          <h2 id="traffic-heading" className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Website traffic</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every visit to seeds.honest.money, counted in the open by Seeds itself. Anonymous counts only: no
            cookies, no IP addresses, no names.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Time period">
          {TRAFFIC_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors ${
                days === d ? "border-primary bg-action text-action-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <p role="alert" className="rounded-sm border border-border bg-surface p-5 text-sm text-muted-foreground">
          Traffic numbers are unavailable right now. Try again in a minute.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Visits", value: t?.visits, hint: "Browser visits, not people" },
              { label: "Page views", value: t?.pageviews, hint: "Pages opened" },
              { label: "Pages viewed", value: t?.pages, hint: "Different pages" },
              { label: "Countries", value: t?.countries, hint: "Where visits came from" },
            ].map((s) => (
              <div key={s.label} className="rounded-sm border border-border bg-surface p-5">
                <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{s.label}</p>
                <p className="mt-2 font-display text-2xl font-bold tabular-nums">{show(s.value)}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{s.hint}</p>
              </div>
            ))}
          </div>
          <DailyChart data={data?.daily ?? []} />
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Traffic sources" items={data?.sources ?? []} label={sourceLabel} />
            <BarList title="Top pages" items={data?.topPages ?? []} />
            <BarList title="Countries" items={data?.countries ?? []} label={countryLabel} />
            <BarList title="Devices" items={data?.devices ?? []} label={deviceLabel} />
          </div>
        </>
      )}
      <p className="font-mono text-xs text-muted-foreground">
        Updates every minute. A visit lasts until the browser tab is closed. Bots and the test site aren&rsquo;t counted,
        and the count starts from the day this counter went live.
      </p>
    </section>
  );
}
