/**
 * Seeds' Monero servers, each behind an HTTPS proxy that requires a Bearer token. Never log URLs or tokens.
 * - "watch": monerod + monero-wallet-rpc holding VIEW-ONLY wallets (MONERO_WALLET_RPC_URL / _TOKEN).
 * - "signer": a separate, offline monero-wallet-rpc whose wallet directory is RAM-only (tmpfs)
 *   (MONERO_SIGNER_RPC_URL / _TOKEN). Only it ever sees a spend key, for one send at a time.
 * Each wallet-rpc holds one open wallet at a time, so callers take the database lease first
 * (monero_take_lease) and always close the wallet after.
 */
import { moneroConfigured } from "./rules";

export type MoneroServer = "watch" | "signer";
const ENV: Record<MoneroServer, [string, string]> = {
  watch: ["MONERO_WALLET_RPC_URL", "MONERO_WALLET_RPC_TOKEN"],
  signer: ["MONERO_SIGNER_RPC_URL", "MONERO_SIGNER_RPC_TOKEN"],
};
const cfg = (s: MoneroServer) => ({ url: process.env[ENV[s][0]], token: process.env[ENV[s][1]] });

/** Balances need the watch server; sends also need the separate signer (with a different token). */
export function moneroServerReady(): boolean {
  return moneroConfigured(cfg("watch"));
}
export function moneroSignerReady(): boolean {
  const w = cfg("watch");
  const s = cfg("signer");
  return moneroConfigured(w) && moneroConfigured(s) && s.token !== w.token && s.url !== w.url;
}

export class MoneroRpcError extends Error {
  constructor(message: string, readonly code: number | null) { super(message); }
}

export async function moneroRpc<T>(server: MoneroServer, method: string, params: Record<string, unknown> = {}, timeoutMs = 25_000): Promise<T> {
  const { url, token } = cfg(server);
  if (!moneroConfigured({ url, token }) || !url || !token) throw new MoneroRpcError("Seeds' Monero server isn't connected yet.", null);
  const res = await fetch(`${url.replace(/\/$/, "")}/json_rpc`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: "0", method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new MoneroRpcError(`Monero server answered ${res.status}`, null);
  const j = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (j.error) throw new MoneroRpcError(j.error.message, j.error.code);
  return j.result as T;
}

export function walletRpc<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 25_000): Promise<T> {
  return moneroRpc<T>("watch", method, params, timeoutMs);
}

/** Password for a VIEW-ONLY watch wallet file, from a dedicated secret (not the RPC token). */
export async function walletPassword(name: string): Promise<string> {
  const secret = process.env["MONERO_WALLET_FILE_SECRET"] ?? "";
  if (secret.length < 24) throw new MoneroRpcError("Seeds' Monero server isn't fully set up yet.", null);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`xmr-wallet:${name}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A one-time random password for a throwaway signer wallet: never stored, so the file can never be reopened. */
export function throwawayPassword(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
