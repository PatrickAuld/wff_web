import { applyVariants } from "./variants.js";
import { getOrDecodeImage } from "./images.js";
import type { RenderContext } from "./shapes.js";

export async function renderAnalogClock(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  applyVariants(el, renderCtx.ambient);
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");

  // Get current time from expression context
  const sources = renderCtx.expressionCtx.sources;
  const hour = (sources.HOUR_0_23 as number) ?? 0;
  const minute = (sources.MINUTE as number) ?? 0;
  const second = (sources.SECOND as number) ?? 0;

  ctx.save();
  ctx.translate(x, y);

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

async function renderHand(
  ctx: CanvasRenderingContext2D,
  el: Element,
  angle: number,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  applyVariants(el, renderCtx.ambient);

  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const pivotX = parseFloat(el.getAttribute("pivotX") ?? "0.5");
  const pivotY = parseFloat(el.getAttribute("pivotY") ?? "0.5");

  ctx.save();

  // Translate to hand position
  ctx.translate(x, y);

  // Pivot-based rotation
  const px = pivotX * w;
  const py = pivotY * h;
  ctx.translate(px, py);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-px, -py);

  // Draw resource image if specified
  const resource = el.getAttribute("resource");
  if (resource) {
    const bitmap = await getOrDecodeImage(resource, renderCtx.assets);
    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, w, h);
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
