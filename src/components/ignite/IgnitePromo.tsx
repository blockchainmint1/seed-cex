import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteLogo } from "@/components/site/SiteLogo";
import { useSession } from "@/hooks/use-session";
import { getIgniteSeats, getMyIgnite } from "@/lib/ignite.functions";
import { shouldShowIgnitePromo } from "@/lib/ignite-registration";
import art from "@/assets/ignite-glow-art.jpg.asset.json";

const DISMISS_KEY = "seeds-ignite-promo-dismissed-at";
const OPEN_DELAY_MS = 1200;

function readDismissed(): number | null {
  try {
    const n = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Homepage popup for the Ignite class (modelled on the supplied Ignite flyer).
 * Opens shortly after the page loads, at most once every 3 days, and never
 * once the class starts, when seats are gone, or for someone already paid.
 */
export function IgnitePromo() {
  const { user } = useSession();
  const fetchSeats = useServerFn(getIgniteSeats);
  const fetchMine = useServerFn(getMyIgnite);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const seats = useQuery({ queryKey: ["ignite-seats"], queryFn: () => fetchSeats(), enabled: ready });
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: ready && !!user });
  const next = seats.data?.next ?? null;

  useEffect(() => {
    setDismissedAt(readDismissed());
    const t = window.setTimeout(() => setReady(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // No open class → behave as "no seats" so the popup stays shut.
  const seatsLeft = seats.data ? (next ? seats.data.seatsLeft : 0) : null;
  const decided = ready && seats.isFetched && (!user || mine.isFetched);
  useEffect(() => {
    if (!decided) return;
    if (shouldShowIgnitePromo({ now: Date.now(), dismissedAt, seatsLeft, myStatus: mine.data?.registration?.status ?? null })) setOpen(true);
    // Decide once per visit; later refetches never pop it open again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided]);

  const snooze = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
  };
  const onOpenChange = (v: boolean) => {
    if (!v) snooze();
    setOpen(v);
  };

  const capacity = seats.data?.capacity ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panel}
        // Focus the panel itself so no button wears a focus ring on open; Tab still reaches every control.
        onOpenAutoFocus={(e) => { e.preventDefault(); panel.current?.focus(); }}
        className="dark ignite-promo focus:outline-none max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-[940px] gap-0 overflow-y-auto overflow-x-hidden rounded-3xl border-primary/30 bg-background p-0 text-foreground shadow-promo sm:rounded-3xl">
        {/* Glow artwork from the Ignite flyer, faded into the panel colour. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 md:inset-y-0 md:left-auto md:h-auto md:w-[52%]">
          <img src={art.url} alt="" width={535} height={448} className="h-full w-full object-cover object-center opacity-70 md:opacity-100" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10 md:bg-gradient-to-r md:from-background md:via-background/40 md:to-transparent" />
          <div className="absolute inset-0 hidden bg-gradient-to-t from-background via-transparent to-transparent md:block" />
        </div>

        <div className="relative px-6 pb-7 pt-7 sm:px-10 sm:pb-9 sm:pt-9">
          <SiteLogo className="h-8 sm:h-9" />

          <p className="mt-8 font-mono text-xs font-semibold tracking-[0.32em] text-foreground/90 sm:text-sm">SEEDS TO THE MOON</p>
          <DialogTitle className="mt-2 font-display leading-none tracking-normal">
            <span className="block text-[4.25rem] font-extrabold leading-[0.9] tracking-[-0.03em] sm:text-[6.5rem]">{(next?.name ?? "To the Moon").toUpperCase()}</span>
            <span className="mt-2 block text-3xl font-semibold tracking-[-0.02em] sm:text-[2.75rem]">Crypto Trading Class</span>
          </DialogTitle>
          <DialogDescription className="mt-3 text-base italic text-primary sm:text-lg">
            Meet our new non-custodial crypto exchange.
          </DialogDescription>

          <dl className="mt-7 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0">
            {[
              ["Dates", next ? `${next.name} · ${next.dates}` : ""],
              ["Format", next?.format ?? ""],
              ["Time", next?.time ?? "Times vary by day"],
            ].map(([k, v], i) => (
              <div key={k} className={`border-l-2 border-action/70 pl-4 sm:pr-4 ${i === 0 ? "sm:border-l-0 sm:pl-0" : ""}`}>
                <dt className="sr-only">{k}</dt>
                <dd className="text-base font-bold leading-snug sm:text-lg">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border-2 border-action px-4 py-2 text-sm font-bold">
                {seatsLeft != null ? `${seatsLeft} of ${capacity} seats left` : "Limited seats"}
              </span>
              <span className="text-sm font-semibold sm:text-base">{next?.price}{next?.minersFree ? " · free for HME miners" : ""}</span>
            </div>
            <Link
              to="/to-the-moon/$slug"
              params={{ slug: next?.slug ?? "" }}
              hash="reserve"
              onClick={() => { snooze(); setOpen(false); }}
              className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-action px-8 text-base font-extrabold italic tracking-wide text-action-foreground shadow-promo-btn transition-[filter,transform] hover:brightness-110 active:scale-[0.98] md:ml-auto"
            >
              RESERVE YOUR SPOT
              <ArrowRight aria-hidden className="size-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-foreground/10 pt-5 text-sm text-foreground/85 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <span>Led by <span className="font-semibold text-foreground">{next?.instructorName ?? "Bobby Gray"}</span></span>
            <span aria-hidden className="hidden h-4 w-px bg-action/60 sm:block" />
            <span>Powered by the <a href="https://honest.money" target="_blank" rel="noreferrer" className="font-semibold text-foreground underline-offset-4 hover:underline">Honest Money Ecosystem</a></span>
            <span aria-hidden className="hidden h-4 w-px bg-action/60 sm:block" />
            <span className="italic text-foreground/70">Sessions will be recorded.</span>
            <button type="button" onClick={() => onOpenChange(false)} className="self-start text-left text-foreground/70 underline-offset-4 hover:text-foreground hover:underline sm:ml-auto">
              Maybe later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
