import { renderElement } from "./shapes.js";
import { buildDataSources } from "./expressions.js";
import type { RenderContext } from "./shapes.js";

export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  width?: number;
  height?: number;
  time?: Date;
  ambient?: boolean;
  configuration?: Record<string, string | number | boolean>;
  /** If true, start a requestAnimationFrame loop and re-render each frame. */
  animate?: boolean;
}

export interface RenderResult {
  metadata: Map<string, string>;
  /** Stop the animation loop (only present when animate=true). */
  stop?: () => void;
}

/**
 * Perform a single render pass of the watch face onto the canvas.
 * Returns the scene metadata map extracted from the document.
 */
async function renderFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  doc: Document,
  options: RenderOptions,
  elapsedMs: number,
  time: Date
): Promise<Map<string, string>> {
  const root = doc.documentElement;

  const width = parseInt(root.getAttribute("width") ?? "450", 10);
  const height = parseInt(root.getAttribute("height") ?? "450", 10);
  const clipShape = root.getAttribute("clipShape");

  // Collect metadata (only needs to happen once but is cheap)
  const metadata = new Map<string, string>();
  const metaElements = root.querySelectorAll("Metadata");
  for (const el of metaElements) {
    const key = el.getAttribute("key");
    const value = el.getAttribute("value");
    if (key !== null && value !== null) {
      metadata.set(key, value);
    }
  }

  // Reset canvas state for this frame
  ctx.resetTransform?.();
  ctx.clearRect(0, 0, width, height);
  ctx.save();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Apply circular clip mask
  if (clipShape === "CIRCLE") {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    ctx.clip();
  }

  // Fill background
  const scene = root.querySelector("Scene");
  const backgroundColor = scene?.getAttribute("backgroundColor") ?? "#000000";
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Build expression context from current time and configuration
  const expressionCtx = buildDataSources(time, options.configuration, true);
  const renderCtx: RenderContext = {
    expressionCtx,
    ambient: options.ambient ?? false,
    assets: options.assets ?? new Map(),
    elapsedMs,
  };

  // Walk Scene children and render shapes
  if (scene) {
    for (const child of scene.children) {
      await renderElement(ctx, child, renderCtx);
    }
  }

  ctx.restore();
  return metadata;
}

/**
 * Render a WFF v4 watch face XML onto a canvas element.
 *
 * If options.animate is true, starts a requestAnimationFrame loop and
 * re-renders each frame with updated time and elapsed milliseconds.
 * Returns a stop() function in the result to cancel the loop.
 *
 * For static (snapshot) renders, elapsedMs = 0 so all animations are at
 * their start state.
 */
export async function renderWatchFace(
  canvas: HTMLCanvasElement,
  options: RenderOptions
): Promise<RenderResult> {
  // Parse the document once; for animation loops the same parsed doc is
  // reused each frame (transforms mutate attributes in-place, which is safe
  // within a single render pass since they always re-apply from the source).
  const doc = new DOMParser().parseFromString(options.xml, "text/xml");
  const root = doc.documentElement;

  // Check for XML parse errors
  if (root.tagName === "parsererror" || root.querySelector("parsererror")) {
    throw new Error("Invalid WFF XML: " + root.textContent?.slice(0, 200));
  }

  // Extract dimensions and resize canvas (only needed once)
  const xmlWidth = parseInt(root.getAttribute("width") ?? "450", 10);
  const xmlHeight = parseInt(root.getAttribute("height") ?? "450", 10);
  const width = options.width ?? xmlWidth;
  const height = options.height ?? xmlHeight;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const metadata = new Map<string, string>();
    return { metadata };
  }

  if (options.animate) {
    // Animation mode — rAF loop
    const startTime = performance.now();
    let animFrameId: number;
    let metadata = new Map<string, string>();

    // Re-parse each frame so attribute mutations from transforms don't
    // accumulate across frames.
    const frame = async () => {
      const now = new Date();
      const elapsed = performance.now() - startTime;
      // Re-parse XML each frame to get a fresh DOM (transform mutations are
      // in-place so we need a clean copy each frame)
      const freshDoc = new DOMParser().parseFromString(options.xml, "text/xml");
      if (freshDoc.documentElement.tagName === "parsererror") return;
      metadata = await renderFrame(canvas, ctx, freshDoc, options, elapsed, now);
      animFrameId = requestAnimationFrame(() => {
        void frame();
      });
    };

    animFrameId = requestAnimationFrame(() => {
      void frame();
    });

    // Do an initial synchronous-ish render for the first frame
    const freshDoc = new DOMParser().parseFromString(options.xml, "text/xml");
    const initialMetadata = await renderFrame(
      canvas,
      ctx,
      freshDoc,
      options,
      0,
      options.time ?? new Date()
    );

    return {
      metadata: initialMetadata,
      stop: () => cancelAnimationFrame(animFrameId),
    };
  }

  // Static single-frame render — elapsedMs = 0
  const metadata = await renderFrame(canvas, ctx, doc, options, 0, options.time ?? new Date());
  return { metadata };
}
