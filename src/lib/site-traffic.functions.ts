import { createServerFn } from "@tanstack/react-start";
import { clampDays, fillDays } from "./site-traffic";

export type TrafficItem = { label: string; value: number };
export type SiteTraffic = {
  days: number;
  totals: { visits: number; pageviews: number; pages: number; countries: number };
  daily: { day: string; visits: number; pageviews: number }[];
  topPages: TrafficItem[];
  sources: TrafficItem[];
  countries: TrafficItem[];
  devices: TrafficItem[];
};

/** Public, totals-only traffic summary for /stats. Reads through summary functions, never rows. */
export const getSiteTraffic = createServerFn({ method: "GET" })
  .inputValidator((input: { days?: number } | undefined) => ({ days: clampDays(input?.days ?? 30) }))
  .handler(async ({ data }): Promise<SiteTraffic> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(process.env.SUPABASE_URL!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const days = data.days;
    const br = (dim: string, limit: number) => sb.rpc("site_stats_breakdown", { _dimension: dim, _days: days, _limit: limit });
    const [totals, daily, pages, sources, countries, devices] = await Promise.all([
      sb.rpc("site_stats_totals", { _days: days }),
      sb.rpc("site_stats_daily", { _days: days }),
      br("path", 10),
      br("referrer_host", 10),
      br("country", 10),
      br("device", 5),
    ]);
    const firstErr = [totals, daily, pages, sources, countries, devices].find((r) => r.error)?.error;
    if (firstErr) {
      console.error("[stats] traffic read failed", firstErr.message);
      throw new Error("Traffic numbers are unavailable right now.");
    }
    const t = ((totals.data as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
    const list = (r: { data: unknown }): TrafficItem[] =>
      (((r.data as unknown[]) ?? []) as { label: unknown; value: unknown }[]).map((x) => ({
        label: String(x.label ?? ""),
        value: Number(x.value ?? 0),
      }));
    return {
      days,
      totals: {
        visits: Number(t?.visitors ?? 0),
        pageviews: Number(t?.pageviews ?? 0),
        pages: Number(t?.pages ?? 0),
        countries: Number(t?.countries ?? 0),
      },
      daily: fillDays(
        (((daily.data as unknown[]) ?? []) as { day: unknown; visitors: unknown; pageviews: unknown }[]).map((d) => ({
          day: String(d.day),
          visits: Number(d.visitors),
          pageviews: Number(d.pageviews),
        })),
        days,
        new Date(),
        (day) => ({ day, visits: 0, pageviews: 0 }),
      ),
      topPages: list(pages),
      sources: list(sources),
      countries: list(countries),
      devices: list(devices),
    };
  });
