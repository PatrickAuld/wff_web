import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";

let browser: Browser, source: string;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); source = await readFile(new URL("../dist/index.js", import.meta.url), "utf8"); });
afterAll(async () => { await browser?.close(); });
async function page(): Promise<Page> {
  const p = await browser.newPage();
  await p.setContent('<canvas id="c"></canvas>');
  await p.addScriptTag({ content: source.replace(/export\s*\{[^}]*\}/, "") + "\nwindow.renderWatchFace = renderWatchFace;" });
  return p;
}
const wrap = (body: string, extras = "", attrs = 'clipShape="NONE"') => `<WatchFace width="200" height="200" ${attrs}>${extras}<Scene backgroundColor="#000000">${body}</Scene></WatchFace>`;
const rect = (color: string, x = 0, y = 0, width = 200, height = 200, attrs = "") => `<PartDraw x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}><Rectangle x="0" y="0" width="${width}" height="${height}"><Fill color="${color}"/></Rectangle></PartDraw>`;
async function render(p: Page, xml: string, options: Record<string, unknown> = {}) {
  return p.evaluate(async ({ xml, options }) => {
    const canvas = document.querySelector("canvas")!;
    const draws: { text: string; font: string; matrix: number[] }[] = [];
    for (const prototype of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
      const original = prototype.fillText;
      prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
        const matrix = this.getTransform(); draws.push({ text, font: this.font, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] });
        if (maxWidth === undefined) original.call(this, text, x, y); else original.call(this, text, x, y, maxWidth);
      };
    }
    const result = await (window as any).renderWatchFace(canvas, { xml, time: new Date("2024-01-15T10:10:00Z"), timeZone: "UTC", ...options });
    (window as any).result = result;
    return draws;
  }, { xml, options });
}
async function pixel(p: Page, x: number, y: number) {
  return p.evaluate(({ x, y }) => Array.from(document.querySelector("canvas")!.getContext("2d")!.getImageData(x, y, 1, 1).data), { x, y });
}
async function nonBlack(p: Page) {
  return p.evaluate(() => { const c = document.querySelector("canvas")!; const pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 100) n++; return n; });
}

describe("non-complication v4 browser regressions", () => {
  it("renders nested Font text, casing and positional template parameters", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText x="0" y="0" width="200" height="200"><Text><Font size="24"><Outline color="#ff0000"><Upper><Template>%2$s %1$02d<Parameter expression="7"/><Parameter expression="hello"/></Template></Upper></Outline></Font></Text></PartText>'));
    expect(draws.map(d => d.text).join("")).toBe("HELLO 07"); expect(await nonBlack(p)).toBeGreaterThan(100); await p.close();
  });
  it("TimeText uses millisecond epoch values and inherited localization", async () => {
    const p = await page();
    const draws = await render(p, wrap('<DigitalClock x="0" y="0" width="200" height="200"><Localization timeZone="America/Los_Angeles"/><TimeText format="HH:mm"><Font size="30"/></TimeText></DigitalClock>'));
    expect(draws.map(d => d.text).join("")).toBe("02:10"); await p.close();
  });
  it("preserves multiple font runs and multiline layout", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText x="0" y="0" width="200" height="200"><Text maxLines="3"><Font size="24" color="#ff0000">first\n</Font><Font size="36" color="#00ff00">second</Font></Text></PartText>'));
    expect(draws.map(d => d.text)).toEqual(["first", "second"]); expect(draws[0].font).toContain("24px"); expect(draws[1].font).toContain("36px"); await p.close();
  });
  it("downscales text and adds ellipsis when its 12px minimum cannot fit", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText x="0" y="0" width="45" height="200"><Text isAutoSize="TRUE" ellipsis="TRUE"><Font size="40">Extremely long text</Font></Text></PartText>'));
    expect(draws.map(d => d.text).join("")).toContain("…"); expect(draws.every(d => d.font.includes("12px"))).toBe(true); await p.close();
  });
  it("places circular text along the ellipse", async () => {
    const p = await page();
    const draws = await render(p, wrap('<PartText x="0" y="0" width="200" height="200"><TextCircular centerX="100" centerY="100" width="160" height="130" startAngle="300" endAngle="60"><Font size="20">ABC</Font></TextCircular></PartText>'));
    expect(draws.map(d => d.text)).toEqual(["A", "B", "C"]); expect(draws[0].matrix).not.toEqual(draws[1].matrix); expect(await nonBlack(p)).toBeGreaterThan(50); await p.close();
  });
  it("applies transforms to text and fonts with forward references", async () => {
    const p = await page();
    const xml = wrap(`<PartText x="0" y="0" width="80" height="80"><Transform target="x" value="[REFERENCE.position]"/><Text><Font size="20"><Transform target="size" value="30"/>Hi</Font></Text></PartText>${rect("#ff0000", 80, 100, 80, 80).replace('</PartDraw>', '<Reference name="position" source="x" defaultValue="0"/></PartDraw>')}`);
    const draws = await render(p, xml); expect(draws[0].font).toContain("30px"); expect(draws[0].matrix[4]).toBe(80); await p.close();
  });
  it("scales XML coordinates and applies rounded rectangular clipping", async () => {
    const p = await page(); await render(p, wrap(rect("#ff0000"), "", 'clipShape="RECTANGLE" cornerRadiusX="50" cornerRadiusY="50"'), { width: 400, height: 400 });
    expect(await pixel(p, 0, 0)).toEqual([0, 0, 0, 0]); expect(await pixel(p, 200, 200)).toEqual([255, 0, 0, 255]); await p.close();
  });
  it("combines disjoint masks by union and applies ALL to both layers", async () => {
    const p = await page(); await render(p, wrap(rect("#ff0000") + rect("#ffffff", 0, 0, 40, 40, 'renderMode="MASK"') + rect("#ffffff", 100, 100, 40, 40, 'renderMode="MASK"')));
    expect(await pixel(p, 20, 20)).toEqual([255, 0, 0, 255]); expect(await pixel(p, 120, 120)).toEqual([255, 0, 0, 255]); expect(await pixel(p, 70, 70)).toEqual([0, 0, 0, 255]); await p.close();
    const q = await page(); await render(q, wrap(rect("#ff0000") + rect("#00ff00", 0, 0, 40, 40, 'renderMode="ALL"')));
    expect(await pixel(q, 20, 20)).toEqual([0, 255, 0, 255]); expect(await pixel(q, 70, 70)).toEqual([0, 0, 0, 255]); await q.close();
  });
  it("keeps sibling blend modes isolated", async () => {
    const p = await page(); await render(p, wrap(rect("#ff0000") + rect("#00ff00", 0, 0, 50, 50, 'blendMode="MULTIPLY"') + rect("#0000ff", 100, 100, 50, 50)));
    expect(await pixel(p, 20, 20)).toEqual([0, 0, 0, 255]); expect(await pixel(p, 120, 120)).toEqual([0, 0, 255, 255]); await p.close();
  });
  it("uses scene-level list/boolean branches and flavors", async () => {
    const p = await page();
    const config = '<UserConfigurations><ListConfiguration id="theme" defaultValue="red"><ListOption id="red"/><ListOption id="green"/></ListConfiguration><BooleanConfiguration id="show" defaultValue="FALSE"/><Flavors defaultValue="day"><Flavor id="day"><Configuration id="theme" optionId="green"/><Configuration id="show" optionId="TRUE"/></Flavor></Flavors></UserConfigurations>';
    await render(p, wrap(`<BooleanConfiguration id="show"><BooleanOption id="TRUE"><ListConfiguration id="theme"><ListOption id="red">${rect("#ff0000")}</ListOption><ListOption id="green">${rect("#00ff00")}</ListOption></ListConfiguration></BooleanOption></BooleanConfiguration>`, config));
    expect(await pixel(p, 100, 100)).toEqual([0, 255, 0, 255]); await p.close();
  });
  it("animates ordinary changing Transform.value", async () => {
    const p = await page(); await render(p, wrap(`${rect("#ff0000", 0, 0, 20, 20).replace('</PartDraw>', '<Transform target="x" value="[POSITION]"><Animation duration="1" fps="60"/></Transform></PartDraw>')}`), { dataSources: { POSITION: 0 }, elapsedMs: 0 });
    await p.evaluate(async () => { await (window as any).result.update({ dataSources: { POSITION: 100 }, elapsedMs: 100 }); await (window as any).result.update({ elapsedMs: 600 }); });
    expect(await pixel(p, 55, 5)).toEqual([255, 0, 0, 255]); expect(await pixel(p, 5, 5)).toEqual([0, 0, 0, 255]); await p.close();
  });
  it("supports injected device sources, Gyro, launch hit-testing and ScreenReader", async () => {
    const p = await page(); await render(p, wrap(`${rect("#ff0000", 10, 10, 40, 40).replace('</PartDraw>', '<Gyro x="[ACCELEROMETER_ANGLE_X]"/><Launch target="SETTINGS"/><ScreenReader stringId="battery"><Parameter expression="[BATTERY_PERCENT]"/></ScreenReader></PartDraw>')}`), { width: 400, height: 400, dataSources: { ACCELEROMETER_ANGLE_X: 10, BATTERY_PERCENT: 75 }, strings: { battery: "Battery %s percent" } });
    const result = await p.evaluate(async () => { const r = (window as any).result; const launches: string[] = []; await r.update({ onLaunch: (target: string) => launches.push(target) }); await r.tap(50, 50); return { launches, items: r.accessibility }; });
    expect(result.launches).toEqual(["SETTINGS"]); expect(result.items[0].text).toBe("Battery 75 percent"); expect(result.items[0].bounds.x).toBe(40); await p.close();
  });
  it("renders weighted strokes with proportions and gaps", async () => {
    const p = await page(); await render(p, wrap('<PartDraw x="0" y="0" width="200" height="200"><Line startX="10" startY="100" endX="190" endY="100"><WeightedStroke thickness="10" colors="#ff0000 #00ff00" weights="1 2" discreteGap="12"/></Line></PartDraw>'));
    expect(await pixel(p, 30, 100)).toEqual([255, 0, 0, 255]); expect(await pixel(p, 72, 100)).toEqual([0, 0, 0, 255]); expect(await pixel(p, 120, 100)).toEqual([0, 255, 0, 255]); await p.close();
  });
  it("decodes assets per buffer and advances Images on taps", async () => {
    const p = await page();
    const values = await p.evaluate(async () => {
      const make = async (color: string) => { const off = new OffscreenCanvas(2, 2); const c = off.getContext("2d")!; c.fillStyle = color; c.fillRect(0, 0, 2, 2); return (await off.convertToBlob()).arrayBuffer(); };
      const red = await make("#ff0000"), green = await make("#00ff00"), canvas = document.querySelector("canvas")!;
      const xml = '<WatchFace width="100" height="100" clipShape="NONE"><Scene><PartImage x="0" y="0" width="100" height="100"><Images change="TAP"><Image resource="red"/><Image resource="green"/></Images></PartImage></Scene></WatchFace>';
      const result = await (window as any).renderWatchFace(canvas, { xml, assets: new Map([["red", red], ["green", green]]) });
      const sample = () => Array.from(canvas.getContext("2d")!.getImageData(50, 50, 1, 1).data);
      const before = sample(); await result.tap(50, 50); const after = sample(); result.stop();
      await (window as any).renderWatchFace(canvas, { xml: xml.replace('<Images change="TAP"><Image resource="red"/><Image resource="green"/></Images>', '<Image resource="red"/>'), assets: new Map([["red", green]]) });
      return { before, after, replaced: sample() };
    });
    expect(values.before).toEqual([255, 0, 0, 255]); expect(values.after).toEqual([0, 255, 0, 255]); expect(values.replaced).toEqual([0, 255, 0, 255]); await p.close();
  });
  it("plays sequences through delays, loops and the afterPlaying state", async () => {
    const p = await page();
    const values = await p.evaluate(async () => {
      const make = async (color: string) => { const c = new OffscreenCanvas(2,2), t = c.getContext("2d")!; t.fillStyle=color; t.fillRect(0,0,2,2); return (await c.convertToBlob()).arrayBuffer(); };
      const canvas=document.querySelector("canvas")!, assets=new Map([["red",await make("red")],["green",await make("lime")]]);
      const xml='<WatchFace width="100" height="100" clipShape="NONE"><Scene><PartAnimatedImage width="100" height="100"><SequenceImages frameRate="2"><Image resource="red"/><Image resource="green"/></SequenceImages><AnimationController play="TAP" delayPlay="0.1" delayRepeat="0.2" loopCount="2" beforePlaying="HIDE" afterPlaying="FIRST_FRAME"/></PartAnimatedImage></Scene></WatchFace>';
      const r=await (window as any).renderWatchFace(canvas,{xml,assets,elapsedMs:0});
      const sample=()=>Array.from(canvas.getContext("2d")!.getImageData(50,50,1,1).data);
      const before=sample(); await r.tap(50,50); await r.update({elapsedMs:50}); const delayed=sample();
      await r.update({elapsedMs:200}); const first=sample(); await r.update({elapsedMs:700}); const second=sample();
      await r.update({elapsedMs:1200}); const waiting=sample(); await r.update({elapsedMs:1400}); const repeated=sample();
      await r.update({elapsedMs:2500}); const after=sample(); r.stop(); return {before,delayed,first,second,waiting,repeated,after};
    });
    expect(values.before).toEqual([0,0,0,255]); expect(values.delayed).toEqual([0,0,0,255]);
    expect(values.first).toEqual([255,0,0,255]); expect(values.second).toEqual([0,255,0,255]);
    expect(values.waiting).toEqual([0,255,0,255]); expect(values.repeated).toEqual([255,0,0,255]); expect(values.after).toEqual([255,0,0,255]); await p.close();
  });
  it("filters image pixels and renders bitmap words and inline images without implicit tint", async () => {
    const p=await page();
    const values=await p.evaluate(async () => {
      const c=new OffscreenCanvas(2,2), t=c.getContext("2d")!; t.fillStyle="red"; t.fillRect(0,0,2,2);
      const assets=new Map([["red",await (await c.convertToBlob()).arrayBuffer()]]), canvas=document.querySelector("canvas")!;
      const base=(body:string,extra="")=>`<WatchFace width="100" height="100" clipShape="NONE">${extra}<Scene>${body}</Scene></WatchFace>`;
      await (window as any).renderWatchFace(canvas,{assets,xml:base('<PartImage width="100" height="100"><Image resource="red"/><ImageFilters><HsbFilter hueRotate="120"/></ImageFilters></PartImage>')});
      const sample=()=>Array.from(canvas.getContext("2d")!.getImageData(50,50,1,1).data); const filtered=sample();
      await (window as any).renderWatchFace(canvas,{assets,xml:base('<PartText width="100" height="100"><Text><BitmapFont family="pixels" size="20">AB</BitmapFont></Text></PartText>','<BitmapFonts><BitmapFont name="pixels"><Word name="AB" resource="red" width="2" height="2"/></BitmapFont></BitmapFonts>')}); const word=sample();
      await (window as any).renderWatchFace(canvas,{assets,xml:base('<PartText width="100" height="100"><Text><Font size="20"><InlineImage resource="red" width="20" height="20"/></Font></Text></PartText>')}); const inline=sample(); return {filtered,word,inline};
    });
    expect(values.filtered).toEqual([0,255,0,255]); expect(values.word).toEqual([255,0,0,255]); expect(values.inline).toEqual([255,0,0,255]); await p.close();
  });
  it("changes Photos by tap immediately and by each configured number of wakes", async () => {
    const p=await page();
    const values=await p.evaluate(async () => {
      const make=async (color:string)=>{const c=new OffscreenCanvas(2,2),t=c.getContext("2d")!;t.fillStyle=color;t.fillRect(0,0,2,2);return(await c.convertToBlob()).arrayBuffer();};
      const canvas=document.querySelector("canvas")!, assets=new Map([["r",await make("red")],["g",await make("lime")]]);
      const xml='<WatchFace width="100" height="100" clipShape="NONE"><UserConfigurations><PhotosConfiguration id="album"/></UserConfigurations><Scene><PartImage width="100" height="100"><Photos source="[CONFIGURATION.album]" defaultImageResource="r" change="TAP ON_VISIBLE" changeAfterEvery="3"/></PartImage></Scene></WatchFace>';
      const r=await(window as any).renderWatchFace(canvas,{xml,assets,photos:{album:["r","g"]},elapsedMs:0});const sample=()=>Array.from(canvas.getContext("2d")!.getImageData(50,50,1,1).data);
      const first=sample(); await r.tap(50,50); const tapped=sample();
      for(let i=1;i<=2;i++){await r.update({visible:false,elapsedMs:i*100});await r.update({visible:true,elapsedMs:i*100+1});}const two=sample();
      await r.update({visible:false,elapsedMs:300});await r.update({visible:true,elapsedMs:301});const three=sample();r.stop();return{first,tapped,two,three};
    });
    expect(values.first).toEqual([255,0,0,255]); expect(values.tapped).toEqual([0,255,0,255]); expect(values.two).toEqual([0,255,0,255]); expect(values.three).toEqual([255,0,0,255]); await p.close();
  });
  it("rebases an animated fixed clock when its time is changed", async () => {
    const p = await page();
    const text = await p.evaluate(async () => {
      const canvas=document.querySelector("canvas")!;
      const xml='<WatchFace width="100" height="100" clipShape="NONE"><Scene><DigitalClock width="100" height="100"><TimeText format="ss" hourFormat="24"><Font size="20"/></TimeText></DigitalClock></Scene></WatchFace>';
      let now=0; const original=performance.now.bind(performance); Object.defineProperty(performance,"now",{value:()=>now,configurable:true});
      const texts:string[]=[]; const fill=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text:string,x:number,y:number){texts.push(text);fill.call(this,text,x,y);};
      try {const r=await(window as any).renderWatchFace(canvas,{xml,time:new Date("2024-01-15T10:10:00Z"),timeZone:"UTC",animate:true});now=5000;await r.update({time:new Date("2024-01-15T10:20:00Z")});r.stop();return texts.at(-1);}
      finally {Object.defineProperty(performance,"now",{value:original,configurable:true});}
    });
    expect(text).toBe("00");await p.close();
  });
  it("skips complications and all their descendants", async () => {
    const p = await page(); const draws = await render(p, wrap(`<ComplicationSlot>${rect("#ff0000")}<PartText width="200" height="200"><Text><Font size="30">Hidden</Font></Text></PartText></ComplicationSlot>`));
    expect(draws).toEqual([]); expect(await nonBlack(p)).toBe(0); await p.close();
  });
});
