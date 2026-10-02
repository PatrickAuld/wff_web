import { hasMasking, renderWithMasking } from "./masking.js";
import type { RenderContext } from "./shapes.js";

export async function renderGroup(ctx: CanvasRenderingContext2D, el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>, renderCtx: RenderContext): Promise<void> {
  const w = Number(el.getAttribute("width") ?? ctx.canvas.width), h = Number(el.getAttribute("height") ?? ctx.canvas.height);
  const children = async (target: CanvasRenderingContext2D) => {
    if (hasMasking(el)) await renderWithMasking(target, el, w, h, renderChild, renderCtx);
    else for (const child of el.children) await renderChild(target, child, renderCtx);
  };
  await children(ctx);
}
