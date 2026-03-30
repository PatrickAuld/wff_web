# WFF v4 Web Renderer — Design Spec

## Goal

Implement a complete WFF v4 XML renderer as a web library, replacing the ADB/emulator-based test pipeline with golden-file snapshot testing. The renderer targets two use cases: developer preview (see how WFF XML looks without deploying to a watch) and embeddable web widget.

## Decisions

- **No emulator dependency.** The ADB/emulator/APK-build pipeline is removed entirely. Visual validation uses golden-file snapshots compared via pixelmatch.
- **No complications.** ComplicationSlot rendering is out of scope. Slots are skipped during rendering.
- **User configurations supported.** BooleanConfiguration, ListConfiguration, and ColorConfiguration values are accepted as input. Missing keys fall back to XML defaults.
- **No intermediate representation.** The XML DOM from DOMParser is walked directly — no AST or scene graph.
- **Spec-dependency build order.** Phases build bottom-up so each phase has its dependencies in place.

## API

### `renderWatchFace(canvas, options): RenderResult`

```typescript
export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  width?: number;
  height?: number;
  time?: Date;
  ambient?: boolean;
  configuration?: Record<string, string | number | boolean>;
  animate?: boolean;
}

export interface RenderResult {
  metadata: Map<string, string>;
  stop?: () => void;
}

export function renderWatchFace(
  canvas: HTMLCanvasElement,
  options: RenderOptions
): RenderResult;
```

- `canvas`: Caller-owned canvas element. The library resizes it to match WatchFace dimensions (or `width`/`height` overrides).
- `xml`: WFF v4 XML string.
- `assets`: Image assets keyed by resource name (no file extension, no `drawable/` prefix).
- `width`/`height`: Override canvas dimensions. Default: read from XML.
- `time`: Date driving all time-dependent rendering. Default: `new Date()`.
- `ambient`: Ambient mode flag. Default: `false`.
- `configuration`: User config values. Keys match configuration element `id` attributes. Missing keys use XML defaults.
- `animate`: If true, starts a `requestAnimationFrame` loop that re-renders each frame with the current time. Default: `false`.
- Returns `metadata`: Key-value pairs from `<Metadata>` elements.
- Returns `stop`: Stops the animation loop (only present when `animate=true`).

## Module Structure

One file per concern:

| Module | Responsibility |
|--------|---------------|
| `src/index.ts` | Parse XML, set up canvas, orchestrate rendering |
| `src/color.ts` | Color parsing (AARRGGBB, hex, rgba) |
| `src/shapes.ts` | Shape primitives (Arc, Rect, RoundRect, Ellipse, Line) |
| `src/styles.ts` | Fill, Stroke, gradients |
| `src/layout.ts` | Group/PartDraw positioning, transforms (pivot, angle, scale, alpha) |
| `src/expressions.ts` | Expression parser + evaluator, data source resolution |
| `src/conditions.ts` | Condition/Compare/Default evaluation |
| `src/text.ts` | PartText, Text, Font, DigitalClock, TimeText rendering |
| `src/clock.ts` | AnalogClock, HourHand, MinuteHand, SecondHand |
| `src/images.ts` | PartImage, Image loading from assets map |
| `src/masking.ts` | renderMode (SOURCE/MASK/ALL), blendMode |
| `src/animation.ts` | Transform animations, interpolation curves |
| `src/variants.ts` | Variant (ambient mode attribute overrides) |

## Rendering Pipeline

The XML tree is walked depth-first. Each element is dispatched to the appropriate module. The rendering context carries:

- The canvas 2D context
- Current time (Date)
- Ambient mode flag
- Assets map (Map<string, ArrayBuffer>)
- User configuration values (Record<string, string | number | boolean>)
- Expression evaluation context (data sources populated from time/config)

For each renderable element:

1. Read position/size attributes (`x`, `y`, `width`, `height`)
2. Apply transforms: `ctx.save()`, translate to position, apply pivot + rotation + scale + alpha
3. Evaluate any expression-valued attributes via the expression engine
4. Check Variant overrides if ambient mode is active
5. Render the element (shape, text, image, clock hand, etc.)
6. Render children (depth-first)
7. `ctx.restore()`

## Implementation Phases

### Phase 3: Layout & Transforms

Group and PartDraw become real containers with positioning and transforms.

**Elements:**
- `Group`: `x`, `y`, `width`, `height`, `pivotX`, `pivotY`, `angle`, `alpha`, `scaleX`, `scaleY`
- `PartDraw`: same positioning/transform attributes

**Rendering:**
- `ctx.save()` → translate to `(x, y)` → translate to pivot point → rotate by `angle` (degrees → radians) → scale by `(scaleX, scaleY)` → translate back from pivot → set `globalAlpha *= alpha/255` → render children → `ctx.restore()`
- Nested groups compose transforms via the canvas transform stack

### Phase 4: Expression Engine

Tokenizer + recursive descent parser for WFF arithmetic expressions.

**Tokenizer output:** number literals, string literals, `[SOURCE_NAME]` references, operators (`+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, `~`, `|`, `&`), ternary (`?`, `:`), parentheses, function calls.

**Parser:** Recursive descent with standard operator precedence. Produces an expression tree.

**Evaluator:** Walks the expression tree, resolves `[SOURCE]` references from the data source context.

**Data sources populated from time:**
- `SECOND`, `MINUTE`, `HOUR_0_23`, `HOUR_1_12`, `HOUR_0_11`, `HOUR_1_24`
- `DAY`, `DAY_OF_WEEK`, `DAY_OF_YEAR`, `MONTH`, `YEAR`
- `AMPM_STATE` (0=AM, 1=PM)
- `IS_24_HOUR_MODE` (from options, default true)
- Zero-padded variants: `SECOND_Z`, `MINUTE_Z`, `HOUR_0_23_Z`, etc.
- Digit extraction: `*_TENS_DIGIT`, `*_UNITS_DIGIT`
- `UTC_TIMESTAMP`

**Data sources populated from config:**
- `CONFIGURATION.<id>` → resolved from `options.configuration`

**Built-in functions:** `round`, `floor`, `ceil`, `fract`, `abs`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `deg`, `rad`, `clamp`, `log`, `log2`, `log10`, `exp`, `numberFormat`, `icuText`, `subText`, `textLength`.

### Phase 5: Conditions & Variants

**Condition element:**
1. Evaluate each `Expression` in the `Expressions` child, store named results
2. Walk `Compare` children in order — evaluate `expression` attribute against named results
3. Render the first `Compare` whose expression is truthy
4. If none match, render `Default` child (if present)

**Variant element:**
- `mode="AMBIENT"`: when `options.ambient === true`, override the parent's `target` attribute with `value`
- Applied during attribute resolution, before rendering

### Phase 6: Text Rendering

**PartText** container with one child: `Text` or `TextCircular` (TextCircular deferred).

**Text element:**
- `align`: START → `ctx.textAlign = "left"`, CENTER → `"center"`, END → `"right"`
- `ellipsis`, `maxLines`: truncation logic
- Content is the text node value, with expression references resolved

**Font element:**
- `family` → `ctx.font` family (fallback to sans-serif if unavailable)
- `size` → font size in px
- `color` → `ctx.fillStyle`
- `weight` → mapped to CSS font-weight values (THIN=100, NORMAL=400, BOLD=700, etc.)
- `slant` → ITALIC maps to `font-style: italic`
- `letterSpacing` → `ctx.letterSpacing` (in em units × font size)
- Decorations: Underline and StrikeThrough drawn as lines relative to text metrics

**DigitalClock** container with `TimeText` children.

**TimeText:**
- `format` string resolved against current time: `hh` → zero-padded 12h hour, `HH` → 24h, `mm` → minutes, `ss` → seconds, `h` → non-padded, etc.
- `hourFormat`: `12` or `24` or `SYNC_TO_DEVICE` (default to 24)
- Rendered as text with the same Font system

### Phase 7: Analog Clock

**AnalogClock** container positions clock hands within its bounds.

**Hand elements** (HourHand, MinuteHand, SecondHand):
- `resource` references an image in the assets map
- Image drawn at `(x, y)` with `(width, height)`, rotated around `(pivotX, pivotY)`
- Rotation angles from current time:
  - Hour: `((hour % 12) + minute / 60) * 30` degrees
  - Minute: `(minute + second / 60) * 6` degrees
  - Second: `second * 6` degrees
- Can also contain PartDraw children instead of/alongside resource images

### Phase 8: Images

**PartImage** with `Image` child:
- `resource` attribute → look up key in assets map
- Decode ArrayBuffer to ImageBitmap via `createImageBitmap(new Blob([buffer]))`
- Draw scaled to PartImage's `(width, height)` at `(x, y)`
- Cache decoded ImageBitmap instances to avoid re-decoding each frame

**Images element** (indexed selection):
- Contains multiple `Image` children
- Expression-valued index selects which image to render
- Deferred if complexity is high; basic single-Image support first

### Phase 9: Masking & Blend Modes

**renderMode:**
- Groups with children using different renderModes use offscreen canvas compositing
- `SOURCE` elements drawn first onto offscreen canvas
- `MASK`/`ALL` elements drawn second with `globalCompositeOperation = "destination-in"`
- Result composited back to main canvas

**blendMode:**
- Mapped to canvas `globalCompositeOperation` values
- Applied to the element's rendering via `ctx.globalCompositeOperation`
- Mapping: SRC_OVER → "source-over", MULTIPLY → "multiply", SCREEN → "screen", OVERLAY → "overlay", etc.

### Phase 10: Animation

**Transform element:**
- `target`: attribute name to modify
- `value`: expression evaluated each frame
- `mode`: TO (absolute) or BY (relative to base value)

**Animation child:**
- `duration` in seconds
- `interpolation` → easing function:
  - LINEAR: `t`
  - EASE_IN: `t²`
  - EASE_OUT: `1 - (1-t)²`
  - EASE_IN_OUT: smooth step
  - OVERSHOOT: overshoots target then settles
  - CUBIC_BEZIER: `controls` attribute defines 4-point bezier
- `repeat`: 0 = once, -1 = infinite, n = n times
- `fps`: target frame rate (used to quantize animation time)

For single-frame renders (snapshot/preview): evaluate transform expressions at the given time. For `animate=true`: requestAnimationFrame loop re-evaluates each frame.

## Test Harness Changes

### Removed

- `test/harness/adb.ts` — ADB device control
- `test/harness/emulator.ts` — Emulator lifecycle management
- `test/harness/apk-builder.ts` — APK building with fixture injection
- `test/harness/global-setup.ts` — Emulator startup/validation
- `apk-template/` — Entire Gradle-based WearOS project

### Unchanged

- `test/harness/fixtures.ts` — Fixture discovery and loading
- `test/harness/canvas-renderer.ts` — Playwright-based rendering
- `test/harness/comparator.ts` — pixelmatch image comparison
- `test/harness/artifacts.ts` — Result saving
- `test/harness/reporter.ts` — HTML report generation

### Modified

- `test/visual/visual.test.ts` — Compare canvas output against golden-file baselines instead of emulator screenshots
- `fixture.json` format unchanged — `time`, `ambient`, `threshold`, `maxDiffPixelPercent` all still apply

### Golden File Workflow

Baselines stored at `test/fixtures/<name>/baselines/<scenario>.png`.

- `pnpm test:visual` — render all scenarios, compare against baselines, fail on threshold violation
- `pnpm test:visual:update-baselines` — render all scenarios, overwrite baseline PNGs
- `pnpm report` — generate HTML report showing baseline vs current vs diff

Baseline creation process:
1. Implement the feature
2. Create fixture XML and fixture.json
3. Run `pnpm test:visual:update-baselines`
4. Visually inspect the generated baseline PNG — does it look correct per WFF spec?
5. Commit the baseline PNG
6. CI runs `pnpm test:visual` against committed baselines

### Test Fixtures

Existing fixtures stay. New fixtures added per phase:

| Fixture | Phase | Validates |
|---------|-------|-----------|
| 01-solid-background | 1 | Canvas foundation (exists) |
| 07-shape-primitives | 2 | Shapes + gradients (exists) |
| 08-layout-transforms | 3 | Nested groups, rotation, scaling, alpha |
| 09-expressions | 4 | Dynamic values from time sources |
| 10-conditions | 5 | Conditional rendering based on expressions |
| 11-digital-clock | 6 | TimeText formatting, fonts |
| 12-analog-clock | 7 | Hand rotation at specific times |
| 13-images | 8 | Image resource rendering |
| 14-masking | 9 | SOURCE/MASK compositing |
| 15-ambient-mode | 5 | Variant attribute overrides |

Existing fixtures 02-06 serve as integration tests — they start passing as their required phases land.

## What This Does NOT Do

- **ComplicationSlot rendering** — slots are skipped entirely
- **TextCircular** — curved text along an arc path
- **Gyro** — accelerometer-based transforms
- **AnimatedImage** — GIF/WEBP frame animation
- **WeightedStroke** — segmented strokes for arcs/lines
- **PhotosConfiguration** — user-selected photos
- **BitmapFonts** — custom bitmap font rendering
- **ScreenReader** — accessibility descriptions
- **Pixel-perfect WearOS conformance** — the renderer aims for visual fidelity to the spec, not pixel-exact match with the Android renderer
