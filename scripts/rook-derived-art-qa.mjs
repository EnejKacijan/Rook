import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artDirectory = path.join(projectRoot, "src", "assets", "exercise-art");
const outputDirectory = path.join(projectRoot, "artifacts", "rook-derived-art");
await mkdir(outputDirectory, { recursive: true });

const files = (await readdir(artDirectory))
  .filter((file) => /^wg-rook-.*\.svg$/u.test(file))
  .sort();
const sourceByTarget = new Map([
  ["wg-rook-band-chest-press.svg", "wg-banded-pallof-press.svg"],
  ["wg-rook-band-curl.svg", "wg-bicep-curl.svg"],
  ["wg-rook-band-fly.svg", "wg-cable-fly.svg"],
  ["wg-rook-band-leg-curl.svg", "wg-leg-curl.svg"],
  ["wg-rook-band-overhead-press.svg", "wg-standing-dumbbell-press.svg"],
  ["wg-rook-band-triceps-pressdown.svg", "wg-tricep-pushdown.svg"],
  ["wg-rook-barbell-curl.svg", "wg-ez-bar-curl.svg"],
  ["wg-rook-bosu-balance.svg", "wg-jumping-jack.svg"],
  ["wg-rook-dumbbell-calf-raise.svg", "wg-calf-raise.svg"],
  ["wg-rook-forward-single-leg-hops.svg", "wg-high-knees.svg"],
  ["wg-rook-incline-machine-press.svg", "wg-machine-chest-press.svg"],
  ["wg-rook-machine-high-row.svg", "wg-machine-row.svg"],
  ["wg-rook-pendulum-squat.svg", "wg-hack-squat.svg"],
  ["wg-rook-pogo-jumps.svg", "wg-jump-squat.svg"],
  ["wg-rook-single-arm-cable-lat-pulldown.svg", "wg-lat-pulldown.svg"],
  ["wg-rook-single-leg-leg-extension.svg", "wg-leg-extension.svg"],
  ["wg-rook-single-leg-leg-press.svg", "wg-leg-press.svg"],
  ["wg-rook-standing-broad-jump.svg", "wg-jump-squat.svg"],
  ["wg-rook-standing-single-leg-leg-curl.svg", "wg-single-leg-calf-raise.svg"],
  ["wg-rook-y-balance-reach.svg", "wg-banded-standing-hip-abduction.svg"],
]);
const cards = await Promise.all(
  files.map(async (file) => {
    const source = await readFile(path.join(artDirectory, file), "utf8");
    const reference = sourceByTarget.get(file);
    const original = reference
      ? await readFile(path.join(artDirectory, reference), "utf8")
      : source;
    const url = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
    const originalUrl = `data:image/svg+xml;base64,${Buffer.from(original).toString("base64")}`;
    const label = file.replace(/^wg-rook-/u, "").replace(/\.svg$/u, "").replaceAll("-", " ");
    return `<article><strong>${label}</strong><div class="sizes"><span class="detail"><img src="${url}" alt=""></span><span class="source"><img src="${originalUrl}" alt=""></span><span class="thumb"><img src="${url}" alt=""></span></div></article>`;
  }),
);

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent(`<!doctype html><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: ${theme === "dark" ? "#f2f1ec" : "#171715"}; background: ${theme === "dark" ? "#111310" : "#f6f5f2"}; font: 12px Arial, sans-serif; }
    main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    article { min-width: 0; padding: 12px; border: 1px solid ${theme === "dark" ? "#40443c" : "#dedbd4"}; border-radius: 14px; background: ${theme === "dark" ? "#171916" : "#fff"}; }
    strong { display: block; min-height: 30px; text-transform: capitalize; }
    .sizes { display: flex; align-items: flex-end; gap: 16px; }
    .sizes span { display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: ${theme === "dark" ? "#292d26" : "#f1eee8"}; }
    .detail { width: 116px; height: 116px; padding: 6px; }
    .source { width: 76px; height: 76px; padding: 4px; opacity: .58; }
    .thumb { width: 58px; height: 58px; padding: 2px; }
    img { display: block; width: 100%; height: 100%; object-fit: contain; ${theme === "dark" ? "filter: brightness(1.8) saturate(.82);" : ""} }
  </style><main>${cards.join("")}</main>`);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  assert.equal(await page.locator("img").count(), files.length * 3);
  await page.screenshot({
    path: path.join(outputDirectory, `all-${theme}.png`),
    fullPage: true,
  });
  await page.close();
}
await browser.close();
console.log(`Rendered ${files.length} ROOK-derived illustrations in light and dark mode.`);
