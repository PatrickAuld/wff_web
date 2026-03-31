import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { ComparisonResult } from "./types.js";
import { DEFAULTS } from "./types.js";

interface CompareOptions {
  threshold?: number;
  maxDiffPixelPercent?: number;
  circularMask?: boolean;
  width?: number;
  height?: number;
}

/** Compare two PNG images and return a detailed result */
export function compareImages(
  baselinePng: Buffer,
  canvasPng: Buffer,
  options: CompareOptions = {}
): ComparisonResult {
  const threshold = options.threshold ?? DEFAULTS.threshold;
  const maxDiffPercent =
    options.maxDiffPixelPercent ?? DEFAULTS.maxDiffPixelPercent;
  const width = options.width ?? DEFAULTS.watchWidth;
  const height = options.height ?? DEFAULTS.watchHeight;
  const useCircularMask = options.circularMask ?? true;

  const baselineImg = PNG.sync.read(baselinePng);
  const canvasImg = PNG.sync.read(canvasPng);

  // Resize to match if needed (baseline may be at different resolution)
  const baseline = resizeToMatch(baselineImg, width, height);
  const cvs = resizeToMatch(canvasImg, width, height);

  // Apply circular mask to both images (set pixels outside circle to transparent black)
  if (useCircularMask) {
    applyCircularMask(baseline, width, height);
    applyCircularMask(cvs, width, height);
  }

  const diffPng = new PNG({ width, height });

  const diffPixelCount = pixelmatch(
    baseline.data,
    cvs.data,
    diffPng.data,
    width,
    height,
    { threshold }
  );

  // Count only pixels inside the mask for percentage calculation
  const totalPixels = useCircularMask
    ? countPixelsInCircle(width, height)
    : width * height;

  const diffPixelPercent = (diffPixelCount / totalPixels) * 100;

  return {
    match: diffPixelPercent <= maxDiffPercent,
    diffPixelCount,
    diffPixelPercent,
    totalPixels,
    diffImage: PNG.sync.write(diffPng),
    baselineImage: baselinePng,
    canvasImage: canvasPng,
  };
}

/** Apply a circular mask: set all pixels outside the inscribed circle to transparent */
function applyCircularMask(
  img: PNG,
  width: number,
  height: number
): void {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) {
        const idx = (y * width + x) * 4;
        img.data[idx] = 0; // R
        img.data[idx + 1] = 0; // G
        img.data[idx + 2] = 0; // B
        img.data[idx + 3] = 0; // A
      }
    }
  }
}

/** Count pixels inside the inscribed circle */
function countPixelsInCircle(width: number, height: number): number {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy);
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        count++;
      }
    }
  }
  return count;
}

/** Simple nearest-neighbor resize if dimensions don't match */
function resizeToMatch(img: PNG, targetW: number, targetH: number): PNG {
  if (img.width === targetW && img.height === targetH) {
    return img;
  }

  const out = new PNG({ width: targetW, height: targetH });
  const scaleX = img.width / targetW;
  const scaleY = img.height / targetH;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * img.width + srcX) * 4;
      const dstIdx = (y * targetW + x) * 4;

      out.data[dstIdx] = img.data[srcIdx];
      out.data[dstIdx + 1] = img.data[srcIdx + 1];
      out.data[dstIdx + 2] = img.data[srcIdx + 2];
      out.data[dstIdx + 3] = img.data[srcIdx + 3];
    }
  }

  return out;
}
