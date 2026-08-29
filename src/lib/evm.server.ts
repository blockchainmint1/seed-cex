/**
 * EVM chain reads (Ethereum, Base, BNB Chain).
 *
 * Public JSON-RPC only, server-side, read-only. No keys are ever used here —
 * this file answers "what is in this address?", nothing more.
 */
import { getChain, type ChainId } from "@/lib/chains";

const PUBLIC_RPC: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
};

type Endpoint = { url: string; headers: Record<string, string> };

/**
 * Endpoint for one EVM chain. ZeroChill runs on our own authenticated node, so
 * its credentials are read from the environment inside the call.
 */
function endpoint(chain: ChainId): Endpoint | null {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (chain === "zcu") {
    const url = process.env["ZCU_RPC_URL"];
    if (!url) return null;
    const user = process.env["ZCU_RPC_USER"];
    const pass = process.env["ZCU_RPC_PASS"];
    if (user && pass) {
      headers["authorization"] = `Basic ${btoa(`${user}:${pass}`)}`;
    }
    return { url, headers };
  }
  const url = PUBLIC_RPC[chain];
  return url ? { url, headers } : null;
}

/** True when we have a usable endpoint for the chain. */
export function evmChainConfigured(chain: ChainId): boolean {
  return endpoint(chain) !== null;
}

async function rpc<T>(chain: ChainId, method: string, params: unknown[]): Promise<T | null> {
  const ep = endpoint(chain);
  if (!ep) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      signal: controller.signal,
      headers: ep.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) {
      console.error(`[evm:${chain}] ${method} failed [${res.status}]`);
      return null;
    }
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) {
      console.error(`[evm:${chain}] ${method} error: ${json.error.message}`);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.error(`[evm:${chain}] ${method} threw`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}


function fromWei(hex: string | null, decimals: number): number {
  if (!hex || hex === "0x") return 0;
  const raw = BigInt(hex);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  return Number(whole) + Number(frac) / Number(base);
}

export type AssetBalance = {
  chain: ChainId;
  chainName: string;
  symbol: string;
  balance: number;
  online: boolean;
};

/** Native coin + every listed token for one address on one chain. */
export async function fetchEvmBalances(
  chainId: ChainId,
  address: string,
): Promise<AssetBalance[]> {
  const chain = getChain(chainId);
  const out = await Promise.all(
    chain.assets.map(async (asset) => {
      let hex: string | null;
      if (asset.contract === null) {
        hex = await rpc<string>(chainId, "eth_getBalance", [address, "latest"]);
      } else {
        // balanceOf(address) selector 0x70a08231, address left-padded to 32 bytes
        const data = `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
        hex = await rpc<string>(chainId, "eth_call", [
          { to: asset.contract, data },
          "latest",
        ]);
      }
      return {
        chain: chainId,
        chainName: chain.name,
        symbol: asset.symbol,
        balance: fromWei(hex, asset.decimals),
        online: hex !== null,
      };
    }),
  );
  return out;
}

export type EvmChainStatus = { chain: ChainId; name: string; blockNumber: number | null };

export async function fetchEvmStatus(chainId: ChainId): Promise<EvmChainStatus> {
  const hex = await rpc<string>(chainId, "eth_blockNumber", []);
  return {
    chain: chainId,
    name: getChain(chainId).name,
    blockNumber: hex ? Number(BigInt(hex)) : null,
  };
}

/* ------------------------------ write helpers ----------------------------- */

/** Escape hatch for settlement: raw JSON-RPC against one chain. Server-only. */
export async function evmRpc<T>(chain: ChainId, method: string, params: unknown[]) {
  return rpc<T>(chain, method, params);
}

export async function fetchNonce(chain: ChainId, address: string): Promise<number | null> {
  const hex = await rpc<string>(chain, "eth_getTransactionCount", [address, "pending"]);
  return hex ? Number(BigInt(hex)) : null;
}

export type EvmFees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

/**
 * EIP-1559 fee suggestion: base fee of the latest block, doubled for headroom,
 * plus a priority tip. Falls back to eth_gasPrice on chains without 1559 data.
 */
export async function suggestFees(chain: ChainId): Promise<EvmFees | null> {
  const block = await rpc<{ baseFeePerGas?: string }>(chain, "eth_getBlockByNumber", [
    "latest",
    false,
  ]);
  const tipHex = await rpc<string>(chain, "eth_maxPriorityFeePerGas", []);
  const tip = tipHex ? BigInt(tipHex) : 1_500_000_000n;

  if (block?.baseFeePerGas) {
    const base = BigInt(block.baseFeePerGas);
    return { maxFeePerGas: base * 2n + tip, maxPriorityFeePerGas: tip };
  }

  const gasPrice = await rpc<string>(chain, "eth_gasPrice", []);
  if (!gasPrice) return null;
  const price = BigInt(gasPrice);
  return { maxFeePerGas: price, maxPriorityFeePerGas: price };
}

export async function estimateGas(
  chain: ChainId,
  tx: { from: string; to: string; data: string; value?: string },
): Promise<bigint | null> {
  const hex = await rpc<string>(chain, "eth_estimateGas", [{ ...tx, value: tx.value ?? "0x0" }]);
  return hex ? BigInt(hex) : null;
}

export async function sendRawTransaction(chain: ChainId, raw: string): Promise<string> {
  const ep = endpoint(chain);
  if (!ep) throw new Error(`No RPC endpoint for ${chain}`);
  const res = await fetch(ep.url, {
    method: "POST",
    headers: ep.headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [raw],
    }),
  });

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`Broadcast rejected: ${json.error.message}`);
  if (!json.result) throw new Error("Broadcast returned no transaction hash");
  return json.result;
}

export type EvmTxStatus = { confirmations: number | null; success: boolean | null };

export async function fetchEvmTxStatus(chain: ChainId, hash: string): Promise<EvmTxStatus> {
  const receipt = await rpc<{ blockNumber: string; status: string } | null>(
    chain,
    "eth_getTransactionReceipt",
    [hash],
  );
  if (!receipt) return { confirmations: 0, success: null };
  const head = await rpc<string>(chain, "eth_blockNumber", []);
  if (!head) return { confirmations: null, success: receipt.status === "0x1" };
  const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1;
  return { confirmations, success: receipt.status === "0x1" };
}

/** Token balance in whole units for one asset on one chain. */
export async function fetchTokenBalance(
  chain: ChainId,
  contract: string | null,
  address: string,
  decimals: number,
): Promise<number | null> {
  let hex: string | null;
  if (contract === null) {
    hex = await rpc<string>(chain, "eth_getBalance", [address, "latest"]);
  } else {
    const data = `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
    hex = await rpc<string>(chain, "eth_call", [{ to: contract, data }, "latest"]);
  }
  return hex === null ? null : fromWei(hex, decimals);
}
