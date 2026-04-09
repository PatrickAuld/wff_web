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
      async ({ xml, x, y }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
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

  describe("RoundRectangle", () => {
    it("renders a filled round rectangle", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <RoundRectangle x="10" y="10" width="80" height="80"
                          cornerRadiusX="15" cornerRadiusY="15">
            <Fill color="#FF00FF"/>
          </RoundRectangle>
        </Scene>
      </WatchFace>`;
      const center = await renderAndSample(page, xml, 50, 50);
      expect(center.r).toBe(255);
      expect(center.b).toBe(255);
      expect(center.g).toBe(0);
      await page.close();
    });

    it("renders a stroked round rectangle", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <RoundRectangle x="10" y="10" width="80" height="80"
                          cornerRadiusX="10" cornerRadiusY="10">
            <Stroke color="#FFFFFF" thickness="4"/>
          </RoundRectangle>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 10);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(255);
      await page.close();
    });
  });

  describe("Ellipse", () => {
    it("renders a filled ellipse", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Ellipse x="10" y="25" width="80" height="50">
            <Fill color="#00FFFF"/>
          </Ellipse>
        </Scene>
      </WatchFace>`;
      const center = await renderAndSample(page, xml, 50, 50);
      expect(center.r).toBe(0);
      expect(center.g).toBe(255);
      expect(center.b).toBe(255);
      await page.close();
    });

    it("does not fill outside the ellipse boundary", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Ellipse x="25" y="10" width="50" height="80">
            <Fill color="#FFFFFF"/>
          </Ellipse>
        </Scene>
      </WatchFace>`;
      const corner = await renderAndSample(page, xml, 5, 5);
      expect(corner.r).toBe(0);
      expect(corner.g).toBe(0);
      expect(corner.b).toBe(0);
      await page.close();
    });
  });

  describe("Line", () => {
    it("renders a stroked line", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Line startX="0" startY="50" endX="100" endY="50">
            <Stroke color="#FFFF00" thickness="10"/>
          </Line>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("renders a line with round cap", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Line startX="20" startY="50" endX="80" endY="50">
            <Stroke color="#FF0000" thickness="20" cap="ROUND"/>
          </Line>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(255);
      await page.close();
    });

    it("renders a dashed line", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Line startX="0" startY="50" endX="100" endY="50">
            <Stroke color="#FFFFFF" thickness="6" dashIntervals="10 10"/>
          </Line>
        </Scene>
      </WatchFace>`;
      const onDash = await renderAndSample(page, xml, 5, 50);
      expect(onDash.r).toBe(255);
      expect(onDash.g).toBe(255);
      const offDash = await renderAndSample(page, xml, 15, 50);
      expect(offDash.r).toBe(0);
      expect(offDash.g).toBe(0);
      await page.close();
    });
  });

  describe("LinearGradient", () => {
    it("fills a rectangle with a left-to-right gradient", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill>
              <LinearGradient startX="0" startY="0" endX="100" endY="0"
                              colors="#FF0000 #0000FF" positions="0 1"/>
            </Fill>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Left side should be red-ish
      const left = await renderAndSample(page, xml, 5, 50);
      expect(left.r).toBeGreaterThan(200);
      expect(left.b).toBeLessThan(50);
      // Right side should be blue-ish
      const right = await renderAndSample(page, xml, 95, 50);
      expect(right.b).toBeGreaterThan(200);
      expect(right.r).toBeLessThan(50);
      await page.close();
    });
  });

  describe("RadialGradient", () => {
    it("fills a rectangle with a center-out gradient", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill>
              <RadialGradient centerX="50" centerY="50" radius="50"
                              colors="#FFFFFF #000000" positions="0 1"/>
            </Fill>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Center should be white-ish
      const center = await renderAndSample(page, xml, 50, 50);
      expect(center.r).toBeGreaterThan(200);
      expect(center.g).toBeGreaterThan(200);
      // Near edge should be dark
      const edge = await renderAndSample(page, xml, 95, 50);
      expect(edge.r).toBeLessThan(50);
      await page.close();
    });
  });

  describe("SweepGradient", () => {
    it("fills a rectangle with a conic/sweep gradient", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill>
              <SweepGradient centerX="50" centerY="50"
                             startAngle="0" endAngle="360"
                             colors="#FF0000 #00FF00 #0000FF #FF0000"
                             positions="0 0.33 0.66 1"/>
            </Fill>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Sample at top-center (12 o'clock = 0 degrees in WFF) — should be red-ish
      const top = await renderAndSample(page, xml, 50, 5);
      expect(top.r).toBeGreaterThan(150);
      // Sample at right (3 o'clock = 90 degrees) — should be green-ish
      const rightSide = await renderAndSample(page, xml, 95, 50);
      expect(rightSide.g).toBeGreaterThan(100);
      await page.close();
    });

    it("clamps a partial sweep gradient outside its end angle", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="120" height="120">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="120" height="120">
            <Fill>
              <SweepGradient centerX="60" centerY="60"
                             startAngle="0" endAngle="180"
                             colors="#FF0000 #0000FF"
                             positions="0 1"/>
            </Fill>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      const top = await renderAndSample(page, xml, 60, 10);
      expect(top.r).toBeGreaterThan(200);
      expect(top.b).toBeLessThan(50);

      const bottom = await renderAndSample(page, xml, 60, 110);
      expect(bottom.b).toBeGreaterThan(200);
      expect(bottom.r).toBeLessThan(50);

      const left = await renderAndSample(page, xml, 10, 60);
      expect(left.b).toBeGreaterThan(200);
      expect(left.r).toBeLessThan(50);
      await page.close();
    });
  });
});
