import { parseColor } from "./color.js";
import { getOrDecodeImage, drawImage } from "./images.js";
import { boolean, number, resolveValue, applyGeometry } from "./attributes.js";
import { formatTime, formatTemplate } from "./format.js";
import type { RenderContext } from "./shapes.js";
import type { ExpressionContext } from "./expressions.js";

const WEIGHTS: Record<string, number> = { THIN: 100, ULTRA_LIGHT: 200, EXTRA_LIGHT: 200, LIGHT: 300, NORMAL: 400, MEDIUM: 500, SEMI_BOLD: 600, BOLD: 700, ULTRA_BOLD: 800, EXTRA_BOLD: 800, BLACK: 900, EXTRA_BLACK: 1000 };
const STRETCH: Record<string, string> = { ULTRA_CONDENSED: "ultra-condensed", EXTRA_CONDENSED: "extra-condensed", CONDENSED: "condensed", SEMI_CONDENSED: "semi-condensed", NORMAL: "normal", SEMI_EXPANDED: "semi-expanded", EXPANDED: "expanded", EXTRA_EXPANDED: "extra-expanded", ULTRA_EXPANDED: "ultra-expanded" };
interface FontSpec {
  family: string; stretch: string; size: number; color: string; weight: number; style: string; letterSpacing: number;
  underline?: boolean; strikeThrough?: boolean; outline?: Element; shadow?: Element; glow?: Element; bitmap?: Element; bitmapTint?: string;
}
interface Run { text?: string; image?: Element; spec: FontSpec }
interface Glyph { text: string; width: number; height: number; run: Run; image?: Element }
const loadedFonts = new WeakMap<ArrayBuffer, Map<string, Promise<void>>>();

export async function loadFonts(doc: Document, assets: Map<string, ArrayBuffer>): Promise<void> {
  if (typeof FontFace === "undefined") return;
  const find = (name: string) => assets.get(name) ?? ["ttf", "otf", "ttc", "xml"].map(ext => assets.get(`${name}.${ext}`) ?? assets.get(`font/${name}.${ext}`) ?? assets.get(`res/font/${name}.${ext}`)).find(Boolean);
  async function load(family: string, resource: string, weight: string, style: string, stretch: string, visiting: Set<string>): Promise<void> {
    if (visiting.has(resource)) throw new Error(`Cyclic font family: ${resource}`);
    const buffer = find(resource); if (!buffer) return;
    if (new TextDecoder().decode(buffer.slice(0, 100)).trimStart().startsWith("<")) {
      const parsed = new DOMParser().parseFromString(new TextDecoder().decode(buffer), "text/xml");
      for (const font of parsed.querySelectorAll("font")) {
        const reference = font.getAttribute("font") ?? font.getAttribute("android:font");
        if (reference) await load(family, reference.replace(/^@font\//, ""), font.getAttribute("fontWeight") ?? font.getAttribute("android:fontWeight") ?? weight,
          font.getAttribute("fontStyle") ?? font.getAttribute("android:fontStyle") ?? style, stretch, new Set([...visiting, resource]));
      }
      return;
    }
    let cache = loadedFonts.get(buffer); if (!cache) { cache = new Map(); loadedFonts.set(buffer, cache); }
    const key = `${family}:${weight}:${style}:${stretch}`;
    let promise = cache.get(key);
    if (!promise) {
      promise = new FontFace(family, buffer, { weight, style, stretch }).load().then(face => { document.fonts.add(face); });
      cache.set(key, promise);
    }
    try { await promise; } catch { cache.delete(key); }
  }
  for (const font of doc.querySelectorAll("Font[family]")) {
    const family = font.getAttribute("family")!;
    await load(family, family, String(WEIGHTS[font.getAttribute("weight") ?? "NORMAL"] ?? 400), font.getAttribute("slant") === "ITALIC" ? "italic" : "normal", STRETCH[font.getAttribute("width") ?? "NORMAL"], new Set());
  }
}

function parseFont(el: Element | null, parent?: FontSpec): FontSpec {
  const family = el?.getAttribute("family") ?? parent?.family ?? "sans-serif";
  return { ...parent,
    family: family === "SYNC_TO_DEVICE" ? "sans-serif" : family,
    stretch: STRETCH[el?.getAttribute("width") ?? ""] ?? parent?.stretch ?? "normal",
    size: el ? number(el, "size", parent?.size ?? 16) : 16,
    color: el?.getAttribute("color") ?? parent?.color ?? "#FFFFFF",
    weight: WEIGHTS[el?.getAttribute("weight") ?? ""] ?? parent?.weight ?? 400,
    style: el?.getAttribute("slant") === "ITALIC" ? "italic" : parent?.style ?? "normal",
    letterSpacing: el ? number(el, "letterSpacing", parent?.letterSpacing ?? 0) : 0,
    underline: parent?.underline || Boolean(el?.querySelector(":scope > Underline")),
    strikeThrough: parent?.strikeThrough || Boolean(el?.querySelector(":scope > StrikeThrough")),
  };
}
function applyFont(ctx: CanvasRenderingContext2D, spec: FontSpec, scale: number): void {
  ctx.font = `${spec.style} ${spec.weight} ${spec.size * scale}px "${spec.family}"`;
  ctx.fontStretch = spec.stretch as CanvasFontStretch;
  ctx.fillStyle = parseColor(spec.color);
  ctx.letterSpacing = `${spec.letterSpacing * spec.size * scale}px`;
}
function expression(el: Element, ctx: ExpressionContext): string | number {
  return resolveValue(el.getAttribute("expression") ?? "", ctx);
}
export function template(el: Element, ctx: ExpressionContext): string {
  const raw = Array.from(el.childNodes).filter(n => n.nodeType === 3 || n.nodeType === 4).map(n => n.textContent).join("").trim();
  return formatTemplate(String(resolveValue(raw || el.getAttribute("stringId") || "", ctx)), Array.from(el.children).filter(c => c.tagName === "Parameter").map(c => expression(c, ctx)), ctx);
}
function collectRuns(el: Element, renderCtx: RenderContext, inherited = parseFont(null), transform: (s: string) => string = s => s): Run[] {
  const ctx = renderCtx.contexts?.get(el) ?? renderCtx.expressionCtx;
  let spec = inherited;
  if (el.tagName === "Font" || el.tagName === "BitmapFont") {
    spec = parseFont(el, inherited);
    if (el.tagName === "BitmapFont") { spec.bitmapTint = el.getAttribute("color") ?? undefined; spec.bitmap = Array.from(el.ownerDocument.querySelectorAll("BitmapFonts > BitmapFont")).find(f => f.getAttribute("name") === spec.family); }
  }
  else if (el.tagName === "Underline") spec = { ...spec, underline: true };
  else if (el.tagName === "StrikeThrough") spec = { ...spec, strikeThrough: true };
  else if (el.tagName === "Outline") spec = { ...spec, outline: el };
  else if (el.tagName === "Shadow") spec = { ...spec, shadow: el };
  else if (el.tagName === "OutGlow" || el.tagName === "Glow") spec = { ...spec, glow: el };
  if (el.tagName === "Upper" || el.tagName === "Lower") {
    const previous = transform;
    transform = s => previous(el.tagName === "Upper" ? s.toLocaleUpperCase(ctx.locale) : s.toLocaleLowerCase(ctx.locale));
  }
  if (el.tagName === "Template") return [{ text: transform(template(el, ctx)), spec }];
  if (el.tagName === "InlineImage") return [{ image: el, spec }];
  const runs: Run[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3 || node.nodeType === 4) {
      const raw = node.textContent ?? "";
      if (/^\s*[\r\n]\s*$/.test(raw)) continue;
      const text = raw.replace(/^[ \t]*\n[ \t]+|[ \t]+\n[ \t]*$/g, "").replace(/\[([^\]]+)\]/g, (_, name) => String(ctx.sources[name] ?? ""));
      if (text) runs.push({ text: transform(text), spec });
    } else if (node.nodeType === 1 && !["Transform", "Variant", "Reference", "Parameter", "Localization"].includes((node as Element).tagName)) {
      runs.push(...collectRuns(node as Element, renderCtx, spec, transform));
    }
  }
  // Accept the old sibling <Font/> + raw text syntax as well.
  if (["Text", "TextCircular"].includes(el.tagName)) {
    const font = el.querySelector(":scope > Font");
    if (font && !font.textContent?.trim()) for (const run of runs) if (run.spec === inherited) run.spec = parseFont(font);
  }
  return runs;
}

function glyphs(ctx: CanvasRenderingContext2D, runs: Run[], scale: number): Glyph[] {
  const result: Glyph[] = [];
  for (const run of runs) {
    applyFont(ctx, run.spec, scale);
    if (run.image) {
      const width = number(run.image, "width") - number(run.image, "overlapLeft") - number(run.image, "overlapRight");
      result.push({ run, image: run.image, text: "", width: width * scale, height: number(run.image, "height") * scale });
      continue;
    }
    const mappings = Array.from(run.spec.bitmap?.children ?? []).sort((a, b) => (b.getAttribute("name")?.length ?? 0) - (a.getAttribute("name")?.length ?? 0));
    let text = run.text ?? "", prefix = "";
    while (text.length) {
      const mapping = mappings.find(m => text.startsWith(m.getAttribute("name") ?? "\0"));
      const char = mapping?.getAttribute("name") ?? Array.from(new Intl.Segmenter().segment(text))[0].segment;
      const size = run.spec.size * scale;
      if (mapping) result.push({ run, image: mapping, text: char, width: number(mapping, "width") * size / number(mapping, "height", 1), height: size });
      else {
        const width = char === "\n" ? 0 : ctx.measureText(prefix + char).width - ctx.measureText(prefix).width;
        result.push({ run, text: char, width, height: size * 1.2 });
      }
      prefix = char === "\n" ? "" : prefix + char;
      text = text.slice(char.length);
    }
  }
  return result;
}
function layout(units: Glyph[], width: number): Glyph[][] {
  const lines: Glyph[][] = [[]];
  let lineWidth = 0;
  for (const glyph of units) {
    if (glyph.text === "\n") { lines.push([]); lineWidth = 0; continue; }
    let line = lines.at(-1)!;
    if (line.length && lineWidth + glyph.width > width) {
      const space = line.map(u => u.text).lastIndexOf(" ");
      if (space > 0) { const tail = line.splice(space); tail.shift(); lines.push(tail); lineWidth = tail.reduce((a, g) => a + g.width, 0); }
      else { lines.push([]); lineWidth = 0; }
      line = lines.at(-1)!;
      if (glyph.text === " " && !line.length) continue;
    }
    line.push(glyph); lineWidth += glyph.width;
  }
  return lines;
}

async function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, scale: number, renderCtx: RenderContext): Promise<void> {
  const spec = glyph.run.spec;
  ctx.save();
  try { applyFont(ctx, spec, scale); ctx.textAlign = "left"; ctx.textBaseline = "middle";
  if (glyph.image) {
    const image = glyph.image;
    const source = image.getAttribute("source");
    const resource = source ? String(resolveValue(source, renderCtx.expressionCtx)) : image.getAttribute("resource") ?? "";
    const bitmap = await getOrDecodeImage(resource, renderCtx.assets);
    const width = image.tagName === "InlineImage" ? number(image, "width") * scale : glyph.width;
    if (bitmap) drawImage(ctx, bitmap, x - number(image, "overlapLeft") * scale, y - glyph.height / 2, width, glyph.height, image.getAttribute("color") ?? (spec.bitmap ? spec.bitmapTint ?? null : null));
  } else {
    const shadow = spec.shadow ?? spec.glow;
    if (shadow) { ctx.shadowColor = parseColor(shadow.getAttribute("color")); ctx.shadowBlur = number(shadow, "radius", spec.glow ? 8 : 2) * scale; ctx.shadowOffsetX = spec.shadow ? number(shadow, "offsetX", 2) * scale : 0; ctx.shadowOffsetY = spec.shadow ? number(shadow, "offsetY", 2) * scale : 0; }
    if (spec.outline) { ctx.strokeStyle = parseColor(spec.outline.getAttribute("color")); ctx.lineWidth = 2 * number(spec.outline, "width", 2) * scale; ctx.strokeText(glyph.text, x, y); }
    ctx.fillText(glyph.text, x, y);
    if (spec.underline || spec.strikeThrough) {
      ctx.shadowColor = "transparent"; ctx.strokeStyle = parseColor(spec.color); ctx.lineWidth = Math.max(1, spec.size * scale / 14);
      for (const offset of [spec.underline ? spec.size * .42 : undefined, spec.strikeThrough ? 0 : undefined]) if (offset !== undefined) {
        ctx.beginPath(); ctx.moveTo(x, y + offset * scale); ctx.lineTo(x + glyph.width, y + offset * scale); ctx.stroke();
      }
    }
  }
  } finally { ctx.restore(); }
}
function merged(line: Glyph[]): Glyph[] {
  const result: Glyph[] = [];
  for (const glyph of line) {
    const last = result.at(-1);
    if (last && !last.image && !glyph.image && last.run === glyph.run) { last.text += glyph.text; last.width += glyph.width; }
    else result.push({ ...glyph });
  }
  return result;
}

export async function renderPartText(ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext): Promise<void> {
  const text = el.querySelector(":scope > Text, :scope > TextCircular");
  if (!text) return;
  const runs = collectRuns(text, renderCtx);
  await renderRuns(ctx, text, runs, number(el, "width"), number(el, "height"), renderCtx);
}
async function renderRuns(ctx: CanvasRenderingContext2D, el: Element, runs: Run[], width: number, height: number, renderCtx: RenderContext): Promise<void> {
  if (!runs.length) return;
  const circular = el.tagName === "TextCircular";
  const cw = el.getAttribute("direction") !== "COUNTER_CLOCKWISE", sign = cw ? 1 : -1;
  const rx = number(el, "width", width) / 2, ry = number(el, "height", height) / 2;
  const start = number(el, "startAngle"), raw = (number(el, "endAngle", 360) - start) * sign;
  const sweep = Math.abs(raw) >= 360 ? 360 : ((raw % 360) + 360) % 360;
  const arcLength = sweep / 360 * Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const available = circular ? arcLength : width;
  let scale = 1, units = glyphs(ctx, runs, scale);
  const maxLines = number(el, "maxLines", 1);
  const fit = () => { const lines = circular ? [units] : maxLines === 1 ? layout(units, Infinity) : layout(units, available); return { lines, height: lines.reduce((sum, line) => sum + Math.max(0, ...line.map(u => u.height)), 0) }; };
  let result = fit();
  if (boolean(el.getAttribute("isAutoSize"))) {
    const minimum = Math.min(1, Math.max(...runs.map(r => 12 / r.spec.size)));
    while (scale > minimum && (result.lines.some(l => l.reduce((a, g) => a + g.width, 0) > available) || (!circular && (result.height > height || (maxLines > 0 && result.lines.length > maxLines))))) {
      scale = Math.max(minimum, scale - .02); units = glyphs(ctx, runs, scale); result = fit();
    }
  }
  let lines = result.lines;
  const visibleLines = maxLines > 0 ? maxLines : Math.max(1, Math.floor(height / Math.max(1, ...units.map(u => u.height))));
  const truncated = lines.length > visibleLines;
  if (!circular) lines = lines.slice(0, visibleLines);
  if (boolean(el.getAttribute("ellipsis"))) {
    const last = lines.at(-1)!;
    const overflow = truncated || last.reduce((a, g) => a + g.width, 0) > available;
    if (overflow) {
      const run = last.at(-1)?.run ?? runs[0]; const ellipsis = glyphs(ctx, [{ ...run, text: "…" }], scale)[0];
      while (last.length && last.reduce((a, g) => a + g.width, 0) + ellipsis.width > available) last.pop();
      if (ellipsis.width <= available) last.push(ellipsis);
    }
  }
  const align = el.getAttribute("align") ?? (el.tagName === "TimeText" ? "START" : "CENTER");
  const rtl = /^(ar|he|fa|ur)(-|$)/.test(renderCtx.expressionCtx.locale ?? "");
  const factor = align === "CENTER" ? .5 : (align === "END") !== rtl ? 1 : 0;
  ctx.save();
  try {
  ctx.direction = rtl ? "rtl" : "ltr";
  if (circular) {
    const line = lines[0], length = line.reduce((a, g) => a + g.width, 0);
    // Map distance to ellipse parameter using a sampled arc-length table.
    const count = Math.max(1, Math.ceil(sweep * 4));
    const samples = [0]; let previous = { x: rx * Math.sin(start * Math.PI / 180), y: -ry * Math.cos(start * Math.PI / 180) };
    for (let i = 1; i <= count; i++) { const angle = (start + sign * sweep * i / count) * Math.PI / 180; const point = { x: rx * Math.sin(angle), y: -ry * Math.cos(angle) }; samples.push(samples.at(-1)! + Math.hypot(point.x - previous.x, point.y - previous.y)); previous = point; }
    let distance = Math.max(0, samples.at(-1)! - length) * factor;
    for (const glyph of line) {
      const center = distance + glyph.width / 2;
      let i = samples.findIndex(s => s >= center); if (i < 1) i = samples.length - 1;
      const fraction = (center - samples[i - 1]) / (samples[i] - samples[i - 1] || 1);
      const angle = (start + sign * sweep * (i - 1 + fraction) / count) * Math.PI / 180;
      ctx.save(); ctx.translate(number(el, "centerX", width / 2) + rx * Math.sin(angle), number(el, "centerY", height / 2) - ry * Math.cos(angle));
      ctx.rotate(Math.atan2(sign * ry * Math.sin(angle), sign * rx * Math.cos(angle)));
      await drawGlyph(ctx, glyph, -glyph.width / 2, 0, scale, renderCtx); ctx.restore(); distance += glyph.width;
    }
  } else {
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    const heights = lines.map(l => Math.max(runs[0].spec.size * scale * 1.2, ...l.map(g => g.height)));
    let y = (height - heights.reduce((a, b) => a + b, 0)) / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = merged(lines[i]); let x = (width - line.reduce((a, g) => a + g.width, 0)) * factor;
      y += heights[i] / 2;
      for (const glyph of line) { await drawGlyph(ctx, glyph, x, y, scale, renderCtx); x += glyph.width; }
      y += heights[i] / 2;
    }
  }
  } finally { ctx.restore(); }
}

export async function renderDigitalClock(ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext): Promise<void> {
  for (const child of el.children) {
    if (child.tagName !== "TimeText" || number(child, "alpha", 255) <= 0) continue;
    const local = renderCtx.contexts?.get(child) ?? renderCtx.expressionCtx;
    const text = formatTime(child.getAttribute("format") ?? "HH:mm", Number(local.sources.UTC_TIMESTAMP ?? Date.now()), local, child.getAttribute("hourFormat") ?? "SYNC_TO_DEVICE");
    const font = child.querySelector(":scope > Font, :scope > BitmapFont");
    const runs = collectRuns(font ?? child, { ...renderCtx, expressionCtx: local });
    const spec = runs[0]?.spec ?? parseFont(font);
    if (font?.tagName === "BitmapFont") { spec.bitmapTint = font.getAttribute("color") ?? undefined; spec.bitmap = Array.from(child.ownerDocument.querySelectorAll("BitmapFonts > BitmapFont")).find(f => f.getAttribute("name") === spec.family); }
    if (child.hasAttribute("size")) spec.size = number(child, "size", spec.size);
    ctx.save();
    try { applyGeometry(ctx, child);
    await renderRuns(ctx, child, [{ text, spec }], number(child, "width", number(el, "width")) || number(el, "width"), number(child, "height", number(el, "height")) || number(el, "height"), { ...renderCtx, expressionCtx: local });
    } finally { ctx.restore(); }
  }
}
