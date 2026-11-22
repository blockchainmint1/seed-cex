import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Circle, KeyRound } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { rememberReturnPath } from "@/lib/return-path";
import { keySigninTab, keyWithdrawSteps, nextKeyWithdrawStep, relinkButton, type KeyKind, type KeyWithdrawStepKey } from "@/lib/account/sign-in-kind";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/account/ui";
import { useMyIdentity } from "@/components/account/use-identity";
import { useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { useWithdrawals } from "@/components/account/SeedsWithdraw";

const WHERE: Record<Exclude<KeyWithdrawStepKey, "sign_in_again">, "/account/profile" | "/account/security" | "/account/alerts"> = {
  email: "/account/profile",
  two_factor: "/account/security",
  telegram: "/account/alerts",
};

/**
 * "Sign in again with your coin": refreshes the pocket link after two-factor / Telegram (same pocket, same coins).
 * Honest.Money members who linked a coin or wallet (viaLink) link it again instead — they stay signed in.
 */
export function SignInAgainButton({ kind, viaLink = false, size = "sm", variant = "default" }: { kind: KeyKind; viaLink?: boolean; size?: "sm" | "default"; variant?: "default" | "outline" }) {
  const navigate = useNavigate();
  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => {
        rememberReturnPath("/account/security");
        navigate({ to: "/key-signin", search: viaLink ? { kind: keySigninTab(kind), link: true } : { kind: keySigninTab(kind) } });
      }}
    >
      <KeyRound /> {relinkButton(kind, viaLink)}
    </Button>
  );
}

/** Coin / outside-wallet members: the four steps to their first withdrawal, in order. Renders nothing for HME sign-ins. */
export function KeyWithdrawSteps() {
  const id = useMyIdentity();
  const tf = useMyTwoFactor();
  const loadProfile = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => loadProfile() });
  const kind = id.keyKind;
  const w = useWithdrawals(null, Boolean(kind));
  if (!kind || !id.data || tf.isPending || profile.isPending) return null;

  const steps = keyWithdrawSteps({
    kind,
    hasEmail: Boolean(id.data.email),
    twoFactorOn: Boolean(tf.data),
    telegramOn: Boolean(profile.data?.telegram_verified),
    serverReady: w.data?.readiness === "ready",
  });
  const next = nextKeyWithdrawStep(steps);
  const left = steps.filter((s) => !s.done).length;

  return (
    <Card
      title="Turn on withdrawals"
      desc={next ? `${steps.length - left} of ${steps.length} done. Trading works now; these steps are only for sending coins out.` : "All set. Every withdrawal asks for an email code, an authenticator code and your Telegram tap."}
    >
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${s.done ? "text-muted-foreground" : "text-foreground"}`}>{i + 1}. {s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </span>
            {!s.done && s.key !== "sign_in_again" && next?.key === s.key ? (
              <Link to={WHERE[s.key]} className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-semibold text-primary hover:underline">Do it <ArrowRight className="h-3 w-3" /></Link>
            ) : null}
          </li>
        ))}
      </ol>
      {next?.key === "sign_in_again" ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Last step. {kind === "coin" ? "You'll scan your coin on the Seeds Key page again" : "Your wallet will ask you to approve a sign-in on the Seeds Key page"} (only ever at key.seeds.honest.money), then you come straight back here.
          </p>
          <SignInAgainButton kind={kind} />
        </div>
      ) : null}
    </Card>
  );
}
