import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FixtureConfig, LoadedFixture } from "./types.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures");

/** Discover and load all fixture directories under test/fixtures/ */
export async function discoverFixtures(): Promise<LoadedFixture[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const fixtureDirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const fixtures: LoadedFixture[] = [];

  for (const dir of fixtureDirs) {
    const fixtureDir = join(FIXTURES_DIR, dir.name);
    const fixture = await loadFixture(fixtureDir);
    if (fixture) {
      fixtures.push(fixture);
    }
  }

  return fixtures;
}

/** Load a single fixture from a directory */
export async function loadFixture(
  dir: string
): Promise<LoadedFixture | null> {
  const configPath = join(dir, "fixture.json");

  let configRaw: string;
  try {
    configRaw = await readFile(configPath, "utf-8");
  } catch {
    return null; // No fixture.json, skip
  }

  const config: FixtureConfig = JSON.parse(configRaw);
  const xmlFile = config.watchface ?? "watchface.xml";
  const xml = await readFile(join(dir, xmlFile), "utf-8");

  const assets = new Map<string, Buffer>();
  if (config.assets) {
    const assetsDir = join(dir, config.assets);
    await loadAssetsRecursive(assetsDir, assetsDir, assets);
  }

  return { dir, config, xml, assets };
}

async function loadAssetsRecursive(
  baseDir: string,
  currentDir: string,
  assets: Map<string, Buffer>
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await loadAssetsRecursive(baseDir, fullPath, assets);
    } else {
      const relativePath = fullPath.slice(baseDir.length + 1);
      assets.set(relativePath, await readFile(fullPath));
    }
  }
}
