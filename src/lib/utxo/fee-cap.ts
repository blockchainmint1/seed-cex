/**
 * Hard ceiling on the network fee of any TXC / ISK / LTC send Seeds signs. Pure: no I/O.
 *
 * The values are Bobby's (Nov 21, 2026; TXC/ISK raised from 0.0001 to 0.01 on the auditor's advice so
 * pockets with many small coins can still send). The builder refuses, before signing, any send
 * whose fee would be higher, so a wrong coin value or a wild fee-rate reading can never
 * hand a member's coins to miners. The node's own limit (0.10 per 1,000 bytes) stays as
 * a second net.
 */
export const MAX_SEND_FEE = { txc: 0.01, isk: 0.01, ltc: 0.002 } as const;
export type FeeCapChain = keyof typeof MAX_SEND_FEE;

const SYMBOL: Record<FeeCapChain, string> = { txc: "TXC", isk: "ISK", ltc: "LTC" };
const BY_P2PKH_VERSION: Record<number, FeeCapChain> = { 66: "txc", 45: "isk", 48: "ltc" };

export function maxFeeSats(chain: FeeCapChain): number {
  return Math.round(MAX_SEND_FEE[chain] * 1e8);
}

/** Which capped chain a legacy address version belongs to. Unknown versions throw: every chain needs a cap. */
export function feeCapChainForVersion(version: number): FeeCapChain {
  const chain = BY_P2PKH_VERSION[version];
  if (!chain) throw new Error(`No fee limit is set for address version ${version}. Nothing was sent.`);
  return chain;
}

/** Plain reason when a fee is over the limit, else null. */
export function feeCapProblem(chain: FeeCapChain, feeSats: number): string | null {
  if (!Number.isSafeInteger(feeSats) || feeSats < 0) return `The ${SYMBOL[chain]} network fee couldn't be worked out. Nothing was sent.`;
  if (feeSats <= maxFeeSats(chain)) return null;
  return `This ${SYMBOL[chain]} send would cost ${(feeSats / 1e8).toFixed(8)} ${SYMBOL[chain]} in network fees, above Seeds' limit of ${MAX_SEND_FEE[chain]} ${SYMBOL[chain]}. Nothing was sent. This usually means the pocket holds many small coins.`;
}

/**
 * Network fee for a TSD (Omni) carrier send: legacy inputs plus the payload, reference
 * and change outputs. The node builds the change from the fee we hand it.
 */
export function omniCarrierFeeSats(inputs: number, feeRate: number): number {
  const vbytes = inputs * 148 + 110;
  return vbytes * Math.max(1, Math.round(feeRate));
}
