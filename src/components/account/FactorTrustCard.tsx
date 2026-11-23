import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, Note } from "@/components/account/ui";
import { StepUp, type StepUpProof } from "@/components/account/StepUp";
import { TWO_FACTOR_QUERY } from "@/components/account/TwoFactorCard";
import { confirmMyFactor, getMyFactorTrust, removeMyUnconfirmedFactor } from "@/lib/step-up/step-up.functions";

type Item = { kind: "totp"; factorId: string } | { kind: "telegram" };
const itemKey = (i: Item) => (i.kind === "totp" ? `totp:${i.factorId}` : "telegram");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "unknown time");

/**
 * Auditor H1b + S2 (Bobby, Nov 23): each 2FA app or Telegram chat added outside the setup exception shows
 * "Not confirmed yet" on its own line, with when it was added. Confirm needs "confirm it's you" with a sign-in
 * made after that item was added (S1); Remove (2FA apps only) needs no check, since it only makes the account safer.
 */
export function FactorTrustCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyFactorTrust);
  const confirm = useServerFn(confirmMyFactor);
  const remove = useServerFn(removeMyUnconfirmedFactor);
  const q = useQuery({ queryKey: ["factor-trust"], queryFn: () => load() });
  const [open, setOpen] = useState<Item | null>(null);
  const [gate, setGate] = useState<{ ready: boolean; proof: StepUpProof }>({ ready: false, proof: null });
  const [gateKey, setGateKey] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const done = () => { qc.invalidateQueries({ queryKey: ["factor-trust"] }); qc.invalidateQueries({ queryKey: ["my-profile"] }); qc.invalidateQueries({ queryKey: TWO_FACTOR_QUERY }); };
  const m = useMutation({
    mutationFn: (item: Item) => confirm({ data: { subject: item, proof: gate.proof } }),
    onSuccess: () => { setNote({ ok: true, text: "Confirmed." }); setOpen(null); done(); },
    onError: (e: Error) => setNote({ ok: false, text: e.message }),
    onSettled: () => { setGate({ ready: false, proof: null }); setGateKey((k) => k + 1); },
  });
  const rm = useMutation({
    mutationFn: (factorId: string) => remove({ data: { factorId } }),
    onSuccess: () => { setNote({ ok: true, text: "Removed. That app's codes no longer work on your account." }); setOpen(null); done(); },
    onError: (e: Error) => setNote({ ok: false, text: e.message }),
  });
  const d = q.data;
  if (!d) return null;
  const items: Array<{ item: Item; label: string; addedAt: string | null; why: string }> = [];
  if (d.telegram.connected && !d.telegram.confirmed) {
    items.push({ item: { kind: "telegram" }, label: "Telegram chat", addedAt: d.telegram.addedAt, why: "Until it's confirmed it can't approve coins leaving your pocket." });
  }
  d.totp.filter((f) => !f.confirmed).forEach((f, i) => {
    items.push({ item: { kind: "totp", factorId: f.id }, label: f.name ? `2FA app “${f.name}”` : `2FA app ${i + 1}`, addedAt: f.addedAt, why: "Until it's confirmed its codes can't be used to confirm big changes." });
  });
  if (!items.length) return note ? <Note tone={note.ok ? "ok" : "error"}>{note.text}</Note> : null;
  return (
    <Card title="Not confirmed yet" desc="Added without a fresh sign-in, so Seeds doesn't trust it yet. Check each one.">
      {note ? <div className="mb-3"><Note tone={note.ok ? "ok" : "error"}>{note.text}</Note></div> : null}
      <p className="mb-3 text-xs text-muted-foreground">Only confirm what you added yourself. If you don't recognise one, remove it, sign out of Honest.Money everywhere and contact support@honest.money.</p>
      <ul className="space-y-3">
        {items.map(({ item, label, addedAt, why }) => {
          const k = itemKey(item);
          const isOpen = open != null && itemKey(open) === k;
          return (
            <li key={k} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b>{label}</b>
                <span className="text-xs text-muted-foreground">added {when(addedAt)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{why}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!isOpen ? <Button size="sm" variant="outline" onClick={() => { setNote(null); setOpen(item); setGate({ ready: false, proof: null }); setGateKey((x) => x + 1); }}>Confirm</Button> : null}
                {item.kind === "totp" ? (
                  <Button size="sm" variant="ghost" disabled={rm.isPending} onClick={() => rm.mutate(item.factorId)}>Remove</Button>
                ) : null}
              </div>
              {isOpen ? (
                <div className="mt-3 space-y-3">
                  <StepUp key={`${k}-${gateKey}`} purpose="confirm_factor" subject={item} onChange={(ready, proof) => setGate({ ready, proof })} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={!gate.ready || m.isPending} onClick={() => m.mutate(item)}>Yes, I added this — confirm it</Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
