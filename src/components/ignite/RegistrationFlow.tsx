import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/hooks/use-session";
import { getMyIgnite, startIgniteCheckout } from "@/lib/ignite.functions";
import { SCHEDULE_DATES, SCHEDULE_SESSIONS, SCHEDULE_TIME, RECORDING_NOTE, DEPOSIT_USD, validateDetails, type Details, type Errors } from "@/lib/ignite-registration";

const COUNTRY_CODES = ["+1", "+44", "+61", "+64", "+353", "+49", "+33", "+34", "+39", "+31", "+41", "+46", "+47", "+45", "+52", "+55", "+57", "+27", "+234", "+254", "+971", "+65", "+60", "+63", "+91", "+81", "+82"];

type Step = "details" | "review";

export function RegistrationFlow() {
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<Details>({ fullName: "", email: "", countryCode: "+1", phone: "", marketingOptIn: false });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<"fullName" | "email" | "phone" | "countryCode", boolean>>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { user, loading } = useSession();
  const fetchMine = useServerFn(getMyIgnite);
  const checkout = useServerFn(startIgniteCheckout);
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: !!user, refetchInterval: (q) => (q.state.data?.registration?.status === "pending" ? 15000 : false) });
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
      const { checkoutUrl } = await checkout({ data: { ...details, origin: window.location.origin } });
      window.location.href = checkoutUrl;
    } catch (e) { setPayError(e instanceof Error ? e.message : "Checkout failed"); setPaying(false); }
  };

  if (loading) return <div className="rounded-3xl border border-border bg-card p-8 shadow-glow text-sm text-muted-foreground">Loading…</div>;
  if (!user) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">
        <h2 className="font-display text-3xl">Reserve your seat</h2>
        <p className="mt-2 text-sm text-muted-foreground">Sign in with your Honest.Money account to reserve. Your seat, receipt and class reminders stay tied to your HME profile. New to Honest.Money? You can create a free account in the same step.</p>
        <Link to="/auth" onClick={() => { try { sessionStorage.setItem("seeds-after-signin", "/register"); } catch { /* ignore */ } }} className="seed-btn mt-6 inline-flex justify-center">Sign in with Honest.Money</Link>
      </div>
    );
  }
  const reg = mine.data?.registration;
  if (reg?.status === "confirmed") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8" role="status">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Seat confirmed</p>
        <h2 className="mt-2 font-display text-3xl">You're in, {reg.full_name.split(" ")[0]}.</h2>
        <p className="mt-2 text-sm text-muted-foreground">Payment verified{reg.paid_chain ? ` (${reg.paid_chain.toUpperCase()})` : ""}. Ignite runs {SCHEDULE_DATES}, {SCHEDULE_TIME.toLowerCase()}. We'll send reminders to {reg.email}.</p>
      </div>
    );
  }

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
            <Row k="Item" v="Ignite class reservation" />
            <Row k="Quantity" v="1" />
            <Row k="Dates" v={SCHEDULE_DATES} />
            <Row k="Sessions" v={SCHEDULE_SESSIONS} />
            <Row k="Time" v={SCHEDULE_TIME} />
            <Row k="Deposit" v={<strong className="text-base">${DEPOSIT_USD} USD</strong>} />
          </dl>
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
            This payment is a reservation deposit for the Ignite class. It is not trading funds and does not open, fund, or grant ownership in a Seeds exchange account.
          </p>

          {reg && (reg.status === "pending" || reg.status === "underpaid") && (
            <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4" role="status">
              <p className="text-sm font-semibold text-warning">{reg.status === "underpaid" ? "Payment arrived short" : "Payment pending"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reg.status === "underpaid" ? "We received less than the deposit. Contact help before paying again." : "Crypto payments stay pending until confirmed on-chain. This page updates by itself."}</p>
            </div>
          )}
          {!mine.data?.cryptoOpen && (
            <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4" role="status">
              <p className="text-sm font-semibold text-warning">Payment setup in progress</p>
              <p className="mt-1 text-sm text-muted-foreground">Crypto checkout opens shortly. No money can be collected yet.</p>
            </div>
          )}
          <div className="mt-4 grid gap-3">
            <button type="button" className="seed-btn" disabled={!mine.data?.cryptoOpen || paying} onClick={pay}>{paying ? "Opening checkout…" : reg?.status === "pending" ? "Continue crypto payment (NectarPay)" : `Pay $${DEPOSIT_USD} with crypto (NectarPay)`}</button>
            <button type="button" className="seed-btn-ghost" disabled>Peer Pay — coming soon</button>
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

const STATES: { key: string; title: string; body: string }[] = [
  { key: "Pending", title: "Payment pending", body: "We're waiting for your payment to be verified. Crypto payments stay pending until confirmed on-chain. Your seat isn't confirmed yet." },
  { key: "Confirmed", title: "Your Ignite seat is confirmed", body: "Payment verified. Ignite runs November 30–December 4, 2026, daily from 5:00–6:30 PM CST." },
  { key: "Canceled", title: "Checkout canceled", body: "No payment was taken. You can return to review whenever you're ready." },
  { key: "Failed", title: "Payment didn't go through", body: "No seat was reserved. You can try again — retrying won't create a duplicate charge or seat." },
  { key: "Sold out", title: "Ignite is fully reserved", body: "All 100 seats are taken." },
  { key: "Waitlist", title: "Join the waitlist", body: "We'll let you know if a seat opens up." },
];

export function StatusPreviews() {
  return (
    <details className="rounded-2xl border border-border p-5">
      <summary className="cursor-pointer text-sm font-semibold">Design preview: status screens (samples only)</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STATES.map((s) => (
          <div key={s.key} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sample · {s.key}</p>
            <h3 className="mt-2 font-display text-xl">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
