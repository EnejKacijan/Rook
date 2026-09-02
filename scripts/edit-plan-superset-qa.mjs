import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

async function verifyEditableSuperset(source) {
  const state = createReturningUserFixture(2);
  state.activeWorkout = null;
  state.program.source = source;
  const day = state.program.days.find((item) => item.exercises.length >= 2);
  assert.ok(day, `${source}: fixture needs a day with two exercises`);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    state,
  );
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
      body: JSON.stringify({ available: false, provider: null }),
    }),
  );
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await page.getByRole("button", { name: /^Edit plan/i }).click();
  await page.getByRole("heading", { name: "Edit your plan", exact: true }).waitFor();

  const daySection = page.locator(".import-day").filter({
    has: page.getByLabel(`${day.weekday} workout name`),
  });
  const firstCard = daySection.locator(".plan-editor-exercise").first();
  await firstCard.getByRole("button", { name: /^Edit / }).click();
  const createButton = firstCard.getByRole("button", {
    name: "CREATE SUPERSET",
    exact: true,
  });
  assert.equal(await createButton.count(), 1, `${source}: edit mode exposes Create Superset`);
  await createButton.click();
  await firstCard.locator(".superset-picker").getByRole("button").first().click();
  assert.equal(await daySection.getByText("PAIR", { exact: true }).count(), 2);
  assert.equal(await daySection.getByText("A1", { exact: true }).count(), 0);
  assert.equal(await daySection.getByText("A2", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "SAVE CHANGES", exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  const savedDay = stored.program.days.find((item) => item.id === day.id);
  const paired = savedDay.exercises.filter((item) => item.supersetId);
  assert.equal(paired.length, 2, `${source}: pairing persists`);
  assert.equal(paired[0].supersetId, paired[1].supersetId);
  assert.equal(
    savedDay.exercises.indexOf(paired[1]),
    savedDay.exercises.indexOf(paired[0]) + 1,
    `${source}: paired exercises stay adjacent`,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

for (const source of ["ai-import", "generated"]) await verifyEditableSuperset(source);
await browser.close();
console.log("Edit-plan superset QA passed for imported and AI-generated plans.");
