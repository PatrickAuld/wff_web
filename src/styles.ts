import { parseColor } from "./color.js";

export function applyFill(ctx: CanvasRenderingContext2D, el: Element): void {
  const fillEl = el.querySelector(":scope > Fill");
  if (!fillEl) return;

  // Check for gradient children first
  const gradient = createGradient(ctx, fillEl);
  if (gradient) {
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = parseColor(fillEl.getAttribute("color"));
  }
  ctx.fill();
}

export function applyStroke(ctx: CanvasRenderingContext2D, el: Element): void {
  const strokeEl = el.querySelector(":scope > Stroke");
  if (!strokeEl) return;

  ctx.strokeStyle = parseColor(strokeEl.getAttribute("color"));
  ctx.lineWidth = parseFloat(strokeEl.getAttribute("thickness") ?? "1");

  const cap = strokeEl.getAttribute("cap");
  if (cap === "ROUND") ctx.lineCap = "round";
  else if (cap === "SQUARE") ctx.lineCap = "square";
  else ctx.lineCap = "butt";

  const dashAttr = strokeEl.getAttribute("dashIntervals");
  if (dashAttr) {
    ctx.setLineDash(dashAttr.split(/\s+/).map(Number));
  } else {
    ctx.setLineDash([]);
  }

  ctx.lineDashOffset = parseFloat(
    strokeEl.getAttribute("dashPhase") ?? "0"
  );

  ctx.stroke();
}

export function createGradient(
  ctx: CanvasRenderingContext2D,
  fillEl: Element
): CanvasGradient | null {
  const linear = fillEl.querySelector(":scope > LinearGradient");
  if (linear) {
    return createLinearGradient(ctx, linear);
  }

  const radial = fillEl.querySelector(":scope > RadialGradient");
  if (radial) {
    return createRadialGradient(ctx, radial);
  }

  const sweep = fillEl.querySelector(":scope > SweepGradient");
  if (sweep) {
    return createSweepGradient(ctx, sweep);
  }

  return null;
}

function addColorStops(
  gradient: CanvasGradient,
  el: Element
): CanvasGradient {
  const colorsAttr = el.getAttribute("colors") ?? "";
  const positionsAttr = el.getAttribute("positions") ?? "";
  const colors = colorsAttr.split(/\s+/).filter(Boolean);
  const positions = positionsAttr.split(/\s+/).filter(Boolean).map(Number);

  for (let i = 0; i < colors.length; i++) {
    const pos = i < positions.length ? positions[i] : i / (colors.length - 1);
    gradient.addColorStop(pos, parseColor(colors[i]));
  }
  return gradient;
}

function createLinearGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const x0 = parseFloat(el.getAttribute("startX") ?? "0");
  const y0 = parseFloat(el.getAttribute("startY") ?? "0");
  const x1 = parseFloat(el.getAttribute("endX") ?? "0");
  const y1 = parseFloat(el.getAttribute("endY") ?? "0");
  return addColorStops(ctx.createLinearGradient(x0, y0, x1, y1), el);
}

function createRadialGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const r = parseFloat(el.getAttribute("radius") ?? "0");
  return addColorStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, r), el);
}

function createSweepGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const startAngle = parseFloat(el.getAttribute("startAngle") ?? "0");
  // WFF: 0 = 12 o'clock. Conic gradient: 0 = 3 o'clock. Offset by -90 degrees.
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  return addColorStops(ctx.createConicGradient(startRad, cx, cy), el);
}
