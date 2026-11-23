import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cancelPeerLink, createPeerLink, emailPeerLink } from "@/lib/ignite-peer.functions";
import type { Details } from "@/lib/ignite-registration";

export type PeerInfo = { path: string | null; state: string; expiresAt: string; payerName: string | null; openedAt: string | null; paidAt: string | null; emailsLeft: number } | null;

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PeerPayPanel({ details, peer, cryptoOpen, onChanged, classId, amountUsd }: { details: Details; peer: PeerInfo | undefined; cryptoOpen: boolean; onChanged: () => void; classId: string; amountUsd: number | null }) {
  const create = useServerFn(createPeerLink);
  const cancel = useServerFn(cancelPeerLink);
  const email = useServerFn(emailPeerLink);
  const [busy, setBusy] = useState<null | "create" | "cancel" | "email">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const run = async (kind: "create" | "cancel" | "email", fn: () => Promise<unknown>) => {
    setBusy(kind); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    setBusy(null);
  };

  const active = peer?.state === "active" && peer.path;
  const emailsLeftNow = Math.min(left ?? Infinity, peer?.emailsLeft ?? 0);
  const url = active ? `${window.location.origin}${peer.path}` : "";

  if (!active) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="font-semibold">Peer Pay: have a friend pay</p>
        <p className="mt-1 text-sm text-muted-foreground">Get a private link to send to someone you trust. They sign in with Honest.Money and pay {amountUsd != null ? `the $${amountUsd.toLocaleString("en-US")}` : "the cost of your seat"} for you. The link works for 7 days.</p>
        {peer && peer.state !== "paid" && (
          <p className="mt-2 text-xs text-muted-foreground">Your last link {peer.state === "expired" ? "expired" : "was turned off"}. You can make a new one.</p>
        )}
        <button type="button" className="seed-btn-ghost mt-3 w-full" disabled={!cryptoOpen || busy !== null}
          onClick={() => run("create", () => create({ data: { ...details, origin: window.location.origin, classId } }))}>
          {busy === "create" ? "Creating link…" : "Create a Peer Pay link"}
        </button>
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4" aria-live="polite">
      <p className="font-semibold">Your Peer Pay link</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {peer.payerName ? <><strong className="text-foreground">{peer.payerName}</strong> opened it and is paying now.</> : "Waiting for your friend to open it."} Works until {fmtDate(peer.expiresAt)}.
      </p>
      <div className="mt-3 flex gap-2">
        <label htmlFor="peer-url" className="sr-only">Peer Pay link</label>
        <input id="peer-url" readOnly value={url} className="seed-field min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="seed-btn shrink-0 !w-auto px-4"
          onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Couldn't copy. Select the link and copy it yourself."); } }}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = to.trim(); run("email", async () => { const r = await email({ data: { to: t, origin: window.location.origin } }); setLeft(r.emailsLeft); setSentTo(t); setTo(""); }); }}>
        <label htmlFor="peer-email" className="sr-only">Friend's email</label>
        <input id="peer-email" type="email" inputMode="email" placeholder="Friend's email" value={to} maxLength={255} onChange={(e) => setTo(e.target.value)} className="seed-field min-w-0 flex-1" disabled={emailsLeftNow === 0} />
        <button type="submit" className="seed-btn-ghost shrink-0 !w-auto px-4" disabled={busy !== null || !to.trim() || emailsLeftNow === 0}>{busy === "email" ? "Sending…" : "Email it"}</button>
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {sentTo ? `Sent to ${sentTo}. ` : ""}{emailsLeftNow === 0 ? "You've used today's 3 emails. Copy the link instead." : `${emailsLeftNow} email${emailsLeftNow === 1 ? "" : "s"} left today.`}
      </p>
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Your friend must sign in with Honest.Money to pay, so you'll see who paid. Any repayment between you two is your own arrangement.</p>
      <button type="button" className="mt-3 text-sm font-semibold text-destructive underline-offset-4 hover:underline" disabled={busy !== null}
        onClick={() => { if (window.confirm("Turn off this link? Anyone who has it won't be able to pay.")) run("cancel", () => cancel()); }}>
        {busy === "cancel" ? "Turning off…" : "Cancel this link"}
      </button>
    </div>
  );
}
