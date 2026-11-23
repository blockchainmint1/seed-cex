import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, Note } from "@/components/account/ui";
import { StepUp, type StepUpProof } from "@/components/account/StepUp";
import { confirmMyFactor, getMyFactorTrust } from "@/lib/step-up/step-up.functions";

/**
 * Auditor H1b (Bobby, Nov 23): a 2FA app or Telegram chat added outside a fresh sign-in shows "Not confirmed yet".
 * An unconfirmed chat can't approve sends; unconfirmed 2FA can't prove it's you. Only shown when something waits.
 */
export function FactorTrustCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyFactorTrust);
  const confirm = useServerFn(confirmMyFactor);
  const q = useQuery({ queryKey: ["factor-trust"], queryFn: () => load() });
  const [gate, setGate] = useState<{ ready: boolean; proof: StepUpProof }>({ ready: false, proof: null });
  const [gateKey, setGateKey] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation({
    mutationFn: (kind: "totp" | "telegram") => confirm({ data: { kind, proof: gate.proof } }),
    onSuccess: () => { setNote({ ok: true, text: "Confirmed." }); qc.invalidateQueries({ queryKey: ["factor-trust"] }); qc.invalidateQueries({ queryKey: ["my-profile"] }); },
    onError: (e: Error) => setNote({ ok: false, text: e.message }),
    onSettled: () => { setGate({ ready: false, proof: null }); setGateKey((k) => k + 1); },
  });
  const d = q.data;
  if (!d) return null;
  const tgWaits = d.telegram.connected && !d.telegram.confirmed;
  const totpWaits = d.totp.some((f) => !f.confirmed);
  if (!tgWaits && !totpWaits) return note ? <Note tone={note.ok ? "ok" : "error"}>{note.text}</Note> : null;
  return (
    <Card title="Not confirmed yet" desc="Added without a fresh sign-in, so Seeds doesn't trust it yet.">
      {note ? <div className="mb-3"><Note tone={note.ok ? "ok" : "error"}>{note.text}</Note></div> : null}
      <ul className="mb-3 space-y-1 text-sm">
        {tgWaits ? <li>• Your <b>Telegram chat</b> — until it's confirmed it can't approve coins leaving your pocket.</li> : null}
        {totpWaits ? <li>• A new <b>two-factor app</b> — until it's confirmed its codes can't be used to confirm big changes.</li> : null}
      </ul>
      <p className="mb-3 text-xs text-muted-foreground">If you didn't add it yourself, don't confirm it: remove it, sign out of Honest.Money everywhere and contact support@honest.money.</p>
      <StepUp key={gateKey} purpose="confirm_factor" onChange={(ready, proof) => setGate({ ready, proof })} />
      <div className="mt-3 flex flex-wrap gap-2">
        {tgWaits ? <Button size="sm" disabled={!gate.ready || m.isPending} onClick={() => m.mutate("telegram")}>Confirm Telegram chat</Button> : null}
        {totpWaits ? <Button size="sm" disabled={!gate.ready || m.isPending} onClick={() => m.mutate("totp")}>Confirm two-factor app</Button> : null}
      </div>
    </Card>
  );
}
