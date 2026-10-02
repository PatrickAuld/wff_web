import { parseColor } from "./color.js";

export function modulatePixels(destination: Uint8ClampedArray, source: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(destination.length);
  for (let i = 0; i < output.length; i += 4) {
    const alpha = destination[i + 3] * source[i + 3] / 255;
    output[i + 3] = alpha;
    if (alpha) for (let c = 0; c < 3; c++) output[i + c] = destination[i + c] * source[i + c] / 255;
  }
  return output;
}

export function compositeLayer(ctx: CanvasRenderingContext2D, layer: OffscreenCanvas, tint: string | null, mode: string | null): void {
  if (mode === "DST") return;
  if (tint) {
    const target = layer.getContext("2d")!;
    target.globalCompositeOperation = "source-in";
    target.fillStyle = parseColor(tint); target.fillRect(0, 0, layer.width, layer.height);
  }
  if (mode === "MODULATE") {
    const plane = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height), target = plane.getContext("2d")!;
    target.setTransform(ctx.getTransform()); target.globalAlpha = ctx.globalAlpha; target.drawImage(layer, 0, 0);
    const source = target.getImageData(0, 0, plane.width, plane.height);
    const destination = ctx.getImageData(0, 0, plane.width, plane.height);
    source.data.set(modulatePixels(destination.data, source.data));
    target.resetTransform(); target.putImageData(source, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, layer.width, layer.height); ctx.clip(); ctx.resetTransform();
    ctx.globalCompositeOperation = "copy"; ctx.globalAlpha = 1; ctx.drawImage(plane, 0, 0); ctx.restore();
  } else if (mode === "CLEAR") {
    ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, layer.width, layer.height); ctx.restore();
  } else {
    // Canvas Porter-Duff modes affect pixels outside drawImage's source bounds.
    // Restrict layer compositing to the WFF part's transformed rectangle.
    ctx.save();
    try { if (mode) { ctx.beginPath(); ctx.rect(0, 0, layer.width, layer.height); ctx.clip(); } ctx.drawImage(layer, 0, 0); }
    finally { ctx.restore(); }
  }
}
