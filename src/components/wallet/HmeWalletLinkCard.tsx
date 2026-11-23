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
import { coinNames, coinsToAdd, linkCoins } from "@/lib/hme-link-rules";
import { Link2, ShieldCheck, ExternalLink, PlusCircle } from "lucide-react";
import { useMyIdentity } from "@/components/account/use-identity";
import { SignInAgainButton } from "@/components/account/KeyWithdrawSteps";
import { keyThing } from "@/lib/account/sign-in-kind";
import { LinkOptions } from "./LinkOptions";

function LinkQr({ manifest, onCancel, updating }: { manifest: string; onCancel: () => void; updating?: boolean }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="rounded-md bg-accent p-3 ring-1 ring-primary/30">
        <QRCodeSVG value={manifest} size={168} bgColor="transparent" fgColor="currentColor" className="text-foreground" />
      </div>
      <div className="min-w-0 text-sm text-muted-foreground">
        <p className="text-foreground">Scan with the HME Wallet (web or Android).</p>
        {updating ? (
          <p className="mt-2">It will say "Update your Seeds link" — same pocket and addresses, so no coins move. Your current link keeps working until the update goes through. Code works for 10 minutes.</p>
        ) : (
          <p className="mt-2">It will ask how Seeds should trade for you: instant access, or approve every trade. Code works for 10 minutes.</p>
        )}
        <p className="mt-2 break-all font-mono text-[10px]">{manifest}</p>
        <p className="mt-2 text-xs">Waiting for your wallet…</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function HmeWalletLinkCard({ showBalances = true, className = "border-y border-border py-7" }: { showBalances?: boolean; className?: string } = {}) {
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
  // A new link (first link or "Add new coins" update) shows up as a new link id; close the QR then.
  const linkId = link.data?.id ?? null;
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (link.isPending) return;
    if (seenId !== undefined && linkId !== seenId) { setManifest(null); setExpiresAt(null); }
    setSeenId(linkId);
  }, [linkId, link.isPending]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Where the pocket comes from: HME Wallet, or a coin / Vault / outside wallet (the member's sign-in key,
  // or one an Honest.Money member linked — then "re-link" means linking it again, not signing in).
  const id = useMyIdentity();
  const keyKind = id.pocketKeyKind;
  const viaLink = id.pocketViaLink;
  const thing = keyKind ? keyThing(keyKind) : "";
  const again = viaLink ? `link ${thing} again` : `sign in again with ${thing}`;
  const Again = again.charAt(0).toUpperCase() + again.slice(1);
  const l = link.data;
  const extraCoins = l && !keyKind ? Object.keys(l.addresses).filter((c) => (HME_WALLET_CANT_HOLD as string[]).includes(c)) : [];
  const extraWarning = hmeCantHoldWarning(extraCoins);
  const toAdd = l && !keyKind ? coinsToAdd(l) : [];
  return (
    <section className={className}>
      <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-bold text-foreground">{keyKind || !l ? "Trading pocket" : "HME Wallet trading pocket"}</h2></div>

      {l ? (
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Linked —{" "}
            <span className="text-foreground">{l.mode === "access" ? "instant trades (Seeds can sign)" : "you approve every trade in your wallet"}</span>
            . Pocket #{l.account}.
          </p>
          <div className="rounded-md bg-accent/60 px-3 py-2.5 ring-1 ring-primary/25">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{keyKind ? "Set up by" : "Linked wallet"}</p>
            {l.vaultName ? <p className="mt-1 font-semibold text-foreground">{l.vaultName} <span className="text-xs font-normal text-muted-foreground">· the seed ID HME Vault shows next to this seed</span></p> : null}
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
              {keyKind
                ? `The key that set up this pocket link when you ${viaLink ? "linked" : "signed in with"} ${thing} on ${new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
                : <>This is the address inside your wallet that signed the link on{" "}
              {new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
              Match it against the address shown in your wallet to confirm which wallet or app this is.</>}
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
          <p className="font-mono text-[11px]">{coinNames(linkCoins(l)).join(" · ")}</p>
          {l.justUpdated ? (
            <p role="status" className="rounded-md bg-accent/60 px-3 py-2 text-sm text-foreground ring-1 ring-primary/25">
              Link updated at {new Date(l.justUpdated.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} — same pocket #{l.account}, same addresses, nothing moved.
              {l.justUpdated.added.length ? ` Added: ${coinNames(l.justUpdated.added as Parameters<typeof coinNames>[0]).join(", ")}.` : " No new coins came through — your HME Wallet may need updating."}
            </p>
          ) : null}
          {toAdd.length ? (
            <div className="rounded-md border border-border bg-surface px-3 py-3">
              <p className="text-foreground">
                Seeds can now link {toAdd.length === 1 ? "one more coin" : `${toAdd.length} more coins`} from your Trading pocket: {coinNames(toAdd).join(", ")}.
              </p>
              <p className="mt-1 text-xs">
                Open HME Wallet to approve. You'll enter your wallet password; nothing moves, and your pocket number and addresses stay the same.
                You need the latest HME Wallet — an older version can't share these coins{l.mode === "approve" ? ", and the extra coins need instant access (HME Wallet can't sign them)" : ""}.
              </p>
              {manifest ? (
                <LinkQr manifest={manifest} updating onCancel={() => { setManifest(null); setExpiresAt(null); }} />
              ) : (
                <Button onClick={() => begin.mutate()} disabled={begin.isPending} size="sm" className="mt-3">
                  <PlusCircle />
                  {begin.isPending ? "Preparing…" : "Add new coins"}
                </Button>
              )}
              {begin.error ? <p className="mt-2 text-xs text-destructive">Couldn't start the update. Try again.</p> : null}
            </div>
          ) : null}
          {l.mode === "access" && (l.withdrawals === "needs_2fa" || l.withdrawals === "needs_relink") ? (
            <div className="rounded-md border border-warn/60 bg-surface px-3 py-3" role="status">
              {keyKind ? (
                <>
                  <p className="font-semibold text-foreground">
                    {l.withdrawals === "needs_2fa" ? "Withdrawals are off: turn on two-factor first" : `${Again} to turn on withdrawals`}
                  </p>
                  <p className="mt-1 text-xs">
                    {l.withdrawals === "needs_2fa"
                      ? `Seeds only sends withdrawals from a pocket link made after two-factor sign-in and Telegram are on. Turn both on, then ${again}. Trading isn't affected.`
                      : `This pocket link was made before your security setup, so Seeds won't send withdrawals from it. ${Again} once: same pocket, same coins, nothing moves. Trading isn't affected.`}
                  </p>
                  {l.withdrawals === "needs_relink" ? <div className="mt-3"><SignInAgainButton kind={keyKind} viaLink={viaLink} /></div> : null}
                </>
              ) : (
                <>
              <p className="font-semibold text-foreground">
                {l.withdrawals === "needs_2fa" ? "Withdrawals are off: turn on two-factor first" : "Re-link to turn on withdrawals"}
              </p>
              <p className="mt-1 text-xs">
                {l.withdrawals === "needs_2fa"
                  ? "Seeds only sends withdrawals from a wallet link made after two-factor sign-in is on. Turn on two-factor sign-in first (Account → Security), then re-link here. Trading isn't affected."
                  : "This link was made before two-factor was on, so Seeds won't send withdrawals from it. Re-link once with HME Wallet: same pocket, same coins, nothing moves. Trading isn't affected."}
              </p>
              {l.withdrawals === "needs_relink" ? (
                toAdd.length ? (
                  <p className="mt-2 text-xs text-foreground">Tap <b>Add new coins</b> above. That re-links too.</p>
                ) : manifest ? (
                  <LinkQr manifest={manifest} updating onCancel={() => { setManifest(null); setExpiresAt(null); }} />
                ) : (
                  <Button onClick={() => begin.mutate()} disabled={begin.isPending} size="sm" className="mt-3">
                    <Link2 />
                    {begin.isPending ? "Preparing…" : "Re-link HME Wallet"}
                  </Button>
                )
              ) : null}
                </>
              )}
            </div>
          ) : null}
          {l.mode === "approve" && l.pending > 0 ? (
            <p className="text-foreground">{l.pending} trade(s) waiting for your approval in the HME Wallet.</p>
          ) : null}
          <RevokeSeedsDialog extraCoins={extraCoins} pending={stop.isPending} onConfirm={() => stop.mutate()} keyAccount={Boolean(keyKind)} viaLink={viaLink} />
          {keyKind ? (
            <>
              <Button asChild variant="ghost"><Link to="/account/balances/deposit">Deposit into this pocket</Link></Button>
              <p className="text-xs">This pocket comes from {thing}: only that key can rebuild it, and Seeds never saw your recovery phrase. Revoking here stops Seeds trading from it; {viaLink ? "linking it again" : "signing in again"} afterwards brings back this same pocket and its addresses.</p>
              {viaLink ? <p className="text-xs">Want HME Wallet or a different key instead? Revoke Seeds' access here first, then pick another option. Move your coins out of this pocket before you switch: a different key means different addresses.</p> : null}
            </>
          ) : (
            <>
              <Button asChild variant="ghost"><a href="https://mobile.honest.money" target="_blank" rel="noreferrer"><ExternalLink /> Open HME Wallet</a></Button>
              <p className="text-xs">Move funds into this pocket in HME Wallet. Seeds always uses pocket 1106, so your addresses stay the same even if you revoke and link again.</p>
              <p className="text-xs">Revoking here removes Seeds access only. Revoking in HME Wallet also retires the pocket; check TSD and USDC separately before moving on.</p>
              {id.keyKind ? null : <p className="text-xs">Want a Cold Storage Coin, HME Vault or another wallet instead? Revoke Seeds' access here first, then pick one. A different key means different addresses, so move your coins first.</p>}
            </>
          )}
          {extraWarning ? (
            <p className="border-l-2 border-warn pl-3 text-sm text-foreground">
              {extraWarning}{" "}
              <Link to="/swap" className="text-primary underline">Swap to TSD</Link>
            </p>
          ) : null}
          {showBalances ? <HmePocketBalances addresses={l.addresses} linkId={l.id} /> : null}
        </div>
      ) : manifest ? (
        <LinkQr manifest={manifest} onCancel={() => { setManifest(null); setExpiresAt(null); }} />
      ) : id.keyKind ? (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>No active trading pocket. Sign in again with {keyThing(id.keyKind)} to set up a new one. Nothing moves, and Seeds never sees your recovery phrase.</p>
          <div className="mt-4"><SignInAgainButton kind={id.keyKind} size="default" /></div>
        </div>
      ) : (
        <LinkOptions onLinkHme={() => begin.mutate()} hmePending={begin.isPending} hmeError={Boolean(begin.error)} />
      )}
      {link.isPending ? <p className="mt-3 text-sm text-muted-foreground">Checking your wallet connection…</p> : null}
      {link.error ? <p role="alert" className="mt-3 text-sm text-destructive">{link.error.message}</p> : null}
      {stop.error ? <p role="alert" className="mt-3 text-sm text-destructive">Could not revoke access. Try again.</p> : null}
    </section>
  );
}
