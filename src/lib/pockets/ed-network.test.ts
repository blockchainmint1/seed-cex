import { afterEach, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { edAddress } from "./ed25519-chains";
import { edTxStatus, readEdSpendable, sendEdNative, stellarDestinationProblem } from "./ed-send.server";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const address = edAddress('XLM', ed25519.getPublicKey(new Uint8Array(32).fill(7)));
const target = edAddress('XLM', ed25519.getPublicKey(new Uint8Array(32).fill(8)));
const now = Math.floor(Date.now() / 1000);
const ledger = { _embedded: { records: [{ base_fee_in_stroops: 100, base_reserve_in_stroops: 5_000_000, closed_at: new Date().toISOString() }] } };
const account = { sequence: '1', balances: [{ asset_type: 'native', balance: '2.0000000' }], subentry_count: 0, num_sponsoring: 0, num_sponsored: 0, thresholds: { med_threshold: 1 }, signers: [{ key: address, weight: 1 }] };

function stub(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(new URL(input instanceof Request ? input.url : String(input)), init))) as typeof fetch;
}
test('Stellar SEP-29 is checked both at request time and before any key unlock or recording', async () => {
  let recorded = false;
  stub((url) => {
    if (url.pathname.includes('/ledgers')) return Response.json(ledger);
    if (url.pathname.includes('/fee_stats')) return Response.json({ max_fee: { p50: '21009' } });
    return Response.json(url.pathname.endsWith(target) ? { ...account, data_attr: { 'config.memo_required': 'MQ==' } } : account);
  });
  expect(await stellarDestinationProblem(target)).not.toBeNull();
  await expect(sendEdNative('XLM', { id: 'test', ciphertext: null }, address, target, 1n, async () => { recorded = true; }, true)).rejects.toThrow('requires a memo');
  expect(recorded).toBe(false);
});
test('Stellar live spendable uses the actual median fee and native reserve', async () => {
  stub((url) => Response.json(url.pathname.includes('/ledgers') ? ledger : url.pathname.includes('/fee_stats') ? { max_fee: { p50: '21009' } } : account));
  expect(await readEdSpendable('XLM', address)).toBe(9_978_991n);
});
test('missing Stellar transaction becomes expired only with persisted expiry and later closed-ledger evidence', async () => {
  stub((url) => url.pathname.includes('/transactions') ? new Response('{}', { status: 404 }) : Response.json(ledger));
  expect(await edTxStatus('XLM', 'missing', target, 1n, address, { chain: 'XLM', expiresAt: now - 31 })).toEqual({ success: false, confirmations: 0, expired: true });
  expect(await edTxStatus('XLM', 'missing', target, 1n, address, { chain: 'XLM', expiresAt: now })).toBeNull();
  expect(await edTxStatus('XLM', 'missing', target, 1n, address)).toBeNull();
});
test('a Stellar outage is never treated as a missing or expired payment', async () => {
  stub(() => new Response('{}', { status: 503 }));
  await expect(edTxStatus('XLM', 'missing', target, 1n, address, { chain: 'XLM', expiresAt: now - 1000 })).rejects.toThrow('HTTP 503');
});
test('TON deploy messages stay unknown when the trace is missing, never automatically expire', async () => {
  stub(() => new Response('{}', { status: 404 }));
  expect(await edTxStatus('TON', 'missing', edAddress('TON', ed25519.getPublicKey(new Uint8Array(32).fill(8))), 1n,
    edAddress('TON', ed25519.getPublicKey(new Uint8Array(32).fill(7))), { chain: 'TON', expiresAt: 1000, seqno: 0, publicKeyHex: '1'.repeat(64) })).toBeNull();
});