# Phase 2: Shape Primitives & Styling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all WFF drawing shapes (Arc, Rectangle, RoundRectangle, Ellipse, Line) and their styling (Fill, Stroke, gradients) so the renderer can draw visual content onto the Phase 1 canvas.

**Architecture:** New modules `src/color.ts`, `src/styles.ts`, `src/shapes.ts` contain pure functions that take a `CanvasRenderingContext2D` and an XML `Element`. `src/index.ts` gains a tree walker that recurses through Scene children (passing through Group/PartDraw without applying transforms) and dispatches to shape renderers. Tests run in Playwright's browser context via the existing pattern in `src/index.test.ts`.

**Tech Stack:** TypeScript, Canvas2D API, vitest, Playwright (browser context for tests)

**Important pattern:** Tests in this project run the built ESM bundle inside a Playwright browser page. The test `beforeAll` reads `dist/index.js`, rewrites the ESM export to assign to `window`, then evaluates it. You must run `pnpm build` before running tests. All new modules must be imported/re-exported through `src/index.ts` so they appear in the bundle.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/color.ts` | `parseColor()` — converts WFF hex colors (`#RRGGBB`, `#AARRGGBB`) to CSS color strings |
| `src/styles.ts` | `applyFill()`, `applyStroke()` — read Fill/Stroke child elements and configure canvas context; gradient creation helpers |
| `src/shapes.ts` | `renderArc()`, `renderRectangle()`, `renderRoundRectangle()`, `renderEllipse()`, `renderLine()` — build canvas paths and delegate to styles |
| `src/index.ts` | Add `renderElement()` tree walker; call it after background fill to render Scene children |
| `src/color.test.ts` | Tests for color parsing |
| `src/shapes.test.ts` | Tests for shapes, styles, gradients (browser context) |

---

### Task 1: Color Parsing

**Files:**
- Create: `src/color.ts`
- Create: `src/color.test.ts`

- [ ] **Step 1: Write failing tests for parseColor**

Create `src/color.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseColor } from "./color.js";

describe("parseColor", () => {
  it("passes through 6-digit hex unchanged", () => {
    expect(parseColor("#FF0000")).toBe("#FF0000");
  });

  it("passes through lowercase 6-digit hex", () => {
    expect(parseColor("#ff0000")).toBe("#ff0000");
  });

  it("converts 8-digit AARRGGBB to rgba", () => {
    // #80FF0000 = alpha 128/255 ≈ 0.502, red 255, green 0, blue 0
    expect(parseColor("#80FF0000")).toBe("rgba(255, 0, 0, 0.502)");
  });

  it("converts fully opaque 8-digit to rgba", () => {
    expect(parseColor("#FF00FF00")).toBe("rgba(0, 255, 0, 1)");
  });

  it("converts fully transparent 8-digit to rgba", () => {
    expect(parseColor("#0000FF00")).toBe("rgba(0, 255, 0, 0)");
  });

  it("returns black for null", () => {
    expect(parseColor(null)).toBe("#000000");
  });

  it("returns black for undefined", () => {
    expect(parseColor(undefined)).toBe("#000000");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm build && pnpm test -- src/color.test.ts`
Expected: FAIL — `parseColor` does not exist yet.

- [ ] **Step 3: Implement parseColor**

Create `src/color.ts`:

```typescript
export function parseColor(value: string | null | undefined): string {
  if (value == null) return "#000000";

  // 8-digit AARRGGBB format: #AARRGGBB
  if (value.length === 9 && value.startsWith("#")) {
    const a = parseInt(value.slice(1, 3), 16);
    const r = parseInt(value.slice(3, 5), 16);
    const g = parseInt(value.slice(5, 7), 16);
    const b = parseInt(value.slice(7, 9), 16);
    const alpha = Number((a / 255).toFixed(3));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // 6-digit RRGGBB format: #RRGGBB — CSS-compatible, pass through
  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm build && pnpm test -- src/color.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/color.ts src/color.test.ts
git commit -m "feat: add parseColor for WFF ARGB/RGB hex colors"
```

---

### Task 2: Fill & Stroke Styling

**Files:**
- Create: `src/styles.ts`
- Modify: `src/index.ts` — add re-export
- Create: `src/shapes.test.ts` — first batch of style tests

- [ ] **Step 1: Write failing tests for applyFill and applyStroke**

Create `src/shapes.test.ts`. This file uses the same Playwright browser-context pattern as `src/index.test.ts`. All shape and style tests go in this file.

```typescript
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
      // Thick stroke on a rectangle — sample at the edge where stroke is drawn
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Rectangle x="10" y="10" width="80" height="80">
            <Stroke color="#FF0000" thickness="10"/>
          </Rectangle>
        </Scene>
      </WatchFace>`;
      // Sample at (10, 10) — on the stroke boundary
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
      // Edge should be red (stroke) — sample at (11, 11) inside the thick stroke
      const edge = await renderAndSample(page, xml, 12, 12);
      expect(edge.r).toBe(255);
      await page.close();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm build && pnpm test -- src/shapes.test.ts`
Expected: FAIL — `renderWatchFace` does not render shapes yet.

- [ ] **Step 3: Implement applyFill and applyStroke**

Create `src/styles.ts`:

```typescript
import { parseColor } from "./color.js";

export function applyFill(ctx: CanvasRenderingContext2D, el: Element): void {
  const fillEl = el.querySelector(":scope > Fill");
  if (!fillEl) return;

  // Check for gradient children first
  const gradient = createGradient(ctx, fillEl);
  if (gradient) {
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = parseColor(fillEl.getAttribute("color"));
  }
  ctx.fill();
}

export function applyStroke(ctx: CanvasRenderingContext2D, el: Element): void {
  const strokeEl = el.querySelector(":scope > Stroke");
  if (!strokeEl) return;

  ctx.strokeStyle = parseColor(strokeEl.getAttribute("color"));
  ctx.lineWidth = parseFloat(strokeEl.getAttribute("thickness") ?? "1");

  const cap = strokeEl.getAttribute("cap");
  if (cap === "ROUND") ctx.lineCap = "round";
  else if (cap === "SQUARE") ctx.lineCap = "square";
  else ctx.lineCap = "butt";

  const dashAttr = strokeEl.getAttribute("dashIntervals");
  if (dashAttr) {
    ctx.setLineDash(dashAttr.split(/\s+/).map(Number));
  } else {
    ctx.setLineDash([]);
  }

  ctx.lineDashOffset = parseFloat(
    strokeEl.getAttribute("dashPhase") ?? "0"
  );

  ctx.stroke();
}

export function createGradient(
  ctx: CanvasRenderingContext2D,
  fillEl: Element
): CanvasGradient | null {
  const linear = fillEl.querySelector(":scope > LinearGradient");
  if (linear) {
    return createLinearGradient(ctx, linear);
  }

  const radial = fillEl.querySelector(":scope > RadialGradient");
  if (radial) {
    return createRadialGradient(ctx, radial);
  }

  const sweep = fillEl.querySelector(":scope > SweepGradient");
  if (sweep) {
    return createSweepGradient(ctx, sweep);
  }

  return null;
}

function addColorStops(
  gradient: CanvasGradient,
  el: Element
): CanvasGradient {
  const colorsAttr = el.getAttribute("colors") ?? "";
  const positionsAttr = el.getAttribute("positions") ?? "";
  const colors = colorsAttr.split(/\s+/).filter(Boolean);
  const positions = positionsAttr.split(/\s+/).filter(Boolean).map(Number);

  for (let i = 0; i < colors.length; i++) {
    const pos = i < positions.length ? positions[i] : i / (colors.length - 1);
    gradient.addColorStop(pos, parseColor(colors[i]));
  }
  return gradient;
}

function createLinearGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const x0 = parseFloat(el.getAttribute("startX") ?? "0");
  const y0 = parseFloat(el.getAttribute("startY") ?? "0");
  const x1 = parseFloat(el.getAttribute("endX") ?? "0");
  const y1 = parseFloat(el.getAttribute("endY") ?? "0");
  return addColorStops(ctx.createLinearGradient(x0, y0, x1, y1), el);
}

function createRadialGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const r = parseFloat(el.getAttribute("radius") ?? "0");
  return addColorStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, r), el);
}

function createSweepGradient(
  ctx: CanvasRenderingContext2D,
  el: Element
): CanvasGradient {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const startAngle = parseFloat(el.getAttribute("startAngle") ?? "0");
  // WFF: 0 = 12 o'clock. Conic gradient: 0 = 3 o'clock. Offset by -90 degrees.
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  return addColorStops(ctx.createConicGradient(startRad, cx, cy), el);
}
```

- [ ] **Step 4: Implement Rectangle shape and tree walker**

Create `src/shapes.ts`:

```typescript
import { applyFill, applyStroke } from "./styles.js";

export function renderElement(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const tag = el.tagName;

  switch (tag) {
    case "Group":
    case "PartDraw":
      // Phase 2: pass through containers without applying transforms
      for (const child of el.children) {
        renderElement(ctx, child);
      }
      break;
    case "Arc":
      renderArc(ctx, el);
      break;
    case "Rectangle":
      renderRectangle(ctx, el);
      break;
    case "RoundRectangle":
      renderRoundRectangle(ctx, el);
      break;
    case "Ellipse":
      renderEllipse(ctx, el);
      break;
    case "Line":
      renderLine(ctx, el);
      break;
  }
}

function renderRectangle(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  ctx.beginPath();
  ctx.rect(x, y, w, h);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderRoundRectangle(
  ctx: CanvasRenderingContext2D,
  el: Element
): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const rx = parseFloat(el.getAttribute("cornerRadiusX") ?? "0");
  const ry = parseFloat(el.getAttribute("cornerRadiusY") ?? rx.toString());

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [rx, ry]);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderArc(ctx: CanvasRenderingContext2D, el: Element): void {
  const cx = parseFloat(el.getAttribute("centerX") ?? "0");
  const cy = parseFloat(el.getAttribute("centerY") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");
  const startAngle = parseFloat(el.getAttribute("startAngle") ?? "0");
  const endAngle = parseFloat(el.getAttribute("endAngle") ?? "360");
  const direction = el.getAttribute("direction") ?? "CLOCKWISE";

  // WFF: 0 degrees = 12 o'clock (top). Canvas: 0 = 3 o'clock (right).
  // Offset by -90 degrees.
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const counterclockwise = direction === "COUNTER_CLOCKWISE";

  ctx.beginPath();
  if (w === h) {
    ctx.arc(cx, cy, w / 2, startRad, endRad, counterclockwise);
  } else {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, startRad, endRad, counterclockwise);
  }
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderEllipse(ctx: CanvasRenderingContext2D, el: Element): void {
  const x = parseFloat(el.getAttribute("x") ?? "0");
  const y = parseFloat(el.getAttribute("y") ?? "0");
  const w = parseFloat(el.getAttribute("width") ?? "0");
  const h = parseFloat(el.getAttribute("height") ?? "0");

  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  applyFill(ctx, el);
  applyStroke(ctx, el);
}

function renderLine(ctx: CanvasRenderingContext2D, el: Element): void {
  const x1 = parseFloat(el.getAttribute("startX") ?? "0");
  const y1 = parseFloat(el.getAttribute("startY") ?? "0");
  const x2 = parseFloat(el.getAttribute("endX") ?? "0");
  const y2 = parseFloat(el.getAttribute("endY") ?? "0");

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  // Lines only support stroke, not fill
  applyStroke(ctx, el);
}
```

- [ ] **Step 5: Wire tree walker into renderWatchFace in index.ts**

Modify `src/index.ts` — add import and call renderElement after background fill:

Add at top of file:
```typescript
import { renderElement } from "./shapes.js";
```

After the background fill block (`ctx.fillRect(0, 0, width, height);`), add:

```typescript
  // Walk Scene children and render shapes
  if (scene) {
    for (const child of scene.children) {
      renderElement(ctx, child);
    }
  }
```

The exports remain unchanged — `renderElement` is internal.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm build && pnpm test -- src/shapes.test.ts`
Expected: All Fill and Stroke tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/styles.ts src/shapes.ts src/index.ts src/shapes.test.ts
git commit -m "feat: add Fill, Stroke styling and Rectangle shape with tree walker"
```

---

### Task 3: Arc Shape

**Files:**
- Modify: `src/shapes.test.ts` — add Arc tests

- [ ] **Step 1: Write failing tests for Arc**

Append to the `Phase 2 – Shapes & Styles` describe block in `src/shapes.test.ts`:

```typescript
  describe("Arc", () => {
    it("renders a full circle arc with stroke", async () => {
      const page = await createPage();
      // Full circle arc with red stroke — should fill area around center
      const xml = `<WatchFace width="100" height="100">
        <Scene backgroundColor="#000000">
          <Arc centerX="50" centerY="50" width="80" height="80"
               startAngle="0" endAngle="360">
            <Stroke color="#FF0000" thickness="10"/>
          </Arc>
        </Scene>
      </WatchFace>`;
      // Sample on the arc path (at top: 50, 10)
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
      // Thick stroke fills the entire circle area — center should be red
      const pixel = await renderAndSample(page, xml, 50, 50);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
      await page.close();
    });

    it("renders a counter-clockwise arc", async () => {
      const page = await createPage();
      // CCW arc from 0 to 90 degrees — draws the major arc (270 degrees of arc)
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
```

- [ ] **Step 2: Run tests to verify they pass**

Arc is already implemented in Task 2's `src/shapes.ts`. Run: `pnpm build && pnpm test -- src/shapes.test.ts`
Expected: All Arc tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shapes.test.ts
git commit -m "test: add Arc shape tests including elliptical and counter-clockwise"
```

---

### Task 4: RoundRectangle, Ellipse, and Line

**Files:**
- Modify: `src/shapes.test.ts` — add remaining shape tests

- [ ] **Step 1: Write tests for RoundRectangle, Ellipse, and Line**

Append to the `Phase 2 – Shapes & Styles` describe block in `src/shapes.test.ts`:

```typescript
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
      // Center should be magenta
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
      // Top edge at midpoint should have white stroke
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
      // Center should be cyan
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
      // Corner should remain black
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
      // Midpoint of the horizontal line should be yellow
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
      // Middle of line should be red
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
      // At x=5 (middle of first dash), should be white
      const onDash = await renderAndSample(page, xml, 5, 50);
      expect(onDash.r).toBe(255);
      expect(onDash.g).toBe(255);
      // At x=15 (middle of first gap), should be black
      const offDash = await renderAndSample(page, xml, 15, 50);
      expect(offDash.r).toBe(0);
      expect(offDash.g).toBe(0);
      await page.close();
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

All shapes are already implemented in Task 2. Run: `pnpm build && pnpm test -- src/shapes.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shapes.test.ts
git commit -m "test: add RoundRectangle, Ellipse, and Line shape tests"
```

---

### Task 5: Gradients

**Files:**
- Modify: `src/shapes.test.ts` — add gradient tests

- [ ] **Step 1: Write tests for LinearGradient, RadialGradient, SweepGradient**

Append to the `Phase 2 – Shapes & Styles` describe block in `src/shapes.test.ts`:

```typescript
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
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Gradients are already implemented in Task 2's `src/styles.ts`. Run: `pnpm build && pnpm test -- src/shapes.test.ts`
Expected: All gradient tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shapes.test.ts
git commit -m "test: add LinearGradient, RadialGradient, and SweepGradient tests"
```

---

### Task 6: Verify Phase 1 Tests Still Pass

**Files:** None modified — verification only.

- [ ] **Step 1: Run full test suite**

Run: `pnpm build && pnpm test`
Expected: All Phase 1 tests in `src/index.test.ts` and all Phase 2 tests in `src/color.test.ts` and `src/shapes.test.ts` PASS.

- [ ] **Step 2: Verify fixture 01 renders correctly**

The fixture 01 XML uses `Group > PartDraw > Arc` with `Stroke color="#FF0000" thickness="225"`. With Phase 2, this should now render as a red filled circle (the thick stroke covers the full arc area). Verify by reading the fixture and confirming the tree walker handles it.

Run: `pnpm build && pnpm test`
Expected: All tests PASS, no regressions.

---

### Task 7: Final Cleanup and Commit

**Files:**
- Verify: all new files are tracked

- [ ] **Step 1: Run full test suite one final time**

Run: `pnpm build && pnpm test`
Expected: All tests PASS.

- [ ] **Step 2: Final commit if any uncommitted changes**

```bash
git status
# If clean, no commit needed. If any stragglers:
git add -A
git commit -m "chore: Phase 2 shape primitives complete"
```
