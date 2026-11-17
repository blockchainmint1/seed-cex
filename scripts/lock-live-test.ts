/**
 * Operator-only live test of the locked trading balance on TEXITcoin mainnet (a few cents).
 * Not part of the app bundle. Run from the project root:
 *   bun scripts/lock-live-test.ts address | status | deposit p2sh|p2wsh <tsd> | cosign <from> <to|fund> <tsd> | refund <wrapper> <tsd> | tx <txid>
 * Keys are derived from SEEDS_LOCK_MASTER with test-only labels and never printed.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base58check } from "@scure/base";
import { rpc } from "@/lib/rpc.server";
import { signRawTxWithKey } from "@/lib/txc/tx.server";
import { deriveSeedsLockKey } from "@/lib/lock/script";
import { addSeedsHalf, broadcastTogether, buildLockSpend, buildRefund, describeLock, lockCoins, memberSigsValid, reserveForSigning } from "@/lib/lock/lock.server";
import { signLock } from "@/lib/lock/script";

const CSV = 20; // test delay: ~1 hour
const PID = 39;
const master = new TextEncoder().encode(process.env.SEEDS_LOCK_MASTER ?? "");
const member = deriveSeedsLockKey(master, "operator-live-test-member", "TXC");
const seeds = deriveSeedsLockKey(master, "operator-live-test", "TXC");
const fundAddr = base58check(sha256).encode(Uint8Array.of(66, ...ripemd160(sha256(member.publicKey))));
const locks = {
  p2sh: describeLock("TXC", "p2sh", seeds.publicKey, member.publicKey, CSV),
  p2wsh: describeLock("TXC", "p2wsh", seeds.publicKey, member.publicKey, CSV),
};
type W = keyof typeof locks;
const TEST_USER = "00000000-0000-0000-0000-000000000000";

async function bal(addr: string) {
  const coins = await lockCoins("TXC", addr);
  const tsd = await rpc<{ balance: string }>("txc", "omni_getbalance", [addr, PID]);
  return { txc: coins.reduce((s, c) => s + c.amount, 0).toFixed(8), coins: coins.map((c) => `${c.amount}@${c.confirmations}conf`), tsd: tsd.balance };
}

async function lockRow(w: W) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const l = locks[w];
  const { data: found } = await supabaseAdmin.from("trade_locks").select("id").eq("address", l.address).maybeSingle();
  if (found) return found.id;
  const { data, error } = await supabaseAdmin.from("trade_locks").insert({
    user_id: TEST_USER, chain: "TXC", wrapper: w, generation: w === "p2sh" ? 9000 : 9001, pocket_account: 0,
    member_pub: bytesToHex(member.publicKey), seeds_pub: bytesToHex(seeds.publicKey), csv_blocks: CSV,
    witness_script: bytesToHex(l.ws), address: l.address, custody_mode: "instant", status: "open",
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

const [cmd, a, b, c] = process.argv.slice(2);
if (master.length < 32 && cmd !== "kms-check") throw new Error("SEEDS_LOCK_MASTER missing");
if (cmd === "address") {
  console.log({ fund: fundAddr, p2shLock: locks.p2sh.address, p2wshLock: locks.p2wsh.address, csvBlocks: CSV });
} else if (cmd === "status") {
  console.log({ tip: await rpc("txc", "getblockcount"), fund: { addr: fundAddr, ...(await bal(fundAddr)) }, p2sh: { addr: locks.p2sh.address, ...(await bal(locks.p2sh.address)) }, p2wsh: { addr: locks.p2wsh.address, ...(await bal(locks.p2wsh.address)) } });
} else if (cmd === "deposit") {
  const l = locks[a as W]; const amount = Number(b).toFixed(8);
  const coins = (await lockCoins("TXC", fundAddr)).filter((u) => u.confirmations >= 1);
  const prev = coins.map((u) => ({ txid: u.txid, vout: u.vout, scriptPubKey: u.scriptPubKey, value: u.amount }));
  let raw = await rpc<string>("txc", "createrawtransaction", [coins.map((u) => ({ txid: u.txid, vout: u.vout })), []]);
  raw = await rpc<string>("txc", "omni_createrawtx_opreturn", [raw, await rpc<string>("txc", "omni_createpayload_simplesend", [PID, amount])]);
  raw = await rpc<string>("txc", "omni_createrawtx_reference", [raw, l.address, "0.05"]);
  raw = await rpc<string>("txc", "omni_createrawtx_change", [raw, prev, fundAddr, 0.001]);
  const signed = signRawTxWithKey(raw, bytesToHex(member.privateKey), Object.fromEntries(coins.map((u) => [`${u.txid}:${u.vout}`, u.scriptPubKey])));
  console.log("deposit", await broadcastTogether("TXC", [signed.hex]));
} else if (cmd === "cosign") {
  const from = locks[a as W]; const to = b === "fund" ? { address: fundAddr } : locks[b as W]; const amount = Number(c).toFixed(8);
  const built = await buildLockSpend(from, { purpose: "trade", toAddress: to.address, propertyId: PID, amount });
  console.log("omni decode before signing:", built.decoded);
  const memberSigs = built.tx.inputs.map((inp, i) => signLock({ tx: built.tx, index: i, ws: from.ws, value: built.coins.find((x) => x.txid === inp.txid && x.vout === inp.vout)!.value, wrapper: from.wrapper }, member.privateKey));
  if (!memberSigsValid(from, built, memberSigs)) throw new Error("member signatures did not verify");
  const lockId = await lockRow(a as W);
  const r = await reserveForSigning([{ lockId, built, purpose: "trade", toAddress: to.address, propertyId: PID, amount }]);
  if (!r.ok) throw new Error("ledger refused: a coin was already co-signed");
  const hex = addSeedsHalf(from, built, memberSigs, seeds.privateKey);
  const [txid] = await broadcastTogether("TXC", [hex]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("lock_spends").update({ status: "broadcast", signed_txid: txid, updated_at: new Date().toISOString() }).in("id", r.spendIds);
  console.log("cosigned", txid);
  // Prove the ledger: the same coins must be refused a second time.
  const again = await reserveForSigning([{ lockId, built, purpose: "trade", toAddress: to.address, propertyId: PID, amount }]);
  console.log("second co-sign of the same coins allowed?", again.ok);
} else if (cmd === "refund") {
  const l = locks[a as W];
  const hex = await buildRefund(l, { toAddress: fundAddr, propertyId: PID, amount: Number(b).toFixed(8) }, member.privateKey);
  console.log("refund", await broadcastTogether("TXC", [hex]));
} else if (cmd === "kms-check") {
  // Proves the KMS key works end to end: public key, a signature on a throwaway digest, verify.
  const { kmsSeedsSigner } = await import("@/lib/lock/kms.server");
  for (const ch of ["TXC", "ISK"] as const) {
    try {
      const s = await kmsSeedsSigner(ch);
      const sig = await s.sign(sha256(new TextEncoder().encode(`seeds kms check ${Date.now()}`)));
      console.log(ch, { publicKey: bytesToHex(s.publicKey), signatureBytes: sig.length, ok: true });
    } catch (e) { console.log(ch, { ok: false, error: (e as Error).message }); }
  }
} else if (cmd === "tx") {
  const [w] = await rpc<string[]>("txc", "listwallets");
  console.log(await rpc("txc", "omni_gettransaction", [a], 12_000, `/wallet/${encodeURIComponent(w ?? "")}`).catch((e) => String(e)));
} else {
  console.log("usage: address | status | deposit <p2sh|p2wsh> <tsd> | cosign <from> <to|fund> <tsd> | refund <wrapper> <tsd> | tx <txid>");
}
