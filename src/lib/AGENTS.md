# src/lib

- Market orders: rules in src/lib/market-order.ts (tested); the server re-derives price protection from the live book (capped), and a market order is never open/partial (DB check orders_market_never_rests; restoreFills cancels its size). Why: a market order must never wait on the book at a stale worst-case price.
