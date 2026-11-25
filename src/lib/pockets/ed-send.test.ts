import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Transaction as StellarTransaction, Networks } from "@stellar/stellar-base";
import { Cell, loadMessage } from "@ton/core";
import { loadOutListExtendedV5R1 } from "@ton/ton/dist/wallets/v5r1/WalletV5R1Actions";
import { WalletContractV5R1 } from "@ton/ton";
import { keyPairFromSeed } from "@ton/crypto";
import { internal, SendMode } from "@ton/core";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { base58 } from "@scure/base";
import { buildStellarTransfer } from "./stellar-tx";
import { buildTonTransfer, tonDestination } from "./ton-tx";
import { buildSuiTransfer, signSuiTransfer, suiGasBudget } from "./sui-tx";
import { edAddress, TON_W5_WALLET_ID } from "./ed25519-chains";
import { ED_SENDS_ENABLED, edSendBlocker, edStageAllows, checkNativeSpend, stellarUnits, stellarReserve } from "./ed-send-rules";
import { sendBlocker } from "@/lib/withdraw/rules";
import { depositState, findAsset, findNetwork } from "@/lib/account/deposit-options";
import { withdrawCoin } from "@/lib/withdraw/catalog";
import { maybeBroadcast } from "@/lib/broadcast-rules";
import { suiPaid, tonTraceStatus, type TonTrace } from "./ed-confirm-rules";

const key = new Uint8Array(32).fill(7);
const other = new Uint8Array(32).fill(8);
const pub = ed25519.getPublicKey(key);
const otherPub = ed25519.getPublicKey(other);
const from = (c: "XLM" | "TON" | "SUI") => edAddress(c, pub);
const to = (c: "XLM" | "TON" | "SUI") => edAddress(c, otherPub);

describe("one gate for deposits and withdrawals, before audit", () => {
  test("activation remains off", () => expect(ED_SENDS_ENABLED).toBe(false));
  test("review stage allows nobody, including testers", () => {
    expect(edStageAllows("review", false)).toBe(false); expect(edStageAllows("review", true)).toBe(false);
  });
  test("funded test stage allows only testers after audit", () => {
    expect(edStageAllows("testers", false)).toBe(false); expect(edStageAllows("testers", true)).toBe(true);
  });
  test("open stage releases the chain gate for all members, not their protection checks", () => {
    expect(edStageAllows("open", false)).toBe(true); expect(edStageAllows("open", true)).toBe(true);
  });
  for (const chain of ["XLM", "TON", "SUI"] as const) {
    test(`${chain} has its own withdrawal network and decimal precision`, () => {
      expect(withdrawCoin(chain, chain.toLowerCase())?.pocket).toBe(chain);
      expect(withdrawCoin(chain, chain.toLowerCase())?.decimals).toBe(chain === "XLM" ? 7 : 9);
    });
    test(`${chain} cannot deposit or send before clearance, even for an otherwise ready tester`, () => {
      const net = findNetwork(findAsset(chain), chain.toLowerCase());
      if (!net) throw new Error("Network missing");
      expect(depositState(net, true, { [chain]: from(chain) }, null).ok).toBe(false);
      expect(sendBlocker({ symbol: chain, networkLabel: chain, tester: true, frozen: false, link: { mode: "access", hasKey: true, address: from(chain) } })).toBe(edSendBlocker(chain));
      expect(edSendBlocker(chain)).not.toBeNull();
    });
  }
  test("existing BTC withdrawals aren't gated by this change", () => expect(edSendBlocker("BTC")).toBeNull());
});

describe("fees, reserves and uncertain sends", () => {
  test("Stellar balance is exact to seven decimals", () => {
    expect(stellarUnits("900719925.1234567")).toBe(9007199251234567n);
    expect(() => stellarUnits("1.00000001")).toThrow();
  });
  test("Stellar reserve includes subentries, sponsorship and selling liabilities", () => {
    expect(stellarReserve(5_000_000n, 3, 2, 1, 7_000_000n)).toBe(37_000_000n);
    expect(() => stellarReserve(5_000_000n, -1, 0, 0, 0n)).toThrow();
  });
  test("reserved coins cannot be spent", () => {
    expect(() => checkNativeSpend("XLM", 9n, 10n, 1n, 1n)).toThrow();
    expect(() => checkNativeSpend("XLM", 8n, 10n, 1n, 1n)).not.toThrow();
  });
  test("fee caps fail closed", () => {
    expect(() => checkNativeSpend("TON", 1n, 1_000_000_000n, 50_000_001n)).toThrow();
    expect(() => checkNativeSpend("SUI", 1n, 1_000_000_000n, 50_000_001n)).toThrow();
    expect(() => checkNativeSpend("XLM", 1n, 1_000_000_000n, 1_000_001n)).toThrow();
  });
  test("all new uncertain-broadcast messages hold instead of permitting a replacement", () => {
    for (const chain of ["Stellar", "TON", "Sui"]) expect(maybeBroadcast(`${chain} network broadcast outcome is unknown. Do not retry; Seeds will check its transaction id.`)).toBe(true);
  });
});

describe("Stellar mainnet payment", () => {
  const args = { privateKey: key, from: from("XLM"), to: to("XLM"), units: 12345678n, sequence: "42", fee: 200n, createAccount: false, expiresAt: 1_800_000_000 };
  test("signed XDR binds the exact recipient, native amount, sequence and expiry", () => {
    const built = buildStellarTransfer(args);
    const tx = new StellarTransaction(built.xdr, Networks.PUBLIC);
    const op = tx.operations[0];
    if (op?.type !== "payment") throw new Error("Wrong operation");
    expect(op.destination).toBe(args.to); expect(op.amount).toBe("1.2345678"); expect(op.asset.isNative()).toBe(true);
    expect(tx.source).toBe(args.from); expect(tx.sequence).toBe("43"); expect(tx.timeBounds?.maxTime).toBe("1800000000");
    expect(tx.hash().toString("hex")).toBe(built.txid);
    const signature = tx.signatures[0];
    if (!signature) throw new Error("Signature missing");
    expect(ed25519.verify(signature.signature(), tx.hash(), pub)).toBe(true);
  });
  test("new accounts use createAccount, never a token payment", () => {
    const tx = new StellarTransaction(buildStellarTransfer({ ...args, createAccount: true }).xdr, Networks.PUBLIC);
    const op = tx.operations[0];
    if (op?.type !== "createAccount") throw new Error("Wrong operation");
    expect(op.destination).toBe(args.to); expect(op.startingBalance).toBe("1.2345678");
  });
  test("wrong signing key is refused", () => expect(() => buildStellarTransfer({ ...args, privateKey: other })).toThrow());
  test("negative amount is refused", () => expect(() => buildStellarTransfer({ ...args, units: -1n })).toThrow());
});

describe("TON W5 mainnet transfer", () => {
  const args = { publicKey: pub, privateKey: key, from: from("TON"), to: to("TON"), units: 123456789n, seqno: 12, deploy: false, expiresAt: 1_800_000_000 };
  test("signed body has one exact native payment, no sweep or extra action", async () => {
    const tx = await buildTonTransfer(args);
    const cell = Cell.fromBoc(Buffer.from(tx.boc, "base64"))[0];
    if (!cell) throw new Error("No message");
    expect(cell.hash().toString("hex")).toBe(tx.txid);
    const msg = loadMessage(cell.beginParse());
    const s = msg.body.beginParse();
    expect(s.loadUint(32)).toBe(WalletContractV5R1.OpCodes.auth_signed_external);
    expect(s.loadUint(32)).toBe(TON_W5_WALLET_ID);
    expect(s.loadUint(32)).toBe(1_800_000_000); expect(s.loadUint(32)).toBe(12);
    const actions = loadOutListExtendedV5R1(s);
    expect(actions.length).toBe(1);
    const action = actions[0];
    if (action?.type !== "sendMsg" || action.outMsg.info.type !== "internal") throw new Error("Wrong TON action");
    expect(action.mode).toBe(3); expect(action.outMsg.info.dest.equals(tonDestination(args.to))).toBe(true);
    expect(action.outMsg.info.value.coins).toBe(123456789n); expect(action.outMsg.info.bounce).toBe(false);
  });
  test("first send contains the correct W5 deployment data", async () => {
    const tx = await buildTonTransfer({ ...args, seqno: 0, deploy: true });
    expect(tx.initCode.length).toBeGreaterThan(0); expect(tx.initData.length).toBeGreaterThan(0);
    const cell = Cell.fromBoc(Buffer.from(tx.boc, "base64"))[0];
    if (!cell) throw new Error("No message");
    expect(loadMessage(cell.beginParse()).init?.code?.hash().toString("hex")).toBe(WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(pub) }).init.code.hash().toString("hex"));
  });
  test("noble signature matches the official wallet's independent signing implementation", async () => {
    const signed = await buildTonTransfer(args);
    const reference = WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(pub) }).createTransfer({
      seqno: 12, timeout: 1_800_000_000, secretKey: keyPairFromSeed(Buffer.from(key)).secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
      messages: [internal({ to: tonDestination(args.to), value: 123456789n, bounce: false })],
    });
    expect(signed.body).toBe(reference.toBoc().toString("base64"));
  });
  test("testnet destinations are refused", () => {
    const a = WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(otherPub) }).address;
    expect(() => tonDestination(a.toString({ testOnly: true }))).toThrow();
  });
  test("own address with a different bounce flag is refused", async () => {
    const a = WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(pub) }).address;
    await expect(buildTonTransfer({ ...args, to: a.toString({ bounceable: true }) })).rejects.toThrow();
  });
  test("wrong signing key is refused", async () => { await expect(buildTonTransfer({ ...args, privateKey: other })).rejects.toThrow(); });
});

describe("Sui exact native payment", () => {
  const coins = [{ objectId: "0x" + "3".repeat(64), version: "12", digest: base58.encode(new Uint8Array(32).fill(3)), balance: "1000000000" }];
  const args = { from: from("SUI"), to: to("SUI"), units: 123456789n, gasPrice: 1000n, gasBudget: 5_000_000n, coins };
  test("offline BCS contains only a gas split and transfer, and signature verifies in the official SDK", async () => {
    const tx = await buildSuiTransfer(args);
    const data = Transaction.from(tx.bytes).getData();
    expect(data.sender).toBe(args.from); expect(data.gasData.owner).toBe(args.from);
    expect(data.gasData.budget).toBe("5000000"); expect(data.gasData.payment?.length).toBe(1);
    expect(data.commands.map((c) => c.$kind)).toEqual(["SplitCoins", "TransferObjects"]);
    const pure = data.inputs.flatMap((i) => i.$kind === "Pure" ? [Buffer.from(i.Pure.bytes, "base64")] : []);
    const amountInput = pure[0]; const addressInput = pure[1];
    if (!amountInput || !addressInput) throw new Error("Missing Sui amount or destination");
    expect(amountInput.readBigUInt64LE()).toBe(123456789n);
    expect("0x" + addressInput.toString("hex")).toBe(args.to);
    const signature = signSuiTransfer(tx.bytes, key, args.from);
    expect(await new Ed25519PublicKey(pub).verifyTransaction(tx.bytes, signature)).toBe(true);
    const changed = await buildSuiTransfer({ ...args, units: 123456790n });
    expect(await new Ed25519PublicKey(pub).verifyTransaction(changed.bytes, signature)).toBe(false);
    expect(changed.txid).not.toBe(tx.txid);
  });
  test("duplicate gas coins are refused", async () => { await expect(buildSuiTransfer({ ...args, coins: [...coins, ...coins] })).rejects.toThrow(); });
  test("wrong signing key is refused", async () => { const tx = await buildSuiTransfer(args); expect(() => signSuiTransfer(tx.bytes, other, args.from)).toThrow(); });
  test("gas storage rebates never undercut the computation floor", () => {
    expect(suiGasBudget({ computationCost: "1000000", storageCost: "2000000", storageRebate: "9000000" }, 1000n)).toBe(2_000_000n);
    expect(suiGasBudget({ computationCost: "1000000", storageCost: "2000000", storageRebate: "0" }, 1000n)).toBe(4_000_000n);
  });
});

describe("native-chain delivery confirmations", () => {
  const target = "0:" + "1".repeat(64);
  const trace: TonTrace = { transaction: { aborted: false, success: true, in_msg: { hash: "message-id" }, account: { address: "source" }, out_msgs: [{ destination: { address: target }, value: "123456789" }] }, children: [{ transaction: { aborted: false, success: true, account: { address: target }, out_msgs: [] } }] };
  test("TON confirms only the exact outgoing amount and successful destination transaction", () => expect(tonTraceStatus(trace, "message-id", target, 123456789n)).toEqual({ success: true, confirmations: 1 }));
  test("TON accepted-but-skipped action is a failure, not a payment", () => expect(tonTraceStatus({ ...trace, transaction: { ...trace.transaction, out_msgs: [] } }, "message-id", target, 123456789n)?.success).toBe(false));
  test("TON simulated traces never confirm", () => expect(tonTraceStatus({ ...trace, emulated: true }, "message-id", target, 123456789n)).toBeNull());
  test("TON unrelated message ids never confirm", () => expect(tonTraceStatus(trace, "another-message", target, 123456789n)).toBeNull());
  test("TON waits until the destination transaction is seen", () => expect(tonTraceStatus({ ...trace, children: [] }, "message-id", target, 123456789n)).toBeNull());
  test("TON mismatched amount never confirms", () => expect(tonTraceStatus(trace, "message-id", target, 123456788n)?.success).toBe(false));
  test("Sui verifies exactly native SUI credited to the chosen recipient", () => {
    expect(suiPaid([{ address: "recipient", coinType: "0x2::sui::SUI", amount: "123" }], "recipient", 123n)).toBe(true);
    expect(suiPaid([{ address: "recipient", coinType: "0x2::fake::SUI", amount: "123" }], "recipient", 123n)).toBe(false);
    expect(suiPaid([{ address: "someone-else", coinType: "0x2::sui::SUI", amount: "123" }], "recipient", 123n)).toBe(false);
    expect(suiPaid([{ address: "recipient", coinType: "0x2::sui::SUI", amount: "124" }], "recipient", 123n)).toBe(false);
  });
});