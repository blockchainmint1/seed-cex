import { useNavigate } from "@tanstack/react-router";
import { Check, KeyRound, Link2, Minus, Vault, Wallet, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { rememberReturnPath } from "@/lib/return-path";

type KeyOption = {
  value: "coin" | "vault" | "wallet";
  icon: ReactNode;
  title: string;
  line: string;
  pros: string[];
  cons: string[];
  button: string;
};

/** Other ways an Honest.Money member can set up their trading pocket (link mode on the Seeds Key page). */
const KEY_OPTIONS: KeyOption[] = [
  {
    value: "coin",
    icon: <KeyRound className="h-4 w-4" />,
    title: "Cold Storage Coin",
    line: "Scan the QR on your physical coin.",
    pros: [
      "Your coin's recovery phrase is scanned on your phone, on the Seeds Key page. Seeds never sees it.",
      "The same coin always rebuilds the same pocket and addresses.",
      "No app to install.",
    ],
    cons: [
      "Anyone holding the coin, or a photo of its QR, can rebuild the pocket. Treat it like cash.",
      "Instant trades only: Seeds holds a sealed key until you revoke.",
      "You need a phone with a camera.",
    ],
    button: "Link my coin",
  },
  {
    value: "vault",
    icon: <Vault className="h-4 w-4" />,
    title: "HME Vault",
    line: "An offline phone that keeps your phrase.",
    pros: [
      "Your Vault phone stays offline and checks that the request really came from Seeds.",
      "Works with an extra password on your phrase.",
      "Your recovery phrase never leaves the Vault phone.",
    ],
    cons: [
      "You need a second phone set up with HME Vault.",
      "Only works on the live Seeds site (seeds.honest.money).",
      "Instant trades only: Seeds holds a sealed key until you revoke.",
    ],
    button: "Link HME Vault",
  },
  {
    value: "wallet",
    icon: <Wallet className="h-4 w-4" />,
    title: "MetaMask, Ledger or another wallet",
    line: "Trezor, Phantom and phone wallets work too.",
    pros: [
      "One signature. You never type a recovery phrase.",
      "Hardware wallets work, and the same wallet always rebuilds the same pocket.",
      "Ethereum and Solana wallets both work.",
    ],
    cons: [
      "The pocket is a separate set of addresses made from your signature. Your wallet app won't show its balance; Seeds does.",
      "Only ever sign that message on key.seeds.honest.money. A fake site could copy your pocket.",
      "Instant trades only: Seeds holds a sealed key until you revoke.",
    ],
    button: "Link my wallet",
  },
];

function ProsCons({ pros, cons }: { pros: string[]; cons: string[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Good</p>
        <ul className="mt-2 space-y-1.5">
          {pros.map((t) => <li key={t} className="flex gap-2 text-sm text-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t}</li>)}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keep in mind</p>
        <ul className="mt-2 space-y-1.5">
          {cons.map((t) => <li key={t} className="flex gap-2 text-sm text-muted-foreground"><Minus className="mt-0.5 h-4 w-4 shrink-0" />{t}</li>)}
        </ul>
      </div>
    </div>
  );
}

/**
 * The "no trading pocket yet" choice for Honest.Money members: one big HME Wallet tile, then smaller
 * tiles that open to show the good and the trade-offs of a coin, HME Vault or an outside wallet.
 */
export function LinkOptions({ onLinkHme, hmePending, hmeError }: { onLinkHme: () => void; hmePending: boolean; hmeError: boolean }) {
  const navigate = useNavigate();
  const linkKey = (kind: KeyOption["value"]) => {
    rememberReturnPath("/account/security");
    navigate({ to: "/key-signin", search: { kind, link: true } });
  };
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border-2 border-primary/50 bg-accent/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold text-foreground">Link HME Wallet</h3>
          <span className="rounded-sm bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">Recommended</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Connect the separate trading pocket in HME Wallet. Your main wallet and recovery phrase stay private.</p>
        <div className="mt-4">
          <ProsCons
            pros={[
              "Built for Honest.Money: you see the same pocket in HME Wallet and can move coins from there yourself.",
              "Choose instant trades, or approve every trade in HME Wallet.",
              "Seeds always uses pocket 1106, so your addresses stay the same if you revoke and link again.",
            ]}
            cons={[
              "You need the HME Wallet app (web or Android).",
              "Some coins Seeds trades aren't in HME Wallet yet. Seeds can still move them for you.",
              "Approve-every-trade doesn't cover Ethereum yet.",
            ]}
          />
        </div>
        <Button onClick={onLinkHme} disabled={hmePending} className="mt-5">
          <Link2 />
          {hmePending ? "Preparing…" : "Link HME Wallet"}
        </Button>
        {hmeError ? <p className="mt-2 text-xs text-destructive">Couldn't start the link. Try again.</p> : null}
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">Or use a key you already have</p>
        <p className="text-xs text-muted-foreground">Same Seeds account and sign-in. Only your trading pocket comes from this key, through the Seeds Key page.</p>
        <Accordion type="single" collapsible className="mt-3 space-y-2">
          {KEY_OPTIONS.map((o) => (
            <AccordionItem key={o.value} value={o.value} className="rounded-md border border-border bg-surface px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="flex items-center gap-3 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary">{o.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{o.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{o.line}</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <ProsCons pros={o.pros} cons={o.cons} />
                <Button variant="outline" className="mt-4" onClick={() => linkKey(o.value)}>{o.icon} {o.button}</Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
