import { applyVariants } from "./variants.js";
import type { RenderContext } from "./shapes.js";

// Cache for decoded images — keyed by resource name
const imageCache = new Map<string, ImageBitmap>();

export async function renderPartImage(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderCtx: RenderContext,
  assets: Map<string, ArrayBuffer>
): Promise<void> {
  applyVariants(el, renderCtx.ambient);
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  const imageEl = findImageChild(el);
  if (!imageEl) return;

  const resource = imageEl.getAttribute("resource") ?? "";
  if (!resource) return;

  const bitmap = await getOrDecodeImage(resource, assets);
  if (!bitmap) return;

  ctx.save();
  ctx.drawImage(bitmap, x, y, w, h);
  ctx.restore();
}

function findImageChild(el: Element): Element | null {
  for (const child of el.children) {
    if (child.tagName === "Image") return child;
  }
  return null;
}

export async function getOrDecodeImage(
  resource: string,
  assets: Map<string, ArrayBuffer>
): Promise<ImageBitmap | null> {
  if (imageCache.has(resource)) {
    return imageCache.get(resource)!;
  }
  const buffer = assets.get(resource);
  if (!buffer) return null;

  const blob = new Blob([buffer]);
  const bitmap = await createImageBitmap(blob);
  imageCache.set(resource, bitmap);
  return bitmap;
}

// Clear cache (useful between renders or in tests)
export function clearImageCache(): void {
  imageCache.clear();
}
