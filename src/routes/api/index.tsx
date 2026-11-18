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
          "Seeds bot API quick start, step-by-step HMAC signing examples in Bash, Node.js and Python, trading recipes and troubleshooting. Keys can trade, never withdraw.",
      },
      { property: "og:title", content: "Seeds API — Trading API for Bots & Market Makers" },
      {
        property: "og:description",
        content:
          "Build a Seeds trading bot with a quick start, signed-request examples, recipes and safety guidance. Public REST and SSE market data needs no key.",
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
  ["quick-start", "Quick start"],
  ["markets", "Markets"],
  ["differences", "How Seeds differs"],
  ["auth", "Authentication"],
  ["signing", "Signing step by step"],
  ["recipes", "Recipes"],
  ["key-safety", "Keeping your key safe"],
  ["troubleshooting", "Troubleshooting"],
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
          may work, but check the supported endpoints, parameters and non-custodial account model first.
        </p>
        <p className="mt-4 font-mono text-sm text-foreground">
          Base URL <span className="text-primary">{BASE}{V1}</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            to="/account/api-keys"
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

      <Section id="quick-start" title="Quick start">
        <ol className="list-decimal space-y-3 pl-5">
          <li>Sign in to Seeds with Honest.Money using your own account.</li>
          <li>On Profile, link your HME Wallet trading pocket. A link is not a deposit into a Seeds balance.</li>
          <li>Open Profile → <Link to="/account/api-keys" className="text-primary underline underline-offset-2">API keys</Link>.</li>
          <li>Create a key with a descriptive label. Choose read for a dashboard, or read + trade for a bot that places and cancels orders. Optionally restrict it to your bot’s public outbound IP addresses.</li>
          <li>Copy the key ID and the secret immediately: the secret is shown once. Store them in your server’s secret manager or environment as <C>SEEDS_KEY</C> and <C>SEEDS_SECRET</C>. If you lose the secret, create another key.</li>
          <li>Check connectivity and server time with the unsigned requests below. Neither needs a key.</li>
          <li>Run one of the signed <C>GET /account</C> examples below. Inspect <C>tradingPocket</C> and <C>authorizations</C> before attempting any trading.</li>
        </ol>
        <Code>{`curl -sS "${BASE}${V1}/ping"
curl -sS "${BASE}${V1}/time"`}</Code>
        <p>Public data, signed reads, order entry and cancellation are live. Settlement through linked HME Wallet pockets is still being built: a match is not proof of settlement. Only accounts with earlier Seeds trading authorizations currently settle immediately. A new pocket link alone does not make end-to-end bot settlement live.</p>
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
            With <em>approve every trade</em>, the intended settlement flow requires approval
            in HME Wallet. Pocket settlement is still being built; neither mode implies it is live.
            <C>/account</C> reports the linked mode.
          </li>
          <li>
            <strong className="text-foreground">API keys can never withdraw.</strong> Scopes are{" "}
            <C>read</C> and <C>trade</C> only. A stolen key can place or cancel orders but cannot
            withdraw, but unauthorized trades can still cause losses within your trading authorizations. Add an IP allowlist to limit access.
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
          <Link to="/account/api-keys" className="text-primary underline underline-offset-2">
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
        <p>Use the complete examples in <a href="#signing" className="text-primary underline underline-offset-2">Signing a request, step by step</a>. Keep the secret on a trusted server, never in browser code.</p>
      </Section>

      <Section id="signing" title="Signing a request, step by step">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Build your parameters, including a fresh <C>timestamp</C> in Unix milliseconds and optionally <C>recvWindow</C>. Serialize once as a URL-encoded query string. Parameter order is not sorted by the server: use exactly the order and encoding you will send.</li>
          <li>For GET and DELETE, the payload is that raw query string alone; bodies are ignored. For other methods, concatenate the query string with the raw body, with no added separator. Bodies are parsed as URL-encoded form fields, not JSON; body values override query values for parameter lookup.</li>
          <li>Compute HMAC-SHA256 over the UTF-8 payload using the secret’s literal UTF-8 text (do not hex-decode it). Encode the digest as hex. The examples use lowercase; the verifier also accepts uppercase hex.</li>
          <li>Append <C>&amp;signature=</C> and the digest as the last query parameter. Do not include the question mark, URL, method, headers or signature itself in the payload. Send the key ID in <C>X-SEEDS-APIKEY</C>.</li>
          <li>Send the exact bytes you signed. Never re-sort or re-encode parameters afterward. The verifier slices the raw query at <C>&amp;signature=</C>, so parameters must not follow the signature.</li>
        </ol>
        <p>The examples keep every parameter in the query and send no body, including for POST. This avoids query/body ambiguity. All three read credentials from your environment and make the same first signed call. Do not enable shell tracing or log signed URLs.</p>
        <h3 className="font-semibold text-foreground">Bash + curl + OpenSSL</h3>
        <p>Requires Bash, curl, OpenSSL and Python 3 (only for a portable millisecond clock). Set your real credentials in the environment first.</p>
        <Code>{`#!/usr/bin/env bash
set -euo pipefail
: "\${SEEDS_KEY:?Set SEEDS_KEY}" "\${SEEDS_SECRET:?Set SEEDS_SECRET}"
BASE="${BASE}${V1}"
timestamp=$(python3 -c 'import time; print(int(time.time() * 1000))')
qs="recvWindow=5000&timestamp=$timestamp"
# printf adds no newline. The secret is literal text, not hex bytes.
sig=$(printf '%s' "$qs" | openssl dgst -sha256 -hmac "$SEEDS_SECRET" | awk '{print $NF}')
curl -sS --header "X-SEEDS-APIKEY: $SEEDS_KEY" "$BASE/account?$qs&signature=$sig"`}</Code>
        <p>OpenSSL’s command-line secret may be visible in the local process list. Run this demonstration only on a trusted machine; use an in-process HMAC library for a production bot.</p>
        <h3 className="font-semibold text-foreground">Node.js (18+, save as bot.mjs)</h3>
        <Code>{`import { createHmac } from "node:crypto";

const BASE = "${BASE}${V1}";
const { SEEDS_KEY: KEY, SEEDS_SECRET: SECRET } = process.env;
if (!KEY || !SECRET) throw new Error("Set SEEDS_KEY and SEEDS_SECRET");

async function signed(method, path, params = {}) {
  const qs = new URLSearchParams({
    ...params, recvWindow: "5000", timestamp: String(Date.now()),
  }).toString();
  const sig = createHmac("sha256", SECRET).update(qs, "utf8").digest("hex");
  const res = await fetch(\`\${BASE}\${path}?\${qs}&signature=\${sig}\`, {
    method, headers: { "X-SEEDS-APIKEY": KEY },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${JSON.stringify(data)}\`);
  return data;
}

console.log(await signed("GET", "/account"));`}</Code>
        <h3 className="font-semibold text-foreground">Python 3 + requests</h3>
        <p>Install the dependency with <C>python3 -m pip install requests</C>, then run this as a server-side script.</p>
        <Code>{`import hashlib, hmac, os, time
from urllib.parse import urlencode
import requests

BASE = "${BASE}${V1}"
KEY = os.environ["SEEDS_KEY"]
SECRET = os.environ["SEEDS_SECRET"].encode("utf-8")

def signed(method, path, **params):
    params.update(recvWindow="5000", timestamp=str(int(time.time() * 1000)))
    qs = urlencode(params)
    sig = hmac.new(SECRET, qs.encode("utf-8"), hashlib.sha256).hexdigest()
    res = requests.request(method, f"{BASE}{path}?{qs}&signature={sig}",
                           headers={"X-SEEDS-APIKEY": KEY}, timeout=30)
    data = res.json()
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status_code}: {data}")
    return data

print(signed("GET", "/account"))`}</Code>
      </Section>

      <Section id="recipes" title="Recipes">
        <p>These snippets use the Node.js <C>signed(method, path, params)</C> helper above. Reads require read scope; order creation and cancellation require trade scope. Every invocation signs a fresh timestamp.</p>
        <h3 className="font-semibold text-foreground">1. Place a limit order</h3>
        <p>Read <C>/exchangeInfo</C> first and choose a symbol, price and quantity matching its filters. This example is a real BUY if executed, not a sandbox. Only LIMIT and GTC are supported (and are the defaults). The response includes <C>orderId</C>, <C>fills</C> and <C>settlements</C>; retain them.</p>
        <Code>{`const placed = await signed("POST", "/order", {
  symbol: "${EXAMPLE}", side: "BUY", type: "LIMIT", timeInForce: "GTC",
  price: "0.05", quantity: "100",
});
console.log(placed);`}</Code>
        <p>A match may still await settlement. After a timeout, inspect open orders, order history and fills before deciding whether to place again. There is no client order ID/idempotency parameter in the handler; blindly retrying can create a second order.</p>
        <h3 className="font-semibold text-foreground">2. Cancel an order</h3>
        <Code>{`// Use the orderId returned by your own order, not a symbol or client ID.
console.log(await signed("DELETE", "/order", { orderId: placed.orderId }));`}</Code>
        <p>Cancel only works for your open or partially filled orders. A fill can race with cancellation; reconcile order status and trades rather than assuming nothing executed.</p>
        <h3 className="font-semibold text-foreground">3. List open orders</h3>
        <Code>{`console.log(await signed("GET", "/openOrders", { symbol: "${EXAMPLE}" }));
// Omit symbol to include all markets.
console.log(await signed("GET", "/openOrders"));`}</Code>
        <p>The implementation returns at most 500 open/partial orders, newest first. There is no pagination parameter on this endpoint.</p>
        <h3 className="font-semibold text-foreground">4. Poll my trades</h3>
        <Code>{`const seen = new Set(); // Persist IDs in a database in production.
async function pollTrades() {
  const trades = await signed("GET", "/myTrades", {
    symbol: "${EXAMPLE}", limit: "500",
  });
  for (const trade of trades) {
    if (!seen.has(trade.id)) {
      seen.add(trade.id);
      console.log("New fill", trade);
    }
    // Reconcile settlement status/legs for already-seen IDs too.
  }
}
await pollTrades(); // Schedule subsequent calls within your weight budget.`}</Code>
        <p><C>symbol</C> is optional. <C>limit</C> defaults to 500 and is clamped to 1–1000. There is no since/fromId cursor: poll frequently enough for your volume, persist IDs, and do not assume this bounded response is a complete historical ledger.</p>
        <h3 className="font-semibold text-foreground">5. Subscribe to public market SSE</h3>
        <Code>{`curl -N "${BASE}${V1}/stream?symbol=${EXAMPLE}&streams=ticker,depth,trade&interval=2000"`}</Code>
        <p>No API key or signature is needed. This is public market data, not a private order/fill stream. Listen for named events; reconnect when the connection ends (curl does not do this automatically). Browser EventSource reconnects automatically, but a custom close handler must not call its permanent <C>close()</C> method if you expect reconnection. See the stream section for bounded history and event details.</p>
      </Section>

      <Section id="key-safety" title="Keeping your key safe">
        <ul className="list-disc space-y-3 pl-5">
          <li>Use an IP allowlist for a bot with stable outbound networking. Matching is exact string membership against the server-observed source IP, not CIDR/subnet matching. Include the public egress address, not a private LAN address. An empty list imposes no IP restriction.</li>
          <li>Use read-only keys for dashboards and separate keys for each bot. Enable trade scope only where needed. A trade-only key does not implicitly include read scope.</li>
          <li>Disable pauses a key and can be reversed; delete removes it permanently. Both prevent subsequent authentication; neither is an order-cancellation operation. Inspect and cancel unwanted open orders separately using another authorized key or the website.</li>
          <li>Rotate by creating a replacement, storing its one-time secret, deploying and testing it, then disabling/deleting the old key. For a suspected leak, disable/delete immediately rather than waiting for a graceful rollout.</li>
          <li>Never embed the secret in browser JavaScript, a mobile bundle, public repository or logs. Sign on a trusted server. Protect both credentials with a secret manager; avoid logging signed URLs and request headers.</li>
          <li>Synchronize the bot host’s clock (for example with NTP) and compare with <C>/time</C>. <C>recvWindow</C> defaults to 5000 ms and is capped at 60000 ms. Requests older than the window or more than 1000 ms ahead are rejected. Generate a new timestamp and signature for each request; widening the window is not a substitute for clock sync.</li>
          <li>A leaked read key exposes account/order information. A leaked trade-capable key can place/cancel orders within your account’s trading authorizations and cause losses, but can never withdraw. Disable/delete it, inspect orders and trades, rotate credentials, and review/revoke wallet links and trading authorizations if needed.</li>
        </ul>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <p>Errors have numeric <C>code</C> and text <C>msg</C>. Branch on code; keep secrets and signed URLs out of diagnostic logs.</p>
        <ul className="list-disc space-y-3 pl-5">
          <li><C>-1022</C> — “Signature for this request is not valid”: check the secret belongs to this key, use literal secret text, remove any trailing newline, preserve exact query encoding/order, append signature last, and include the raw form body for POST (but not GET/DELETE).</li>
          <li><C>-1021</C> — “Timestamp for this request is outside of the recvWindow”: use Unix milliseconds, sync your clock, avoid queued/stale signed URLs, and account for the 1000 ms future tolerance. Re-sign after adjusting time.</li>
          <li><C>-1004</C> — “Source IP not in key allowlist”: check the bot’s public egress IPv4/IPv6 address and exact allowlist entries. A nonempty list also rejects requests where the server cannot identify a source IP.</li>
          <li><C>-1002</C> — “API key lacks 'read' scope” or “API key lacks 'trade' scope”: use a key explicitly granted the scope required by that method. Trade scope does not grant read.</li>
          <li><C>-2015</C> — “Missing X-SEEDS-APIKEY header” or “Invalid or disabled API key”: send the key ID (not the secret), check the environment and whether the key is disabled/deleted.</li>
          <li><C>-1102</C> — “Missing signature”, “Missing timestamp” or “Missing orderId”: supply the required value in the correct location. Always explicitly send a numeric timestamp; omission is not a valid signing strategy.</li>
          <li><C>-1003</C>, HTTP 429 — “Request weight limit exceeded, back off”: stop sending requests until the next fixed minute window, add jitter, and reduce polling across all processes sharing that key. The budget is 1200 weighted units, not 1200 calls.</li>
          <li><C>-1013</C>: check the price/quantity validation message and <C>/exchangeInfo</C> filters. <C>-1014</C>: use LIMIT/GTC. <C>-1121</C>: use a listed symbol. <C>-1130</C>: use BUY/SELL.</li>
          <li><C>-2010</C>: read the order rejection message and check your linked trading setup/authorizations. Do not treat a pending settlement as a settled transfer. <C>-2011</C>: refresh order status; it may already be filled/canceled or not yours. <C>-2013</C>: verify the order ID and account; the status handler searches the latest 1000 orders.</li>
          <li><C>-1100</C>: check the named parameter, such as kline interval. <C>-1000</C>: back off on server failures; for an ambiguous order submission, reconcile before retrying.</li>
        </ul>
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
  "canTrade": false,          // true when at least one unexpired, unrevoked legacy authorization exists
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
          Public endpoints aren’t counted per key. Many market-data responses advertise 2–5 seconds
          of caching; this is not a guarantee that repeated requests return identical data.
          Use the stream for ongoing market updates.
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
            <C>depth</C> events carry the top 50 levels. <C>trade</C> events start with the latest trade, then send new trades from the most recent 50
            since the previous poll. This is not a durable replay feed: reconnects can duplicate
            events and busy periods can lose history. Deduplicate by trade ID and reconcile with REST.
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
