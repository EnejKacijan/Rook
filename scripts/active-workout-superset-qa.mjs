import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { startWorkout } from "../src/domain.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const state = createReturningUserFixture(2);
const day = state.program.days.find((item) => item.exercises.length >= 3);
state.activeWorkout = startWorkout(state, day);
state.activeWorkout.exerciseIndex = 0;
state.activeWorkout.exercises.forEach((exercise) => {
  delete exercise.supersetId;
  exercise.sets.forEach((set) => {
    set.completed = false;
    delete set.completedAt;
  });
});
const firstId = state.activeWorkout.exercises[0].id;
const originalProgram = JSON.stringify(state.program);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(
  (value) => {
    if (!localStorage.getItem("lift-v2-state"))
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
  },
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
await page.getByRole("button", { name: "RESUME WORKOUT" }).click();
await page.getByRole("button", { name: "Exercise options" }).click();
await page.getByRole("button", { name: "Create superset" }).click();
await page.getByText("Pair", { exact: false }).first().waitFor();
const choice = page.locator(".active-superset-sheet .choice-row").first();
const partnerName = await choice.locator("strong").innerText();
await choice.click();
await page.getByRole("button", { name: "Exercise options" }).click();
await page.getByRole("button", { name: "Manage superset" }).waitFor();
await page.getByRole("button", { name: "Close", exact: true }).click();
assert.equal(await page.getByText("A1", { exact: true }).count(), 0);
assert.equal(await page.getByText("A2", { exact: true }).count(), 0);
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
let firstIndex = stored.activeWorkout.exercises.findIndex((item) => item.id === firstId);
let paired = stored.activeWorkout.exercises.slice(firstIndex, firstIndex + 2);
assert.equal(paired.length, 2);
assert.ok(paired[0].supersetId);
assert.equal(paired[0].supersetId, paired[1].supersetId);
const pairId = paired[0].supersetId;
assert.equal(JSON.stringify(stored.program), originalProgram);
assert.equal(
  (await page.getByText(`Next: ${partnerName}`, { exact: true }).count()) > 0,
  true,
);

await page.reload({ waitUntil: "networkidle" });
stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
firstIndex = stored.activeWorkout.exercises.findIndex((item) => item.id === firstId);
assert.equal(
  stored.activeWorkout.exercises[firstIndex].supersetId,
  pairId,
  JSON.stringify(stored.activeWorkout.exercises.slice(firstIndex, firstIndex + 2)),
);
await page.getByRole("button", { name: "RESUME WORKOUT" }).click();
await page.getByRole("button", { name: "Exercise options" }).click();
assert.equal(await page.getByRole("button", { name: "Manage superset" }).count(), 1);
stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
firstIndex = stored.activeWorkout.exercises.findIndex((item) => item.id === firstId);
assert.equal(stored.activeWorkout.exercises[firstIndex].supersetId, pairId);
assert.equal(JSON.stringify(stored.program), originalProgram);

await context.setOffline(true);
await page.getByRole("button", { name: "Manage superset" }).click();
await page.getByRole("button", { name: "Close" }).click();
await context.setOffline(false);

await page.getByRole("button", { name: "Replace" }).click();
const replacementChoices = page.locator(".replace-sheet .choice-row");
await replacementChoices.first().waitFor();
const activeNames = new Set(
  stored.activeWorkout.exercises
    .filter((item) => item.id !== firstId)
    .map((item) => item.exerciseId),
);
const replacementName = await replacementChoices.first().locator("strong").innerText();
await replacementChoices.first().click();
stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
firstIndex = stored.activeWorkout.exercises.findIndex((item) => item.id === firstId);
paired = stored.activeWorkout.exercises.slice(firstIndex, firstIndex + 2);
assert.equal(paired[0].supersetId, pairId);
assert.equal(paired[1].supersetId, pairId);
assert.equal(JSON.stringify(stored.program), originalProgram);
assert.ok(replacementName);
assert.equal(activeNames.has(paired[0].exerciseId), false);

await page.getByRole("button", { name: "Exercise options" }).click();
await page.getByRole("button", { name: "Manage superset" }).click();
await page.getByRole("button", { name: "Remove superset" }).click();
stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
firstIndex = stored.activeWorkout.exercises.findIndex((item) => item.id === firstId);
paired = stored.activeWorkout.exercises.slice(firstIndex, firstIndex + 2);
assert.equal(paired.some((item) => item.supersetId), false);
assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log("Active-workout superset create/remove QA passed.");
