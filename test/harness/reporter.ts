import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const RESULTS_DIR = resolve(import.meta.dirname, "../../test/results");

interface ScenarioResult {
  fixture: string;
  scenario: string;
  match: boolean;
  diffPixelCount: number;
  diffPixelPercent: number;
  totalPixels: number;
  timestamp: string;
  hasImages: boolean;
}

/** Scan test/results/images/ and generate an HTML report */
export async function generateReport(): Promise<string> {
  const imagesDir = join(RESULTS_DIR, "images");
  const results: ScenarioResult[] = [];

  let fixtureDirs: string[];
  try {
    fixtureDirs = await readdir(imagesDir);
  } catch {
    fixtureDirs = [];
  }

  for (const fixtureName of fixtureDirs) {
    const fixtureDir = join(imagesDir, fixtureName);
    let scenarioDirs: string[];
    try {
      scenarioDirs = await readdir(fixtureDir);
    } catch {
      continue;
    }

    for (const scenarioName of scenarioDirs) {
      const scenarioDir = join(fixtureDir, scenarioName);
      try {
        const resultJson = await readFile(
          join(scenarioDir, "result.json"),
          "utf-8"
        );
        const data = JSON.parse(resultJson);
        results.push({
          fixture: fixtureName,
          scenario: scenarioName,
          ...data,
          hasImages: true,
        });
      } catch {
        // Skip incomplete results
      }
    }
  }

  const totalTests = results.length;
  const passed = results.filter((r) => r.match).length;
  const failed = totalTests - passed;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WFF Web Visual Regression Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .summary { margin-bottom: 24px; padding: 16px; background: #16213e; border-radius: 8px; }
    .summary .stats { display: flex; gap: 24px; margin-top: 8px; }
    .stat { padding: 8px 16px; border-radius: 4px; font-weight: 600; }
    .stat.pass { background: #1b4332; color: #95d5b2; }
    .stat.fail { background: #4a1c1c; color: #f5a5a5; }
    .stat.total { background: #1a1a3e; color: #a5b4fc; }
    .fixture { margin-bottom: 32px; }
    .fixture h2 { font-size: 18px; margin-bottom: 12px; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .scenario { margin-bottom: 24px; padding: 16px; background: #16213e; border-radius: 8px; }
    .scenario-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .badge.pass { background: #1b4332; color: #95d5b2; }
    .badge.fail { background: #4a1c1c; color: #f5a5a5; }
    .images { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .images figure { text-align: center; }
    .images figcaption { font-size: 12px; color: #888; margin-bottom: 4px; }
    .images img { max-width: 100%; border-radius: 4px; border: 1px solid #333; background: #000; }
    .meta { font-size: 13px; color: #888; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>WFF Web Visual Regression Report</h1>
  <div class="summary">
    <div class="stats">
      <span class="stat total">${totalTests} total</span>
      <span class="stat pass">${passed} passed</span>
      <span class="stat fail">${failed} failed</span>
    </div>
    <p class="meta">Generated: ${new Date().toISOString()}</p>
  </div>
  ${renderFixtures(results)}
</body>
</html>`;

  const reportPath = join(RESULTS_DIR, "report.html");
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(reportPath, html);

  return reportPath;
}

function renderFixtures(results: ScenarioResult[]): string {
  const grouped = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const list = grouped.get(r.fixture) ?? [];
    list.push(r);
    grouped.set(r.fixture, list);
  }

  let html = "";
  for (const [fixture, scenarios] of grouped) {
    html += `<div class="fixture"><h2>${escapeHtml(fixture)}</h2>`;
    for (const s of scenarios) {
      const status = s.match ? "pass" : "fail";
      const imgBase = `images/${encodeURIComponent(fixture)}/${encodeURIComponent(s.scenario)}`;
      html += `
        <div class="scenario">
          <div class="scenario-header">
            <span class="badge ${status}">${status}</span>
            <strong>${escapeHtml(s.scenario)}</strong>
            <span class="meta">${s.diffPixelPercent.toFixed(2)}% diff (${s.diffPixelCount} px)</span>
          </div>
          <div class="images">
            <figure>
              <figcaption>Baseline (golden)</figcaption>
              <img src="${imgBase}/baseline.png" alt="Baseline">
            </figure>
            <figure>
              <figcaption>Canvas (web library)</figcaption>
              <img src="${imgBase}/canvas.png" alt="Canvas">
            </figure>
            <figure>
              <figcaption>Diff</figcaption>
              <img src="${imgBase}/diff.png" alt="Diff">
            </figure>
          </div>
        </div>`;
    }
    html += `</div>`;
  }

  if (results.length === 0) {
    html = `<p class="meta">No test results found. Run <code>pnpm test:visual</code> first.</p>`;
  }

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
