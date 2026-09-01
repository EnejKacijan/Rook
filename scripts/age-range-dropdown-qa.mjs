import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const outputRoot = new URL("../artifacts/age-range-dropdown/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

async function open({ width, height, theme }) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false }),
    }),
  );
  await page.goto(`http://127.0.0.1:4173/?age-dropdown=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "BUILD MY PLAN" }).click();
  return { context, page, errors };
}

for (const testCase of [
  { width: 320, height: 568, theme: "light" },
  { width: 390, height: 700, theme: "dark" },
]) {
  const { context, page, errors } = await open(testCase);
  const trigger = page.getByRole("combobox", { name: "Age range" });
  await trigger.click();
  const listbox = page.getByRole("listbox", { name: "Age range options" });
  await listbox.waitFor();
  assert.equal(await page.getByRole("option").count(), 6);
  const [triggerBox, listboxBox, ctaBox] = await Promise.all([
    trigger.boundingBox(),
    listbox.boundingBox(),
    page.getByRole("button", { name: "CONTINUE" }).boundingBox(),
  ]);
  const anchoredBelow = listboxBox.y >= triggerBox.y + triggerBox.height;
  const anchoredAbove = listboxBox.y + listboxBox.height <= triggerBox.y;
  assert.ok(anchoredBelow || anchoredAbove, "the listbox stays anchored to the field");
  assert.ok(
    listboxBox.y + listboxBox.height <= ctaBox.y || anchoredAbove,
    "the listbox does not cover the primary CTA",
  );
  assert.equal(
    await trigger.locator("i").textContent(),
    "",
    "the trigger uses the shared CSS chevron instead of a text glyph",
  );
  await page.screenshot({
    path: output(`${testCase.width}x${testCase.height}-${testCase.theme}.png`),
    fullPage: false,
  });

  await page.mouse.click(5, 5);
  await listbox.waitFor({ state: "hidden" });
  assert.equal(await trigger.textContent(), "Select age range");

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await listbox.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(await trigger.textContent(), "60+");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");

  await trigger.click();
  assert.equal(
    await page.getByRole("option", { name: "60+" }).getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Escape");
  await listbox.waitFor({ state: "hidden" });
  assert.equal(await trigger.textContent(), "60+");
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Age range dropdown QA passed in light/dark mode at narrow and short mobile sizes, including CTA collision, outside click, keyboard selection and Escape dismissal.",
);
