import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin-guard";
import { THOR_MARKET_SLUGS } from "./thor-markets";
import { youtubeId } from "./coin-research";

/*
 * Team-picked videos for coin pages. Anyone can read the list straight from the
 * browser (public page content; who added it stays hidden). Only admins add or
 * remove, and only here: the browser has no write access to coin_videos.
 */

/** YouTube's public title + channel lookup (no key). Null when YouTube won't describe the video. */
async function oembed(id: string): Promise<{ title: string; channel: string | null } | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: unknown; author_name?: unknown };
    const title = typeof j.title === "string" ? j.title.trim().slice(0, 200) : "";
    if (!title) return null;
    return { title, channel: typeof j.author_name === "string" ? j.author_name.trim().slice(0, 120) || null : null };
  } catch {
    return null;
  }
}

export const listCoinVideosAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("coin_videos")
      .select("id, slug, video_id, title, channel, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Couldn't load the videos.");
    return data ?? [];
  });

export const addCoinVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      slug: z.enum(THOR_MARKET_SLUGS),
      url: z.string().trim().min(5).max(300),
      note: z.string().trim().max(280).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const id = youtubeId(data.url);
    if (!id) throw new Error("That doesn't look like a YouTube video link.");
    const meta = await oembed(id);
    if (!meta) throw new Error("YouTube won't show that video outside YouTube (it may be private, removed or embed-blocked).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coin_videos").insert({
      slug: data.slug,
      video_id: id,
      title: meta.title,
      channel: meta.channel,
      note: data.note ? data.note : null,
      added_by: context.userId,
    });
    if (error) throw new Error(error.code === "23505" ? "That video is already on this coin's page." : "Couldn't save the video.");
    return { ok: true, title: meta.title };
  });

export const removeCoinVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coin_videos").delete().eq("id", data.id);
    if (error) throw new Error("Couldn't remove the video.");
    return { ok: true };
  });
