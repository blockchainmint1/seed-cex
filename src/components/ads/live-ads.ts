import { queryOptions } from "@tanstack/react-query";
import { getLiveAds } from "@/lib/ads/ads.functions";

/** Every running ad; pages pick their spots with adsForSpot. Loaded in route loaders and passed as initialData. */
export const liveAdsQuery = queryOptions({
  queryKey: ["live-ads"],
  queryFn: () => getLiveAds(),
  staleTime: 60_000,
});
