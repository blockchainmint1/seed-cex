import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Share2 } from "lucide-react";
import { getMyInvite } from "@/lib/referral.functions";
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
              <p className="text-xs text-muted-foreground">Code: <span className="font-mono">{q.data?.code}</span>. Honest.Money keeps the referral records.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
