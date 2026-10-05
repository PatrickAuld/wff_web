import { renderElement, type RenderContext } from "./shapes.js";
import { localizedDataSources } from "./expressions.js";
import { number } from "./attributes.js";
import { prepareScene } from "./scene.js";
import { loadFonts, template } from "./text.js";
import { formatTemplate } from "./format.js";
import { parseColor } from "./color.js";
import type { Transition } from "./animation.js";
import type { ImageState } from "./images.js";
import { prepareConfigurations, type UserSetting } from "./configuration.js";
import type { ComplicationData } from "./complications.js";
export type { UserSetting, ConfigurationOption } from "./configuration.js";
export type { ComplicationData, ComplicationType } from "./complications.js";

export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  width?: number;
  height?: number;
  time?: Date;
  ambient?: boolean;
  configuration?: Record<string, string | number | boolean>;
  flavor?: string;
  complications?: Record<number, ComplicationData>;
  animate?: boolean;
  elapsedMs?: number;
  /** Preview device ambient transition window; Variant duration/startOffset are fractions of it. */
  ambientTransitionDurationMs?: number;
  dataSources?: Record<string, string | number | boolean> | ((time: Date) => Record<string, string | number | boolean>);
  locale?: string;
  timeZone?: string;
  calendar?: string;
  currency?: string;
  is24Hour?: boolean;
  strings?: Record<string, string>;
  photos?: Record<string, string[]>;
  visible?: boolean;
  random?: () => number;
  onLaunch?: (target: string) => void;
  onError?: (error: unknown) => void;
}
export interface AccessibilityItem { name: string; text: string; bounds: { x: number; y: number; width: number; height: number }; launchTarget?: string }
export interface RenderResult {
  metadata: Map<string, string>;
  accessibility: AccessibilityItem[];
  settings: UserSetting[];
  activeComplicationSlotIds: number[];
  update: (changes: Partial<RenderOptions>) => Promise<void>;
  tap: (x: number, y: number) => Promise<void>;
  stop: () => void;
}
const activeCanvases = new WeakMap<HTMLCanvasElement, RenderResult>();
interface Hit { key: string; inverse: DOMMatrix; width: number; height: number; launch?: string }

function stringsFromAssets(options: RenderOptions): Record<string, string> {
  const result: Record<string, string> = {};
  const language = (options.locale ?? "en-US").split("-")[0];
  for (const qualifier of ["values", `values-${language}`]) {
    const buffer = options.assets?.get(`res/${qualifier}/strings.xml`) ?? options.assets?.get(`${qualifier}/strings.xml`);
    if (!buffer) continue;
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buffer), "text/xml");
    for (const el of doc.querySelectorAll("string")) result[el.getAttribute("name") ?? ""] = (el.textContent ?? "").replace(/\\n/g, "\n").replace(/\\'/g, "'");
  }
  return { ...result, ...options.strings };
}

export async function renderWatchFace(canvas: HTMLCanvasElement, initial: RenderOptions): Promise<RenderResult> {
  activeCanvases.get(canvas)?.stop();
  let options = { ...initial };
  let stopped = false, raf = 0, queue = Promise.resolve();
  const start = performance.now();
  const states = new Map<string, Transition>(), imageStates = new Map<string, ImageState>(), events = new Map<string, number>();
  const hits: Hit[] = [];
  let hitClip: { path: Path2D; ctx: CanvasRenderingContext2D; scaleX: number; scaleY: number } | undefined;
  const result: RenderResult = { metadata: new Map(), accessibility: [], settings: [], activeComplicationSlotIds: [], update, tap, stop };
  let wasVisible = options.visible !== false;
  let hiddenAt: number | undefined, pausedMs = 0, frameId = 0, timeAnchorElapsed = 0;
  async function draw(): Promise<void> {
    if (stopped) return;
    frameId++;
    const doc = new DOMParser().parseFromString(options.xml, "text/xml"), root = doc.documentElement;
    if (root.tagName === "parsererror" || root.querySelector("parsererror")) throw new Error("Invalid WFF XML: " + root.textContent?.slice(0, 200));
    const xmlWidth = number(root, "width", 450), xmlHeight = number(root, "height", 450);
    const width = options.width ?? xmlWidth, height = options.height ?? xmlHeight;
    if (![xmlWidth, xmlHeight, width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error("WatchFace dimensions must be positive finite numbers");
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    const config = prepareConfigurations(doc, options.configuration, options.flavor);
    result.settings = config.settings; result.activeComplicationSlotIds = config.activeComplicationSlotIds;
    result.metadata.clear(); for (const el of root.querySelectorAll("Metadata")) result.metadata.set(el.getAttribute("key") ?? "", el.getAttribute("value") ?? "");
    hits.length = 0; hitClip = undefined; result.accessibility.length = 0;
    const realElapsed = options.elapsedMs ?? performance.now() - start;
    const visible = options.visible !== false;
    if (!visible && wasVisible) hiddenAt = realElapsed;
    if (visible && !wasVisible) {
      pausedMs += realElapsed - (hiddenAt ?? realElapsed); hiddenAt = undefined;
      events.set("ON_VISIBLE", (events.get("ON_VISIBLE") ?? 0) + 1);
    }
    wasVisible = visible;
    if (!ctx || !visible) {
      for (const state of imageStates.values()) if (state.hiddenAt === undefined) state.hiddenAt = realElapsed - pausedMs;
      return;
    }
    const elapsed = options.elapsedMs ?? realElapsed - pausedMs;
    const time = options.time ? new Date(options.time.getTime() + (options.animate && options.elapsedMs === undefined ? Math.max(0, elapsed - timeAnchorElapsed) : 0)) : new Date();
    const expressionCtx = localizedDataSources(time, config.values, options.is24Hour, options.locale, options.timeZone, options.calendar);
    expressionCtx.currency = options.currency; expressionCtx.strings = stringsFromAssets(options); expressionCtx.random = options.random;
    const injected = typeof options.dataSources === "function" ? options.dataSources(time) : options.dataSources;
    for (const [key, value] of Object.entries(injected ?? {})) expressionCtx.sources[key] = typeof value === "boolean" ? Number(value) : value;
    const scene = root.querySelector(":scope > Scene");
    if (!scene) return;
    if (!scene.hasAttribute("width")) scene.setAttribute("width", String(xmlWidth));
    if (!scene.hasAttribute("height")) scene.setAttribute("height", String(xmlHeight));
    const contexts = prepareScene(scene, expressionCtx, options.ambient ?? false, elapsed, states, options.ambientTransitionDurationMs, { activeSlotIds: new Set(config.activeComplicationSlotIds), data: options.complications ?? {} });
    await loadFonts(doc, options.assets ?? new Map());
    ctx.resetTransform(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save();
    try {
      ctx.scale(width / xmlWidth, height / xmlHeight);
      const clip = new Path2D();
      if ((root.getAttribute("clipShape") ?? "CIRCLE") === "CIRCLE") clip.arc(xmlWidth / 2, xmlHeight / 2, Math.min(xmlWidth, xmlHeight) / 2, 0, 2 * Math.PI);
      else clip.roundRect(0, 0, xmlWidth, xmlHeight, { x: root.getAttribute("clipShape") === "RECTANGLE" ? number(root, "cornerRadiusX") : 0, y: root.getAttribute("clipShape") === "RECTANGLE" ? number(root, "cornerRadiusY") : 0 });
      ctx.clip(clip); hitClip = { path: clip, ctx, scaleX: width / xmlWidth, scaleY: height / xmlHeight };
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = parseColor(scene.getAttribute("backgroundColor") ?? "#000000"); ctx.fillRect(0, 0, xmlWidth, xmlHeight);
      const renderCtx: RenderContext = { expressionCtx, contexts, ambient: options.ambient ?? false, assets: options.assets ?? new Map(), elapsedMs: elapsed, frameId, events, imageStates, photos: options.photos, random: options.random,
        register(target, el, local) {
          const w = number(el, "width"), h = number(el, "height"), transform = local.basis ? local.basis.multiply(target.getTransform()) : target.getTransform();
          const launch = el.querySelector(":scope > Launch")?.getAttribute("target") ?? undefined;
          const hasEvents = el.querySelector("Images, Photos, AnimatedImages, AnimationController");
          if ((launch || hasEvents) && w > 0 && h > 0) hits.push({ key: el.getAttribute("data-wff-key") ?? "", inverse: transform.inverse(), width: w, height: h, launch });
          const reader = el.querySelector(":scope > ScreenReader");
          if (reader) {
            const id = reader.getAttribute("stringId") ?? "";
            const values = Array.from(reader.children).filter(c => c.tagName === "Parameter").map(c => templateParameter(c, local));
            const text = formatTemplate(local.expressionCtx.strings?.[id.replace(/^@string\//, "")] ?? id, values, local.expressionCtx);
            const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => transform.transformPoint({ x, y }));
            const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
            result.accessibility.push({ name: el.getAttribute("name") ?? id, text, bounds: { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y }, launchTarget: launch });
          }
        },
      };
      await renderElement(ctx, scene, renderCtx);
      for (const state of imageStates.values()) if (state.lastSeen !== frameId && state.hiddenAt === undefined) state.hiddenAt = elapsed;
      if (result.accessibility.length) { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", result.accessibility.map(a => a.text).join("; ")); }
      else canvas.removeAttribute("aria-label");
    } finally { ctx.restore(); }
  }
  function schedule(): Promise<void> { queue = queue.catch(() => {}).then(draw); return queue; }
  function update(changes: Partial<RenderOptions>): Promise<void> {
    if (changes.xml !== undefined && changes.xml !== options.xml) { states.clear(); imageStates.clear(); events.clear(); }
    if (changes.time !== undefined) timeAnchorElapsed = changes.elapsedMs ?? options.elapsedMs ?? performance.now() - start - pausedMs;
    const wasAnimating = options.animate;
    options = { ...options, ...changes };
    if (changes.animate === false) cancelAnimationFrame(raf);
    if (changes.animate && !wasAnimating && !stopped) raf = requestAnimationFrame(() => { void frame(); });
    return schedule();
  }
  async function tap(x: number, y: number): Promise<void> {
    if (stopped || options.ambient || options.visible === false) return;
    if (hitClip && !hitClip.ctx.isPointInPath(hitClip.path, x / hitClip.scaleX, y / hitClip.scaleY)) return;
    for (const hit of [...hits].reverse()) {
      const point = hit.inverse.transformPoint({ x, y });
      if (point.x >= 0 && point.y >= 0 && point.x <= hit.width && point.y <= hit.height) {
        events.set(`TAP:${hit.key}`, (events.get(`TAP:${hit.key}`) ?? 0) + 1);
        if (hit.launch) options.onLaunch?.(hit.launch);
        await schedule(); return;
      }
    }
  }
  function stop() { stopped = true; cancelAnimationFrame(raf); canvas.removeEventListener("click", click); if (activeCanvases.get(canvas) === result) activeCanvases.delete(canvas); }
  function click(event: MouseEvent) { const rect = canvas.getBoundingClientRect(); void tap((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height).catch(error => options.onError?.(error)); }
  canvas.addEventListener("click", click);
  try { await schedule(); } catch (error) { stop(); throw error; }
  const frame = async () => { if (stopped) return; try { await schedule(); } catch (error) { stop(); options.onError?.(error); return; } if (!stopped && options.animate) raf = requestAnimationFrame(() => { void frame(); }); };
  if (options.animate) raf = requestAnimationFrame(() => { void frame(); });
  activeCanvases.set(canvas, result);
  return result;
}

function templateParameter(el: Element, ctx: RenderContext): string | number {
  const wrapper = el.ownerDocument.createElement("Template"); wrapper.append("%s"); wrapper.append(el.cloneNode());
  return template(wrapper, ctx.expressionCtx);
}
