import { applyFill, applyStroke } from "./styles.js";
import { renderGroup } from "./layout.js";

export function renderElement(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const tag = el.tagName;

  switch (tag) {
    case "Group":
    case "PartDraw":
      renderGroup(ctx, el);
      break;
    case "Arc":
      renderArc(ctx, el);
      break;
    case "Rectangle":
      renderRectangle(ctx, el);
      break;
    case "RoundRectangle":
      renderRoundRectangle(ctx, el);
      break;
    case "Ellipse":
      renderEllipse(ctx, el);
      break;
    case "Line":
      renderLine(ctx, el);
      break;
  }
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
