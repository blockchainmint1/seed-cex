/** Official XDR builder; signature made with Seeds' pinned noble library, not SDK key storage. */
import { Account, Asset, Networks, Operation, TransactionBuilder } from "@stellar/stellar-base";
import { ed25519 } from "@noble/curves/ed25519.js";
import { xlmAddress, xlmDecodeAddress } from "./ed25519-chains";
import { unitsToText } from "@/lib/withdraw/rules";

export function buildStellarTransfer(input: {
  privateKey: Uint8Array; from: string; to: string; units: bigint; sequence: string;
  fee: bigint; createAccount: boolean; expiresAt: number;
}) {
  xlmDecodeAddress(input.to);
  if (input.from === input.to || xlmAddress(ed25519.getPublicKey(input.privateKey)) !== input.from) throw new Error("Stellar key or destination mismatch");
  if (input.units <= 0n || input.units > 0x7fffffffffffffffn || input.fee <= 0n || !/^\d+$/.test(input.sequence) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) throw new Error("Invalid Stellar transfer");
  const amount = unitsToText(input.units, 7);
  const operation = input.createAccount
    ? Operation.createAccount({ destination: input.to, startingBalance: amount })
    : Operation.payment({ destination: input.to, asset: Asset.native(), amount });
  const tx = new TransactionBuilder(new Account(input.from, input.sequence), {
    fee: input.fee.toString(), networkPassphrase: Networks.PUBLIC,
    timebounds: { minTime: 0, maxTime: input.expiresAt },
  }).addOperation(operation).build();
  const signature = ed25519.sign(tx.hash(), input.privateKey);
  if (!ed25519.verify(signature, tx.hash(), xlmDecodeAddress(input.from))) throw new Error("Stellar signature failed verification");
  tx.addSignature(input.from, Buffer.from(signature).toString("base64"));
  return { xdr: tx.toXDR(), txid: tx.hash().toString("hex") };
}