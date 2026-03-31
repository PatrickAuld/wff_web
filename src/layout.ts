import { applyVariants } from "./variants.js";
import { hasMasking, renderWithMasking, applyBlendMode } from "./masking.js";
import { applyTransforms } from "./animation.js";
import type { RenderContext } from "./shapes.js";

export async function renderGroup(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  // Apply ambient variants before reading attributes
  applyVariants(el, renderCtx.ambient);
  // Apply animation transforms (may mutate element attributes)
  applyTransforms(el, renderCtx.expressionCtx, renderCtx.elapsedMs ?? 0);

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

  // Apply blend mode if specified
  applyBlendMode(ctx, el);

  // Render children — use offscreen compositing if any child has renderMode
  if (hasMasking(el)) {
    await renderWithMasking(ctx, el, w, h, renderChild, renderCtx);
  } else {
    // Normal child rendering (skip Variant elements — handled by applyVariants)
    for (const child of el.children) {
      if (child.tagName !== "Variant") {
        await renderChild(ctx, child, renderCtx);
      }
    }
  }

  ctx.restore();
}
