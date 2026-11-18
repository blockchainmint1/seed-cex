# Pockets

- Which pocket coins HME Wallet can't hold comes only from POCKET_SPECS.hmeToday via src/lib/pockets/hme-support.ts (tested); every swap-back-to-TSD warning uses it, revoking warns but is never blocked, and a TSD swap never buys a coin Seeds can't sell back. Why: after a revoke Seeds deletes its key, so those coins are recoverable only by recovery phrase.
