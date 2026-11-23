import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarDays, Check, Copy, Mail, Video } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getIgniteConfirmation } from "@/lib/ignite.functions";
import { RECORDING_NOTE, paidInLabel, inviteLabel } from "@/lib/ignite-registration";

export const Route = createFileRoute("/ignite_/confirmed")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Your Ignite seat is reserved — Seeds" },
      { name: "description", content: "Confirmation for your Seeds Ignite class seat: dates, next steps and your referral link." },
      { property: "og:title", content: "Your Ignite seat is reserved — Seeds" },
      { property: "og:description", content: "Confirmation for your Seeds Ignite class seat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ConfirmedPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ignite-theme seed-lines min-h-screen">
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-10 lg:pt-16">
        <div className="max-w-3xl">{children}</div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8 ${className}`}>{children}</div>;
}

function ConfirmedPage() {
  const { user, loading } = useSession();
  const fetchIt = useServerFn(getIgniteConfirmation);
  const q = useQuery({
    queryKey: ["ignite-confirmation", user?.id],
    queryFn: () => fetchIt(),
    enabled: !!user,
    refetchInterval: (query) => (query.state.data?.state === "pending" ? 8000 : false),
  });

  if (loading || (user && q.isPending)) return <Shell><Card><p className="text-sm text-muted-foreground">Checking your seat…</p></Card></Shell>;

  if (!user) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-3xl">Sign in to see your seat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your Ignite confirmation is tied to your Honest.Money account.</p>
          <Link to="/auth" search={{ redirect: "/ignite/confirmed" }} className="seed-btn mt-6 inline-flex justify-center">Sign in with Honest.Money</Link>
        </Card>
      </Shell>
    );
  }

  if (q.isError || !q.data) {
    return <Shell><Card><h1 className="font-display text-3xl">We couldn't load your seat</h1><p className="mt-2 text-sm text-muted-foreground">Refresh in a moment. If you paid, your payment is safe — nothing is lost.</p><button type="button" className="seed-btn mt-6" onClick={() => q.refetch()}>Try again</button></Card></Shell>;
  }
  const d = q.data;

  if (d.state === "none" || d.state === "expired") {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-3xl">{d.state === "none" ? "You haven't reserved a seat yet" : "Your checkout closed before payment arrived"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{d.state === "expired" ? "No money was taken. You can start a fresh checkout any time." : "See the upcoming classes and pick the one that suits you."}</p>
          {d.cls && d.state === "expired"
            ? <Link to="/ignite/$slug" params={{ slug: d.cls.slug }} hash="reserve" className="seed-btn mt-6 inline-flex justify-center">Back to {d.cls.name}</Link>
            : <Link to="/ignite" className="seed-btn mt-6 inline-flex justify-center">See upcoming classes</Link>}
        </Card>
      </Shell>
    );
  }

  if (d.state === "underpaid") {
    return (
      <Shell>
        <Card>
          <p className="text-xs font-bold tracking-[0.25em] text-warning">PAYMENT ARRIVED SHORT</p>
          <h1 className="mt-3 font-display text-3xl">We received less than your seat costs</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please don't pay again. Email <a className="font-semibold text-primary underline-offset-4 hover:underline" href="mailto:support@honest.money">support@honest.money</a> and we'll sort it out with you.</p>
        </Card>
      </Shell>
    );
  }

  if (d.state === "pending") {
    return (
      <Shell>
        <Card>
          <div className="flex items-center gap-3">
            <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-3 rounded-full bg-primary" /></span>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">CONFIRMING YOUR PAYMENT</p>
          </div>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl">Thanks, {d.firstName}. Hang tight.</h1>
          <p className="mt-3 text-muted-foreground">Crypto payments take a few minutes to confirm on the blockchain. This page checks with NectarPay every few seconds and will update by itself — you can leave it open.</p>
          <p className="mt-4 text-sm text-muted-foreground">Closing the page is fine too. We'll email you the moment your seat is confirmed.</p>
        </Card>
      </Shell>
    );
  }

  const paidWith = paidInLabel(d.paidAsset, d.paidChain);
  return (
    <Shell>
      <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">SEAT RESERVED</p>
      <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">Thank you, {d.firstName}. You're in.</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Your seat in {d.cls ? `Ignite: ${d.cls.name}` : "Ignite"} is reserved{d.paidBy ? ` — ${d.paidBy} paid for it through Peer Pay` : ""}. We can't wait to see you in class.
      </p>

      <Card className="mt-10">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-5" aria-hidden /></span>
          <div>
            <h2 className="font-display text-2xl">Your seat is reserved</h2>
            <p className="mt-1 text-sm text-muted-foreground">Payment confirmed{paidWith ? ` (${paidWith})` : ""}.</p>
          </div>
        </div>
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border text-sm">
          {d.cls && <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">Class</dt><dd className="text-right font-semibold">{d.cls.name}</dd></div>}
          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">Dates</dt><dd className="text-right font-semibold">{d.cls?.dates ?? "To be announced"}</dd></div>
          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">Sessions</dt><dd className="text-right">{d.cls?.sessions ?? "—"}</dd></div>
          {d.cls?.time && <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">Time</dt><dd className="text-right">{d.cls.time}</dd></div>}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{RECORDING_NOTE}</p>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <Mail className="size-5 text-primary" aria-hidden />
          <h2 className="mt-3 font-display text-xl">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your confirmation is on its way to <span className="font-semibold text-foreground">{d.email}</span>. Not there in a few minutes? Check spam or promotions.</p>
        </Card>
        <Card>
          <Video className="size-5 text-primary" aria-hidden />
          <h2 className="mt-3 font-display text-xl">Connection info is coming</h2>
          <p className="mt-2 text-sm text-muted-foreground">We'll email you how to join the live sessions well before your first session.</p>
        </Card>
      </div>

      <ReferralCard url={d.referralUrl ?? null} />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/" className="seed-btn-ghost inline-flex w-auto justify-center px-6">Explore Seeds</Link>
        {d.cls
          ? <Link to="/ignite/$slug" params={{ slug: d.cls.slug }} className="seed-btn-ghost inline-flex w-auto justify-center px-6"><CalendarDays className="mr-2 size-4" aria-hidden />Class details</Link>
          : <Link to="/ignite" className="seed-btn-ghost inline-flex w-auto justify-center px-6"><CalendarDays className="mr-2 size-4" aria-hidden />Class details</Link>}
      </div>
    </Shell>
  );
}

function ReferralCard({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!url) {
    return (
      <Card className="mt-4">
        <h2 className="font-display text-xl">Invite another miner</h2>
        <p className="mt-2 text-sm text-muted-foreground">Referral links are for existing Honest.Money miners. Yours isn't available right now — check back later, or find your link on your Honest.Money dashboard.</p>
      </Card>
    );
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  return (
    <Card className="mt-4 border-primary/40">
      <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">BRING SOMEONE WITH YOU</p>
      <h2 className="mt-2 font-display text-2xl">Your referral link</h2>
      <p className="mt-2 text-sm text-muted-foreground">Know another Honest.Money miner who should be in the room? Share your personal link. They'll sign in with their own Honest.Money account to reserve, and the referral is credited to you through Honest.Money.</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {/* Plain text (not an input) so the whole link wraps and stays readable on phones. */}
        <p id="ref-link" aria-label="Your referral link" className="seed-field flex min-h-11 min-w-0 flex-1 select-all items-center break-words font-mono text-xs">
          <span className="min-w-0">
            {inviteLabel(url).split("/").map((part, i, all) => (
              <span key={i}>{i > 0 ? "/" : ""}{i > 0 && i === all.length - 1 ? <wbr /> : null}{part}</span>
            ))}
          </span>
        </p>
        <button type="button" onClick={copy} className="seed-btn inline-flex w-full items-center justify-center gap-2 sm:w-auto sm:px-6" aria-live="polite">
          {copied ? <><Check className="size-4" aria-hidden />Copied</> : <><Copy className="size-4" aria-hidden />Copy link</>}
        </button>
      </div>
    </Card>
  );
}
