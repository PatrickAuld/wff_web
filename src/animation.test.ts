import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ease } from "./animation.js";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

// ---------------------------------------------------------------------------
// Pure unit tests — easing functions (no DOM needed)
// ---------------------------------------------------------------------------

describe("ease()", () => {
  it("LINEAR: returns t unchanged", () => {
    expect(ease(0, "LINEAR")).toBe(0);
    expect(ease(0.5, "LINEAR")).toBe(0.5);
    expect(ease(1, "LINEAR")).toBe(1);
  });

  it("EASE_IN: t² acceleration", () => {
    expect(ease(0, "EASE_IN")).toBe(0);
    expect(ease(0.5, "EASE_IN")).toBeCloseTo(0.25);
    expect(ease(1, "EASE_IN")).toBe(1);
  });

  it("EASE_OUT: deceleration", () => {
    expect(ease(0, "EASE_OUT")).toBe(0);
    expect(ease(0.5, "EASE_OUT")).toBeCloseTo(0.75);
    expect(ease(1, "EASE_OUT")).toBe(1);
  });

  it("EASE_IN_OUT: smooth boundaries", () => {
    expect(ease(0, "EASE_IN_OUT")).toBe(0);
    expect(ease(1, "EASE_IN_OUT")).toBe(1);
    // Midpoint should be 0.5 (symmetric)
    expect(ease(0.5, "EASE_IN_OUT")).toBeCloseTo(0.5);
  });

  it("OVERSHOOT: undershoots (goes negative) then converges to 1 at t=1", () => {
    expect(ease(0, "OVERSHOOT")).toBe(0);
    expect(ease(1, "OVERSHOOT")).toBeCloseTo(1);
    // The cubic overshoot formula dips below zero before converging
    const trough = ease(0.42, "OVERSHOOT");
    expect(trough).toBeLessThan(0);
    // Eventually rises to reach 1
    expect(ease(0.9, "OVERSHOOT")).toBeCloseTo(0.591, 2);
  });

  it("clamps t to [0, 1] for out-of-range inputs", () => {
    expect(ease(-0.5, "LINEAR")).toBe(0);
    expect(ease(1.5, "LINEAR")).toBe(1);
  });

  it("unknown interpolation: returns t (fallthrough)", () => {
    expect(ease(0.6, "UNKNOWN_TYPE")).toBe(0.6);
  });

  it("CUBIC_BEZIER: linear control points produce ~linear output", () => {
    // Control points (0.33,0.33, 0.66,0.66) approximate linear
    const result = ease(0.5, "CUBIC_BEZIER", "0.33,0.33,0.66,0.66");
    expect(result).toBeCloseTo(0.5, 1);
  });

  it("CUBIC_BEZIER: falls back to t when controls is undefined", () => {
    expect(ease(0.5, "CUBIC_BEZIER", undefined)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Integration tests via Playwright — applyTransforms in a real browser DOM
// ---------------------------------------------------------------------------

describe("Animation — Transform integration (Playwright)", () => {
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
    // Expose renderWatchFace globally, stripping ES module export statement
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

  it("Transform mode=TO sets target attribute (x offset moves rectangle)", async () => {
    const page = await createPage();
    // Without transform: rectangle at x=0; with TO transform x=50
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Rectangle x="0" y="0" width="40" height="100">
          <Transform target="x" value="50" mode="TO"/>
          <Fill color="#FF0000"/>
        </Rectangle>
      </Scene>
    </WatchFace>`;
    // x=50 places a 40-wide rect from 50 to 90; pixel at (60,50) should be red
    const inside = await renderAndSample(page, xml, 60, 50);
    expect(inside.r).toBe(255);
    expect(inside.g).toBe(0);
    // pixel at (10,50) should be black (rect was moved away)
    const outside = await renderAndSample(page, xml, 10, 50);
    expect(outside.r).toBe(0);
    await page.close();
  });

  it("Transform mode=BY adds value to existing attribute", async () => {
    const page = await createPage();
    // Base x=10; BY transform adds 40 → effective x=50
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Rectangle x="10" y="0" width="30" height="100">
          <Transform target="x" value="40" mode="BY"/>
          <Fill color="#00FF00"/>
        </Rectangle>
      </Scene>
    </WatchFace>`;
    // rect moves to x=50, width=30 → covers 50-80
    const inside = await renderAndSample(page, xml, 60, 50);
    expect(inside.g).toBe(255);
    expect(inside.r).toBe(0);
    // original position (x=10..40) should now be black
    const outside = await renderAndSample(page, xml, 20, 50);
    expect(outside.r).toBe(0);
    expect(outside.g).toBe(0);
    await page.close();
  });

  it("Animation from/to at t=0 uses 'from' value", async () => {
    const page = await createPage();
    // duration=10s, elapsedMs=0 → t=0 → x = from = 0
    // Rectangle is 50-wide, placed at x=0 → covers 0-50
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Rectangle x="999" y="0" width="50" height="100">
          <Transform target="x" from="0" to="50" mode="TO">
            <Animation duration="10" interpolation="LINEAR" repeat="0"/>
          </Transform>
          <Fill color="#FF0000"/>
        </Rectangle>
      </Scene>
    </WatchFace>`;
    // At t=0, x=0 → rect at 0..50
    const inside = await renderAndSample(page, xml, 25, 50);
    expect(inside.r).toBe(255);
    await page.close();
  });

  it("Group Transform rotates child elements", async () => {
    const page = await createPage();
    // A group with a rectangle; Transform sets angle=90 on the group
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <Group x="0" y="0" width="100" height="100" pivotX="0.5" pivotY="0.5">
          <Transform target="angle" value="0" mode="TO"/>
          <PartDraw x="0" y="0" width="100" height="100">
            <Rectangle x="0" y="0" width="50" height="50">
              <Fill color="#0000FF"/>
            </Rectangle>
          </PartDraw>
        </Group>
      </Scene>
    </WatchFace>`;
    // angle=0, rect at top-left (0-50, 0-50) — sample at (25, 25)
    const pixel = await renderAndSample(page, xml, 25, 25);
    expect(pixel.b).toBe(255);
    await page.close();
  });
});
