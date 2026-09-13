import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { blankState } from "../src/domain.js";
import { createReturningUserFixture } from "../src/demoFixture.js";

const output = "artifacts/mobile-input-zoom";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const themes = [
  ["standard", "light"],
  ["standard", "dark"],
  ["premium", "light"],
  ["premium", "dark"],
];

const textControlSelector = [
  "input:not([type])",
  'input[type="text"]',
  'input[type="search"]',
  'input[type="number"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="password"]',
  'input[type="date"]',
  'input[type="time"]',
  "select",
  "textarea",
].join(",");

function applyTheme(state, style, appearance) {
  Object.assign(state.profile, {
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  });
  return state;
}

async function visibleTextControlSizes(page) {
  return page.locator(textControlSelector).evaluateAll((controls) =>
    controls
      .filter((control) => {
        const bounds = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden";
      })
      .map((control) => ({
        label: control.getAttribute("aria-label") || control.name || control.placeholder || control.tagName,
        size: Number.parseFloat(getComputedStyle(control).fontSize),
      })),
  );
}

try {
  for (const width of [320, 390, 430]) {
    for (const [style, appearance] of themes) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        serviceWorkers: "block",
      });
      const firstState = applyTheme(blankState(), style, appearance);
      await context.addInitScript((state) => {
        if (!localStorage.getItem("lift-v2-state"))
          localStorage.setItem("lift-v2-state", JSON.stringify(state));
      }, firstState);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/ai/status", (route) =>
        route.fulfill({ json: { available: false, provider: null } }),
      );
      await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
      assert.equal(
        await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches),
        true,
        "QA context must exercise the touch-only CSS path",
      );
      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      assert.ok(!/maximum-scale|user-scalable/iu.test(viewport || ""), "pinch zoom remains available");

      await page.getByRole("button", { name: "BUILD MY PLAN" }).click();
      const firstName = page.getByRole("textbox", { name: "First name" });
      assert.equal(await firstName.evaluate((node) => getComputedStyle(node).fontSize), "16px");
      await firstName.focus();
      await firstName.fill("Enej");
      assert.equal(await page.evaluate(() => visualViewport?.scale || 1), 1);
      await page.screenshot({
        path: `${output}/${width}-${style}-${appearance}-first-name.png`,
        animations: "disabled",
      });

      const returning = applyTheme(createReturningUserFixture(3), style, appearance);
      returning.activeWorkout = null;
      returning.profile.avoid = "";
      returning.profile.trainingSafety = null;
      await page.evaluate((state) => localStorage.setItem("lift-v2-state", JSON.stringify(state)), returning);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "PROFILE", exact: true }).click();
      await openProfileArea(page, 'program'); await page.getByRole("button", { name: /^Edit plan/ }).click();
      const sheet = page.locator(".edit-plan-screen");
      await sheet.getByRole("button", { name: "+ Add exercise", exact: true }).first().click();
      const search = sheet.getByRole("searchbox", { name: /Search exercise for/ });
      assert.equal(await search.evaluate((node) => getComputedStyle(node).fontSize), "16px");
      await search.focus();
      await search.fill("press");
      assert.equal(await page.evaluate(() => visualViewport?.scale || 1), 1);

      const sizes = await visibleTextControlSizes(page);
      assert.ok(sizes.length > 0);
      assert.deepEqual(
        sizes.filter(({ size }) => size < 16),
        [],
        `all visible mobile text controls stay at 16px or larger: ${width} ${style} ${appearance}`,
      );
      await page.screenshot({
        path: `${output}/${width}-${style}-${appearance}-search.png`,
        animations: "disabled",
      });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width} ${style} ${appearance}`);
    }
  }
} finally {
  await browser.close();
}

console.log("Mobile input zoom QA passed: first-name and exercise-search fields remain full viewport with accessible pinch zoom preserved.");
