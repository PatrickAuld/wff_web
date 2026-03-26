import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { discoverFixtures } from "../harness/fixtures.js";
import { AdbClient } from "../harness/adb.js";
import { ApkBuilder } from "../harness/apk-builder.js";
import { CanvasRenderer } from "../harness/canvas-renderer.js";
import { compareImages } from "../harness/comparator.js";
import { saveArtifacts } from "../harness/artifacts.js";
import { DEFAULTS } from "../harness/types.js";
import type { LoadedFixture } from "../harness/types.js";

/*
 * Visual regression tests.
 *
 * These tests require a running WearOS emulator. They:
 * 1. Build & deploy each fixture as an APK to the emulator
 * 2. Set the time and ambient state per scenario
 * 3. Capture a screenshot from the emulator (ground truth)
 * 4. Render the same XML through the web library via Playwright
 * 5. Compare the two images with pixelmatch
 *
 * Run with: pnpm test:visual
 * Requires: ANDROID_HOME set, emulator tools on PATH
 * Setup:    scripts/setup-emulator.sh
 */

let fixtures: LoadedFixture[];
let adb: AdbClient;
let apkBuilder: ApkBuilder;
let renderer: CanvasRenderer;

beforeAll(async () => {
  fixtures = await discoverFixtures();
  adb = new AdbClient();
  apkBuilder = new ApkBuilder();
  renderer = new CanvasRenderer();
  await renderer.init();
}, 60_000);

afterAll(async () => {
  await renderer.close();
});

describe("Visual Regression", () => {
  // Dynamically create test suites from discovered fixtures
  // Note: fixtures is populated in beforeAll above. Vitest collects tests
  // synchronously, so we use a lazy pattern with test.each or simply
  // define a single test that iterates. For proper per-fixture reporting,
  // we use a single describe with dynamic its.

  it("should have discovered at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  it("runs all fixture scenarios", async () => {
    for (const fixture of fixtures) {
      console.log(`\n--- Fixture: ${fixture.config.name} ---`);

      // Build and install APK
      const apkPath = await apkBuilder.build(fixture);
      await adb.installApk(apkPath);
      await adb.setWatchFace("com.wff_web.test.fixture");

      try {
        for (const scenario of fixture.config.scenarios) {
          console.log(`  Scenario: ${scenario.name}`);

          // Set emulator state
          await adb.setTime(scenario.time);
          if (scenario.ambient) {
            await adb.enterAmbientMode();
          } else {
            await adb.exitAmbientMode();
          }

          // Capture emulator screenshot
          const emulatorPng = await adb.screencap();

          // Render in web library
          const canvasPng = await renderer.render({
            watchfaceXml: fixture.xml,
            assets: fixture.assets,
            width: DEFAULTS.watchWidth,
            height: DEFAULTS.watchHeight,
            time: new Date(scenario.time),
            ambient: scenario.ambient,
          });

          // Compare
          const threshold = scenario.threshold ?? DEFAULTS.threshold;
          const maxDiff =
            scenario.maxDiffPixelPercent ?? DEFAULTS.maxDiffPixelPercent;

          const result = compareImages(emulatorPng, canvasPng, {
            threshold,
            maxDiffPixelPercent: maxDiff,
            width: DEFAULTS.watchWidth,
            height: DEFAULTS.watchHeight,
          });

          // Save artifacts regardless of pass/fail
          const artifactDir = await saveArtifacts(
            fixture.config.name,
            scenario.name,
            result
          );
          console.log(
            `    Diff: ${result.diffPixelPercent.toFixed(2)}% ` +
              `(${result.match ? "PASS" : "FAIL"}) → ${artifactDir}`
          );

          expect(
            result.diffPixelPercent,
            `${fixture.config.name}/${scenario.name}: ` +
              `${result.diffPixelPercent.toFixed(2)}% > ${maxDiff}% threshold`
          ).toBeLessThanOrEqual(maxDiff);
        }
      } finally {
        await adb.uninstallPackage("com.wff_web.test.fixture");
      }
    }
  });
});
