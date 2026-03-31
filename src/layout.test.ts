import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 3 – Layout & Transforms", () => {
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

  describe("Group positioning", () => {
    it("translates group children by x,y", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="100" y="100" width="50" height="50">
            <Rectangle x="0" y="0" width="50" height="50">
              <Fill color="#FF0000"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      // Rectangle at group offset: should be red at (110, 110)
      const inside = await renderAndSample(page, xml, 110, 110);
      expect(inside.r).toBe(255);
      expect(inside.g).toBe(0);
      expect(inside.b).toBe(0);
      // Origin (0,0) should be black (no content there)
      const outside = await renderAndSample(page, xml, 10, 10);
      expect(outside.r).toBe(0);
      expect(outside.g).toBe(0);
      expect(outside.b).toBe(0);
      await page.close();
    });

    it("renders a group at the origin with x=0 y=0", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#00FF00"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(0);
      await page.close();
    });
  });

  describe("Group rotation", () => {
    it("rotates group contents by angle degrees", async () => {
      const page = await createPage();
      // A tall thin rectangle at x=45,y=0,w=10,h=50 inside a 100x100 group.
      // Without rotation its center is at (50, 25).
      // With 90-degree rotation around center (50,50), top → right:
      // (50,25) rotates to (75, 50).
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100" angle="90">
            <Rectangle x="45" y="0" width="10" height="50">
              <Fill color="#FF0000"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      // After 90-degree rotation, the rectangle should appear on the right side
      const rotated = await renderAndSample(page, xml, 75, 50);
      expect(rotated.r).toBe(255);
      expect(rotated.g).toBe(0);
      // Original pre-rotation position should be black
      const original = await renderAndSample(page, xml, 50, 10);
      expect(original.r).toBe(0);
      await page.close();
    });
  });

  describe("Group alpha", () => {
    it("renders group with reduced alpha (semi-transparent)", async () => {
      const page = await createPage();
      // Group alpha=128 (~50%) over black background: red at 50% → ~128 R value
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100" alpha="128">
            <Rectangle x="0" y="0" width="100" height="100">
              <Fill color="#FF0000"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      const pixel = await renderAndSample(page, xml, 50, 50);
      // Alpha ~128/255 ≈ 0.502; composited over black → R ≈ 128
      expect(pixel.r).toBeGreaterThan(100);
      expect(pixel.r).toBeLessThan(160);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("renders group with full alpha=255 (opaque)", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100" alpha="255">
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
  });

  describe("Group scale", () => {
    it("scales group content with scaleX/scaleY", async () => {
      const page = await createPage();
      // A 100x100 rectangle inside a group scaled to 0.5 around center (50,50).
      // The scaled rectangle occupies the center 50x50 region of the group.
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="200" height="200" scaleX="0.5" scaleY="0.5">
            <Rectangle x="0" y="0" width="200" height="200">
              <Fill color="#FFFF00"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      // After scaling 0.5 around center (100,100), the 200x200 rect → 100x100
      // occupying (50,50)-(150,150). Center (100,100) should be yellow.
      const center = await renderAndSample(page, xml, 100, 100);
      expect(center.r).toBe(255);
      expect(center.g).toBe(255);
      expect(center.b).toBe(0);
      // Far corner (10, 10) should be black (outside scaled rect)
      const corner = await renderAndSample(page, xml, 10, 10);
      expect(corner.r).toBe(0);
      expect(corner.g).toBe(0);
      await page.close();
    });
  });

  describe("Nested groups", () => {
    it("composes transforms from nested groups", async () => {
      const page = await createPage();
      // Outer group translates to (50,50), inner group translates to (25,25)
      // Rectangle at (0,0) should end up at (75,75)
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="50" y="50" width="100" height="100">
            <Group x="25" y="25" width="50" height="50">
              <Rectangle x="0" y="0" width="30" height="30">
                <Fill color="#FF00FF"/>
              </Rectangle>
            </Group>
          </Group>
        </Scene>
      </WatchFace>`;
      // Rectangle should be at (75,75) → (105,105)
      const inside = await renderAndSample(page, xml, 85, 85);
      expect(inside.r).toBe(255);
      expect(inside.b).toBe(255);
      expect(inside.g).toBe(0);
      // Position (55, 55) should be black (before inner group offset)
      const outside = await renderAndSample(page, xml, 55, 55);
      expect(outside.r).toBe(0);
      expect(outside.g).toBe(0);
      await page.close();
    });
  });

  describe("PartDraw", () => {
    it("renders PartDraw identically to Group", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <PartDraw x="60" y="60" width="80" height="80">
            <Rectangle x="0" y="0" width="80" height="80">
              <Fill color="#00FFFF"/>
            </Rectangle>
          </PartDraw>
        </Scene>
      </WatchFace>`;
      // Rectangle inside PartDraw should be at (60,60)→(140,140)
      const inside = await renderAndSample(page, xml, 100, 100);
      expect(inside.r).toBe(0);
      expect(inside.g).toBe(255);
      expect(inside.b).toBe(255);
      // Before offset should be black
      const before = await renderAndSample(page, xml, 30, 30);
      expect(before.r).toBe(0);
      expect(before.g).toBe(0);
      await page.close();
    });

    it("applies PartDraw inside Group (nested container types)", async () => {
      const page = await createPage();
      const xml = `<WatchFace width="200" height="200">
        <Scene backgroundColor="#000000">
          <Group x="20" y="20" width="160" height="160">
            <PartDraw x="30" y="30" width="100" height="100">
              <Rectangle x="0" y="0" width="50" height="50">
                <Fill color="#FF8000"/>
              </Rectangle>
            </PartDraw>
          </Group>
        </Scene>
      </WatchFace>`;
      // Rectangle ends up at (20+30, 20+30) = (50, 50)
      const inside = await renderAndSample(page, xml, 60, 60);
      expect(inside.r).toBe(255);
      expect(inside.g).toBeGreaterThan(100);
      expect(inside.b).toBe(0);
      await page.close();
    });
  });

  describe("Default pivot", () => {
    it("uses center pivot (0.5, 0.5) by default for rotation", async () => {
      const page = await createPage();
      // 100x100 group, 180-degree rotation around center (50,50).
      // A small rect at (10,10) w=20 h=20 should map to (70,70) w=20 h=20.
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Group x="0" y="0" width="100" height="100" angle="180">
            <Rectangle x="10" y="10" width="20" height="20">
              <Fill color="#FFFFFF"/>
            </Rectangle>
          </Group>
        </Scene>
      </WatchFace>`;
      // After 180-degree rotation: (10,10)→(70,70), (30,30)→(50,50)
      const rotated = await renderAndSample(page, xml, 80, 80);
      expect(rotated.r).toBe(255);
      expect(rotated.g).toBe(255);
      // Original position should be black
      const original = await renderAndSample(page, xml, 20, 20);
      expect(original.r).toBe(0);
      await page.close();
    });
  });
});
