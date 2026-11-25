import { afterEach, expect, test } from "bun:test";
import { fetchQuotes, TRACKED } from "./cmc.server";

const savedFetch = globalThis.fetch;
const savedKey = process.env['CMC_API'];
afterEach(() => { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env['CMC_API']; else process.env['CMC_API'] = savedKey; });

test("ordinary reference quotes include Stellar, TON and Sui", () => {
  for (const symbol of ['XLM', 'TON', 'SUI']) expect(TRACKED).toContain(symbol);
});
test("a cache filled by a smaller symbol list cannot mask another coin", async () => {
  process.env['CMC_API'] = 'test-cmc-key';
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'pro-api.coinmarketcap.com') return Response.json(url.hostname === 'api.dexscreener.com' ? [] : {});
    const symbols = (url.searchParams.get('symbol') ?? '').split(',');
    requests.push(symbols.join(','));
    return Response.json({ data: Object.fromEntries(symbols.map((symbol) => [symbol, { symbol, name: symbol, quote: { USD: { price: 1 } } }])) });
  }) as typeof fetch;
  await fetchQuotes(['BTC']);
  const next = await fetchQuotes(['BTC', 'XLM']);
  expect(next.quotes.some((quote) => quote.symbol === 'XLM')).toBe(true);
  expect(requests).toEqual(['BTC', 'BTC,XLM']);
  await fetchQuotes(['XLM', 'BTC']);
  expect(requests).toHaveLength(2);
});

test("TON uses coin ID 11419 and remains TON when CMC changes its ticker", async () => {
  process.env['CMC_API'] = 'test-cmc-key';
  const requests: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'pro-api.coinmarketcap.com') return Response.json(url.hostname === 'api.dexscreener.com' ? [] : {});
    requests.push(url);
    return Response.json({ data: {
      '11419': { id: 11419, symbol: 'GRAM', name: 'Gram (prev. Toncoin)', quote: { USD: { price: 0.9543632466244609 } } },
      Ton: { id: 39249, symbol: 'Ton', quote: { USD: { price: 23.768 } } },
    } });
  }) as typeof fetch;
  const result = await fetchQuotes(['TON']);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.searchParams.get('id')).toBe('11419');
  expect(requests[0]?.searchParams.has('symbol')).toBe(false);
  const ton = result.quotes.find((q) => q.symbol === 'TON');
  expect(ton?.price).toBe(0.9543632466244609);
  expect(254.71915799 * (ton?.price ?? 0)).toBeCloseTo(243.09460259678542, 8);
});

test("TON never accepts another coin returned under the pinned ID", async () => {
  process.env['CMC_API'] = 'test-cmc-key';
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'pro-api.coinmarketcap.com') return Response.json(url.hostname === 'api.dexscreener.com' ? [] : {});
    return Response.json({ data: { '11419': { id: 39249, symbol: 'TON', quote: { USD: { price: 23.768 } } } } });
  }) as typeof fetch;
  const result = await fetchQuotes(['TON', 'DOGE']);
  expect(result.quotes.some((q) => q.symbol === 'TON')).toBe(false);
});

test("an unavailable TON ID quote does not remove other reference prices", async () => {
  process.env['CMC_API'] = 'test-cmc-key';
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'pro-api.coinmarketcap.com') return Response.json(url.hostname === 'api.dexscreener.com' ? [] : {});
    if (url.searchParams.has('id')) return new Response('', { status: 503 });
    expect(url.searchParams.get('symbol')).toBe('TRX');
    return Response.json({ data: { TRX: { symbol: 'TRX', quote: { USD: { price: 0.3 } } } } });
  }) as typeof fetch;
  const result = await fetchQuotes(['TON', 'TRX']);
  expect(result.quotes.find((q) => q.symbol === 'TRX')?.price).toBe(0.3);
  expect(result.quotes.some((q) => q.symbol === 'TON')).toBe(false);
});