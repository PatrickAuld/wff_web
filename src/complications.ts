import type { ExpressionContext } from "./expressions.js";

export type ComplicationType = "SHORT_TEXT" | "LONG_TEXT" | "MONOCHROMATIC_IMAGE" | "SMALL_IMAGE" | "PHOTO_IMAGE" | "RANGED_VALUE" | "GOAL_PROGRESS" | "WEIGHTED_ELEMENTS" | "EMPTY";
export interface ComplicationData {
  type: ComplicationType;
  data?: Record<string, string | number | boolean>;
}
export interface ComplicationPreview {
  activeSlotIds: Set<number>;
  data: Record<number, ComplicationData>;
}
export function selectedComplication(slot: Element, preview?: ComplicationPreview): ComplicationData | undefined {
  const id = Number(slot.getAttribute("slotId"));
  if (!preview?.activeSlotIds.has(id)) return;
  const data = preview.data[id];
  if (!data) return;
  const supported = slot.getAttribute("supportedTypes")?.trim().split(/\s+/);
  if (supported && !supported.includes(data.type)) throw new Error(`Unsupported complication type ${data.type} for slot ${id}`);
  return data;
}
export function complicationContext(ctx: ExpressionContext, data: ComplicationData): ExpressionContext {
  const sources = { ...ctx.sources };
  for (const key of Object.keys(sources)) if (key.startsWith("COMPLICATION.")) delete sources[key];
  for (const [key, value] of Object.entries(data.data ?? {})) sources[key.startsWith("COMPLICATION.") ? key : `COMPLICATION.${key}`] = typeof value === "boolean" ? Number(value) : value;
  return { ...ctx, sources };
}
