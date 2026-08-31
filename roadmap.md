# Roadmap

- [x] Admin console (/admin) — accounts, totals, open trades/orders
- [x] Grant admin role to operator accounts
- [x] Trim markets to TSD pairs only (dropped USDC_TXC, TXC_USDT)
- [x] BTC wrap/unwrap desk — Seeds client built; issuer live on TSD Swap side
- [x] Issuer launched wBTC #43 / wLTC #44 / wETH #45 on Omni — registered in chain registry
- [x] Generalize Omni settlement to any property (TSD + wrapped assets)
- [x] Add BTC/TSD and ETH/TSD markets (wrapped under the hood, shown as native)
- [x] Unwrap flow: send user's wrapped asset to issuer deposit address
- [ ] Consolidate wallet balance rows — show "ETH on EVM", "USDC on EVM", "USDT on EVM" instead of one row per chain
- [ ] Issuer-side go-live checklist (on TSD Swap): flip Live per asset, fund BTC/LTC vaults for unwrap liquidity
