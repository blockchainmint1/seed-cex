import { useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MaskBox } from "./capture";

/**
 * The tester reviews the screenshot before it can be attached: form fields, QR codes, addresses, codes and balances are already
 * blacked out, and they drag to black out anything else (balances, addresses, names).
 */
export function ScreenshotReview({ source, autoMasks, onDone, onCancel }: {
  source: HTMLCanvasElement;
  autoMasks: number;
  onDone: (edited: HTMLCanvasElement, redacted: boolean) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [boxes, setBoxes] = useState<MaskBox[]>([]);
  const [draft, setDraft] = useState<MaskBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    ctx.fillStyle = "#000";
    for (const b of [...boxes, ...(draft ? [draft] : [])]) ctx.fillRect(b.x, b.y, b.w, b.h);
  }, [source, boxes, draft]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * source.width, y: ((e.clientY - r.top) / r.height) * source.height };
  };
  const box = (a: { x: number; y: number }, b: { x: number; y: number }): MaskBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Check the picture before it's attached. {autoMasks ? `${autoMasks} private spot${autoMasks === 1 ? " was" : "s were"} blacked out for you (typing boxes, QR codes, addresses, codes and balances). ` : ""}
        <strong className="text-foreground">Drag over anything else you don't want to share</strong>, like balances, addresses or names.
      </p>
      <canvas
        ref={ref}
        aria-label="Screenshot preview. Drag to black out an area."
        className="max-h-[55vh] w-full cursor-crosshair touch-none rounded-sm border border-border bg-background object-contain"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setDraft(null); }}
        onPointerMove={(e) => { if (start.current) setDraft(box(start.current, point(e))); }}
        onPointerUp={(e) => {
          if (start.current) {
            const b = box(start.current, point(e));
            if (b.w > 4 && b.h > 4) setBoxes((v) => [...v, b]);
          }
          start.current = null;
          setDraft(null);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!boxes.length} onClick={() => setBoxes((v) => v.slice(0, -1))}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
          <Button type="button" variant="outline" size="sm" disabled={!boxes.length} onClick={() => setBoxes([])}><Eraser className="mr-1 h-4 w-4" />Clear my boxes</Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Don't attach</Button>
          <Button type="button" size="sm" onClick={() => ref.current && onDone(ref.current, boxes.length > 0 || autoMasks > 0)}>Looks good, attach</Button>
        </div>
      </div>
    </div>
  );
}
