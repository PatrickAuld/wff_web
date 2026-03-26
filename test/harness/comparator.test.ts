import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { compareImages } from "./comparator.js";

function createSolidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe("image comparator", () => {
  const size = 100;

  it("reports 0% diff for identical images", () => {
    const img = createSolidPng(size, size, 255, 0, 0);
    const result = compareImages(img, img, {
      width: size,
      height: size,
    });

    expect(result.diffPixelCount).toBe(0);
    expect(result.diffPixelPercent).toBe(0);
    expect(result.match).toBe(true);
  });

  it("detects differences between different images", () => {
    const red = createSolidPng(size, size, 255, 0, 0);
    const blue = createSolidPng(size, size, 0, 0, 255);
    const result = compareImages(red, blue, {
      width: size,
      height: size,
      maxDiffPixelPercent: 1.0,
    });

    expect(result.diffPixelCount).toBeGreaterThan(0);
    expect(result.diffPixelPercent).toBeGreaterThan(50);
    expect(result.match).toBe(false);
  });

  it("applies circular mask (corners excluded)", () => {
    // Create two images that differ only in the corners
    const img1 = createSolidPng(size, size, 255, 0, 0);
    const img2Png = new PNG({ width: size, height: size });

    // Fill with red, but make corners blue
    const cx = size / 2;
    const cy = size / 2;
    const r = Math.min(cx, cy);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const dx = x - cx;
        const dy = y - cy;
        const insideCircle = dx * dx + dy * dy <= r * r;
        img2Png.data[idx] = 255; // Red channel stays red
        img2Png.data[idx + 1] = insideCircle ? 0 : 255; // Green in corners
        img2Png.data[idx + 2] = 0;
        img2Png.data[idx + 3] = 255;
      }
    }
    const img2 = PNG.sync.write(img2Png);

    const result = compareImages(img1, img2, {
      width: size,
      height: size,
      circularMask: true,
    });

    // With circular mask, corner differences should be ignored
    expect(result.diffPixelCount).toBe(0);
    expect(result.match).toBe(true);
  });

  it("produces a diff image buffer", () => {
    const red = createSolidPng(size, size, 255, 0, 0);
    const blue = createSolidPng(size, size, 0, 0, 255);
    const result = compareImages(red, blue, {
      width: size,
      height: size,
    });

    expect(result.diffImage).toBeInstanceOf(Buffer);
    expect(result.diffImage.length).toBeGreaterThan(0);

    // Should be a valid PNG
    const parsed = PNG.sync.read(result.diffImage);
    expect(parsed.width).toBe(size);
    expect(parsed.height).toBe(size);
  });
});
