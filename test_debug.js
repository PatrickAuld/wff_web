import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const HARNESS_HTML_PATH = resolve("test/harness-page/index.html");

const browser = await chromium.launch({ headless: true });
const htmlContent = await readFile(HARNESS_HTML_PATH, "utf-8");

const page = await browser.newPage();
await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

const dataUrl = await page.evaluate(async () => {
  const canvas = document.getElementById("watchface");
  console.log("Canvas:", canvas);
  console.log("renderWatchFace:", typeof window.renderWatchFace);
  
  if (typeof window.renderWatchFace === "function") {
    window.renderWatchFace(canvas, {
      xml: "<WatchFace/>",
      assets: new Map(),
      time: new Date("2024-01-15T10:10:00"),
      ambient: false,
    });
  }
  
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, 10, 10);
  console.log("First pixel:", {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
    a: imageData.data[3],
  });
  
  return canvas.toDataURL("image/png");
});

console.log("Data URL length:", dataUrl.length);
await page.close();
await browser.close();
