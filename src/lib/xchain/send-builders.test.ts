import { describe, expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { buildAndSignBtcTransfer, btcAddressFromPubkey } from "@/lib/btc/tx.server";
import { buildAndSignTransfer, p2pkhScript } from "@/lib/txc/tx.server";
import { addressFor } from "@/lib/pockets/encode";
import { hash160 } from "@/lib/pockets/encode";

const priv = new Uint8Array(32).fill(7);
const pub = secp256k1.getPublicKey(priv, true);
const memo = "=:ETH.ETH:0x1111111111111111111111111111111111111111:12345/1/0";
const memoHex = bytesToHex(new TextEncoder().encode(memo));
const opReturn = `0000000000000000${(memo.length + 2).toString(16).padStart(2, "0")}6a${memo.length.toString(16).padStart(2, "0")}${memoHex}`;

describe("swap memo outputs", () => {
  test("Bitcoin: vault, change, then a zero-value OP_RETURN with the exact memo", () => {
    const from = btcAddressFromPubkey(pub);
    const tx = buildAndSignBtcTransfer({
      privateKeyHex: bytesToHex(priv), fromAddress: from, toAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      amount: 0.001, utxos: [{ txid: "aa".repeat(32), vout: 0, amount: 0.01 }], feeRate: 5, memo,
    });
    expect(tx.hex).toContain(opReturn);
    expect(tx.hex.indexOf(opReturn)).toBeGreaterThan(tx.hex.indexOf("751e76e8199196d454941c45d1b3a323f1433bd6"));
    expect(tx.changeSats).toBeGreaterThan(0);
  });
  test("Bitcoin: memo over 80 bytes is refused before signing", () => {
    expect(() => buildAndSignBtcTransfer({
      privateKeyHex: bytesToHex(priv), fromAddress: btcAddressFromPubkey(pub), toAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      amount: 0.001, utxos: [{ txid: "aa".repeat(32), vout: 0, amount: 0.01 }], feeRate: 5, memo: "x".repeat(81),
    })).toThrow(/80/);
  });
  test("Litecoin: pays a bech32 vault script and carries the memo", () => {
    const from = addressFor("LTC", pub);
    const vaultScript = Uint8Array.from([0x00, 0x14, ...new Uint8Array(20).fill(9)]);
    const tx = buildAndSignTransfer({
      privateKeyHex: bytesToHex(priv), fromAddress: from, toAddress: "ltc1-vault", toScript: vaultScript,
      amount: 0.5, utxos: [{ txid: "bb".repeat(32), vout: 1, amount: 1, scriptPubKey: bytesToHex(p2pkhScript(hash160(pub))) }],
      feeRate: 10, p2pkhVersion: 48, symbol: "LTC", memo,
    });
    expect(tx.hex).toContain(`16${bytesToHex(vaultScript)}`);
    expect(tx.hex).toContain(opReturn);
  });
});
