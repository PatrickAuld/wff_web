import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverFixtures } from "../test/harness/fixtures.js";
import { AdbClient } from "../test/harness/adb.js";
import { ApkBuilder } from "../test/harness/apk-builder.js";
import { EmulatorManager } from "../test/harness/emulator.js";

const BASELINES_DIR = resolve(import.meta.dirname, "../test/baselines");

async function main() {
  const emulator = new EmulatorManager();
  const adb = new AdbClient();
  const apkBuilder = new ApkBuilder();

  console.log("Discovering fixtures...");
  const fixtures = await discoverFixtures();
  console.log(`Found ${fixtures.length} fixtures.\n`);

  // Ensure emulator is running
  if (!(await emulator.isRunning())) {
    await emulator.ensureAvd();
    await emulator.start();
  }

  for (const fixture of fixtures) {
    console.log(`--- ${fixture.config.name} ---`);

    // Build and install APK
    const apkPath = await apkBuilder.build(fixture);
    await adb.installApk(apkPath);
    await adb.setWatchFace("com.wff_web.test.fixture");

    for (const scenario of fixture.config.scenarios) {
      console.log(`  Capturing: ${scenario.name}`);

      // Set state
      await adb.setTime(scenario.time);
      if (scenario.ambient) {
        await adb.enterAmbientMode();
      } else {
        await adb.exitAmbientMode();
      }

      // Capture
      const png = await adb.screencap();

      // Save baseline
      const baselineDir = join(BASELINES_DIR, fixture.config.name);
      await mkdir(baselineDir, { recursive: true });
      await writeFile(join(baselineDir, `${scenario.name}.png`), png);
      console.log(`    Saved: ${scenario.name}.png`);
    }

    await adb.uninstallPackage("com.wff_web.test.fixture");
  }

  console.log("\nBaselines updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
