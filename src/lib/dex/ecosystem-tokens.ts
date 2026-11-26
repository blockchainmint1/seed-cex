/**
 * Honest Money wrapped coins on Ethereum (client-safe, hardcoded, tested).
 * Contracts and pools copied from the wTXC / wZCU / wISK Wrap projects; each trades in a Uniswap v3 pool against USDC.
 */
export type EcosystemToken = { symbol: string; name: string; address: string; decimals: number; pool?: string; wrapSite: string };

export const ECOSYSTEM_TOKENS: readonly EcosystemToken[] = [
  { symbol: "wTXC", name: "Wrapped TEXITcoin", address: "0x9FC65df3997073B8551Ffd617154B5102fACbb88", decimals: 8, wrapSite: "https://wtxc.lovable.app" },
  { symbol: "wISK", name: "Wrapped Iskander Coin", address: "0xFB38867D064Df981F159b886007F1273a346b0BB", decimals: 8, pool: "0xF364A7EA901569B4eA3d0e5bFE2cCDDFB1063142", wrapSite: "https://wisk.iskandercoin.com" },
  { symbol: "wZCU", name: "Wrapped ZeroChill", address: "0x61b1F4D5db2436C089593828C26F21e25c4A9C9d", decimals: 18, pool: "0xc70ccfBD7686a840F7274aF4bcd72A63B4Cc3EF6", wrapSite: "https://wzcu.zerochill.com" },
];
