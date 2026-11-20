import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TabTitle, Note } from "@/components/account/ui";
import { Loading, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addCoinVideo, listCoinVideosAdmin, removeCoinVideo } from "@/lib/markets/coin-videos.functions";
import { THOR_MARKETS, thorMarket } from "@/lib/markets/thor-markets";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/videos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Coin videos — Seeds admin" },
      { name: "description", content: "Pick the YouTube videos shown on each coin's market page." },
      { property: "og:title", content: "Coin videos — Seeds admin" },
      { property: "og:description", content: "Team-picked expert videos for Seeds market pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VideosAdmin,
});

function VideosAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listCoinVideosAdmin);
  const add = useServerFn(addCoinVideo);
  const remove = useServerFn(removeCoinVideo);
  const q = useQuery({ queryKey: ["admin-coin-videos"], queryFn: () => list() });
  const [slug, setSlug] = useState(THOR_MARKETS[0]!.slug);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await add({ data: { slug, url, ...(note.trim() ? { note: note.trim() } : {}) } });
      toast.success(`Added "${r.title}"`);
      setUrl(""); setNote("");
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-coin-videos"] }), qc.invalidateQueries({ queryKey: ["coin-videos", slug] })]);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't add that video.");
    } finally { setBusy(false); }
  }

  async function drop(id: string, s: string) {
    if (!window.confirm("Remove this video from the coin page?")) return;
    try {
      await remove({ data: { id } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-coin-videos"] }), qc.invalidateQueries({ queryKey: ["coin-videos", s] })]);
      toast.success("Removed");
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Couldn't remove it.");
    }
  }

  return (
    <div className="space-y-5">
      <TabTitle title="Coin videos" desc="Expert videos shown on each coin's market page. Only videos added here appear; the newest show first." />
      <Panel title="Add a video">
        <form onSubmit={submit} className="grid gap-4 p-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Coin page
            <select value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {THOR_MARKETS.map((m) => <option key={m.slug} value={m.slug}>{m.base} — {m.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            YouTube link
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground md:col-span-2">
            Why it's worth watching (optional, shown under the video)
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2} placeholder="e.g. Clear 10-minute explainer on how Bitcoin halvings affect supply." />
          </label>
          {err ? <div className="md:col-span-2"><Note tone="error">{err}</Note></div> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy || url.trim().length < 5}>{busy ? "Checking with YouTube…" : "Add video"}</Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Seeds reads the title and channel from YouTube. Private, removed or embed-blocked videos are refused.</p>
          </div>
        </form>
      </Panel>
      <Panel title={`On the site · ${q.data?.length ?? 0}`}>
        {q.isPending ? <div className="p-4"><Loading /></div> : q.error ? <p role="alert" className="p-4 text-sm text-destructive">Couldn't load the videos. Refresh to retry.</p> : (q.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No videos yet. Coin pages hide the videos section until you add one.</p>
        ) : (
          <ul>
            {(q.data ?? []).map((v) => {
              const m = thorMarket(v.slug);
              return (
                <li key={v.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
                  <img src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-sm object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{v.title}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {m ? <Link to="/markets/$slug" params={{ slug: v.slug }} className="hover:text-primary">{m.base}</Link> : v.slug} · {v.channel ?? "YouTube"} · {fmtAgo(v.created_at)}
                    </p>
                    {v.note ? <p className="truncate text-xs text-muted-foreground">{v.note}</p> : null}
                  </div>
                  <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" aria-label="Open on YouTube"><ExternalLink className="h-4 w-4" /></a>
                  <Button size="sm" variant="ghost" onClick={() => drop(v.id, v.slug)} aria-label="Remove video"><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
