import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/hooks/use-session";
import { getMyIgnite, startIgniteCheckout } from "@/lib/ignite.functions";
import { PeerPayPanel } from "./PeerPayPanel";
import { RECORDING_NOTE, paidInLabel, validateDetails, type Details, type Errors } from "@/lib/ignite-registration";
import { canRegister, classPrice, dateRangeLabel, sessionLines, sessionsLabel, sharedTimeLabel, usd0 } from "@/lib/ignite-classes";
import type { PublicClass } from "@/lib/ignite.functions";

const COUNTRY_CODES = ["+1", "+44", "+61", "+64", "+353", "+49", "+33", "+34", "+39", "+31", "+41", "+46", "+47", "+45", "+52", "+55", "+57", "+27", "+234", "+254", "+971", "+65", "+60", "+63", "+91", "+81", "+82"];

type Step = "details" | "review";

export function RegistrationFlow({ cls }: { cls: PublicClass }) {
  const here = useLocation({ select: (l) => l.href });
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<Details>({ fullName: "", email: "", countryCode: "+1", phone: "", marketingOptIn: false });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<"fullName" | "email" | "phone" | "countryCode", boolean>>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { user, loading } = useSession();
  const fetchMine = useServerFn(getMyIgnite);
  const checkout = useServerFn(startIgniteCheckout);
  const mine = useQuery({ queryKey: ["ignite", user?.id, cls.id], queryFn: () => fetchMine({ data: { classId: cls.id } }), enabled: !!user, refetchInterval: (q) => (q.state.data?.registration?.status === "pending" || q.state.data?.peer?.state === "active" ? 15000 : false) });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const prefilled = useRef(false);
  useEffect(() => {
    const d = mine.data;
    if (!d || prefilled.current) return;
    prefilled.current = true;
    const r = d.registration;
    setDetails((x) => ({ ...x, fullName: r?.full_name || d.prefill.fullName || x.fullName, email: r?.email || d.prefill.email || x.email, countryCode: r?.country_code || x.countryCode, phone: r?.phone || x.phone }));
  }, [mine.data]);

  const pay = async () => {
    setPaying(true); setPayError(null);
    try {
      const ref = (window as unknown as { honestMoney?: { ref?: () => string | null } }).honestMoney?.ref?.() || new URLSearchParams(window.location.search).get("ref");
      const { checkoutUrl } = await checkout({ data: { ...details, origin: window.location.origin, ref, classId: cls.id } });
      window.location.href = checkoutUrl;
    } catch (e) { setPayError(e instanceof Error ? e.message : "Checkout failed"); setPaying(false); }
  };

  const dates = dateRangeLabel(cls.sessions, cls.timezone);
  const time = sharedTimeLabel(cls.sessions, cls.timezone);
  const open = canRegister(cls, cls.seatsLeft);
  // Display only: checkout re-prices on the server. Before sign-in we can't know miner status.
  const quote = mine.data?.quote ?? null;
  const price = quote?.price ?? classPrice(cls, "unknown");
  const fee = price.feeUsd - price.minerDiscountUsd;

  if (loading) return <div className="rounded-3xl border border-border bg-card p-8 shadow-glow text-sm text-muted-foreground">Loading…</div>;
  const reg = user ? mine.data?.registration : null;
  const regClass = user ? mine.data?.regClass : null;
  if (reg?.status === "confirmed") {
    const paidWith = paidInLabel(reg.paid_asset, reg.paid_chain);
    const sameClass = regClass?.id === cls.id;
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8" role="status">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Seat confirmed</p>
        <h2 className="mt-2 font-display text-3xl">You're in, {((n) => n.charAt(0).toUpperCase() + n.slice(1))(reg.full_name.trim().split(/\s+/)[0] ?? "")}.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {sameClass ? "Your seat in this class is paid" : `You have a paid seat in ${regClass?.name ?? "another Flight School class"}${regClass ? ` (${regClass.dates})` : ""}`}
          {paidWith ? ` (${paidWith})` : ""}{mine.data?.peer?.state === "paid" && mine.data.peer.payerName ? `, paid by ${mine.data.peer.payerName} through Peer Pay` : ""}. We'll send reminders to {reg.email}.
        </p>
        {!sameClass && <p className="mt-2 text-sm text-muted-foreground">Want to switch to {cls.name} instead? Email <a className="font-semibold text-primary underline-offset-4 hover:underline" href="mailto:support@honest.money">support@honest.money</a> and we'll move your seat.</p>}
        <Link to="/flight-school/confirmed" className="seed-btn mt-6 inline-flex justify-center">See your confirmation & referral link</Link>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">
        <h2 className="font-display text-3xl">{cls.seatsLeft <= 0 && cls.status === "open" ? "Fully reserved" : "Registration is closed"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{cls.name} isn't taking new seats. Leave your email and we'll tell you when the next class opens.</p>
        <Link to="/flight-school" hash="interest" className="seed-btn mt-6 inline-flex justify-center">Tell me about the next class</Link>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">
        <h2 className="font-display text-3xl">Reserve your seat</h2>
        <p className="mt-2 text-sm text-muted-foreground">{cls.name} · {dates}.{cls.minersFree && cls.feeUsd > 0 ? " HME miners attend free: sign in and we check for you." : ""}</p>
        <p className="mt-2 text-sm text-muted-foreground">Sign in with your Honest.Money account to reserve. Your seat, receipt and class reminders stay tied to your HME profile. New to Honest.Money? You can create a free account in the same step.</p>
        <Link to="/auth" search={{ redirect: here }} className="seed-btn mt-6 inline-flex justify-center">Sign in with Honest.Money</Link>
      </div>
    );
  }
  const peerActive = mine.data?.peer?.state === "active";
  const peerCheckoutOpen = reg?.payment_method === "peer" && !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now() + 60_000 && reg.status === "pending";
  const otherClassOpen = !!reg && reg.status === "pending" && !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now() && (reg.class_id !== cls.id || Number(reg.amount_usd) !== price.totalUsd);

  const update = <K extends keyof Details>(k: K, v: Details[K]) => {
    const next = { ...details, [k]: v };
    setDetails(next);
    if ((touched as Record<string, boolean | undefined>)[k]) setErrors(validateDetails(next));
  };
  const blur = (k: "fullName" | "email" | "phone") => { setTouched((t) => ({ ...t, [k]: true })); setErrors(validateDetails(details)); };

  const go = (s: Step) => { setStep(s); requestAnimationFrame(() => headingRef.current?.focus()); };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateDetails(details);
    setErrors(errs);
    setTouched({ fullName: true, email: true, phone: true, countryCode: true });
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    go("review");
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">
      <ol className="mb-6 flex gap-2 text-xs font-semibold uppercase tracking-widest" aria-label="Registration steps">
        {(["Your details", "Review & payment"] as const).map((label, i) => {
          const active = (i === 0 && step === "details") || (i === 1 && step === "review");
          return (
            <li key={label} aria-current={active ? "step" : undefined} className={`flex-1 border-t-2 pt-2 ${active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
              {i + 1}. {label}
            </li>
          );
        })}
      </ol>

      {step === "details" ? (
        <form onSubmit={submitDetails} noValidate>
          <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl">Reserve your seat</h2>
          <p className="mt-1 text-sm text-muted-foreground">No wallet needed. We'll never ask for private keys or seed phrases.</p>
          <div className="mt-6 space-y-4">
            <Field id="f-fullName" label="Full name" error={touched.fullName ? errors.fullName : undefined}>
              {(p) => <input {...p} className="seed-field" autoComplete="name" value={details.fullName} maxLength={100} onChange={(e) => update("fullName", e.target.value)} onBlur={() => blur("fullName")} />}
            </Field>
            <Field id="f-email" label="Email" error={touched.email ? errors.email : undefined}>
              {(p) => <input {...p} className="seed-field" type="email" inputMode="email" autoComplete="email" value={details.email} maxLength={255} onChange={(e) => update("email", e.target.value)} onBlur={() => blur("email")} />}
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Phone</legend>
              <div className="flex gap-2">
                <label htmlFor="f-countryCode" className="sr-only">Country code</label>
                <select id="f-countryCode" className="seed-field w-28 shrink-0" autoComplete="tel-country-code" value={details.countryCode} onChange={(e) => update("countryCode", e.target.value)}>
                  {COUNTRY_CODES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
                </select>
                <label htmlFor="f-phone" className="sr-only">Phone number</label>
                <input id="f-phone" className="seed-field" type="tel" inputMode="tel" autoComplete="tel-national" value={details.phone} maxLength={20}
                  aria-invalid={touched.phone && !!errors.phone} aria-describedby={touched.phone && errors.phone ? "f-phone-err" : "f-phone-hint"}
                  onChange={(e) => update("phone", e.target.value)} onBlur={() => blur("phone")} />
              </div>
              {touched.phone && errors.phone ? <p id="f-phone-err" className="mt-1.5 text-sm text-destructive">{errors.phone}</p>
                : <p id="f-phone-hint" className="mt-1.5 text-xs text-muted-foreground">Used only for class logistics about your reservation.</p>}
            </fieldset>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={details.marketingOptIn} onChange={(e) => update("marketingOptIn", e.target.checked)} />
              <span><span className="font-semibold">Optional:</span> email me news about Seeds and future classes. <span className="text-muted-foreground">Not required to reserve.</span></span>
            </label>
          </div>
          <button type="submit" className="seed-btn mt-6">Continue to review</button>
        </form>
      ) : (
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl">Review & payment</h2>
          <dl className="mt-5 divide-y divide-border rounded-2xl border border-border text-sm">
            <Row k="Class" v={`Flight School: ${cls.name}`} />
            <Row k="Dates" v={dates} />
            <Row k="Sessions" v={sessionsLabel(cls.sessions)} />
            <Row k="Time" v={time ?? <span className="block">{sessionLines(cls.sessions, cls.timezone).map((l) => <span key={l} className="block">{l}</span>)}</span>} />
            {price.feeUsd > 0 && (
              <Row k="Class fee" v={price.minerDiscountUsd > 0
                ? <span><s className="text-muted-foreground">{usd0(price.feeUsd)}</s> <strong className="text-primary">Free: you're an HME miner</strong></span>
                : usd0(fee)} />
            )}
            {price.depositUsd > 0 && <Row k="Trade deposit" v={usd0(price.depositUsd)} />}
            <Row k="Total" v={mine.isPending ? "Checking…" : <strong className="text-base">{usd0(price.totalUsd)} USD</strong>} />
          </dl>
          {cls.minersFree && price.feeUsd > 0 && quote && quote.miner !== "miner" && (
            <p className="mt-3 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
              {quote.miner === "unknown"
                ? "HME miners attend free. We couldn't confirm mining hash power on your Honest.Money account right now. Mining? Try again in a few minutes, or email support@honest.money before paying."
                : "HME miners attend free. Your Honest.Money account doesn't show any active mining hash power."}
            </p>
          )}
          {price.depositUsd > 0 && (
            <p className="mt-3 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <span className="font-semibold">Returned during class:</span>{" "}
              <span className="text-muted-foreground">{`your ${usd0(price.depositUsd)} trade deposit comes back to you during the class, so you can trade with it.`}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{RECORDING_NOTE}</p>
          <div className="mt-4 rounded-2xl border border-border p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{details.fullName.trim()}</p>
                <p className="text-muted-foreground">{details.email.trim()}</p>
                <p className="text-muted-foreground">{details.countryCode} {details.phone.trim()}</p>
              </div>
              <button type="button" onClick={() => go("details")} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Edit</button>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This payment reserves your seat in {cls.name}.{price.depositUsd > 0 ? " The trade deposit is returned to you during the class for trading activity." : ""} It does not open, fund, or grant ownership in a Seeds exchange account.
          </p>

          {reg && (reg.status === "underpaid" || (reg.status === "pending" && !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now())) && (
            <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4" role="status">
              <p className="text-sm font-semibold text-warning">{reg.status === "underpaid" ? "Payment arrived short" : "Payment pending"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reg.status === "underpaid" ? "We received less than your seat costs. Contact support@honest.money before paying again." : otherClassOpen ? `You have a checkout open for ${mine.data?.regClass?.name ?? "another class"} at a different price. Finish it, or wait for it to run out (about an hour).` : "Crypto payments stay pending until confirmed on-chain. This page updates by itself."}</p>
            </div>
          )}
          {!mine.data?.cryptoOpen && (
            <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4" role="status">
              <p className="text-sm font-semibold text-warning">Payment setup in progress</p>
              <p className="mt-1 text-sm text-muted-foreground">Crypto checkout opens shortly. No money can be collected yet.</p>
            </div>
          )}
          <div className="mt-4 grid gap-3">
            <button type="button" className="seed-btn" disabled={!mine.data?.cryptoOpen || mine.isPending || paying || peerActive || peerCheckoutOpen || otherClassOpen} onClick={pay}>{paying ? "Opening checkout…" : !otherClassOpen && reg?.status === "pending" && reg.payment_method === "nectarpay" && reg.checkout_url && !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now() + 60_000 ? "Continue crypto payment (NectarPay)" : `Pay ${usd0(price.totalUsd)} with crypto (NectarPay)`}</button>
            {(peerActive || peerCheckoutOpen) && <p className="text-xs text-muted-foreground">{peerCheckoutOpen ? "Your friend has a checkout open. Paying yourself is paused until it finishes or expires." : "Paying yourself is paused while your Peer Pay link is on, so your seat can't be paid twice. Cancel the link to pay yourself."}</p>}
            <PeerPayPanel details={details} peer={mine.data?.peer} cryptoOpen={!!mine.data?.cryptoOpen && !otherClassOpen} classId={cls.id} amountUsd={mine.isPending ? null : price.totalUsd} onChanged={() => { void mine.refetch(); }} />
            {payError && <p className="text-sm text-destructive" role="alert">{payError}</p>}
            <p className="text-xs text-muted-foreground">BTC, TXC, TSD, USDC, ETH, LTC, DOGE, ISK or ZCU — paid straight to Seeds' own wallet through NectarPay.</p>
          </div>
          <button type="button" onClick={() => go("details")} className="seed-btn-ghost mt-4 w-full">← Back to details</button>
        </div>
      )}
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: (p: Record<string, unknown>) => ReactNode }) {
  const errId = `${id}-err`;
  useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": error ? errId : undefined })}
      {error && <p id={errId} className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>;
}
