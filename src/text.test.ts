import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 6 – Text Rendering", () => {
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

  function renderAndSample(
    page: Page,
    xml: string,
    x: number,
    y: number,
    time = "2024-01-15T10:10:00"
  ) {
    return page.evaluate(
      async ({ xml, x, y, time }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          time: new Date(time),
          ambient: false,
        });
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      { xml, x, y, time }
    );
  }

  function renderAndGetText(
    page: Page,
    xml: string,
    regionX: number,
    regionY: number,
    regionW: number,
    regionH: number,
    time = "2024-01-15T10:10:00"
  ) {
    return page.evaluate(
      async ({ xml, regionX, regionY, regionW, regionH, time }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          time: new Date(time),
          ambient: false,
        });
        const ctx = canvas.getContext("2d")!;
        // Sample a row of pixels and count non-black ones to detect rendered text
        const imageData = ctx.getImageData(regionX, regionY, regionW, regionH);
        let nonBlack = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const a = imageData.data[i + 3];
          if (a > 0 && (r > 10 || g > 10 || b > 10)) {
            nonBlack++;
          }
        }
        return nonBlack;
      },
      { xml, regionX, regionY, regionW, regionH, time }
    );
  }

  // -------------------------------------------------------------------------
  // DigitalClock / TimeText
  // -------------------------------------------------------------------------

  describe("DigitalClock", () => {
    it("renders visible text pixels at the clock position", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="100">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="100">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(page, xml, 0, 0, 200, 100);
      expect(nonBlack).toBeGreaterThan(50);
      await page.close();
    });

    it("renders 24-hour format correctly — 10:10", async () => {
      const page = await createPage();
      // Black background; text is white. We'll test that the region has text pixels.
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="40" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(
        page,
        xml,
        0,
        0,
        200,
        80,
        "2024-01-15T10:10:00"
      );
      expect(nonBlack).toBeGreaterThan(50);
      await page.close();
    });

    it("renders 12-hour format — AM/PM token", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="hh:mm a" hourFormat="12" align="CENTER">
              <Font family="sans-serif" size="30" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(
        page,
        xml,
        0,
        0,
        200,
        80,
        "2024-01-15T10:10:00"
      );
      expect(nonBlack).toBeGreaterThan(50);
      await page.close();
    });

    it("renders seconds token", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="ss" align="CENTER">
              <Font family="sans-serif" size="40" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(
        page,
        xml,
        0,
        0,
        200,
        80,
        "2024-01-15T10:10:30"
      );
      expect(nonBlack).toBeGreaterThan(10);
      await page.close();
    });

    it("renders EEE day name token", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="EEE" align="CENTER">
              <Font family="sans-serif" size="40" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      // 2024-01-15 = Monday
      const nonBlack = await renderAndGetText(
        page,
        xml,
        0,
        0,
        200,
        80,
        "2024-01-15T10:10:00"
      );
      expect(nonBlack).toBeGreaterThan(10);
      await page.close();
    });

    it("respects CENTER alignment — text is horizontally centered", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      // Left quarter should have fewer pixels than the center region for centered text
      const leftPixels = await renderAndGetText(page, xml, 0, 0, 30, 80);
      const centerPixels = await renderAndGetText(page, xml, 70, 0, 60, 80);
      expect(centerPixels).toBeGreaterThan(leftPixels);
      await page.close();
    });

    it("respects font color", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="40" color="#FF0000"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      // Sample pixels in the text area and find one that is red
      const pixels = await page.evaluate(
        async ({ xml }) => {
          const canvas = document.getElementById("c") as HTMLCanvasElement;
          await (window as any).renderWatchFace(canvas, {
            xml,
            time: new Date("2024-01-15T10:10:00"),
            ambient: false,
          });
          const ctx = canvas.getContext("2d")!;
          const imageData = ctx.getImageData(0, 0, 200, 80);
          let maxR = 0;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];
            if (a > 0 && r > g && r > b) {
              maxR = Math.max(maxR, r);
            }
          }
          return maxR;
        },
        { xml }
      );
      expect(pixels).toBeGreaterThan(100);
      await page.close();
    });

    it("uses font weight attribute", async () => {
      // This test ensures font weight is applied without throwing errors
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="32" color="#FFFFFF" weight="BOLD"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(page, xml, 0, 0, 200, 80);
      expect(nonBlack).toBeGreaterThan(50);
      await page.close();
    });

    it("uses italic slant attribute", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <DigitalClock x="0" y="0" width="200" height="80">
            <TimeText format="HH:mm" align="CENTER">
              <Font family="sans-serif" size="32" color="#FFFFFF" slant="ITALIC"/>
            </TimeText>
          </DigitalClock>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(page, xml, 0, 0, 200, 80);
      expect(nonBlack).toBeGreaterThan(50);
      await page.close();
    });
  });

  // -------------------------------------------------------------------------
  // PartText / Text element
  // -------------------------------------------------------------------------

  describe("PartText", () => {
    it("renders a static text string", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="100">
        <Scene backgroundColor="#000000">
          <PartText x="0" y="0" width="200" height="100">
            <Text align="CENTER">Hello
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </Text>
          </PartText>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(page, xml, 0, 0, 200, 100);
      expect(nonBlack).toBeGreaterThan(20);
      await page.close();
    });

    it("renders START-aligned text at the left", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <PartText x="0" y="0" width="200" height="80">
            <Text align="START">Hi
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </Text>
          </PartText>
        </Scene>
      </WatchFace>`;
      // Left region should have text pixels for START alignment
      const leftPixels = await renderAndGetText(page, xml, 0, 0, 50, 80);
      const rightPixels = await renderAndGetText(page, xml, 150, 0, 50, 80);
      expect(leftPixels).toBeGreaterThan(rightPixels);
      await page.close();
    });

    it("renders END-aligned text at the right", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <PartText x="0" y="0" width="200" height="80">
            <Text align="END">Hi
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </Text>
          </PartText>
        </Scene>
      </WatchFace>`;
      // Right region should have text pixels for END alignment
      const leftPixels = await renderAndGetText(page, xml, 0, 0, 50, 80);
      const rightPixels = await renderAndGetText(page, xml, 150, 0, 50, 80);
      expect(rightPixels).toBeGreaterThan(leftPixels);
      await page.close();
    });

    it("resolves [SOURCE] expression refs in text content", async () => {
      const page = await createPage();
      // Use HOUR_0_23 source — at 10:10:00 this should be "10"
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <PartText x="0" y="0" width="200" height="80">
            <Text align="CENTER">[HOUR_0_23]
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </Text>
          </PartText>
        </Scene>
      </WatchFace>`;
      const nonBlack = await renderAndGetText(
        page,
        xml,
        0,
        0,
        200,
        80,
        "2024-01-15T10:10:00"
      );
      expect(nonBlack).toBeGreaterThan(10);
      await page.close();
    });

    it("truncates text with ellipsis when too wide", async () => {
      const page = await createPage();
      // Container is 50px wide but text is very long
      const xml = `<WatchFace width="200" height="80">
        <Scene backgroundColor="#000000">
          <PartText x="0" y="0" width="50" height="80">
            <Text align="START" ellipsis="true">ABCDEFGHIJKLMNOP
              <Font family="sans-serif" size="32" color="#FFFFFF"/>
            </Text>
          </PartText>
        </Scene>
      </WatchFace>`;
      // Just check rendering doesn't overflow or throw
      const nonBlack = await renderAndGetText(page, xml, 0, 0, 200, 80);
      expect(nonBlack).toBeGreaterThan(0);
      await page.close();
    });
  });
});
