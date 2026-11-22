import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getMyExtraPocketBalances } from "@/lib/pockets/pockets.functions";
import { listCoins, revokeCheck } from "@/lib/pockets/hme-support";

const amt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

/**
 * "Revoke on Seeds" confirmation. Revoking can never be blocked (a member on a
 * lost or compromised device must be able to cut access), but when coins HME
 * Wallet can't hold are still in the pocket we show them and ask for an
 * explicit acknowledgement first.
 */
export function RevokeSeedsDialog({ extraCoins, pending, onConfirm, keyAccount = false, viaLink = false }: { extraCoins: string[]; pending: boolean; onConfirm: () => void; keyAccount?: boolean; viaLink?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const read = useServerFn(getMyExtraPocketBalances);
  const balances = useQuery({
    queryKey: ["hme-extra-before-revoke"],
    queryFn: () => read({ data: { fresh: true } }),
    enabled: open && extraCoins.length > 0,
    staleTime: 0,
  });
  const check = revokeCheck(balances.data ?? []);
  const checking = extraCoins.length > 0 && balances.isFetching;
  const unread = balances.isError ? extraCoins : check.unknown;
  const needsAck = extraCoins.length > 0 && (check.stranded.length > 0 || check.unknown.length > 0 || balances.isError);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAck(false); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending} className="text-destructive">
          {pending ? "Revoking…" : "Revoke on Seeds"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke Seeds access?</AlertDialogTitle>
          {keyAccount ? (
            <AlertDialogDescription>
              This deletes Seeds’ trading key for this pocket. It doesn’t move your funds, but afterwards Seeds can’t trade, swap or
              withdraw from this pocket for you. Withdraw first if you want your coins somewhere else. {viaLink ? "Linking the same key again later" : "Signing in again later"} brings
              back this same pocket (1106) with the same addresses; coins left in it stay under your own key.
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription>
              This deletes Seeds’ trading key. It doesn’t move your funds — use Revoke in HME Wallet to move TXC, ISK, BTC, LTC
              and ETH back and retire this pocket. Withdraw any PLS or pHEX on Seeds first: HME Wallet can’t send on PulseChain,
              so after a revoke only your recovery phrase in a PulseChain wallet can move them.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {extraCoins.length > 0 ? (
          checking ? (
            <p className="text-sm text-muted-foreground">Checking your {listCoins(extraCoins)} balances…</p>
          ) : check.stranded.length > 0 ? (
            <div className="space-y-2 border-l-2 border-destructive pl-3 text-sm text-foreground">
              <p className="font-semibold">Swap these back to TSD first — HME Wallet can’t hold them:</p>
              <ul className="num text-xs">
                {check.stranded.map((r) => <li key={r.coin}>{amt(r.balance)} {r.coin}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">
                After you revoke, Seeds can’t swap them for you. They’d stay put, and you’d need your recovery phrase in another
                wallet that supports each coin to get them out.
              </p>
              <Button asChild size="sm"><Link to="/swap">Swap to TSD</Link></Button>
            </div>
          ) : check.unknown.length > 0 || balances.isError ? (
            <p className="border-l-2 border-warn pl-3 text-sm text-foreground">
              We couldn’t read {listCoins(unread)} right now. HME Wallet can’t hold {unread.length > 1 ? "these coins" : "this coin"}, so if you
              have any in your pocket, <Link to="/swap" className="text-primary underline">swap {unread.length > 1 ? "them" : "it"} to TSD</Link> before you revoke.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Your {listCoins(extraCoins)} pockets are empty, so nothing is left behind.</p>
          )
        ) : null}

        {needsAck && !checking ? (
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-primary" />
            <span>I understand these coins stay in the pocket and only my recovery phrase can get them out after I revoke.</span>
          </label>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Keep access</AlertDialogCancel>
          <AlertDialogAction
            disabled={checking || (needsAck && !ack)}
            onClick={() => onConfirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {needsAck ? "Revoke anyway" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
