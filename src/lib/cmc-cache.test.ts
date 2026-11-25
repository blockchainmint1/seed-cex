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
    if (url.hostname !== 'pro-api.coinmarketcap.com') return new Response('{}');
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