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

  ctx.strokeStyle = createGradient(ctx, strokeEl) ?? parseColor(strokeEl.getAttribute("color"));
  ctx.lineWidth = parseFloat(strokeEl.getAttribute("thickness") ?? "1");

  const cap = strokeEl.getAttribute("cap");
  if (cap === "ROUND") ctx.lineCap = "round";
  else if (cap === "SQUARE") ctx.lineCap = "square";
  else ctx.lineCap = "butt";
  ctx.lineJoin = strokeJoin(strokeEl);

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
  el: Element,
  positionScale = 1
): CanvasGradient {
  const colorsAttr = el.getAttribute("colors") ?? "";
  const positionsAttr = el.getAttribute("positions") ?? "";
  const colors = colorsAttr.split(/\s+/).filter(Boolean);
  const positions = positionsAttr.split(/\s+/).filter(Boolean).map(Number);
  const clampedScale = clampStop(positionScale);
  let lastStop = 0;

  for (let i = 0; i < colors.length; i++) {
    const basePos = i < positions.length
      ? positions[i]
      : colors.length <= 1 ? 0 : i / (colors.length - 1);
    const pos = clampStop(basePos * clampedScale);
    lastStop = pos;
    gradient.addColorStop(pos, parseColor(colors[i]));
  }

  if (colors.length > 0 && clampedScale < 1 && lastStop < 1) {
    gradient.addColorStop(1, parseColor(colors.at(-1)));
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
  const endAngle = parseFloat(el.getAttribute("endAngle") ?? "360");
  // WFF: 0 = 12 o'clock. Conic gradient: 0 = 3 o'clock. Offset by -90 degrees.
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const sweepFraction = getSweepFraction(startAngle, endAngle);
  return addColorStops(
    ctx.createConicGradient(startRad, cx, cy),
    el,
    sweepFraction
  );
}

function getSweepFraction(startAngle: number, endAngle: number): number {
  const rawSweep = endAngle - startAngle;
  if (!Number.isFinite(rawSweep) || Math.abs(rawSweep) >= 360) {
    return 1;
  }

  const normalizedSweep = ((rawSweep % 360) + 360) % 360;
  return normalizedSweep === 0 ? 1 : normalizedSweep / 360;
}

function clampStop(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function renderWeightedStroke(ctx: CanvasRenderingContext2D, el: Element): boolean {
  const stroke = el.querySelector(":scope > WeightedStroke");
  if (!stroke) return false;
  const colors = (stroke.getAttribute("colors") ?? "").trim().split(/\s+/).filter(Boolean);
  const interpolate = stroke.getAttribute("interpolate")?.toUpperCase() === "TRUE";
  const weights = stroke.hasAttribute("weights") ? stroke.getAttribute("weights")!.trim().split(/\s+/).map(Number) : colors.slice(0, interpolate ? Math.max(1, colors.length - 1) : colors.length).map(() => 1);
  if (!(colors.length === weights.length || (interpolate && colors.length === weights.length + 1)) || weights.some(w => w < 0 || !Number.isFinite(w))) throw new Error("WeightedStroke colors and weights must match");
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return true;
  const n = (name: string, fallback = 0) => Number(el.getAttribute(name) ?? fallback);
  const gap = Number(stroke.getAttribute("discreteGap") ?? 0);
  const line = el.tagName === "Line";
  const sx = n("startX"), sy = n("startY"), dx = n("endX") - sx, dy = n("endY") - sy;
  if (line && dx !== 0 && dy !== 0) throw new Error("WeightedStroke Line must be horizontal or vertical");
  ctx.save();
  ctx.lineWidth = Number(stroke.getAttribute("thickness") ?? 1);
  ctx.lineCap = (stroke.getAttribute("cap") ?? "BUTT").toLowerCase() as CanvasLineCap;
  ctx.lineJoin = strokeJoin(stroke);
  ctx.setLineDash([]);

  const direction = el.getAttribute("direction") === "COUNTER_CLOCKWISE" ? -1 : 1;
  const start = n("startAngle"), end = n("endAngle", 360);
  const raw = (end - start) * direction;
  const length = line ? Math.hypot(dx, dy) : Math.abs(raw) >= 360 ? 360 : ((raw % 360) + 360) % 360;
  const usable = Math.max(0, length - gap * (weights.length - 1));
  let position = 0;
  for (let i = 0; i < weights.length; i++) {
    const segment = usable * weights[i] / total;
    ctx.beginPath();
    if (line) {
      const t0 = length ? position / length : 0, t1 = length ? (position + segment) / length : 0;
      ctx.moveTo(sx + dx * t0, sy + dy * t0); ctx.lineTo(sx + dx * t1, sy + dy * t1);
      if (interpolate && i + 1 < colors.length) {
        const gradient = ctx.createLinearGradient(sx + dx * t0, sy + dy * t0, sx + dx * t1, sy + dy * t1);
        gradient.addColorStop(0, parseColor(colors[i])); gradient.addColorStop(1, parseColor(colors[i + 1])); ctx.strokeStyle = gradient;
      } else ctx.strokeStyle = parseColor(colors[i]);
    } else {
      const a = (start + direction * position - 90) * Math.PI / 180, b = (start + direction * (position + segment) - 90) * Math.PI / 180;
      ctx.ellipse(n("centerX"), n("centerY"), n("width") / 2, n("height") / 2, 0, a, b, direction < 0);
      ctx.strokeStyle = parseColor(colors[i]);
      if (interpolate && i + 1 < colors.length) {
        const gradient = ctx.createConicGradient(direction > 0 ? a : b, n("centerX"), n("centerY"));
        gradient.addColorStop(0, parseColor(colors[direction > 0 ? i : i + 1]));
        gradient.addColorStop(segment / 360, parseColor(colors[direction > 0 ? i + 1 : i])); ctx.strokeStyle = gradient;
      }
    }
    if (segment > 0) ctx.stroke();
    position += segment + gap;
  }
  ctx.restore();
  return true;
}

function strokeJoin(el: Element): CanvasLineJoin {
  const join = el.getAttribute("join");
  return join === "ROUND" ? "round" : join === "BEVEL" ? "bevel" : "miter";
}
