/** Configuration for a single test fixture */
export interface FixtureConfig {
  name: string;
  description: string;
  watchface?: string; // relative path to XML, defaults to "watchface.xml"
  assets?: string; // relative path to assets directory
  scenarios: Scenario[];
}

/** A specific state to render and compare */
export interface Scenario {
  name: string;
  time: string; // ISO 8601 e.g. "2024-01-15T10:10:30"
  ambient: boolean;
  threshold?: number; // pixelmatch threshold, default 0.1
  maxDiffPixelPercent?: number; // max % diff pixels to pass, default 1.0
}

/** A loaded fixture ready for testing */
export interface LoadedFixture {
  dir: string;
  config: FixtureConfig;
  xml: string;
  assets: Map<string, Buffer>;
}

/** Result of comparing two images */
export interface ComparisonResult {
  match: boolean;
  diffPixelCount: number;
  diffPixelPercent: number;
  totalPixels: number;
  diffImage: Buffer;
  baselineImage: Buffer;
  canvasImage: Buffer;
}

/** Configuration for the canvas renderer */
export interface RenderConfig {
  watchfaceXml: string;
  assets: Map<string, Buffer>;
  width: number;
  height: number;
  time: Date;
  ambient: boolean;
}

/** Default values */
export const DEFAULTS = {
  watchWidth: 454,
  watchHeight: 454,
  threshold: 0.1,
  maxDiffPixelPercent: 1.0,
  settleDelayMs: 2000,
  watchfaceFile: "watchface.xml",
} as const;
