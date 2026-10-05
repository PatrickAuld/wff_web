import { describe, it, expect } from "vitest";
import { prepareConfigurations } from "./configuration.js";
import { complicationContext, selectedComplication } from "./complications.js";
import { applyStroke, renderWeightedStroke } from "./styles.js";
import { prepareScene } from "./scene.js";
import { element, type TestElement } from "../test/helpers/elements.js";

function document(settings: TestElement[], slots = [1, 2, 3]): Document {
  const root = element("WatchFace", {}, [element("UserConfigurations", {}, settings), element("Scene", {}, slots.map(slotId => element("ComplicationSlot", { slotId })))]);
  return { querySelector: (s: string) => root.querySelector(s), querySelectorAll: (s: string) => s === "Scene ComplicationSlot" ? root.querySelector("Scene")!.querySelectorAll("ComplicationSlot") : root.querySelectorAll(s) } as unknown as Document;
}
const option = (id: string, childSettingIds = "", complicationSlotIds = "") => element("ListOption", { id, childSettingIds, complicationSlotIds });
const list = (id: string, options: TestElement[], defaultValue = options[0].getAttribute("id")!) => element("ListConfiguration", { id, defaultValue }, options);

describe("v5 hierarchical configuration", () => {
  const settings = () => [list("layout", [option("plain"), option("detail", "child", "1")]), list("child", [option("off"), option("on", "grandchild", "2")], "on"), element("BooleanConfiguration", { id: "grandchild", defaultValue: "TRUE" })];
  it("only activates reachable settings and their selected option's slots", () => {
    const plain = prepareConfigurations(document(settings()), { child: "on" });
    expect(plain.settings.map(s => s.active)).toEqual([true, false, false]); expect(plain.activeComplicationSlotIds).toEqual([3]); expect(plain.values.child).toBe("on");
    const detail = prepareConfigurations(document(settings()), { layout: "detail" });
    expect(detail.settings.map(s => s.active)).toEqual([true, true, true]); expect(detail.activeComplicationSlotIds).toEqual([1, 2, 3]);
    const off = prepareConfigurations(document(settings()), { layout: "detail", child: "off" });
    expect(off.settings.map(s => s.active)).toEqual([true, true, false]); expect(off.activeComplicationSlotIds).toEqual([1, 3]);
  });
  it("activates a shared slot when any active selected option enables it", () => {
    const doc = document([list("a", [option("off"), option("on", "", "1")]), list("b", [option("off"), option("on", "", "1, 2")])]);
    expect(prepareConfigurations(doc, { b: "on" }).activeComplicationSlotIds).toEqual([1, 2, 3]);
  });
  it("applies flavor presets before explicit choices and expands color defaults", () => {
    const doc = document([...settings(), element("ColorConfiguration", { id: "palette", defaultValue: "blue" }, [element("ColorOption", { id: "blue", colors: "#0000ff #ffffff" })]), element("Flavors", { defaultValue: "fancy" }, [element("Flavor", { id: "fancy" }, [element("Configuration", { id: "layout", optionId: "detail" })])])]);
    expect(prepareConfigurations(doc).settings.every(s => s.active)).toBe(true);
    expect(prepareConfigurations(doc).values["palette.1"]).toBe("#ffffff");
    expect(prepareConfigurations(doc, { layout: "plain" }).activeComplicationSlotIds).toEqual([3]);
  });
  it("rejects cycles, missing children, duplicate IDs and too many levels", () => {
    expect(() => prepareConfigurations(document([list("a", [option("0", "a")])]))).toThrow("Cyclic");
    expect(() => prepareConfigurations(document([list("a", [option("0", "b")])]))).toThrow("Unknown child");
    expect(() => prepareConfigurations(document([list("a", [option("0")]), list("a", [option("0")])]))).toThrow("Duplicate");
    expect(() => prepareConfigurations(document([list("a", [option("0", "b")]), list("b", [option("0", "c")]), list("c", [option("0", "d")]), list("d", [option("0")])]))).toThrow("exceeds");
  });
  it("rejects nonnumeric slot IDs and invalid choices", () => {
    expect(() => prepareConfigurations(document([list("a", [option("0", "", "wrong")])]))).toThrow("Invalid complication slot");
    expect(() => prepareConfigurations(document(settings()), { layout: "wrong" })).toThrow("Unknown option");
  });
});

describe("v5 complication preview", () => {
  it("prepares only selected templates with independent slot contexts", () => {
    const a = element("PartText", {}, [element("Transform", { target: "x", value: "[COMPLICATION.RANGED_VALUE_VALUE]" })]);
    const b = element("PartText", {}, [element("Transform", { target: "x", value: "[COMPLICATION.RANGED_VALUE_VALUE]" })]);
    const skipped = element("Complication", { type: "SHORT_TEXT" }, [element("PartText", { x: 100 })]);
    const first = element("ComplicationSlot", { slotId: 1, supportedTypes: "SHORT_TEXT RANGED_VALUE" }, [element("Complication", { type: "RANGED_VALUE" }, [a]), skipped]);
    const second = element("ComplicationSlot", { slotId: 2, supportedTypes: "RANGED_VALUE" }, [element("Complication", { type: "RANGED_VALUE" }, [b])]);
    const outside = element("PartText");
    const scene = element("Scene", {}, [first, second, outside]);
    const contexts = prepareScene(scene.asElement(), { sources: { BATTERY_PERCENT: 75 } }, false, 0, new Map(), 1000, { activeSlotIds: new Set([1, 2]), data: { 1: { type: "RANGED_VALUE", data: { RANGED_VALUE_VALUE: 45, TEXT: "first" } }, 2: { type: "RANGED_VALUE", data: { RANGED_VALUE_VALUE: 75 } } } });
    expect(a.getAttribute("x")).toBe("45"); expect(b.getAttribute("x")).toBe("75");
    expect(first.children).not.toContain(skipped);
    expect(contexts.get(a.asElement())!.sources["COMPLICATION.TEXT"]).toBe("first");
    expect(contexts.get(b.asElement())!.sources["COMPLICATION.TEXT"]).toBeUndefined();
    expect(contexts.get(outside.asElement())!.sources["COMPLICATION.RANGED_VALUE_VALUE"]).toBeUndefined();
  });
  it("removes disabled slots and resolves references to their defaults", () => {
    const content = element("PartDraw", { width: 100 }, [element("Reference", { name: "slotWidth", source: "width", defaultValue: 10 })]);
    const slot = element("ComplicationSlot", { slotId: 1 }, [element("Complication", { type: "SHORT_TEXT" }, [content])]);
    const consumer = element("PartDraw", {}, [element("Transform", { target: "x", value: "[REFERENCE.slotWidth]" })]);
    const scene = element("Scene", {}, [slot, consumer]);
    prepareScene(scene.asElement(), { sources: {} }, false, 0, new Map(), 1000, { activeSlotIds: new Set(), data: { 1: { type: "SHORT_TEXT" } } });
    expect(scene.children).toEqual([consumer]); expect(consumer.getAttribute("x")).toBe("10");
  });
  it("isolates slot-local data and normalizes prefixed and boolean fields", () => {
    const parent = { sources: { BATTERY_PERCENT: 75, "COMPLICATION.TEXT": "stale" } };
    const ctx = complicationContext(parent, { type: "RANGED_VALUE", data: { TEXT: "new", "COMPLICATION.RANGED_VALUE_VALUE": 75, RANGED_VALUE_COLORS_INTERPOLATE: true } });
    expect(ctx.sources).toEqual({ BATTERY_PERCENT: 75, "COMPLICATION.TEXT": "new", "COMPLICATION.RANGED_VALUE_VALUE": 75, "COMPLICATION.RANGED_VALUE_COLORS_INTERPOLATE": 1 });
    expect(parent.sources["COMPLICATION.TEXT"]).toBe("stale");
    expect(complicationContext(parent, { type: "EMPTY" }).sources).toEqual({ BATTERY_PERCENT: 75 });
  });
  it("disables linked slots before validating data and rejects unsupported active types", () => {
    const slot = element("ComplicationSlot", { slotId: 1, supportedTypes: "SHORT_TEXT EMPTY" }).asElement();
    expect(selectedComplication(slot, { activeSlotIds: new Set(), data: { 1: { type: "RANGED_VALUE" } } })).toBeUndefined();
    expect(() => selectedComplication(slot, { activeSlotIds: new Set([1]), data: { 1: { type: "RANGED_VALUE" } } })).toThrow("Unsupported");
    expect(selectedComplication(slot, { activeSlotIds: new Set([1]), data: { 1: { type: "EMPTY" } } })?.type).toBe("EMPTY");
  });
});

it.each([undefined, "MITER", "ROUND", "BEVEL"])("uses join %s on ordinary and weighted strokes", join => {
  const ctx = { lineJoin: "bevel", setLineDash() {}, stroke() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {} } as unknown as CanvasRenderingContext2D;
  const attrs: Record<string, string> = join ? { join } : {};
  applyStroke(ctx, element("Rectangle", {}, [element("Stroke", { ...attrs, thickness: 10, color: "#ffffff" })]).asElement());
  expect(ctx.lineJoin).toBe((join ?? "MITER").toLowerCase());
  ctx.lineJoin = "round";
  renderWeightedStroke(ctx, element("Line", { startX: 0, endX: 100 }, [element("WeightedStroke", { ...attrs, colors: "#ffffff", weights: "1", thickness: 10 })]).asElement());
  expect(ctx.lineJoin).toBe((join ?? "MITER").toLowerCase());
});
