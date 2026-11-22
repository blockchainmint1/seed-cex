/**
 * How a member opens Seeds, and what "re-link" means for them (pure, tested).
 *
 * Bobby (Nov 21 2026): coin / outside-wallet members are never forced to join Honest.Money;
 * they get reminders instead. Their trading pocket comes from the key they sign in with, so the
 * "re-link after two-factor and Telegram" step is simply signing in again with that coin or wallet
 * (same pocket number, same coins). Withdrawals also need a confirmed email, because Seeds emails
 * a code for every one.
 */
export type SignInKind = "hme" | "coin" | "evm" | "sol";
export type KeyKind = Exclude<SignInKind, "hme">;

export function isKeyKind(k: string | null | undefined): k is KeyKind {
  return k === "coin" || k === "evm" || k === "sol";
}

/** Which tab of /key-signin re-opens this account. */
export function keySigninTab(kind: KeyKind): "coin" | "wallet" {
  return kind === "coin" ? "coin" : "wallet";
}

const THING: Record<KeyKind, string> = { coin: "your coin", evm: "your Ethereum wallet", sol: "your Solana wallet" };

/** The member's own name for their key: "your coin", "your Ethereum wallet"… */
export function keyThing(kind: KeyKind): string {
  return THING[kind];
}

/**
 * Where the trading pocket comes from. Coin / wallet accounts: their sign-in key. Honest.Money members:
 * HME Wallet, or a coin / Vault / outside wallet they linked (viaLink) — then "re-link" means linking that key again.
 */
export type PocketSource = { kind: SignInKind; viaLink: boolean };
export function pocketSource(signIn: SignInKind, active: { source: string | null; keyKind: string | null } | null): PocketSource {
  if (isKeyKind(signIn)) return { kind: signIn, viaLink: false };
  if (active && active.source === "seeds_key" && isKeyKind(active.keyKind)) return { kind: active.keyKind, viaLink: true };
  return { kind: "hme", viaLink: false };
}

/** Plain step that refreshes the trading-pocket link (needed after two-factor / Telegram change). */
export function relinkStep(kind: SignInKind, viaLink = false): string {
  if (kind === "hme") return "re-link your HME Wallet in Account → Security";
  return viaLink
    ? `link ${THING[kind]} again using the button in Account → Security`
    : `sign in again with ${THING[kind]} using the button in Account → Security`;
}

/** Button label for that step. */
export function relinkButton(kind: SignInKind, viaLink = false): string {
  if (kind === "hme") return "Re-link HME Wallet";
  return viaLink ? `Link ${THING[kind]} again` : `Sign in again with ${THING[kind]}`;
}

export type KeyWithdrawStepKey = "email" | "two_factor" | "telegram" | "sign_in_again";
export type KeyWithdrawStep = { key: KeyWithdrawStepKey; label: string; hint: string; done: boolean };

/**
 * The four steps a coin / wallet member takes before their first withdrawal, in order.
 * "Sign in again" only counts once the server says withdrawals are ready (link newer than both
 * two-factor and Telegram), so it can never show done while the server would still refuse.
 */
export function keyWithdrawSteps(i: {
  kind: KeyKind;
  hasEmail: boolean;
  twoFactorOn: boolean;
  telegramOn: boolean;
  serverReady: boolean;
}): KeyWithdrawStep[] {
  const thing = THING[i.kind];
  return [
    { key: "email", label: "Add an email", hint: "Seeds emails a code for every withdrawal. Account → Profile.", done: i.hasEmail },
    { key: "two_factor", label: "Turn on two-factor sign-in", hint: "A 6-digit code from an app on your phone.", done: i.twoFactorOn },
    { key: "telegram", label: "Connect Telegram", hint: "Every withdrawal waits for your tap there.", done: i.telegramOn },
    {
      key: "sign_in_again",
      label: `Sign in again with ${thing}`,
      hint: `Do this last. It refreshes your trading pocket link: same pocket number, same coins, nothing moves.`,
      done: i.twoFactorOn && i.telegramOn && i.serverReady,
    },
  ];
}

/** Next step to do, or null when every step is done. */
export function nextKeyWithdrawStep(steps: KeyWithdrawStep[]): KeyWithdrawStep | null {
  return steps.find((s) => !s.done) ?? null;
}
