import { applyVariants } from "./variants.js";
import type { RenderContext } from "./shapes.js";

export function renderGroup(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => void,
  renderCtx: RenderContext
): void {
  // Apply ambient variants before reading attributes
  applyVariants(el, renderCtx.ambient);

  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const pivotX = parseFloat(el.getAttribute("pivotX") ?? "0.5");
  const pivotY = parseFloat(el.getAttribute("pivotY") ?? "0.5");
  const angle = parseFloat(el.getAttribute("angle") ?? "0");
  const alpha = parseFloat(el.getAttribute("alpha") ?? "255");
  const scaleX = parseFloat(el.getAttribute("scaleX") ?? "1");
  const scaleY = parseFloat(el.getAttribute("scaleY") ?? "1");

  ctx.save();

  // Position
  ctx.translate(x, y);

  // Pivot-based transforms
  const px = pivotX * w;
  const py = pivotY * h;
  ctx.translate(px, py);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-px, -py);

  // Alpha compositing (multiply with existing globalAlpha)
  ctx.globalAlpha *= alpha / 255;

  // Render children depth-first (skip Variant elements — handled by applyVariants)
  for (const child of el.children) {
    if (child.tagName !== "Variant") {
      renderChild(ctx, child, renderCtx);
    }
  }

  ctx.restore();
}
