/** W5 v5R1 mainnet: one outgoing message, no sweep modes or plugins. A body is only ever one Seeds
 * built itself in ton-jetton.ts (USDT transfer or STON.fi swap); never a payload from outside. */
import { Address, beginCell, type Cell, external, internal, SendMode, storeMessage } from "@ton/core";
import { WalletContractV5R1 } from "@ton/ton";
import { ed25519 } from "@noble/curves/ed25519.js";
import { tonAddress } from "./ed25519-chains";

export function tonDestination(to: string): Address {
  const friendly = Address.parseFriendly(to);
  if (friendly.isTestOnly || friendly.address.workChain !== 0 || friendly.address.hash.every((b) => b === 0)) throw new Error("Use a mainnet TON address on workchain 0 (not a test or burn address).");
  return friendly.address;
}

export async function buildTonTransfer(input: {
  publicKey: Uint8Array; from: string; to: string; units: bigint; seqno: number;
  deploy: boolean; expiresAt: number; privateKey?: Uint8Array;
  /** Seeds-built message body (jetton transfer / swap); sent bounceable so a refusal returns the TON. */
  body?: Cell;
}) {
  const dest = input.body ? Address.parse(input.to) : tonDestination(input.to);
  if (dest.workChain !== 0) throw new Error("TON contract must be on workchain 0");
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(input.publicKey) });
  if (tonAddress(input.publicKey) !== input.from || wallet.address.equals(dest)) throw new Error("TON pocket or destination mismatch");
  if (input.privateKey && !Buffer.from(ed25519.getPublicKey(input.privateKey)).equals(Buffer.from(input.publicKey))) throw new Error("TON key mismatch");
  if (input.units <= 0n || input.units > 0xffffffffffffffffn || !Number.isSafeInteger(input.seqno) || input.seqno < 0 || input.seqno > 0xffffffff || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0 || (input.deploy && input.seqno !== 0)) throw new Error("Invalid TON transfer");
  const body = await wallet.createTransfer({
    seqno: input.seqno, timeout: input.expiresAt,
    sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
    messages: [input.body ? internal({ to: dest, value: input.units, bounce: true, body: input.body }) : internal({ to: dest, value: input.units, bounce: false })],
    signer: async (cell) => {
      if (!input.privateKey) return Buffer.alloc(64); // fee simulation only; never broadcast
      const signature = ed25519.sign(cell.hash(), input.privateKey);
      if (!ed25519.verify(signature, cell.hash(), input.publicKey)) throw new Error("TON signature failed verification");
      return Buffer.from(signature);
    },
  });
  const msg = external({ to: wallet.address, ...(input.deploy ? { init: wallet.init } : {}), body });
  const cell = beginCell().store(storeMessage(msg)).endCell();
  return { boc: cell.toBoc().toString("base64"), body: body.toBoc().toString("base64"),
    initCode: input.deploy ? wallet.init.code.toBoc().toString("base64") : "",
    initData: input.deploy ? wallet.init.data.toBoc().toString("base64") : "",
    txid: cell.hash().toString("hex") };
}