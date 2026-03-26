# WFF v4 Web Renderer — Implementation Roadmap

Each phase builds on the previous one. Every phase gets a design doc and implementation spec before coding begins. Phases are ordered by dependency: later phases require primitives from earlier ones.

## Phase 1: Canvas Foundation

Parse the `<WatchFace>` root element and set up the rendering canvas.

- Parse `WatchFace` attributes: `width`, `height`, `clipShape`
- Parse `Metadata` elements (`CLOCK_TYPE`, `PREVIEW_TIME`)
- Set up Canvas context at specified dimensions
- Apply circular clip mask when `clipShape="CIRCLE"`
- Render `Scene` `backgroundColor`
- Accept a `Date` object to drive all time-dependent rendering

**Validates with:** Fixture 01 (solid background) — a full-bleed colored circle.

---

## Phase 2: Shape Primitives & Styling

Implement all drawing shapes and their fill/stroke styling.

### 2a: Fill & Stroke
- `Fill` with solid `color` (ARGB/RGB hex parsing)
- `Stroke` with `color`, `thickness`, `cap` (BUTT/ROUND/SQUARE), `dashIntervals`, `dashPhase`

### 2b: Shapes
- `Arc` — `centerX`, `centerY`, `width`, `height`, `startAngle`, `endAngle`, `direction`
- `Rectangle` — `x`, `y`, `width`, `height`
- `RoundRectangle` — same + `cornerRadiusX`, `cornerRadiusY`
- `Ellipse` — `x`, `y`, `width`, `height`
- `Line` — `startX`, `startY`, `endX`, `endY`

### 2c: Gradients
- `LinearGradient` — `startX`, `startY`, `endX`, `endY`, `colors`, `positions`
- `RadialGradient` — `centerX`, `centerY`, `radius`, `colors`, `positions`
- `SweepGradient` — `centerX`, `centerY`, `startAngle`, `endAngle`, `colors`, `positions`

**Validates with:** A fixture drawing shapes with various fills, strokes, and gradients.

---

## Phase 3: Layout Containers

Implement the container elements that position and compose shapes.

### 3a: PartDraw
- Container for shapes (`Arc`, `Rectangle`, `RoundRectangle`, `Ellipse`, `Line`)
- Spatial attributes: `x`, `y`, `width`, `height`
- Transform attributes: `pivotX`, `pivotY`, `angle`, `alpha`, `scaleX`, `scaleY`

### 3b: Group
- Hierarchical container with nested children
- Same spatial/transform attributes as PartDraw
- `name` attribute for targeting by `Variant` and `Condition`
- Recursive rendering of all child types

**Validates with:** Fixtures 01–03 should begin rendering correctly (backgrounds, marker shapes).

---

## Phase 4: Expression Engine

Implement the WFF arithmetic expression parser and evaluator. This is foundational — Transforms, Conditions, TimeText, and Configurations all depend on it.

### 4a: Expression Parser
- Tokenizer and AST for arithmetic expressions
- Operators: `+`, `-`, `*`, `/`, `%`, `!`, `&&`, `||`, `<`, `<=`, `>`, `>=`, `==`, `!=`, `? :`
- Parentheses and operator precedence
- String literals and number literals

### 4b: Data Sources
- Time sources: `HOUR_0_23`, `HOUR_0_11`, `MINUTE`, `SECOND`, `MILLISECOND`, `AMPM_STATE`, `SECONDS_IN_DAY`, `DAY_OF_WEEK`, `MONTH`, `DAY`, `YEAR`, and all variants (`_Z`, `_MINUTE`, digit variants)
- System sources: `BATTERY_PERCENT`, `IS_24_HOUR_MODE`
- Ambient: `IS_AMBIENT`
- Reference syntax: `[SOURCE_NAME]`

### 4c: Built-in Functions
- Math: `round`, `floor`, `ceil`, `fract`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `abs`, `clamp`, `sqrt`, `pow`, `log`, `log2`, `log10`, `exp`, `deg`, `rad`, `cbrt`, `expm1`, `rand`
- String: `numberFormat`, `icuText`, `icuBestText`, `subText`, `textLength`
- Color (v4): `colorRgb`, `colorArgb`

**Validates with:** Unit tests for expression parsing. Time-dependent fixtures start showing correct values.

---

## Phase 5: Transforms & Variants

Wire the expression engine into the rendering pipeline.

### 5a: Transform
- `target` attribute — which parent attribute to override
- `value` attribute — expression evaluated at render time
- Apply transforms before rendering the parent element

### 5b: Variant (Ambient Mode)
- `mode="AMBIENT"` — switch attribute values based on ambient state
- `target` and `value` attributes
- Support transition: `duration`, `startOffset`, `interpolation`

### 5c: Reference (v4)
- `name`, `source`, `defaultValue`
- Cross-element value sharing via `[REFERENCE.name]`

**Validates with:** Fixture 04 (ambient mode) — different layouts in interactive vs ambient.

---

## Phase 6: Text Rendering

Implement text display, font styling, and the DigitalClock element.

### 6a: Font & Text
- `Font` — `family`, `size`, `color`, `weight`, `slant`, `letterSpacing`, `width`
- `SYNC_TO_DEVICE` font family mapping to a web-safe default
- `Text` — `align` (START/CENTER/END), `ellipsis`, `maxLines`
- `PartText` — positioned text container

### 6b: DigitalClock & TimeText
- `DigitalClock` container with spatial attributes
- `TimeText` — `format` string with tokens (`HH`, `hh`, `mm`, `ss`, `h`, `m`, `s`, `a`, digit variants)
- `hourFormat` (12/24/SYNC_TO_DEVICE)
- `minSize`, `maxSize` auto-sizing

### 6c: Template & Formatting
- `Template` with `%s` placeholders and `Parameter` children
- `Upper` / `Lower` text transformers

**Validates with:** Fixture 02 (digital clock) — time display at specified times.

---

## Phase 7: Analog Clock

Implement the AnalogClock element with rotating hands.

- `AnalogClock` container — `centerX`, `centerY`
- `HourHand`, `MinuteHand`, `SecondHand` — rotation calculated from current time
- Support both vector (PartDraw children) and image-based hands (`resource` attribute)
- `SecondHand` sub-elements: `Tick` (discrete) and `Sweep` (continuous)

**Validates with:** Fixture 03 (analog hands) — hands at correct angles for given times.

---

## Phase 8: Conditions

Implement conditional rendering based on expressions.

- `Condition` container
- `Expressions` / `Expression` — named expressions evaluated at render time
- `Compare` — render child when referenced expression is truthy
- `Default` — render when no Compare matches
- Support nested Conditions

**Validates with:** Fixture 06 (conditional group) — AM/PM indicators based on time.

---

## Phase 9: Images

Implement static image rendering.

- `PartImage` container with spatial/transform attributes
- `Image` — `resource` attribute mapped to asset files
- `Images` — multiple image selection
- `ImageFilters` / `HsbFilter` — hue/saturation/brightness adjustments
- `tintColor` attribute on Parts
- `renderMode` (SOURCE/MASK/ALL) for compositing

**Validates with:** A fixture with embedded image assets (watch face backgrounds, hand images).

---

## Phase 10: User Configurations

Implement user-customizable watch face settings.

- `UserConfigurations` container
- `BooleanConfiguration` — toggle with `defaultValue`
- `ListConfiguration` — selection from `ListOption` children
- `ColorConfiguration` — selection from `ColorOption` children with `colors` lists
- Configuration values accessible in expressions as `[CONFIGURATION.id]`
- Color extraction: `extractColorFromColors`, `extractColorFromWeightedColors`

**Validates with:** A fixture that changes appearance based on configuration values.

---

## Phase 11: Complications

Implement complication slot rendering with placeholder data.

- `ComplicationSlot` — `slotId`, `supportedTypes`, spatial attributes
- `DefaultProviderPolicy` — `defaultSystemProvider`
- `Complication` — per-type rendering template
- Bounding shapes: `BoundingBox`, `BoundingRoundBox`, `BoundingOval`, `BoundingArc`
- Complication data sources in expressions: `[COMPLICATION.TEXT]`, `[COMPLICATION.TITLE]`, `[COMPLICATION.RANGED_VALUE_VALUE]`, etc.
- Provide stub/mock complication data for preview rendering

**Validates with:** Fixture 05 (complications) — battery and date slots rendering.

---

## Phase 12: Animation

Implement animated transforms for interactive mode.

- `Animation` child of `Transform`
- `duration`, `repeat` (count or infinite)
- Interpolation curves: `LINEAR`, `EASE_IN`, `EASE_OUT`, `EASE_IN_OUT`, `OVERSHOOT`, `CUBIC_BEZIER`
- `fps` control
- `requestAnimationFrame` loop for continuous rendering
- Pause animations in ambient mode

**Validates with:** A fixture with animated elements (pulsing dots, sweeping second hand).

---

## Phase 13: Advanced Text

Implement remaining text features.

- `TextCircular` — text rendered along an arc path
- `InlineImage` — images embedded in text flow
- Font decorations: `Shadow`, `Outline`, `OutGlow`, `Underline`, `StrikeThrough`
- `BitmapFonts` / `BitmapFont` — custom bitmap-based character rendering

**Validates with:** A fixture with circular text and decorated fonts.

---

## Phase 14: Advanced Features

Polish and remaining capabilities.

### 14a: Animated Images
- `PartAnimatedImage` container
- `AnimatedImage`, `AnimatedImages`, `SequenceImage`
- `AnimationController` — playback control

### 14b: Sensor & Interaction
- `Gyro` — accelerometer-driven parallax (simulate via mouse/device orientation)
- `Launch` — tap targets (stub: highlight tappable regions)

### 14c: Compositing
- `renderMode` MASK mode — masking between elements
- `blendMode` — Canvas `globalCompositeOperation` mapping (24+ modes)

### 14d: Accessibility
- `ScreenReader` — generate ARIA labels from watch face elements
- `Localization` — locale-aware rendering hints

**Validates with:** Dedicated fixtures per sub-feature.

---

## Phase Summary

| Phase | Feature | Key Elements | Depends On |
|-------|---------|-------------|------------|
| 1 | Canvas Foundation | WatchFace, Scene, Metadata | — |
| 2 | Shape Primitives | Arc, Rect, Ellipse, Line, Fill, Stroke, Gradients | 1 |
| 3 | Layout Containers | PartDraw, Group | 2 |
| 4 | Expression Engine | Parser, data sources, functions | — |
| 5 | Transforms & Variants | Transform, Variant, Reference | 3, 4 |
| 6 | Text Rendering | Font, Text, PartText, DigitalClock, TimeText | 3, 4 |
| 7 | Analog Clock | AnalogClock, HourHand, MinuteHand, SecondHand | 3, 4 |
| 8 | Conditions | Condition, Compare, Default, Expressions | 4, 3 |
| 9 | Images | PartImage, Image, ImageFilters | 3 |
| 10 | User Configurations | BooleanConfig, ListConfig, ColorConfig | 4 |
| 11 | Complications | ComplicationSlot, Bounding, Complication | 3, 4, 6 |
| 12 | Animation | Animation, interpolation curves | 5 |
| 13 | Advanced Text | TextCircular, BitmapFont, decorations | 6 |
| 14 | Advanced Features | AnimatedImage, Gyro, blendMode, MASK | 9, 12 |
