import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIST_PATH = resolve(import.meta.dirname, "../dist/index.js");

describe("Phase 7 – Analog Clock", () => {
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

  /**
   * Renders the watch face and samples a pixel at (x, y).
   */
  function renderAndSample(page: Page, xml: string, time: string, x: number, y: number) {
    return page.evaluate(
      async ({ xml, time, x, y }) => {
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
      { xml, time, x, y }
    );
  }

  /**
   * A 100x100 watch face with an AnalogClock (0,0,100,100).
   * The hand is a colored rectangle pointing toward 12 o'clock at 0°.
   * - x=48, y=0, width=4, height=50: a thin vertical bar from the top to center
   * - pivotX=0.5, pivotY=1.0: pivot at the bottom-center of the hand (at canvas center)
   *
   * At 0° (12 o'clock) the rectangle spans x=48..52, y=0..50 in local coords.
   * After rotation the rectangle moves differently based on angle.
   */
  function makeXml(color: string, time: string): string {
    return `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <HourHand x="48" y="0" width="4" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="4" height="50">
              <Rectangle x="0" y="0" width="4" height="50">
                <Fill color="${color}"/>
              </Rectangle>
            </PartDraw>
          </HourHand>
          <MinuteHand x="49" y="0" width="2" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="2" height="50">
              <Rectangle x="0" y="0" width="2" height="50">
                <Fill color="${color}"/>
              </Rectangle>
            </PartDraw>
          </MinuteHand>
          <SecondHand x="49" y="0" width="2" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="2" height="50">
              <Rectangle x="0" y="0" width="2" height="50">
                <Fill color="${color}"/>
              </Rectangle>
            </PartDraw>
          </SecondHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;
  }

  it("SecondHand at 15s rotates 90° to 3 o'clock position", async () => {
    // SecondHand angle = 15 * 6 = 90°
    // The hand starts pointing at 12 (top), pivot at center (50,50).
    // After 90° CW rotation, the top of the hand is now at (100, 50) — pointing right.
    // Sample at (75, 50): should be the hand color (white/255,255,255)
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <SecondHand x="49" y="0" width="2" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="2" height="50">
              <Rectangle x="0" y="0" width="2" height="50">
                <Fill color="#FFFFFF"/>
              </Rectangle>
            </PartDraw>
          </SecondHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;

    // At t=15s, angle=90°, hand points right from center (50,50)
    // Sample at (75, 50) — mid-point of the rotated hand
    const pixel = await renderAndSample(page, xml, "2024-01-15T10:10:15", 75, 50);
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeGreaterThan(200);
    expect(pixel.b).toBeGreaterThan(200);

    // The 12 o'clock position should be black (hand has rotated away)
    const top = await renderAndSample(page, xml, "2024-01-15T10:10:15", 50, 25);
    expect(top.r).toBe(0);
    expect(top.g).toBe(0);
    expect(top.b).toBe(0);

    await page.close();
  });

  it("MinuteHand at 30 minutes rotates 180° to 6 o'clock position", async () => {
    // MinuteHand angle = (30 + 0/60) * 6 = 180°
    // Hand starts at 12 o'clock (top), after 180° it points down (6 o'clock).
    // Sample at (50, 75): should be the hand color
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <MinuteHand x="49" y="0" width="2" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="2" height="50">
              <Rectangle x="0" y="0" width="2" height="50">
                <Fill color="#FFFFFF"/>
              </Rectangle>
            </PartDraw>
          </MinuteHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;

    // At t=30min, angle=180°, hand points down from center (50,50)
    const pixel = await renderAndSample(page, xml, "2024-01-15T10:30:00", 50, 75);
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeGreaterThan(200);
    expect(pixel.b).toBeGreaterThan(200);

    // The 12 o'clock position should be black
    const top = await renderAndSample(page, xml, "2024-01-15T10:30:00", 50, 25);
    expect(top.r).toBe(0);
    expect(top.g).toBe(0);
    expect(top.b).toBe(0);

    await page.close();
  });

  it("HourHand at 3:00 rotates 90° to 3 o'clock position", async () => {
    // HourHand angle = ((3 % 12) + 0/60) * 30 = 90°
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <HourHand x="48" y="0" width="4" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="4" height="50">
              <Rectangle x="0" y="0" width="4" height="50">
                <Fill color="#FFFFFF"/>
              </Rectangle>
            </PartDraw>
          </HourHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;

    // At 3:00, angle=90°, hand points right from center
    const pixel = await renderAndSample(page, xml, "2024-01-15T03:00:00", 75, 50);
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeGreaterThan(200);
    expect(pixel.b).toBeGreaterThan(200);

    await page.close();
  });

  it("HourHand at 6:30 rotates 195° (between 6 and 7 o'clock)", async () => {
    // HourHand angle = ((6 % 12) + 30/60) * 30 = (6.5) * 30 = 195°
    // 195° is 15° past 180° (6 o'clock), so slightly toward 9 o'clock
    // The hand tip is at ~sin(195°)*50 = ~-12.9 from center horizontally
    //                       ~cos(195°)*50 = ~48.3 from center vertically (downward, so y=50+48=98)
    // Sample below center-left: approximately (50 + sin(195°)*25, 50 + |cos(195°)|*25)
    // sin(195°) ≈ -0.259, cos(195°) ≈ -0.966
    // midpoint of hand at 195°: (50 + (-0.259)*25, 50 + (-0.966)*25) ≈ (43.5, 25.8)
    // But pivot is at bottom of hand (y=1.0), so rotation is around bottom edge
    // After 195° rotation, bottom stays at (50,50), top end moves to:
    //   x=50 + sin(195°)*50 ≈ 50 - 12.9 = 37
    //   y=50 - cos(195°)*50 ≈ 50 + 48.3 = 98
    // So midpoint of hand ≈ (43.5, 74)
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <HourHand x="48" y="0" width="4" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="4" height="50">
              <Rectangle x="0" y="0" width="4" height="50">
                <Fill color="#FFFFFF"/>
              </Rectangle>
            </PartDraw>
          </HourHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;

    // At 6:30, hand should be rotated 195°. The tip should be left and below center.
    // Check that 12 o'clock is black (hand rotated away)
    const top = await renderAndSample(page, xml, "2024-01-15T06:30:00", 50, 25);
    expect(top.r).toBe(0);
    expect(top.g).toBe(0);
    expect(top.b).toBe(0);

    // Check that right side (90°) is also black
    const right = await renderAndSample(page, xml, "2024-01-15T06:30:00", 75, 50);
    expect(right.r).toBe(0);
    expect(right.g).toBe(0);
    expect(right.b).toBe(0);

    await page.close();
  });

  it("Hand with PartDraw child renders without resource image", async () => {
    // Ensure PartDraw children render correctly (no resource attribute)
    // SecondHand at 0s (0°) — hand points at 12 o'clock
    const page = await createPage();
    const xml = `<WatchFace width="100" height="100">
      <Scene backgroundColor="#000000">
        <AnalogClock x="0" y="0" width="100" height="100">
          <SecondHand x="48" y="0" width="4" height="50" pivotX="0.5" pivotY="1.0">
            <PartDraw x="0" y="0" width="4" height="50">
              <Rectangle x="0" y="0" width="4" height="50">
                <Fill color="#FF0000"/>
              </Rectangle>
            </PartDraw>
          </SecondHand>
        </AnalogClock>
      </Scene>
    </WatchFace>`;

    // At t=0s, angle=0°, hand points at 12 o'clock (top center).
    // Sample at (50, 25) — mid-point of the hand at 12 o'clock
    const pixel = await renderAndSample(page, xml, "2024-01-15T10:10:00", 50, 25);
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeLessThan(50);
    expect(pixel.b).toBeLessThan(50);

    await page.close();
  });
});
