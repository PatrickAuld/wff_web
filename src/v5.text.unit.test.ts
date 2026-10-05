import { describe, it, expect } from "vitest";
import { renderPartText } from "./text.js";
import { element, type TestElement } from "../test/helpers/elements.js";

function node(tag: string, attrs: Record<string, string | number> = {}, content: (TestElement | string)[] = []): TestElement {
  const el = element(tag, attrs, content.filter(c => typeof c !== "string") as TestElement[]);
  Object.assign(el, { nodeType: 1, childNodes: content.map(c => typeof c === "string" ? { nodeType: 3, textContent: c } : c) });
  el.textContent = content.map(c => typeof c === "string" ? c : c.textContent).join("");
  return el;
}
async function draw(text: TestElement, width = 200, height = 100) {
  const part = node("PartText", { width, height }, [text]);
  part.querySelector = () => text;
  const calls: { text: string; font: string; y: number; baseline: string; translations: number[][] }[] = [];
  const ctx = {
    font: "16px sans-serif", textBaseline: "alphabetic", translations: [] as number[][],
    measureText(text: string) { const size = parseFloat(this.font.match(/([\d.]+)px/)![1]); return { width: text.length * size * .5, actualBoundingBoxAscent: size * .7, actualBoundingBoxDescent: size * .2 }; },
    fillText(text: string, x: number, y: number) { calls.push({ text, font: this.font, y, baseline: this.textBaseline, translations: this.translations.slice() }); },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, rotate() {},
    translate(x: number, y: number) { this.translations.push([x, y]); },
  };
  await renderPartText(ctx as unknown as CanvasRenderingContext2D, part.asElement(), { expressionCtx: { sources: {} }, ambient: false, assets: new Map(), elapsedMs: 0 });
  return calls;
}

describe("v5 text layout without rasterization", () => {
  it.each(["TOP", "BOTTOM", "CENTER", "CENTER_ON_BASELINE"])("aligns shared font baselines with %s", async verticalAlign => {
    const calls = await draw(node("Text", { verticalAlign }, [node("Font", { size: 20 }, ["A"]), node("Font", { size: 40 }, ["B"])]));
    expect(calls.map(c => c.y)).toEqual([calls[0].y, calls[0].y]);
    const y = verticalAlign === "TOP" ? 28 : verticalAlign === "BOTTOM" ? 92 : verticalAlign === "CENTER" ? 60 : 50;
    expect(calls[0].y).toBeCloseTo(y); expect(calls.every(c => c.baseline === "alphabetic")).toBe(true);
  });
  it("includes line spacing when fitting and limits negative spacing", async () => {
    const make = (lineSpacing: number) => node("Text", { maxLines: 3, lineSpacing }, [node("Font", { size: 20 }, ["A\nB\nC"])]);
    const positive = await draw(make(10)), negative = await draw(make(-20));
    expect(positive[1].y - positive[0].y).toBe(34);
    expect(negative[1].y - negative[0].y).toBe(19);
    const fitted = await draw(node("Text", { maxLines: -1, lineSpacing: 10, isAutoSize: "TRUE" }, [node("Font", { size: 20, minSize: 8 }, ["A\nB\nC"])]), 200, 60);
    expect(fitted).toHaveLength(3); expect(parseFloat(fitted[0].font.match(/([\d.]+)px/)![1])).toBeLessThan(12);
  });
  it("stops shrinking at every run's minimum and applies ellipsis afterward", async () => {
    const calls = await draw(node("Text", { isAutoSize: "TRUE" }, [node("Font", { size: 40, minSize: 8 }, ["AA"]), node("Font", { size: 20, minSize: 10 }, ["BB"])]), 1);
    expect(calls.map(c => c.font.match(/[\d.]+px/)![0])).toEqual(["20px", "10px"]);
    const ellipsis = await draw(node("Text", { isAutoSize: "TRUE", ellipsis: "TRUE" }, [node("Font", { size: 40, minSize: 8 }, ["Long label"])]), 20);
    expect(ellipsis[0].font).toContain("8px"); expect(ellipsis.map(c => c.text).join("")).toBe("Long…");
  });
  it.each(["CLOCKWISE", "COUNTER_CLOCKWISE"])("fits a narrow %s elliptical arc before ellipsis", async direction => {
    const calls = await draw(node("TextCircular", { width: 160, height: 80, startAngle: 0, endAngle: direction === "CLOCKWISE" ? 10 : 350, direction, verticalAlign: "CENTER_ON_BASELINE", isAutoSize: "TRUE", ellipsis: "TRUE" }, [node("Font", { size: 40, minSize: 8 }, ["Long label"])]));
    expect(calls.map(c => c.text).join("")).toContain("…");
    expect(calls.every(c => c.font.includes("8px") && c.y === 0 && c.baseline === "alphabetic")).toBe(true);
  });
});
