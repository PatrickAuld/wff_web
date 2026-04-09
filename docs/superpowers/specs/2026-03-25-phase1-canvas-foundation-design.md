# Phase 1: Canvas Foundation — Design Spec

## Goal

Parse the `<WatchFace>` root element and set up the rendering canvas. This is the foundation that all later phases build on.

## Decisions

- **Canvas ownership:** The caller owns the canvas. The library draws onto a provided `HTMLCanvasElement` rather than creating its own.
- **XML parsing:** Use the browser's built-in `DOMParser`. No external dependencies.
- **Metadata:** Parse and return metadata to the caller via `RenderResult.metadata`.
- **Module structure:** All Phase 1 logic in `src/index.ts`. No premature abstractions.

## API

### `renderWatchFace(canvas, options): RenderResult`

```typescript
export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  time: Date;
  ambient: boolean;
}

export interface RenderResult {
  metadata: Map<string, string>;
}

export function renderWatchFace(
  canvas: HTMLCanvasElement,
  options: RenderOptions
): RenderResult;
```

- `canvas`: Caller-owned canvas element. The library resizes it to match the WatchFace dimensions.
- `options.xml`: WFF v4 XML string.
- `options.assets`: Optional map of asset name to binary data (unused in Phase 1).
- `options.time`: Date object driving all time-dependent rendering.
- `options.ambient`: Whether to render in ambient mode (unused in Phase 1).
- Returns `metadata`: Map of key-value pairs from `<Metadata>` elements.

Width and height are read from the XML's `<WatchFace>` attributes, not passed by the caller.

## Render Pipeline

1. **Parse XML** — `new DOMParser().parseFromString(xml, "text/xml")`
2. **Extract root attributes** — `width`, `height`, `clipShape` from `<WatchFace>`
3. **Collect metadata** — All `<Metadata key="..." value="...">` elements into a `Map<string, string>`
4. **Resize canvas** — Set `canvas.width` and `canvas.height` to the WatchFace dimensions
5. **Get 2D context** — `canvas.getContext("2d")`
6. **Apply clip mask** — If `clipShape="CIRCLE"`, clip to an inscribed circle via `ctx.arc()` + `ctx.clip()`. Other `clipShape` values are ignored (no clip applied).
7. **Fill background** — Read `backgroundColor` from `<Scene>`, default to black (`#000000`), fill the canvas

## What This Does NOT Do

- No child element rendering (Group, PartDraw, Arc, etc. — Phase 2-3)
- No expression evaluation (Phase 4)
- No error recovery for malformed XML

## Test Harness Changes

`test/harness/canvas-renderer.ts` needs a small update:

- Pass the `canvas` element as the first argument (currently passes `ctx`)
- Pass `{ xml, assets, time, ambient }` as options (drop `width`/`height`)
- The library resizes the canvas based on the XML's WatchFace dimensions
- The harness still owns canvas creation, PNG extraction, and page lifecycle

## Validation

### Unit tests (`src/index.test.ts` or similar)

Since the library uses browser APIs (`DOMParser`, `HTMLCanvasElement`), unit tests run in Playwright's browser context via the existing harness infrastructure.

Tests verify:
- XML parsing extracts correct `width` (450), `height` (450) from Fixture 01
- `clipShape` defaults to `undefined` when not specified
- Metadata is collected: `CLOCK_TYPE=DIGITAL`, `PREVIEW_TIME=10:10:00`
- Canvas is resized to 450x450
- Background fill occurs (black by default)
- Circular clip path is applied when `clipShape="CIRCLE"` is present

### Visual regression

Fixture 01 (solid red circle) will NOT pass visual regression in Phase 1 — the Arc/Stroke rendering requires Phase 2-3. The canvas will show a black circle (clipped background) instead of a red one. This is expected.

## File Changes

| File | Change |
|------|--------|
| `src/index.ts` | Replace stub with full Phase 1 implementation |
| `test/harness/canvas-renderer.ts` | Update to pass `canvas` instead of `ctx`, drop `width`/`height` from call |
| New test file | Unit tests for parsing and rendering pipeline |
