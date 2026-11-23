import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Search } from "lucide-react";
import {
  adminCreateListingPromo, adminGetListingSettings, adminListListingApplications, adminSaveListingPrices, adminSetListingPayment,
  adminSetListingPromoActive, adminUpdateListingApplication, type AdminListingRow, type AdminPromoRow,
} from "@/lib/listing.functions";
import { LISTING_NETWORKS, LISTING_STATUSES, LISTING_PACKAGES, PACKAGE_IDS, PAYMENT_LABEL, packageById, paymentActionAllowed, promoLabel, refundNeeded, type ListingPrices, type PackageId, type PaymentStatus } from "@/lib/listing";
import { Card, Note, TabTitle, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/_authenticated/admin/listings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Listing applications — Seeds admin" },
      { name: "description", content: "Review coin teams' applications, payments, prices and promo codes." },
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
  const [tab, setTab] = useState<"apps" | "prices" | "promos">("apps");
  const tabs = [["apps", "Applications"], ["prices", "Prices"], ["promos", "Promo codes"]] as const;
  return (
    <div className="space-y-6">
      <TabTitle title="Listings" desc="Coin teams who applied from the List on Seeds page pay through NectarPay when they apply. Admins with Telegram get a message for each new application and each payment." />
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{name}</button>
        ))}
      </div>
      {tab === "apps" ? <Applications /> : tab === "prices" ? <Prices /> : <Promos />}
    </div>
  );
}

function PayBadge({ row }: { row: AdminListingRow }) {
  const refund = refundNeeded(row);
  const tone = refund || row.payment_status === "underpaid" ? "border-destructive/60 text-destructive" : row.payment_status === "paid" || row.payment_status === "free" ? "border-primary/60 text-primary" : "border-border text-muted-foreground";
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${tone}`}>{refund ? "Refund needed" : PAYMENT_LABEL[row.payment_status as PaymentStatus] ?? row.payment_status}</span>;
}

function Applications() {
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
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th className="w-8 py-2" /><th className="py-2 pr-3 font-normal">Coin</th><th className="py-2 pr-3 font-normal">Network</th>
                  <th className="py-2 pr-3 font-normal">Package</th><th className="py-2 pr-3 font-normal">Price</th><th className="py-2 pr-3 font-normal">Payment</th><th className="py-2 pr-3 font-normal">Contact</th><th className="py-2 pr-3 font-normal">Sent</th><th className="py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No applications here yet.</td></tr>
                ) : rows.map((r) => {
                  const pkg = packageById(r.package);
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer border-b border-border hover:bg-muted/40" onClick={() => setOpen(isOpen ? null : r.id)}>
                        <td className="py-2.5 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="py-2.5 pr-3 font-semibold text-foreground">{r.coin_name} <span className="font-normal text-muted-foreground">{r.ticker}</span></td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{netLabel(r.network)}</td>
                        <td className="py-2.5 pr-3">{pkg?.name ?? r.package}</td>
                        <td className="num py-2.5 pr-3">{usd(r.amount_usd)}{r.promo_code ? <div className="text-xs text-muted-foreground">{r.promo_code} · list {usd(r.list_price_usd)}</div> : null}</td>
                        <td className="py-2.5 pr-3"><PayBadge row={r} /></td>
                        <td className="py-2.5 pr-3">{r.contact_name}<div className="text-xs text-muted-foreground">{r.contact_email}</div></td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{fmtAgo(r.created_at)}</td>
                        <td className="py-2.5"><span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase">{STATUS_LABEL[r.status] ?? r.status}</span></td>
                      </tr>
                      {isOpen ? <tr className="border-b border-border bg-muted/20"><td colSpan={9} className="p-4"><Detail row={r} /></td></tr> : null}
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
        <dt className="text-muted-foreground">Price</dt><dd className="num">{usd(row.amount_usd)}{row.discount_usd > 0 ? ` (list ${usd(row.list_price_usd)} − ${usd(row.discount_usd)} with ${row.promo_code})` : ""}</dd>
        <dt className="text-muted-foreground">Payment</dt><dd><PayBadge row={row} /></dd>
        {row.paid_at ? <><dt className="text-muted-foreground">Paid</dt><dd>{new Date(row.paid_at).toLocaleString()}{row.paid_amount_usd != null ? ` · ${usd(row.paid_amount_usd)}` : ""}{row.paid_asset || row.paid_chain ? ` · ${[row.paid_asset, row.paid_chain?.toUpperCase()].filter(Boolean).join(" on ")}` : ""}</dd></> : null}
        {row.paid_invoice_id || row.invoice_id ? <><dt className="text-muted-foreground">NectarPay</dt><dd className="break-all font-mono text-xs">{row.paid_invoice_id ?? row.invoice_id}</dd></> : null}
        {row.payment_note ? <><dt className="text-muted-foreground">Payment note</dt><dd className="whitespace-pre-wrap">{row.payment_note}</dd></> : null}
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
        {status === "declined" && row.payment_status === "paid" ? (
          <Note tone="error"><AlertTriangle className="mr-1 inline h-4 w-4" />This team paid. Declining means sending their {usd(row.paid_amount_usd ?? row.amount_usd)} back by hand from Seeds’ NectarPay wallet, then pressing “Mark refunded”.</Note>
        ) : null}
        <PaymentActions row={row} />
      </div>
    </div>
  );
}

function PaymentActions({ row }: { row: AdminListingRow }) {
  const qc = useQueryClient();
  const act = useServerFn(adminSetListingPayment);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const canPaid = paymentActionAllowed("mark_paid", row.payment_status);
  const canRefund = paymentActionAllowed("mark_refunded", row.payment_status);
  if (!canPaid && !canRefund) return null;
  async function run(action: "mark_paid" | "mark_refunded") {
    const ask = action === "mark_paid" ? "Mark this application paid? Only do this if the money really arrived outside NectarPay's checkout." : "Mark this payment refunded? Only after you've actually sent the money back.";
    if (!window.confirm(ask)) return;
    setBusy(true); setMsg(null);
    try {
      await act({ data: { id: row.id, action, note } });
      setMsg({ tone: "ok", text: "Saved." }); setNote("");
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Payment by hand</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="How it was paid or refunded (e.g. transaction id)" className={inputCls} aria-label="Payment note" />
      <div className="flex flex-wrap items-center gap-2">
        {canPaid ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run("mark_paid")}>Mark paid</Button> : null}
        {canRefund ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run("mark_refunded")}>Mark refunded</Button> : null}
        {msg ? <span className={`text-sm ${msg.tone === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">Logged with your name. NectarPay payments mark themselves paid — use this only for payments made another way.</p>
    </div>
  );
}

function useSettings() {
  const load = useServerFn(adminGetListingSettings);
  return useQuery({ queryKey: ["admin-listing-settings"], queryFn: () => load(), retry: false });
}

function Prices() {
  const q = useSettings();
  if (q.isPending) return <Loading />;
  if (q.error) return <Note tone="error">{(q.error as Error).message}</Note>;
  return <PriceForm prices={q.data.prices} updatedAt={q.data.pricesUpdatedAt} />;
}

function PriceForm({ prices, updatedAt }: { prices: ListingPrices; updatedAt: string | null }) {
  const qc = useQueryClient();
  const save = useServerFn(adminSaveListingPrices);
  const [vals, setVals] = useState<Record<PackageId, string>>(() => Object.fromEntries(PACKAGE_IDS.map((id) => [id, String(prices[id])])) as Record<PackageId, string>);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function onSave() {
    setBusy(true); setMsg(null);
    try {
      await save({ data: vals });
      setMsg({ tone: "ok", text: "Prices saved. The List on Seeds page shows them now." });
      qc.invalidateQueries({ queryKey: ["admin-listing-settings"] });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {LISTING_PACKAGES.map((p) => (
          <label key={p.id} className="block text-sm font-medium">{p.name} <span className="font-normal text-muted-foreground">· {p.tag}</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input inputMode="decimal" value={vals[p.id]} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} className={`${inputCls} num pl-7`} />
            </div>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save prices"}</Button>
        {msg ? <span className={`text-sm ${msg.tone === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</span> : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        New prices apply to new applications only — anyone who already applied keeps the price they were shown. Every change is logged with your name.
        {updatedAt ? ` Last changed ${fmtAgo(updatedAt)}.` : ""}
      </p>
    </Card>
  );
}

function Promos() {
  const q = useSettings();
  if (q.isPending) return <Loading />;
  if (q.error) return <Note tone="error">{(q.error as Error).message}</Note>;
  return (
    <div className="space-y-6">
      <NewPromo />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-normal">Code</th><th className="py-2 pr-3 font-normal">Discount</th><th className="py-2 pr-3 font-normal">Packages</th>
                <th className="py-2 pr-3 font-normal">Used</th><th className="py-2 pr-3 font-normal">Ends</th><th className="py-2 pr-3 font-normal">Note</th><th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {q.data.promos.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No promo codes yet.</td></tr>
              ) : q.data.promos.map((p) => <PromoRow key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">A use counts when a team applies with the code. Codes can be paused but never deleted, so every past discount stays explained.</p>
      </Card>
    </div>
  );
}

function PromoRow({ p }: { p: AdminPromoRow }) {
  const qc = useQueryClient();
  const set = useServerFn(adminSetListingPromoActive);
  const [busy, setBusy] = useState(false);
  const ended = !!p.expires_at && new Date(p.expires_at).getTime() <= Date.now();
  const usedUp = p.max_uses != null && p.uses >= p.max_uses;
  async function toggle() {
    setBusy(true);
    try { await set({ data: { id: p.id, active: !p.active } }); qc.invalidateQueries({ queryKey: ["admin-listing-settings"] }); }
    finally { setBusy(false); }
  }
  return (
    <tr className={`border-b border-border ${!p.active || ended || usedUp ? "text-muted-foreground" : ""}`}>
      <td className="py-2.5 pr-3 font-mono font-semibold">{p.code}</td>
      <td className="py-2.5 pr-3">{promoLabel(p)}</td>
      <td className="py-2.5 pr-3">{p.packages ? p.packages.map((id) => packageById(id)?.name ?? id).join(", ") : "All"}</td>
      <td className="num py-2.5 pr-3">{p.uses}{p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
      <td className="py-2.5 pr-3">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}{ended ? " (ended)" : ""}</td>
      <td className="max-w-[14rem] truncate py-2.5 pr-3" title={p.note ?? ""}>{p.note ?? "—"}</td>
      <td className="py-2.5 text-right">
        <Button size="sm" variant="outline" disabled={busy} onClick={toggle}>{p.active ? "Pause" : "Turn on"}</Button>
      </td>
    </tr>
  );
}

function NewPromo() {
  const qc = useQueryClient();
  const create = useServerFn(adminCreateListingPromo);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [packages, setPackages] = useState<PackageId[]>([]);
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const toggle = (id: PackageId) => setPackages(packages.includes(id) ? packages.filter((x) => x !== id) : [...packages, id]);
  async function onCreate() {
    setBusy(true); setMsg(null);
    try {
      await create({ data: { code, kind, value: Number(value), packages, maxUses: maxUses ? Number(maxUses) : null, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null, note } });
      setMsg({ tone: "ok", text: `Code ${code.trim().toUpperCase()} is live.` });
      setCode(""); setValue(""); setPackages([]); setMaxUses(""); setExpires(""); setNote("");
      qc.invalidateQueries({ queryKey: ["admin-listing-settings"] });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally { setBusy(false); }
  }
  return (
    <Card>
      <p className="font-semibold">New promo code</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium">Code
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={24} placeholder="LAUNCH25" className={`${inputCls} mt-1 font-mono uppercase`} />
        </label>
        <label className="block text-sm font-medium">Discount
          <div className="mt-1 flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} className={`${inputCls} w-auto`} aria-label="Discount type">
              <option value="percent">% off</option><option value="amount">$ off</option>
            </select>
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "25" : "500"} className={`${inputCls} num`} aria-label="Discount amount" />
          </div>
        </label>
        <label className="block text-sm font-medium">Max uses <span className="font-normal text-muted-foreground">(blank = no limit)</span>
          <input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${inputCls} num mt-1`} />
        </label>
        <label className="block text-sm font-medium">Ends <span className="font-normal text-muted-foreground">(optional)</span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Works with <span className="font-normal text-muted-foreground">(none ticked = every package)</span></legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {LISTING_PACKAGES.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={packages.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block text-sm font-medium">Note <span className="font-normal text-muted-foreground">(only admins see this — who it's for)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${inputCls} mt-1`} />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onCreate} disabled={busy || !code.trim() || !value}>{busy ? "Saving…" : "Create code"}</Button>
        {msg ? <span className={`text-sm ${msg.tone === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</span> : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">If a code brings the price under $1, the listing is free and no checkout opens.</p>
    </Card>
  );
}
