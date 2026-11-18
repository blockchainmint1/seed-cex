/**
 * Minimal ABI encoding for the pool calls Seeds makes. Pure; no I/O; no libraries.
 * Selectors were computed with keccak-256 and checked against each router's bytecode.
 */

export const SEL = {
  getAmountsOut: "d06ca61f",
  quoteExactInputSingle: "c6a5026a",
  quoteExactInput: "cdca1753",
  aggregate3: "82ad56cb",
  decimals: "313ce567",
  symbol: "95d89b41",
  name: "06fdde03",
  balanceOf: "70a08231",
  allowance: "dd62ed3e",
  approve: "095ea7b3",
  // v2 routers (Uniswap v2, PancakeSwap v2, PulseX v1/v2 — all use the "ETH" names)
  v2TokensForTokens: "5c11d795",
  v2EthForTokens: "b6f9de95",
  v2TokensForEth: "791ac947",
  // SwapRouter02 / PancakeSwap SmartRouter
  v3ExactInputSingle: "04e45aaf",
  v3ExactInput: "b858183f",
  v3Multicall: "5ae401dc",
  v3UnwrapWeth: "49404b7c",
} as const;

const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);

export function word(n: bigint | number): string {
  const v = BigInt(n);
  if (v < 0n) throw new Error("negative");
  const h = v.toString(16);
  if (h.length > 64) throw new Error("overflow");
  return h.padStart(64, "0");
}

export function addrWord(a: string): string {
  const h = strip(a).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(h)) throw new Error(`bad address ${a}`);
  return h.padStart(64, "0");
}

/** Encode `bytes` tail (length + padded data). */
function bytesTail(hex: string): string {
  const h = strip(hex);
  const padded = h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  return word(h.length / 2) + padded;
}

function addrArrayTail(addrs: string[]): string {
  return word(addrs.length) + addrs.map(addrWord).join("");
}

/* ---------------------------------- reads ---------------------------------- */

export function encGetAmountsOut(amountIn: bigint, path: string[]): string {
  return `0x${SEL.getAmountsOut}${word(amountIn)}${word(64)}${addrArrayTail(path)}`;
}

/** v3 packed path: token (20) + fee (3) + token (20) … */
export function v3Path(tokens: string[], fees: number[]): string {
  if (tokens.length !== fees.length + 1) throw new Error("path/fee mismatch");
  let out = "";
  tokens.forEach((t, i) => {
    out += strip(t).toLowerCase();
    if (i < fees.length) out += fees[i].toString(16).padStart(6, "0");
  });
  return `0x${out}`;
}

export function encQuoteExactInputSingle(tokenIn: string, tokenOut: string, amountIn: bigint, fee: number): string {
  return `0x${SEL.quoteExactInputSingle}${addrWord(tokenIn)}${addrWord(tokenOut)}${word(amountIn)}${word(fee)}${word(0)}`;
}

export function encQuoteExactInput(path: string, amountIn: bigint): string {
  return `0x${SEL.quoteExactInput}${word(64)}${word(amountIn)}${bytesTail(path)}`;
}

export const encDecimals = () => `0x${SEL.decimals}`;
export const encSymbol = () => `0x${SEL.symbol}`;
export const encName = () => `0x${SEL.name}`;
export const encBalanceOf = (owner: string) => `0x${SEL.balanceOf}${addrWord(owner)}`;
export const encAllowance = (owner: string, spender: string) => `0x${SEL.allowance}${addrWord(owner)}${addrWord(spender)}`;

/** Multicall3.aggregate3((address target, bool allowFailure, bytes callData)[]) */
export function encAggregate3(calls: Array<{ target: string; data: string }>): string {
  const n = calls.length;
  const heads: string[] = [];
  const tails: string[] = [];
  let offset = n * 32;
  for (const c of calls) {
    heads.push(word(offset));
    const t = addrWord(c.target) + word(1) + word(96) + bytesTail(c.data);
    tails.push(t);
    offset += t.length / 2;
  }
  return `0x${SEL.aggregate3}${word(32)}${word(n)}${heads.join("")}${tails.join("")}`;
}

/* --------------------------------- decoding --------------------------------- */

function wordAt(h: string, i: number): string {
  return h.slice(i * 64, i * 64 + 64);
}
const big = (w: string) => (w ? BigInt(`0x${w}`) : 0n);

export function decUint(hex: string, index = 0): bigint {
  const h = strip(hex);
  if (h.length < (index + 1) * 64) throw new Error("short return data");
  return big(wordAt(h, index));
}

/** uint256[] return (getAmountsOut). */
export function decUintArray(hex: string): bigint[] {
  const h = strip(hex);
  const off = Number(big(wordAt(h, 0))) / 32;
  const len = Number(big(wordAt(h, off)));
  if (len > 16) throw new Error("bad array");
  return Array.from({ length: len }, (_, i) => big(wordAt(h, off + 1 + i)));
}

/** string return, tolerating old bytes32 tokens (e.g. MKR). */
export function decString(hex: string): string {
  const h = strip(hex);
  if (h.length === 64) {
    const bytes = h.match(/../g)!.map((b) => parseInt(b, 16)).filter((b) => b !== 0);
    return clean(String.fromCharCode(...bytes));
  }
  if (h.length < 128) return "";
  const off = Number(big(wordAt(h, 0))) * 2;
  const len = Number(big(h.slice(off, off + 64)));
  if (len > 256) return "";
  const data = h.slice(off + 64, off + 64 + len * 2);
  const bytes = (data.match(/../g) ?? []).map((b) => parseInt(b, 16));
  try {
    return clean(new TextDecoder().decode(new Uint8Array(bytes)));
  } catch {
    return "";
  }
}
const clean = (s: string) => s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 64);

/** Multicall3 aggregate3 result: (bool success, bytes returnData)[] */
export function decAggregate3(hex: string): Array<{ ok: boolean; data: string }> {
  const h = strip(hex);
  const arrOff = Number(big(wordAt(h, 0))) * 2;
  const body = h.slice(arrOff);
  const n = Number(big(body.slice(0, 64)));
  if (n > 512) throw new Error("bad multicall result");
  const elems = body.slice(64);
  const out: Array<{ ok: boolean; data: string }> = [];
  for (let i = 0; i < n; i++) {
    const eOff = Number(big(elems.slice(i * 64, i * 64 + 64))) * 2;
    const e = elems.slice(eOff);
    const ok = big(e.slice(0, 64)) === 1n;
    const dOff = Number(big(e.slice(64, 128))) * 2;
    const len = Number(big(e.slice(dOff, dOff + 64)));
    out.push({ ok, data: `0x${e.slice(dOff + 64, dOff + 64 + len * 2)}` });
  }
  return out;
}

/* ---------------------------------- writes ---------------------------------- */

export function encApprove(spender: string, amount: bigint): string {
  return `0x${SEL.approve}${addrWord(spender)}${word(amount)}`;
}

/** v2 router swap, fee-on-transfer safe. Native in/out use the router's ETH variants. */
export function encV2Swap(p: {
  nativeIn: boolean;
  nativeOut: boolean;
  amountIn: bigint;
  minOut: bigint;
  path: string[];
  to: string;
  deadline: number;
}): string {
  const tail = addrArrayTail(p.path);
  if (p.nativeIn) {
    // (amountOutMin, path, to, deadline)
    return `0x${SEL.v2EthForTokens}${word(p.minOut)}${word(128)}${addrWord(p.to)}${word(p.deadline)}${tail}`;
  }
  const sel = p.nativeOut ? SEL.v2TokensForEth : SEL.v2TokensForTokens;
  // (amountIn, amountOutMin, path, to, deadline)
  return `0x${sel}${word(p.amountIn)}${word(p.minOut)}${word(160)}${addrWord(p.to)}${word(p.deadline)}${tail}`;
}

/** SwapRouter02-style exactInputSingle (no deadline in the struct). */
export function encV3ExactInputSingle(p: { tokenIn: string; tokenOut: string; fee: number; recipient: string; amountIn: bigint; minOut: bigint }): string {
  return `0x${SEL.v3ExactInputSingle}${addrWord(p.tokenIn)}${addrWord(p.tokenOut)}${word(p.fee)}${addrWord(p.recipient)}${word(p.amountIn)}${word(p.minOut)}${word(0)}`;
}

/** SwapRouter02-style exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)). */
export function encV3ExactInput(p: { path: string; recipient: string; amountIn: bigint; minOut: bigint }): string {
  return `0x${SEL.v3ExactInput}${word(32)}${word(128)}${addrWord(p.recipient)}${word(p.amountIn)}${word(p.minOut)}${bytesTail(p.path)}`;
}

/** SwapRouter02 multicall(uint256 deadline, bytes[] data) — used to swap then unwrap to the native coin. */
export function encV3Multicall(deadline: number, calls: string[]): string {
  const n = calls.length;
  const heads: string[] = [];
  const tails: string[] = [];
  let offset = n * 32;
  for (const c of calls) {
    heads.push(word(offset));
    const t = bytesTail(c);
    tails.push(t);
    offset += t.length / 2;
  }
  return `0x${SEL.v3Multicall}${word(deadline)}${word(64)}${word(n)}${heads.join("")}${tails.join("")}`;
}

export function encV3UnwrapWeth(minOut: bigint, recipient: string): string {
  return `0x${SEL.v3UnwrapWeth}${word(minOut)}${addrWord(recipient)}`;
}

/** Router02 "use the router's own balance as recipient" sentinel (ADDRESS_THIS). */
export const V3_ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
