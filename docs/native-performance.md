# Native Wear OS performance

The native performance tool measures the Wear OS renderer, without Canvas or
a WebView on the watch. WFF face APKs are resource-only: their package is not
necessarily the process to profile. On Pixel Watch this can be
`com.google.wear.watchface.runtime`. Discover the actual process and surface.

Requires Python 3, local ADB, an installed and selected face, and the official
[Perfetto trace processor](https://perfetto.dev/docs/quickstart/trace-analysis).

```sh
pnpm perf:native inspect-face ../watches/faces/thread-portrait --output /tmp/thread-costs.json
adb devices -l
pnpm perf:native discover --serial WATCH_SERIAL
```

Discovery prints wallpaper state, process names and SurfaceFlinger surfaces.
`--package` identifies the resource APK; `--process` identifies its renderer;
`--layer` must identify the watch-face surface rather than editor/launcher UI.

Static inventory lists millisecond sources, costly expressions, SOURCE/MASK
layers and decompressed PNG sizes across all branches. It does not simulate
visibility, native caching, cropping or subscriptions. Condition nesting does
not prove native subscriptions stop updating. The inventory is not a calibrated
performance model or the official
[WFF memory evaluator](https://developer.android.com/training/wearables/wff/memory-usage).

## Capture production behavior

Keep the same spool, brightness, refresh rate, thermal state and display mode
across versions. Exclude editor and package-install work. The tool never
installs an APK, changes the clock or persistent settings, or selects a face.
`--wake` wakes an interactive capture immediately before recording. Omit it
for ambient measurements. A locked/off-wrist watch may remain in ambient mode
despite a wake command; absent animation frames invalidate the measurement.

```sh
pnpm perf:native capture --serial WATCH_SERIAL \
  --package com.patrickauld.watches.companion.watchfacepush.thread_portrait \
  --process com.google.wear.watchface.runtime --layer Wallpaper \
  --face ../watches/faces/thread-portrait --label before \
  --scenario settled --mode interactive --spool 0 --refresh-hz 60 \
  --duration 8 --wake --output /tmp/thread-before-1
pnpm perf:native analyze /tmp/thread-before-1 --trace-processor /path/to/trace_processor_shell
# After reviewing the captured artifacts, repeat with --reviewed-artifacts.
```

Runs retain the Perfetto trace/config, installed APK, screenshots, source hash,
device fingerprint, clock times, wallpaper/display/power/thermal state and
renderer memory snapshots. Capture verifies that installed APK XML matches
`--face`; `--apk` optionally verifies the entire installed APK hash. Screenshots
are contextual snapshots, not proof of display state throughout the recording.

Analysis includes selected SurfaceFlinger FrameTimeline frames, jank, p95
duration, native expected budgets, scheduler CPU time by renderer thread and
PSS. FrameTimeline duration includes scheduling/presentation, not just draw
time. The analysis excludes post-recording producer-flush time. No frames,
missing scheduler slices, a restarted runtime, trace loss or a wrong surface
invalidate comparisons. Analysis requires `--reviewed-artifacts` to attest that
the active face, mode and thermal evidence have been checked before comparison.
Installing the face alone does not prove it was selected. Missing evidence is never zero jank or zero CPU.

## Force the expensive rollover without changing the watch clock

Thread Portrait fixtures freeze only hour/minute and optionally spool inputs.
`[SECOND]` and `[MILLISECOND]` retain native sources and evaluation cadence.
The chosen rollover repeats each minute. Output must be a separate directory;
canonical XML is not edited. The optional Gradle init script overrides the
existing watches StageWatchFace task inputs, including assets.

```sh
pnpm perf:native stage-scenario ../watches/faces/thread-portrait \
  --scenario three-slots --spool 0 --output /tmp/thread-three-slots \
  --gradle-init /tmp/thread-three-slots.init.gradle
```

From the watches checkout:

```sh
./gradlew :watchface:assembleDebug -PfaceSlug=thread-portrait \
  -I /tmp/thread-three-slots.init.gradle --no-configuration-cache
adb -s WATCH_SERIAL install -r watchface/build/outputs/apk/debug/watchface-debug.apk
```

Confirm that the selected watch shows the fixture (12:59 for three slots), let
startup settle, and capture with `--face /tmp/thread-three-slots`,
`--scenario three-slots`, `--start-second 55`, `--duration 8` and `--wake`.
Analyze with `--second-window 58 59.95`. This isolates the motion and excludes
the artificial reset at :00. Bounds use REALTIME trace clock snapshots, rather
than host/ADB timestamp estimates. Incomplete windows are rejected.

`one-slot` freezes 10:08; `two-slots` freezes 10:09. These are diagnostic
workloads, not production battery tests. Restore the production APK by building
without the init script and reinstalling it. No accelerated-time expression
is shipped in production XML.

## Compare repeated native runs

Collect at least three independent captures per version; alternate versions
when practical. Use new directories and review active face, display/thermal
state and other runtime activity in the retained artifacts.

```sh
pnpm perf:native compare \
  --before /tmp/b1/report.json /tmp/b2/report.json /tmp/b3/report.json \
  --after /tmp/a1/report.json /tmp/a2/report.json /tmp/a3/report.json \
  --output /tmp/thread-native-comparison.json
```

Comparison rejects browser reports, invalid runs, duplicate traces, mixed face
versions, differing devices/builds/scenarios/spools/frame budgets or analysis
windows. It reports medians and ranges, without claiming significance. Renderer
CPU/PSS can include shared runtime work. CPU is a battery-relevant proxy, not
measured energy or battery life. Emulator results remain labeled and do not
establish physical-watch performance.

`pnpm test:native` tests evidence rejection, frame calculations, fixture staging
and static inventory without a device.
