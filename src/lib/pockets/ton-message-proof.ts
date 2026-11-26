import { Address, beginCell, Cell, loadTransaction, storeMessage } from "@ton/core";

export type TonMessageProof = {
  hash?: string;
  raw?: string;
  account: { address: string };
  in_msg?: { hash?: string };
};

/** TON validators may re-encode an external message with its body in a reference.
 * Match the signed message, not just that representation's hash. Never trust the
 * lookup URL alone: verify the raw transaction hash and wallet before rebuilding. */
export function tonMessageMatches(root: TonMessageProof, messageId: string): boolean {
  if (root.in_msg?.hash === messageId) return true;
  if (!root.raw || !root.hash || !/^[a-f0-9]{64}$/i.test(messageId) || !/^(?:[a-f0-9]{2})+$/i.test(root.raw)) return false;
  try {
    const cells = Cell.fromBoc(Buffer.from(root.raw, "hex"));
    const cell = cells.length === 1 ? cells[0] : undefined;
    if (!cell || cell.hash().toString("hex") !== root.hash) return false;
    const tx = loadTransaction(cell.beginParse());
    const msg = tx.inMessage;
    const account = Address.parse(root.account.address);
    if (!msg || msg.info.type !== "external-in" || !msg.info.dest.equals(account) || tx.address !== BigInt(`0x${account.hash.toString("hex")}`)) return false;
    const hashes = [false, true].map((forceRef) => beginCell().store(storeMessage(msg, { forceRef })).endCell().hash().toString("hex"));
    return hashes.includes(messageId) && typeof root.in_msg?.hash === "string" && hashes.includes(root.in_msg.hash);
  } catch { return false; }
}