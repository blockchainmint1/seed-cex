/**
 * Wrap desk — server side.
 *
 * Talks to the reserve-backed issuer over its partner API and mirrors order
 * state into `public.wrap_orders`. Seeds holds no issuer key and never mints.
 *
 * Issuer API contract (implemented on the issuer, consumed here):
 *   GET  {base}/api/public/v1/wrap/assets
 *   POST {base}/api/public/v1/wrap/orders
 *        { direction, asset, amount?, payoutAddress, refundAddress?, reference }
 *   GET  {base}/api/public/v1/wrap/orders/{id}
 * Auth: `x-api-key: <issuer key>` on every call.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getWrapAsset, type WrapDirection, type WrapStatus } from "./wrap-config";

const TIMEOUT_MS = 20_000;

type IssuerConfig = { baseUrl: string; apiKey: string };

function issuerConfig(): IssuerConfig | null {
  const baseUrl = process.env["WRAP_ISSUER_URL"];
  const apiKey = process.env["WRAP_ISSUER_API_KEY"];
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Whether the desk is wired up. Surfaced to the UI so it can explain itself. */
export function wrapDeskConfigured(): boolean {
  return issuerConfig() !== null;
}

type IssuerOrder = {
  id: string;
  status: string;
  depositAddress?: string | null;
  payoutAddress?: string | null;
  amountExpected?: number | null;
  amountReceived?: number | null;
  amountDelivered?: number | null;
  depositTxid?: string | null;
  deliveryTxid?: string | null;
  expiresAt?: string | null;
  error?: string | null;
};

async function issuerFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const cfg = issuerConfig();
  if (!cfg) {
    throw new Error(
      "Wrap desk is not configured. The issuer endpoint and API key are missing.",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const doFetch = (url: string) =>
      fetch(url, {
        method: init?.method ?? "GET",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        // Manual redirect handling: a 302 would rewrite POST to GET.
        redirect: "manual",
        signal: controller.signal,
      });
    let res = await doFetch(`${cfg.baseUrl}${path}`);
    // The issuer's app domain redirects to its custom domain; follow one hop
    // preserving method and body.
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (location) res = await doFetch(new URL(location, cfg.baseUrl).toString());
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const msg =
        (parsed as { error?: string; message?: string } | null)?.error ??
        (parsed as { message?: string } | null)?.message ??
        `Issuer returned ${res.status}`;
      throw new Error(msg);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Issuer did not respond in time. Try again shortly.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Map whatever the issuer calls a state onto our enum. */
function normalizeStatus(raw: string | undefined | null): WrapStatus {
  const s = (raw ?? "").toLowerCase();
  if (["complete", "completed", "minted", "released", "settled"].includes(s))
    return "complete";
  if (["failed", "error", "cancelled", "canceled"].includes(s)) return "failed";
  if (["expired", "timeout"].includes(s)) return "expired";
  if (["minting", "burning", "processing", "releasing", "issuing"].includes(s))
    return "processing";
  if (["deposit_confirmed", "confirmed"].includes(s)) return "deposit_confirmed";
  if (["deposit_detected", "detected", "seen"].includes(s)) return "deposit_detected";
  if (["awaiting_deposit", "pending", "open"].includes(s)) return "awaiting_deposit";
  return "created";
}

export type WrapOrderRow = {
  id: string;
  direction: WrapDirection;
  base_symbol: string;
  wrapped_symbol: string;
  issuer_order_id: string | null;
  issuer_status: string | null;
  deposit_address: string | null;
  payout_address: string | null;
  amount_expected: number | null;
  amount_received: number | null;
  amount_delivered: number | null;
  deposit_txid: string | null;
  delivery_txid: string | null;
  status: WrapStatus;
  error: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The user's shared trading address on TEXITcoin — where wrapped assets land. */
async function txcTradingAddress(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("wallets")
    .select("txc_address")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const addr = (data as { txc_address?: string | null } | null)?.txc_address;
  if (!addr) {
    throw new Error(
      "No TEXITcoin trading address yet. Unlock your wallet on the Wallet page first.",
    );
  }
  return addr;
}

/**
 * Open a wrap order: user sends native coin to the issuer's deposit address,
 * issuer mints the wrapped asset to the user's shared trading branch.
 */
export async function createWrapOrder(
  userId: string,
  baseSymbol: string,
  amount: number,
  refundAddress: string,
): Promise<WrapOrderRow> {
  const asset = getWrapAsset(baseSymbol);
  if (amount < asset.minAmount) {
    throw new Error(
      `Minimum wrap is ${asset.minAmount} ${asset.baseSymbol}.`,
    );
  }
  const payoutAddress = await txcTradingAddress(userId);

  const { data: created, error: insErr } = await supabaseAdmin
    .from("wrap_orders")
    .insert({
      user_id: userId,
      direction: "wrap",
      base_symbol: asset.baseSymbol,
      wrapped_symbol: asset.wrappedSymbol,
      payout_address: payoutAddress,
      amount_expected: amount,
      status: "created",
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  const row = created as WrapOrderRow;

  try {
    const issued = await issuerFetch<IssuerOrder>("/api/public/v1/wrap/orders", {
      method: "POST",
      body: {
        direction: "wrap",
        asset: asset.baseSymbol,
        amount,
        payoutAddress,
        refundAddress,
        reference: row.id,
      },
    });
    return await applyIssuerOrder(row.id, issued);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Issuer call failed";
    await supabaseAdmin
      .from("wrap_orders")
      .update({ status: "failed", error: message })
      .eq("id", row.id);
    throw new Error(message);
  }
}

/**
 * Send the user's wrapped tokens from their authorized trading branch to the
 * issuer's deposit address. Same gates as any settlement leg: live
 * authorization for that asset, cap, expiry, balance — decrypt last.
 */
async function sendWrappedToIssuer(
  userId: string,
  wrappedSymbol: string,
  amount: number,
  depositAddress: string,
): Promise<string> {
  const { omniLegAsset, LEGS, type OmniLegId } = await import("./chains");
  const legEntry = Object.values(LEGS).find((l) => l.symbol === wrappedSymbol);
  if (!legEntry) throw new Error(`No settlement leg for ${wrappedSymbol}`);
  const { propertyId } = omniLegAsset(legEntry.id as OmniLegId);

  const { decryptDelegatedKey } = await import("./delegation.server");
  const { fetchOmniBalance, omniSimpleSend } = await import("./omni.server");
  const { isValidTxcAddress } = await import("./txc/tx.server");

  if (!isValidTxcAddress(depositAddress)) {
    throw new Error("The issuer returned an invalid TEXITcoin deposit address.");
  }

  await supabaseAdmin.rpc("purge_expired_delegations");
  const { data: del, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("trading_address, max_amount, expires_at, key_ciphertext")
    .eq("user_id", userId)
    .eq("chain", "txc")
    .eq("asset", wrappedSymbol)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!del) {
    throw new Error(
      `No live ${wrappedSymbol} authorization. Authorize ${wrappedSymbol} on the Wallet page, then retry.`,
    );
  }
  if (new Date(del.expires_at).getTime() <= Date.now()) {
    throw new Error(`The ${wrappedSymbol} authorization has expired.`);
  }
  if (amount > Number(del.max_amount) + 1e-8) {
    throw new Error(
      `Unwrap size exceeds the authorized cap of ${del.max_amount} ${wrappedSymbol}.`,
    );
  }

  const bal = await fetchOmniBalance(del.trading_address, propertyId);
  if (!bal.online) throw new Error("The TEXITcoin node is not reachable.");
  if (bal.balance < amount) {
    throw new Error(
      `The authorized branch holds ${bal.balance.toFixed(8)} ${wrappedSymbol}, needs ${amount.toFixed(8)}.`,
    );
  }

  const privateKeyHex = decryptDelegatedKey(del.key_ciphertext);
  const sent = await omniSimpleSend({
    privateKeyHex,
    fromAddress: del.trading_address,
    toAddress: depositAddress,
    amount,
    propertyId,
  });
  return sent.txid;
}

/**
 * Open an unwrap order: user sends the wrapped asset back to the issuer,
 * issuer burns it and releases native coin to `payoutAddress`.
 */
export async function createUnwrapOrder(
  userId: string,
  baseSymbol: string,
  amount: number,
  payoutAddress: string,
): Promise<WrapOrderRow> {
  const asset = getWrapAsset(baseSymbol);
  if (amount <= 0) throw new Error("Amount must be greater than zero.");
  const refundAddress = await txcTradingAddress(userId);

  const { data: created, error: insErr } = await supabaseAdmin
    .from("wrap_orders")
    .insert({
      user_id: userId,
      direction: "unwrap",
      base_symbol: asset.baseSymbol,
      wrapped_symbol: asset.wrappedSymbol,
      payout_address: payoutAddress,
      amount_expected: amount,
      status: "created",
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);
  const row = created as WrapOrderRow;

  try {
    const issued = await issuerFetch<IssuerOrder>("/api/public/v1/wrap/orders", {
      method: "POST",
      body: {
        direction: "unwrap",
        asset: asset.baseSymbol,
        amount,
        payoutAddress,
        refundAddress,
        reference: row.id,
      },
    });
    const opened = await applyIssuerOrder(row.id, issued);

    // Now actually deliver the wrapped tokens the issuer will burn.
    if (!opened.deposit_address) {
      throw new Error("The issuer did not return a deposit address for the burn.");
    }
    const txid = await sendWrappedToIssuer(
      userId,
      asset.wrappedSymbol,
      amount,
      opened.deposit_address,
    );
    const { data: sentRow, error: upErr } = await supabaseAdmin
      .from("wrap_orders")
      .update({ deposit_txid: txid, status: "deposit_detected" })
      .eq("id", row.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return sentRow as WrapOrderRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Issuer call failed";
    await supabaseAdmin
      .from("wrap_orders")
      .update({ status: "failed", error: message })
      .eq("id", row.id);
    throw new Error(message);
  }
}

/** Write the issuer's view of an order onto our mirror row. */
async function applyIssuerOrder(
  localId: string,
  issued: IssuerOrder,
): Promise<WrapOrderRow> {
  const { data, error } = await supabaseAdmin
    .from("wrap_orders")
    .update({
      issuer_order_id: issued.id,
      issuer_status: issued.status ?? null,
      status: normalizeStatus(issued.status),
      deposit_address: issued.depositAddress ?? null,
      amount_received: issued.amountReceived ?? null,
      amount_delivered: issued.amountDelivered ?? null,
      deposit_txid: issued.depositTxid ?? null,
      delivery_txid: issued.deliveryTxid ?? null,
      expires_at: issued.expiresAt ?? null,
      error: issued.error ?? null,
    })
    .eq("id", localId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WrapOrderRow;
}

/** Re-poll one order against the issuer. No-op once terminal. */
export async function refreshWrapOrder(
  userId: string,
  localId: string,
): Promise<WrapOrderRow> {
  const { data, error } = await supabaseAdmin
    .from("wrap_orders")
    .select("*")
    .eq("id", localId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order not found.");
  const row = data as WrapOrderRow;
  if (!row.issuer_order_id) return row;
  if (row.status === "complete" || row.status === "failed") return row;

  const issued = await issuerFetch<IssuerOrder>(
    `/api/public/v1/wrap/orders/${encodeURIComponent(row.issuer_order_id)}`,
  );
  return applyIssuerOrder(row.id, issued);
}

/** The caller's wrap/unwrap history, newest first. */
export async function listWrapOrders(userId: string): Promise<WrapOrderRow[]> {
  const { data, error } = await supabaseAdmin
    .from("wrap_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as WrapOrderRow[];
}

export type WrapDeskStatus = {
  configured: boolean;
  online: boolean;
  /** Reserve vs. circulating supply, when the issuer publishes it. */
  reserves: {
    asset: string;
    reserve: number;
    supply: number;
    collateralization: number;
  }[];
  message: string | null;
};

/**
 * Issuer health + reserve summary. Purely informational; a dead issuer must
 * never block trading of assets that are already wrapped.
 */
export async function getWrapDeskStatus(): Promise<WrapDeskStatus> {
  if (!wrapDeskConfigured()) {
    return {
      configured: false,
      online: false,
      reserves: [],
      message:
        "The wrap desk is not connected yet. Native BTC deposits are disabled until the issuer endpoint is configured.",
    };
  }
  try {
    const res = await issuerFetch<{
      assets?: {
        asset?: string;
        symbol?: string;
        wrappedSymbol?: string;
        live?: boolean;
        reserve?: number;
        reserves?: number;
        supply?: number | null;
        collateralization?: number | null;
      }[];
    }>("/api/public/v1/wrap/assets");
    const reserves = (res.assets ?? []).map((a) => ({
      asset: a.asset ?? a.symbol ?? "?",
      reserve: a.reserve ?? a.reserves ?? 0,
      supply: a.supply ?? 0,
      collateralization: a.collateralization ?? 0,
    }));
    const anyLive = (res.assets ?? []).some((a) => a.live);
    return {
      configured: true,
      online: true,
      reserves,
      message: anyLive
        ? null
        : "Connected to the issuer. Desks go live once the issuer enables each asset.",
    };
  } catch (err) {
    return {
      configured: true,
      online: false,
      reserves: [],
      message: err instanceof Error ? err.message : "Issuer unreachable.",
    };
  }
}
