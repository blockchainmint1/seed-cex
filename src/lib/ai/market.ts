/** Browser reads for Seeds AI: coin list and daily closes (public data). */
import { supabase } from "@/integrations/supabase/client";
import type { Series } from "./series";

export type AiCoin = { id: string; symbol: string; name: string; rank: number | null; image: string | null; swap_coin: string | null };

export async function fetchAiCoins(): Promise<AiCoin[]> {
  const { data, error } = await supabase.from("ai_coins").select("id,symbol,name,rank,image,swap_coin").eq("active", true).order("rank");
  if (error) throw error;
  return data ?? [];
}

export async function fetchAiSeries(coinId: string): Promise<Series> {
  const days: string[] = []; const closes: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("ai_daily_prices").select("day,close").eq("coin_id", coinId).order("day").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) { days.push(r.day); closes.push(Number(r.close)); }
    if (!data || data.length < 1000) break;
  }
  return { days, closes };
}

export const aiCoinsQuery = { queryKey: ["ai-coins"], queryFn: fetchAiCoins, staleTime: 3_600_000 };
export const aiSeriesQuery = (id: string) => ({ queryKey: ["ai-series", id], queryFn: () => fetchAiSeries(id), staleTime: 3_600_000 });
