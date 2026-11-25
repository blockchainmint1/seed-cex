import { checkedUsdtComment, isUsdtTonMaster, tonMainnetAccount } from "@/lib/pockets/ton-payment";
import { parseUnits, unitsToText } from "./rules";

export type TonPayment = { symbol: "TON" | "USDT"; network: "ton"; to: string; amount: string | null; comment: string };
export type PaymentInput = { symbol: string; network: string; to: string; amount: string; comment?: string; tag?: string };

/** Plain TEP-74 comments only, bounded to a small single-cell UTF-8 payload. */
export function paymentComment(kind: string, raw: string | undefined | null): string {
  const text = raw ?? "";
  if (!text) return "";
  if (kind !== "ton_usdt") throw new Error("Payment notes are supported only for USD₮ on TON. Nothing was sent.");
  return checkedUsdtComment(text);
}

/** Missing metadata is allowed only for old withdrawals with no payment note. */
export function approvalPaymentCommentMatches(comment: string, meta: unknown): boolean {
  const value = meta && typeof meta === "object" && "payment_comment" in meta ? meta.payment_comment : undefined;
  return value === comment || (comment === "" && value === undefined);
}

/** A TON invoice is untrusted data, never an external message body to sign. */
export function parseTonPaymentLink(raw: string): TonPayment | null {
  const text = raw.trim();
  if (!/^ton:/i.test(text)) return null;
  if (text.length > 2048 || /%(?![0-9a-f]{2})/i.test(text)) throw new Error("That TON payment link is malformed.");
  let url: URL;
  try { decodeURIComponent(text); url = new URL(text); } catch { throw new Error("That TON payment link is malformed."); }
  if (url.protocol !== "ton:" || url.hostname !== "transfer" || url.username || url.password || url.port || url.hash) {
    throw new Error("Use a ton://transfer payment link, not a wallet connection or signing request.");
  }
  const path = /^\/([^/]+)$/.exec(url.pathname);
  if (!path?.[1]) throw new Error("The TON payment link needs one destination address.");
  let to: string;
  try {
    to = decodeURIComponent(path[1]);
    tonMainnetAccount(to);
  } catch { throw new Error("The payment link needs a valid mainnet TON address on workchain 0."); }
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (seen.has(key)) throw new Error(`The payment link repeats ${key}. Nothing was filled in.`);
    seen.add(key);
    if (!["jetton", "amount", "text"].includes(key)) throw new Error(`Unsupported TON payment-link option: ${key}. Nothing was filled in.`);
  }
  const jetton = url.searchParams.get("jetton");
  if (jetton !== null && !isUsdtTonMaster(jetton)) throw new Error("This link requests a token other than Tether's USD₮ on TON.");
  const symbol = jetton === null ? "TON" : "USDT";
  const units = url.searchParams.get("amount");
  let amount: string | null = null;
  if (units !== null) {
    if (!/^\d{1,36}$/.test(units) || BigInt(units) <= 0n || BigInt(units) >= 1n << 120n) throw new Error("The payment link has an invalid amount.");
    amount = unitsToText(BigInt(units), symbol === "USDT" ? 6 : 9);
  }
  const comment = paymentComment(symbol === "USDT" ? "ton_usdt" : "ton", url.searchParams.get("text"));
  return { symbol, network: "ton", to, amount, comment };
}

/** Server-side too: never silently change the selected asset or approved amount. */
export function normalizeTonPaymentInput(input: PaymentInput): PaymentInput & { comment: string } {
  const payment = parseTonPaymentLink(input.to);
  const kind = input.network === "ton" && input.symbol === "USDT" ? "ton_usdt" : "other";
  if (!payment) return { ...input, to: input.to.trim(), comment: paymentComment(kind, input.comment) };
  if (input.symbol !== payment.symbol || input.network !== payment.network) {
    throw new Error(`This payment link is for ${payment.symbol} on TON. Select that coin and network first.`);
  }
  if (payment.amount !== null && parseUnits(input.amount, payment.symbol === "USDT" ? 6 : 9) !== parseUnits(payment.amount, payment.symbol === "USDT" ? 6 : 9)) {
    throw new Error("The amount does not match the TON payment link. Paste it again and check the amount.");
  }
  if (input.comment !== undefined && input.comment !== payment.comment) throw new Error("The payment note does not match the TON payment link.");
  return { ...input, to: payment.to, amount: payment.amount ?? input.amount, comment: payment.comment };
}