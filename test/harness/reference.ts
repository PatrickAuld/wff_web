import { createHash } from "node:crypto";
import type { LoadedFixture, Scenario } from "./types.js";

export interface NativeReference {
  renderer: "wear-os";
  wffVersion: 4;
  device: string;
  buildFingerprint: string;
  capturedAt: string;
  fixtureSha256: string;
  scenario: string;
  time: string;
  timeZone: string;
  ambient: boolean;
  width: number;
  height: number;
}
export function fixtureFingerprint(fixture: LoadedFixture): string {
  const hash = createHash("sha256").update(fixture.xml);
  for (const [name, bytes] of Array.from(fixture.assets).sort(([a], [b]) => a.localeCompare(b))) hash.update("\0" + name + "\0").update(bytes);
  return hash.digest("hex");
}
export function verifyReference(manifest: NativeReference, fixture: LoadedFixture, scenario: Scenario, width: number, height: number): void {
  if (manifest.renderer !== "wear-os" || manifest.wffVersion !== 4) throw new Error("Baseline must originate from the native Wear OS v4 renderer");
  if (!manifest.device || !manifest.buildFingerprint || !Number.isFinite(Date.parse(manifest.capturedAt))) throw new Error("Native reference lacks capture provenance");
  if (manifest.fixtureSha256 !== fixtureFingerprint(fixture)) throw new Error("Native baseline does not match fixture XML/assets");
  if (manifest.scenario !== scenario.name || manifest.time !== scenario.time || manifest.ambient !== scenario.ambient || manifest.timeZone !== (scenario.timeZone ?? "UTC")) throw new Error("Native baseline scenario does not match");
  if (manifest.width !== width || manifest.height !== height) throw new Error("Native baseline dimensions do not match");
}
