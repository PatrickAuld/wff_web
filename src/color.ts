export function parseColor(value: string | null | undefined): string {
  if (value == null) return "#000000";

  // 8-digit AARRGGBB format: #AARRGGBB
  if (value.length === 9 && value.startsWith("#")) {
    const a = parseInt(value.slice(1, 3), 16);
    const r = parseInt(value.slice(3, 5), 16);
    const g = parseInt(value.slice(5, 7), 16);
    const b = parseInt(value.slice(7, 9), 16);
    const alpha = Number((a / 255).toFixed(3));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // 6-digit RRGGBB format: #RRGGBB — CSS-compatible, pass through
  return value;
}

export function colorChannels(color: string): number[] {
  const hex = color.replace(/^#/, "");
  const argb = hex.length === 6 ? "ff" + hex : hex;
  if (!/^[0-9a-f]{8}$/i.test(argb)) throw new Error(`Invalid WFF color: ${color}`);
  return [0, 2, 4, 6].map(i => parseInt(argb.slice(i, i + 2), 16));
}

export function mixColor(from: string, to: string, t: number): string {
  const a = colorChannels(from), b = colorChannels(to);
  return "#" + a.map((v, i) => Math.round(Math.max(0, Math.min(255, v + (b[i] - v) * t))).toString(16).padStart(2, "0")).join("");
}

export function extractColor(colors: string, weights: string | undefined, interpolate: boolean, value: number): string {
  const list = colors.trim().split(/\s+/).filter(Boolean).map(c => c.startsWith("#") ? c : "#" + c);
  if (!list.length) return "#00000000";
  const w = weights ? weights.trim().split(/\s+/).map(Number) : list.map(() => 1);
  if (w.length !== list.length || w.some(v => !Number.isFinite(v) || v < 0)) throw new Error("Invalid color weights");
  const total = w.reduce((a, b) => a + b, 0);
  if (!total) return list[0];
  let position = Math.max(0, Math.min(1, value)) * total;
  for (let i = 0; i < list.length; i++) {
    if (position < w[i] || i === list.length - 1) return interpolate && i < list.length - 1 ? mixColor(list[i], list[i + 1], w[i] ? position / w[i] : 0) : list[i];
    position -= w[i];
  }
  return list.at(-1)!;
}
