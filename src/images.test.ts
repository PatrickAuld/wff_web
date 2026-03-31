import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

// Minimal 1x1 red pixel PNG (generated via Python: struct/zlib, 8-bit RGB color_type=2)
const RED_1x1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

// A 1x1 green pixel PNG
const GREEN_1x1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+M8AAAICAQB7CYF4AAAAAElFTkSuQmCC";

describe("Phase 8 – Images", () => {
  let browser: Browser;
  let librarySource: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    librarySource = await readFile(DIST_PATH, "utf-8");
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  async function createPage(): Promise<Page> {
    const page = await browser.newPage();
    await page.setContent(
      `<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>`,
      { waitUntil: "domcontentloaded" }
    );
    const script =
      librarySource.replace(/export\s*\{[^}]*\}/, "") +
      "\nwindow.renderWatchFace = renderWatchFace;";
    await page.evaluate(script);
    return page;
  }

  it("renders a PartImage at the correct position", async () => {
    const page = await createPage();

    // Pass a 1x1 red PNG as the asset "test_image"
    const pixel = await page.evaluate(
      async ({ xml, imageBase64 }) => {
        // Decode base64 to ArrayBuffer in browser context
        const binary = atob(imageBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const assets = new Map<string, ArrayBuffer>();
        assets.set("test_image", bytes.buffer);

        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          assets,
          time: new Date("2024-01-15T10:10:00"),
          ambient: false,
        });

        const ctx = canvas.getContext("2d")!;
        // Sample center of PartImage (placed at x=10, y=10, w=80, h=80 → center=50,50)
        const d = ctx.getImageData(50, 50, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      {
        xml: `<WatchFace width="100" height="100">
          <Scene backgroundColor="#000000">
            <PartImage x="10" y="10" width="80" height="80">
              <Image resource="test_image"/>
            </PartImage>
          </Scene>
        </WatchFace>`,
        imageBase64: RED_1x1_PNG_BASE64,
      }
    );

    // The red 1x1 image should be scaled to fill the 80x80 area
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeLessThan(50);
    expect(pixel.b).toBeLessThan(50);
    expect(pixel.a).toBe(255);

    await page.close();
  });

  it("gracefully skips rendering when resource is missing from assets", async () => {
    const page = await createPage();

    const pixel = await page.evaluate(
      async ({ xml }) => {
        const assets = new Map<string, ArrayBuffer>(); // empty — no "missing_image" key

        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          assets,
          time: new Date("2024-01-15T10:10:00"),
          ambient: false,
        });

        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(50, 50, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      {
        xml: `<WatchFace width="100" height="100">
          <Scene backgroundColor="#000000">
            <PartImage x="0" y="0" width="100" height="100">
              <Image resource="missing_image"/>
            </PartImage>
          </Scene>
        </WatchFace>`,
      }
    );

    // Background should remain black since image was skipped
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);

    await page.close();
  });

  it("gracefully skips rendering when no Image child is present", async () => {
    const page = await createPage();

    const pixel = await page.evaluate(
      async ({ xml }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          assets: new Map(),
          time: new Date("2024-01-15T10:10:00"),
          ambient: false,
        });

        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(50, 50, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      {
        xml: `<WatchFace width="100" height="100">
          <Scene backgroundColor="#000000">
            <PartImage x="0" y="0" width="100" height="100"/>
          </Scene>
        </WatchFace>`,
      }
    );

    // Background should remain black
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);

    await page.close();
  });

  it("renders two different images at different positions", async () => {
    const page = await createPage();

    const pixels = await page.evaluate(
      async ({ xml, redBase64, greenBase64 }) => {
        function b64ToBuffer(b64: string): ArrayBuffer {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        }

        const assets = new Map<string, ArrayBuffer>();
        assets.set("red_img", b64ToBuffer(redBase64));
        assets.set("green_img", b64ToBuffer(greenBase64));

        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          assets,
          time: new Date("2024-01-15T10:10:00"),
          ambient: false,
        });

        const ctx = canvas.getContext("2d")!;
        const left = ctx.getImageData(25, 50, 1, 1).data;
        const right = ctx.getImageData(75, 50, 1, 1).data;
        return {
          left: { r: left[0], g: left[1], b: left[2] },
          right: { r: right[0], g: right[1], b: right[2] },
        };
      },
      {
        xml: `<WatchFace width="100" height="100">
          <Scene backgroundColor="#000000">
            <PartImage x="0" y="0" width="50" height="100">
              <Image resource="red_img"/>
            </PartImage>
            <PartImage x="50" y="0" width="50" height="100">
              <Image resource="green_img"/>
            </PartImage>
          </Scene>
        </WatchFace>`,
        redBase64: RED_1x1_PNG_BASE64,
        greenBase64: GREEN_1x1_PNG_BASE64,
      }
    );

    // Left half should be red
    expect(pixels.left.r).toBeGreaterThan(200);
    expect(pixels.left.g).toBeLessThan(50);

    // Right half should be green
    expect(pixels.right.g).toBeGreaterThan(150);
    expect(pixels.right.r).toBeLessThan(50);

    await page.close();
  });
});
