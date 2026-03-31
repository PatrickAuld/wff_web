import { evaluateExpression, type ExpressionContext } from "./expressions.js";

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

/**
 * Apply an easing/interpolation function to a normalized time value t ∈ [0, 1].
 */
export function ease(t: number, interpolation: string, controls?: string): number {
  t = Math.max(0, Math.min(1, t));
  switch (interpolation) {
    case "LINEAR":
      return t;
    case "EASE_IN":
      return t * t;
    case "EASE_OUT":
      return 1 - (1 - t) * (1 - t);
    case "EASE_IN_OUT":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "OVERSHOOT":
      return 2.70158 * t * t * t - 1.70158 * t * t;
    case "CUBIC_BEZIER": {
      if (!controls) return t;
      const parts = controls.split(",").map(Number);
      const [x1, y1, x2, y2] = parts;
      return cubicBezier(x1, y1, x2, y2, t);
    }
    default:
      return t;
  }
}

/**
 * Approximate a CSS-style cubic bezier using binary search.
 * Given control points (x1,y1) and (x2,y2) (with P0=(0,0) and P3=(1,1)),
 * find y for a given x by searching for the parametric t where Bx(t) == x.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  // Binary search for parametric t where Bx(t) ≈ x
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    // Cubic bezier x component: B(t) = 3(1-t)²t·x1 + 3(1-t)t²·x2 + t³
    const bx =
      3 * (1 - mid) * (1 - mid) * mid * x1 +
      3 * (1 - mid) * mid * mid * x2 +
      mid * mid * mid;
    if (bx < x) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  // Cubic bezier y component: B(t) = 3(1-t)²t·y1 + 3(1-t)t²·y2 + t³
  return (
    3 * (1 - t) * (1 - t) * t * y1 +
    3 * (1 - t) * t * t * y2 +
    t * t * t
  );
}

// ---------------------------------------------------------------------------
// Transform application
// ---------------------------------------------------------------------------

/**
 * Process Transform children of `el`, mutating its attributes in place.
 *
 * Supports two modes:
 * - Expression-based: `value` attribute is evaluated each frame.
 * - Animation-based: `from`/`to` + `Animation` child define a timed tween.
 *
 * `mode` controls whether the computed value is set absolutely (TO) or added
 * to the existing attribute value (BY).
 */
export function applyTransforms(
  el: Element,
  expressionCtx: ExpressionContext,
  elapsedMs: number
): void {
  for (const child of el.children) {
    if (child.tagName !== "Transform") continue;

    const target = child.getAttribute("target");
    if (!target) continue;

    const valueExpr = child.getAttribute("value");
    const mode = child.getAttribute("mode") ?? "TO";

    // Find Animation child for timed tweens
    const animEl = Array.from(child.children).find(
      (c) => c.tagName === "Animation"
    );

    if (animEl) {
      // Animation-based transform with from/to range
      const fromAttr = child.getAttribute("from");
      const toAttr = child.getAttribute("to");

      if (fromAttr !== null && toAttr !== null) {
        const from = parseFloat(fromAttr);
        const to = parseFloat(toAttr);
        const duration = parseFloat(animEl.getAttribute("duration") ?? "1") * 1000;
        const repeat = parseInt(animEl.getAttribute("repeat") ?? "0");
        const interpolation = animEl.getAttribute("interpolation") ?? "LINEAR";
        const controls = animEl.getAttribute("controls") ?? undefined;
        const fpsAttr = animEl.getAttribute("fps");
        const fps = fpsAttr ? parseInt(fpsAttr) : undefined;

        // Determine effective elapsed time based on repeat setting
        let elapsed = elapsedMs;
        if (repeat === -1) {
          // Infinite loop — wrap around
          elapsed = duration > 0 ? elapsed % duration : 0;
        } else if (repeat > 0) {
          // Finite repeats — clamp at total duration, then wrap within one cycle
          const totalDuration = duration * (repeat + 1);
          if (elapsed > totalDuration) elapsed = totalDuration;
          // Avoid wrapping past end on the last repeat
          if (elapsed < totalDuration) {
            elapsed = elapsed % duration;
          } else {
            elapsed = duration;
          }
        } else {
          // Play once — clamp at end
          if (elapsed > duration) elapsed = duration;
        }

        // Quantize to FPS if specified
        if (fps && fps > 0) {
          const frameMs = 1000 / fps;
          elapsed = Math.floor(elapsed / frameMs) * frameMs;
        }

        let t = duration > 0 ? elapsed / duration : 1;
        t = ease(t, interpolation, controls);

        const value = from + (to - from) * t;
        applyValue(el, target, mode, value);
      }
    } else if (valueExpr) {
      // Expression-based transform
      const value = evaluateExpression(valueExpr, expressionCtx);
      applyValue(el, target, mode, Number(value));
    }
  }
}

function applyValue(el: Element, target: string, mode: string, value: number): void {
  if (mode === "TO") {
    el.setAttribute(target, String(value));
  } else if (mode === "BY") {
    const base = parseFloat(el.getAttribute(target) ?? "0");
    el.setAttribute(target, String(base + value));
  }
}
