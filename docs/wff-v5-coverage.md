# WFF v5 implementation coverage

This extends the [v4 rendering foundation](wff-v4-coverage.md). It implements the
additions listed in the official v5 release notes. Browser regression tests are
implementation checks; they do not certify native Wear OS rasterization parity.

| v5 addition | Implemented behavior | Regression evidence |
|---|---|---|
| Group.blendMode | Render children onto an isolated source layer, then blend once with the destination; preserve child order and following siblings | v5 browser pixel checks for overlapping children and DIFFERENCE |
| ComplicationSlot.blendMode | Apply geometry, tint, alpha and isolated blending to the selected injected template | v5 browser slot blending and type updates |
| Text.lineSpacing | Add pixel gaps between lines; clamp negative gaps to -5; account for spacing in auto-sizing and height-based line limits | v5 unit multiline fitting; browser multiline/auto-size/transform checks |
| Text.verticalAlign | TOP, BOTTOM, CENTER and CENTER_ON_BASELINE; shared alphabetic baselines for mixed font sizes; align ink extents inside PartText | v5 unit baseline layout checks; browser measured bounding-box checks for all modes |
| TextCircular.verticalAlign | Align ink top/bottom/center or alphabetic baseline to the circular path in the glyph's local tangent frame | v5 browser clockwise/counterclockwise ellipse checks; native interpretation pending |
| TextCircular.isAutoSize | Fit text to sampled elliptical arc length; shrink before applying ellipsis | v5 unit/browser short elliptical arcs in both directions |
| Font.minSize | Default 12px; honor per-run floors below or above 12px; preserve run size ratios and never enlarge text | v5 unit font-floor/ellipsis checks; browser mixed-run and Transform checks |
| Stroke.join, WeightedStroke.join | MITER default, ROUND, BEVEL; reset join state for each stroke | v5 unit tests for both strokes; browser rectangle corner pixels |
| ListOption.childSettingIds | Expose active editor settings; selected options activate reachable children/grandchildren; preserve hidden values; reject unknown children, cycles and excess depth | v5 unit/browser hierarchy, flavor and update checks |
| ListOption.complicationSlotIds | Linked slots active when any selected option of an active setting enables them; unlinked slots always enabled | v5 unit/browser activation and hidden-reference checks |

The renderer exposes `settings` and `activeComplicationSlotIds` for consumers that
build a watch face editor. Hierarchy visibility changes editability, not the saved
configuration values or rendering of unrelated scene configuration branches.
ID lists accept whitespace or commas. Explicit configuration overrides flavor presets.

## Complication preview data

`RenderOptions.complications` is a map keyed by numeric slotId. Each entry supplies
`{ type, data }`, and only the matching Complication template is traversed. The
slot's supportedTypes is checked when active. An absent entry leaves its content
unrendered, preserving the earlier non-complication preview behavior. An explicitly
injected EMPTY selects that template. Data is re-scoped at each slot so text, title,
images and numeric fields cannot leak between slots.

All standard template data can be supplied: text/title, monochromatic/small/photo
image resource names, ranged values, goal progress and weighted-element lists. The
existing shape, image, expression, Transform, Variant and text renderers consume
these fields. Boolean fields become numeric expression booleans. Slot updates
replace the injected map; dynamically disabled slots do not draw or register hits.

The browser does not resolve DefaultProviderPolicy to a device service, retrieve
live providers, or implement the Wear OS complication picker/permission lifecycle.
BoundingOval/BoundingBox/BoundingArc device editor highlights and complication tap
routing are not implemented by this preview extension. This is injected rendering
support, not a complete device complication subsystem.

## Text metrics and verification

Explicit vertical alignment uses Canvas actualBoundingBoxAscent/Descent and shared
baselines; omitted verticalAlign retains the previous middle-aligned v4 behavior.
Font shaping and metrics depend on browser/font assets. Shadows, outlines and glows
are decorations and do not expand text layout bounds. Circular alignment interprets
the ellipse as the alignment path; compare against native captures before asserting
that this matches the device's exact bounding-box interpretation.

`test/fixtures/19-v5-text-joins` contains interactive and ambient native-comparison
scenarios. Its fixture.json declares wffVersion 5, so a v4 or browser capture cannot
pass the provenance gate. Existing fixtures default to v4. No native screenshots
are checked in or inferred from browser output.

Run `pnpm build`, `pnpm exec tsc --noEmit`, `pnpm test:unit`, and `pnpm test` for
implementation verification. `pnpm test:visual` separately requires actual native
captures and matching manifests. Missing captures remain a failure.

## Validation status (2026-10-05)

The library bundle, declarations and strict TypeScript check pass. All 206 tests in
`pnpm test:unit` pass, including v5 layout, configuration, slot scoping/selection,
reference defaults and native-provenance checks. The 22 v5 browser tests are added
but unexecuted: this session blocks Chromium process launch and local HTTP binding.
Native comparison also remains pending the actual Wear OS v5 captures described above.

## Official references

- [WFF release notes](https://developer.android.com/training/wearables/wff/release-notes)
- [Text](https://developer.android.com/reference/wear-os/wff/group/part/text/text)
- [TextCircular](https://developer.android.com/reference/wear-os/wff/group/part/text/text-circular)
- [Font](https://developer.android.com/reference/wear-os/wff/group/part/text/font)
- [Stroke](https://developer.android.com/reference/wear-os/wff/group/part/draw/style/stroke)
- [WeightedStroke](https://developer.android.com/reference/wear-os/wff/group/part/draw/style/weighted-stroke)
- [ListConfiguration and ListOption](https://developer.android.com/reference/wear-os/wff/user-configuration/list-configuration)
- [Group](https://developer.android.com/reference/wear-os/wff/group/group)
- [ComplicationSlot](https://developer.android.com/reference/wear-os/wff/complication/complication-slot)
