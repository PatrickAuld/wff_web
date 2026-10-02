import { describe, it, expect } from "vitest";
import { evaluateExpression, localizedDataSources } from "./expressions.js";
import { formatDate, formatNumber, formatTemplate } from "./format.js";
import { applyAttributes } from "./attributes.js";
import { prepareScene } from "./scene.js";
import { transition, type Transition } from "./animation.js";
import { filterPixels } from "./images.js";
import { extractColor } from "./color.js";
import { element } from "../test/helpers/elements.js";

const utc = { sources: { UTC_TIMESTAMP: Date.parse("2024-01-15T10:10:00Z") }, locale: "en-US", timeZone: "UTC" };

describe("v4 expression and formatting conformance", () => {
  it.each(["1 / 0", "0 / 0", "1 % 0"])("%s returns zero", expr => expect(evaluateExpression(expr, utc)).toBe(0));
  it("handles booleans, unary plus, short-circuit evaluation and color literals", () => {
    expect(evaluateExpression("true ? +2 : 0", utc)).toBe(2);
    expect(evaluateExpression("false && unknown()", utc)).toBe(0);
    expect(evaluateExpression("true || unknown()", utc)).toBe(1);
    expect(evaluateExpression("#80ff0000", utc)).toBe("#80ff0000");
  });
  it("constructs and interpolates ARGB colors", () => {
    expect(evaluateExpression("colorArgb(128,255,0,0)", utc)).toBe("#80ff0000");
    expect(evaluateExpression("colorRgb(0,255,0)", utc)).toBe("#00ff00");
    expect(evaluateExpression('extractColorFromColors("FF0000 00FF00",true,0.25)', utc)).toBe("#ff808000");
    expect(extractColor("#ff0000 #00ff00 #0000ff", "1 2 1", false, .5)).toBe("#00ff00");
  });
  it("implements the remaining math functions", () => {
    expect(evaluateExpression("cbrt(27)", utc)).toBe(3);
    expect(evaluateExpression("expm1(0)", utc)).toBe(0);
    expect(evaluateExpression("rand(10,20)", { ...utc, random: () => .25 })).toBe(12.5);
  });
  it("implements DecimalFormat and printf parameter order", () => {
    expect(formatNumber("#,##0.00", 1234.5)).toBe("1,234.50");
    expect(evaluateExpression('numberFormat("000", 5)', utc)).toBe("005");
    expect(formatTemplate("%2$s %1$02d %% %.1f", [7, "hello", 2.5])).toBe("hello 07 % 7.0");
    expect(formatTemplate("%05d", [-7])).toBe("-0007");
  });
  it("formats milliseconds and quoted date literals", () => {
    expect(evaluateExpression('icuText("HH:mm",1705313400000)', utc)).toBe("10:10");
    expect(formatDate("yyyy-MM-dd 'at' HH:mm", utc.sources.UTC_TIMESTAMP, utc)).toBe("2024-01-15 at 10:10");
    expect(evaluateExpression('icuBestText("yyyy MMM d EE a h:mm")', utc)).toContain("2024");
  });
  it("uses timezone wall time without changing the epoch", () => {
    const ctx = localizedDataSources(new Date("2024-03-10T10:30:00Z"), {}, true, "en-US", "America/Los_Angeles");
    expect(ctx.sources.HOUR_0_23).toBe(3);
    expect(ctx.sources.UTC_TIMESTAMP).toBe(Date.parse("2024-03-10T10:30:00Z"));
    expect(ctx.sources.DAY_OF_YEAR).toBe(70);
    expect(ctx.sources.TIMEZONE_OFFSET_MINUTES).toBe(-480);
    expect(ctx.sources.TIMEZONE_OFFSET_MINUTES_DST).toBe(-420);
  });
  it("supports half-hour zones and ISO week boundaries", () => {
    const ctx = localizedDataSources(new Date("2021-01-01T00:00:00Z"), {}, true, "en-GB", "Asia/Kolkata");
    expect(ctx.sources.HOUR_0_23).toBe(5); expect(ctx.sources.MINUTE).toBe(30);
    expect(ctx.sources.WEEK_IN_YEAR).toBe(53); expect(ctx.sources.FIRST_DAY_OF_WEEK).toBe(2);
  });
});

describe("v4 attributes, references and transitions", () => {
  it("applies string color transforms and gyro translations", () => {
    const node = element("PartText", { x: 10 }, [element("Transform", { target: "tintColor", value: "colorRgb(255,0,0)" }), element("Gyro", { x: "[ACCELEROMETER_ANGLE_X]" })]);
    applyAttributes(node.asElement(), { sources: { ACCELEROMETER_ANGLE_X: 4 } }, false, 0, new Map(), "node");
    expect(node.getAttribute("x")).toBe("14"); expect(node.getAttribute("tintColor")).toBe("#ff0000");
  });
  it("resolves forward references before consumer transforms", () => {
    const consumer = element("PartDraw", {}, [element("Transform", { target: "x", value: "[REFERENCE.position] + 1" })]);
    const provider = element("PartText", { x: 10 }, [element("Transform", { target: "x", value: "20" }), element("Reference", { name: "position", source: "x", defaultValue: 0 })]);
    prepareScene(element("Scene", {}, [consumer, provider]).asElement(), utc, false, 0, new Map());
    expect(consumer.getAttribute("x")).toBe("21");
  });
  it("uses defaults for hidden reference providers", () => {
    const consumer = element("PartDraw", {}, [element("Transform", { target: "x", value: "[REFERENCE.hidden]" })]);
    const hidden = element("PartText", { alpha: 0, x: 100 }, [element("Reference", { name: "hidden", source: "x", defaultValue: 8 })]);
    prepareScene(element("Scene", {}, [consumer, hidden]).asElement(), utc, false, 0, new Map());
    expect(consumer.getAttribute("x")).toBe("8");
  });
  it("rejects cyclic references", () => {
    const a = element("PartDraw", {}, [element("Transform", { target: "x", value: "[REFERENCE.b]" }), element("Reference", { name: "a", source: "x", defaultValue: 0 })]);
    const b = element("PartDraw", {}, [element("Transform", { target: "x", value: "[REFERENCE.a]" }), element("Reference", { name: "b", source: "x", defaultValue: 0 })]);
    expect(() => prepareScene(element("Scene", {}, [a, b]).asElement(), utc, false, 0, new Map())).toThrow("Cyclic");
  });
  it("selects configuration and named expression branches", () => {
    const yes = element("ListOption", { id: "yes" }, [element("PartDraw")]), no = element("ListOption", { id: "no" }, [element("PartDraw")]);
    const conf = element("ListConfiguration", { id: "theme" }, [yes, no]);
    const compare = element("Compare", { expression: "[ready]" }, [element("PartText")]);
    const condition = element("Condition", {}, [element("Expressions", {}, [element("Expression", { name: "ready", expression: "1" })]), compare, element("Default")]);
    prepareScene(element("Scene", {}, [conf, condition]).asElement(), { sources: { "CONFIGURATION.theme": "yes" } }, false, 0, new Map());
    expect(conf.children).toEqual([yes]); expect(condition.children).toEqual([compare]);
  });
  it("animates changes and retargets from the current displayed value", () => {
    const animation = element("Animation", { duration: 1, fps: 60 }).asElement(), states = new Map<string, Transition>();
    expect(transition(0, animation, 0, states, "x")).toBe(0);
    expect(transition(100, animation, 100, states, "x")).toBe(0);
    expect(transition(100, animation, 600, states, "x")).toBeCloseTo(50);
    expect(transition(200, animation, 600, states, "x")).toBeCloseTo(50);
    expect(transition(200, animation, 1100, states, "x")).toBeCloseTo(125);
  });
  it("wraps angular transitions and interpolates color channels", () => {
    const animation = element("Animation", { duration: 1, fps: 60, angleDirection: "CLOCKWISE" }).asElement(), states = new Map<string, Transition>();
    transition(350, animation, 0, states, "a"); transition(10, animation, 0, states, "a");
    expect(transition(10, animation, 500, states, "a")).toBeCloseTo(360);
    transition("#ff0000", animation, 0, states, "c"); transition("#0000ff", animation, 0, states, "c");
    expect(transition("#0000ff", animation, 500, states, "c")).toBe("#ff800080");
  });
  it("animates both directions of ambient transitions", () => {
    const states = new Map<string, Transition>();
    const create = () => element("PartDraw", { alpha: 255 }, [element("Variant", { mode: "AMBIENT", target: "alpha", value: "0" }, [element("Animation", { duration: 1, fps: 60 })])]);
    let node = create(); applyAttributes(node.asElement(), utc, false, 0, states, "node");
    node = create(); applyAttributes(node.asElement(), utc, true, 0, states, "node");
    node = create(); applyAttributes(node.asElement(), utc, true, 500, states, "node"); expect(Number(node.getAttribute("alpha"))).toBeCloseTo(127.5);
    node = create(); applyAttributes(node.asElement(), utc, false, 500, states, "node");
    node = create(); applyAttributes(node.asElement(), utc, false, 1000, states, "node"); expect(Number(node.getAttribute("alpha"))).toBeCloseTo(191.25);
  });
});

it("HSB filtering rotates hue and preserves image alpha", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 128]); filterPixels(pixels, 120, 1, .5);
  expect(Array.from(pixels)).toEqual([0, 128, 0, 128]);
});

import { modulatePixels } from "./compositing.js";
import { secondHandAngle } from "./clock.js";
it("MODULATE multiplies alpha as well as RGB", () => {
  expect(Array.from(modulatePixels(new Uint8ClampedArray([255, 128, 64, 128]), new Uint8ClampedArray([128, 255, 128, 128])))).toEqual([128, 128, 32, 64]);
});
it("Sweep uses fractional seconds at the requested frequency and is disabled in ambient", () => {
  const hand = element("SecondHand", {}, [element("Sweep", { frequency: 5 })]).asElement();
  expect(secondHandAngle(hand, 10, 550, false)).toBeCloseTo(62.4);
  expect(secondHandAngle(hand, 10, 550, true)).toBe(60);
});
it("Tick completes during duration and holds for the rest of the second", () => {
  const hand = element("SecondHand", {}, [element("Tick", { duration: .2, strength: 1 })]).asElement();
  expect(secondHandAngle(hand, 10, 0, false)).toBeCloseTo(54);
  expect(secondHandAngle(hand, 10, 200, false)).toBe(60);
  expect(secondHandAngle(hand, 10, 750, false)).toBe(60);
});

import { formatTime } from "./format.js";
import { renderWeightedStroke } from "./styles.js";
it("accepts the official unquoted color and weight list expression", () => {
  expect(evaluateExpression("extractColorFromWeightedColors(#97d700 #FCE300 #ff8200 #f65058 #9461c9, 3 3 2 3 1, false, 0.1)", utc)).toBe("#97d700");
  expect(evaluateExpression("extractColorFromColors(#ff0000 #00ff00 #0000ff, false, 0.5)", utc)).toBe("#00ff00");
});
it("uses standard Variant timing fractions and startOffset", () => {
  const states = new Map<string, Transition>();
  const create = () => element("PartDraw", { x: 0 }, [element("Variant", { mode: "AMBIENT", target: "x", value: 100, duration: .5, startOffset: .5 })]);
  const frame = (ambient: boolean, elapsed: number) => { const node = create(); applyAttributes(node.asElement(), utc, ambient, elapsed, states, "node", 2000); return Number(node.getAttribute("x")); };
  expect(frame(false, 0)).toBe(0); expect(frame(true, 0)).toBe(0);
  expect(frame(true, 900)).toBe(0); expect(frame(true, 1500)).toBeCloseTo(46.6666667);
  expect(frame(true, 2000)).toBe(100);
  expect(frame(false, 2000)).toBe(100); expect(frame(false, 4000)).toBe(0);
});
it("formats TimeText digits and honors explicit hour modes", () => {
  const ctx = { ...utc, sources: { ...utc.sources, IS_24_HOUR_MODE: 0 } };
  const epoch = Date.parse("2024-01-15T21:34:56Z");
  expect(formatTime("hh_10 hh_1 mm_10 mm_1 ss_10 ss_1", epoch, ctx)).toBe("0 9 3 4 5 6");
  expect(formatTime("hh:mm", epoch, ctx, "24")).toBe("21:34");
  expect(formatTime("HH:mm", epoch, ctx, "12")).toBe("09:34");
});
it("allows a gradient WeightedStroke with one weight per color interval", () => {
  const stroke = element("WeightedStroke", { colors: "#ff0000 #00ff00 #0000ff", weights: "1 2", thickness: 10, interpolate: "TRUE" });
  const line = element("Line", { startX: 0, startY: 0, endX: 90, endY: 0 }, [stroke]);
  const segments: number[][] = [];
  const ctx = { save() {}, restore() {}, setLineDash() {}, beginPath() {}, moveTo(x: number, y: number) { segments.push([x,y]); }, lineTo(x: number, y: number) { segments.at(-1)!.push(x,y); }, stroke() {}, createLinearGradient() { return { addColorStop() {} }; } };
  expect(renderWeightedStroke(ctx as unknown as CanvasRenderingContext2D, line.asElement())).toBe(true);
  expect(segments).toEqual([[0,0,30,0],[30,0,90,0]]);
});

it("keeps non-Gregorian calendar numeric fields and fractions consistent", () => {
  const time = new Date("2024-01-15T10:10:00Z");
  const buddhist = localizedDataSources(time, {}, true, "en-US", "UTC", "buddhist");
  expect(buddhist.sources.YEAR).toBe(2567); expect(buddhist.sources.YEAR_S).toBe(67);
  expect(buddhist.sources.YEAR_MONTH).toBe(2567); expect(buddhist.sources.DAY_OF_YEAR).toBe(15);
  const islamic = localizedDataSources(time, {}, true, "en-US", "UTC", "islamic-civil");
  expect(islamic.sources.YEAR).toBe(1445); expect(islamic.sources.MONTH).toBe(7);
  expect(islamic.sources.DAY).toBe(4); expect(islamic.sources.DAY_OF_YEAR).toBe(181); expect(islamic.sources.DAYS_IN_MONTH).toBe(30);
});
it("formats localized digits, week/day fields and timezone offsets", () => {
  expect(formatDate("HH:mm", utc.sources.UTC_TIMESTAMP, { ...utc, locale: "ar-EG" })).toBe("١٠:١٠");
  expect(formatDate("D w XXX", utc.sources.UTC_TIMESTAMP, utc)).toBe("15 3 Z");
  expect(formatDate("HH:mm XXX", utc.sources.UTC_TIMESTAMP, {...utc,timeZone:"Asia/Kolkata"})).toBe("15:40 +05:30");
});

it("formats scientific, currency, per-mille and quoted DecimalFormat affixes", () => {
  expect(formatNumber("0.00E0", 12345)).toBe("1.23E4");
  expect(formatNumber("0.0E00", .00125)).toBe("1.2E-03");
  expect(formatNumber("¤#,##0.00;(¤#,##0.00)", -12.5, "en-US", "USD")).toBe("($12.50)");
  expect(formatNumber("0‰", .025)).toBe("25‰");
  expect(formatNumber("'Rate '0'%'", 25)).toBe("Rate 25%");
  expect(formatNumber("0.00;(0.00)", -5)).toBe("(5.00)");
});

it("evaluates standard Expression element text before Compare selection", () => {
  const expression = element("Expression", { name: "ready" }); expression.textContent = "[STEP_COUNT] > 5000";
  const compare = element("Compare", { expression: "[ready]" }, [element("PartText")]);
  const condition = element("Condition", {}, [element("Expressions", {}, [expression]), compare, element("Default")]);
  prepareScene(element("Scene", {}, [condition]).asElement(), {sources:{STEP_COUNT:6000}}, false, 0, new Map());
  expect(condition.children).toEqual([compare]);
});

it("supports Template numeric conversions, flags, reuse and timestamp conversions", () => {
  expect(formatTemplate("%1$04x %1$#x %1$o", [255])).toBe("00ff 0xff 377");
  expect(formatTemplate("%2$s %<s %1$(06d", [-7,"hi"])).toBe("hi hi (0007)");
  expect(formatTemplate("%.2e %.3g %a", [1234,1234,2])).toBe("1.23e+03 1.23e+03 0x1.0p1");
  expect(formatTemplate("%1$tF %1$tR", [utc.sources.UTC_TIMESTAMP], utc)).toBe("2024-01-15 10:10");
});
