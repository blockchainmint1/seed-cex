import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PAIRS } from "@/lib/chains";

export const Route = createFileRoute("/api/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Seeds API — Trading API for Bots & Market Makers" },
      {
        name: "description",
        content:
          "Binance-style REST and streaming API for Seeds: TSD markets, order book depth, klines, HMAC-signed order entry and a CoinMarketCap feed. API keys can trade, never withdraw.",
      },
      { property: "og:title", content: "Seeds API — Trading API for Bots & Market Makers" },
      {
        property: "og:description",
        content:
          "Binance-style REST and SSE API for the Seeds exchange. Public market data with no key; signed order entry with keys that can never withdraw.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiDocs,
});

const BASE = "https://seeds.honest.money";
const V1 = "/api/public/v1";

/** Same rule as symbolOf() on the server: base + quote, no separator. */
const symbol = (p: (typeof PAIRS)[number]) => `${p.base}${p.quote}`;
const EXAMPLE = symbol(PAIRS[0]);

const LEG_LABEL: Record<string, string> = {
  txc: "TXC on TEXITcoin",
  tsd: "TSD (Omni #39 on TEXITcoin)",
  usdc: "USDC on EVM",
  ltc: "LTC on Litecoin",
  isk: "ISK on Iskandercoin",
  zcu: "ZCU on ZeroChill",
  wbtc: "BTC, settled as Omni #43",
  weth: "ETH, settled as Omni #45",
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-10">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

/** Render `code` spans inside short table notes. */
function Note({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2 ? <C key={i}>{part}</C> : <span key={i}>{part}</span>))}
    </>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

type Status = "Live" | "Being built";

const STATUS: { area: string; status: Status; note: string }[] = [
  { area: "Public market data", status: "Live", note: "Depth, trades, klines, tickers, exchange info, SSE stream and the CoinMarketCap feed. No key needed." },
  { area: "Signed reads", status: "Live", note: "Account, open orders, order history, order status and your trades." },
  { area: "Order entry and cancel", status: "Live", note: "LIMIT / GTC orders join the same book as the website and match immediately." },
  { area: "Settlement from HME Wallet trading pockets", status: "Being built", note: "Fills from accounts that trade through a linked HME Wallet pocket record as matched and wait for settlement. Fills settle on-chain right away only for accounts that still hold an earlier Seeds trading authorization." },
  { area: "Withdrawals", status: "Live", note: "Not possible through the API, by design. There is no withdrawal endpoint and no scope that adds one." },
];

const ENDPOINTS: Array<[string, string, string, string]> = [
  ["GET", `${V1}`, "—", "Endpoint index (JSON)."],
  ["GET", `${V1}/openapi.json`, "—", "OpenAPI 3 spec."],
  ["GET", `${V1}/ping`, "—", "Connectivity check."],
  ["GET", `${V1}/time`, "—", "Server time in unix ms. Sync before signing."],
  ["GET", `${V1}/exchangeInfo`, "—", "Symbols, filters, precision, rate limits."],
  ["GET", `${V1}/depth`, "—", "Order book. `symbol`, `limit` (default 100, max 1000)."],
  ["GET", `${V1}/trades`, "—", "Recent public trades. `symbol`, `limit` (default 500, max 1000)."],
  ["GET", `${V1}/klines`, "—", "OHLCV candles. `symbol`, `interval`, `limit` (default 500, max 1000)."],
  ["GET", `${V1}/ticker/24hr`, "—", "24h stats for one `symbol`, or every market when omitted."],
  ["GET", `${V1}/ticker/price`, "—", "Last price for one `symbol`, or every market when omitted."],
  ["GET", `${V1}/stream`, "—", "SSE stream of ticker, depth and trade events."],
  ["GET", `${V1}/account`, "10", "SIGNED, read. Trading pocket, addresses and live trading authorizations."],
  ["GET", `${V1}/openOrders`, "6", "SIGNED, read. Working orders, optional `symbol`."],
  ["GET", `${V1}/allOrders`, "10", "SIGNED, read. Order history, optional `symbol`, `limit` (max 1000)."],
  ["GET", `${V1}/order`, "4", "SIGNED, read. One order by `orderId`."],
  ["GET", `${V1}/myTrades`, "10", "SIGNED, read. Fills with settlement legs and txids, `limit` (max 1000)."],
  ["POST", `${V1}/order`, "20", "SIGNED, trade. New LIMIT / GTC order."],
  ["DELETE", `${V1}/order`, "4", "SIGNED, trade. Cancel by `orderId`."],
];

const CMC: Array<[string, string]> = [
  ["/api/public/cmc", "Index and market list"],
  ["/api/public/cmc/assets", "Asset list"],
  ["/api/public/cmc/summary", "Market summary"],
  ["/api/public/cmc/ticker", "24h ticker"],
  ["/api/public/cmc/orderbook/{market_pair}", "Order book. `depth` (default 100, max 500), `level` 1, 2 or 3"],
  ["/api/public/cmc/trades/{market_pair}", "Recent trades. `limit` (default 100, max 500)"],
];

const ERRORS: Array<[string, string]> = [
  ["-1000", "Unknown server error, retry later"],
  ["-1002", "API key lacks the scope this endpoint needs"],
  ["-1003", "Request weight limit exceeded (HTTP 429)"],
  ["-1004", "Source IP not in the key's allowlist"],
  ["-1013", "Price or quantity outside the symbol's filters"],
  ["-1014", "Unsupported order type or time in force"],
  ["-1021", "Timestamp outside recvWindow"],
  ["-1022", "Signature not valid"],
  ["-1100", "Invalid parameter value (for example a kline interval)"],
  ["-1102", "Missing required parameter"],
  ["-1121", "Invalid symbol"],
  ["-1130", "side must be BUY or SELL"],
  ["-2010", "Order rejected"],
  ["-2011", "Cancel rejected: order not open or not yours"],
  ["-2013", "Order does not exist"],
  ["-2015", "Missing, invalid or disabled API key"],
];

const toc = [
  ["status", "Where things stand"],
  ["markets", "Markets"],
  ["differences", "How Seeds differs"],
  ["auth", "Authentication"],
  ["endpoints", "Endpoints"],
  ["account", "Account response"],
  ["filters", "Filters"],
  ["ratelimits", "Rate limits"],
  ["streams", "Streaming (SSE)"],
  ["klines", "Klines"],
  ["cmc", "CoinMarketCap feed"],
  ["errors", "Errors"],
] as const;

function ApiDocs() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24">
      <header className="py-14">
        <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">
          Developers · Updated 17 November 2026
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-foreground">
          Seeds API v1
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A Binance-style REST API for the Seeds exchange. Public market data needs no key. Signed
          endpoints let a bot place and cancel orders for your account. API keys can never
          withdraw. Point an existing Binance-style client at the base URL below and most calls
          work unchanged.
        </p>
        <p className="mt-4 font-mono text-sm text-foreground">
          Base URL <span className="text-primary">{BASE}{V1}</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            to="/api-keys"
            className="rounded-xl bg-action px-4 py-2 font-semibold text-action-foreground transition hover:brightness-105"
          >
            Create API key
          </Link>
          <a
            href={`${V1}/openapi.json`}
            className="rounded-xl border border-foreground/60 px-4 py-2 font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            OpenAPI spec
          </a>
          <a
            href={V1}
            className="rounded-xl border border-foreground/60 px-4 py-2 font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            Endpoint index
          </a>
          <a
            href="/api/public/cmc"
            className="rounded-xl border border-foreground/60 px-4 py-2 font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            CoinMarketCap feed
          </a>
        </div>
        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-muted-foreground hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="status" title="Where things stand">
        <ul className="grid gap-3 md:grid-cols-2">
          {STATUS.map((s) => (
            <li key={s.area} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-foreground">{s.area}</p>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${
                    s.status === "Live" ? "border-primary/50 text-primary" : "border-warning/60 text-warning"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <p className="mt-2">{s.note}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="markets" title="Markets">
        <p>
          Every market is priced in TSD except TSD/USDC. Symbols are base + quote with no separator.{" "}
          <C>TXC_TSD</C>, <C>TXC/TSD</C> and <C>TXC-TSD</C> are accepted too. Read{" "}
          <C>/exchangeInfo</C> at startup for the live list.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-mono font-normal">Symbol</th>
                <th className="py-2 pr-4 font-normal">Market</th>
                <th className="py-2 pr-4 font-normal">Base settles as</th>
                <th className="py-2 font-normal">Quote settles as</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map((p) => (
                <tr key={p.id} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 font-mono text-primary">{symbol(p)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-foreground">{p.label}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{LEG_LABEL[p.baseLeg] ?? p.baseLeg}</td>
                  <td className="py-2 whitespace-nowrap">{LEG_LABEL[p.quoteLeg] ?? p.quoteLeg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          BTC and ETH trade as their native coins. Behind the scenes they settle as Omni tokens
          issued by TSD Swap. <C>/exchangeInfo</C> reports this as <C>baseSettlementChain</C>.
        </p>
      </Section>

      <Section id="differences" title="How Seeds differs from a normal exchange">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">No exchange balance.</strong> Members sign in with
            Honest.Money and link a trading pocket from HME Wallet. Savings never leave the wallet.{" "}
            <C>/account</C> returns that pocket and its addresses instead of exchange credits.
          </li>
          <li>
            <strong className="text-foreground">Two pocket modes.</strong> With{" "}
            <em>instant access</em>, Seeds can sign for the trading pocket while it stays linked.
            With <em>approve every trade</em>, each settlement waits for the member to approve it
            in HME Wallet. <C>/account</C> tells you which mode the account uses.
          </li>
          <li>
            <strong className="text-foreground">API keys can never withdraw.</strong> Scopes are{" "}
            <C>read</C> and <C>trade</C> only. A stolen key can place or cancel orders but cannot
            move coins anywhere. Add an IP allowlist to a key to limit even that.
          </li>
          <li>
            <strong className="text-foreground">Fills settle on-chain.</strong> A settled fill is a
            real transfer between the two members. <C>/myTrades</C> returns each settlement leg
            with its txid and confirmations. See <a href="#status" className="text-primary underline underline-offset-2">Where things stand</a> for
            which accounts settle today.
          </li>
          <li>
            <strong className="text-foreground">No fees today.</strong> Maker and taker commission
            are both 0.
          </li>
          <li>
            <strong className="text-foreground">Streams are SSE, not WebSocket.</strong> The same
            push updates over plain HTTP, and <C>EventSource</C> reconnects automatically.
          </li>
        </ul>
      </Section>

      <Section id="auth" title="Authentication">
        <p>
          Create a key on the{" "}
          <Link to="/api-keys" className="text-primary underline underline-offset-2">
            API keys
          </Link>{" "}
          page after signing in. The secret is shown once. Signed endpoints use HMAC-SHA256 the same
          way Binance does:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Send your key ID in the <C>X-SEEDS-APIKEY</C> header.
          </li>
          <li>
            Add <C>timestamp</C> (unix ms) and, optionally, <C>recvWindow</C> (default 5000, max
            60000 ms). Timestamps more than 1 second in the future are rejected.
          </li>
          <li>
            Sign the query string, without <C>signature</C>, followed by the raw request body if
            there is one. Append <C>signature</C> (hex) as the last query parameter.
          </li>
        </ul>
        <Code>{`import crypto from "node:crypto";

const KEY = process.env.SEEDS_KEY;      // seeds_xxxxxxxxxxxxxxxxxxxxxxxx
const SECRET = process.env.SEEDS_SECRET;
const BASE = "${BASE}${V1}";

function signed(path, params = {}) {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now() }).toString();
  const sig = crypto.createHmac("sha256", SECRET).update(qs).digest("hex");
  return \`\${BASE}\${path}?\${qs}&signature=\${sig}\`;
}

// Place a limit order
const res = await fetch(signed("/order", {
  symbol: "${EXAMPLE}", side: "BUY", type: "LIMIT",
  timeInForce: "GTC", price: "0.05", quantity: "100",
}), { method: "POST", headers: { "X-SEEDS-APIKEY": KEY } });

console.log(await res.json());`}</Code>
        <Code>{`# Python
import hashlib, hmac, os, time, urllib.parse, requests

BASE = "${BASE}${V1}"
KEY, SECRET = os.environ["SEEDS_KEY"], os.environ["SEEDS_SECRET"].encode()

def signed(method, path, **params):
    params["timestamp"] = int(time.time() * 1000)
    qs = urllib.parse.urlencode(params)
    sig = hmac.new(SECRET, qs.encode(), hashlib.sha256).hexdigest()
    return requests.request(method, f"{BASE}{path}?{qs}&signature={sig}",
                            headers={"X-SEEDS-APIKEY": KEY}).json()

print(signed("GET", "/account"))`}</Code>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <p>
          All paths below are relative to <C>{BASE}</C>. The <C>public</C> in the path means the
          address is reachable without a website login. Signed endpoints still need a key.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Method</th>
                <th className="py-2 pr-3 font-normal">Path</th>
                <th className="py-2 pr-3 font-normal">Weight</th>
                <th className="py-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([m, p, w, note]) => (
                <tr key={m + p} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 text-primary">{m}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground">{p}</td>
                  <td className="py-2 pr-3 tabular-nums">{w}</td>
                  <td className="py-2 font-sans"><Note text={note} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A new order returns Binance’s usual fields plus <C>fills</C> (trade IDs) and{" "}
          <C>settlements</C> (what happened to each matched trade).
        </p>
      </Section>

      <Section id="account" title="Account response">
        <Code>{`GET ${V1}/account

{
  "accountType": "SPOT",
  "custody": "non-custodial",
  "canTrade": false,          // true when a live trading authorization can settle fills
  "canWithdraw": false,       // always false
  "makerCommission": 0,
  "takerCommission": 0,
  "tradingPocket": {          // null when no HME Wallet pocket is linked
    "mode": "instant",        // "instant" or "approve"
    "account": 1106,          // HME Wallet pocket number
    "linkedAt": 1794900000000,
    "addresses": { "TXC": "T...", "LTC": "ltc1...", "EVM": "0x..." }
  },
  "addresses": { ... },       // earlier Seeds wallet addresses, if any
  "authorizations": [ ... ]   // earlier capped, expiring trading authorizations
}`}</Code>
        <p>
          Pocket numbers change when a member revokes and relinks, because HME Wallet moves them
          to a fresh pocket. Read <C>/account</C> again rather than caching addresses.
        </p>
      </Section>

      <Section id="filters" title="Filters">
        <p>
          Every current market quotes in a stable dollar (TSD or USDC). Those markets share these
          filters. <C>/exchangeInfo</C> is always the source of truth.
        </p>
        <Code>{`PRICE_FILTER  tickSize 0.000001   minPrice 0.00000001   maxPrice 1000000
LOT_SIZE      stepSize 0.00000001 minQty 0.0001         maxQty 100000000
MIN_NOTIONAL  1.00 (price × quantity, in the quote asset)
Order types   LIMIT only, timeInForce GTC only`}</Code>
      </Section>

      <Section id="ratelimits" title="Rate limits">
        <p>
          Signed endpoints share a budget of 1200 request weight per key per minute, counted in a
          fixed one-minute window. Going over returns HTTP 429 with code <C>-1003</C>. Wait for the
          next minute.
        </p>
        <p>
          Public endpoints aren’t counted per key. They’re cached for 2–5 seconds, so polling
          faster than that returns the same data. Use the stream instead.
        </p>
      </Section>

      <Section id="streams" title="Streaming (SSE)">
        <Code>{`curl -N "${BASE}${V1}/stream?symbol=${EXAMPLE}&streams=ticker,depth,trade&interval=2000"

event: open
data: {"symbol":"${EXAMPLE}","streams":["ticker","depth","trade"],"intervalMs":2000}

event: ticker
data: {"symbol":"${EXAMPLE}","lastPrice":"0.05000000", ...}`}</Code>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <C>interval</C>: how often to push, 1000–30000 ms (default 2000).
          </li>
          <li>
            <C>depth</C> events carry the top 50 levels. <C>trade</C> events carry only trades you
            haven’t seen yet.
          </li>
          <li>
            Connections close after 10 minutes with a <C>close</C> event (
            <C>{`{"reconnect":true}`}</C>). Reconnect, which <C>EventSource</C> does for you.
          </li>
          <li>
            Event types: <C>open</C>, <C>ticker</C>, <C>depth</C>, <C>trade</C>, <C>close</C>,{" "}
            <C>error</C>.
          </li>
        </ul>
      </Section>

      <Section id="klines" title="Klines">
        <p>
          Intervals: <C>1m 3m 5m 15m 30m 1h 2h 4h 6h 12h 1d 1w</C>. Candles are built from the most
          recent 1000 trades. Intervals with no trades are skipped rather than filled, so treat a
          gap as “no trades.” Each row is{" "}
          <C>[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades]</C>.
        </p>
      </Section>

      <Section id="cmc" title="CoinMarketCap feed">
        <p>
          Listing sites can read Seeds in CoinMarketCap’s “Ideal API” format. Pairs use{" "}
          <C>BASE_QUOTE</C> form, for example <C>TXC_TSD</C>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse font-mono text-xs">
            <tbody>
              {CMC.map(([p, note]) => (
                <tr key={p} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground">{p}</td>
                  <td className="py-2 font-sans text-muted-foreground"><Note text={note} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="errors" title="Errors">
        <p>
          Errors return a numeric code and a message, so bots branch on the code, not the text:{" "}
          <C>{`{"code":-1022,"msg":"Signature for this request is not valid"}`}</C>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {ERRORS.map(([code, msg]) => (
                <tr key={code} className="border-b border-border/50">
                  <td className="w-20 py-2 pr-3 font-mono text-primary tabular-nums">{code}</td>
                  <td className="py-2">{msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
