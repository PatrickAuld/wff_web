import { describe, it, expect } from "vitest";
import { fixtureFingerprint, verifyReference, type NativeReference } from "./reference.js";
import type { LoadedFixture } from "./types.js";
const fixture: LoadedFixture = { dir: "/fixture", xml: "<WatchFace/>", config: { name: "example", description: "test", scenarios: [] }, assets: new Map([["image", Buffer.from([1,2,3])]]) };
const scenario = { name: "day", time: "2024-01-15T10:10:00Z", ambient: false };
const manifest: NativeReference = { renderer: "wear-os", wffVersion: 4, device: "emulator", buildFingerprint: "wearos/test/build", capturedAt: "2026-10-02T00:00:00Z", fixtureSha256: fixtureFingerprint(fixture), scenario: "day", time: scenario.time, timeZone: "UTC", ambient: false, width: 454, height: 454 };
describe("native reference provenance", () => {
  it("accepts a matching capture", () => { expect(() => verifyReference(manifest, fixture, scenario, 454,454)).not.toThrow(); });
  it("rejects self-generated browser baselines", () => { expect(() => verifyReference({ ...manifest, renderer: "browser" } as unknown as NativeReference, fixture, scenario,454,454)).toThrow("native"); });
  it("rejects stale XML and asset bytes", () => {
    for (const changed of [{ ...fixture, xml: fixture.xml + " " }, { ...fixture, assets: new Map([["image", Buffer.from([4])]]) }]) expect(() => verifyReference(manifest,changed,scenario,454,454)).toThrow("XML/assets");
  });
  it("rejects incomplete provenance and mismatched scenario/dimensions", () => {
    for (const change of [{ device: "" }, { capturedAt: "invalid" }, { ambient: true }, { timeZone: "Asia/Tokyo" }, { width: 450 }]) expect(() => verifyReference({ ...manifest,...change }, fixture, scenario,454,454)).toThrow();
  });
});
