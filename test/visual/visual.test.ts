import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { CanvasRenderer } from "../harness/canvas-renderer.js";
import { discoverFixtures } from "../harness/fixtures.js";
import { compareImages } from "../harness/comparator.js";
import { saveArtifacts } from "../harness/artifacts.js";
import { DEFAULTS } from "../harness/types.js";

let renderer: CanvasRenderer;

beforeAll(async () => {
  renderer = new CanvasRenderer();
  await renderer.init();
}, 30_000);

afterAll(async () => {
  await renderer.close();
});

describe("visual regression", async () => {
  const fixtures = await discoverFixtures();

  for (const fixture of fixtures) {
    const fixtureDirName = basename(fixture.dir);

    describe(fixtureDirName, () => {
      for (const scenario of fixture.config.scenarios) {
        it(scenario.name, async (ctx) => {
          const canvasPng = await renderer.render({
            watchfaceXml: fixture.xml,
            assets: fixture.assets,
            width: DEFAULTS.watchWidth,
            height: DEFAULTS.watchHeight,
            time: new Date(scenario.time),
            ambient: scenario.ambient,
          });

          const baselinePath = join(fixture.dir, "baselines", `${scenario.name}.png`);
          if (!existsSync(baselinePath)) {
            ctx.skip();
            return;
          }
          const baselinePng = readFileSync(baselinePath);

          const result = compareImages(baselinePng, canvasPng, {
            threshold: scenario.threshold,
            maxDiffPixelPercent: scenario.maxDiffPixelPercent,
          });

          await saveArtifacts(fixtureDirName, scenario.name, result);

          expect(
            result.match,
            `${result.diffPixelPercent.toFixed(2)}% diff (${result.diffPixelCount} px)`
          ).toBe(true);
        });
      }
    });
  }
});
