import { parseColor } from "./color.js";
import { applyVariants } from "./variants.js";
import type { RenderContext } from "./shapes.js";
import type { ExpressionContext } from "./expressions.js";

// ---------------------------------------------------------------------------
// Font helpers
// ---------------------------------------------------------------------------

const WEIGHT_MAP: Record<string, number> = {
  THIN: 100,
  EXTRA_LIGHT: 200,
  LIGHT: 300,
  NORMAL: 400,
  MEDIUM: 500,
  SEMI_BOLD: 600,
  BOLD: 700,
  EXTRA_BOLD: 800,
  BLACK: 900,
};

interface FontSpec {
  style: string;
  weight: number;
  size: number;
  family: string;
  color: string;
  letterSpacing: number;
  underline: boolean;
  strikeThrough: boolean;
}

function parseFontElement(fontEl: Element | null): FontSpec {
  const family = fontEl?.getAttribute("family") ?? "sans-serif";
  const size = parseFloat(fontEl?.getAttribute("size") ?? "16");
  const color = parseColor(fontEl?.getAttribute("color") ?? "#FFFFFF");
  const weightStr = fontEl?.getAttribute("weight") ?? "NORMAL";
  const weight = WEIGHT_MAP[weightStr] ?? 400;
  const slant = fontEl?.getAttribute("slant");
  const style = slant === "ITALIC" ? "italic" : "normal";
  const letterSpacingAttr = fontEl?.getAttribute("letterSpacing");
  const letterSpacing = letterSpacingAttr ? parseFloat(letterSpacingAttr) : 0;

  const underline = fontEl?.querySelector(":scope > Underline") != null;
  const strikeThrough = fontEl?.querySelector(":scope > StrikeThrough") != null;

  // Resolve SYNC_TO_DEVICE family to a safe default
  const resolvedFamily = family === "SYNC_TO_DEVICE" ? "sans-serif" : family;

  return { style, weight, size, family: resolvedFamily, color, letterSpacing, underline, strikeThrough };
}

function applyFont(ctx: CanvasRenderingContext2D, spec: FontSpec): void {
  ctx.font = `${spec.style} ${spec.weight} ${spec.size}px ${spec.family}`;
  ctx.fillStyle = spec.color;
  if (spec.letterSpacing !== 0) {
    const spacingPx = spec.letterSpacing * spec.size;
    (ctx as any).letterSpacing = `${spacingPx}px`;
  } else {
    (ctx as any).letterSpacing = "0px";
  }
}

// ---------------------------------------------------------------------------
// Text content resolution (expression refs)
// ---------------------------------------------------------------------------

function resolveTextContent(raw: string, expressionCtx: ExpressionContext): string {
  // Replace [SOURCE_NAME] refs with their value from sources
  return raw.replace(/\[([^\]]+)\]/g, (_match, name) => {
    const val = expressionCtx.sources[name];
    return val !== undefined ? String(val) : "";
  });
}

// ---------------------------------------------------------------------------
// Text alignment
// ---------------------------------------------------------------------------

function resolveTextAlign(align: string | null): CanvasTextAlign {
  switch (align) {
    case "START": return "left";
    case "CENTER": return "center";
    case "END": return "right";
    default: return "left";
  }
}

// ---------------------------------------------------------------------------
// Ellipsis truncation
// ---------------------------------------------------------------------------

function truncateWithEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "\u2026";
  let result = text;
  while (result.length > 0 && ctx.measureText(result + ellipsis).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + ellipsis;
}

// ---------------------------------------------------------------------------
// Decoration lines (underline / strikethrough)
// ---------------------------------------------------------------------------

function drawDecorations(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spec: FontSpec,
  align: CanvasTextAlign
): void {
  if (!spec.underline && !spec.strikeThrough) return;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;

  let lineX: number;
  switch (align) {
    case "center": lineX = x - textWidth / 2; break;
    case "right": lineX = x - textWidth; break;
    default: lineX = x;
  }

  ctx.save();
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = Math.max(1, spec.size / 14);

  if (spec.underline) {
    const underlineY = y + spec.size * 0.15;
    ctx.beginPath();
    ctx.moveTo(lineX, underlineY);
    ctx.lineTo(lineX + textWidth, underlineY);
    ctx.stroke();
  }

  if (spec.strikeThrough) {
    const strikeY = y - spec.size * 0.25;
    ctx.beginPath();
    ctx.moveTo(lineX, strikeY);
    ctx.lineTo(lineX + textWidth, strikeY);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// PartText container
// ---------------------------------------------------------------------------

export function renderPartText(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderCtx: RenderContext
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  const textEl = el.querySelector(":scope > Text");
  if (!textEl) return;

  ctx.save();
  ctx.translate(x, y);

  renderTextElement(ctx, textEl, w, h, renderCtx);

  ctx.restore();
}

function renderTextElement(
  ctx: CanvasRenderingContext2D,
  textEl: Element,
  containerWidth: number,
  containerHeight: number,
  renderCtx: RenderContext
): void {
  const fontEl = textEl.querySelector(":scope > Font");
  const spec = parseFontElement(fontEl);

  const align = textEl.getAttribute("align") ?? "START";
  const ellipsis = textEl.getAttribute("ellipsis") === "true";

  // Get raw text content (text nodes only, not child elements)
  let rawText = "";
  for (const node of textEl.childNodes) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      rawText += node.textContent ?? "";
    }
  }
  rawText = rawText.trim();

  // Resolve expression refs
  const resolvedText = resolveTextContent(rawText, renderCtx.expressionCtx);

  applyFont(ctx, spec);
  const textAlign = resolveTextAlign(align);
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";

  let displayText = resolvedText;
  if (ellipsis && containerWidth > 0) {
    displayText = truncateWithEllipsis(ctx, displayText, containerWidth);
  }

  // Horizontal position based on alignment
  let textX: number;
  switch (textAlign) {
    case "center": textX = containerWidth / 2; break;
    case "right": textX = containerWidth; break;
    default: textX = 0;
  }
  const textY = containerHeight / 2;

  ctx.fillText(displayText, textX, textY);
  drawDecorations(ctx, displayText, textX, textY, spec, textAlign);
}

// ---------------------------------------------------------------------------
// TimeText format tokens
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimeText(format: string, date: Date, hourFormat: string): string {
  const is24 = hourFormat !== "12";

  const h24 = date.getHours();       // 0-23
  const h12Raw = h24 % 12;           // 0-11
  const h12 = h12Raw === 0 ? 12 : h12Raw; // 1-12
  const hDisplay24 = h24;
  const hDisplay12 = h12;
  const min = date.getMinutes();
  const sec = date.getSeconds();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const dayName = DAY_NAMES[date.getDay()];

  // Process tokens in order, longest first to avoid partial matches.
  // Use placeholder strategy to avoid double-replacement.
  // Tokens: hh, HH, h, H, mm, m, ss, s, a, EEE
  const tokens: Array<[string, string]> = [
    ["hh", String(hDisplay12).padStart(2, "0")],
    ["HH", String(hDisplay24).padStart(2, "0")],
    ["mm", String(min).padStart(2, "0")],
    ["ss", String(sec).padStart(2, "0")],
    ["EEE", dayName],
    ["h", String(hDisplay12)],
    ["H", String(hDisplay24)],
    ["m", String(min)],
    ["s", String(sec)],
    ["a", ampm],
  ];

  // If hourFormat is 12, h/hh tokens use 12h; H/HH tokens also honor the request
  // When hourFormat is "12", interpret H/HH as 12h as well (device-level intent).
  // The WFF spec says hourFormat controls h/H behavior.
  // We keep h=12h and H=24h regardless, as per spec literals.

  // Use index-based replacement to avoid conflicts
  let result = format;
  // Replace each token with a placeholder, then restore
  const replacements: string[] = [];
  for (const [token, value] of tokens) {
    const placeholder = `\x00${replacements.length}\x00`;
    replacements.push(value);
    result = result.split(token).join(placeholder);
  }
  // Restore placeholders
  for (let i = 0; i < replacements.length; i++) {
    result = result.split(`\x00${i}\x00`).join(replacements[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// DigitalClock container
// ---------------------------------------------------------------------------

export function renderDigitalClock(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderCtx: RenderContext
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  ctx.save();
  ctx.translate(x, y);

  for (const child of el.children) {
    if (child.tagName === "TimeText") {
      renderTimeText(ctx, child, w, h, renderCtx);
    }
  }

  ctx.restore();
}

function renderTimeText(
  ctx: CanvasRenderingContext2D,
  el: Element,
  parentWidth: number,
  parentHeight: number,
  renderCtx: RenderContext
): void {
  // Apply Variant overrides before reading any attributes (e.g. alpha changes
  // between interactive and ambient mode).
  applyVariants(el, renderCtx.ambient);

  const alpha = parseFloat(el.getAttribute("alpha") ?? "255");
  if (alpha <= 0) return; // Skip invisible TimeText (e.g. ambient-only layer in interactive mode)

  // TimeText's own position/size within the DigitalClock container
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0") || parentWidth;
  const h = parseFloat(el.getAttribute("height") ?? "0") || parentHeight;

  const format = el.getAttribute("format") ?? "HH:mm";
  const hourFormat = el.getAttribute("hourFormat") ?? "24";
  const align = el.getAttribute("align") ?? "START";

  // Reconstruct Date from UTC_TIMESTAMP in expression context
  const utcTimestamp = renderCtx.expressionCtx.sources["UTC_TIMESTAMP"];
  const date = typeof utcTimestamp === "number"
    ? new Date(utcTimestamp * 1000)
    : new Date();

  const formattedText = formatTimeText(format, date, hourFormat);

  const fontEl = el.querySelector(":scope > Font");
  const spec = parseFontElement(fontEl);

  // Allow size override from TimeText element itself
  const sizeAttr = el.getAttribute("size");
  if (sizeAttr) {
    spec.size = parseFloat(sizeAttr);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha / 255;

  applyFont(ctx, spec);
  const textAlign = resolveTextAlign(align);
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";

  let textX: number;
  switch (textAlign) {
    case "center": textX = w / 2; break;
    case "right": textX = w; break;
    default: textX = 0;
  }
  const textY = h / 2;

  ctx.fillText(formattedText, textX, textY);
  drawDecorations(ctx, formattedText, textX, textY, spec, textAlign);

  ctx.restore();
}
