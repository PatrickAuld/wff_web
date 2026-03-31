import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ComparisonResult } from "./types.js";

const RESULTS_DIR = resolve(import.meta.dirname, "../../test/results");

/** Save comparison artifacts (images and metadata) for a test run */
export async function saveArtifacts(
  fixtureName: string,
  scenarioName: string,
  result: ComparisonResult
): Promise<string> {
  const artifactDir = join(RESULTS_DIR, "images", fixtureName, scenarioName);
  await mkdir(artifactDir, { recursive: true });

  await Promise.all([
    writeFile(join(artifactDir, "baseline.png"), result.baselineImage),
    writeFile(join(artifactDir, "canvas.png"), result.canvasImage),
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

  return artifactDir;
}
