/** Explicit gas coins, offline BCS and noble signing; the SDK never holds the private seed. */
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { messageWithIntent, toSerializedSignature } from "@mysten/sui/cryptography";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { validSuiAddress, suiAddress } from "./ed25519-chains";
import { checkNativeSpend } from "./ed-send-rules";

export type SuiCoinRef = { objectId: string; version: string; digest: string; balance: string };

export async function buildSuiTransfer(input: {
  from: string; to: string; units: bigint; gasPrice: bigint; gasBudget: bigint; coins: SuiCoinRef[]; expiresEpoch: string;
}) {
  if (!validSuiAddress(input.from) || !validSuiAddress(input.to) || /^0x0+$/.test(input.to) || input.to === input.from) throw new Error("Invalid Sui destination");
  if (input.coins.length === 0 || input.coins.length > 256 || new Set(input.coins.map((c) => c.objectId)).size !== input.coins.length || input.gasPrice <= 0n) throw new Error("Invalid Sui gas coins");
  checkNativeSpend("SUI", input.units, input.coins.reduce((n, c) => n + BigInt(c.balance), 0n), input.gasBudget);
  const tx = new Transaction();
  if (!/^\d+$/.test(input.expiresEpoch) || BigInt(input.expiresEpoch) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid Sui expiry");
  tx.setExpiration({ Epoch: input.expiresEpoch });
  tx.setSender(input.from); tx.setGasOwner(input.from); tx.setGasPrice(input.gasPrice); tx.setGasBudget(input.gasBudget);
  tx.setGasPayment(input.coins.map(({ objectId, version, digest }) => ({ objectId, version, digest })));
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(input.units)]);
  if (!payment) throw new Error("Sui payment construction failed");
  tx.transferObjects([payment], tx.pure.address(input.to));
  const bytes = await tx.build(); // all references provided; no client or network resolver
  return { bytes, txid: TransactionDataBuilder.getDigestFromBytes(bytes) };
}

export function signSuiTransfer(bytes: Uint8Array, privateKey: Uint8Array, from: string) {
  const pub = ed25519.getPublicKey(privateKey);
  if (suiAddress(pub) !== from) throw new Error("Sui key mismatch");
  const hash = blake2b(messageWithIntent("TransactionData", bytes), { dkLen: 32 });
  const signature = ed25519.sign(hash, privateKey);
  if (!ed25519.verify(signature, hash, pub)) throw new Error("Sui signature failed verification");
  return toSerializedSignature({ signatureScheme: "ED25519", signature, publicKey: new Ed25519PublicKey(pub) });
}

/** Same computation floor and storage-rebate calculation as the official SDK, with its margin. */
export function suiGasBudget(used: { computationCost: string; storageCost: string; storageRebate: string }, price: bigint): bigint {
  const values = [used.computationCost, used.storageCost, used.storageRebate];
  if (values.some((v) => !/^\d+$/.test(v)) || price <= 0n) throw new Error("Invalid Sui gas estimate");
  const floor = BigInt(used.computationCost) + 1000n * price;
  const net = floor + BigInt(used.storageCost) - BigInt(used.storageRebate);
  return net > floor ? net : floor;
}