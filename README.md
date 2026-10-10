# wff-web

Render [WearOS Watch Face Format (WFF) v4/v5](https://developer.android.com/training/wearables/wff) XML in the browser using HTML Canvas.

## Install

```bash
npm install wff-web
```

## Usage

```js
import { renderWatchFace } from "wff-web";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const xml = `<WatchFace width="450" height="450" clipShape="CIRCLE">
  <Scene backgroundColor="#1a1a2e">
    <AnalogClock x="0" y="0" width="450" height="450">
      <HourHand resource="hour.png" x="0" y="0" width="450" height="450"
        pivotX="0.5" pivotY="0.5" />
      <MinuteHand resource="minute.png" x="0" y="0" width="450" height="450"
        pivotX="0.5" pivotY="0.5" />
    </AnalogClock>
  </Scene>
</WatchFace>`;

const { metadata } = await renderWatchFace(canvas, { xml });
```

### With assets

Pass image assets as a `Map<string, ArrayBuffer>`. Keys match the `resource` attribute paths in the XML.

```js
const assets = new Map();
assets.set("hour.png", await fetch("/hands/hour.png").then(r => r.arrayBuffer()));
assets.set("minute.png", await fetch("/hands/minute.png").then(r => r.arrayBuffer()));

await renderWatchFace(canvas, { xml, assets });
```

### Setting the time

By default the renderer uses the current time. Pass a `Date` to render a specific moment:

```js
await renderWatchFace(canvas, {
  xml,
  time: new Date("2024-06-15T10:10:30"),
});
```

### Ambient mode

Render the always-on display variant:

```js
await renderWatchFace(canvas, { xml, ambient: true });
```

### Animation

Start a live animation loop that updates every frame:

```js
const { stop } = await renderWatchFace(canvas, {
  xml,
  assets,
  animate: true,
});

// Later, stop the loop:
stop();
```

### Custom dimensions

Override the dimensions declared in the XML:

```js
await renderWatchFace(canvas, { xml, width: 300, height: 300 });
```

### User configuration

Watch faces can declare user-customizable options (colors, lists, booleans). Override their defaults:

```js
await renderWatchFace(canvas, {
  xml,
  configuration: {
    theme_color: "1",      // ColorConfiguration option id
    show_seconds: "TRUE",  // BooleanConfiguration
    dial_style: "2",       // ListConfiguration option id
  },
});
```

## API

### `renderWatchFace(canvas, options): Promise<RenderResult>`

Renders a WFF XML watch face onto the provided `HTMLCanvasElement`.

#### `RenderOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `xml` | `string` | *required* | WFF v4/v5 XML document |
| `assets` | `Map<string, ArrayBuffer>` | `new Map()` | Images, fonts and string XML keyed by resource path |
| `width` | `number` | from XML | Canvas width in pixels |
| `height` | `number` | from XML | Canvas height in pixels |
| `time` | `Date` | `new Date()` | Time to render |
| `ambient` | `boolean` | `false` | Render in ambient (always-on) mode |
| `complications` | `Record<number, ComplicationData>` | `{}` | Inject a type and slot-local data keyed by slotId |
| `configuration` | `Record<string, string \| number \| boolean>` | `{}` | User configuration overrides |
| `animate` | `boolean` | `false` | Start a serialized `requestAnimationFrame` loop |
| `elapsedMs` | `number` | runtime elapsed | Deterministic animation timeline for snapshots |
| `ambientTransitionDurationMs` | `number` | `1000` | Simulated device transition window for Variant duration/startOffset fractions |
| `flavor` | `string` | XML default | Select a preset; configuration overrides take precedence |
| `dataSources` | record or `(time: Date) => record` | `{}` | Inject device data using WFF source names; values are numbers, strings or booleans |
| `locale`, `timeZone`, `calendar` | `string` | en-US, browser zone, gregory | Simulated device localization; calendar uses Intl identifiers |
| `currency` | `string` | common locale currency or XXX | ISO 4217 currency for DecimalFormat currency patterns |
| `is24Hour` | `boolean` | `true` | Device hour preference |
| `strings` | `Record<string, string>` | asset strings | Override localized string resources |
| `photos` | `Record<string, string[]>` | `{}` | Photo configuration id to image resource names in assets |
| `visible` | `boolean` | `true` | Simulate visibility/pause and ON_VISIBLE events |
| `random` | `() => number` | Math.random | Inject repeatable randomness in [0,1) |
| `onLaunch` | `(target: string) => void` | none | Receive taps on Launch targets |
| `onError` | `(error: unknown) => void` | none | Receive live rendering errors |

#### `RenderResult`

| Field | Type | Description |
|---|---|---|
| `metadata` | `Map<string, string>` | Metadata from the XML (e.g. `CLOCK_TYPE`, `PREVIEW_TIME`) |
| `stop` | `() => void` | Stops animation and detaches tap listeners |
| `update` | `(changes: Partial<RenderOptions>) => Promise<void>` | Re-render while preserving transition/playback state |
| `tap` | `(x: number, y: number) => Promise<void>` | Simulate a tap in output canvas pixels |
| `settings` | `UserSetting[]` | Declared values, available options and active hierarchy state |
| `activeComplicationSlotIds` | `number[]` | Enabled slots after ListOption selection; independent of injected data |
| `accessibility` | `AccessibilityItem[]` | ScreenReader text, output bounds and Launch target |

## Device simulation

```js
const preview = await renderWatchFace(canvas, {
  xml, assets, timeZone: "UTC", elapsedMs: 0,
  dataSources: { BATTERY_PERCENT: 75, STEP_COUNT: 6400, HEART_RATE: 82 },
  photos: { album: ["photo1", "photo2"] },
  onLaunch: target => console.log("launch", target),
});
await preview.update({ ambient: true, elapsedMs: 100 });
await preview.update({ elapsedMs: 1100 });
await preview.tap(100, 100);
preview.stop();
```

Use `animate: true` for continuously advancing transitions, clocks and image playback.
Use `elapsedMs` and await each update for deterministic snapshots. Device services
are injected data and callbacks. Browser code does not open Wear OS applications.
String assets can be supplied as `res/values/strings.xml` and
`res/values-<language>/strings.xml`; `strings` overrides their values.

## WFF v5 settings and complications

`childSettingIds` creates an editor hierarchy up to Parent → Child → Grandchild.
`settings` exposes which settings are currently editable; hidden settings retain
selected values. `complicationSlotIds` activates linked slots only for selected
options of active settings. Slots absent from all option lists remain enabled.

```js
const preview = await renderWatchFace(canvas, {
  xml,
  configuration: { layout: "detailed" },
  complications: {
    1: { type: "SHORT_TEXT", data: { TEXT: "72%", TITLE: "Battery" } },
    2: { type: "RANGED_VALUE", data: { RANGED_VALUE_MIN: 0, RANGED_VALUE_MAX: 100, RANGED_VALUE_VALUE: 72 } },
  },
});
console.log(preview.settings.filter(setting => setting.active));
console.log(preview.activeComplicationSlotIds);
await preview.update({ configuration: { layout: "minimal" } });
```

Complication data keys may be bare (`TEXT`) or prefixed (`COMPLICATION.TEXT`).
They are scoped to one slot and support text, image resources, ranged/goal values,
and weighted color/weight lists consumed by the XML templates. Supply image bytes
in `assets`. An omitted slot has no rendered template; injecting `type: "EMPTY"`
selects its EMPTY template explicitly. Unsupported types are rejected for active slots.
`update({ complications })` replaces the injected slot map.

## Coverage and verification

The renderer implements the v4 rendering foundation and the v5 additions: text
spacing/vertical alignment, circular auto-sizing, Font.minSize, stroke joins,
Group/ComplicationSlot blending, and hierarchical settings/dynamic slots. Slot
content is rendered only when a matching type is supplied through `complications`.
Provider services are external; the browser does not fetch live Wear OS data.
Full native parity is not established. See the [v4 coverage matrix](docs/wff-v4-coverage.md)
and [v5 implementation and limits](docs/wff-v5-coverage.md).

```sh
pnpm build
pnpm exec tsc --noEmit
pnpm test:unit                 # Tests that do not require a browser
pnpm test                      # Includes Playwright integration tests
pnpm test:visual               # Requires independent native references; missing ones fail
pnpm test:visual:export-snapshots # Browser debugging snapshots, not native references
```

GIF/WebP animation uses the browser ImageDecoder API. Custom fonts use FontFace;
font-provider downloads require externally supplied assets. CI installs Chromium and
runs compilation and integration tests. Native comparison remains a separate gate.

## Native watch performance

Use `pnpm perf:native` to inventory WFF costs, discover the Wear OS renderer,
capture Perfetto traces and compare repeated native runs. Multi-digit rollover
fixtures run on Wear OS without changing its clock. See
[native performance measurements](docs/native-performance.md).
Browser frame times do not measure watch performance or battery use.

## License

ISC
