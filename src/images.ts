import { parseColor } from "./color.js";
import { boolean, number, resolveValue } from "./attributes.js";
import type { RenderContext } from "./shapes.js";

let imageCache = new WeakMap<ArrayBuffer, Promise<ImageBitmap>>();
let animationCache = new WeakMap<ArrayBuffer, Promise<AnimatedFrame[]>>();
export interface AnimatedFrame { image: CanvasImageSource; durationMs: number }
export interface ImageState { index: number; triggers: Record<string, number>; playStart?: number; lastSeen?: number; hiddenAt?: number; resume?: boolean; appearances?: number; lastVisibleEvent?: number; resourceKey?: string; heldFrame?: number }

export function assetBuffer(resource: string, assets: Map<string, ArrayBuffer>): ArrayBuffer | undefined {
  const key = resource.replace(/^@drawable\//, "");
  return assets.get(key) ?? ["png", "webp", "jpg", "jpeg", "gif"].map(ext => assets.get(`${key}.${ext}`) ?? assets.get(`res/drawable/${key}.${ext}`)).find(Boolean);
}
export async function getOrDecodeImage(resource: string, assets: Map<string, ArrayBuffer>): Promise<ImageBitmap | null> {
  const buffer = assetBuffer(resource, assets);
  if (!buffer) return null;
  let decoded = imageCache.get(buffer);
  if (!decoded) { decoded = createImageBitmap(new Blob([buffer])); imageCache.set(buffer, decoded); }
  return decoded;
}
export function clearImageCache(): void { imageCache = new WeakMap(); animationCache = new WeakMap(); }

export function drawImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number, tint: string | null): void {
  if (w <= 0 || h <= 0) return;
  if (!tint) { ctx.drawImage(image, x, y, w, h); return; }
  const layer = new OffscreenCanvas(Math.ceil(w), Math.ceil(h)), target = layer.getContext("2d")!;
  target.drawImage(image, 0, 0, w, h); target.globalCompositeOperation = "source-in"; target.fillStyle = parseColor(tint); target.fillRect(0, 0, w, h);
  ctx.drawImage(layer, x, y, w, h);
}

function triggers(el: Element, renderCtx: RenderContext, state?: ImageState): Record<string, number> {
  const timestamp = Number(renderCtx.expressionCtx.sources.UTC_TIMESTAMP);
  const owner = el.closest("PartImage, PartAnimatedImage");
  const key = owner?.getAttribute("data-wff-key") ?? "";
  return { TAP: renderCtx.events?.get(`TAP:${key}`) ?? 0, ON_VISIBLE: (renderCtx.events?.get("ON_VISIBLE") ?? 0) + (state?.appearances ?? 0),
    ON_NEXT_SECOND: Math.floor(timestamp / 1000), ON_NEXT_MINUTE: Math.floor(timestamp / 60000), ON_NEXT_HOUR: Math.floor(timestamp / 3600000) };
}
function stateFor(el: Element, renderCtx: RenderContext): ImageState {
  const key = el.getAttribute("data-wff-key") ?? el.tagName;
  const states = renderCtx.imageStates ?? (renderCtx.imageStates = new Map());
  let state = states.get(key);
  if (!state) { state = { index: 0, triggers: triggers(el, renderCtx) }; states.set(key, state); }
  const globalVisibility = renderCtx.events?.get("ON_VISIBLE") ?? 0;
  if (state.hiddenAt !== undefined) {
    if (state.lastVisibleEvent === globalVisibility) state.appearances = (state.appearances ?? 0) + 1;
    if (state.resume && state.playStart !== undefined) state.playStart += renderCtx.elapsedMs - state.hiddenAt;
    else state.playStart = undefined;
    state.hiddenAt = undefined;
  }
  state.lastVisibleEvent = globalVisibility;
  state.lastSeen = renderCtx.frameId;
  return state;
}
function changed(state: ImageState, el: Element, names: string, renderCtx: RenderContext): number {
  const current = triggers(el, renderCtx, state);
  let changes = 0;
  for (const name of names.trim().split(/\s+/)) {
    const previous = state.triggers[name] ?? current[name];
    if (current[name] !== previous) changes += Math.max(1, current[name] - previous);
  }
  state.triggers = current;
  return changes;
}
function select(el: Element, entries: Element[], renderCtx: RenderContext): Element | undefined {
  if (!entries.length) return;
  const state = stateFor(el, renderCtx);
  const changes = changed(state, el, el.getAttribute("change") ?? "TAP", renderCtx);
  if (changes) {
    const direction = el.getAttribute("changeDirection") ?? "FORWARD";
    state.index = direction === "RANDOM" ? Math.floor((renderCtx.random ?? Math.random)() * entries.length) : ((state.index + changes * (direction === "BACKWARD" ? -1 : 1)) % entries.length + entries.length) % entries.length;
  }
  return entries[state.index % entries.length];
}

export function filterPixels(data: Uint8ClampedArray, hue: number, saturation: number, brightness: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = ((h * 60 + hue) % 360 + 360) % 360;
    const s = (max ? delta / max : 0) * Math.max(0, Math.min(1, saturation));
    const v = max * Math.max(0, Math.min(1, brightness)), c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    for (let j = 0; j < 3; j++) data[i + j] = (channels[j] + m) * 255;
  }
}

async function animatedFrames(el: Element, renderCtx: RenderContext): Promise<AnimatedFrame[]> {
  const resource = el.getAttribute("resource") ?? "", buffer = assetBuffer(resource, renderCtx.assets);
  if (!buffer) return [];
  const format = el.getAttribute("format") ?? "IMAGE";
  if (format === "IMAGE") { const bitmap = await getOrDecodeImage(resource, renderCtx.assets); return bitmap ? [{ image: bitmap, durationMs: 1000 }] : []; }
  let promise = animationCache.get(buffer);
  if (!promise) {
    promise = (async () => {
      // WebCodecs is used to decode frames independently of wall-clock playback.
      const Decoder = (globalThis as unknown as { ImageDecoder?: new (options: { data: ArrayBuffer; type: string }) => {
        tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
        completed: Promise<void>;
        decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
        close(): void;
      } }).ImageDecoder;
      if (!Decoder) throw new Error("AnimatedImage requires the browser ImageDecoder API; use SequenceImages on this browser");
      const decoder = new Decoder({ data: buffer, type: format === "AGIF" ? "image/gif" : "image/webp" });
      try {
        await decoder.tracks.ready; await decoder.completed;
        const frames: AnimatedFrame[] = [];
        for (let i = 0; i < (decoder.tracks.selectedTrack?.frameCount ?? 0); i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          const durationMs = Math.max(1, (image.duration ?? 100000) / 1000);
          const bitmap = await createImageBitmap(image); image.close(); frames.push({ image: bitmap, durationMs });
        }
        return frames;
      } finally { decoder.close(); }
    })();
    animationCache.set(buffer, promise);
  }
  return promise;
}

async function animationImage(el: Element, owner: Element, renderCtx: RenderContext): Promise<CanvasImageSource | null> {
  const controller = owner.querySelector(":scope > AnimationController");
  const state = stateFor(controller ?? el, renderCtx);
  const now = renderCtx.elapsedMs;
  const play = controller?.getAttribute("play") ?? "ON_VISIBLE";
  const changes = changed(state, controller ?? el, play, renderCtx);
  if (state.playStart === undefined && play.includes("ON_VISIBLE")) state.playStart = now;
  state.resume = controller ? boolean(controller.getAttribute("resumePlayBack")) : false;
  const resourceKey = el.getAttribute("data-wff-key") ?? el.getAttribute("resource") ?? "";
  if (state.resourceKey !== undefined && state.resourceKey !== resourceKey) state.playStart = now;
  state.resourceKey = resourceKey;
  if (changes && !(state.resume && play.trim() === "ON_VISIBLE" && state.playStart !== undefined)) state.playStart = now;
  const sequence = el.tagName === "SequenceImages" || el.tagName === "SequenceImage";
  let frames: AnimatedFrame[];
  if (sequence) {
    const fps = number(el, "frameRate", 15);
    frames = [];
    for (const child of el.children) if (child.tagName === "Image") {
      const bitmap = await getOrDecodeImage(child.getAttribute("resource") ?? "", renderCtx.assets);
      if (bitmap) frames.push({ image: bitmap, durationMs: 1000 / Math.max(1, fps) });
    }
  } else frames = await animatedFrames(el, renderCtx);
  if (!frames.length) return null;
  const delay = controller ? number(controller, "delayPlay") * 1000 : 0;
  let position = now - (state.playStart ?? now) - delay;
  const duration = frames.reduce((a, f) => a + f.durationMs, 0);
  const repeatDelay = controller ? number(controller, "delayRepeat") * 1000 : 0;
  const loops = controller && boolean(controller.getAttribute("repeat")) ? Infinity : controller ? number(controller, "loopCount", 1) : number(el, "loopCount", 1);
  let mode: string | null = null;
  let completed = false;
  if (renderCtx.ambient || state.playStart === undefined || position < 0) mode = controller?.getAttribute("beforePlaying") ?? "DO_NOTHING";
  else if (position >= duration * loops + repeatDelay * Math.max(0, loops - 1)) { completed = true; mode = controller?.getAttribute("afterPlaying") ?? "DO_NOTHING"; }
  if (mode === "HIDE") return null;
  if (mode === "THUMBNAIL") return getOrDecodeImage(el.getAttribute("thumbnail") ?? "", renderCtx.assets);
  if (mode === "FIRST_FRAME") { state.heldFrame = 0; return frames[0].image; }
  if (mode === "DO_NOTHING") { if (completed) state.heldFrame = frames.length - 1; return frames[state.heldFrame ?? 0].image; }
  position %= duration + repeatDelay;
  for (let i = 0; i < frames.length; i++) { if (position < frames[i].durationMs) { state.heldFrame = i; return frames[i].image; } position -= frames[i].durationMs; }
  state.heldFrame = frames.length - 1; return frames.at(-1)!.image;
}

export async function renderPartImage(ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext, assets: Map<string, ArrayBuffer>): Promise<void> {
  let child = Array.from(el.children).find(c => ["Image", "Images", "Photos", "AnimatedImage", "AnimatedImages", "SequenceImages", "SequenceImage"].includes(c.tagName));
  if (!child) return;
  if (child.tagName === "Images" || child.tagName === "AnimatedImages") child = select(child, Array.from(child.children).filter(c => ["Image", "AnimatedImage", "SequenceImages", "SequenceImage"].includes(c.tagName)), renderCtx);
  if (!child) return;
  let bitmap: CanvasImageSource | null;
  if (child.tagName === "Photos") {
    const source = child.getAttribute("source") ?? "", id = source.replace(/^\[CONFIGURATION\.(.*)\]$/, "$1");
    const photos = renderCtx.photos?.[id] ?? [];
    const state = stateFor(child, renderCtx), previous = { ...state.triggers };
    const names = (child.getAttribute("change") ?? "TAP").split(/\s+/);
    changed(state, child, names.join(" "), renderCtx);
    const every = Math.max(3, Math.min(10, number(child, "changeAfterEvery", 3)));
    for (const name of names) {
      const before = previous[name] ?? state.triggers[name] ?? 0, after = state.triggers[name] ?? 0;
      state.index += name === "ON_VISIBLE" ? Math.floor(after / every) - Math.floor(before / every) : Math.max(0, after - before);
    }
    bitmap = await getOrDecodeImage(photos[state.index % Math.max(1, photos.length)] ?? child.getAttribute("defaultImageResource") ?? "", assets);
  } else if (child.tagName === "Image") bitmap = await getOrDecodeImage(child.getAttribute("resource") ?? "", assets);
  else bitmap = await animationImage(child, el, renderCtx);
  if (!bitmap) return;
  const w = number(el, "width"), h = number(el, "height");
  if (w <= 0 || h <= 0) return;
  const layer = new OffscreenCanvas(Math.ceil(w), Math.ceil(h)), target = layer.getContext("2d")!;
  if (child.tagName === "Photos") {
    const size = bitmap as ImageBitmap;
    const cropWidth = Math.min(size.width, number(child, "width", size.width)), cropHeight = Math.min(size.height, number(child, "height", size.height));
    const ratio = Math.max(w / cropWidth, h / cropHeight);
    const cw = w / ratio, ch = h / ratio;
    target.drawImage(bitmap, (size.width - cw) / 2, (size.height - ch) / 2, cw, ch, 0, 0, w, h);
  } else drawImage(target as unknown as CanvasRenderingContext2D, bitmap, 0, 0, w, h, null);
  for (const filter of el.querySelectorAll(":scope > ImageFilters > HsbFilter")) {
    const data = target.getImageData(0, 0, layer.width, layer.height);
    filterPixels(data.data, number(filter, "hueRotate"), number(filter, "saturate", 1), number(filter, "brightness", 1)); target.putImageData(data, 0, 0);
  }
  drawImage(ctx, layer, 0, 0, w, h, null);
}
