import type { RenderContext } from "./shapes.js";

export const BLEND_MODE_MAP: Record<string, GlobalCompositeOperation> = {
  CLEAR: "destination-out", SRC: "copy", DST: "destination-over",
  SRC_OVER: "source-over", DST_OVER: "destination-over", SRC_IN: "source-in", DST_IN: "destination-in",
  SRC_OUT: "source-out", DST_OUT: "destination-out", SRC_ATOP: "source-atop", DST_ATOP: "destination-atop",
  XOR: "xor", PLUS: "lighter", MODULATE: "multiply", MULTIPLY: "multiply", SCREEN: "screen", OVERLAY: "overlay",
  DARKEN: "darken", LIGHTEN: "lighten", COLOR_DODGE: "color-dodge", COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light", SOFT_LIGHT: "soft-light", DIFFERENCE: "difference", EXCLUSION: "exclusion",
  HUE: "hue", SATURATION: "saturation", COLOR: "color", LUMINOSITY: "luminosity",
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
    if (rm === "ALL" || rm === "MASK") return true;
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
  const source = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const mask = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const sourceCtx = source.getContext("2d")!, maskCtx = mask.getContext("2d")!;
  const basis = renderCtx.basis ? renderCtx.basis.multiply(ctx.getTransform()) : ctx.getTransform();
  const local = { ...renderCtx, basis };
  for (const child of el.children) {
    const mode = child.getAttribute("renderMode") ?? "SOURCE";
    if (mode === "SOURCE" || mode === "ALL") await renderChild(sourceCtx as unknown as CanvasRenderingContext2D, child, local);
    if (mode === "MASK" || mode === "ALL") await renderChild(maskCtx as unknown as CanvasRenderingContext2D, child, { ...local, register: undefined });
  }
  sourceCtx.globalCompositeOperation = "destination-in";
  sourceCtx.drawImage(mask, 0, 0);
  ctx.drawImage(source, 0, 0);
}
