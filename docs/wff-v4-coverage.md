# Non-complication WFF v4 coverage

This matrix describes implemented paths, not certified Wear OS parity. The target is
WFF version 4. Complication elements without injected slot data are skipped.
The v5 additions and optional slot preview support are described in [v5 coverage](wff-v5-coverage.md). The earlier implementation design's exclusions
are superseded by this implementation for the non-complication paths below.

`U` means executable unit regression coverage. `B` means a browser integration test
exists. Browser execution and native reference comparisons must both pass before a
row can be considered conformant. Native references are currently absent.

| Elements / feature | Attributes and behavior | Target | Regression evidence |
|---|---|---|---|
| `WatchFace` | width, height, CIRCLE default, NONE, RECTANGLE, cornerRadiusX/Y; scale XML coordinates to output dimensions | v4 | B geometry; existing index tests |
| `Scene`, `Group`, `PartDraw`, `PartText`, `PartImage`, `PartAnimatedImage`, clocks | x/y, width/height, pivotX/Y, angle, scaleX/Y, alpha, tintColor; isolated compositing | v4 | U attribute resolution; B geometry and blending |
| `Transform` on geometry, fonts, decorations, fills, strokes, gradients, images, scene | target, value, TO/BY; numeric, expression and color values | v4 | U forward references and color; B text |
| `Reference` | name, source, defaultValue; forward dependencies, hidden/inactive defaults, duplicate/cycle errors | v4 | U references |
| `Animation` | duration, interpolation, controls, angleDirection, repeat, fps; animate changes of ordinary Transform.value; retarget from displayed value | v4 | U transitions; B animation |
| `Variant` | AMBIENT, target/value, duration/startOffset fractions, interpolation/controls, angleDirection; enter and leave transitions | v4 | U both directions and fractional timing |
| `Text` | recursive text and CDATA, multiple font runs, maxLines, wrapping, align, isAutoSize (12px floor), ellipsis after sizing | v4 | B nested text, multiline, auto-size |
| `Font` | family, size, color, weight aliases, slant, width/stretch, letterSpacing; TTF/OTF/TTC and Android XML font families | v4 | B font runs; native font metrics pending |
| `Template`, `Parameter`, `Upper`, `Lower` | stringId or inline printf pattern, positional arguments, expression parameters, locale casing | v4 | U formatting; B nested templates |
| `Underline`, `StrikeThrough`, `Shadow`, `Outline`, `OutGlow` | recursive text content; color, width, offsets, blur radius; transformable attributes | v4 | B outline; rich-text native fixture |
| `TextCircular` | centerX/Y, width/height ellipse, direction, start/end angles, align, ellipsis | v4 | B arc placement; rich-text native fixture |
| `InlineImage` | resource or source, width/height, overlapLeft/Right, optional color | v4 | B asset rendering |
| `BitmapFonts`, `BitmapFont`, `Character`, `Word` | named definitions, longest word matching, resource dimensions, optional tint, sizing | v4 | B preserved image color; native asset fixture |
| `DigitalClock`, `TimeText` | millisecond UTC_TIMESTAMP, format including digit suffixes, hourFormat 12/24/SYNC_TO_DEVICE, align, fonts, shared geometry and localization | v4 | U epoch/digits; B localized TimeText |
| `AnalogClock`, hands | hand resources, geometry, alpha and tint; hour/minute/second values in selected time zone | v4 | Existing clock browser tests |
| `Sweep`, `Tick` | frequency including SYNC_TO_DEVICE; tick duration and overshoot strength; ambient discrete motion | v4 | U hand motion; native timing pending |
| `Image`, `Images` | asset aliases, per-buffer cache, change triggers TAP/ON_VISIBLE/ON_NEXT_SECOND/MINUTE/HOUR, FORWARD/BACKWARD/RANDOM | v4 | B cache replacement and taps |
| `ImageFilters`, `HsbFilter` | hueRotate, saturate, brightness; preserve alpha; transformable filter values | v4 | U HSB; B pixel check |
| `AnimatedImage` | IMAGE, AGIF, WEBP; decoded frame durations and thumbnail | v4 | ImageDecoder path; native/browser playback pending |
| `AnimatedImages`, `SequenceImages` | trigger/direction selection; Image frames, frameRate, thumbnail, loopCount | v4 | B sequence timeline |
| `AnimationController` | play, delayPlay, delayRepeat, repeat, loopCount, resumePlayBack, beforePlaying/afterPlaying | v4 | B delay/repeat/terminal state; native timing pending |
| `PhotosConfiguration`, `Photos` | source, defaultImageResource, center crop, TAP and ON_VISIBLE, changeAfterEvery; injected albums | v4 | B taps and wake counts |
| `Arc`, `Line`, `Ellipse`, `Rectangle`, `RoundRectangle` | geometry, fill and stroke; line restrictions for weighted strokes | v4 | Existing shape tests; U/B weighted lines |
| `WeightedStroke` | colors, weights, thickness, discreteGap, interpolate, cap; gradient intervals and solid segments | v4 | U interval count; B proportion/gap pixels |
| `Fill`, `Stroke`, gradients | color, thickness, cap, dashIntervals/Phase; linear/radial/sweep colors and positions; shared transforms/references | v4 | U existing style tests; native strokes fixture |
| `renderMode`, `blendMode` | SOURCE/MASK/ALL; union of masks; ALL contributes to source and mask; Porter-Duff and artistic blend names including separate MODULATE alpha multiplication | v4 | U MODULATE; B masks/blends; native parity pending |
| Arithmetic expressions | all listed math built-ins, colorRgb/Argb, extractColorFromColors/WeightedColors, quoted/unquoted lists, zero division, short-circuit booleans | v4 | U official color-list example and arithmetic |
| `icuText`, `icuBestText`, `numberFormat` | Intl-backed pattern dates and locale skeleton formatting, optional millisecond timestamp; decimal grouping, precision, percent/per-mille, scientific, currency and negative patterns | v4 | U formatting; see limits below |
| Time and device sources | timezone offsets/DST, local week rules, calendar dates/fractions, locale name; arbitrary battery/health/weather/sensor injection | v4 | U DST, half-hour zones, weeks, Buddhist/Islamic fields; B injection |
| `Condition`, `Expressions`, `Expression`, `Compare`, `Default` | attribute or text/CDATA expressions, named results, first matching branch; inactive branches excluded from references | v4 | U named/config branches; existing browser conditions |
| User and scene configuration | list/boolean branches; color palettes expanded as CONFIGURATION.id.index; declared defaults, explicit overrides, selection errors | v4 | U/B branches |
| `Flavors`, `Flavor`, `Configuration` | defaultValue flavor, optionId presets; explicit configuration overrides preset | v4 | B configuration/flavor |
| `Gyro` | expression-based x/y/angle offsets, scale multipliers, alpha factor; injected accelerometer values | v4 | U/B gyro |
| `Launch` | transformed tap hit testing; root clip gate; onLaunch callback for system/custom/deep-link targets | v4 | B callback and output scaling |
| `ScreenReader`, `Localization` | stringId parameters, ARIA label and transformed accessibility bounds; locale/timezone/calendar inheritance; string resources | v4 | B accessibility; U locale/calendar/timezone |
| Complication slots/data templates | optional injected previews added with v5; live providers remain external | see v5 | B v5 slot scoping/selection/blending |
| v5-specific additions | implemented; see [v5 coverage](wff-v5-coverage.md) | v5 | U/B v5 regressions; native parity pending |

## Browser and ICU limits

Canvas text metrics, shaping, glow kernels, tick overshoot, and Porter-Duff coverage
must be compared with the native renderer. System font fallback is browser-specific;
provide the same font assets as the watch face for useful font comparisons. Invalid
or unavailable custom fonts fall back to the browser font resolver.

Animated GIF/WebP decoding requires `ImageDecoder`; image sequences work without it.
A missing decoder produces an explicit error rather than silently freezing animation.
Android font-provider downloads are not implemented; supply local font buffers.

Intl is the host ICU implementation, not Android's ICU. Wide quarter names currently
use English, timezone `V` location-name widths use generic names, and calendar/week
year edge cases (especially era transitions and cyclic calendars) require native
fixtures. Currency defaults are inferred for common locale regions; set `currency` explicitly for
other regions. Intl skeleton, calendar era and timezone location details may differ
from Android ICU; the formatter is not a full ICU replacement.

## Independent reference requirements

Browser exports go to `browser-snapshots/` and cannot be used as conformance baselines.
`pnpm test:visual` fails on missing native PNGs or capture manifests; it no longer
skips absent baselines. Add device captures for every matrix row and test interactive,
ambient, configuration, localization, geometry, asset and animation boundary cases.
The new fixtures 16–18 cover rich text, references/weighted drawing and image/text
assets. They contain no claimed native baselines.

Each `baselines/<scenario>.json` must contain:

```json
{
  "renderer": "wear-os",
  "wffVersion": 4,
  "device": "actual device or emulator model",
  "buildFingerprint": "value from adb shell getprop ro.build.fingerprint",
  "capturedAt": "actual ISO timestamp of capture",
  "fixtureSha256": "fixtureFingerprint(fixture), exported by test/harness/reference.ts",
  "scenario": "interactive",
  "time": "2024-01-15T10:10:00Z",
  "timeZone": "UTC",
  "ambient": false,
  "width": 454,
  "height": 454
}
```

Capture the fixture with the native v4 renderer under the recorded conditions, then
import its PNG and manifest:

```sh
pnpm test:visual:import-native test/fixtures/16-v4-rich-text interactive native.png capture.json
pnpm build
pnpm test:visual
```

The importer validates provenance fields, XML/assets fingerprint, scenario and PNG
dimensions. Capture provenance is recorded metadata; review that it came from the
device. Unit or browser pixel checks alone do not establish Wear OS parity.

## Reference pages

- [WFF XML reference](https://developer.android.com/reference/wear-os/wff)
- [PartText hierarchy](https://developer.android.com/reference/wear-os/wff/group/part/text/part-text)
- [Reference](https://developer.android.com/reference/wear-os/wff/common/reference)
- [Animation](https://developer.android.com/reference/wear-os/wff/common/transform/animation)
- [Variant timing](https://developer.android.com/reference/wear-os/wff/common/variant/variant)
- [Arithmetic functions and operators](https://developer.android.com/reference/wear-os/wff/common/attributes/arithmetic-expression)
- [WeightedStroke](https://developer.android.com/reference/wear-os/wff/group/part/draw/style/weighted-stroke)
- [Localization](https://developer.android.com/reference/wear-os/wff/common/localization)
