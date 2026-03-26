import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PNG } from "pngjs";
import { CanvasRenderer } from "./canvas-renderer.js";

describe("canvas renderer", () => {
  let renderer: CanvasRenderer;

  beforeAll(async () => {
    renderer = new CanvasRenderer();
    await renderer.init();
  }, 30_000);

  afterAll(async () => {
    await renderer.close();
  });

  it("produces a valid PNG of the correct dimensions", async () => {
    const png = await renderer.render({
      watchfaceXml: "<WatchFace/>",
      assets: new Map(),
      width: 454,
      height: 454,
      time: new Date("2024-01-15T10:10:00"),
      ambient: false,
    });

    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(100);

    const parsed = PNG.sync.read(png);
    expect(parsed.width).toBe(454);
    expect(parsed.height).toBe(454);
  });

  it("renders stub magenta fill when library not loaded", async () => {
    const png = await renderer.render({
      watchfaceXml: "<WatchFace/>",
      assets: new Map(),
      width: 100,
      height: 100,
      time: new Date("2024-01-15T10:10:00"),
      ambient: false,
    });

    const parsed = PNG.sync.read(png);
    // Check center pixel is magenta (255, 0, 255)
    const cx = 50;
    const cy = 50;
    const idx = (cy * 100 + cx) * 4;
    expect(parsed.data[idx]).toBe(255); // R
    expect(parsed.data[idx + 1]).toBe(0); // G
    expect(parsed.data[idx + 2]).toBe(255); // B
    expect(parsed.data[idx + 3]).toBe(255); // A
  });
});
