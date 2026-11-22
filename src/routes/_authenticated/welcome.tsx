import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Circle, Flame, Fuel, HandCoins, KeyRound, Mail, ShieldCheck, Smartphone, Sprout } from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { setMyOnboarding } from "@/lib/onboarding.functions";
import { getMyFeePrep } from "@/lib/fee-prep.functions";
import { FEE_PREP } from "@/lib/fee-prep";
import { getIgniteSeats, getMyIgnite } from "@/lib/ignite.functions";
import {
  afterOnboarding, cleanStep, ONBOARDING_QUERY, nextStep, prevStep, STEP_LABELS, stepNumber, stepsFor, type OnboardingStep,
} from "@/lib/onboarding";
import { DEPOSIT_USD, SCHEDULE_DATES, SCHEDULE_START_UTC, SCHEDULE_TIME } from "@/lib/ignite-registration";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, fieldLabel, inputCls, Note } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { KeyIdentityCard } from "@/components/account/KeyIdentityCard";
import { SignInAgainButton } from "@/components/account/KeyWithdrawSteps";
import { useJoinHonestMoney, useMyIdentity } from "@/components/account/use-identity";
import { keyThing } from "@/lib/account/sign-in-kind";
import { usePocketLink } from "@/components/account/use-pocket";
import { TelegramCard } from "@/components/account/TelegramCard";
import { TwoFactorCard, useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { shownEmail } from "@/lib/key-signin/rules";

const RESUME_KEY = "seeds-welcome-step";

export const Route = createFileRoute("/_authenticated/welcome")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): { step?: OnboardingStep; next?: string } => ({
    step: s.step != null ? cleanStep(s.step) : undefined,
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Welcome to Seeds — set up your account" },
      { name: "description", content: "A short setup guide for new Seeds members: your name, trading pocket, an easy login, alerts, two-factor and the Ignite class." },
      { property: "og:title", content: "Welcome to Seeds — set up your account" },
      { property: "og:description", content: "Set up your Seeds account in a few minutes. Skip any step and come back later." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useSession();
  const finish = useServerFn(setMyOnboarding);
  const [leaving, setLeaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Opened without a step (e.g. sent here again after leaving mid-way): carry on where they left off.
  const resumeKey = user ? `${RESUME_KEY}:${user.id}` : null;
  useEffect(() => {
    if (search.step || !resumeKey) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(resumeKey); } catch { /* private mode */ }
    const s = cleanStep(saved);
    if (s !== "welcome" && s !== "done") navigate({ to: "/welcome", search: { step: s, next: search.next }, replace: true });
  }, [search.step, search.next, resumeKey, navigate]);

  const step = search.step ?? "welcome";
  useEffect(() => {
    if (!resumeKey) return;
    try { localStorage.setItem(resumeKey, step); } catch { /* private mode */ }
  }, [step, resumeKey]);

  const go = (s: OnboardingStep) => {
    navigate({ to: "/welcome", search: { step: s, next: search.next } });
    window.scrollTo({ top: 0 });
  };

  async function leave(status: "done" | "skipped") {
    setLeaving(true); setErr(null);
    try {
      await finish({ data: { status } });
      qc.setQueryData(ONBOARDING_QUERY, { status });
      if (resumeKey) try { localStorage.removeItem(resumeKey); } catch { /* ignore */ }
      navigate({ href: afterOnboarding(search.next), replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setLeaving(false);
    }
  }

  // Reaching the last screen counts as finishing, whichever button they press next.
  const marked = useRef(false);
  useEffect(() => {
    if (step !== "done" || marked.current) return;
    marked.current = true;
    finish({ data: { status: "done" } })
      .then(() => {
        qc.setQueryData(ONBOARDING_QUERY, { status: "done" });
        if (resumeKey) try { localStorage.removeItem(resumeKey); } catch { /* ignore */ }
      })
      .catch(() => { marked.current = false; });
  }, [step, finish, qc, resumeKey]);

  // Coin / Vault / wallet members get the extra "Easy login" step (join Honest.Money).
  const identity = useMyIdentity();
  const steps = stepsFor({ keyMember: Boolean(identity.keyKind) });
  useEffect(() => {
    if (identity.isPending || steps.includes(step)) return;
    navigate({ to: "/welcome", search: { step: nextStep(step, steps), next: search.next }, replace: true });
  }, [identity.isPending, steps, step, search.next, navigate]);

  const { n, of } = stepNumber(step, steps);
  const back = prevStep(step, steps);
  const forward = () => go(nextStep(step, steps));

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
            <Sprout className="h-3.5 w-3.5" /> Setup guide
          </p>
          {step !== "done" ? (
            <Button variant="ghost" size="sm" onClick={() => leave("skipped")} disabled={leaving}>Skip setup</Button>
          ) : null}
        </div>

        {step !== "done" ? <Progress step={step} steps={steps} n={n} of={of} /> : null}
        {err ? <div className="mt-4"><Note tone="error">{err}</Note></div> : null}

        <div className="mt-8">
          {step === "welcome" ? <StepWelcome onNext={forward} /> : null}
          {step === "name" ? <StepName onNext={forward} /> : null}
          {step === "wallet" ? <StepWallet /> : null}
          {step === "login" && identity.keyKind ? <StepLogin /> : null}
          {step === "fees" ? <StepFees onSkip={forward} /> : null}
          {step === "alerts" ? <StepAlerts /> : null}
          {step === "security" ? <StepSecurity /> : null}
          {step === "ignite" ? <StepIgnite /> : null}
          {step === "done" ? <StepDone onFinish={() => navigate({ href: afterOnboarding(search.next), replace: true })} /> : null}
        </div>

        {step !== "welcome" && step !== "name" && step !== "done" ? (
          <StepNav back={back ? () => go(back) : null} onNext={forward} nextLabel={step === "ignite" ? "Finish" : "Continue"} />
        ) : null}
        {step === "name" ? <StepNavBack back={() => go("welcome")} /> : null}
      </div>
    </div>
  );
}

function Progress({ step, steps: all, n, of }: { step: OnboardingStep; steps: readonly OnboardingStep[]; n: number; of: number }) {
  const steps = all.filter((s) => s !== "done");
  const at = all.indexOf(step);
  const keyKind = useMyIdentity().keyKind;
  const label = (x: OnboardingStep) => (x === "wallet" && keyKind ? "Your pocket" : STEP_LABELS[x]);
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Step {n} of {of}</span> · {label(step)}</p>
      <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Setup progress">
        {steps.map((s, i) => (
          <li key={s} className="min-w-0">
            <span aria-hidden className={`block h-1.5 rounded-full ${i <= at ? "bg-primary" : "bg-muted"}`} />
            <span className={`mt-1.5 hidden truncate text-[11px] md:block ${i === at ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label(s)}</span>
            <span className="sr-only">{label(s)}{i < at ? " (done)" : i === at ? " (current)" : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepNav({ back, onNext, nextLabel }: { back: (() => void) | null; onNext: () => void; nextLabel: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      {back ? <Button variant="outline" onClick={back}><ArrowLeft /> Back</Button> : <span />}
      <Button onClick={onNext}>{nextLabel} <ArrowRight /></Button>
    </div>
  );
}
function StepNavBack({ back }: { back: () => void }) {
  return (
    <div className="mt-8 border-t border-border pt-5">
      <Button variant="outline" onClick={back}><ArrowLeft /> Back</Button>
    </div>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-extrabold md:text-3xl">{title}</h1>
      {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  const load = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const first = (profile.data?.display_name ?? "").trim().split(/\s+/)[0];
  const points = [
    { icon: HandCoins, title: "Your coins stay with you", text: "Seeds trades from a separate trading pocket that only your own wallet or coin can open. Seeds never holds your coins." },
    { icon: ShieldCheck, title: "No KYC, no trading fees", text: "No ID uploads, and Seeds takes no cut of your trades.", to: "/about/kyc" as const, cta: "Why no KYC" },
    { icon: CalendarDays, title: "Trading opens November 30, 2026", text: "Until then Seeds is in demo mode. You can set up your account and link your wallet now.", to: "/coming-soon" as const, cta: "What's coming" },
  ];
  return (
    <>
      <Heading title={first ? `Welcome to Seeds, ${first}` : "Welcome to Seeds"}>
        Let's get your account ready. It takes about five minutes. You can skip any step, and reopen this guide from your account page whenever you like.
      </Heading>
      <ul className="grid gap-3 md:grid-cols-3">
        {points.map((p) => (
          <li key={p.title} className="rounded-md border border-border bg-surface p-4">
            <p.icon aria-hidden className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            {"to" in p && p.to ? <Link to={p.to} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{p.cta} <ArrowRight className="h-3 w-3" /></Link> : null}
          </li>
        ))}
      </ul>
      <div className="mt-8 border-t border-border pt-5">
        <Button size="lg" onClick={onNext}>Start setup <ArrowRight /></Button>
      </div>
    </>
  );
}

function StepName({ onNext }: { onNext: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = profile.data?.display_name ?? "";
  const value = name ?? current;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (v.length < 2) { setErr("Enter at least 2 characters."); return; }
    setBusy(true); setErr(null);
    try {
      if (v !== current) {
        await save({ data: { display_name: v } });
        await qc.invalidateQueries({ queryKey: ["my-profile"] });
      }
      onNext();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't save your name.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Heading title="What should we call you?">
        Shown on your account, in emails from Seeds, and to people you trade with on P2P. Your email stays private.
      </Heading>
      <form onSubmit={submit} className="max-w-md space-y-4">
        <label className="block">
          <span className={fieldLabel}>Display name</span>
          <input className={`${inputCls} mt-1`} value={value} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} disabled={profile.isPending} />
        </label>
        {err ? <Note tone="error">{err}</Note> : null}
        <Button type="submit" disabled={busy || profile.isPending}>{busy ? "Saving…" : "Save and continue"} <ArrowRight /></Button>
      </form>
    </>
  );
}

function StepWallet() {
  const link = usePocketLink();
  const tf = useMyTwoFactor();
  const keyKind = useMyIdentity().keyKind;
  if (keyKind) {
    return (
      <>
        <Heading title={link.data || link.isPending ? "Your trading pocket is ready" : "Your trading pocket"}>
          {link.data || link.isPending
            ? <>Signing in with {keyThing(keyKind)} already set up your own <b className="text-foreground">trading pocket</b>. Seeds never saw your recovery phrase, and no coins moved.</>
            : <>Your <b className="text-foreground">trading pocket</b> comes from {keyThing(keyKind)}. Seeds never sees your recovery phrase, and setting it up moves no coins.</>} You can add an email now (withdrawals need one); it's optional for trading. Next up: an easy way to sign back in.
        </Heading>
        {link.data ? <div className="mb-4"><Note tone="ok">Trading pocket #{link.data.account} is set up. You're good to continue.</Note></div> : null}
        {!link.data && !link.isPending ? (
          <div className="mb-4 space-y-3">
            <Note tone="warn">No active trading pocket right now. Sign in again with {keyThing(keyKind)} to set up a new one.</Note>
            <SignInAgainButton kind={keyKind} />
          </div>
        ) : null}
        <KeyIdentityCard showJoin={false} />
      </>
    );
  }
  return (
    <>
      <Heading title="Link your HME Wallet">
        Seeds trades from a separate <b className="text-foreground">trading pocket</b> inside your HME Wallet, never your savings. Linking lets Seeds see that pocket and, if you choose, trade from it. Linking moves no coins, and you can revoke it any time.
      </Heading>
      {link.data ? <div className="mb-4"><Note tone="ok">Linked: trading pocket #{link.data.account}. You're good to continue.</Note></div> : null}
      {!link.data && tf.isSuccess && !tf.data ? (
        <div className="mb-4"><Note tone="warn">Two-factor isn't on yet. You can link and trade, but to withdraw later you'll need to turn on two-factor and re-link. Go back a step to set it up first.</Note></div>
      ) : null}
      <div className="rounded-md border border-border bg-surface px-5">
        <HmeWalletLinkCard showBalances={false} className="py-6" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">No HME Wallet yet? Open <a href="https://mobile.honest.money" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">mobile.honest.money</a> on your phone, then come back to this step.</p>
    </>
  );
}

function StepLogin() {
  const identity = useMyIdentity();
  const joinHonestMoney = useJoinHonestMoney();
  const kind = identity.keyKind;
  const d = identity.data;
  if (!kind) return null;
  const today = kind === "coin" ? "scanning your Cold Storage Coin or HME Vault again" : `approving a sign-in message in ${keyThing(kind)} again`;
  const what = kind === "coin" ? "your coin or Vault" : keyThing(kind);

  if (d?.hmeMember) {
    return (
      <>
        <Heading title="Your easy login is set up">
          This Seeds account is joined to your Honest.Money membership. Next time, tap <b className="text-foreground">Sign in with Honest.Money</b> on the sign-in page. Signing in with {what} still works too.
        </Heading>
        <Note tone="ok">Same account, same trading pocket, same coins and history.</Note>
      </>
    );
  }

  const points = [
    { icon: Smartphone, title: "Sign in from anywhere", text: `Use your Honest.Money login on any phone or computer, without ${what} in hand.` },
    { icon: Mail, title: "Your email comes with it", text: "Withdrawals need an email. Your Honest.Money email covers that, so there's nothing extra to type." },
    { icon: KeyRound, title: "Nothing else changes", text: `Same account, same trading pocket, same coins and history. Signing in with ${what} keeps working.` },
  ];
  return (
    <>
      <Heading title="Set up an easy login">
        Right now, getting back into Seeds means {today}. Join your Honest.Money membership to this account and you can just sign in with Honest.Money instead. You can skip this.
      </Heading>
      <ul className="grid gap-3 md:grid-cols-3">
        {points.map((p) => (
          <li key={p.title} className="rounded-md border border-border bg-surface p-4">
            <p.icon aria-hidden className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={joinHonestMoney}>Join with Honest.Money <ArrowRight /></Button>
        <Button asChild size="lg" variant="ghost"><a href="https://honest.money" target="_blank" rel="noreferrer">No membership yet? Create one</a></Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Creating a membership opens Honest.Money in a new tab. Come back here afterwards and tap Join; this guide picks up where you left off. You can also join later from Account → Overview.</p>
    </>
  );
}

function useFeePrep() {
  const { user } = useSession();
  const load = useServerFn(getMyFeePrep);
  return useQuery({ queryKey: ["my-fee-prep", user?.id ?? null], queryFn: () => load(), enabled: !!user, staleTime: 30_000 });
}

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 2 : 0, minimumFractionDigits: n < 1 ? 2 : 0 });
const ethAmt = (n: number) => (n === 0 ? "0" : Number(n.toPrecision(3)).toString());

function StepFees({ onSkip }: { onSkip: () => void }) {
  const q = useFeePrep();
  const d = q.data;
  const perSwap = d?.perSwapUsd != null ? (d.perSwapUsd < 0.01 ? "under a cent" : `about ${money(d.perSwapUsd)}`) : null;
  const swapsFromSuggest = d?.perSwapUsd ? Math.floor(FEE_PREP.ethereum.suggestUsd / d.perSwapUsd) : null;

  return (
    <>
      <Heading title="Keep a little ETH for network fees">
        Seeds never charges a trading fee. But the networks your coins travel on charge a small fee for every swap or send, and on <b className="text-foreground">Ethereum</b> and <b className="text-foreground">Base</b> that fee is paid in ETH from your own trading pocket. Seeds doesn't add anything on top. Without it, a swap can't start.
      </Heading>

      {!d?.linked && !q.isPending ? (
        <div className="mb-4"><Note tone="warn">Link your HME Wallet first (the step before this one), so Seeds can check what's already in your pocket.</Note></div>
      ) : null}
      {q.isError ? <div className="mb-4"><Note tone="warn">We couldn't check your pocket just now. The suggestions below still apply.</Note></div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <FeeCard
          network="Ethereum"
          suggest={`About ${money(FEE_PREP.ethereum.suggestUsd)} of ETH`}
          why={perSwap ? `Today one swap's fee is ${perSwap}${swapsFromSuggest ? `, so ${money(FEE_PREP.ethereum.suggestUsd)} covers about ${swapsFromSuggest} swaps` : ""}. Every TSD swap uses it.` : "Every TSD swap uses it."}
          have={d?.linked ? d.ethereum.haveEth : null}
          price={d?.ethPriceUsd ?? null}
          level={d?.ethereum.level}
          extra={d?.ethereum.level === "enough" && d.ethereum.swaps != null ? `Enough for about ${d.ethereum.swaps} swaps at today's fee.` : null}
          action={
            !d || d.ethereum.action === "none" ? null : d.ethereum.action === "convert" ? (
              <>
                <Button asChild><Link to="/swap" search={{ from: "TSD", to: "ETH", amount: String(FEE_PREP.convertTsd) }}>Convert {FEE_PREP.convertTsd} TSD to ETH <ArrowRight /></Link></Button>
                <p className="mt-2 text-xs text-muted-foreground">TSD Bridge turns your TSD into USDC, then THORChain swaps it to ETH in your pocket. About 20–40 minutes; you'll see every step and price first.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {d.convertBlocker && d.linked
                    ? <>{d.convertBlocker} Until then, </>
                    : d.linked ? <>Your very first ETH can't come from TSD: the conversion itself needs a few cents of ETH to pay its own fee. </> : null}
                  {d.convertBlocker && d.linked ? "send" : "Send"} about {money(FEE_PREP.ethereum.suggestUsd)} of ETH <b className="text-foreground">on the Ethereum network</b> to your pocket from any exchange or wallet. After that, you can top up from TSD.
                </p>
                <Button asChild variant="outline" className="mt-3"><Link to="/account/balances/deposit" search={{ coin: "ETH", network: "ethereum" }}>Show my Ethereum address <ArrowRight /></Link></Button>
              </>
            )
          }
        />
        <FeeCard
          network="Base"
          suggest={`About ${money(FEE_PREP.base.suggestUsd)} of ETH`}
          why="Base fees are a fraction of a cent, so a dollar lasts a long time. You need it to move USDC or other coins you hold on Base."
          have={d?.linked ? d.base.haveEth : null}
          price={d?.ethPriceUsd ?? null}
          level={d?.base.level}
          extra={null}
          action={
            !d || d.base.action === "none" ? null : (
              <>
                <p className="text-sm text-muted-foreground">
                  Seeds can't turn TSD into ETH on Base yet. Send about {money(FEE_PREP.base.suggestUsd)} of ETH <b className="text-foreground">on the Base network</b> from any exchange that supports Base withdrawals (most do, for a few cents).
                </p>
                <Button asChild variant="outline" className="mt-3"><Link to="/account/balances/deposit" search={{ coin: "ETH", network: "base" }}>Show my Base address <ArrowRight /></Link></Button>
              </>
            )
          }
        />
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary"
      >
        <span>
          <span className="block font-semibold text-foreground">I'll convert some when it's time</span>
          <span className="mt-1 block text-sm text-muted-foreground">Skip this for now. Before your first swap on Ethereum or Base, Seeds shows the fee and tells you if your pocket needs ETH.</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
      </button>
      <p className="mt-3 text-xs text-muted-foreground">Same address on both networks, but pick the right network when you send. ETH stays in your own pocket until a fee is paid. You can add it later from Account → Balances → Deposit.</p>
    </>
  );
}

function FeeCard(p: { network: string; suggest: string; why: string; have: number | null; price: number | null; level: string | undefined; extra: string | null; action: ReactNode }) {
  const status =
    p.level === "enough" ? { tone: "ok" as const, text: "enough" }
    : p.level === "low" ? { tone: "warn" as const, text: "running low" }
    : p.level === "empty" ? { tone: "warn" as const, text: "none yet" }
    : null;
  return (
    <div className="rounded-md border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Fuel aria-hidden className="h-5 w-5 text-primary" />
        <p className="font-semibold">{p.network}</p>
      </div>
      <p className="mt-3 font-display text-xl font-extrabold">{p.suggest}</p>
      <p className="mt-1 text-sm text-muted-foreground">{p.why}</p>
      {p.have != null ? (
        <p className="mt-3 text-sm">
          In your pocket: <span data-qa-mask><b>{ethAmt(p.have)} ETH</b>{p.price ? <> ({money(p.have * p.price)})</> : null}</span>
          {status ? <span className={status.tone === "ok" ? "text-primary" : "text-muted-foreground"}> · {status.text}</span> : null}
        </p>
      ) : null}
      {p.extra ? <p className="mt-1 text-xs text-muted-foreground">{p.extra}</p> : null}
      {p.level === "enough" ? <div className="mt-4"><Note tone="ok">You're set on {p.network}.</Note></div> : p.action ? <div className="mt-4">{p.action}</div> : null}
    </div>
  );
}

function StepAlerts() {
  const { user } = useSession();
  return (
    <>
      <Heading title="Get alerts on Telegram">
        Hear right away when an order fills, a deposit lands or someone signs in to your account. One tap links it; there are no codes to type.
      </Heading>
      <TelegramCard desc="Optional, and you can change what you hear about in Account → Alerts." />
      <p className="mt-3 text-xs text-muted-foreground">Receipts and security notices also go to {shownEmail(user?.email) ?? "your email once you add one in Account → Profile"}.</p>
    </>
  );
}

function StepSecurity() {
  const tf = useMyTwoFactor();
  const keyKind = useMyIdentity().keyKind;
  return (
    <>
      <Heading title="Protect withdrawals with two-factor">
        {keyKind
          ? <>A 6-digit code from an app on your phone. You need it for any withdrawal. Seeds only sends withdrawals from a pocket link made <b className="text-foreground">after</b> two-factor and Telegram are both on, so once they are, sign in again with {keyThing(keyKind)} (Account → Security has the button). Same pocket, same coins.</>
          : <>A 6-digit code from an app on your phone. You need it for any withdrawal, and Seeds only sends withdrawals from a wallet link made <b className="text-foreground">after</b> it's on, so do this before linking your wallet. If your wallet is already linked, re-link it afterwards (Account → Security).</>}
      </Heading>
      {tf.data ? <div className="mb-4"><Note tone="ok">Two-factor is on.</Note></div> : null}
      <TwoFactorCard />
    </>
  );
}

function StepIgnite() {
  const { user } = useSession();
  const fetchMine = useServerFn(getMyIgnite);
  const fetchSeats = useServerFn(getIgniteSeats);
  const open = Date.now() < new Date(SCHEDULE_START_UTC).getTime();
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: !!user && open });
  const seats = useQuery({ queryKey: ["ignite-seats"], queryFn: () => fetchSeats(), enabled: open });
  const status = mine.data?.registration?.status;

  return (
    <>
      <Heading title="Learn to trade at Ignite">
        A five-day live class on trading with Seeds, led by Bobby Gray, founder of HME.
      </Heading>
      {!open ? (
        <Card><p className="text-sm text-muted-foreground">This Ignite class has started. Sessions are recorded; watch for the next class on the <Link to="/ignite" className="text-primary underline">Ignite page</Link>.</p></Card>
      ) : status === "confirmed" ? (
        <Note tone="ok">You have a seat at Ignite, {SCHEDULE_DATES}. See you there!</Note>
      ) : (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <Flame aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold">{SCHEDULE_DATES}</p>
              <p className="mt-1 text-sm text-muted-foreground">{SCHEDULE_TIME} · ${DEPOSIT_USD} reservation deposit · sessions are recorded</p>
              {seats.data ? <p className="mt-1 text-sm text-muted-foreground">{seats.data.seatsLeft} of {seats.data.capacity} seats left</p> : null}
              {status && status !== "canceled" ? <p className="mt-2 text-sm">You started registering but haven't finished paying yet.</p> : null}
              <Button asChild className="mt-4"><Link to="/ignite">{status && status !== "canceled" ? "Finish registration" : "Reserve your seat"} <ArrowRight /></Link></Button>
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Leaving to register is fine. When you come back, this guide picks up where you left off.</p>
    </>
  );
}

function StepDone({ onFinish }: { onFinish: () => void }) {
  const { user } = useSession();
  const load = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const link = usePocketLink();
  const tf = useMyTwoFactor();
  const identity = useMyIdentity();
  const keyKind = identity.keyKind;
  const fetchMine = useServerFn(getMyIgnite);
  const open = Date.now() < new Date(SCHEDULE_START_UTC).getTime();
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: !!user && open });
  const p = profile.data;
  const fees = useFeePrep();
  const rows: { done: boolean; label: string; to: "/account/profile" | "/account/security" | "/account/alerts" | "/account/balances/deposit" | "/ignite" }[] = [
    { done: Boolean(p?.display_name), label: "Display name", to: "/account/profile" },
    { done: Boolean(link.data), label: keyKind ? "Trading pocket set up" : "HME Wallet trading pocket linked", to: "/account/security" },
    ...(keyKind ? [{ done: Boolean(identity.data?.hmeMember), label: "Easy login with Honest.Money (optional)", to: "/account/profile" as const }] : []),
    ...(keyKind ? [{ done: Boolean(identity.data?.email), label: "Email added (needed for withdrawals)", to: "/account/profile" as const }] : []),
    { done: fees.data?.ethereum.level === "enough" && fees.data?.base.level === "enough", label: "ETH for network fees (Ethereum and Base)", to: "/account/balances/deposit" },
    { done: Boolean(p?.telegram_verified), label: "Telegram alerts", to: "/account/alerts" },
    { done: Boolean(tf.data), label: "Two-factor sign-in", to: "/account/security" },
    ...(open ? [{ done: mine.data?.registration?.status === "confirmed", label: "Ignite seat reserved", to: "/ignite" as const }] : []),
  ];
  const left = rows.filter((r) => !r.done).length;
  return (
    <>
      <Heading title={left === 0 ? "You're all set" : "Good start"}>
        {left === 0 ? "Everything's ready. " : `${left} ${left === 1 ? "thing is" : "things are"} still open; tap any of them to finish it now, or do it later from your account page. `}
        You can reopen this guide from Account → Overview.
      </Heading>
      <Card>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label}>
              <Link to={r.to} className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-muted">
                {r.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className={r.done ? "text-muted-foreground" : "text-foreground"}>{r.label}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">{r.done ? "Done" : "Not yet"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
        <Button size="lg" onClick={onFinish}>Go to my account <ArrowRight /></Button>
        <Button asChild size="lg" variant="outline"><Link to="/ai">Try Seeds AI</Link></Button>
        <Button asChild size="lg" variant="ghost"><Link to="/">See the markets</Link></Button>
      </div>
    </>
  );
}
