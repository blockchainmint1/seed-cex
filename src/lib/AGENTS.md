# src/lib

- Market orders: rules in src/lib/market-order.ts (tested); the server re-derives price protection from the live book (capped), and a market order is never open/partial (DB check orders_market_never_rests; restoreFills cancels its size). Why: a market order must never wait on the book at a stale worst-case price.
- P2P sell-ad ranges come only from offerRange (src/lib/p2p-range.ts, tested): the max buyers see is the seller's max cut to what their free pocket balance covers, ads that can't cover the min are hidden, and openTrade re-checks against the live balance. Marketplace, seller page, seller desk and save toast all use it. Why: an ad must never offer more than the pocket can actually send.
- TXC/ISK scantxoutset calls share one in-flight scan per address set (rpc.server.ts) and never reuse a finished answer. Why: the node refuses a second concurrent scan, which read as an empty pocket; coin selection must stay current.
