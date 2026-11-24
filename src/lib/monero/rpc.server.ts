/**
 * Seeds' own Monero server: monero-wallet-rpc behind an HTTPS proxy that requires
 * `Authorization: Bearer MONERO_WALLET_RPC_TOKEN`. Never log the URL or token.
 * monero-wallet-rpc holds one open wallet at a time, so every caller takes the
 * database lease (monero_take_lease) first and always closes the wallet after.
 */
import { moneroConfigured } from "./rules";

export function moneroServerReady(): boolean {
  return moneroConfigured({ url: process.env["MONERO_WALLET_RPC_URL"], token: process.env["MONERO_WALLET_RPC_TOKEN"] });
}

export class MoneroRpcError extends Error {
  constructor(message: string, readonly code: number | null) { super(message); }
}

export async function walletRpc<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 25_000): Promise<T> {
  const url = process.env["MONERO_WALLET_RPC_URL"];
  const token = process.env["MONERO_WALLET_RPC_TOKEN"];
  if (!moneroServerReady() || !url || !token) throw new MoneroRpcError("Seeds' Monero server isn't connected yet.", null);
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

/** Password for a wallet file on the server, derived from the access token (never stored). */
export async function walletPassword(name: string): Promise<string> {
  const token = process.env["MONERO_WALLET_RPC_TOKEN"] ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`xmr-wallet:${name}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
