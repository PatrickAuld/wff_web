import { applyFill, applyStroke, renderWeightedStroke } from "./styles.js";
import { renderGroup } from "./layout.js";
import { renderCondition } from "./conditions.js";
import { applyVariants } from "./variants.js";
import { applyBlendMode } from "./masking.js";
import { renderPartText, renderDigitalClock } from "./text.js";
import { renderPartImage } from "./images.js";
import { renderAnalogClock } from "./clock.js";
import { applyTransforms } from "./animation.js";
import { compositeLayer } from "./compositing.js";
import { applyGeometry } from "./attributes.js";
import type { ExpressionContext } from "./expressions.js";

/**
 * Resolve [SOURCE_NAME] expression references in Fill/Stroke color attributes.
 * Mutates the element's child Fill/Stroke attributes in place (safe within a
 * single render pass, consistent with how applyVariants/applyTransforms work).
 */
function resolveColorExprs(el: Element, expressionCtx: ExpressionContext): void {
  for (const child of el.children) {
    if (child.tagName !== "Fill" && child.tagName !== "Stroke") continue;
    const color = child.getAttribute("color");
    if (!color?.includes("[")) continue;
    const resolved = color.replace(/\[([^\]]+)\]/g, (_, name) => {
      const val = expressionCtx.sources[name];
      return val !== undefined ? String(val) : "#000000";
    });
    child.setAttribute("color", resolved);
  }
}

export interface RenderContext {
  expressionCtx: ExpressionContext;
  ambient: boolean;
  assets: Map<string, ArrayBuffer>;
  elapsedMs: number;
  frameId?: number;
  contexts?: WeakMap<Element, ExpressionContext>;
  events?: Map<string, number>;
  random?: () => number;
  photos?: Record<string, string[]>;
  imageStates?: Map<string, import("./images.js").ImageState>;
  basis?: DOMMatrix;
  register?: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => void;
}

export async function renderElement(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderCtx: RenderContext
): Promise<void> {
  const local = renderCtx.contexts?.get(el);
  if (local) renderCtx = { ...renderCtx, expressionCtx: local };
  if (!renderCtx.contexts) {
    applyVariants(el, renderCtx.ambient);
    applyTransforms(el, renderCtx.expressionCtx, renderCtx.elapsedMs);
    resolveColorExprs(el, renderCtx.expressionCtx);
  }
  if (Number(el.getAttribute("alpha") ?? 255) <= 0) return;
  const savedContext = ctx;
  ctx.save();
  try {
    const tag = el.tagName;
    const container = ["Group", "PartDraw", "Scene", "PartText", "PartImage", "PartAnimatedImage", "DigitalClock", "AnalogClock"].includes(tag);
    if (container) {
      applyGeometry(ctx, el);
      renderCtx.register?.(ctx, el, renderCtx);
    }
    applyBlendMode(ctx, el);
    const tint = el.getAttribute("tintColor"), blend = el.getAttribute("blendMode");
    const layered = container && (tint !== null || blend !== null);
    const destination = ctx;
    if (layered) {
      const w = Number(el.getAttribute("width") ?? ctx.canvas.width), h = Number(el.getAttribute("height") ?? ctx.canvas.height);
      if (w <= 0 || h <= 0) return;
      const layer = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      renderCtx = { ...renderCtx, basis: renderCtx.basis ? renderCtx.basis.multiply(ctx.getTransform()) : ctx.getTransform() };
      ctx = layer.getContext("2d")! as unknown as CanvasRenderingContext2D;
    }
    switch (tag) {
      case "Scene": case "Group": case "PartDraw": await renderGroup(ctx, el, renderElement, renderCtx); break;
      case "Condition": await renderCondition(ctx, el, renderElement, renderCtx); break;
      case "ListConfiguration": case "BooleanConfiguration":
        for (const option of el.children) for (const child of option.children) await renderElement(ctx, child, renderCtx);
        break;
      case "Arc": if (!renderWeightedStroke(ctx, el)) renderArc(ctx, el); break;
      case "Rectangle": renderRectangle(ctx, el); break;
      case "RoundRectangle": renderRoundRectangle(ctx, el); break;
      case "Ellipse": renderEllipse(ctx, el); break;
      case "Line": if (!renderWeightedStroke(ctx, el)) renderLine(ctx, el); break;
      case "PartText": await renderPartText(ctx, el, renderCtx); break;
      case "DigitalClock": await renderDigitalClock(ctx, el, renderCtx); break;
      case "PartImage": case "PartAnimatedImage": await renderPartImage(ctx, el, renderCtx, renderCtx.assets); break;
      case "AnalogClock": await renderAnalogClock(ctx, el, renderElement, renderCtx); break;
    }
    if (layered) compositeLayer(destination, ctx.canvas as unknown as OffscreenCanvas, tint, blend);
    ctx = destination;
  } finally { savedContext.restore(); }
}

function renderRectangle(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  ctx.beginPath();
  ctx.rect(x, y, w, h);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderRoundRectangle(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const rx = parseFloat(el.getAttribute("cornerRadiusX") ?? "0");
  const ry = parseFloat(el.getAttribute("cornerRadiusY") ?? rx.toString());

  ctx.beginPath();
  // DOMPointInit gives per-axis elliptical radii for each corner
  const radius = { x: rx, y: ry };
  ctx.roundRect(x, y, w, h, [radius, radius, radius, radius]);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderArc(ctx: CanvasRenderingContext2D, el: Element): void {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const startAngle = parseFloat(el.getAttribute("startAngle") ?? "0");
  const endAngle = parseFloat(el.getAttribute("endAngle") ?? "360");
  const direction = el.getAttribute("direction") ?? "CLOCKWISE";

  // WFF: 0 degrees = 12 o'clock (top). Canvas: 0 = 3 o'clock (right).
  // Offset by -90 degrees.
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const counterclockwise = direction === "COUNTER_CLOCKWISE";

  ctx.beginPath();
  if (w === h) {
    ctx.arc(cx, cy, w / 2, startRad, endRad, counterclockwise);
  } else {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, startRad, endRad, counterclockwise);
  }
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderEllipse(ctx: CanvasRenderingContext2D, el: Element): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderLine(ctx: CanvasRenderingContext2D, el: Element): void {
  const x1 = parseFloat(el.getAttribute("startX") ?? "0");
  const y1 = parseFloat(el.getAttribute("startY") ?? "0");
  const x2 = parseFloat(el.getAttribute("endX") ?? "0");
  const y2 = parseFloat(el.getAttribute("endY") ?? "0");

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  // Lines only support stroke, not fill
  applyStroke(ctx, el);
}
