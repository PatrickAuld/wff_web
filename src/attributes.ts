import { applyTransforms, transition, type Transition } from "./animation.js";
import { evaluateExpression, type ExpressionContext } from "./expressions.js";

export function number(el: Element, name: string, fallback = 0): number {
  const value = Number(el.getAttribute(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function boolean(value: string | null | undefined): boolean {
  return value?.toUpperCase() === "TRUE" || value === "1";
}

export function resolveValue(value: string, ctx: ExpressionContext): string | number {
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return value;
  if (value.includes("[") || /\w+\(/.test(value)) {
    try { return evaluateExpression(value, ctx); }
    catch { return value.replace(/\[([^\]]+)\]/g, (_, name) => String(ctx.sources[name] ?? "")); }
  }
  return ctx.strings?.[value.replace(/^@string\//, "")] ?? value;
}

export function applyAttributes(el: Element, ctx: ExpressionContext, ambient: boolean, elapsed: number, states: Map<string, Transition>, key: string, ambientTransitionDurationMs = 1000): void {
  applyTransforms(el, ctx, elapsed, states, key);
  for (const variant of Array.from(el.children).filter(c => c.tagName === "Variant")) {
    if (variant.getAttribute("mode") !== "AMBIENT") continue;
    const target = variant.getAttribute("target");
    if (!target) continue;
    const animation = variant.querySelector(":scope > Animation");
    const value = ambient ? resolveValue(variant.getAttribute("value") ?? "0", ctx) : resolveValue(el.getAttribute(target) ?? "0", ctx);
    const duration = Math.max(0, Math.min(1, number(variant, "duration", 1)));
    let offset = Math.max(0, Math.min(1, number(variant, "startOffset")));
    if (duration + offset > 1) offset = 0;
    el.setAttribute(target, String(transition(value, animation ?? variant, elapsed, states, `${key}.variant.${target}`,
      animation ? undefined : { durationMs: duration * ambientTransitionDurationMs, delayMs: offset * ambientTransitionDurationMs })));
  }
  for (const attr of Array.from(el.attributes)) {
    if (["expression", "value", "source", "format", "stringId"].includes(attr.name)) continue;
    if (attr.value.includes("[")) el.setAttribute(attr.name, String(resolveValue(attr.value, ctx)));
  }
  const gyro = el.querySelector(":scope > Gyro");
  if (gyro && !ambient) for (const attr of Array.from(gyro.attributes)) {
    const value = Number(evaluateExpression(attr.value, ctx));
    if (attr.name === "x" || attr.name === "y" || attr.name === "angle") el.setAttribute(attr.name, String(number(el, attr.name) + value));
    else if (attr.name === "scaleX" || attr.name === "scaleY") el.setAttribute(attr.name, String(number(el, attr.name, 1) * value));
    else if (attr.name === "alpha") el.setAttribute("alpha", String(number(el, "alpha", 255) * value / 255));
  }
}

export function applyGeometry(ctx: CanvasRenderingContext2D, el: Element): void {
  const w = number(el, "width"), h = number(el, "height");
  const px = number(el, "pivotX", .5) * w, py = number(el, "pivotY", .5) * h;
  ctx.translate(number(el, "x"), number(el, "y"));
  ctx.translate(px, py);
  ctx.rotate(number(el, "angle") * Math.PI / 180);
  ctx.scale(number(el, "scaleX", 1), number(el, "scaleY", 1));
  ctx.translate(-px, -py);
  ctx.globalAlpha *= Math.max(0, Math.min(255, number(el, "alpha", 255))) / 255;
}
