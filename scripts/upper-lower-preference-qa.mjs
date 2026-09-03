import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const outputRoot = new URL("../artifacts/personalization/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const fullWeekday = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
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
await page.goto(`http://127.0.0.1:4173/?upper-lower-qa=${Date.now()}`, {
  waitUntil: "networkidle",
});
await page.getByRole("button", { name: "BUILD MY PLAN" }).click();
await page.getByRole("combobox", { name: "Age range" }).click();
await page.getByRole("option", { name: "18–29" }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: "Build muscle" }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: /^Beginner/ }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: "3 days" }).click();
for (const day of ["Wed", "Thu", "Sun"])
  await page
    .getByRole("button", { name: fullWeekday[day], exact: true })
    .click();
await page.getByRole("button", { name: "45 min" }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: "Commercial gym" }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
for (const priority of ["Chest", "Back"])
  await page
    .locator(".option-list")
    .getByRole("button", { name: priority, exact: true })
    .click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: /Balanced starting point/ }).click();
await page.getByRole("button", { name: "CONTINUE" }).click();
await page.getByRole("button", { name: /Have a specific split/i }).click();
await page.getByRole("button", { name: "Other", exact: true }).click();
await page.locator("textarea").first().fill("Upper / Lower");
await page.getByRole("button", { name: "BUILD MY PLAN" }).click();
await page.getByRole("heading", { name: "Your week is ready." }).waitFor();
const state = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lift-v2-state")),
);
assert.equal(
  state.profile.onboardingComplete,
  false,
  "preview does not save before confirmation",
);
assert.equal(
  await page.getByText("Upper / Lower Hybrid", { exact: true }).count(),
  1,
);
assert.equal(
  await page.getByText("Upper / Lower", { exact: true }).count(),
  1,
  "summary confirms the recognized style",
);
for (const name of ["Upper", "Lower", "Full Body"])
  assert.equal(
    await page.getByText(new RegExp(`^[A-Z][a-z]{2} · ${name}$`)).count(),
    1,
    `${name} workout is visible`,
  );
await page.screenshot({
  path: fileURLToPath(new URL("390-upper-lower-preview.png", outputRoot)),
  fullPage: false,
});
assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log(
  "Upper/Lower preference QA passed: the three-day comment produces an Upper, Lower, and Full Body hybrid and is confirmed in the preview summary.",
);
