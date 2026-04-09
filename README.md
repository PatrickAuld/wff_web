# wff-web

Render [WearOS Watch Face Format (WFF) v4](https://developer.android.com/training/wearables/wff) XML in the browser using HTML Canvas.

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
    <AnalogClock centerX="225" centerY="225">
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
| `xml` | `string` | *required* | WFF v4 XML document |
| `assets` | `Map<string, ArrayBuffer>` | `new Map()` | Image assets keyed by resource path |
| `width` | `number` | from XML | Canvas width in pixels |
| `height` | `number` | from XML | Canvas height in pixels |
| `time` | `Date` | `new Date()` | Time to render |
| `ambient` | `boolean` | `false` | Render in ambient (always-on) mode |
| `configuration` | `Record<string, string \| number \| boolean>` | `{}` | User configuration overrides |
| `animate` | `boolean` | `false` | Start a `requestAnimationFrame` loop |

#### `RenderResult`

| Field | Type | Description |
|---|---|---|
| `metadata` | `Map<string, string>` | Metadata from the XML (e.g. `CLOCK_TYPE`, `PREVIEW_TIME`) |
| `stop` | `() => void \| undefined` | Stops the animation loop (only present when `animate: true`) |

## Supported elements

Shapes: `Arc`, `Ellipse`, `Line`, `Rectangle`, `RoundRectangle`
Layout: `Group`, `Part`, `PartDraw`
Text: `PartText`, `TimeText`, `Font`
Clock: `AnalogClock`, `HourHand`, `MinuteHand`, `SecondHand`, `DigitalClock`
Images: `PartImage`
Conditions: `Condition`, `Compare`, `Default`
Styling: `Fill`, `Stroke`, `LinearGradient`, `RadialGradient`, `SweepGradient`
Animation: `Transform`, `Gyro`, `Variant`
Masking: `Mask` with blend modes

## License

ISC
