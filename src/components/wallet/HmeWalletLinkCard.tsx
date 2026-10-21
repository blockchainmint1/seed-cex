import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getMyHmeLink, revokeMyHmeLink, startHmeLink } from "@/lib/hme-link.functions";
import { Button } from "@/components/ui/button";
import { HmePocketBalances } from "./HmePocketBalances";
import { Link2, ShieldCheck, ExternalLink } from "lucide-react";

const CHAIN_NAME: Record<string, string> = { "696969": "TXC + TSD", "969696": "ISK", "0": "Bitcoin", "2": "Litecoin", "60": "ETH / USDC / USDT" };

export function HmeWalletLinkCard() {
  const qc = useQueryClient();
  const fetchLink = useServerFn(getMyHmeLink);
  const start = useServerFn(startHmeLink);
  const revoke = useServerFn(revokeMyHmeLink);
  const [manifest, setManifest] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const link = useQuery({
    queryKey: ["hme-link"],
    queryFn: () => fetchLink(),
    refetchInterval: 4000,
  });
  useEffect(() => { if (link.data) setManifest(null); }, [link.data]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => { setManifest(null); setExpiresAt(null); }, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const begin = useMutation({
    mutationFn: () => start({ data: { origin: window.location.origin } }),
    onSuccess: (r) => { setManifest(r.manifestUrl); setExpiresAt(r.expiresAt); },
  });
  const stop = useMutation({
    mutationFn: () => revoke(),
    onSuccess: () => { qc.removeQueries({ queryKey: ["hme-pocket-balances"] }); qc.invalidateQueries({ queryKey: ["hme-link"] }); },
  });

  const l = link.data;
  return (
    <section className="border-y border-border py-7">
      <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-bold text-foreground">HME Wallet trading pocket</h2></div>

      {l ? (
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Linked —{" "}
            <span className="text-foreground">{l.mode === "access" ? "instant trades (Seeds can sign)" : "you approve every trade in your wallet"}</span>
            . Pocket #{l.account}.
          </p>
          <p className="font-mono text-[11px]">
            {l.paths.map((p) => CHAIN_NAME[p.split("/")[2]?.replace("'", "") ?? ""] ?? p).join(" · ")}
          </p>
          {l.mode === "approve" && l.pending > 0 ? (
            <p className="text-foreground">{l.pending} trade(s) waiting for your approval in the HME Wallet.</p>
          ) : null}
          <Button
            variant="outline"
            onClick={() => { if (window.confirm("Revoke Seeds access? This deletes Seeds’ trading key but does not move your funds. Use Revoke in HME Wallet to move funds back and retire this pocket.")) stop.mutate(); }}
            disabled={stop.isPending}
            className="text-destructive"
          >
            {stop.isPending ? "Revoking…" : "Revoke on Seeds"}
          </Button>
          <Button asChild variant="ghost"><a href="https://mobile.honest.money" target="_blank" rel="noreferrer"><ExternalLink /> Open HME Wallet</a></Button>
          <p className="text-xs">Move funds into this pocket in HME Wallet. Its first number is 1106; Seeds follows the new number whenever your wallet retires a pocket.</p>
          <p className="text-xs">Revoking here removes Seeds access only. Revoking in HME Wallet also retires the pocket; check TSD and USDC separately before moving on.</p>
          <p className="border-l-2 border-warn pl-3 text-sm text-foreground">Wallet linking and balance sync work. Exchange and P2P settlement from linked pockets is not connected yet—do not fund this pocket for a Seeds trade yet.</p>
          <HmePocketBalances addresses={l.addresses} linkId={l.id} />
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
             <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setManifest(null); setExpiresAt(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>Connect the separate trading pocket in HME Wallet. Your main wallet and recovery phrase stay private.</p>
          <p className="mt-2">Choose instant access until revoked, or approve every trade in HME Wallet. Ethereum approval is not supported yet.</p>
          <Button
            onClick={() => begin.mutate()}
            disabled={begin.isPending}
            className="mt-4"
          >
            <Link2 />
            {begin.isPending ? "Preparing…" : "Link HME Wallet"}
          </Button>
          {begin.error ? <p className="mt-2 text-xs text-destructive">Couldn't start the link. Try again.</p> : null}
        </div>
      )}
      {link.isPending ? <p className="mt-3 text-sm text-muted-foreground">Checking your wallet connection…</p> : null}
      {link.error ? <p role="alert" className="mt-3 text-sm text-destructive">{link.error.message}</p> : null}
      {stop.error ? <p role="alert" className="mt-3 text-sm text-destructive">Could not revoke access. Try again.</p> : null}
    </section>
  );
}
