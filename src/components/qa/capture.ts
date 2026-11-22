/**
 * In-browser screenshot of what the tester sees (no outside service). The Feedback tools are
 * left out, and before the tester even sees the picture these are covered in black:
 * every form field (inputs, text boxes, drop-downs, editable text), anything marked
 * data-qa-mask, every QR code, balance columns in tables, and on-screen text that looks like
 * an address, key, transaction id, code or balance (rules in src/lib/qa/mask-rules.ts).
 */
import { maskedColumns, sensitiveRanges } from "@/lib/qa/mask-rules";

export type MaskBox = { x: number; y: number; w: number; h: number };

const MASK_SELECTOR = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-qa-mask]";
const SKIP_TEXT_IN = "script, style, noscript, template, [data-qa-ui]";

function onScreen(r: DOMRect | DOMRectReadOnly): boolean {
  return !(r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth);
}
const pad = (r: DOMRect | DOMRectReadOnly, p = 2): MaskBox => ({ x: r.left - p, y: r.top - p, w: r.width + p * 2, h: r.height + p * 2 });

/** QR codes (qrcode.react draws them as an svg with crisp-edged paths) and QR images. */
function qrElements(): Element[] {
  const out = new Set<Element>();
  document.querySelectorAll("svg path[shape-rendering='crispEdges'], svg [shape-rendering='crispEdges']").forEach((p) => {
    const svg = p.closest("svg");
    if (svg) out.add(svg);
  });
  document.querySelectorAll("svg[shape-rendering='crispEdges'], img[alt*='QR' i], canvas[aria-label*='QR' i]").forEach((e) => out.add(e));
  return [...out];
}

/** Cells under a Balance / In pocket / Value header. */
function balanceCells(): Element[] {
  const out: Element[] = [];
  document.querySelectorAll("table").forEach((t) => {
    const head = t.tHead?.rows[t.tHead.rows.length - 1];
    if (!head) return;
    const cols = maskedColumns([...head.cells].map((c) => c.textContent ?? ""));
    if (!cols.length) return;
    [...t.tBodies].forEach((b) => [...b.rows].forEach((row) => {
      if (row.cells.length !== head.cells.length) return;
      cols.forEach((i) => { const c = row.cells[i]; if (c) out.push(c); });
    }));
  });
  return out;
}

const BLACKOUT = "data-qa-blackout";

/**
 * On-screen text that looks like an address, key, code or balance. A short text holder
 * (a span, cell or line of its own) is blacked out whole; inside a long paragraph only the
 * matching words get a box.
 */
function sensitiveText(): { elements: Element[]; boxes: MaskBox[] } {
  const elements: Element[] = [];
  const boxes: MaskBox[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    if (text.trim().length < 3) continue;
    const parent = n.parentElement;
    if (!parent || parent.closest(SKIP_TEXT_IN)) continue;
    const ranges = sensitiveRanges(text);
    if (!ranges.length) continue;
    const pr = parent.getBoundingClientRect();
    if (!onScreen(pr)) continue;
    const matched = ranges.reduce((a, [x, y]) => a + (y - x), 0);
    if ((parent.textContent ?? "").length <= matched * 2 + 24 && pr.height < 80) { elements.push(parent); continue; }
    for (const [a, b] of ranges) {
      const range = document.createRange();
      range.setStart(n, a);
      range.setEnd(n, b);
      for (const r of range.getClientRects()) if (onScreen(r)) boxes.push(pad(r, 4));
    }
  }
  return { elements, boxes };
}

/** Everything to black out: whole elements (painted black inside the picture) and extra boxes. */
function maskTargets(): { elements: Element[]; boxes: MaskBox[] } {
  const els: Element[] = [];
  document.querySelectorAll<HTMLElement>(MASK_SELECTOR).forEach((el) => {
    if (el instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "range", "color", "hidden"].includes(el.type)) return;
    els.push(el);
  });
  const text = sensitiveText();
  els.push(...qrElements(), ...balanceCells(), ...text.elements);
  const elements = [...new Set(els)].filter((el) => !el.closest("[data-qa-ui]") && onScreen(el.getBoundingClientRect()));
  return { elements, boxes: text.boxes };
}

/** Where the automatic black boxes go, in viewport pixels (one per blacked-out spot). */
export function autoMaskBoxes(): MaskBox[] {
  const t = maskTargets();
  return [...t.elements.map((el) => pad(el.getBoundingClientRect())), ...t.boxes];
}

/** Paint a tagged node black in the screenshot copy (the page itself is never changed visibly). */
function blackOut(node: Node) {
  if (!(node instanceof Element) || !node.hasAttribute(BLACKOUT)) return;
  node.removeAttribute(BLACKOUT);
  const st = (node as HTMLElement | SVGElement).style;
  if (!st) return;
  st.setProperty("background", "#000", "important");
  st.setProperty("color", "#000", "important");
  st.setProperty("-webkit-text-fill-color", "#000", "important");
  st.setProperty("border-color", "#000", "important");
  st.setProperty("text-shadow", "none", "important");
  st.setProperty("fill", "#000", "important");
  st.setProperty("stroke", "#000", "important");
  st.setProperty("opacity", "1", "important");
  if (node instanceof HTMLImageElement || node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement) st.setProperty("filter", "brightness(0)", "important");
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) st.setProperty("caret-color", "#000", "important");
}

/** The visible part of the page as a canvas (viewport size × scale), with private spots blacked out. */
export async function captureViewport(): Promise<{ canvas: HTMLCanvasElement; masks: MaskBox[] }> {
  const { elements, boxes } = maskTargets();
  const masks = [...elements.map((el) => pad(el.getBoundingClientRect())), ...boxes];
  // Tag each spot and everything inside it, so the copy paints them black exactly where the
  // copy lays them out (a box drawn afterwards can drift when the copy wraps text differently).
  // Only words inside long paragraphs get drawn boxes.
  const tagged: Element[] = [];
  for (const el of elements) {
    for (const x of [el, ...el.querySelectorAll("*")]) { if (!x.hasAttribute(BLACKOUT)) { x.setAttribute(BLACKOUT, ""); tagged.push(x); } }
  }
  const { domToCanvas } = await import("modern-screenshot");
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  let full: HTMLCanvasElement;
  try {
    full = await domToCanvas(document.body, {
      scale,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#000",
      filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-qa-ui")),
      onCloneEachNode: blackOut,
    });
  } finally {
    for (const x of tagged) x.removeAttribute(BLACKOUT);
  }
  const w = window.innerWidth, h = window.innerHeight;
  const out = document.createElement("canvas");
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext("2d")!;
  // The body's picture starts at the body's top-left corner; the viewport sits at minus that offset.
  const body = document.body.getBoundingClientRect();
  ctx.drawImage(full, -body.left * scale, -body.top * scale, out.width, out.height, 0, 0, out.width, out.height);
  ctx.fillStyle = "#000";
  for (const m of boxes) ctx.fillRect(m.x * scale, m.y * scale, m.w * scale, m.h * scale);
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
