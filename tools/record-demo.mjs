// Drives the student voting flow in a headless browser and assembles the
// captured frames into an animated GIF for the README.
//   Prereqs: frontend (:5173) + backend (:4000) + Ganache running, and a fresh
//   active "BVS Demo Election" with voter 22/0001 approved (see seed-demo.js).
import { chromium } from "playwright";
import gifenc from "gifenc";
import pkg from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { PNG } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "screenshots", "demo.gif");

const BASE = "http://localhost:5173";
const MATRIC = "22/0001";
const VIEWPORT = { width: 1100, height: 680 };

const frames = []; // { data: Uint8Array(rgba), width, height, delay }

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const snap = async (delay = 1600) => {
    const buf = await page.screenshot({ type: "png" });
    const png = PNG.sync.read(buf);
    frames.push({ data: new Uint8Array(png.data), width: png.width, height: png.height, delay });
  };

  // 1. Home
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByText("Babcock University Student Elections").waitFor();
  await page.waitForTimeout(600);
  await snap(2000);

  // 2. Vote -> log in
  await page.goto(`${BASE}/vote`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("19/0001").fill(MATRIC);
  await page.waitForTimeout(300);
  await snap(1700);
  await page.getByRole("button", { name: "Continue" }).click();

  // Make sure the demo election is the selected one.
  const sel = page.locator("select").first();
  await sel.waitFor();
  const demoVal = await sel.locator("option", { hasText: "BVS Demo Election" }).getAttribute("value");
  if (demoVal) await sel.selectOption(demoVal);

  // 3. Ballot
  await page.getByText("Chidi Nwosu").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await snap(1700);

  // 4. Select a candidate
  await page.getByText("Chidi Nwosu").click();
  await page.waitForTimeout(400);
  await snap(1500);

  // 5. Submit -> confirmation
  await page.getByRole("button", { name: /Submit my vote/ }).click();
  await page.getByText("You voted for").waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await snap(2400);

  // 6. Results
  await page.goto(`${BASE}/results`, { waitUntil: "domcontentloaded" });
  const rsel = page.locator("select").first();
  await rsel.waitFor();
  const rVal = await rsel.locator("option", { hasText: "BVS Demo Election" }).getAttribute("value");
  if (rVal) await rsel.selectOption(rVal);
  await page.getByText("President").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200); // let the chart animate in
  await snap(3000);

  await browser.close();

  // Assemble the GIF
  const { width, height } = frames[0];
  const gif = GIFEncoder();
  for (const f of frames) {
    const palette = quantize(f.data, 256);
    const index = applyPalette(f.data, palette);
    gif.writeFrame(index, width, height, { palette, delay: f.delay });
  }
  gif.finish();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, gif.bytes());
  console.log(`Wrote ${OUT} (${frames.length} frames, ${width}x${height})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
