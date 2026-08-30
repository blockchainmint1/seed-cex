import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "Seeds API — Trading API for Bots & Market Makers" },
      {
        name: "description",
        content:
          "Binance-compatible REST and streaming API for Seeds, the non-custodial exchange. HMAC-signed keys, order book depth, klines, order entry. Keys can never withdraw.",
      },
      { property: "og:title", content: "Seeds API — Trading API for Bots & Market Makers" },
      {
        property: "og:description",
        content:
          "Binance-compatible REST and SSE streaming API. Trade from your own wallet — API keys can read and trade, never withdraw.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiDocs,
});

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-10">
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-muted/40 p-4 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

const ENDPOINTS: Array<[string, string, string, string]> = [
  ["GET", "/api/public/v1/ping", "1", "Connectivity check."],
  ["GET", "/api/public/v1/time", "1", "Server time in unix ms — sync before signing."],
  ["GET", "/api/public/v1/exchangeInfo", "10", "Symbols, filters, precision, rate limits."],
  ["GET", "/api/public/v1/depth", "5", "Aggregated order book. `symbol`, `limit` (max 1000)."],
  ["GET", "/api/public/v1/trades", "5", "Recent public trades. `symbol`, `limit`."],
  ["GET", "/api/public/v1/klines", "5", "OHLCV candles. `symbol`, `interval`, `limit`."],
  ["GET", "/api/public/v1/ticker/24hr", "5", "24h stats for one symbol or all."],
  ["GET", "/api/public/v1/ticker/price", "2", "Last price for one symbol or all."],
  ["GET", "/api/public/v1/stream", "—", "SSE stream: ticker, depth, trade events."],
  ["GET", "/api/public/v1/account", "10", "SIGNED. Addresses + live trading authorizations."],
  ["GET", "/api/public/v1/openOrders", "6", "SIGNED. Working orders."],
  ["GET", "/api/public/v1/allOrders", "10", "SIGNED. Order history."],
  ["GET", "/api/public/v1/myTrades", "10", "SIGNED. Fills with on-chain settlement legs and txids."],
  ["POST", "/api/public/v1/order", "20", "SIGNED, trade scope. New LIMIT/GTC order."],
  ["DELETE", "/api/public/v1/order", "4", "SIGNED, trade scope. Cancel by `orderId`."],
  ["GET", "/api/public/cmc", "—", "CoinMarketCap-format market data."],
];

function ApiDocs() {
  return (
    <main className="mx-auto max-w-7xl px-5 pb-24">
      <header className="py-14">
        <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">Developers</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Seeds API v1</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A Binance-shaped REST API on a non-custodial exchange. Your bot trades directly from a wallet
          you control — there is no exchange balance to fund and no exchange balance to lose. Point an
          existing Binance-style client at this base URL and most calls work unchanged.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs">
          <Link
            to="/wallet"
            className="rounded-sm bg-primary px-4 py-2 font-semibold tracking-wider text-primary-foreground uppercase"
          >
            Create API key
          </Link>
          <a
            href="/api/public/v1/openapi.json"
            className="rounded-sm border border-border px-4 py-2 tracking-wider uppercase hover:border-primary hover:text-primary"
          >
            OpenAPI spec
          </a>
          <a
            href="/api/public/v1"
            className="rounded-sm border border-border px-4 py-2 tracking-wider uppercase hover:border-primary hover:text-primary"
          >
            Endpoint index
          </a>
        </div>
      </header>

      <Section id="differences" title="What's different from a normal exchange">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">No deposits.</strong> Balances live in your own wallet.
            The <code>/account</code> response returns your addresses and your live trading
            authorizations instead of exchange credits.
          </li>
          <li>
            <strong className="text-foreground">Authorizations gate trading.</strong> A bot can only
            trade assets you have authorized, up to the cap you set, until the expiry you chose. When
            the expiry hits, the delegated key is destroyed.
          </li>
          <li>
            <strong className="text-foreground">API keys can never withdraw.</strong> There is no
            withdrawal endpoint. Scopes are <code>read</code> and <code>trade</code> only; withdrawals
            happen in the signed-in UI. A stolen key cannot move funds off-chain to an attacker.
          </li>
          <li>
            <strong className="text-foreground">Fills settle on-chain.</strong> A match triggers a real
            transfer between the two wallets. <code>/myTrades</code> returns each settlement leg with
            its txid and confirmation count.
          </li>
          <li>
            <strong className="text-foreground">Streams are SSE, not WebSocket.</strong> The edge
            runtime has no long-lived sockets. SSE gives you the same push semantics over plain HTTP.
          </li>
        </ul>
      </Section>

      <Section id="auth" title="Authentication">
        <p>
          Signed endpoints use HMAC-SHA256 exactly like Binance. Send your key ID in the{" "}
          <code>X-SEEDS-APIKEY</code> header, append <code>timestamp</code> (unix ms) and optionally{" "}
          <code>recvWindow</code> (default 5000ms, max 60000ms), then append{" "}
          <code>signature</code> as the last parameter.
        </p>
        <p>
          The signed payload is the query string with <code>signature</code> removed, concatenated with
          the raw request body if there is one.
        </p>
        <Code>{`import crypto from "node:crypto";

const KEY = process.env.SEEDS_KEY;      // seeds_xxxxxxxx
const SECRET = process.env.SEEDS_SECRET;
const BASE = "https://seeds.honest.money";

function signed(path, params) {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now() }).toString();
  const sig = crypto.createHmac("sha256", SECRET).update(qs).digest("hex");
  return \`\${BASE}\${path}?\${qs}&signature=\${sig}\`;
}

// Place an order
const res = await fetch(signed("/api/public/v1/order", {
  symbol: "TXCUSDC", side: "BUY", type: "LIMIT",
  timeInForce: "GTC", price: "0.25", quantity: "100",
}), { method: "POST", headers: { "X-SEEDS-APIKEY": KEY } });

console.log(await res.json());`}</Code>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2 pr-3">Weight</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([m, p, w, note]) => (
                <tr key={m + p} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 text-primary">{m}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground">{p}</td>
                  <td className="py-2 pr-3">{w}</td>
                  <td className="py-2 font-sans">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="symbols" title="Symbols and filters">
        <p>
          Symbols are concatenated, Binance style: <code>TXCUSDC</code>, <code>TXCTSD</code>,{" "}
          <code>LTCTSD</code>. Underscore, slash and dash forms are accepted too. Fetch{" "}
          <code>/exchangeInfo</code> at startup for the live symbol list, tick size, lot size and
          minimum notional per market.
        </p>
      </Section>

      <Section id="ratelimits" title="Rate limits">
        <p>
          1200 request weight per key per minute, plus per-endpoint weights shown above. Exceeding it
          returns HTTP 429 with code <code>-1003</code>. Back off, don't hammer. Optional IP allowlists
          per key add a second layer of protection.
        </p>
      </Section>

      <Section id="streams" title="Streaming (SSE)">
        <Code>{`curl -N "https://seeds.honest.money/api/public/v1/stream?symbol=TXCUSDC&streams=ticker,depth,trade"

event: ticker
data: {"symbol":"TXCUSDC","lastPrice":"0.25000000", ...}`}</Code>
        <p>
          Connections close after 10 minutes; reconnect (EventSource does it automatically). Events:{" "}
          <code>open</code>, <code>ticker</code>, <code>depth</code>, <code>trade</code>,{" "}
          <code>close</code>, <code>error</code>.
        </p>
      </Section>

      <Section id="errors" title="Errors">
        <p>Errors return a numeric code and message, so bots branch on the code, not the text.</p>
        <Code>{`{"code":-1022,"msg":"Signature for this request is not valid"}

-1003 rate limit exceeded      -1021 timestamp outside recvWindow
-1004 IP not in allowlist      -1022 bad signature
-1102 missing parameter        -1121 invalid symbol
-2010 order rejected           -2011 cancel rejected
-2013 no such order            -2015 invalid or disabled API key`}</Code>
      </Section>
    </main>
  );
}
