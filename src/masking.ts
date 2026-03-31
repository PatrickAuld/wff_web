import type { RenderContext } from "./shapes.js";

const BLEND_MODE_MAP: Record<string, GlobalCompositeOperation> = {
  SRC_OVER: "source-over",
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
};

export function applyBlendMode(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const mode = el.getAttribute("blendMode");
  if (mode && BLEND_MODE_MAP[mode]) {
    ctx.globalCompositeOperation = BLEND_MODE_MAP[mode];
  }
}

export function hasMasking(el: Element): boolean {
  for (const child of el.children) {
    const rm = child.getAttribute("renderMode");
    if (rm === "SOURCE" || rm === "MASK") return true;
  }
  return false;
}

export async function renderWithMasking(
  ctx: CanvasRenderingContext2D,
  el: Element,
  width: number,
  height: number,
  renderChild: (
    ctx: CanvasRenderingContext2D,
    el: Element,
    renderCtx: RenderContext
  ) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  // Create offscreen canvas same size as the group
  const offscreen = new OffscreenCanvas(width, height);
  const offCtx = offscreen.getContext("2d")!;

  // Phase 1: Draw SOURCE children (and children with no renderMode, treated as SOURCE)
  for (const child of el.children) {
    const rm = child.getAttribute("renderMode");
    if (rm === "SOURCE" || !rm) {
      if (child.tagName !== "Variant") {
        await renderChild(
          offCtx as unknown as CanvasRenderingContext2D,
          child,
          renderCtx
        );
      }
    }
  }

  // Phase 2: Draw MASK children with destination-in compositing
  // This keeps only the pixels where the mask is drawn
  for (const child of el.children) {
    const rm = child.getAttribute("renderMode");
    if (rm === "MASK") {
      offCtx.globalCompositeOperation = "destination-in";
      await renderChild(
        offCtx as unknown as CanvasRenderingContext2D,
        child,
        renderCtx
      );
      offCtx.globalCompositeOperation = "source-over";
    }
  }

  // Phase 3: Draw ALL children normally on top of the masked result
  for (const child of el.children) {
    const rm = child.getAttribute("renderMode");
    if (rm === "ALL") {
      await renderChild(
        offCtx as unknown as CanvasRenderingContext2D,
        child,
        renderCtx
      );
    }
  }

  // Composite the offscreen result back to the main canvas
  ctx.drawImage(offscreen, 0, 0);
}
