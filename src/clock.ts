import { applyGeometry, number } from "./attributes.js";
import { getOrDecodeImage } from "./images.js";
import { compositeLayer } from "./compositing.js";
import type { RenderContext } from "./shapes.js";

type RenderChild = (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>;

export function secondHandAngle(el: Element, second: number, millisecond: number, ambient: boolean): number {
  const sweep = el.querySelector(":scope > Sweep"), tick = el.querySelector(":scope > Tick");
  const fraction = millisecond / 1000;
  if (!ambient && sweep) {
    const frequency = sweep.getAttribute("frequency") === "SYNC_TO_DEVICE" ? 1000 : number(sweep, "frequency", 15);
    return (second + Math.floor(fraction * frequency) / frequency) * 6;
  }
  if (!ambient && tick) {
    const t = Math.min(1, fraction / Math.max(.001, number(tick, "duration", .2)));
    const strength = number(tick, "strength", 1), p = t - 1;
    return (second + (1 + strength * 1.70158) * p * p * p + strength * 1.70158 * p * p) * 6;
  }
  return second * 6;
}

export async function renderAnalogClock(ctx: CanvasRenderingContext2D, el: Element, renderChild: RenderChild, renderCtx: RenderContext): Promise<void> {
  for (const child of el.children) {
    const tag = child.tagName;
    if (["HourHand", "MinuteHand", "SecondHand"].includes(tag)) {
      const local = renderCtx.contexts?.get(child) ?? renderCtx.expressionCtx;
      const sources = local.sources;
      const hour = Number(sources.HOUR_0_23 ?? 0), minute = Number(sources.MINUTE ?? 0), second = Number(sources.SECOND ?? 0);
      const angle = tag === "HourHand" ? ((hour % 12) + minute / 60) * 30 : tag === "MinuteHand" ? (minute + second / 60) * 6 : secondHandAngle(child, second, Number(sources.MILLISECOND ?? 0), renderCtx.ambient);
      await renderHand(ctx, child, angle, renderChild, { ...renderCtx, expressionCtx: local });
    } else await renderChild(ctx, child, renderCtx);
  }
}

async function renderHand(ctx: CanvasRenderingContext2D, el: Element, angle: number, renderChild: RenderChild, renderCtx: RenderContext): Promise<void> {
  if (number(el, "alpha", 255) <= 0) return;
  const w = number(el, "width"), h = number(el, "height");
  ctx.save();
  try {
    applyGeometry(ctx, el);
    const px = number(el, "pivotX", .5) * w, py = number(el, "pivotY", .5) * h;
    ctx.translate(px, py); ctx.rotate(angle * Math.PI / 180); ctx.translate(-px, -py);
    const draw = async (target: CanvasRenderingContext2D, local: RenderContext) => {
      const resource = el.getAttribute("resource");
      if (resource) { const bitmap = await getOrDecodeImage(resource, local.assets); if (bitmap) target.drawImage(bitmap, 0, 0, w, h); }
      for (const child of el.children) await renderChild(target, child, local);
    };
    const tint = el.getAttribute("tintColor");
    if (tint && w > 0 && h > 0) {
      const layer = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      const basis = renderCtx.basis ? renderCtx.basis.multiply(ctx.getTransform()) : ctx.getTransform();
      await draw(layer.getContext("2d")! as unknown as CanvasRenderingContext2D, { ...renderCtx, basis });
      compositeLayer(ctx, layer, tint, null);
    } else await draw(ctx, renderCtx);
  } finally { ctx.restore(); }
}
