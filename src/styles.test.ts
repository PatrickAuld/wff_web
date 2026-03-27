import { describe, expect, it } from "vitest";
import { applyFill, applyStroke, createGradient } from "./styles.js";

class MockGradient {
  readonly stops: Array<{ offset: number; color: string }> = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

function createElement(attributes: Record<string, string> = {}): Element {
  return {
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
    querySelector() {
      return null;
    },
  } as unknown as Element;
}

function createShapeElement(children: {
  fill?: Element | null;
  stroke?: Element | null;
}): Element {
  return {
    querySelector(selector: string) {
      if (selector === ":scope > Fill") {
        return children.fill ?? null;
      }
      if (selector === ":scope > Stroke") {
        return children.stroke ?? null;
      }
      return null;
    },
  } as unknown as Element;
}

function createFillElement(
  attributes: Record<string, string> = {},
  gradients: { linear?: Element; radial?: Element; sweep?: Element } = {}
): Element {
  return {
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
    querySelector(selector: string) {
      if (selector === ":scope > LinearGradient") {
        return gradients.linear ?? null;
      }
      if (selector === ":scope > RadialGradient") {
        return gradients.radial ?? null;
      }
      if (selector === ":scope > SweepGradient") {
        return gradients.sweep ?? null;
      }
      return null;
    },
  } as unknown as Element;
}

function createContext() {
  const linearGradient = new MockGradient();
  const radialGradient = new MockGradient();
  const conicGradient = new MockGradient();

  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineDashOffset: 0,
    fillCalls: 0,
    strokeCalls: 0,
    lineDash: [] as number[],
    linearGradient,
    radialGradient,
    conicGradient,
    fill() {
      this.fillCalls += 1;
    },
    stroke() {
      this.strokeCalls += 1;
    },
    setLineDash(values: number[]) {
      this.lineDash = values;
    },
    createLinearGradient() {
      return linearGradient as unknown as CanvasGradient;
    },
    createRadialGradient() {
      return radialGradient as unknown as CanvasGradient;
    },
    createConicGradient() {
      return conicGradient as unknown as CanvasGradient;
    },
  } as unknown as CanvasRenderingContext2D & {
    fillCalls: number;
    strokeCalls: number;
    lineDash: number[];
    linearGradient: MockGradient;
    radialGradient: MockGradient;
    conicGradient: MockGradient;
  };
}

describe("styles", () => {
  it("applies a solid fill color", () => {
    const fill = createFillElement({ color: "#80FF0000" });
    const shape = createShapeElement({ fill });
    const ctx = createContext();

    applyFill(ctx, shape);

    expect(ctx.fillStyle).toBe("rgba(255, 0, 0, 0.502)");
    expect(ctx.fillCalls).toBe(1);
  });

  it("applies stroke settings including dash intervals and phase", () => {
    const stroke = createElement({
      color: "#00FF00",
      thickness: "6",
      cap: "ROUND",
      dashIntervals: "10 5 2",
      dashPhase: "3.5",
    });
    const shape = createShapeElement({ stroke });
    const ctx = createContext();

    applyStroke(ctx, shape);

    expect(ctx.strokeStyle).toBe("#00FF00");
    expect(ctx.lineWidth).toBe(6);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineDash).toEqual([10, 5, 2]);
    expect(ctx.lineDashOffset).toBe(3.5);
    expect(ctx.strokeCalls).toBe(1);
  });

  it("creates a radial gradient with evenly spaced color stops by default", () => {
    const radial = createElement({
      centerX: "50",
      centerY: "50",
      radius: "40",
      colors: "#000000 #808080 #FFFFFF",
    });
    const fill = createFillElement({}, { radial });
    const ctx = createContext();

    const gradient = createGradient(ctx, fill) as unknown as MockGradient;

    expect(gradient).toBe(ctx.radialGradient);
    expect(ctx.radialGradient.stops).toEqual([
      { offset: 0, color: "#000000" },
      { offset: 0.5, color: "#808080" },
      { offset: 1, color: "#FFFFFF" },
    ]);
  });

  it("scales sweep-gradient stops to the requested angular span", () => {
    const sweep = createElement({
      centerX: "50",
      centerY: "50",
      startAngle: "0",
      endAngle: "180",
      colors: "#FF0000 #0000FF",
      positions: "0 1",
    });
    const fill = createFillElement({}, { sweep });
    const ctx = createContext();

    const gradient = createGradient(ctx, fill) as unknown as MockGradient;

    expect(gradient).toBe(ctx.conicGradient);
    expect(ctx.conicGradient.stops).toEqual([
      { offset: 0, color: "#FF0000" },
      { offset: 0.5, color: "#0000FF" },
      { offset: 1, color: "#0000FF" },
    ]);
  });
});
