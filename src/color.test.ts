import { describe, it, expect } from "vitest";
import { parseColor } from "./color.js";

describe("parseColor", () => {
  it("passes through 6-digit hex unchanged", () => {
    expect(parseColor("#FF0000")).toBe("#FF0000");
  });

  it("passes through lowercase 6-digit hex", () => {
    expect(parseColor("#ff0000")).toBe("#ff0000");
  });

  it("converts 8-digit AARRGGBB to rgba", () => {
    // #80FF0000 = alpha 128/255 ≈ 0.502, red 255, green 0, blue 0
    expect(parseColor("#80FF0000")).toBe("rgba(255, 0, 0, 0.502)");
  });

  it("converts fully opaque 8-digit to rgba", () => {
    expect(parseColor("#FF00FF00")).toBe("rgba(0, 255, 0, 1)");
  });

  it("converts fully transparent 8-digit to rgba", () => {
    expect(parseColor("#0000FF00")).toBe("rgba(0, 255, 0, 0)");
  });

  it("returns black for null", () => {
    expect(parseColor(null)).toBe("#000000");
  });

  it("returns black for undefined", () => {
    expect(parseColor(undefined)).toBe("#000000");
  });
});
