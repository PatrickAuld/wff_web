import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FIXTURE_01_PATH = resolve(
  import.meta.dirname,
  "../test/fixtures/01-solid-background/watchface.xml"
);

// The library source is evaluated directly in the browser context.
// We read the built ESM bundle and wrap it so renderWatchFace is on window.
const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("renderWatchFace – Phase 1", () => {
  let browser: Browser;
  let librarySource: string;
  let fixture01Xml: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    librarySource = await readFile(DIST_PATH, "utf-8");
    fixture01Xml = await readFile(FIXTURE_01_PATH, "utf-8");
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
    // Inject library — rewrite ESM export to assign to window
    const script = librarySource.replace(
      /export\s*\{[^}]*\}/,
      ""
    ) + "\nwindow.renderWatchFace = renderWatchFace;";
    await page.evaluate(script);
    return page;
  }

  it("parses width and height from WatchFace root", async () => {
    const page = await createPage();
    const dims = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      return { width: canvas.width, height: canvas.height };
    }, fixture01Xml);

    expect(dims.width).toBe(450);
    expect(dims.height).toBe(450);
    await page.close();
  });

  it("collects metadata from Metadata elements", async () => {
    const page = await createPage();
    const meta = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      const result = await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      return Object.fromEntries(result.metadata);
    }, fixture01Xml);

    expect(meta.CLOCK_TYPE).toBe("DIGITAL");
    expect(meta.PREVIEW_TIME).toBe("10:10:00");
    await page.close();
  });

  it("defaults clipShape to no clipping when not specified", async () => {
    const page = await createPage();
    // XML without clipShape — canvas should still be resized, no clip applied
    const xml = `<WatchFace width="200" height="200"><Scene/></WatchFace>`;
    const dims = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      return { width: canvas.width, height: canvas.height };
    }, xml);

    expect(dims.width).toBe(200);
    expect(dims.height).toBe(200);
    await page.close();
  });

  it("fills black background by default", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100"><Scene/></WatchFace>`;
    const pixel = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(50, 50, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3] };
    }, xml);

    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    expect(pixel.a).toBe(255);
    await page.close();
  });

  it("applies circular clip when clipShape=CIRCLE", async () => {
    const page = await createPage();
    // White background with circle clip — corner should be transparent/black, center should be white
    const xml = `<WatchFace width="100" height="100" clipShape="CIRCLE">
      <Scene backgroundColor="#FFFFFF"/>
    </WatchFace>`;
    const pixels = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      const ctx = canvas.getContext("2d")!;
      const center = ctx.getImageData(50, 50, 1, 1).data;
      const corner = ctx.getImageData(0, 0, 1, 1).data;
      return {
        center: { r: center[0], g: center[1], b: center[2], a: center[3] },
        corner: { r: corner[0], g: corner[1], b: corner[2], a: corner[3] },
      };
    }, xml);

    // Center is inside the circle — should be white
    expect(pixels.center.r).toBe(255);
    expect(pixels.center.g).toBe(255);
    expect(pixels.center.b).toBe(255);

    // Corner (0,0) is outside the circle — should remain unfilled (transparent)
    expect(pixels.corner.a).toBe(0);
    await page.close();
  });

  it("uses Scene backgroundColor when specified", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#FF0000"/>
    </WatchFace>`;
    const pixel = await page.evaluate(async (xml) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      await (window as any).renderWatchFace(canvas, {
        xml,
        time: new Date("2024-01-15T10:10:00"),
        ambient: false,
      });
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(50, 50, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2] };
    }, xml);

    expect(pixel.r).toBe(255);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    await page.close();
  });
});
