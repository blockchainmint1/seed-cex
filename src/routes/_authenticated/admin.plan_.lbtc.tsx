import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getLbtcReport } from "@/lib/lbtc-report.functions";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/admin/ui";

export const Route = createFileRoute("/_authenticated/admin/plan_/lbtc")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Why LocalBitcoins died — Seeds admin research" },
      { name: "description", content: "Admin research for the Seeds business plan: the LocalBitcoins post-mortem and the 2026 P2P landscape." },
      { property: "og:title", content: "Why LocalBitcoins died — Seeds admin research" },
      { property: "og:description", content: "The LocalBitcoins post-mortem, kept with the Seeds business plan." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLbtc,
});

function AdminLbtc() {
  const fetchReport = useServerFn(getLbtcReport);
  const q = useQuery({ queryKey: ["admin-lbtc-report"], queryFn: () => fetchReport(), retry: false, staleTime: Infinity });
  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="outline"><Link to="/admin/plan"><ArrowLeft /> Business plan</Link></Button>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <p role="alert" className="text-sm text-destructive">Couldn't load the report. Refresh to retry.</p>
      ) : (
        // Fixed, server-rendered markup from our own source file (no member input).
        <article dangerouslySetInnerHTML={{ __html: q.data.html }} />
      )}
    </div>
  );
}
