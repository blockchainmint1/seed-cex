import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { adInitial, adLabel, isExternalLink, safeAdLink, type AdAccent, type ShownAd } from "@/lib/ads/ad-rules";
import { cn } from "@/lib/utils";

/*
 * Sponsored spots. Every placement carries its label ("Sponsored" for paid,
 * "From Seeds" for our own notes), never moves, plays or pops up, and sits
 * away from anything that moves money. Rules: src/lib/ads/ad-rules.ts.
 */

const TILE: Record<AdAccent, string> = {
  green: "bg-action text-action-foreground",
  amber: "bg-warning text-background",
  ivory: "bg-foreground text-background",
  forest: "border border-border bg-muted text-foreground",
};
const GLOW: Record<AdAccent, string> = {
  green: "var(--primary)",
  amber: "var(--warning)",
  ivory: "var(--foreground)",
  forest: "var(--muted-foreground)",
};

/** Only real paid ads are counted (never Seeds' own notes or the admin preview). */
const counted = (ad: ShownAd): boolean => !ad.house && !ad.id.startsWith("preview");

function send(adId: string, kind: "view" | "click") {
  try {
    void fetch("/api/public/ad-event", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adId, kind }),
    }).catch(() => undefined);
  } catch { /* counting is best effort */ }
}

/** Counts a paid ad once per browser tab when at least half of it has been on screen. */
function useAdView<T extends HTMLElement>(ad: ShownAd) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!counted(ad) || !ref.current || typeof IntersectionObserver === "undefined") return;
    const key = `seeds-ad-seen-${ad.id}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* private mode: still count */ }
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      send(ad.id, "view");
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id, ad.house]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** A Seeds page opens in place; an outside site opens in a new tab, marked sponsored. */
function AdLink({ ad, className, children, label }: { ad: ShownAd; className?: string; children: ReactNode; label?: string }) {
  const router = useRouter();
  const href = safeAdLink(ad.link);
  if (!href) return <div className={className}>{children}</div>;
  const external = isExternalLink(href);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (counted(ad)) send(ad.id, "click");
    if (external || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void router.navigate({ href });
  };
  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={label}
      className={className}
      {...(external ? { target: "_blank", rel: ad.house ? "noopener noreferrer" : "sponsored noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function AdChip({ ad, className }: { ad: Pick<ShownAd, "house">; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase", className)}>
      {adLabel(ad)}
    </span>
  );
}

function Tile({ ad, className }: { ad: ShownAd; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-display font-extrabold", TILE[ad.accent], className)}>
      {ad.house ? "S" : adInitial(ad.advertiser)}
    </span>
  );
}

function Cta({ ad }: { ad: ShownAd }) {
  const Icon = isExternalLink(ad.link) ? ArrowUpRight : ArrowRight;
  return <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{ad.cta_label} <Icon className="h-3.5 w-3.5" /></span>;
}

const AboutAds = ({ className }: { className?: string }) => (
  <Link to="/about/ads" className={cn("underline-offset-4 hover:text-primary hover:underline", className)}>How ads work</Link>
);

/* ---------- 1. Homepage spotlight: up to three cards under the stats strip ---------- */

export function SpotlightCard({ ad }: { ad: ShownAd }) {
  const ref = useAdView<HTMLDivElement>(ad);
  return (
    <div ref={ref} className="min-w-0">
      <AdLink ad={ad} className="flex h-full gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60">
        <Tile ad={ad} className="h-10 w-10 text-base" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-[15px] font-bold leading-snug text-foreground">{ad.title}</p>
            <AdChip ad={ad} />
          </div>
          {!ad.house ? <p className="mt-0.5 text-[11px] text-muted-foreground">from {ad.advertiser}</p> : null}
          {ad.body ? <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{ad.body}</p> : null}
          <div className="mt-auto pt-3"><Cta ad={ad} /></div>
        </div>
      </AdLink>
    </div>
  );
}

export function HomeSpotlight({ ads }: { ads: ShownAd[] }) {
  if (!ads.length) return null;
  const anyPaid = ads.some((a) => !a.house);
  return (
    <section aria-label="Spotlight" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Spotlight</p>
          <p className="text-xs text-muted-foreground">{anyPaid ? "Includes paid placements · " : ""}<AboutAds /></p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ads.map((a) => <SpotlightCard key={a.id} ad={a} />)}
        </div>
      </div>
    </section>
  );
}

/* ---------- 2. Markets page: one labelled row above the price table ---------- */

export function MarketsSponsoredRow({ ad, colSpan }: { ad: ShownAd; colSpan: number }) {
  const ref = useAdView<HTMLTableRowElement>(ad);
  return (
    <tr ref={ref} className="bg-primary/[0.06]">
      <td colSpan={colSpan} className="p-0">
        <AdLink ad={ad} className="flex items-center gap-4 px-4 py-3 hover:bg-primary/[0.04]">
          <Tile ad={ad} className="h-9 w-9 text-sm" />
          <div className="min-w-0 sm:w-56">
            <p className="truncate text-sm font-semibold text-foreground">{ad.title}</p>
            <p className="truncate text-xs text-muted-foreground">{ad.advertiser}</p>
          </div>
          <AdChip ad={ad} />
          <p className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground md:block">{ad.body}</p>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase">
            {ad.cta_label} {isExternalLink(ad.link) ? <ArrowUpRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </span>
        </AdLink>
      </td>
    </tr>
  );
}

/* ---------- 3. Coin page side card ---------- */

export function CoinSideCard({ ad }: { ad: ShownAd }) {
  const ref = useAdView<HTMLElement>(ad);
  return (
    <section ref={ref} aria-label={adLabel(ad)} className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold">{ad.house ? "Seeds" : ad.advertiser}</h2>
        <AdChip ad={ad} />
      </div>
      <AdLink ad={ad} className="group mt-3 block">
        <div
          className="grid min-h-[7.5rem] place-items-center rounded-lg border border-border/60 px-4 py-5 text-center"
          style={{ background: `radial-gradient(120% 90% at 80% 0%, color-mix(in oklab, ${GLOW[ad.accent]} 28%, transparent), transparent 65%), var(--card)` }}
        >
          <p className="font-display text-lg font-extrabold leading-tight tracking-tight text-foreground">{ad.title}</p>
        </div>
        {ad.body ? <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{ad.body}</p> : null}
        <div className="mt-2"><Cta ad={ad} /></div>
      </AdLink>
      <p className="mt-3 text-[10px] text-muted-foreground"><AboutAds /></p>
    </section>
  );
}

/* ---------- 4. Sponsored story inside a coin's news list ---------- */

export function CoinStory({ ad }: { ad: ShownAd }) {
  const ref = useAdView<HTMLLIElement>(ad);
  return (
    <li ref={ref} className="border-b border-border/50 bg-primary/[0.05] last:border-b-0">
      <AdLink ad={ad} className="flex gap-3 px-4 py-3 hover:bg-primary/[0.04]">
        <Tile ad={ad} className="mt-0.5 h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AdChip ad={ad} />
            <span className="text-[11px] text-muted-foreground">from {ad.advertiser}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">{ad.title}</p>
          {ad.body ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ad.body}</p> : null}
          <p className="mt-1 text-[10px] text-muted-foreground">Paid for by {ad.advertiser}. Seeds didn't write or check it, and it isn't advice.</p>
        </div>
      </AdLink>
    </li>
  );
}

/* ---------- 5. Slim banner under the coin name ---------- */

export function CoinBanner({ ad }: { ad: ShownAd }) {
  const ref = useAdView<HTMLDivElement>(ad);
  return (
    <div ref={ref} className="mt-4">
      <AdLink ad={ad} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/60">
        <Tile ad={ad} className="h-8 w-8 text-sm" />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold text-foreground">{ad.title}</span>
          {ad.body ? <span className="hidden text-muted-foreground sm:inline"> · {ad.body}</span> : null}
        </p>
        <AdChip ad={ad} className="hidden sm:inline-flex" />
        <span className="shrink-0"><Cta ad={ad} /></span>
      </AdLink>
    </div>
  );
}
