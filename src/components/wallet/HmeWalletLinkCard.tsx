import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getMyHmeLink, revokeMyHmeLink, startHmeLink } from "@/lib/hme-link.functions";

const CHAIN_NAME: Record<string, string> = { "696969": "TXC + TSD", "969696": "ISK", "0": "Bitcoin", "2": "Litecoin", "60": "ETH / USDC / USDT" };

export function HmeWalletLinkCard() {
  const qc = useQueryClient();
  const fetchLink = useServerFn(getMyHmeLink);
  const start = useServerFn(startHmeLink);
  const revoke = useServerFn(revokeMyHmeLink);
  const [manifest, setManifest] = useState<string | null>(null);

  const link = useQuery({
    queryKey: ["hme-link"],
    queryFn: () => fetchLink(),
    refetchInterval: manifest ? 4000 : false,
  });
  if (manifest && link.data) setManifest(null);

  const begin = useMutation({
    mutationFn: () => start({ data: { origin: window.location.origin } }),
    onSuccess: (r) => setManifest(r.manifestUrl),
  });
  const stop = useMutation({
    mutationFn: () => revoke(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hme-link"] }),
  });

  const l = link.data;
  return (
    <section className="rounded-sm border border-primary/40 bg-surface p-5">
      <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">Recommended</p>
      <h2 className="font-display text-sm font-bold tracking-[0.1em] text-foreground uppercase">HME Wallet trading pocket</h2>

      {l ? (
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Linked —{" "}
            <span className="text-foreground">{l.mode === "access" ? "instant trades (Seeds can sign)" : "you approve every trade in your wallet"}</span>
            , pocket #{l.account}.
          </p>
          <p className="font-mono text-[11px]">
            {l.paths.map((p) => CHAIN_NAME[p.split("/")[2]?.replace("'", "") ?? ""] ?? p).join(" · ")}
          </p>
          {l.mode === "approve" && l.pending > 0 ? (
            <p className="text-foreground">{l.pending} trade(s) waiting for your approval in the HME Wallet.</p>
          ) : null}
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="rounded-sm border border-destructive/50 px-4 py-2 font-mono text-xs tracking-[0.16em] text-destructive uppercase disabled:opacity-50"
          >
            {stop.isPending ? "Revoking…" : "Revoke on Seeds"}
          </button>
          <p className="text-xs">Tip: revoke from the wallet too — it moves your coins home and retires the pocket.</p>
        </div>
      ) : manifest ? (
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-md bg-accent p-3 ring-1 ring-primary/30">
            <QRCodeSVG value={manifest} size={168} bgColor="transparent" fgColor="currentColor" className="text-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="text-foreground">Scan with the HME Wallet (web or Android).</p>
            <p className="mt-2">It will ask how Seeds should trade for you: instant access, or approve every trade. Code works for 10 minutes.</p>
            <p className="mt-2 break-all font-mono text-[10px]">{manifest}</p>
            <p className="mt-2 text-xs">Waiting for your wallet…</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>Link your HME Wallet's separate trading pocket. Your main wallet is never shared, and you can revoke anytime.</p>
          <button
            onClick={() => begin.mutate()}
            disabled={begin.isPending}
            className="mt-3 rounded-sm bg-primary px-4 py-2 font-mono text-xs tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
          >
            {begin.isPending ? "Preparing…" : "Link HME Wallet"}
          </button>
          {begin.error ? <p className="mt-2 text-xs text-destructive">Couldn't start the link. Try again.</p> : null}
        </div>
      )}
    </section>
  );
}
