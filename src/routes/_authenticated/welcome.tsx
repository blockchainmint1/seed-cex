import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Circle, Flame, HandCoins, ShieldCheck, Sprout } from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { setMyOnboarding } from "@/lib/onboarding.functions";
import { getIgniteSeats, getMyIgnite } from "@/lib/ignite.functions";
import {
  afterOnboarding, cleanStep, ONBOARDING_QUERY, nextStep, ONBOARDING_STEPS, prevStep, STEP_LABELS, stepNumber, type OnboardingStep,
} from "@/lib/onboarding";
import { DEPOSIT_USD, SCHEDULE_DATES, SCHEDULE_START_UTC, SCHEDULE_TIME } from "@/lib/ignite-registration";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, fieldLabel, inputCls, Note } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { usePocketLink } from "@/components/account/use-pocket";
import { TelegramCard } from "@/components/account/TelegramCard";
import { TwoFactorCard, useMyTwoFactor } from "@/components/account/TwoFactorCard";

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
      { name: "description", content: "A short setup guide for new Seeds members: your name, HME Wallet trading pocket, alerts, two-factor and the Ignite class." },
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

  const { n, of } = stepNumber(step);
  const back = prevStep(step);
  const forward = () => go(nextStep(step));

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

        {step !== "done" ? <Progress step={step} n={n} of={of} /> : null}
        {err ? <div className="mt-4"><Note tone="error">{err}</Note></div> : null}

        <div className="mt-8">
          {step === "welcome" ? <StepWelcome onNext={forward} /> : null}
          {step === "name" ? <StepName onNext={forward} /> : null}
          {step === "wallet" ? <StepWallet /> : null}
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

function Progress({ step, n, of }: { step: OnboardingStep; n: number; of: number }) {
  const steps = ONBOARDING_STEPS.filter((s) => s !== "done");
  const at = ONBOARDING_STEPS.indexOf(step);
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Step {n} of {of}</span> · {STEP_LABELS[step]}</p>
      <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Setup progress">
        {steps.map((s, i) => (
          <li key={s} className="min-w-0">
            <span aria-hidden className={`block h-1.5 rounded-full ${i <= at ? "bg-primary" : "bg-muted"}`} />
            <span className={`mt-1.5 hidden truncate text-[11px] md:block ${i === at ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{STEP_LABELS[s]}</span>
            <span className="sr-only">{STEP_LABELS[s]}{i < at ? " (done)" : i === at ? " (current)" : ""}</span>
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
    { icon: HandCoins, title: "Your coins stay with you", text: "Seeds trades from a trading pocket inside your own HME Wallet. Seeds never holds your coins." },
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

function StepAlerts() {
  const { user } = useSession();
  return (
    <>
      <Heading title="Get alerts on Telegram">
        Hear right away when an order fills, a deposit lands or someone signs in to your account. One tap links it; there are no codes to type.
      </Heading>
      <TelegramCard desc="Optional, and you can change what you hear about in Account → Alerts." />
      <p className="mt-3 text-xs text-muted-foreground">Receipts and security notices also go to {user?.email ?? "your Honest.Money email"}.</p>
    </>
  );
}

function StepSecurity() {
  const tf = useMyTwoFactor();
  return (
    <>
      <Heading title="Protect withdrawals with two-factor">
        A 6-digit code from an app on your phone. You need it for any withdrawal, and Seeds only sends withdrawals from a wallet link made <b className="text-foreground">after</b> it's on, so do this before linking your wallet. If your wallet is already linked, re-link it afterwards (Account → Security).
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
  const fetchMine = useServerFn(getMyIgnite);
  const open = Date.now() < new Date(SCHEDULE_START_UTC).getTime();
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: !!user && open });
  const p = profile.data;
  const rows: { done: boolean; label: string; to: "/account/profile" | "/account/security" | "/account/alerts" | "/ignite" }[] = [
    { done: Boolean(p?.display_name), label: "Display name", to: "/account/profile" },
    { done: Boolean(link.data), label: "HME Wallet trading pocket linked", to: "/account/security" },
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
