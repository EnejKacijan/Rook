import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const projectRoot = path.resolve(import.meta.dirname, "..");
const artDir = path.join(projectRoot, "src", "assets", "exercise-art");
const checkOnly = process.argv.includes("--check");
const safetyScale = 1.14;

const files = (await fs.readdir(artDir))
  .filter((file) => /^wg-.*\.svg$/i.test(file))
  .sort();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
let changed = 0;
let smallestFill = Number.POSITIVE_INFINITY;
let largestFill = 0;

function number(value) {
  return Number(value.toFixed(3)).toString();
}

try {
  for (const file of files) {
    const filePath = path.join(artDir, file);
    const source = await fs.readFile(filePath, "utf8");
    await page.setContent(source);

    const bounds = await page.locator("svg").evaluate((svg) => {
      // Measure the rendered artwork rather than the nominal 512px canvas. This
      // includes nested transforms while ignoring non-rendered definitions.
      svg.setAttribute("viewBox", "0 0 512 512");
      svg.style.width = "512px";
      svg.style.height = "512px";
      const box = svg.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });

    if (!(bounds.width > 0 && bounds.height > 0)) {
      throw new Error(`Could not measure visible artwork in ${file}`);
    }

    const side = Math.max(bounds.width, bounds.height) * safetyScale;
    const x = bounds.x + bounds.width / 2 - side / 2;
    const y = bounds.y + bounds.height / 2 - side / 2;
    const viewBox = `${number(x)} ${number(y)} ${number(side)} ${number(side)}`;
    const normalized = source.replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);
    const fill = Math.max(bounds.width, bounds.height) / side;
    smallestFill = Math.min(smallestFill, fill);
    largestFill = Math.max(largestFill, fill);

    if (normalized !== source) {
      changed += 1;
      if (!checkOnly) await fs.writeFile(filePath, normalized);
    }
  }
} finally {
  await browser.close();
}

if (checkOnly && changed) {
  throw new Error(`${changed} exercise illustrations are not normalized. Run npm run art:normalize.`);
}

console.log(
  `${checkOnly ? "Checked" : "Normalized"} ${files.length} illustrations` +
  ` (${changed} ${checkOnly ? "need updates" : "updated"}; painted fill ${Math.round(smallestFill * 100)}–${Math.round(largestFill * 100)}%).`,
);
