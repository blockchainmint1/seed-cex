/**
 * Live numbers for the setup guide's network-fee step: ETH in the member's own
 * pocket on Ethereum and Base, today's swap fee, and whether "convert TSD" can run.
 * Read-only; nothing is signed or sent.
 */
import { baseAction, ethereumAction, FEE_PREP, feeLevel, swapsCovered } from "./fee-prep";

export async function feePrepFor(userId: string, isAdmin: boolean) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const { evmRpc, suggestFees } = await import("@/lib/evm.server");
  const { ethPriceUsd, gasWalletConfigured } = await import("@/lib/xchain/gas.server");
  const { GAS_SWAP_LEG, gasNeedWei, routeBlocker } = await import("@/lib/xchain/tsd-route");
  const { swapCoin } = await import("@/lib/xchain/assets");

  const link = await loadLink(userId);
  const address = link?.addresses.EVM ?? null;
  const balance = async (chain: "ethereum" | "base") => {
    if (!address) return null;
    const hex = await evmRpc<string>(chain, "eth_getBalance", [address, "latest"]).catch(() => null);
    return hex ? BigInt(hex) : null;
  };
  const [ethWei, baseWei, price, fees, covered] = await Promise.all([
    balance("ethereum"),
    balance("base"),
    ethPriceUsd().catch(() => null),
    suggestFees("ethereum").catch(() => null),
    gasWalletConfigured().catch(() => false),
  ]);

  const needWei = fees ? gasNeedWei(GAS_SWAP_LEG, fees.maxFeePerGas) : null;
  const perSwapEth = needWei != null ? Number(needWei) / 1e18 : null;
  const linkLike = link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null;
  const convertBlocker = link
    ? routeBlocker({ direction: "buy", coin: swapCoin("ETH")!, link: linkLike, isAdmin, amountUsd: FEE_PREP.convertTsd, tsdAmount: FEE_PREP.convertTsd })
    : "Link your HME Wallet first.";
  const firstFeePaid = covered || (needWei != null && ethWei != null && ethWei >= needWei);

  const toEth = (w: bigint | null) => (w == null ? null : Number(w) / 1e18);
  const eth = toEth(ethWei);
  const base = toEth(baseWei);
  const ethLevel = feeLevel(eth, price, FEE_PREP.ethereum.lowUsd);
  const baseLevel = feeLevel(base, price, FEE_PREP.base.lowUsd);

  return {
    linked: Boolean(link),
    ethPriceUsd: price,
    perSwapEth,
    perSwapUsd: perSwapEth != null && price != null ? perSwapEth * price : null,
    seedsPaysFee: covered,
    convertBlocker,
    ethereum: { haveEth: eth, level: ethLevel, swaps: swapsCovered(eth, perSwapEth), action: ethereumAction({ level: ethLevel, convertBlocker, firstFeePaid }) },
    base: { haveEth: base, level: baseLevel, action: baseAction(baseLevel) },
  };
}
