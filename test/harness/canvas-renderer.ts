import { chromium, type Browser, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RenderConfig } from "./types.js";
import { DEFAULTS } from "./types.js";

const HARNESS_HTML_PATH = resolve(
  import.meta.dirname,
  "../harness-page/index.html"
);

export class CanvasRenderer {
  private browser: Browser | null = null;
  private htmlContent: string | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.htmlContent = await readFile(HARNESS_HTML_PATH, "utf-8");
  }

  async render(config: RenderConfig): Promise<Buffer> {
    if (!this.browser || !this.htmlContent) {
      throw new Error("CanvasRenderer not initialized. Call init() first.");
    }

    const width = config.width ?? DEFAULTS.watchWidth;
    const height = config.height ?? DEFAULTS.watchHeight;

    // Create a fresh page for each render to avoid stale state
    const page = await this.browser.newPage();
    await page.setContent(this.htmlContent, {
      waitUntil: "domcontentloaded",
    });

    // Pass render config to the page and get back a PNG data URL
    const dataUrl = await page.evaluate(
      async ({
        xml,
        assetsEntries,
        width,
        height,
        timeIso,
        ambient,
      }) => {
        const canvas = document.getElementById(
          "watchface"
        ) as HTMLCanvasElement;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d")!;

        // Convert asset entries back to a Map of ArrayBuffers
        const assets = new Map<string, ArrayBuffer>();
        for (const [name, base64] of assetsEntries) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          assets.set(name, bytes.buffer);
        }

        // Try to use the wff-web library if loaded, otherwise render a stub
        if (typeof (window as any).renderWatchFace === "function") {
          (window as any).renderWatchFace({
            ctx,
            xml,
            assets,
            width,
            height,
            time: new Date(timeIso),
            ambient,
          });
        } else {
          // Stub: fill with magenta to clearly show "not implemented"
          ctx.fillStyle = "#FF00FF";
          ctx.fillRect(0, 0, width, height);
        }

        return canvas.toDataURL("image/png");
      },
      {
        xml: config.watchfaceXml,
        assetsEntries: Array.from(config.assets.entries()).map(
          ([name, buf]) => [name, buf.toString("base64")]
        ),
        width,
        height,
        timeIso: config.time.toISOString(),
        ambient: config.ambient,
      }
    );

    // Convert data URL to Buffer
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const result = Buffer.from(base64Data, "base64");

    await page.close();
    return result;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.htmlContent = null;
    }
  }
}
