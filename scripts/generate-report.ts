import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverFixtures } from "../test/harness/fixtures.js";
import { CanvasRenderer } from "../test/harness/canvas-renderer.js";
import { AdbClient } from "../test/harness/adb.js";
import { ApkBuilder } from "../test/harness/apk-builder.js";
import { compareImages } from "../test/harness/comparator.js";
import { DEFAULTS } from "../test/harness/types.js";
import { generateReport } from "../test/harness/reporter.js";

const RESULTS_DIR = resolve(import.meta.dirname, "../test/results");

async function main() {
  console.log("Discovering fixtures...");
  const fixtures = await discoverFixtures();
  console.log(`Found ${fixtures.length} fixtures.\n`);

  const adb = new AdbClient();
  const apkBuilder = new ApkBuilder();

  console.log("Initializing canvas renderer...");
  const renderer = new CanvasRenderer();
  await renderer.init();

  // Disable animations on the emulator
  for (const setting of [
    "window_animation_scale",
    "transition_animation_scale",
    "animator_duration_scale",
  ]) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)("adb", [
        "shell", "settings", "put", "global", setting, "0",
      ]);
    } catch {}
  }

  for (const fixture of fixtures) {
    console.log(`\n--- ${fixture.config.name} ---`);

    // Build and install APK
    const apkPath = await apkBuilder.build(fixture);
    await adb.installApk(apkPath);
    await adb.setWatchFace("com.wff_web.test.fixture");

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

      // Render in web canvas
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
      const maxDiff = scenario.maxDiffPixelPercent ?? DEFAULTS.maxDiffPixelPercent;

      const result = compareImages(emulatorPng, canvasPng, {
        threshold,
        maxDiffPixelPercent: maxDiff,
        width: DEFAULTS.watchWidth,
        height: DEFAULTS.watchHeight,
      });

      // Save artifacts
      const artifactDir = join(
        RESULTS_DIR,
        "images",
        fixture.config.name,
        scenario.name
      );
      await mkdir(artifactDir, { recursive: true });

      await Promise.all([
        writeFile(join(artifactDir, "emulator.png"), emulatorPng),
        writeFile(join(artifactDir, "canvas.png"), canvasPng),
        writeFile(join(artifactDir, "diff.png"), result.diffImage),
        writeFile(
          join(artifactDir, "result.json"),
          JSON.stringify(
            {
              match: result.match,
              diffPixelCount: result.diffPixelCount,
              diffPixelPercent: result.diffPixelPercent,
              totalPixels: result.totalPixels,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        ),
      ]);

      console.log(
        `    Diff: ${result.diffPixelPercent.toFixed(2)}% ` +
          `(${result.match ? "PASS" : "FAIL"})`
      );
    }

    await adb.uninstallPackage("com.wff_web.test.fixture");
  }

  await renderer.close();

  const reportPath = await generateReport();
  console.log(`\nReport generated: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
