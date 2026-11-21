import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { getPeerLinkPublic, startPeerCheckout } from "@/lib/ignite-peer.functions";
import { SCHEDULE_DATES, SCHEDULE_TIME } from "@/lib/ignite-registration";
import { shownEmail } from "@/lib/key-signin/rules";

const peerQuery = (token: string) => queryOptions({ queryKey: ["peer-link", token], queryFn: () => getPeerLinkPublic({ data: { token } }) });

export const Route = createFileRoute("/pay/$token")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): { paid?: string } => ({ paid: s.paid != null ? String(s.paid) : undefined }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(peerQuery(params.token)),
  head: () => ({
    meta: [
      { title: "Pay a friend's Ignite seat — Seeds" },
      { name: "description", content: "A private Peer Pay link to pay someone's Seeds Ignite seat deposit." },
      { property: "og:title", content: "Pay a friend's Ignite seat — Seeds" },
      { property: "og:description", content: "A private Peer Pay link to pay someone's Seeds Ignite seat deposit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const { token } = Route.useParams();
  const { paid } = Route.useSearch();
  const { data } = useSuspenseQuery({ ...peerQuery(token), refetchInterval: (q) => (paid && q.state.data?.found && q.state.data.state === "active" ? 10000 : false) });
  const { user, loading } = useSession();
  const start = useServerFn(startPeerCheckout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shell = (children: React.ReactNode) => (
    <div className="ignite-theme seed-lines min-h-screen">
      <div className="mx-auto max-w-7xl px-5 py-16 [&>*]:max-w-xl">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">{children}</div>
        <p className="mt-6 text-xs text-muted-foreground">Seeds will never ask you to pay anywhere other than this page. Questions? <a className="underline" href="mailto:support@honest.money">support@honest.money</a></p>
      </div>
    </div>
  );

  if (!data.found) return shell(<><h1 className="font-display text-3xl">Payment link not found</h1><p className="mt-2 text-sm text-muted-foreground">Check the link you were sent, or ask your friend for a new one.</p></>);
  if (data.state === "paid") return shell(<><p className="text-xs font-semibold uppercase tracking-widest text-primary">Paid</p><h1 className="mt-2 font-display text-3xl">This seat is paid.</h1><p className="mt-2 text-sm text-muted-foreground">{data.forName}'s Ignite seat is confirmed. {paid ? "Thank you for paying. They've been told it was you." : "Nothing more to do here."}</p></>);
  if (data.state !== "active") return shell(<><h1 className="font-display text-3xl">This link {data.state === "expired" ? "has expired" : "was turned off"}</h1><p className="mt-2 text-sm text-muted-foreground">No payment can be made with it. Ask {data.forName} for a new link if they still need help.</p></>);

  const pay = async () => {
    setBusy(true); setError(null);
    try {
      const { checkoutUrl } = await start({ data: { token, origin: window.location.origin } });
      window.location.href = checkoutUrl;
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout failed"); setBusy(false); }
  };

  return shell(
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Peer Pay</p>
      <h1 className="mt-2 font-display text-3xl">Pay {data.forName}'s Ignite seat</h1>
      <p className="mt-2 text-sm text-muted-foreground">{data.forName} asked you to pay the deposit for their seat in Ignite, the Seeds crypto trading class. The seat is theirs. You don't get a seat or any access to their account.</p>
      <dl className="mt-5 divide-y divide-border rounded-2xl border border-border text-sm">
        <Row k="For" v={data.forName} />
        <Row k="Class" v={SCHEDULE_DATES} />
        <Row k="Time" v={SCHEDULE_TIME} />
        <Row k="Amount" v={<strong className="text-base">${data.amount} USD</strong>} />
        <Row k="Link works until" v={new Date(data.expiresAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />
      </dl>
      {paid && (
        <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4" role="status">
          <p className="text-sm font-semibold text-warning">Payment pending</p>
          <p className="mt-1 text-sm text-muted-foreground">Crypto payments stay pending until confirmed on-chain. This page updates by itself, and {data.forName} is told as soon as it's confirmed.</p>
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <p className="font-semibold text-warning">Only pay if you know {data.forName} personally.</p>
        <p className="mt-1 text-muted-foreground">Any repayment between you two is your own arrangement. Seeds doesn't handle it.</p>
      </div>
      <div className="mt-5 grid gap-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : !user ? (
          <>
            <p className="text-sm text-muted-foreground">Sign in with Honest.Money to pay, so {data.forName} can see who paid. New to Honest.Money? You can create a free account in the same step.</p>
            <Link to="/auth" search={{ redirect: `/pay/${token}` }} className="seed-btn">Sign in with Honest.Money</Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Signed in as <strong className="text-foreground">{shownEmail(user.email) ?? "your Seeds account"}</strong>. {data.forName} will see your Honest.Money name.</p>
            <button type="button" className="seed-btn" disabled={busy} onClick={pay}>{busy ? "Opening checkout…" : `Pay $${data.amount} with crypto (NectarPay)`}</button>
            <p className="text-xs text-muted-foreground">BTC, TXC, TSD, USDC, ETH, LTC, DOGE, ISK or ZCU, paid straight to Seeds' own wallet through NectarPay.</p>
          </>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </div>
    </>,
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>;
}
