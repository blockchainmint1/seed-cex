/**
 * In-browser screenshot of what the tester sees (no outside service). The Feedback tools are
 * left out, and every form field (inputs, text boxes, drop-downs, editable text) plus anything
 * marked data-qa-mask is covered in black before the tester even sees the picture.
 */
export type MaskBox = { x: number; y: number; w: number; h: number };

const MASK_SELECTOR = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-qa-mask]";

/** Where the automatic black boxes go, in viewport pixels. */
export function autoMaskBoxes(): MaskBox[] {
  const out: MaskBox[] = [];
  document.querySelectorAll<HTMLElement>(MASK_SELECTOR).forEach((el) => {
    if (el.closest("[data-qa-ui]")) return;
    if (el instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "range", "color", "hidden"].includes(el.type)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return;
    out.push({ x: r.left - 2, y: r.top - 2, w: r.width + 4, h: r.height + 4 });
  });
  return out;
}

/** The visible part of the page as a canvas (viewport size × scale), with form fields blacked out. */
export async function captureViewport(): Promise<{ canvas: HTMLCanvasElement; masks: MaskBox[] }> {
  const masks = autoMaskBoxes();
  const { domToCanvas } = await import("modern-screenshot");
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const full = await domToCanvas(document.body, {
    scale,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#000",
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-qa-ui")),
  });
  const w = window.innerWidth, h = window.innerHeight;
  const out = document.createElement("canvas");
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext("2d")!;
  // The body's picture starts at the body's top-left corner; the viewport sits at minus that offset.
  const body = document.body.getBoundingClientRect();
  ctx.drawImage(full, -body.left * scale, -body.top * scale, out.width, out.height, 0, 0, out.width, out.height);
  ctx.fillStyle = "#000";
  for (const m of masks) ctx.fillRect(m.x * scale, m.y * scale, m.w * scale, m.h * scale);
  return { canvas: out, masks };
}

/** PNG if it fits under the limit, otherwise a JPEG. */
export async function canvasToBlob(c: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  const png = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (png && png.size <= maxBytes) return png;
  for (const q of [0.85, 0.7, 0.5]) {
    const jpg = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
    if (jpg && jpg.size <= maxBytes) return jpg;
  }
  throw new Error("That screenshot is too large to attach.");
}
