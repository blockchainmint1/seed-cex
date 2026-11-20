import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ExternalLink, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCoinResearch } from "@/lib/markets/coin-research.functions";
import { fromAth, supplyShare, type CoinProfile, type ExchangeRow, type NewsItem } from "@/lib/markets/coin-research";
import { Change } from "@/components/markets/ThorMarketBits";
import { ago, coins, shortDate, usdCompact, usdPrice } from "./format";

export const coinResearchQuery = (slug: string) =>
  queryOptions({
    queryKey: ["coin-research", slug],
    queryFn: () => getCoinResearch({ data: { slug } }),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

export const coinVideosQuery = (slug: string) =>
  queryOptions({
    queryKey: ["coin-videos", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coin_videos")
        .select("id, video_id, title, channel, note, created_at")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

const card = "rounded-sm border border-border bg-surface";
const label = "font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase";

function Row({ k, children, hint }: { k: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right font-mono text-xs text-foreground tabular-nums">
        {children}
        {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** Sidebar card: global market data (CoinMarketCap), CMC-style. */
export function MarketDataCard({ profile, base, loading }: { profile: CoinProfile | null; base: string; loading: boolean }) {
  if (!profile) {
    return (
      <section className={`${card} p-4`}>
        <h2 className="font-display text-sm font-bold">Market data</h2>
        <p className="mt-2 text-xs text-muted-foreground">{loading ? "Loading global market data…" : "Global market data isn't available right now."}</p>
      </section>
    );
  }
  const p = profile;
  const share = supplyShare(p.circulating, p.max);
  const down = fromAth(p.price, p.ath?.price);
  return (
    <section className={`${card} p-4`}>
      <div className="flex items-center gap-2">
        {p.logo ? <img src={p.logo} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 rounded-full" /> : null}
        <h2 className="font-display text-sm font-bold">{p.name} market data</h2>
        {p.rank ? <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Rank #{p.rank}</span> : null}
      </div>
      <dl className="mt-2">
        <Row k="Market cap">{usdCompact(p.marketCap)}</Row>
        <Row k="Fully diluted value">{usdCompact(p.fdv)}</Row>
        <Row k="24h volume (all exchanges)">{usdCompact(p.volume24h)}</Row>
        {p.dominance ? <Row k="Share of all crypto">{p.dominance.toFixed(2)}%</Row> : null}
        <Row k="Circulating supply" hint={share != null ? `${share.toFixed(1)}% of max` : undefined}>{coins(p.circulating, base)}</Row>
        {share != null ? (
          <div className="py-1" aria-hidden>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} /></div>
          </div>
        ) : null}
        <Row k="Max supply">{p.max ? coins(p.max, base) : "No cap"}</Row>
        {p.ath ? <Row k="All-time high" hint={`${shortDate(p.ath.at)}${down != null ? ` · ${down.toFixed(1)}% from high` : ""}`}>{usdPrice(p.ath.price)}</Row> : null}
        {p.atl ? <Row k="All-time low" hint={shortDate(p.atl.at)}>{usdPrice(p.atl.price)}</Row> : null}
      </dl>
      <div className="mt-3 grid grid-cols-5 gap-1 text-center">
        {([["1h", p.change.h1], ["24h", p.change.d1], ["7d", p.change.d7], ["30d", p.change.d30], ["90d", p.change.d90]] as const).map(([k, v]) => (
          <div key={k} className="rounded-sm bg-muted/50 px-1 py-1.5">
            <p className="font-mono text-[9px] text-muted-foreground uppercase">{k}</p>
            <p className="font-mono text-[11px]"><Change pct={v} /></p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Across every exchange, from CoinMarketCap. The price at the top of this page is THORChain's.</p>
    </section>
  );
}

/** Sidebar card: official links and research sites. */
export function LinksCard({ profile, name }: { profile: CoinProfile | null; name: string }) {
  const research = [
    profile?.cmcSlug ? { label: "CoinMarketCap", url: `https://coinmarketcap.com/currencies/${profile.cmcSlug}/` } : null,
    { label: "TradingView", url: `https://www.tradingview.com/symbols/${(profile?.symbol ?? "").toUpperCase()}USD/` },
  ].filter((x): x is { label: string; url: string } => !!x && !!profile);
  const links = [...(profile?.links ?? []), ...research];
  if (!links.length) return null;
  return (
    <section className={`${card} p-4`}>
      <h2 className="font-display text-sm font-bold">{name} links</h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
              {l.label} <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Other people's sites. Seeds doesn't run or check them.</p>
    </section>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {note ? <span className={label}>{note}</span> : null}
    </div>
  );
}

export function AboutPanel({ profile, name }: { profile: CoinProfile | null; name: string }) {
  const [open, setOpen] = useState(false);
  if (!profile?.description) return null;
  const text = profile.description;
  const long = text.length > 520;
  return (
    <section className={card}>
      <SectionHead title={`About ${name}`} note="CoinMarketCap" />
      <div className="px-4 py-4">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{open || !long ? text : `${text.slice(0, 520).replace(/\s+\S*$/, "")}…`}</p>
        {long ? <button onClick={() => setOpen(!open)} className="mt-2 text-xs font-semibold text-primary hover:underline">{open ? "Show less" : "Read more"}</button> : null}
        {profile.tags.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {profile.tags.map((t) => <li key={t} className="rounded-sm bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t}</li>)}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function NewsPanel({ news, name, loading }: { news: NewsItem[]; name: string; loading: boolean }) {
  return (
    <section className={card}>
      <SectionHead title={`${name} news`} note="via CoinMarketCap" />
      {news.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">{loading ? "Loading headlines…" : "No recent headlines right now."}</p>
      ) : (
        <ul>
          {news.map((n) => (
            <li key={n.url} className="border-b border-border/50 last:border-b-0">
              <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="block px-4 py-3 hover:bg-muted/40">
                <p className="text-sm font-semibold text-foreground">{n.title}</p>
                {n.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.summary}</p> : null}
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{n.source} · {ago(n.at)}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Written by other publishers. Seeds doesn't write or check these stories, and none of it is advice.</p>
    </section>
  );
}

export function ExchangesPanel({ pairs, name, loading }: { pairs: ExchangeRow[]; name: string; loading: boolean }) {
  return (
    <section className={card}>
      <SectionHead title={`Where else ${name} trades`} note="Spot markets · CoinMarketCap" />
      {pairs.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">{loading ? "Loading exchanges…" : "Exchange data isn't available right now."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="border-b border-border">
                {["#", "Exchange", "Pair", "Price", "+2% depth", "−2% depth", "24h volume"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={p.exchange} className="border-b border-border/40">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs font-semibold text-foreground">
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-primary">{p.exchange}</a> : p.exchange}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{p.pair}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{usdPrice(p.price)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{usdCompact(p.depthUp)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground">{usdCompact(p.depthDown)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-foreground">{usdCompact(p.volume24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Busiest pair on each exchange. Markets CoinMarketCap flags as unreliable are left out. Depth is the dollars of orders within 2% of the price.</p>
    </section>
  );
}

/** Team-picked videos. The YouTube player only loads when someone presses play (privacy-enhanced mode). */
export function VideosPanel({ slug, name }: { slug: string; name: string }) {
  const q = useQuery(coinVideosQuery(slug));
  const [playing, setPlaying] = useState<string | null>(null);
  const vids = q.data ?? [];
  if (!q.isPending && vids.length === 0) return null;
  return (
    <section className={card}>
      <SectionHead title={`${name} videos`} note="Picked by the Seeds team" />
      {q.isPending ? <p className="px-4 py-6 text-xs text-muted-foreground">Loading videos…</p> : (
        <ul className="grid gap-4 p-4 sm:grid-cols-2">
          {vids.map((v) => (
            <li key={v.id} className="min-w-0">
              <div className="relative aspect-video overflow-hidden rounded-sm bg-muted">
                {playing === v.video_id ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${v.video_id}?autoplay=1&rel=0`}
                    title={v.title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <button onClick={() => setPlaying(v.video_id)} className="group absolute inset-0" aria-label={`Play ${v.title}`}>
                    <img src={`https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-background/20 transition group-hover:bg-background/5">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-action text-action-foreground shadow-lg"><Play className="h-5 w-5 translate-x-0.5" /></span>
                    </span>
                  </button>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{v.title}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{v.channel ?? "YouTube"} · added {ago(v.created_at)}</p>
              {v.note ? <p className="mt-1 text-xs text-muted-foreground">{v.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Other people's opinions, not Seeds' and not advice. Pressing play loads YouTube.</p>
    </section>
  );
}
