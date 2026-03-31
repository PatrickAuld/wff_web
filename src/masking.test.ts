import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 9 – Masking & Blend Modes", () => {
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

  describe("blendMode", () => {
    it("applies MULTIPLY blend mode to a rectangle", async () => {
      const page = await createPage();
      // Draw a white rectangle, then multiply a red rectangle on top.
      // white (255,255,255) * red (255,0,0) / 255 = (255,0,0)
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#FFFFFF">
          <Rectangle x="0" y="0" width="100" height="100" blendMode="MULTIPLY">
            <Fill color="#FF0000"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      // Multiply on white gives the same color as the top layer
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("applies SCREEN blend mode to overlapping rectangles", async () => {
      const page = await createPage();
      // Screen: result = 1 - (1-a)(1-b). Black (0) screened with anything = anything.
      // White (255) screened with anything = white (255).
      // Draw black background, then screen a grey rectangle → should be brighter than grey
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#404040">
          <Rectangle x="0" y="0" width="100" height="100" blendMode="SCREEN">
            <Fill color="#404040"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      // Screen of #404040 on #404040: 1-(1-64/255)^2 ≈ 1-0.747^2 ≈ 1-0.558 = 0.442 ≈ 113
      expect(pixel.r).toBeGreaterThan(64);  // brighter than either source
      expect(pixel.r).toBeLessThan(200);
      await page.close();
    });

    it("SRC_OVER is the default behavior (no change)", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="0" y="0" width="100" height="100" blendMode="SRC_OVER">
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

  describe("renderMode masking", () => {
    it("SOURCE/MASK compositing — only intersection is visible", async () => {
      const page = await createPage();
      // Red rectangle (SOURCE) masked by an ellipse (MASK).
      // Inside intersection → red; outside rectangle → transparent (black bg);
      // outside ellipse but inside rect → also transparent (black bg).
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="50" y="50" width="100" height="100">
            <!-- Full red square as SOURCE -->
            <Rectangle x="0" y="0" width="100" height="100" renderMode="SOURCE">
              <Fill color="#FF0000"/>
            </Rectangle>
            <!-- Ellipse in upper-left quadrant only as MASK -->
            <Ellipse x="0" y="0" width="50" height="50" renderMode="MASK">
              <Fill color="#FFFFFF"/>
            </Ellipse>
          </Group>
        </Scene>
      </WatchFace>`;

      // Inside intersection (upper-left quadrant of the group → canvas coords ~60,60)
      const inside = await renderAndSample(page, xml, 60, 60);
      expect(inside.r).toBe(255);
      expect(inside.g).toBe(0);
      expect(inside.b).toBe(0);

      // Outside the ellipse but inside the rect (lower-right → canvas coords ~130,130)
      // Should be masked out → black background
      const outsideEllipse = await renderAndSample(page, xml, 130, 130);
      expect(outsideEllipse.r).toBe(0);
      expect(outsideEllipse.g).toBe(0);
      expect(outsideEllipse.b).toBe(0);

      await page.close();
    });

    it("no renderMode attribute renders normally (treated as SOURCE by default)", async () => {
      const page = await createPage();
      // Group with children having no renderMode — should render as normal
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#0000FF"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(255);
      await page.close();
    });

    it("ALL renderMode renders on top of masked content", async () => {
      const page = await createPage();
      // Red rectangle SOURCE, masked by ellipse in lower half only.
      // Green rectangle with ALL renders on top regardless of mask.
      // The green ALL rectangle covers only the right half.
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="200" height="200">
            <!-- Full blue square as SOURCE -->
            <Rectangle x="0" y="0" width="200" height="200" renderMode="SOURCE">
              <Fill color="#0000FF"/>
            </Rectangle>
            <!-- MASK: only left half -->
            <Rectangle x="0" y="0" width="100" height="200" renderMode="MASK">
              <Fill color="#FFFFFF"/>
            </Rectangle>
            <!-- ALL: small green box in center - renders on top -->
            <Rectangle x="80" y="80" width="40" height="40" renderMode="ALL">
              <Fill color="#00FF00"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;

      // Left half (inside mask) should be blue
      const leftHalf = await renderAndSample(page, xml, 40, 100);
      expect(leftHalf.r).toBe(0);
      expect(leftHalf.g).toBe(0);
      expect(leftHalf.b).toBe(255);

      // Right half (outside mask) should be black (masked out)
      const rightHalf = await renderAndSample(page, xml, 150, 100);
      expect(rightHalf.r).toBe(0);
      expect(rightHalf.g).toBe(0);
      expect(rightHalf.b).toBe(0);

      // ALL rectangle center should be green (rendered on top)
      const allRect = await renderAndSample(page, xml, 100, 100);
      expect(allRect.r).toBe(0);
      expect(allRect.g).toBe(255);
      expect(allRect.b).toBe(0);

      await page.close();
    });
  });
});
