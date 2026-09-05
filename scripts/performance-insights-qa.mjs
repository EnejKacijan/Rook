import assert from "node:assert/strict";
import { verifyLongContent } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { isoDay, weekDate, weekday } from "../src/domain.js";
import { normalizeTrainingBlocksState } from "../src/trainingBlocks.js";

const artifactRoot = new URL("../artifacts/performance-insights/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const dayAt = (weekdayName, weeksBack = 0) => {
  const date = weekDate(weekdayName);
  date.setDate(date.getDate() - weeksBack * 7);
  return isoDay(date);
};

function completedExercise(exerciseId, weights, reps, name = null) {
  return {
    id: `${exerciseId}-${Math.random()}`,
    exerciseId,
    sourceName: name,
    repMin: 5,
    repMax: 10,
    targetRir: 2,
    sets: weights.map((weight, index) => ({
      id: `${exerciseId}-set-${index}-${Math.random()}`,
      completed: true,
      planned: true,
      added: false,
      weight,
      reps: Array.isArray(reps) ? reps[index] : reps,
      rir: 2,
      completedAt: Date.now() + index,
    })),
  };
}

function completedWorkout(id, date, exercises, extra = {}) {
  return {
    id,
    name: extra.name || "Upper Strength",
    completedAt: `${date}T18:00:00.000Z`,
    endedAt: `${date}T18:00:00.000Z`,
    canonicalPlanDate: date,
    workoutDateKey: date,
    sourcePlanSlotId: extra.sourcePlanSlotId || `${id}:${date}`,
    status: "completed",
    exercises,
    ...extra,
  };
}

function fixture({ appearance = "light", style = "standard", kind = "review" } = {}) {
  const state = createReturningUserFixture(2);
  state.activeWorkout = null;
  state.workouts = [];
  state.todayAdaptation = null;
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  normalizeTrainingBlocksState(state);
  state.program.trainingBlock.currentWeek = 3;
  state.program.trainingBlock.completed = false;
  const baselineDate = dayAt("Tue", 1);
  const currentOne = dayAt("Tue");
  const currentTwo = dayAt("Thu");
  const baselineExercises = [
    completedExercise("barbell-bench-press", [80, 80, 80], [6, 6, 6]),
    completedExercise("barbell-row", [70, 70, 70], [8, 8, 8]),
    completedExercise("back-squat", [100, 100, 100], [5, 5, 5]),
    completedExercise("overhead-press", [45, 45, 45], [6, 6, 6]),
  ];
  state.workouts.push(completedWorkout("baseline", baselineDate, baselineExercises));
  if (kind !== "empty") {
    const same = kind === "no-pr" || kind === "deload";
    const currentExercises = [
      completedExercise("barbell-bench-press", [same ? 80 : 82.5, same ? 80 : 82.5], same ? [6, 6] : [7, 7]),
      completedExercise("barbell-row", [same ? 70 : 72.5, same ? 70 : 72.5], same ? [8, 8] : [9, 9]),
    ];
    state.workouts.push(completedWorkout("current-one", currentOne, currentExercises, {
      adjustment: kind === "review" || kind === "many-prs" ? { id: "adjusted-today" } : undefined,
      trainingBlock: {
        blockName: state.program.trainingBlock.name,
        blockWeekNumber: kind === "deload" ? 6 : 3,
        totalWeeks: 6,
        plannedDeload: kind === "deload",
      },
    }));
    if (kind === "many-prs") {
      state.workouts.push(completedWorkout("current-two", currentTwo, [
        completedExercise("back-squat", [105, 105], [6, 6]),
        completedExercise("overhead-press", [47.5, 47.5], [7, 7]),
      ]));
    }
  }
  state.weekScheduleOverrides = kind === "review" || kind === "many-prs"
    ? { [dayAt("Mon")]: { [state.program.days[0].id]: currentOne } }
    : {};
  if (kind === "deload") state.program.trainingBlock.currentWeek = 6;
  if (kind === "empty") state.workouts = [];
  state.selectedDay = weekday();
  state.selectedDate = isoDay();
  return state;
}

function activePrFixture() {
  const state = fixture({ kind: "no-pr" });
  const activeDate = isoDay();
  const exercise = completedExercise(
    "barbell-bench-press",
    [85, 85, 85],
    [8, 8, 8],
  );
  exercise.sets = exercise.sets.map((set, index) => ({
    ...set,
    completed: index === 0,
    completedAt: index === 0 ? Date.now() : undefined,
  }));
  state.activeWorkout = {
    id: "active-pr",
    templateId: weekday(),
    programDayId: state.program.days[0].id,
    canonicalPlanDate: activeDate,
    workoutDateKey: activeDate,
    sourcePlanSlotId: `active:${activeDate}`,
    name: "Upper Strength",
    startedAt: Date.now() - 600000,
    updatedAt: Date.now(),
    exerciseIndex: 0,
    rest: null,
    exercises: [exercise],
  };
  return state;
}

async function open(
  state,
  viewport = { width: 390, height: 844 },
  serviceWorkers = "block",
) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.appearancePreference === "dark" ? "dark" : "light",
    serviceWorkers,
  });
  await context.addInitScript((value) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(value));
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }));
  await page.goto(`${baseUrl}/?performance-insights=${Date.now()}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function assertClean(run, label) {
  await verifyLongContent(run.page, label);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal overflow`);
  assert.deepEqual(run.errors, [], `${label}: ${run.errors.join("; ")}`);
}

async function captureReview(name, state, viewport = { width: 390, height: 844 }) {
  const run = await open(state, viewport);
  await run.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  await run.page.locator(".weekly-review-section").scrollIntoViewIfNeeded();
  await run.page.waitForTimeout(120);
  await assertClean(run, name);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  await run.context.close();
}

async function captureDetail(name, state, viewport = { width: 390, height: 844 }) {
  const run = await open(state, viewport);
  await run.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  const bench = run.page.getByRole("button", { name: /Bench Press/ }).last();
  await bench.scrollIntoViewIfNeeded();
  await bench.click();
  await run.page.locator(".exercise-performance-insights").scrollIntoViewIfNeeded();
  assert.equal(await run.page.getByText("Estimated 1RM", { exact: true }).count(), 1);
  assert.equal(await run.page.locator(".exercise-e1rm-trend").count(), 1);
  await assertClean(run, name);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  await run.context.close();
}

const activeRun = await open(activePrFixture());
await activeRun.page.getByRole("button", { name: /RESUME WORKOUT/i }).click();
assert.equal(await activeRun.page.getByText("e1RM PR", { exact: false }).count(), 1);
await assertClean(activeRun, "390-active-pr");
await activeRun.page.screenshot({ path: output("390-active-pr.png"), fullPage: false });
await activeRun.context.close();

await captureReview("390-weekly-review", fixture());
await captureReview("390-no-pr-week", fixture({ kind: "no-pr" }));
await captureReview("320-many-prs", fixture({ kind: "many-prs" }), { width: 320, height: 700 });
await captureReview("390-deload-week", fixture({ kind: "deload" }));
await captureReview("390-empty-baseline", fixture({ kind: "empty" }));
await captureReview("430-weekly-review", fixture(), { width: 430, height: 900 });
await captureDetail("390-exercise-detail-e1rm", fixture({ kind: "many-prs" }));

for (const [appearance, style, label] of [
  ["light", "standard", "standard-light"],
  ["dark", "standard", "standard-dark"],
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  const themed = fixture({ appearance, style, kind: "many-prs" });
  await captureReview(`390-${label}-review`, themed);
  await captureDetail(`390-${label}-e1rm`, themed);
}

const reloadRun = await open(
  fixture({ kind: "many-prs" }),
  { width: 390, height: 844 },
  "allow",
);
await reloadRun.page.evaluate(() => navigator.serviceWorker.ready);
if (!(await reloadRun.page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
  await reloadRun.page.reload({ waitUntil: "networkidle" });
}
// Reload once while online after the worker has control so the current
// fingerprinted build assets are guaranteed to pass through its cache.
await reloadRun.page.reload({ waitUntil: "networkidle" });
assert.equal(
  await reloadRun.page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  true,
  "offline recomputation starts from a service-worker-controlled page",
);
await reloadRun.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
const before = await reloadRun.page.locator(".weekly-review-card").textContent();
await reloadRun.context.setOffline(true);
await reloadRun.page.reload({ waitUntil: "domcontentloaded" });
await reloadRun.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
assert.equal(await reloadRun.page.locator(".weekly-review-card").textContent(), before, "derived review recomputes identically after offline reload");
reloadRun.errors = reloadRun.errors.filter(
  (error) => !/Failed to load resource: net::ERR_FAILED/.test(error),
);
await assertClean(reloadRun, "offline-reload");
await reloadRun.context.close();

await browser.close();
console.log("Performance Insights QA passed: restrained in-workout PR, exercise bests, e1RM trend, normal/no-PR/many-PR/deload/empty Weekly Reviews, 320/390/430 widths, four themes, reload and offline recomputation.");
