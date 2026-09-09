import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { verifyLongContent } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { weekday, startWorkout } from "../src/domain.js";
import { normalizePlanHistoryState } from "../src/planHistory.js";
import { normalizeTrainingBlocksState } from "../src/trainingBlocks.js";

const artifactRoot = new URL("../artifacts/training-blocks/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({ week = 1, complete = false, appearance = "light", style = "standard", long = false } = {}) {
  const state = createReturningUserFixture(2);
  state.activeWorkout = null;
  state.todayAdaptation = null;
  const today = weekday();
  if (!state.program.days.some((day) => day.weekday === today)) {
    const replaced = state.program.days[0].weekday;
    state.program.days[0].weekday = today;
    state.profile.availableDays = state.profile.availableDays.map((day) => day === replaced ? today : day);
  }
  state.selectedDay = today;
  state.selectedDate = new Date().toISOString().slice(0, 10);
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  normalizeTrainingBlocksState(state);
  const block = state.program.trainingBlock;
  block.currentWeek = Math.min(week, block.totalWeeks);
  block.completed = complete;
  block.completedAt = complete ? new Date().toISOString() : null;
  if (complete) state.completedTrainingBlocks = [structuredClone(block)];
  if (long) {
    block.name = "Strength Foundation and Hypertrophy Development Block";
    state.program.days.forEach((day, index) => {
      day.name = `Upper and Lower Strength Development Session ${index + 1}`;
    });
  }
  state.planVersions = [];
  normalizePlanHistoryState(state, "2026-09-01T08:00:00Z");
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.appearancePreference === "dark" ? "dark" : "light",
    serviceWorkers: "block",
  });
  await context.addInitScript((value) => {
    if (!localStorage.getItem("lift-v2-state"))
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }));
  await page.goto(`${baseUrl}/?training-block=${Date.now()}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function openDetails(page) {
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'program'); await page.getByRole("button", { name: /Training block/ }).click();
  await page.getByRole("heading", { name: /Upper|Strength Foundation/ }).waitFor();
}

async function capture(name, state, viewport, action) {
  const run = await open(state, viewport);
  if (action) await action(run.page);
  await verifyLongContent(run.page, name);
  await run.page.waitForTimeout(200);
  const activeWeek = run.page.locator('.training-block-week.is-current');
  if (await activeWeek.count()) {
    assert.equal(await activeWeek.evaluate(row => {
      const color = selector => getComputedStyle(row.querySelector(selector)).color;
      return color(':scope > div > strong') === color(':scope > i') && color(':scope > span') === color(':scope > i');
    }), true, `${name}: active week title, number and NOW share the theme accent`);
  }
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no horizontal overflow`);
  assert.deepEqual(run.errors, [], `${name}: ${run.errors.join("; ")}`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  await run.context.close();
}

const todayEntry = await open(fixture());
await todayEntry.page.getByRole('button', { name: 'View training block', exact: true }).click();
assert.equal(await todayEntry.page.getByRole('button', { name: 'EDIT BLOCK', exact: true }).isEnabled(), true);
await todayEntry.context.close();
const lockedState = fixture();
lockedState.activeWorkout = startWorkout(lockedState, lockedState.program.days.find(day => day.weekday === weekday()));
await capture('390-active-workout-edit-lock', lockedState, { width: 390, height: 844 }, async page => {
  await openDetails(page);
  assert.equal(await page.getByRole('button', { name: 'EDIT BLOCK', exact: true }).isEnabled(), false);
  await page.getByText('Finish or discard your active workout to edit this block.', { exact: true }).scrollIntoViewIfNeeded();
});
await capture("390-today-week-1", fixture({ week: 1 }), { width: 390, height: 844 });
await capture("390-block-details-week-1", fixture({ week: 1 }), { width: 390, height: 844 }, openDetails);
await capture("390-block-details-middle", fixture({ week: 3 }), { width: 390, height: 844 }, openDetails);
await capture("390-today-deload", fixture({ week: 6 }), { width: 390, height: 844 });
await capture("390-block-details-deload", fixture({ week: 6 }), { width: 390, height: 844 }, openDetails);
await capture("390-final-week", fixture({ week: 5 }), { width: 390, height: 844 }, openDetails);
await capture("390-block-complete", fixture({ week: 6, complete: true }), { width: 390, height: 844 }, openDetails);
await capture("390-block-complete-actions", fixture({ week: 6, complete: true }), { width: 390, height: 844 }, async (page) => {
  await openDetails(page);
  await page.getByRole("button", { name: "REVIEW BLOCK", exact: true }).scrollIntoViewIfNeeded();
});
await capture("390-next-block-review", fixture({ week: 6, complete: true }), { width: 390, height: 844 }, async (page) => {
  await openDetails(page);
  await page.getByRole("button", { name: "REVIEW BLOCK", exact: true }).click();
  await page.getByRole("button", { name: "REVIEW NEXT BLOCK" }).click();
  await page.getByRole("button", { name: "START NEXT BLOCK" }).waitFor();
});
await capture("390-edit-block-no-deload", fixture({ week: 2 }), { width: 390, height: 844 }, async (page) => {
  await openDetails(page);
  await page.getByRole("button", { name: "EDIT BLOCK" }).click();
  await page.getByRole("button", { name: "4 weeks" }).click();
  await page.getByRole("button", { name: /Planned deload/ }).click();
});
await capture("390-long-block", fixture({ week: 3, long: true }), { width: 390, height: 844 }, openDetails);
await capture("320-deload-details", fixture({ week: 6, long: true }), { width: 320, height: 700 }, openDetails);
await capture("430-today", fixture({ week: 3 }), { width: 430, height: 900 });

for (const [appearance, style, label] of [
  ["light", "standard", "standard-light"],
  ["dark", "standard", "standard-dark"],
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  await capture(`390-${label}-today`, fixture({ week: 3, appearance, style }), { width: 390, height: 844 });
  await capture(`390-${label}-base-week`, fixture({ week: 1, appearance, style }), { width: 390, height: 844 }, openDetails);
  await capture(`390-${label}-deload`, fixture({ week: 6, appearance, style }), { width: 390, height: 844 }, openDetails);
}

const editing = await open(fixture({ week: 2 }));
await openDetails(editing.page);
await editing.page.getByRole("button", { name: "EDIT BLOCK" }).click();
await editing.page.getByRole("button", { name: "4 weeks" }).click();
await editing.page.getByRole("button", { name: /Planned deload/ }).click();
await editing.page.getByRole("button", { name: "SAVE BLOCK" }).click();
await editing.page.locator(".training-block-progress").getByText("Week 2 of 4", { exact: false }).waitFor();
let saved = await editing.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(saved.program.trainingBlock.totalWeeks, 4);
assert.equal(saved.program.trainingBlock.plannedDeloadWeek, null);
assert.equal(saved.planVersions.at(-1).source, "Manual edit");
await editing.page.reload({ waitUntil: "networkidle" });
saved = await editing.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(saved.program.trainingBlock.totalWeeks, 4, "edited block survives reload");
assert.deepEqual(editing.errors, []);
await editing.context.close();

const completed = await open(fixture({ week: 6, complete: true }));
await completed.context.setOffline(true);
await openDetails(completed.page);
const oldId = await completed.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).program.trainingBlock.id);
await completed.page.getByRole("button", { name: "REVIEW BLOCK", exact: true }).click();
await completed.page.getByRole("button", { name: "REVIEW NEXT BLOCK" }).click();
await completed.page.getByRole("button", { name: "START NEXT BLOCK" }).click();
await completed.page.waitForTimeout(150);
const nextState = await completed.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.notEqual(nextState.program.trainingBlock.id, oldId, "reviewed next block gets a new stable identity");
assert.equal(nextState.program.trainingBlock.currentWeek, 1);
assert.equal(nextState.completedTrainingBlocks.length, 1, "completed block history is preserved");
assert.equal(nextState.planVersions.at(-1).source, "Next block");
assert.deepEqual(completed.errors, []);
await completed.context.close();

await browser.close();
console.log("Training Blocks QA passed: Today context, 4/6-week configuration, middle/final/deload targets, completion review, reviewed next block, Plan History, reload, offline use, long content, 320/390/430 widths, and four themes.");
