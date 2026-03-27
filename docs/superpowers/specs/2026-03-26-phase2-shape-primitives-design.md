# Phase 2: Shape Primitives & Styling — Design Spec

## Goal

Implement all WFF drawing shapes and their fill/stroke/gradient styling. This gives the renderer the ability to draw visual content onto the canvas established in Phase 1.

## Module Structure

```
src/
  index.ts        — renderWatchFace + XML tree walker (dispatches to shapes/styles)
  color.ts        — parseColor(): ARGB/RGB hex → CSS color string
  styles.ts       — applyFill(), applyStroke(), createGradient()
  shapes.ts       — renderArc(), renderRectangle(), renderRoundRectangle(), renderEllipse(), renderLine()
```

## Color Parsing (`src/color.ts`)

`parseColor(value: string | null | undefined): string`

WFF uses Android-style hex colors with a leading `#`:

- `#RRGGBB` → pass through as-is (CSS-compatible)
- `#AARRGGBB` → extract alpha byte, convert to `rgba(r, g, b, alpha)` where alpha is 0.0–1.0
- `null` / `undefined` → returns `#000000` (black default)

No other color formats exist in the WFF spec.

## Styles (`src/styles.ts`)

### Fill

Child element of a shape. One attribute: `color`.

- Sets `ctx.fillStyle` to `parseColor(color)` and fills the current path
- If a gradient child is present, the gradient replaces the solid color as `fillStyle`

### Stroke

Child element of a shape. Attributes:

| Attribute | Type | Default | Maps to |
|-----------|------|---------|---------|
| `color` | hex string | `#000000` | `ctx.strokeStyle` |
| `thickness` | float | `1` | `ctx.lineWidth` |
| `cap` | `BUTT` \| `ROUND` \| `SQUARE` | `BUTT` | `ctx.lineCap` (`butt` / `round` / `square`) |
| `dashIntervals` | space-separated floats | none | `ctx.setLineDash()` |
| `dashPhase` | float | `0` | `ctx.lineDashOffset` |

A shape can have both Fill and Stroke children. Fill is applied first, then Stroke on top.

### Gradients

Gradients appear as children of Fill, replacing the solid `color` as `fillStyle`.

**LinearGradient** — `startX`, `startY`, `endX`, `endY`, `colors` (space-separated hex), `positions` (space-separated 0–1 floats). Maps to `ctx.createLinearGradient()` with `addColorStop()` for each position/color pair.

**RadialGradient** — `centerX`, `centerY`, `radius`, `colors`, `positions`. Maps to `ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)` — inner circle at radius 0, outer at `radius`.

**SweepGradient** — `centerX`, `centerY`, `startAngle`, `endAngle`, `colors`, `positions`. Canvas has no native sweep/conic gradient. Implementation: use `ctx.createConicGradient(startAngle, cx, cy)` (supported in modern browsers). Convert WFF angles (0 = 12 o'clock, clockwise) to canvas conic gradient angles (0 = 3 o'clock, clockwise) by subtracting 90 degrees.

## Shapes (`src/shapes.ts`)

Each shape function signature: `(ctx: CanvasRenderingContext2D, el: Element) => void`

Reads attributes from the element, builds a canvas path, then delegates to `applyFill()` and `applyStroke()` for any Fill/Stroke child elements.

### Arc

Attributes: `centerX`, `centerY`, `width`, `height`, `startAngle`, `endAngle`, `direction` (default `CLOCKWISE`).

- WFF angles: 0 at 12 o'clock, clockwise. Canvas angles: 0 at 3 o'clock, clockwise. Offset by -90 degrees.
- If width = height: `ctx.arc(cx, cy, width/2, startRad, endRad, counterclockwise)`
- If width != height: `ctx.ellipse(cx, cy, width/2, height/2, 0, startRad, endRad, counterclockwise)`
- Path is open (no `closePath`) — it's an arc segment, not a pie wedge

### Rectangle

Attributes: `x`, `y`, `width`, `height`. Uses `ctx.rect()`.

### RoundRectangle

Attributes: `x`, `y`, `width`, `height`, `cornerRadiusX`, `cornerRadiusY`. Uses `ctx.roundRect(x, y, w, h, [radiusX, radiusY])`. If only one radius provided, uses it for both.

### Ellipse

Attributes: `x`, `y`, `width`, `height`. Uses `ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, 2*PI)`.

### Line

Attributes: `startX`, `startY`, `endX`, `endY`. Uses `ctx.moveTo()` + `ctx.lineTo()`. Only Stroke applies (fill is ignored for lines).

## Tree Walking (`src/index.ts`)

`renderElement(ctx: CanvasRenderingContext2D, el: Element): void`

After filling the Scene background (Phase 1), iterate over Scene's children and dispatch:

| Element | Action |
|---------|--------|
| `Group` | Recurse into children (spatial/transform attributes ignored until Phase 3) |
| `PartDraw` | Recurse into children (spatial/transform attributes ignored until Phase 3) |
| `Arc` | Call `renderArc(ctx, el)` |
| `Rectangle` | Call `renderRectangle(ctx, el)` |
| `RoundRectangle` | Call `renderRoundRectangle(ctx, el)` |
| `Ellipse` | Call `renderEllipse(ctx, el)` |
| `Line` | Call `renderLine(ctx, el)` |
| Anything else | Skip silently |

Phase 3 pass-through: Group and PartDraw are walked into but their `x`, `y`, `width`, `height`, `pivotX`, `pivotY`, `angle`, `alpha`, `scaleX`, `scaleY` attributes are not applied. Since fixture 01's containers are all at origin (0,0) with full canvas dimensions, shapes render correctly at their absolute coordinates.

## Tests

New test file: `src/shapes.test.ts` using same Playwright-in-browser pattern as Phase 1.

### Color tests
- `#RRGGBB` passes through
- `#AARRGGBB` converts to rgba with correct alpha
- `null`/`undefined` defaults to black

### Shape tests (pixel-sampling verification)
- **Arc**: full circle (0–360), partial arc, counter-clockwise direction, elliptical (width != height)
- **Rectangle**: fill, stroke, fill+stroke combined
- **RoundRectangle**: rounded corners render correctly
- **Ellipse**: basic rendering
- **Line**: stroke with cap and dash attributes

### Style tests
- **Fill**: solid color applied
- **Stroke**: color, thickness, cap variants, dash intervals + phase
- **LinearGradient**: color varies along gradient axis
- **RadialGradient**: color varies from center outward
- **SweepGradient**: color varies angularly

## File Changes

| File | Change |
|------|--------|
| `src/index.ts` | Add `renderElement()` tree walker, dispatch to shape renderers |
| `src/color.ts` | New — `parseColor()` function |
| `src/styles.ts` | New — `applyFill()`, `applyStroke()`, gradient creation |
| `src/shapes.ts` | New — shape rendering functions |
| `src/shapes.test.ts` | New — unit tests for all shapes, styles, gradients, colors |

## What This Does NOT Do

- No spatial positioning from Group/PartDraw containers (Phase 3)
- No transforms: rotation, scale, alpha, pivot (Phase 3)
- No expression evaluation in attributes (Phase 4)
- No DigitalClock/AnalogClock handling (Phase 6-7) — these are skipped by the tree walker
