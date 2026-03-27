import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 2 – Shapes & Styles", () => {
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
    const script = librarySource.replace(
      /export\s*\{[^}]*\}/,
      ""
    ) + "\nwindow.renderWatchFace = renderWatchFace;";
    await page.evaluate(script);
    return page;
  }

  function renderAndSample(page: Page, xml: string, x: number, y: number) {
    return page.evaluate(
      ({ xml, x, y }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        (window as any).renderWatchFace(canvas, {
          xml,
          time: new Date("2024-01-15T10:10:00"),
          ambient: false,
        });
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      { xml, x, y }
    );
  }

  describe("Fill", () => {
    it("fills a rectangle with a solid color", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill color="#00FF00"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(0);
      await page.close();
    });
  });

  describe("Stroke", () => {
    it("strokes a rectangle with specified color and thickness", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="10" y="10" width="80" height="80">
            <Stroke color="#FF0000" thickness="10"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Sample at (14, 14) — on the stroke boundary
      const pixel = await renderAndSample(page, xml, 14, 14);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("applies both fill and stroke to a shape", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="10" y="10" width="80" height="80">
            <Fill color="#00FF00"/>
            <Stroke color="#FF0000" thickness="6"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Center should be green (fill)
      const center = await renderAndSample(page, xml, 50, 50);
      expect(center.g).toBe(255);
      expect(center.r).toBe(0);
      // Edge should be red (stroke) — sample at (12, 12) inside the thick stroke
      const edge = await renderAndSample(page, xml, 12, 12);
      expect(edge.r).toBe(255);
      await page.close();
    });
  });

  describe("Arc", () => {
    it("renders a full circle arc with stroke", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Arc centerX="50" centerY="50" width="80" height="80"
               startAngle="0" endAngle="360">
            <Stroke color="#FF0000" thickness="10"/>
          </Arc>
        </Scene>
      </WatchFace>`;
      // Sample on the arc path (at top: 50, 14)
      const pixel = await renderAndSample(page, xml, 50, 14);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      await page.close();
    });

    it("renders a filled arc", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Arc centerX="50" centerY="50" width="100" height="100"
               startAngle="0" endAngle="360">
            <Fill color="#0000FF"/>
          </Arc>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.b).toBe(255);
      expect(pixel.r).toBe(0);
      await page.close();
    });

    it("renders an arc inside Group > PartDraw (fixture 01 pattern)", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene>
          <Group name="bg" x="0" y="0" width="100" height="100">
            <PartDraw x="0" y="0" width="100" height="100">
              <Arc centerX="50" centerY="50" width="100" height="100"
                   startAngle="0" endAngle="360">
                <Stroke color="#FF0000" thickness="50"/>
              </Arc>
            </PartDraw>
          </Group>
        </Scene>
      </WatchFace>`;
      // Arc radius=50, stroke thickness=50: stroke is centered at y=0 (top),
      // extending from y=-25 (clipped) to y=25. Sample at (50, 10).
      const pixel = await renderAndSample(page, xml, 50, 10);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("renders a counter-clockwise arc", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Arc centerX="50" centerY="50" width="80" height="80"
               startAngle="0" endAngle="90" direction="COUNTER_CLOCKWISE">
            <Stroke color="#00FF00" thickness="6"/>
          </Arc>
        </Scene>
      </WatchFace>`;
      // Left side (9 o'clock = 270 degrees) should have the stroke
      const pixel = await renderAndSample(page, xml, 10, 50);
      expect(pixel.g).toBe(255);
      await page.close();
    });

    it("renders an elliptical arc when width != height", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Arc centerX="50" centerY="50" width="90" height="40"
               startAngle="0" endAngle="360">
            <Fill color="#FFFF00"/>
          </Arc>
        </Scene>
      </WatchFace>`;
      // Center should be yellow
      const center = await renderAndSample(page, xml, 50, 50);
      expect(center.r).toBe(255);
      expect(center.g).toBe(255);
      // Top/bottom edge at (50, 20) should be outside the short axis — still black
      const outside = await renderAndSample(page, xml, 50, 20);
      expect(outside.r).toBe(0);
      expect(outside.g).toBe(0);
      await page.close();
    });
  });
});
