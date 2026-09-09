import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  exerciseCatalog,
  exerciseLoadRequirement,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";
import {
  exercisePerformance,
  performanceWeekRange,
  prEventsForWorkouts,
} from "../src/performanceInsights.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const root = "artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots";
await mkdir(root, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

function themeState(style, appearance) {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  const today = weekday();
  const first = state.program.days[0];
  const conflict = state.program.days.find((day) => day !== first && day.weekday === today);
  if (conflict) conflict.weekday = first.weekday;
  first.weekday = today;
  state.selectedDay = today;
  state.selectedDate = isoDay();
  Object.assign(state.profile, {
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  });
  return state;
}

async function open(fixture, { width = 390, appearance = "light" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    colorScheme: appearance,
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (state) => localStorage.setItem("lift-v2-state", JSON.stringify(state)),
    fixture,
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Warning: Received `%s` for a non-boolean attribute `%s`")
    ) errors.push(message.text());
  });
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: true } }));
  await page.goto(appUrl, { waitUntil: "networkidle" });
  return { context, page, errors };
}

for (const { style, appearance, label } of [
  { style: "standard", appearance: "light", label: "standard-light" },
  { style: "standard", appearance: "dark", label: "standard-dark" },
  { style: "premium", appearance: "light", label: "premium-light" },
  { style: "premium", appearance: "dark", label: "premium-dark" },
]) {
  const { context, page, errors } = await open(themeState(style, appearance), { appearance });
  await page.getByRole("button", { name: "COACH", exact: true }).click();
  const shortcuts = page.locator(".coach-screen .prompt-list button");
  assert.ok((await shortcuts.count()) >= 3, `${label}: contextual shortcuts are visible`);
  const shortcutLabels = await shortcuts.allTextContents();
  for (const expected of ["Shorten today’s workout", "Move a workout this week", "Review logged progress"])
    assert.ok(shortcutLabels.includes(expected), `${label}: ${expected} is visible`);
  const colors = await shortcuts.evaluateAll((buttons) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--rook-accent-text)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { expected, actual: buttons.map((button) => getComputedStyle(button).color) };
  });
  assert.ok(colors.actual.every((color) => color === colors.expected), `${label}: ${JSON.stringify(colors)}`);
  await page.screenshot({ path: `${root}/coach-${label}.png`, animations: "disabled" });
  assert.deepEqual(errors, []);
  await context.close();
}

for (const exerciseId of ["bosu-balance", "y-balance-reach", "wg-banded-monster-walk", "pogo-jumps"])
  assert.equal(exerciseLoadRequirement({ exerciseId }), "none", exerciseId);
assert.equal(exerciseCatalog["bosu-balance"].measure, "seconds");
assert.equal(exerciseCatalog["y-balance-reach"].measure, undefined);
assert.equal(exerciseCatalog["pogo-jumps"].measure, undefined);

function workoutState(exerciseId, { reps = 8, weight = null, setCount = 2 } = {}) {
  const state = themeState("standard", "dark");
  state.profile.rirEnabled = true;
  state.profile.restTimerEnabled = false;
  state.profile.recommendedWarmupsEnabled = false;
  const today = weekday();
  const day = structuredClone(state.program.days[0]);
  day.id = `baseline-${exerciseId}`;
  day.weekday = today;
  day.name = exerciseCatalog[exerciseId].name;
  const source = structuredClone(day.exercises[0]);
  source.id = `baseline-entry-${exerciseId}`;
  source.exerciseId = exerciseId;
  source.importedName = exerciseCatalog[exerciseId].name;
  source.originalImportedName = exerciseCatalog[exerciseId].name;
  source.loadRequirement = "required";
  source.measure = exerciseCatalog[exerciseId].measure;
  source.repMin = reps;
  source.repMax = reps;
  source.sets = Array.from({ length: setCount }, (_, index) => ({
    id: `baseline-${exerciseId}-set-${index + 1}`,
    reps,
    weight,
    completed: false,
  }));
  day.exercises = [source];
  state.selectedDate = isoDay();
  state.selectedDay = today;
  state.activeWorkout = startWorkout(state, day);
  return state;
}

{
  const state = workoutState("bosu-balance", { reps: 45, weight: 0 });
  assert.deepEqual(state.activeWorkout.exercises[0].sets.map((set) => set.weight), [null, null]);
  const { context, page, errors } = await open(state, { appearance: "dark" });
  const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
  if (await resume.count()) await resume.click();
  await page.getByRole("heading", { name: "BOSU Balance", exact: true }).waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`BOSU logger did not open: ${await page.locator("body").innerText()}`);
  });
  assert.deepEqual(
    (await page.locator(".set-labels > span").allTextContents()).filter(Boolean),
    ["SEC", "DONE"],
  );
  assert.equal(await page.locator(".set-load-heading, .set-load-context").count(), 0);
  assert.equal(await page.getByRole("spinbutton", { name: /Weight/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Log set 1" }).isEnabled(), true);
  await page.screenshot({ path: `${root}/bosu-balance-no-load.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Log set 1" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0].sets[0].completed);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0].sets[0].weight), null);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = workoutState("leg-press", { reps: 9, weight: 130, setCount: 3 });
  const { context, page, errors } = await open(state);
  const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
  if (await resume.count()) await resume.click();
  const load = page.getByRole("spinbutton", { name: "Weight in kg for set 1" });
  assert.equal(await load.inputValue(), "130");
  assert.equal(await page.getByRole("button", { name: "Log set 1" }).isEnabled(), true);
  await page.screenshot({ path: `${root}/weighted-leg-press-control.png`, animations: "disabled" });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = workoutState("pull-up", { reps: 8, weight: 0 });
  const { context, page, errors } = await open(state);
  const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
  if (await resume.count()) await resume.click();
  assert.equal(await page.getByRole("spinbutton", { name: "Added weight (optional) in kg for set 1" }).inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "Log set 1" }).isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
}

const completedNoLoad = [{
  id: "bosu-completed",
  completedAt: new Date().toISOString(),
  exercises: [{
    id: "bosu-history",
    exerciseId: "bosu-balance",
    loadRequirement: "none",
    measure: "seconds",
    sets: [{ id: "bosu-history-set", completed: true, reps: 45, weight: null }],
  }],
}];
assert.equal(exercisePerformance(completedNoLoad, "bosu-balance", { e1rmEligible: false }).bestWeight, null);
assert.deepEqual(prEventsForWorkouts(completedNoLoad, { e1rmEligible: () => false }), []);

for (const { style, appearance, width, label, nonzero = false } of [
  { style: "standard", appearance: "light", width: 390, label: "standard-light-390" },
  { style: "standard", appearance: "dark", width: 320, label: "standard-dark-320" },
  { style: "premium", appearance: "light", width: 390, label: "premium-light-390", nonzero: true },
  { style: "premium", appearance: "dark", width: 320, label: "premium-dark-320", nonzero: true },
]) {
  const state = themeState(style, appearance);
  if (nonzero) {
    const completed = structuredClone(state.workouts.at(-1));
    completed.id = `adjusted-${label}`;
    completed.canonicalPlanDate = isoDay();
    completed.completedAt = new Date().toISOString();
    completed.adjustment = { mode: "less-time" };
    state.workouts.push(completed);
    state.weekScheduleOverrides = {
      ...(state.weekScheduleOverrides || {}),
      [performanceWeekRange().start]: { "moved-fixture": { to: isoDay() } },
    };
  }
  const { context, page, errors } = await open(state, { width, appearance });
  await page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  const summary = page.locator(".weekly-review-adjustments");
  const expected = nonzero ? "1 adjusted · 1 moved" : "0 adjusted · 0 moved";
  assert.equal(await summary.getAttribute("aria-label"), expected);
  const geometry = await summary.evaluate((element) => {
    const first = element.firstElementChild.getBoundingClientRect();
    const separator = element.querySelector(".weekly-review-adjustment-separator").getBoundingClientRect();
    const second = element.querySelector(".weekly-review-adjustment-tail > span:last-child").getBoundingClientRect();
    const card = element.closest(".weekly-review-card").getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      gap: parseFloat(style.columnGap),
      sameLine: Math.abs(first.top - separator.top) < 1,
      firstToSeparator: separator.left - first.right,
      separatorToSecond: second.left - separator.right,
      overflow: element.scrollWidth > element.clientWidth,
      clearsCard: element.getBoundingClientRect().right > card.right,
    };
  });
  assert.ok(geometry.gap > 0, `${label}: controlled separator gap exists`);
  if (geometry.sameLine)
    assert.ok(geometry.firstToSeparator >= 3, `${label}: separator clears adjusted phrase`);
  assert.ok(geometry.separatorToSecond >= 3, `${label}: separator clears moved phrase`);
  assert.equal(geometry.overflow, false, `${label}: summary fits its metric cell`);
  assert.equal(geometry.clearsCard, false, `${label}: summary stays inside the review card`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${root}/progress-adjusted-moved-${label}.png`, animations: "disabled" });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = themeState("standard", "light");
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  await page.getByRole("button", { name: "Edit exercises", exact: true }).click();
  await page.getByText("EDIT EXERCISES", { exact: true }).waitFor();
  await page.screenshot({ path: `${root}/today-edit-exercises-control.png`, animations: "disabled" });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log("Baseline correction QA passed: Coach shortcuts follow all theme tokens; BOSU logs seconds without load; weighted and optional-load controls remain intact; no-load history creates no weight/PR metrics; Weekly Review separator spacing passes zero/non-zero values across four themes and 320/390px; Today Edit exercises remains available.");
