import { createFileRoute } from "@tanstack/react-router";
import { BlockedList, ProfileForm, useMyP2p } from "@/components/p2p/desk";

export const Route = createFileRoute("/_authenticated/account/p2p/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "P2P trader profile — Seeds" },
      { name: "description", content: "Your public P2P trader name, bio, country, hours, quick replies and blocked traders on Seeds." },
      { property: "og:title", content: "P2P trader profile — Seeds" },
      { property: "og:description", content: "Manage your peer-to-peer trader profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraderProfileTab,
});

function TraderProfileTab() {
  const { data } = useMyP2p();
  if (!data) return null;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
      <ProfileForm data={data} />
      <BlockedList data={data} />
    </div>
  );
}
