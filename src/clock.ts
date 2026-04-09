import { applyVariants } from "./variants.js";
import { parseColor } from "./color.js";
import { getOrDecodeImage } from "./images.js";
import type { RenderContext } from "./shapes.js";
import type { ExpressionContext } from "./expressions.js";

export async function renderAnalogClock(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  applyVariants(el, renderCtx.ambient);

  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const alpha = parseFloat(el.getAttribute("alpha") ?? "255");
  if (alpha <= 0) return;

  // Get current time from expression context
  const sources = renderCtx.expressionCtx.sources;
  const hour = (sources.HOUR_0_23 as number) ?? 0;
  const minute = (sources.MINUTE as number) ?? 0;
  const second = (sources.SECOND as number) ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha / 255;

  for (const child of el.children) {
    const tag = child.tagName;
    if (tag === "HourHand" || tag === "MinuteHand" || tag === "SecondHand") {
      let angle: number;
      if (tag === "HourHand") {
        angle = ((hour % 12) + minute / 60) * 30;
      } else if (tag === "MinuteHand") {
        angle = (minute + second / 60) * 6;
      } else {
        angle = second * 6;
      }
      await renderHand(ctx, child, angle, renderChild, renderCtx);
    } else if (tag !== "Variant") {
      await renderChild(ctx, child, renderCtx);
    }
  }

  ctx.restore();
}

/** Resolve a single [SOURCE_NAME] expression ref in an attribute value. */
function resolveExprRef(value: string | null, expressionCtx: ExpressionContext): string | null {
  if (!value?.includes("[")) return value;
  return value.replace(/\[([^\]]+)\]/g, (_, name) => {
    const val = expressionCtx.sources[name];
    return val !== undefined ? String(val) : "#000000";
  });
}

/**
 * Draw an ImageBitmap with an optional tintColor applied.
 * tintColor replaces the non-transparent pixels' RGB while preserving
 * the image's alpha channel — consistent with Android's tinting behavior.
 */
async function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  w: number,
  h: number,
  tintColor: string | null
): Promise<void> {
  if (!tintColor) {
    ctx.drawImage(bitmap, 0, 0, w, h);
    return;
  }

  // Composite the tint color over the image's alpha mask on an offscreen canvas
  const offscreen = new OffscreenCanvas(w, h);
  const offCtx = offscreen.getContext("2d")!;
  offCtx.drawImage(bitmap, 0, 0, w, h);
  offCtx.globalCompositeOperation = "source-in";
  offCtx.fillStyle = parseColor(tintColor);
  offCtx.fillRect(0, 0, w, h);
  ctx.drawImage(offscreen, 0, 0);
}

async function renderHand(
  ctx: CanvasRenderingContext2D,
  el: Element,
  angle: number,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  applyVariants(el, renderCtx.ambient);

  const alpha = parseFloat(el.getAttribute("alpha") ?? "255");
  if (alpha <= 0) return; // Skip fully transparent hands (e.g. shadow hands in ambient)

  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const pivotX = parseFloat(el.getAttribute("pivotX") ?? "0.5");
  const pivotY = parseFloat(el.getAttribute("pivotY") ?? "0.5");

  // Resolve tintColor expression ref (e.g. [CONFIGURATION.themeColor.0])
  const tintColor = resolveExprRef(el.getAttribute("tintColor"), renderCtx.expressionCtx);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha / 255;

  // Pivot-based rotation
  const px = pivotX * w;
  const py = pivotY * h;
  ctx.translate(px, py);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-px, -py);

  // Draw resource image with optional tint
  const resource = el.getAttribute("resource");
  if (resource) {
    const bitmap = await getOrDecodeImage(resource, renderCtx.assets);
    if (bitmap) {
      await drawTintedImage(ctx, bitmap, w, h, tintColor);
    }
  }

  // Render PartDraw children (skip Variant elements)
  for (const child of el.children) {
    if (child.tagName !== "Variant") {
      await renderChild(ctx, child, renderCtx);
    }
  }

  ctx.restore();
}
