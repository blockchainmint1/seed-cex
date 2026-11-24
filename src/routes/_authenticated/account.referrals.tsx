import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Share2 } from "lucide-react";
import { getMyInvite, getMyReferralStats } from "@/lib/referral.functions";
import type { MyReferralStats } from "@/lib/affiliates";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/referrals")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Invite friends — Seeds" },
      { name: "description", content: "Your personal Seeds invite link and QR code. Friends join Honest.Money through it, so the referral is credited to you." },
      { property: "og:title", content: "Invite friends — Seeds" },
      { property: "og:description", content: "Share your Seeds invite link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsTab,
});

function ReferralsTab() {
  const load = useServerFn(getMyInvite);
  const q = useQuery({ queryKey: ["my-invite"], queryFn: () => load(), staleTime: 3_600_000 });
  const [copied, setCopied] = useState(false);
  const url = q.data?.url;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-5">
      <TabTitle title="Referrals" desc="Share your link. Friends sign up for Honest.Money through it — so it counts as your referral — and land on the Seeds To the Moon class page." />
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Getting your invite link…</p>
      ) : !url ? (
        <Note tone="warn">We couldn't get your referral code from Honest.Money just now. Try again in a minute, or find it on your Honest.Money dashboard.</Note>
      ) : (
        <Card title="Your invite link">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="mx-auto shrink-0 rounded-md bg-accent p-4 text-foreground ring-1 ring-primary/30 sm:mx-0">
              <QRCodeSVG value={url} size={148} bgColor="transparent" fgColor="currentColor" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="break-all rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>
                  {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
                </Button>
                {canShare ? <Button variant="outline" onClick={() => navigator.share({ title: "Join me on Seeds", url }).catch(() => {})}><Share2 /> Share</Button> : null}
              </div>
              <p className="text-xs text-muted-foreground">Code: <span className="font-mono">{q.data?.code}</span>. </p>
            </div>
          </div>
        </Card>
      )}
      {url ? <ReferralResults /> : null}
    </div>
  );
}

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-border bg-background px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ReferralResults() {
  const load = useServerFn(getMyReferralStats);
  const q = useQuery({ queryKey: ["my-referral-stats"], queryFn: () => load(), staleTime: 60_000 });
  const s: MyReferralStats | undefined = q.data;
  return (
    <Card title="What your link brought in" desc="Totals only — we never show who joined or what they hold.">
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Adding up your referrals…</p>
      ) : q.isError || !s ? (
        <Note tone="warn">We couldn't load your referral results just now. Try again in a minute.</Note>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Link clicks" value={n(s.clicksAll)} sub={`${n(s.clicks30d)} in the last 30 days`} />
            <Stat label="New members" value={n(s.signupsAll)} sub={`${n(s.signups30d)} in the last 30 days`} />
            <Stat label="Linked a wallet" value={n(s.setupLinked)} sub={`${n(s.setupDone)} finished the setup guide`} />
            <Stat label="Trading on Seeds" value={n(s.activeMembers)} sub="made at least one trade or swap" />
            <Stat label="Class seats" value={n(s.classSeats)} sub={s.classSeats ? `${usd(s.classUsd)} paid` : "To the Moon seats paid"} />
            <Stat label="Coin listings" value={n(s.listings)} sub={s.listings ? `${usd(s.listingUsd)} paid` : "listings paid"} />
          </div>
          <p className="text-xs text-muted-foreground">
            Seeds' own counts. Class seats and listings count when the buyer used your link or joined Seeds through it. Honest.Money keeps the official referral credit.
          </p>
        </div>
      )}
    </Card>
  );
}
