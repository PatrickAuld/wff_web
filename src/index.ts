export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  time: Date;
  ambient: boolean;
}

export interface RenderResult {
  metadata: Map<string, string>;
}

/**
 * Render a WFF v4 watch face XML onto a canvas element.
 *
 * Phase 1: Parses the root WatchFace element, resizes the canvas,
 * applies clip shape, and fills the Scene background color.
 */
export function renderWatchFace(
  canvas: HTMLCanvasElement,
  options: RenderOptions
): RenderResult {
  const doc = new DOMParser().parseFromString(options.xml, "text/xml");
  const root = doc.documentElement;

  // Extract dimensions from WatchFace root
  const width = parseInt(root.getAttribute("width") ?? "450", 10);
  const height = parseInt(root.getAttribute("height") ?? "450", 10);
  const clipShape = root.getAttribute("clipShape");

  // Collect metadata
  const metadata = new Map<string, string>();
  const metaElements = root.querySelectorAll("Metadata");
  for (const el of metaElements) {
    const key = el.getAttribute("key");
    const value = el.getAttribute("value");
    if (key !== null && value !== null) {
      metadata.set(key, value);
    }
  }

  // Resize canvas to match WatchFace dimensions
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { metadata };
  }

  // Apply circular clip mask if specified
  if (clipShape === "CIRCLE") {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    ctx.clip();
  }

  // Read background color from Scene element, default to black
  const scene = root.querySelector("Scene");
  const backgroundColor = scene?.getAttribute("backgroundColor") ?? "#000000";

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  return { metadata };
}
