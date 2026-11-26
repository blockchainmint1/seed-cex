/** 24-hour market numbers from the trade tape (newest first). Pure, tested. */
export type TapeLike = { createdAt: string; price: number; amount: number };

/** Only trades inside the last 24 hours count. With none, the last price stays but change is 0, volume 0, and there is no 24h high/low. */
export function statsFromTape(tape: TapeLike[], now = Date.now()) {
  if (!tape.length) return { last: null, changePct: null, high24h: null, low24h: null, volume24h: 0, quoteVolume24h: 0 };
  const cutoff = now - 86_400_000;
  const recent = tape.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  const last = tape[0]!.price;
  if (!recent.length) return { last, changePct: 0, high24h: null, low24h: null, volume24h: 0, quoteVolume24h: 0 };
  // Change is measured from the last price before the window when there is one, else the window's first trade.
  const before = tape.find((t) => new Date(t.createdAt).getTime() < cutoff);
  const first = before ? before.price : recent[recent.length - 1]!.price;
  const prices = recent.map((t) => t.price);
  return {
    last,
    changePct: first ? ((last - first) / first) * 100 : null,
    high24h: Math.max(...prices),
    low24h: Math.min(...prices),
    volume24h: recent.reduce((s, t) => s + t.amount, 0),
    quoteVolume24h: recent.reduce((s, t) => s + t.amount * t.price, 0),
  };
}
