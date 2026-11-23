// Where Seeds may send a visitor back to after a payment or put in a shared link
// (deep scan D1, review P1). Only Seeds' own addresses, never a look-alike host
// supplied by a browser. Shared by Ignite Peer Pay and the listing checkout.

export const SEEDS_ORIGINS = [
  "https://seeds.honest.money",
  "https://seeds-cex.lovable.app",
  "https://id-preview--0ce4bcf5-5883-4de0-96d3-b161585d1bf4.lovable.app",
];

export const DEFAULT_ORIGIN = "https://seeds.honest.money";

export function safeOrigin(origin: string | null | undefined): string {
  const o = origin ?? "";
  if (SEEDS_ORIGINS.includes(o)) return o;
  if (/^http:\/\/localhost(:\d{1,5})?$/.test(o)) return o;
  return DEFAULT_ORIGIN;
}
