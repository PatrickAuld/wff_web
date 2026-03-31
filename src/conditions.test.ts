import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 5 – Conditions", () => {
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

  it("Condition renders first truthy Compare branch", async () => {
    const page = await createPage();
    // At 10:10, HOUR_0_23=10, which is >= 6 && < 12 → morning branch (green)
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Expressions>
            <Expression name="hour" expression="[HOUR_0_23]"/>
          </Expressions>
          <Compare expression="[hour] >= 6 &amp;&amp; [hour] &lt; 12">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#00FF00"/>
            </Rectangle>
          </Compare>
          <Compare expression="[hour] >= 12 &amp;&amp; [hour] &lt; 18">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF8C00"/>
            </Rectangle>
          </Compare>
          <Default>
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#191970"/>
            </Rectangle>
          </Default>
        </Condition>
      </Scene>
    </WatchFace>`;
    // 10:10 is morning, should be green
    const pixel = await renderAndSample(page, xml, 50, 50, "2024-01-15T10:10:00");
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(255);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("Condition renders second Compare branch when first is falsy", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Expressions>
            <Expression name="hour" expression="[HOUR_0_23]"/>
          </Expressions>
          <Compare expression="[hour] >= 6 &amp;&amp; [hour] &lt; 12">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#00FF00"/>
            </Rectangle>
          </Compare>
          <Compare expression="[hour] >= 12 &amp;&amp; [hour] &lt; 18">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF8C00"/>
            </Rectangle>
          </Compare>
          <Default>
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#191970"/>
            </Rectangle>
          </Default>
        </Condition>
      </Scene>
    </WatchFace>`;
    // 14:00 is afternoon (>= 12 && < 18) → orange (#FF8C00)
    const pixel = await renderAndSample(page, xml, 50, 50, "2024-01-15T14:00:00");
    expect(pixel.r).toBe(255);
    expect(pixel.g).toBe(140);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("Condition renders Default when no Compare matches", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Expressions>
            <Expression name="hour" expression="[HOUR_0_23]"/>
          </Expressions>
          <Compare expression="[hour] >= 6 &amp;&amp; [hour] &lt; 12">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#00FF00"/>
            </Rectangle>
          </Compare>
          <Compare expression="[hour] >= 12 &amp;&amp; [hour] &lt; 18">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF8C00"/>
            </Rectangle>
          </Compare>
          <Default>
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#0000FF"/>
            </Rectangle>
          </Default>
        </Condition>
      </Scene>
    </WatchFace>`;
    // 02:00 is neither morning nor afternoon → Default (blue)
    const pixel = await renderAndSample(page, xml, 50, 50, "2024-01-15T02:00:00");
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(255);
    await page.close();
  });

  it("Condition renders nothing when no Compare matches and no Default", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Compare expression="0">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF0000"/>
            </Rectangle>
          </Compare>
        </Condition>
      </Scene>
    </WatchFace>`;
    // No match, no Default → black background
    const pixel = await renderAndSample(page, xml, 50, 50);
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("Condition works with named expressions referencing time sources", async () => {
    const page = await createPage();
    // Use MINUTE source: at :10, minute=10 < 30 → first branch (red)
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Expressions>
            <Expression name="m" expression="[MINUTE]"/>
          </Expressions>
          <Compare expression="[m] &lt; 30">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF0000"/>
            </Rectangle>
          </Compare>
          <Default>
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#0000FF"/>
            </Rectangle>
          </Default>
        </Condition>
      </Scene>
    </WatchFace>`;
    // minute=10 < 30 → red
    const early = await renderAndSample(page, xml, 50, 50, "2024-01-15T10:10:00");
    expect(early.r).toBe(255);
    expect(early.g).toBe(0);
    expect(early.b).toBe(0);

    // minute=45 >= 30 → Default (blue)
    const late = await renderAndSample(page, xml, 50, 50, "2024-01-15T10:45:00");
    expect(late.r).toBe(0);
    expect(late.g).toBe(0);
    expect(late.b).toBe(255);
    await page.close();
  });

  it("Condition with no Expressions still works using direct source references", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Condition>
          <Compare expression="[HOUR_0_23] == 10">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FFFF00"/>
            </Rectangle>
          </Compare>
          <Default>
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#000000"/>
            </Rectangle>
          </Default>
        </Condition>
      </Scene>
    </WatchFace>`;
    // hour=10 → yellow
    const pixel = await renderAndSample(page, xml, 50, 50, "2024-01-15T10:10:00");
    expect(pixel.r).toBe(255);
    expect(pixel.g).toBe(255);
    expect(pixel.b).toBe(0);
    await page.close();
  });
});
