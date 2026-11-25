/**
 * Audit LN2: only one send at a time from an Ethereum-style pocket, across every swap engine.
 * Held from reading the pocket's next transaction number (nonce) until the signed transaction is
 * broadcast, so two engines can never sign with the same number. Lease in evm_sign_locks; it
 * expires on its own if a worker dies. Busy → EvmSignBusy is thrown before anything is signed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TTL_S = 90;
const WAIT_MS = 20_000;
export const EVM_SIGN_BUSY = "Another send from your pocket is going out right now. Nothing was sent yet; retrying.";
export class EvmSignBusy extends Error {
  constructor() { super(EVM_SIGN_BUSY); }
}

export const evmSignKey = (chain: string, address: string) => `${chain}:${address.toLowerCase()}`;

export async function withEvmSignLock<T>(chain: string, address: string, fn: () => Promise<T>): Promise<T> {
  const key = evmSignKey(chain, address);
  const token = crypto.randomUUID();
  const until = Date.now() + WAIT_MS;
  for (;;) {
    const { data, error } = await supabaseAdmin.rpc("claim_evm_sign_lock", { _key: key, _token: token, _ttl_seconds: TTL_S });
    if (error) throw new EvmSignBusy();
    if (data === true) break;
    if (Date.now() > until) throw new EvmSignBusy();
    await new Promise((r) => setTimeout(r, 400));
  }
  try {
    return await fn();
  } finally {
    await supabaseAdmin.rpc("release_evm_sign_lock", { _key: key, _token: token }).then(() => undefined, () => undefined);
  }
}
