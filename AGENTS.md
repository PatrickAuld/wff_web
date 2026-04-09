# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

WFF Web is a web-based renderer for WearOS Watch Face Format (WFF) v4 XML. It converts XML watch face definitions into HTML Canvas renderings that match the appearance of native WearOS watch faces. The core library is currently a stub — implementation follows the phased plan in ROADMAP.md.

## Build & Test Commands

```bash
pnpm build                        # Compile TypeScript → dist/ via tsup (ESM + .d.ts)
pnpm test                         # Run unit tests (vitest, excludes visual tests)
pnpm test:visual                  # Run visual regression tests (requires WearOS emulator)
pnpm test:visual:update-baselines # Update baseline screenshots
pnpm report                       # Generate emulator-vs-canvas comparison report
```

No linter is configured. TypeScript strict mode provides type checking.

## Architecture

**Library entry point:** `src/index.ts` exports `renderWatchFace(options: RenderOptions): RenderResult`. Takes WFF XML, assets, dimensions, time, and ambient flag; returns an HTMLCanvasElement.

**Visual regression test harness** (`test/harness/`): The test pipeline validates canvas output against real WearOS emulator screenshots:
1. `fixtures.ts` — discovers test fixtures from `test/fixtures/*/fixture.json`
2. `apk-builder.ts` — builds Android APKs from `apk-template/` with fixture XML/assets injected
3. `emulator.ts` + `adb.ts` — manages emulator lifecycle, installs APKs, sets time/ambient mode, captures screenshots
4. `canvas-renderer.ts` — uses Playwright to render via the library in a browser, exports PNG
5. `comparator.ts` — pixelmatch comparison of emulator vs canvas output
6. `artifacts.ts` — saves results to `test/results/`

**Test fixtures** (`test/fixtures/`): Progressive complexity (01-solid-background through 06-conditional-group). Each contains `fixture.json` (scenarios with time, ambient mode, thresholds), `watchface.xml`, and optional assets.

**APK template** (`apk-template/`): Gradle-based WearOS watch face project. The test harness injects fixture XML and assets into this template to build installable APKs.

## Tech Stack

- TypeScript 6 / ES2022 / Node16 modules
- tsup (bundler), vitest (test runner), Playwright (browser automation)
- pixelmatch + pngjs (image comparison)
- Kotlin/Gradle (APK template only)

## Test Configuration

- Unit test timeout: 120s, hook timeout: 300s
- Tests run sequentially (no concurrency) due to emulator dependency
- Visual tests are excluded from the default `pnpm test` run
- Fixture scenario format in `fixture.json`:
  ```json
  {
    "scenarios": [{
      "name": "scenario-name",
      "time": "2024-01-15T10:10:00",
      "ambient": false,
      "threshold": 0.1,
      "maxDiffPixelPercent": 1.0
    }]
  }
  ```

## Implementation Phases

Development follows ROADMAP.md phases in dependency order: Canvas Foundation → Shape Primitives → Layout Containers → Expression Engine → Transforms/Variants/TimeText. Each phase validates against corresponding test fixtures.
