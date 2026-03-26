import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LoadedFixture } from "./types.js";

const exec = promisify(execFile);

const TEMPLATE_DIR = resolve(import.meta.dirname, "../../apk-template");
const CACHE_DIR = resolve(import.meta.dirname, "../../.apk-cache");

export class ApkBuilder {
  /** Build an APK for a fixture, using cache when possible */
  async build(fixture: LoadedFixture): Promise<string> {
    const hash = this.hashFixture(fixture);
    const cachedApk = join(CACHE_DIR, `${hash}.apk`);

    try {
      await access(cachedApk);
      console.log(`APK cache hit for "${fixture.config.name}"`);
      return cachedApk;
    } catch {
      // Cache miss, build it
    }

    console.log(`Building APK for "${fixture.config.name}"...`);

    // Inject watchface XML into template
    const rawDir = join(
      TEMPLATE_DIR,
      "watchface/src/main/res/raw"
    );
    await mkdir(rawDir, { recursive: true });
    await writeFile(join(rawDir, "watchface.xml"), fixture.xml);

    // Copy assets into drawable/
    if (fixture.assets.size > 0) {
      const drawableDir = join(
        TEMPLATE_DIR,
        "watchface/src/main/res/drawable"
      );
      await mkdir(drawableDir, { recursive: true });
      for (const [name, data] of fixture.assets) {
        await writeFile(join(drawableDir, name), data);
      }
    }

    // Ensure a preview drawable exists (required by manifest)
    const previewPath = join(
      TEMPLATE_DIR,
      "watchface/src/main/res/drawable/preview.png"
    );
    try {
      await access(previewPath);
    } catch {
      // Create a minimal 1x1 red PNG as placeholder
      await writeFile(previewPath, createMinimalPng());
    }

    // Run Gradle build
    const gradlew = join(TEMPLATE_DIR, "gradlew");
    try {
      await exec(gradlew, ["assembleDebug"], {
        cwd: TEMPLATE_DIR,
        timeout: 180_000,
        env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME },
      });
    } catch (err: any) {
      throw new Error(
        `Gradle build failed for "${fixture.config.name}": ${err.stderr || err.message}`
      );
    }

    // Find the output APK
    const apkPath = join(
      TEMPLATE_DIR,
      "watchface/build/outputs/apk/debug/watchface-debug.apk"
    );

    // Cache it
    await mkdir(CACHE_DIR, { recursive: true });
    await copyFile(apkPath, cachedApk);

    // Clean up injected files
    await rm(join(rawDir, "watchface.xml"), { force: true });

    console.log(`APK built and cached: ${cachedApk}`);
    return cachedApk;
  }

  /** Generate a content hash for cache keying */
  private hashFixture(fixture: LoadedFixture): string {
    const hash = createHash("sha256");
    hash.update(fixture.xml);
    for (const [name, data] of [...fixture.assets].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      hash.update(name);
      hash.update(data);
    }
    return hash.digest("hex").slice(0, 16);
  }
}

/** Create a minimal valid 1x1 red PNG */
function createMinimalPng(): Buffer {
  // Minimal PNG: 1x1 pixel, red (#FF0000)
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
      "2e00600000000c4944415408d76360f8cf00000001010000050218d84d0000" +
      "000049454e44ae426082",
    "hex"
  );
}
