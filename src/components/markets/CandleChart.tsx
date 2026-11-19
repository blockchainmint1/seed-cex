import { useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/markets/thor-markets";
import { priceDecimals } from "@/lib/markets/thor-markets";

/** Resolve a CSS colour token (oklch etc.) to rgba() the canvas chart understands. */
function tokenRgba(name: string, alpha = 1): string {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d");
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!ctx || !raw) return `rgba(128,128,128,${alpha})`;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${alpha})`;
}

function palette() {
  return {
    text: tokenRgba("--muted-foreground"),
    grid: tokenRgba("--border", 0.5),
    border: tokenRgba("--border"),
    up: tokenRgba("--bid"),
    down: tokenRgba("--ask"),
    upVol: tokenRgba("--bid", 0.35),
    downVol: tokenRgba("--ask", 0.35),
  };
}

/**
 * Candlestick chart with volume bars. The chart library only loads in the
 * browser (it draws on a canvas), so the server renders an empty frame.
 */
export function CandleChart({ candles, height = 380, intraday }: { candles: Candle[]; height?: number; intraday: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ setData: (c: Candle[]) => void; destroy: () => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(candles);
  latest.current = candles;

  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    (async () => {
      try {
        const lc = await import("lightweight-charts");
        if (disposed || !box.current) return;
        const el = box.current;
        const p0 = palette();
        const chart = lc.createChart(el, {
          autoSize: true,
          layout: { background: { type: lc.ColorType.Solid, color: "transparent" }, textColor: p0.text, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11, attributionLogo: false, panes: { separatorColor: p0.border, separatorHoverColor: p0.grid, enableResize: false } },
          grid: { vertLines: { color: p0.grid }, horzLines: { color: p0.grid } },
          rightPriceScale: { borderColor: p0.border, scaleMargins: { top: 0.08, bottom: 0.06 } },
          timeScale: { borderColor: p0.border, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
          crosshair: { mode: lc.CrosshairMode.Normal },
        });
        const candlesS = chart.addSeries(lc.CandlestickSeries, {
          upColor: p0.up, downColor: p0.down, wickUpColor: p0.up, wickDownColor: p0.down, borderVisible: false,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        // Volume gets its own strip under the prices, so the price scale never stretches below zero.
        const volS = chart.addSeries(lc.HistogramSeries, { priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }, 1);
        const panes = chart.panes();
        panes[0]?.setStretchFactor(0.8);
        panes[1]?.setStretchFactor(0.2);

        const setData = (cs: Candle[]) => {
          const p = palette();
          const d = priceDecimals(cs[cs.length - 1]?.close ?? 1);
          candlesS.applyOptions({ priceFormat: { type: "price", precision: d, minMove: 1 / 10 ** d } });
          candlesS.setData(cs.map((c) => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close })));
          volS.setData(cs.map((c) => ({ time: c.time as never, value: c.volume, color: c.close >= c.open ? p.upVol : p.downVol })));
          chart.timeScale().fitContent();
        };
        const recolor = () => {
          const p = palette();
          chart.applyOptions({
            layout: { textColor: p.text, panes: { separatorColor: p.border, separatorHoverColor: p.grid } },
            grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
            rightPriceScale: { borderColor: p.border },
            timeScale: { borderColor: p.border },
          });
          candlesS.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
          setData(latest.current);
        };
        // Follow the light/dark switch.
        observer = new MutationObserver(recolor);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        api.current = { setData, destroy: () => chart.remove() };
        setData(latest.current);
      } catch (e) {
        console.error("[chart] failed to load", e);
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      api.current?.destroy();
      api.current = null;
    };
  }, [intraday]);

  useEffect(() => {
    api.current?.setData(candles);
  }, [candles]);

  if (failed) return <div style={{ height }} className="grid place-items-center font-mono text-xs text-muted-foreground">Chart couldn't load. Refresh to retry.</div>;
  return <div ref={box} style={{ height }} className="w-full" role="img" aria-label="Candlestick price chart" />;
}
