import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";

let browser: Browser, source: string;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); source = await readFile(new URL("../dist/index.js", import.meta.url), "utf8"); });
afterAll(async () => { await browser?.close(); });
async function page(): Promise<Page> {
  const p = await browser.newPage();
  await p.setContent("<canvas></canvas>");
  await p.addScriptTag({ content: source.replace(/export\s*\{[^}]*\}/, "") + "\nwindow.renderWatchFace = renderWatchFace;" });
  await p.evaluate(() => {
    const draws: { text: string; x: number; y: number; font: string; baseline: string; ascent: number; descent: number; matrix: number[] }[] = [];
    (window as any).draws = draws;
    for (const prototype of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
      const original = prototype.fillText;
      prototype.fillText = function (text: string, x: number, y: number) {
        const m = this.getTransform(), metrics = this.measureText(text);
        draws.push({ text, x, y, font: this.font, baseline: this.textBaseline, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent, matrix: [m.a, m.b, m.c, m.d, m.e, m.f] });
        original.call(this, text, x, y);
      };
    }
  });
  return p;
}
const wrap = (body: string, settings = "") => `<WatchFace width="200" height="200" clipShape="NONE">${settings}<Scene backgroundColor="#000000">${body}</Scene></WatchFace>`;
const rect = (color: string, x = 0, y = 0, width = 200, height = 200) => `<PartDraw x="${x}" y="${y}" width="${width}" height="${height}"><Rectangle width="${width}" height="${height}"><Fill color="${color}"/></Rectangle></PartDraw>`;
async function render(p: Page, xml: string, options: Record<string, unknown> = {}) {
  return p.evaluate(async ({ xml, options }) => {
    (window as any).draws.length = 0;
    (window as any).result = await (window as any).renderWatchFace(document.querySelector("canvas"), { xml, timeZone: "UTC", elapsedMs: 0, ...options });
    return (window as any).draws as { text: string; x: number; y: number; font: string; baseline: string; ascent: number; descent: number; matrix: number[] }[];
  }, { xml, options });
}
async function pixel(p: Page, x: number, y: number) { return p.evaluate(({ x, y }) => Array.from(document.querySelector("canvas")!.getContext("2d")!.getImageData(x, y, 1, 1).data), { x, y }); }

describe("WFF v5 text", () => {
  it.each(["TOP", "BOTTOM", "CENTER", "CENTER_ON_BASELINE"])("aligns mixed fonts using %s", async align => {
    const p = await page();
    const draws = await render(p, wrap(`<PartText width="200" height="100"><Text verticalAlign="${align}"><Font size="20">Ag</Font><Font size="40">Ag</Font></Text></PartText>`));
    expect(draws).toHaveLength(2);
    expect(draws[0].y).toBe(draws[1].y);
    expect(draws.every(d => d.baseline === "alphabetic")).toBe(true);
    const top = Math.min(...draws.map(d => d.y - d.ascent)), bottom = Math.max(...draws.map(d => d.y + d.descent));
    if (align === "TOP") expect(top).toBeCloseTo(0);
    if (align === "BOTTOM") expect(bottom).toBeCloseTo(100);
    if (align === "CENTER") expect((top + bottom) / 2).toBeCloseTo(50);
    if (align === "CENTER_ON_BASELINE") expect(draws[0].y).toBe(50);
    await p.close();
  });
  it("applies lineSpacing, caps negative spacing at -5, and preserves defaults", async () => {
    const p = await page();
    const text = (spacing: number) => wrap(`<PartText width="200" height="200"><Text maxLines="3" lineSpacing="${spacing}"><Font size="20">A\nB\nC</Font></Text></PartText>`);
    const normal = await render(p, text(0)), spaced = await render(p, text(10)), negative = await render(p, text(-50));
    expect(spaced[1].y - spaced[0].y).toBeCloseTo(normal[1].y - normal[0].y + 10);
    expect(negative[1].y - negative[0].y).toBeCloseTo(normal[1].y - normal[0].y - 5);
    expect(spaced[1].y).toBe(normal[1].y);
    await p.close();
  });
  it("accounts for line spacing when auto-sizing and limiting lines by height", async () => {
    const p = await page();
    const body = (height: number, attrs: string) => wrap(`<PartText width="200" height="${height}"><Text maxLines="-1" lineSpacing="10" ${attrs}><Font size="20" minSize="10">A\nB\nC</Font></Text></PartText>`);
    const clipped = await render(p, body(60, ""));
    expect(clipped.map(d => d.text)).toEqual(["A", "B"]);
    const sized = await render(p, body(60, 'isAutoSize="TRUE"'));
    expect(sized.map(d => d.text)).toEqual(["A", "B", "C"]);
    expect(parseFloat(sized[0].font.match(/([\d.]+)px/)![1])).toBeLessThan(12);
    await p.close();
  });
  it("honors minSize below and above 12px and never enlarges a font", async () => {
    const p = await page();
    const body = (size: number, minSize: number) => wrap(`<PartText width="20" height="100"><Text isAutoSize="TRUE" ellipsis="TRUE"><Font size="${size}" minSize="${minSize}">A very long label</Font></Text></PartText>`);
    for (const [size, minSize, expected] of [[40, 8, 8], [40, 20, 20], [10, 20, 10]]) {
      const draws = await render(p, body(size, minSize));
      expect(draws[0].font).toContain(`${expected}px`);
      expect(draws.map(d => d.text).join("")).toContain("…");
    }
    await p.close();
  });
  it("keeps every font run above its own minimum", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText width="1" height="100"><Text isAutoSize="TRUE"><Font size="40" minSize="8">A</Font><Font size="20" minSize="10">B</Font></Text></PartText>'));
    expect(draws.map(d => d.font.match(/[\d.]+px/)![0])).toEqual(["20px", "10px"]);
    await p.close();
  });
  it.each(["CLOCKWISE", "COUNTER_CLOCKWISE"])("sizes and aligns %s elliptical text", async direction => {
    const p = await page();
    const body = (align: string) => wrap(`<PartText width="200" height="200"><TextCircular centerX="100" centerY="100" width="160" height="80" startAngle="0" endAngle="${direction === "CLOCKWISE" ? 10 : 350}" direction="${direction}" isAutoSize="TRUE" ellipsis="TRUE" verticalAlign="${align}"><Font size="40" minSize="8">Long label</Font></TextCircular></PartText>`);
    const baseline = await render(p, body("CENTER_ON_BASELINE")), top = await render(p, body("TOP")), bottom = await render(p, body("BOTTOM"));
    expect(baseline.map(d => d.text).join("")).toContain("…");
    expect(baseline.every(d => d.font.includes("8px") && d.y === 0)).toBe(true);
    expect(top.every(d => d.y >= d.ascent)).toBe(true);
    expect(bottom.every(d => d.y <= -d.descent)).toBe(true);
    expect(top.map(d => d.matrix)).toEqual(baseline.map(d => d.matrix));
    await p.close();
  });
  it("resolves transforms on lineSpacing and Font.minSize", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText width="20" height="200"><Text maxLines="2" isAutoSize="TRUE"><Transform target="lineSpacing" value="[GAP]"/><Font size="40"><Transform target="minSize" value="[MINIMUM]"/>AAAA\nBBBB</Font></Text></PartText>'), { dataSources: { GAP: 10, MINIMUM: 8 } });
    expect(draws[0].font).toContain("8px");
    expect(draws[1].y - draws[0].y).toBeCloseTo(19.6);
    await p.close();
  });
});

const settings = '<UserConfigurations><ListConfiguration id="theme" defaultValue="plain"><ListOption id="plain"/><ListOption id="detail" childSettingIds="child" complicationSlotIds="1"/></ListConfiguration><ListConfiguration id="child" defaultValue="on"><ListOption id="off"/><ListOption id="on" childSettingIds="grandchild" complicationSlotIds="2"/></ListConfiguration><BooleanConfiguration id="grandchild" defaultValue="TRUE"/></UserConfigurations>';
const slot = (id: number, content: string, attrs = "") => `<ComplicationSlot slotId="${id}" supportedTypes="SHORT_TEXT RANGED_VALUE EMPTY" width="200" height="200" ${attrs}><Complication type="SHORT_TEXT">${content}</Complication><Complication type="RANGED_VALUE">${rect("#0000ff")}</Complication><Complication type="EMPTY"/></ComplicationSlot>`;

describe("WFF v5 settings and compositing", () => {
  it("activates nested settings and linked slots, preserves hidden values, and leaves unlinked slots enabled", async () => {
    const p = await page(); await render(p, wrap(slot(1, rect("#ff0000")) + slot(2, rect("#00ff00")) + slot(3, ""), settings));
    const state = () => p.evaluate(() => ({ settings: (window as any).result.settings, slots: (window as any).result.activeComplicationSlotIds }));
    let s = await state(); expect(s.settings.map((x: any) => x.active)).toEqual([true, false, false]); expect(s.slots).toEqual([3]);
    await p.evaluate(async () => { await (window as any).result.update({ configuration: { theme: "detail", child: "off" }, complications: { 1: { type: "SHORT_TEXT" }, 2: { type: "SHORT_TEXT" } } }); });
    s = await state(); expect(s.settings.map((x: any) => x.active)).toEqual([true, true, false]); expect(s.slots).toEqual([1, 3]); expect(await pixel(p, 100, 100)).toEqual([255, 0, 0, 255]);
    await p.evaluate(async () => { await (window as any).result.update({ configuration: { theme: "detail", child: "on" } }); });
    s = await state(); expect(s.settings.every((x: any) => x.active)).toBe(true); expect(s.slots).toEqual([1, 2, 3]); expect(await pixel(p, 100, 100)).toEqual([0, 255, 0, 255]);
    await p.evaluate(async () => { await (window as any).result.update({ configuration: { theme: "plain", child: "off" } }); });
    s = await state(); expect(s.settings[1].value).toBe("off"); expect(s.slots).toEqual([3]); expect(await pixel(p, 100, 100)).toEqual([0, 0, 0, 255]); await p.close();
  });
  it("uses flavor selection for hierarchical activation with explicit overrides", async () => {
    const p = await page(); const flavored = settings.replace('</UserConfigurations>', '<Flavors defaultValue="detail"><Flavor id="detail"><Configuration id="theme" optionId="detail"/></Flavor></Flavors></UserConfigurations>');
    await render(p, wrap("", flavored));
    expect(await p.evaluate(() => (window as any).result.settings.every((s: any) => s.active))).toBe(true);
    await p.evaluate(async () => { await (window as any).result.update({ configuration: { theme: "plain" } }); });
    expect(await p.evaluate(() => (window as any).result.settings.map((s: any) => s.active))).toEqual([true, false, false]); await p.close();
  });
  it.each([
    ['<ListConfiguration id="a"><ListOption id="0" childSettingIds="missing"/></ListConfiguration>', "Unknown child"],
    ['<ListConfiguration id="a"><ListOption id="0" childSettingIds="b"/></ListConfiguration><ListConfiguration id="b"><ListOption id="0" childSettingIds="a"/></ListConfiguration>', "Cyclic"],
    [Array.from({ length: 4 }, (_, i) => `<ListConfiguration id="s${i}"><ListOption id="0" ${i < 3 ? `childSettingIds="s${i+1}"` : ""}/></ListConfiguration>`).join(""), "exceeds"],
  ])("rejects invalid setting hierarchies", async (xml, error) => {
    const p = await page(); await expect(render(p, wrap("", `<UserConfigurations>${xml}</UserConfigurations>`))).rejects.toThrow(error); await p.close();
  });
  it("blends overlapping children as a single Group source and isolates following siblings", async () => {
    const p = await page(); await render(p, wrap(rect("#ffffff") + `<Group x="0" y="0" width="200" height="200" blendMode="DIFFERENCE">${rect("#ff0000")}${rect("#00ff00", 50, 50, 100, 100)}</Group>` + rect("#0000ff", 150, 150, 50, 50)));
    expect(await pixel(p, 25, 25)).toEqual([0, 255, 255, 255]); expect(await pixel(p, 75, 75)).toEqual([255, 0, 255, 255]); expect(await pixel(p, 175, 175)).toEqual([0, 0, 255, 255]); await p.close();
  });
  it("selects slot templates, scopes data, blends slots, and updates their data", async () => {
    const p = await page(); const label = '<PartText width="200" height="80"><Text><Font size="20">[COMPLICATION.TEXT]</Font></Text></PartText>';
    const draws = await render(p, wrap(rect("#ffffff") + slot(1, rect("#ff0000") + label, 'blendMode="DIFFERENCE"') + slot(2, label.replace('height="80"', 'y="100" height="80"'))), { complications: { 1: { type: "SHORT_TEXT", data: { TEXT: "Alpha" } }, 2: { type: "SHORT_TEXT", data: { TEXT: "Beta" } } } });
    expect(draws.map(d => d.text)).toEqual(["Alpha", "Beta"]); expect(await pixel(p, 10, 10)).toEqual([0, 255, 255, 255]);
    await p.evaluate(async () => { (window as any).draws.length = 0; await (window as any).result.update({ complications: { 1: { type: "RANGED_VALUE" } } }); });
    expect(await p.evaluate(() => (window as any).draws)).toEqual([]); expect(await pixel(p, 100, 100)).toEqual([255, 255, 0, 255]); await p.close();
  });
  it("uses reference defaults from dynamically disabled slots", async () => {
    const p = await page(); const provider = rect("#ff0000").replace('</PartDraw>', '<Reference name="position" source="width" defaultValue="10"/></PartDraw>');
    const label = '<PartText width="200" height="80"><Text><Font size="20"><Template>%s<Parameter expression="[REFERENCE.position]"/></Template></Font></Text></PartText>';
    const draws = await render(p, wrap(slot(1, provider) + label, settings), { complications: { 1: { type: "SHORT_TEXT" } } });
    expect(draws[0].text).toBe("10"); await p.close();
  });
  it.each(["MITER", "ROUND", "BEVEL"])("renders %s stroke joins", async join => {
    const p = await page(); const xml = wrap(`<PartDraw width="200" height="200"><Rectangle x="50" y="50" width="100" height="100"><Stroke color="#ffffff" thickness="20" join="${join}"/></Rectangle></PartDraw>`);
    await render(p, xml); expect(await pixel(p, 41, 41)).toEqual(join === "MITER" ? [255, 255, 255, 255] : [0, 0, 0, 255]); await p.close();
  });
});
