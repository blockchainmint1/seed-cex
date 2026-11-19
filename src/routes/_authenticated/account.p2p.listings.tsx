import { createFileRoute } from "@tanstack/react-router";
import { OfferList, useMyP2p } from "@/components/p2p/desk";

export const Route = createFileRoute("/_authenticated/account/p2p/listings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "My P2P listings — Seeds" },
      { name: "description", content: "Create, edit and pause your peer-to-peer buy and sell ads on Seeds, with live funds checks from your HME trading pocket." },
      { property: "og:title", content: "My P2P listings — Seeds" },
      { property: "og:description", content: "Manage your P2P buy and sell ads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListingsTab,
});

function ListingsTab() {
  const { data } = useMyP2p();
  if (!data) return null;
  return <OfferList data={data} />;
}
