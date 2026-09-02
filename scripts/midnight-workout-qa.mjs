import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  completeWorkout,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const chrome =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function shiftedDate(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function midnightFixture() {
  const yesterday = shiftedDate(-1);
  const today = shiftedDate(0);
  const yesterdayDay = weekday(yesterday);
  const todayDay = weekday(today);
  const state = blankState();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: [yesterdayDay, todayDay],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDate = isoDay(yesterday);
  state.selectedDay = yesterdayDay;
  const yesterdayWorkout = state.program.days.find(
    (day) => day.weekday === yesterdayDay,
  );
  assert.ok(yesterdayWorkout, "fixture has a planned workout yesterday");
  assert.ok(
    state.program.days.some((day) => day.weekday === todayDay),
    "fixture has a different planned workout today",
  );

  state.activeWorkout = startWorkout(state, yesterdayWorkout);
  const lateStart = new Date(yesterday);
  lateStart.setHours(23, 0, 0, 0);
  state.activeWorkout.startedAt = lateStart.getTime();
  state.activeWorkout.exercises[0].sets[0].completed = true;
  state.activeWorkout.exercises[0].sets[0].completedAt = lateStart.getTime();
  const activeState = structuredClone(state);
  const completedState = completeWorkout(state);
  const legacyWorkout = completedState.workouts.at(-1);
  delete legacyWorkout.canonicalPlanDate;
  delete legacyWorkout.workoutDateKey;
  delete legacyWorkout.sourcePlanSlotId;
  completedState.selectedDate = isoDay(today);
  completedState.selectedDay = todayDay;
  return {
    state: completedState,
    activeState,
    yesterdayIso: isoDay(yesterday),
    todayIso: isoDay(today),
    yesterdayDay,
  };
}

const fixture = midnightFixture();
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture.state);
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
await page.goto(`http://127.0.0.1:4173/?midnight=${Date.now()}`, {
  waitUntil: "networkidle",
});

await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
assert.equal(
  await page.locator(".week-strip .selected-day.workout-planned").count(),
  1,
  "today remains planned rather than inheriting last night's completion",
);
assert.equal(
  await page.getByRole("button", { name: "WORKOUT COMPLETE · VIEW HISTORY" })
    .count(),
  0,
  "today is not shown as completed",
);
const migrated = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lift-v2-state")),
);
assert.equal(
  migrated.workouts.at(-1).canonicalPlanDate,
  fixture.yesterdayIso,
  "legacy session migrates to its local start day",
);
assert.equal(
  isoDay(migrated.workouts.at(-1).completedAt),
  fixture.todayIso,
  "the real completion timestamp remains on the following day",
);

await page
  .locator(`.week-strip button[aria-label^="${fixture.yesterdayDay} "]`)
  .click();
await page
  .getByRole("button", { name: "WORKOUT COMPLETE · VIEW HISTORY" })
  .waitFor();
assert.equal(
  await page.locator(".week-strip .selected-day.workout-completed").count(),
  1,
  "the completed marker stays on the workout's planned/start day",
);

await page.reload({ waitUntil: "networkidle" });
const afterReload = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lift-v2-state")),
);
assert.equal(afterReload.workouts.length, 1, "migration is idempotent on reload");
assert.equal(
  afterReload.workouts[0].canonicalPlanDate,
  fixture.yesterdayIso,
  "canonical plan date survives reload",
);
assert.deepEqual(errors, [], `console errors: ${errors.join("; ")}`);

await context.close();

const liveContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await liveContext.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture.activeState);
const livePage = await liveContext.newPage();
const liveErrors = [];
livePage.on("pageerror", (error) => liveErrors.push(error.message));
livePage.on("console", (message) => {
  if (message.type() === "error") liveErrors.push(message.text());
});
await livePage.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false }),
  }),
);
await livePage.goto(`http://127.0.0.1:4173/?midnight-live=${Date.now()}`, {
  waitUntil: "networkidle",
});
await livePage.getByRole("button", { name: "RESUME WORKOUT" }).click();
await livePage.getByRole("button", { name: "Finish", exact: true }).click();
await livePage.getByRole("button", { name: "FINISH ANYWAY" }).click();
await livePage.getByRole("heading", { name: "Workout ended early" }).waitFor();
await livePage.getByRole("button", { name: "DONE" }).click();
await livePage.getByRole("button", { name: "START WORKOUT" }).waitFor();
assert.equal(
  await livePage.locator(".week-strip .selected-day.workout-planned").count(),
  1,
  "finishing after midnight returns directly to today's planned workout",
);
assert.deepEqual(liveErrors, [], `live console errors: ${liveErrors.join("; ")}`);
await liveContext.close();
await browser.close();
console.log(
  "Midnight workout QA passed: start-day attribution, next-day plan visibility, legacy migration, reload persistence, and post-finish routing are correct.",
);
