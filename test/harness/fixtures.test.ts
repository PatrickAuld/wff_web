import { describe, it, expect } from "vitest";
import { discoverFixtures, loadFixture } from "./fixtures.js";
import { resolve } from "node:path";

describe("fixture discovery", () => {
  it("discovers fixtures from test/fixtures/", async () => {
    const fixtures = await discoverFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(1);

    const first = fixtures[0];
    expect(first.config.name).toBe("Solid Background");
    expect(first.config.scenarios).toHaveLength(1);
    expect(first.xml).toContain("<WatchFace");
  });

  it("loads fixture 01 with correct config", async () => {
    const fixtureDir = resolve(
      import.meta.dirname,
      "../fixtures/01-solid-background"
    );
    const fixture = await loadFixture(fixtureDir);

    expect(fixture).not.toBeNull();
    expect(fixture!.config.name).toBe("Solid Background");
    expect(fixture!.config.description).toContain("solid red");
    expect(fixture!.config.scenarios[0].time).toBe("2024-01-15T10:10:00");
    expect(fixture!.config.scenarios[0].ambient).toBe(false);
    expect(fixture!.config.scenarios[0].threshold).toBe(0.01);
    expect(fixture!.xml).toContain('color="#FF0000"');
    expect(fixture!.assets.size).toBe(0);
  });

  it("returns null for directory without fixture.json", async () => {
    const fixture = await loadFixture("/tmp/nonexistent-fixture-dir");
    expect(fixture).toBeNull();
  });
});
