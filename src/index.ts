export interface RenderOptions {
  xml: string;
  assets?: Map<string, ArrayBuffer>;
  width: number;
  height: number;
  time: Date;
  ambient: boolean;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
}

/**
 * Render a WFF v4 watch face XML to a Canvas element.
 * Stub implementation — will be built out feature by feature.
 */
export function renderWatchFace(_options: RenderOptions): RenderResult {
  throw new Error("Not yet implemented");
}
