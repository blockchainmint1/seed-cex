/**
 * Activity page reads (server-only, read-only): every record of the signed-in
 * member, turned into ActivityRow by activity-rules.ts. Nothing here moves coins
 * or advances a swap; each source is filtered to the member's own user id.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPair } from "@/lib/chains";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin } from "@/lib/xchain/assets";
import { AI_CATALOG } from "@/lib/ai/catalog";
import { NETWORK_LABEL } from "./deposit-rules";
import { trackerUrl } from "@/lib/xchain/send-rules";
import { DEX_NETWORKS, type DexNetwork } from "@/lib/dex/venues";
import { withdrawCoin } from "@/lib/withdraw/catalog";
import { chainEndSymbol, chainStatusLabel, chainSteps, relayIsSecond, type HypeChainDirection, type HypeChainStatus, type HypeChainVia } from "@/lib/hype-chain/rules";
import { RELAY_STATUS_LABEL, type RelayStatus } from "@/lib/relay/rules";
import {
  APPROVAL_WHAT, AI_LABEL, DEX_LABEL, P2P_LABEL, ROUTE_LABEL, SEND_LABEL, TRADE_LABEL, TWO_LABEL, WITHDRAW_LABEL, ORDER_LABEL,
  aiTone, approvalWaiting, dexTone, hiddenLegs, mySide, newestFirst, orderTone, p2pTone, routeTone, sendTone, swapHref, tradeTone, twoTone, withdrawTone,
  type ActivityRow,
} from "./activity-rules";

const TXC_TX = "https://mempool.texitcoin.org/tx/";
const num = (v: unknown) => (v == null ? 0 : Number(v));
const coinOf = (asset: string) => SWAP_COINS.find((c) => c.asset === asset)?.symbol ?? asset;
const pairOf = (id: string) => {
  try { return getPair(id); } catch { return null; }
};

export async function loadActivity(userId: string) {
  const me = userId;
  const [orders, trades, sends, routes, dex, twos, p2p, withdrawals, ai, approvals, links, deposits, chains, relays, tons] = await Promise.all([
    supabaseAdmin.from("orders").select("id, pair, side, price, amount, filled, status, order_type, cancel_reason, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("trades").select("id, pair, side, price, amount, status, maker_id, taker_id, created_at").or(`maker_id.eq.${me},taker_id.eq.${me}`).order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("swap_sends").select("id, from_asset, to_asset, amount_in, expected_out, status, protocol, txid, error, created_at, parent_id").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("tsd_routes").select("id, direction, coin, amount_in, amount_out, shown_out, stage, protocol, swap_send_id, tsd_txid, error, created_at, parent_id").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("dex_swaps").select("id, network, symbol_in, symbol_out, amount_in, amount_out, shown_out, status, venue_name, swap_txid, tsd_route_id, two_step_id, error, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("two_step_swaps").select("id, network, mid_id, symbol_in, symbol_out, amount_in, amount_out, shown_out, status, protocol, swap_send_id, leg2_swap_send_id, error, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("p2p_trades").select("id, seller_id, buyer_id, asset, crypto_amount, fiat_amount, payment_method, status, release_txid, created_at").or(`seller_id.eq.${me},buyer_id.eq.${me}`).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("pocket_withdrawals").select("id, chain, coin, amount, to_address, status, txid, error, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("ai_plan_moves").select("id, side, coin_id, usd, amount, amount_in, amount_out, status, route_id, error, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("send_approvals").select("id, purpose, asset, amount, status, expires_at, created_at").eq("user_id", me).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("hme_links").select("id, source, mode, status, created_at, revoked_at").eq("user_id", me).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("pocket_deposits").select("id, network, coin, amount, txid, tx_url, from_seeds, seen_at, block_time").eq("user_id", me).order("block_time", { ascending: false, nullsFirst: false }).limit(300),
    supabaseAdmin.from("hype_chains").select("id, direction, via, coin_id, amount_in, shown_out, amount_out, status, ton_amount, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("relay_swaps").select("id, direction, amount_in, shown_out, amount_out, status, deposit_txid, created_at").eq("user_id", me).is("parent_id", null).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("ton_swaps").select("id, offer_units, shown_units, received_units, status, txid, created_at").eq("user_id", me).is("parent_id", null).order("created_at", { ascending: false }).limit(200),
  ]);

  const hide = hiddenLegs({ tsdRoutes: routes.data ?? [], sends: sends.data ?? [], twoSteps: twos.data ?? [], dexSwaps: dex.data ?? [] });
  const aiRoutes = new Set((ai.data ?? []).map((m) => m.route_id).filter(Boolean));
  const rows: ActivityRow[] = [];

  for (const o of orders.data ?? []) {
    const p = pairOf(o.pair);
    rows.push({
      id: `o-${o.id}`, kind: "order", at: o.created_at,
      title: `${o.order_type === "market" ? "Market" : "Limit"} ${o.side} ${p?.label ?? o.pair}`,
      detail: `${num(o.filled)} of ${num(o.amount)} ${p?.base ?? ""} filled at ${num(o.price)}`,
      sent: null, got: null, status: o.cancel_reason === "coins_left_pocket" ? "Cancelled · coins left your pocket" : o.cancel_reason === "reapprove_needed" ? "Cancelled · re-place with one tap" : o.cancel_reason === "approval_ended" ? "Cancelled · Telegram approval ended" : (ORDER_LABEL[o.status] ?? o.status), tone: orderTone(o.status),
      href: p ? `/trade/${p.slug}` : null, txUrl: null,
    });
  }
  for (const t of trades.data ?? []) {
    const p = pairOf(t.pair);
    const role = t.maker_id === me ? ("maker" as const) : ("taker" as const);
    const side = mySide(t.side, role);
    const base = { amount: num(t.amount), coin: p?.base ?? t.pair.split("_")[0]?.toUpperCase() ?? "" };
    const quote = { amount: num(t.amount) * num(t.price), coin: p?.quote ?? t.pair.split("_")[1]?.toUpperCase() ?? "" };
    rows.push({
      id: `t-${t.id}`, kind: "trade", at: t.created_at,
      title: `${side === "buy" ? "Bought" : "Sold"} ${p?.base ?? ""} · ${p?.label ?? t.pair}`,
      detail: `${role} at ${num(t.price)}`,
      sent: side === "buy" ? quote : base, got: side === "buy" ? base : quote,
      status: TRADE_LABEL[t.status] ?? t.status, tone: tradeTone(t.status), href: "/activity?tab=trades", txUrl: null,
    });
  }
  for (const s of sends.data ?? []) {
    if (hide.sends.has(s.id)) continue;
    const p = s.protocol === "maya" ? "maya" : "thorchain";
    rows.push({
      id: `s-${s.id}`, kind: "swap", at: s.created_at, title: `Swap ${coinOf(s.from_asset)} → ${coinOf(s.to_asset)}`,
      detail: `Chain to chain · ${PROTOCOL_LABEL[p]}`,
      sent: { amount: num(s.amount_in), coin: coinOf(s.from_asset) }, got: { amount: num(s.expected_out), coin: coinOf(s.to_asset) },
      status: SEND_LABEL[s.status] ?? s.status, tone: sendTone(s.status), href: swapHref("send", s.id),
      txUrl: s.txid && s.status !== "failed" ? trackerUrl(p, s.txid) : null,
    });
  }
  for (const r of routes.data ?? []) {
    if (hide.routes.has(r.id)) continue;
    const sym = swapCoin(r.coin as never)?.symbol ?? r.coin;
    const buy = r.direction === "buy";
    const out = r.amount_out != null ? num(r.amount_out) : num(r.shown_out);
    rows.push({
      id: `r-${r.id}`, kind: "swap", at: r.created_at, title: buy ? `Swap TSD → ${sym}` : `Swap ${sym} → TSD`,
      detail: `TSD Bridge + ${PROTOCOL_LABEL[r.protocol === "maya" ? "maya" : "thorchain"]}${aiRoutes.has(r.id) ? " · by Seeds AI" : ""}`,
      sent: { amount: num(r.amount_in), coin: buy ? "TSD" : sym }, got: { amount: out, coin: buy ? sym : "TSD" },
      status: ROUTE_LABEL[r.stage] ?? r.stage, tone: routeTone(r.stage), href: swapHref("tsd", r.id),
      txUrl: r.tsd_txid ? `${TXC_TX}${r.tsd_txid}` : null,
    });
  }
  for (const d of dex.data ?? []) {
    if (hide.dex.has(d.id)) continue;
    const net = DEX_NETWORKS[d.network as DexNetwork];
    rows.push({
      id: `d-${d.id}`, kind: "swap", at: d.created_at, title: `Swap ${d.symbol_in} → ${d.symbol_out}`,
      detail: `${d.venue_name ?? "Pool"} · ${net?.name ?? d.network}`,
      sent: { amount: num(d.amount_in), coin: d.symbol_in }, got: { amount: d.amount_out != null ? num(d.amount_out) : num(d.shown_out), coin: d.symbol_out },
      status: DEX_LABEL[d.status] ?? d.status, tone: dexTone(d.status), href: swapHref("dex", d.id),
      txUrl: d.swap_txid && net ? `${net.explorerTx}${d.swap_txid}` : null,
    });
  }
  for (const w of twos.data ?? []) {
    rows.push({
      id: `w-${w.id}`, kind: "swap", at: w.created_at, title: `Swap ${w.symbol_in} → ${w.symbol_out}`,
      detail: `Two steps via ${swapCoin(w.mid_id as never)?.symbol ?? w.mid_id} · ${PROTOCOL_LABEL[w.protocol === "maya" ? "maya" : "thorchain"]}`,
      sent: { amount: num(w.amount_in), coin: w.symbol_in }, got: { amount: w.amount_out != null ? num(w.amount_out) : num(w.shown_out), coin: w.symbol_out },
      status: TWO_LABEL[w.status] ?? w.status, tone: twoTone(w.status), href: swapHref("two", w.id), txUrl: null,
    });
  }
  // One-tap chains (e.g. TSD -> ETH -> TON -> USD₮ on TON): one row as on the Swap page; their steps are hidden above.
  for (const c of chains.data ?? []) {
    const d = c.direction as HypeChainDirection;
    const sym = c.coin_id === "TSD" ? "TSD" : swapCoin(c.coin_id as never)?.symbol ?? c.coin_id;
    const from = relayIsSecond(d) ? sym : "HYPE", to = relayIsSecond(d) ? chainEndSymbol(d) : sym;
    rows.push({
      id: `h-${c.id}`, kind: "swap", at: c.created_at, title: `Swap ${from} → ${to}`,
      detail: `One tap · ${chainSteps(d, c.via as HypeChainVia, sym).slice(1).join(" → ")}`,
      sent: { amount: num(c.amount_in), coin: from }, got: { amount: c.amount_out != null ? num(c.amount_out) : num(c.shown_out), coin: to },
      status: chainStatusLabel(c.status as HypeChainStatus, d, c.ton_amount != null), tone: twoTone(c.status), href: swapHref("chain", c.id), txUrl: null,
    });
  }
  const RELAY_SYM: Record<string, [string, string]> = { to_hype: ["ETH", "HYPE"], from_hype: ["HYPE", "ETH"], to_ton: ["ETH", "TON"] };
  for (const r of relays.data ?? []) {
    const [a, b] = RELAY_SYM[r.direction] ?? ["ETH", "?"];
    const hyper = r.direction === "from_hype";
    rows.push({
      id: `y-${r.id}`, kind: "swap", at: r.created_at, title: `Swap ${a} → ${b}`, detail: "Relay",
      sent: { amount: num(r.amount_in), coin: a }, got: { amount: r.amount_out != null ? num(r.amount_out) : num(r.shown_out), coin: b },
      status: RELAY_STATUS_LABEL[r.status as RelayStatus] ?? r.status, tone: twoTone(r.status), href: swapHref("relay", r.id),
      txUrl: r.deposit_txid ? `${hyper ? "https://hyperevmscan.io/tx/" : "https://etherscan.io/tx/"}${r.deposit_txid}` : null,
    });
  }
  for (const t of tons.data ?? []) {
    const label: Record<string, string> = { done: "Delivered", failed: "Stopped", unknown: "Checking", sent: "Sent to STON.fi", signing: "Sending" };
    rows.push({
      id: `n-${t.id}`, kind: "swap", at: t.created_at, title: "Swap TON → USD₮ on TON", detail: "STON.fi",
      sent: { amount: num(t.offer_units) / 1e9, coin: "TON" }, got: { amount: (t.received_units != null ? num(t.received_units) : num(t.shown_units)) / 1e6, coin: "USD₮ on TON" },
      status: label[t.status] ?? t.status, tone: twoTone(t.status), href: "/swap?from=TON&to=USDT_TON",
      txUrl: t.txid ? `https://tonviewer.com/transaction/${t.txid}` : null,
    });
  }
  for (const t of p2p.data ?? []) {
    const role = t.seller_id === me ? ("seller" as const) : ("buyer" as const);
    const crypto = { amount: num(t.crypto_amount), coin: t.asset };
    const fiat = { amount: num(t.fiat_amount), coin: "USD" };
    rows.push({
      id: `p-${t.id}`, kind: "p2p", at: t.created_at, title: `${role === "seller" ? "Sold" : "Bought"} ${t.asset} for cash`,
      detail: t.payment_method,
      sent: role === "seller" ? crypto : fiat, got: role === "seller" ? fiat : crypto,
      status: P2P_LABEL[t.status] ?? t.status, tone: p2pTone(t.status, role), href: `/p2p/trade/${t.id}`, txUrl: null,
    });
  }
  for (const w of withdrawals.data ?? []) {
    const c = withdrawCoin(w.coin, w.chain);
    rows.push({
      id: `x-${w.id}`, kind: "withdrawal", at: w.created_at, title: `Withdraw ${w.coin}`,
      detail: `${c?.networkLabel ?? w.chain} · to ${w.to_address.slice(0, 8)}…${w.to_address.slice(-6)}`,
      sent: { amount: num(w.amount), coin: w.coin }, got: null,
      status: WITHDRAW_LABEL[w.status] ?? w.status, tone: withdrawTone(w.status), href: "/account/balances/withdraw",
      txUrl: w.txid && c ? `${c.explorerTx}${w.txid}` : null,
    });
  }
  for (const m of ai.data ?? []) {
    const sym = AI_CATALOG.find((c) => c.geckoId === m.coin_id)?.symbol.toUpperCase() ?? swapCoin(m.coin_id as never)?.symbol ?? m.coin_id.toUpperCase();
    const buy = m.side === "buy";
    rows.push({
      id: `a-${m.id}`, kind: "ai", at: m.created_at, title: `Seeds AI ${buy ? "bought" : "sold"} ${sym}`, detail: m.error,
      sent: buy ? { amount: m.amount_in != null ? num(m.amount_in) : num(m.usd), coin: "TSD" } : { amount: m.amount_in != null ? num(m.amount_in) : num(m.amount), coin: sym },
      got: m.amount_out != null ? { amount: num(m.amount_out), coin: buy ? sym : "TSD" } : null,
      status: AI_LABEL[m.status] ?? m.status, tone: aiTone(m.status), href: "/account/ai", txUrl: null,
    });
  }
  const now = Date.now();
  for (const a of approvals.data ?? []) {
    if (!approvalWaiting(a, now)) continue;
    rows.push({
      id: `q-${a.id}`, kind: "approval", at: a.created_at, title: `${APPROVAL_WHAT[a.purpose] ?? "Send"} waiting for your Telegram tap`,
      detail: `Ends ${new Date(a.expires_at).toISOString()}`, sent: { amount: num(a.amount), coin: a.asset }, got: null,
      status: "Tap Approve in Telegram", tone: "action", href: null, txUrl: null,
    });
  }
  for (const l of links.data ?? []) {
    const what = l.source === "seeds_key" ? "coin / wallet (Seeds Key)" : "HME Wallet";
    rows.push({ id: `l-${l.id}`, kind: "wallet", at: l.created_at, title: `Linked ${what}`, detail: l.mode === "access" ? "Instant access" : l.mode, sent: null, got: null, status: l.status === "active" ? "Active" : "Revoked", tone: l.status === "active" ? "done" : "stopped", href: "/account/security", txUrl: null });
    if (l.revoked_at) rows.push({ id: `lr-${l.id}`, kind: "wallet", at: l.revoked_at, title: `Revoked ${what} access`, detail: null, sent: null, got: null, status: "Revoked", tone: "stopped", href: "/account/security", txUrl: null });
  }
  for (const d of deposits.data ?? []) {
    rows.push({
      id: `dep-${d.id}`, kind: "deposit", at: d.block_time ?? d.seen_at, title: `Deposit ${d.coin}`,
      detail: `${NETWORK_LABEL[d.network] ?? d.network}${d.from_seeds ? ` · from ${d.from_seeds}` : ""}`, sent: null, got: { amount: num(d.amount), coin: d.coin },
      status: "Received", tone: "done", href: "/account/balances", txUrl: d.tx_url,
    });
  }
  rows.sort(newestFirst);
  return { rows, depositsReady: !deposits.error };
}
