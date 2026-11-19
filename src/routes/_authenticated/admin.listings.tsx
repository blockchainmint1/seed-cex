import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, ExternalLink, Search } from "lucide-react";
import { adminListListingApplications, adminUpdateListingApplication, type AdminListingRow } from "@/lib/listing.functions";
import { LISTING_NETWORKS, LISTING_STATUSES, packageById } from "@/lib/listing";
import { Card, Note, TabTitle, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/listings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Listing applications — Seeds admin" },
      { name: "description", content: "Review coin teams' applications to list on Seeds." },
      { property: "og:title", content: "Listing applications — Seeds admin" },
      { property: "og:description", content: "Review coin teams' applications to list on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminListings,
});

const STATUS_LABEL: Record<string, string> = { new: "New", reviewing: "Reviewing", approved: "Approved", declined: "Declined", live: "Live" };
const netLabel = (id: string) => LISTING_NETWORKS.find((n) => n.id === id)?.label ?? id;

function AdminListings() {
  const load = useServerFn(adminListListingApplications);
  const q = useQuery({ queryKey: ["admin-listings"], queryFn: () => load(), retry: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) =>
      (status === "all" || (status === "open" ? ["new", "reviewing", "approved"].includes(r.status) : r.status === status)) &&
      (!s || [r.coin_name, r.ticker, r.contact_name, r.contact_email, r.website].some((v) => v.toLowerCase().includes(s))));
  }, [q.data, search, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of q.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [q.data]);

  return (
    <div className="space-y-6">
      <TabTitle title="Listing applications" desc="Coin teams who applied from the List on Seeds page. Admins with Telegram get a message for each new one." />
      {q.isPending ? <Loading /> : q.error ? <Note tone="error">{(q.error as Error).message}</Note> : (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search coin, ticker, contact or website" aria-label="Search applications" className={`${inputCls} pl-9`} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={`${inputCls} w-auto`}>
              <option value="open">Open ({(counts.new ?? 0) + (counts.reviewing ?? 0) + (counts.approved ?? 0)})</option>
              {LISTING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s] ?? 0})</option>)}
              <option value="all">All ({q.data?.length ?? 0})</option>
            </select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="w-8 py-2" /><th className="py-2 pr-3 font-normal">Coin</th><th className="py-2 pr-3 font-normal">Network</th>
                  <th className="py-2 pr-3 font-normal">Package</th><th className="py-2 pr-3 font-normal">Contact</th><th className="py-2 pr-3 font-normal">Sent</th><th className="py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No applications here yet.</td></tr>
                ) : rows.map((r) => {
                  const pkg = packageById(r.package);
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer border-b border-border hover:bg-muted/40" onClick={() => setOpen(isOpen ? null : r.id)}>
                        <td className="py-2.5 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="py-2.5 pr-3 font-semibold text-foreground">{r.coin_name} <span className="font-normal text-muted-foreground">{r.ticker}</span></td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{netLabel(r.network)}</td>
                        <td className="num py-2.5 pr-3">{pkg ? `${pkg.name} · $${pkg.priceUsd.toLocaleString("en-US")}` : r.package}</td>
                        <td className="py-2.5 pr-3">{r.contact_name}<div className="text-xs text-muted-foreground">{r.contact_email}</div></td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{fmtAgo(r.created_at)}</td>
                        <td className="py-2.5"><span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase">{STATUS_LABEL[r.status] ?? r.status}</span></td>
                      </tr>
                      {isOpen ? <tr className="border-b border-border bg-muted/20"><td colSpan={7} className="p-4"><Detail row={r} /></td></tr> : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Detail({ row }: { row: AdminListingRow }) {
  const qc = useQueryClient();
  const save = useServerFn(adminUpdateListingApplication);
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const link = (href: string) => <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline">{href} <ExternalLink className="h-3 w-3 shrink-0" /></a>;

  async function onSave() {
    setBusy(true); setMsg(null);
    try {
      await save({ data: { id: row.id, status, adminNote: note } });
      setMsg({ tone: "ok", text: "Saved." });
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Website</dt><dd>{link(row.website)}</dd>
        <dt className="text-muted-foreground">Community</dt><dd>{row.community ? link(row.community) : "—"}</dd>
        <dt className="text-muted-foreground">Contract</dt><dd className="break-all font-mono text-xs">{row.contract ?? "—"}</dd>
        <dt className="text-muted-foreground">Telegram</dt><dd>{row.contact_telegram ? link(`https://t.me/${row.contact_telegram}`) : "—"}</dd>
        <dt className="text-muted-foreground">Email</dt><dd><a href={`mailto:${row.contact_email}`} className="text-primary underline-offset-4 hover:underline">{row.contact_email}</a></dd>
        <dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{row.notes ?? "—"}</dd>
      </dl>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} mt-1`}>
            {LISTING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Team note <span className="font-normal text-muted-foreground">(only admins see this)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} mt-1`} />
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          {msg ? <span className={`text-sm ${msg.tone === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">The applicant sees the status on the List on Seeds page. Changing it doesn’t email them — reply from your own email.</p>
      </div>
    </div>
  );
}
