// SVG ikonlardan PNG üretir (Playwright Chromium). Çıktılar repoya eklenir; build sırasında çalışmaz.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const jobs = [
  ["icon.svg", 192, "icon-192.png"],
  ["icon.svg", 512, "icon-512.png"],
  ["icon.svg", 180, "apple-touch-icon.png"],
  ["maskable.svg", 512, "maskable-512.png"],
];
for (const [src, size, out] of jobs) {
  const svg = readFileSync(resolve(dir, src), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: resolve(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
