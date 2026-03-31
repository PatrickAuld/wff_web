import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 5 – Variants", () => {
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
    ambient = false
  ) {
    return page.evaluate(
      async ({ xml, x, y, ambient }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        await (window as any).renderWatchFace(canvas, {
          xml,
          time: new Date("2024-01-15T10:10:00"),
          ambient,
        });
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      { xml, x, y, ambient }
    );
  }

  it("Variant with mode=AMBIENT overrides target attribute when ambient=true", async () => {
    const page = await createPage();
    // Group has alpha=255 normally, but Variant overrides alpha to 0 in ambient mode
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Group x="0" y="0" width="100" height="100" alpha="255">
          <Variant mode="AMBIENT" target="alpha" value="0"/>
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill color="#FF0000"/>
          </Rectangle>
        </Group>
      </Scene>
    </WatchFace>`;
    // In ambient mode with alpha=0, the red rect should be invisible
    const pixel = await renderAndSample(page, xml, 50, 50, true);
    expect(pixel.r).toBe(0);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("Variant with mode=AMBIENT does nothing when ambient=false", async () => {
    const page = await createPage();
    // Group has alpha=255 normally, Variant would override to 0 in ambient
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Group x="0" y="0" width="100" height="100" alpha="255">
          <Variant mode="AMBIENT" target="alpha" value="0"/>
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill color="#FF0000"/>
          </Rectangle>
        </Group>
      </Scene>
    </WatchFace>`;
    // NOT ambient — should render at full alpha (red visible)
    const pixel = await renderAndSample(page, xml, 50, 50, false);
    expect(pixel.r).toBe(255);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("Variant reduces alpha to half in ambient mode", async () => {
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Group x="0" y="0" width="100" height="100" alpha="255">
          <Variant mode="AMBIENT" target="alpha" value="128"/>
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill color="#FF0000"/>
          </Rectangle>
        </Group>
      </Scene>
    </WatchFace>`;
    // In ambient mode, alpha=128 (~50%) over black → R ≈ 128
    const pixel = await renderAndSample(page, xml, 50, 50, true);
    expect(pixel.r).toBeGreaterThan(100);
    expect(pixel.r).toBeLessThan(160);
    expect(pixel.g).toBe(0);
    expect(pixel.b).toBe(0);
    await page.close();
  });

  it("multiple Variants — only AMBIENT variant applies when ambient=true", async () => {
    const page = await createPage();
    // If we had a hypothetical second mode variant it should be ignored
    // Here we test that the AMBIENT override wins over the default alpha=255
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Group x="0" y="0" width="100" height="100" alpha="255">
          <Variant mode="AMBIENT" target="alpha" value="64"/>
          <Rectangle x="0" y="0" width="100" height="100">
            <Fill color="#FF0000"/>
          </Rectangle>
        </Group>
      </Scene>
    </WatchFace>`;
    // alpha=64 (~25%) over black → R ≈ 64
    const pixel = await renderAndSample(page, xml, 50, 50, true);
    expect(pixel.r).toBeGreaterThan(40);
    expect(pixel.r).toBeLessThan(90);
    await page.close();
  });
});
