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
