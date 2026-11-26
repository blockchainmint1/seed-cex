import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Check, Copy, RefreshCw } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getMyInvite } from "@/lib/referral.functions";
import { Button } from "@/components/ui/button";

export function InfluencerInvite() {
  const { user, loading } = useSession();
  const load = useServerFn(getMyInvite);
  const query = useQuery({ queryKey: ["my-invite", user?.id], queryFn: () => load(), enabled: !!user, staleTime: 3_600_000 });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const url = query.data?.url;
  return (
    <section id="your-link" className="scroll-mt-24 border-y border-border py-10">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
        <div><p className="text-xs font-mono text-primary uppercase">Your community starts here</p><h2 className="mt-2 text-2xl font-bold">Your affiliate link. Right here.</h2><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">One personal Seeds invite link, backed by Honest.Money referral credit. New visitors join Honest.Money and arrive at To the Moon.</p></div>
        <div className="min-w-0">
          {loading ? <p className="text-sm text-muted-foreground">Checking your account…</p> : !user ? <Button asChild size="lg"><Link to="/auth" search={{ redirect: "/influencers#your-link" }}>Sign in for your invite link <ArrowUpRight /></Link></Button> : query.isPending ? <p className="text-sm text-muted-foreground">Getting your invite link…</p> : url ? <>
            <div className="flex min-w-0 items-center gap-3 border border-border rounded-sm bg-surface px-4 py-3"><span className="min-w-0 flex-1 break-all font-mono text-sm">{url}</span><Button size="icon" variant="outline" aria-label={copied ? "Invite link copied" : "Copy affiliate link"} title="Copy affiliate link" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 2000); } catch { setCopyError(true); } }}>{copied ? <Check /> : <Copy />}</Button></div>
            <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">{copyError ? "Copy wasn't available. You can select and copy the link above." : copied ? "Link copied." : "Your personal link — no application needed to share it."}</p>
          </> : <><p className="text-sm text-muted-foreground">{query.isError ? "Your invite link couldn't be loaded just now." : "An Honest.Money membership is needed for an ecosystem referral link. Seeds trading does not require one."}</p><div className="mt-3 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/account">Open account <ArrowUpRight /></Link></Button><Button variant="ghost" onClick={() => void query.refetch()}><RefreshCw /> Try again</Button></div></>}
          {user ? <Link to="/account/referrals" className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline">Referral results & QR code <ArrowUpRight className="size-4" /></Link> : null}
        </div>
      </div>
    </section>
  );
}