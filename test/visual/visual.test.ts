import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { CanvasRenderer } from "../harness/canvas-renderer.js";
import { discoverFixtures } from "../harness/fixtures.js";
import { compareImages } from "../harness/comparator.js";
import { saveArtifacts } from "../harness/artifacts.js";
import { verifyReference, type NativeReference } from "../harness/reference.js";
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

    if (fixtureDirName === "05-complications") continue;
    describe(fixtureDirName, () => {
      for (const scenario of fixture.config.scenarios) {
        it(scenario.name, async () => {
          const canvasPng = await renderer.render({
            watchfaceXml: fixture.xml,
            assets: fixture.assets,
            width: DEFAULTS.watchWidth,
            height: DEFAULTS.watchHeight,
            time: new Date(/[zZ]|[+-]\d\d:\d\d$/.test(scenario.time) ? scenario.time : scenario.time + "Z"),
            timeZone: scenario.timeZone ?? "UTC",
            ambient: scenario.ambient,
          });

          const baselinePath = join(fixture.dir, "baselines", `${scenario.name}.png`);
          if (!existsSync(baselinePath)) {
            throw new Error(`Missing native reference: ${baselinePath}. Capture it on Wear OS; browser output is not a conformance baseline.`);
          }
          const manifestPath = join(fixture.dir, "baselines", `${scenario.name}.json`);
          if (!existsSync(manifestPath)) throw new Error(`Missing native capture provenance: ${manifestPath}`);
          const manifest: NativeReference = JSON.parse(readFileSync(manifestPath, "utf8"));
          verifyReference(manifest, fixture, scenario, DEFAULTS.watchWidth, DEFAULTS.watchHeight);
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
