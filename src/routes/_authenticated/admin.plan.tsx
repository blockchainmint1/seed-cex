import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBusinessPlan } from "@/lib/business-plan.functions";
import { TabTitle } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { PlanView } from "@/components/admin/BusinessPlanView";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/plan")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Business plan — Seeds admin" },
      { name: "description", content: "Seeds' business plan: P2P sellers, weekly competitions, creators, BitMart coin teams, affiliates, Seeds coins and endorsements." },
      { property: "og:title", content: "Business plan — Seeds admin" },
      { property: "og:description", content: "Seeds' growth and marketing plan for the operator team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPlan,
});

function AdminPlan() {
  const fetchPlan = useServerFn(getBusinessPlan);
  const q = useQuery({ queryKey: ["admin-business-plan"], queryFn: () => fetchPlan(), retry: false, refetchInterval: 60_000 });
  const d = q.data;
  return (
    <div className="space-y-6">
      <TabTitle title="Business plan" desc={d ? `Plan written ${d.plan.updated} · numbers ${fmtAgo(d.generatedAt)}.` : "How Seeds grows and pays its way."} />
      {q.isPending ? <Loading /> : q.error ? <p role="alert" className="text-sm text-destructive">Couldn't load the plan. Refresh to retry.</p> : d ? <PlanView plan={d.plan} live={d.live} /> : null}
    </div>
  );
}
