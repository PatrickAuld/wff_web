import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { CanvasRenderer } from "../test/harness/canvas-renderer.js";
import { discoverFixtures } from "../test/harness/fixtures.js";
import { DEFAULTS } from "../test/harness/types.js";

async function main() {
  const renderer = new CanvasRenderer();
  await renderer.init();

  try {
    const fixtures = await discoverFixtures();
    console.log(`Found ${fixtures.length} fixtures`);

    for (const fixture of fixtures) {
      const fixtureDirName = basename(fixture.dir);

      for (const scenario of fixture.config.scenarios) {
        const png = await renderer.render({
          watchfaceXml: fixture.xml,
          assets: fixture.assets,
          width: DEFAULTS.watchWidth,
          height: DEFAULTS.watchHeight,
          time: new Date(scenario.time),
          ambient: scenario.ambient,
        });

        const baselinesDir = join(fixture.dir, "baselines");
        await mkdir(baselinesDir, { recursive: true });

        const outPath = join(baselinesDir, `${scenario.name}.png`);
        await writeFile(outPath, png);
        console.log(`  wrote ${fixtureDirName}/baselines/${scenario.name}.png`);
      }
    }
  } finally {
    await renderer.close();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
