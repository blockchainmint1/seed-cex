import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getMyHmeLink, revokeMyHmeLink, startHmeLink } from "@/lib/hme-link.functions";
import { Button } from "@/components/ui/button";
import { HmePocketBalances } from "./HmePocketBalances";
import { RevokeSeedsDialog } from "./RevokeSeedsDialog";
import { HME_WALLET_CANT_HOLD, hmeCantHoldWarning } from "@/lib/pockets/hme-support";
import { Link2, ShieldCheck, ExternalLink } from "lucide-react";

const CHAIN_NAME: Record<string, string> = {
  "696969": "TXC + TSD", "969696": "ISK", "0": "Bitcoin", "2": "Litecoin", "60": "ETH / USDC / USDT",
  "3": "Dogecoin", "145": "Bitcoin Cash", "133": "Zcash", "144": "XRP", "195": "TRON", "501": "Solana",
};

export function HmeWalletLinkCard() {
  const qc = useQueryClient();
  const fetchLink = useServerFn(getMyHmeLink);
  const start = useServerFn(startHmeLink);
  const revoke = useServerFn(revokeMyHmeLink);
  const [manifest, setManifest] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const extraCoins = l ? Object.keys(l.addresses).filter((c) => (HME_WALLET_CANT_HOLD as string[]).includes(c)) : [];
  const extraWarning = hmeCantHoldWarning(extraCoins);
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
          <div className="rounded-md bg-accent/60 px-3 py-2.5 ring-1 ring-primary/25">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked wallet</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                title="Copy wallet identity address"
                onClick={() => { navigator.clipboard.writeText(l.identityAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="font-mono text-[12px] text-foreground underline decoration-dotted underline-offset-4"
              >
                {l.identityAddress}
              </button>
              <span className="text-xs">{copied ? "✓ copied" : "tap to copy"}</span>
            </div>
            <p className="mt-1.5 text-xs">
              This is the address inside your wallet that signed the link on{" "}
              {new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
              Match it against the address shown in your wallet to confirm which wallet or app this is.
              {" "}{l.mode === "access" && l.keyHeld
                ? "Seeds holds the sealed spending key for this pocket until you revoke."
                : l.mode === "access"
                  ? "Your wallet connected without leaving a sealed key — every payment needs the wallet present."
                  : "Seeds holds no key; your wallet signs each trade."}
            </p>
          </div>
          {l.previous ? (
            <p className="text-xs">
              Earlier pocket #{l.previous.account} (wallet {l.previous.identityAddress.slice(0, 10)}…{l.previous.identityAddress.slice(-6)}) was linked{" "}
              {new Date(l.previous.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} and revoked{" "}
              {new Date(l.previous.revokedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — if you funded that pocket, look in the wallet that owns{" "}
              <span className="font-mono">{l.previous.identityAddress}</span>.
            </p>
          ) : null}
          <p className="font-mono text-[11px]">
            {l.paths.map((p) => CHAIN_NAME[p.split("/")[2]?.replace("'", "") ?? ""] ?? p).join(" · ")}
          </p>
          {l.mode === "approve" && l.pending > 0 ? (
            <p className="text-foreground">{l.pending} trade(s) waiting for your approval in the HME Wallet.</p>
          ) : null}
          <RevokeSeedsDialog extraCoins={extraCoins} pending={stop.isPending} onConfirm={() => stop.mutate()} />
          <Button asChild variant="ghost"><a href="https://mobile.honest.money" target="_blank" rel="noreferrer"><ExternalLink /> Open HME Wallet</a></Button>
          <p className="text-xs">Move funds into this pocket in HME Wallet. Its first number is 1106; Seeds follows the new number whenever your wallet retires a pocket.</p>
          <p className="text-xs">Revoking here removes Seeds access only. Revoking in HME Wallet also retires the pocket; check TSD and USDC separately before moving on.</p>
          {extraWarning ? (
            <p className="border-l-2 border-warn pl-3 text-sm text-foreground">
              {extraWarning}{" "}
              <Link to="/swap" className="text-primary underline">Swap to TSD</Link>
            </p>
          ) : null}
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
