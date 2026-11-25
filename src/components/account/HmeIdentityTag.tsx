import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { getMyHmeIdentity } from "@/lib/hme-identity.functions";
import { hmeIdentityFor } from "@/lib/hme-identity";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/**
 * The "HME …" tag in the account header: the member's Honest.Money user ID (their username),
 * with the permanent member UUID one hover away. Before the lookup answers it shows the short
 * UUID it used to show, so the header never flashes empty.
 */
export function HmeIdentityTag({ memberId }: { memberId: string }) {
  const load = useServerFn(getMyHmeIdentity);
  const identity = useQuery({ queryKey: ["my-hme-identity"], queryFn: () => load(), retry: false, staleTime: 300_000 });
  const [copied, setCopied] = useState(false);
  const shown = hmeIdentityFor({ memberId, username: identity.data?.username, memberNo: identity.data?.memberNo })
    ?? { label: memberId.slice(0, 8), uuid: memberId as string | null, memberNoLine: null as string | null };

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="cursor-help font-mono underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:text-foreground"
        >
          HME {shown.label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto max-w-sm">
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Honest.Money member UUID</p>
        <p className="mt-1 flex items-start gap-2">
          <span className="min-w-0 break-all font-mono text-xs">{shown.uuid || "—"}</span>
          {shown.uuid ? (
            <button
              type="button"
              aria-label="Copy member UUID"
              className="shrink-0 text-muted-foreground hover:text-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shown.uuid!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch { /* clipboard blocked: nothing to do */ }
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          ) : null}
        </p>
        {shown.memberNoLine ? <p className="mt-2 text-xs text-muted-foreground">{shown.memberNoLine}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">Your permanent Honest.Money key — it never changes.</p>
      </HoverCardContent>
    </HoverCard>
  );
}
