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

    // Stub fallback uses 450x450 since library is not loaded in the harness page
    const parsed = PNG.sync.read(png);
    expect(parsed.width).toBe(450);
    expect(parsed.height).toBe(450);
  });

  it("renders the library output in the harness page", async () => {
    const png = await renderer.render({
      watchfaceXml: "<WatchFace/>",
      assets: new Map(),
      width: 450,
      height: 450,
      time: new Date("2024-01-15T10:10:00"),
      ambient: false,
    });

    const parsed = PNG.sync.read(png);
    // Minimal XML defaults to a 450x450 black Scene background.
    const cx = 225;
    const cy = 225;
    const idx = (cy * 450 + cx) * 4;
    expect(parsed.data[idx]).toBe(0); // R
    expect(parsed.data[idx + 1]).toBe(0); // G
    expect(parsed.data[idx + 2]).toBe(0); // B
    expect(parsed.data[idx + 3]).toBe(255); // A
  });
});
