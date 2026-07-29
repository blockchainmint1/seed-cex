/**
 * EVM chain reads (Ethereum, Base, BNB Chain).
 *
 * Public JSON-RPC only, server-side, read-only. No keys are ever used here —
 * this file answers "what is in this address?", nothing more.
 */
import { getChain, type ChainId } from "@/lib/chains";

const RPC: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
};

async function rpc<T>(chain: ChainId, method: string, params: unknown[]): Promise<T | null> {
  const url = RPC[chain];
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
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
