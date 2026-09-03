import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  blankState,
  buildProgram,
  completeWorkout,
  consistencyForCurrentWeek,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekDate,
  weekday,
  WEEKDAYS,
} from "../src/domain.js";
import { createReturningUserFixture } from "../src/demoFixture.js";

const outputRoot = new URL("../artifacts/progress/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function baseState() {
  const state = blankState();
  const today = WEEKDAYS.indexOf(weekday());
  const days = [
    ...new Set([0, 1, 3, 5].map((offset) => WEEKDAYS[(today + offset) % 7])),
  ];
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 4,
    availableDays: days,
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.program.source = "ai";
  state.selectedDay = weekday();
  state.selectedDate = isoDay();
  return state;
}

function addSession(
  state,
  {
    date,
    name,
    exerciseId = "dumbbell-bench-press",
    weight = 30,
    reps = 8,
    completedExercises = 1,
    completeAllSets = false,
    templateIndex = null,
  },
) {
  const template =
    state.program.days[
      templateIndex ?? state.workouts.length % state.program.days.length
    ];
  const active = startWorkout(state, template);
  active.name = name || template.name;
  for (
    let index = 0;
    index < Math.min(completedExercises, active.exercises.length);
    index++
  ) {
    if (index === 0) {
      active.exercises[index].exerciseId = exerciseId;
      active.exercises[index].restSeconds =
        exerciseCatalog[exerciseId].restSeconds;
      active.exercises[index].defaultIncrement =
        exerciseCatalog[exerciseId].increment;
    }
    const sets = completeAllSets
      ? active.exercises[index].sets
      : active.exercises[index].sets.slice(0, 1);
    for (const set of sets) {
      set.completed = true;
      set.weight = exerciseCatalog[active.exercises[index].exerciseId]
        ?.bodyweight
        ? null
        : weight + index * 5;
      set.reps = reps;
    }
  }
  state.activeWorkout = active;
  state = completeWorkout(state);
  const completed = state.workouts.at(-1);
  const planDate = isoDay(date);
  completed.completedAt = date.toISOString();
  completed.planDate = planDate;
  completed.workoutDateKey = planDate;
  completed.canonicalPlanDate = planDate;
  return state;
}
const at = (day, weeksBack = 0) => {
  const date = weekDate(day);
  date.setDate(date.getDate() - weeksBack * 7);
  return date;
};

const zero = baseState();
let one = baseState();
one = addSession(one, { date: new Date(), name: "Upper A" });
let missingWeight = baseState();
missingWeight = addSession(missingWeight, {
  date: new Date(),
  name: "Upper A",
});
missingWeight.workouts.at(-1).exercises[0].sets[0].weight = null;
let three = baseState();
three = addSession(three, {
  date: at("Mon"),
  name: "Upper A",
  exerciseId: "dumbbell-bench-press",
});
three = addSession(three, {
  date: at("Wed"),
  name: "Lower A",
  exerciseId: "back-squat",
});
three = addSession(three, {
  date: new Date(),
  name: "Upper B",
  exerciseId: "barbell-row",
});
const longTerm = createReturningUserFixture(5);
let noProgress = baseState();
for (let week = 4; week >= 0; week--)
  noProgress = addSession(noProgress, {
    date: at(weekday(), week),
    name: "Upper A",
    weight: 30,
    reps: 8,
  });
let realProgress = baseState();
realProgress = addSession(realProgress, {
  date: at("Wed"),
  name: "Upper A",
  weight: 30,
  reps: 8,
});
realProgress = addSession(realProgress, {
  date: new Date(),
  name: "Upper A",
  weight: 30,
  reps: 10,
});
let readyProgress = baseState();
readyProgress = addSession(readyProgress, {
  date: at("Wed"),
  name: "Upper A",
  weight: 30,
  reps: 10,
  completeAllSets: true,
  templateIndex: 0,
});
readyProgress = addSession(readyProgress, {
  date: new Date(),
  name: "Upper A",
  weight: 30,
  reps: 10,
  completeAllSets: true,
  templateIndex: 0,
});

async function openProgress(state, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript((value) => {
    if (!localStorage.getItem("lift-v2-state"))
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
  }, state);
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
  await page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  await page.waitForTimeout(120);
  await page.screenshot({ path: output(`${name}.png`), fullPage: false });
  return { context, page, errors };
}

{
  const { context, page, errors } = await openProgress(zero, "a-zero-workouts");
  assert.equal(
    await page
      .getByRole("heading", { name: "Your progress starts here." })
      .count(),
    1,
  );
  assert.equal(await page.getByText("PROGRESSION", { exact: true }).count(), 1);
  assert.equal(
    await page.getByText(/More comparable sessions are needed/).count(),
    1,
  );
  assert.equal(
    await page.getByText("WORKING WEIGHTS", { exact: true }).count(),
    1,
  );
  assert.equal(
    (await page.getByText("Not enough data", { exact: true }).count()) > 0,
    true,
  );
  assert.equal(
    await page.getByText(/RECENT TRAINING/, { exact: false }).count(),
    0,
  );
  assert.equal(await page.getByText("THIS WEEK", { exact: true }).count(), 1);
  assert.match(await page.locator(".consistency").textContent(), /0 \/ 4/);
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(one, "b-one-workout");
  assert.equal(
    await page.getByRole("heading", { name: "Your baseline is set." }).count(),
    1,
  );
  assert.match(
    await page.locator(".working-weight-row").first().textContent(),
    /30 kg.*›/,
  );
  assert.equal(
    await page.getByText("RECENT TRAINING", { exact: true }).count(),
    1,
  );
  assert.match(
    await page.locator(".recent-session-row").textContent(),
    /Upper A.*Today.*1 set/,
  );
  assert.equal(
    await page.getByText("RECENT IMPROVEMENTS", { exact: true }).count(),
    0,
  );
  await page.locator(".working-weight-row").first().click();
  assert.equal(
    await page.locator(".chart").count(),
    0,
    "exercise detail has no misleading weight-only chart",
  );
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    missingWeight,
    "b2-missing-weight",
  );
  assert.equal(
    await page.getByText("No weight logged", { exact: true }).count(),
    1,
  );
  await page.locator(".working-weight-row").first().click();
  assert.equal(
    await page.getByRole("heading", { name: "Not set yet" }).count(),
    1,
  );
  assert.equal(
    await page.getByText("Weight unset", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("Weight not logged", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByText("Log a weight on a completed working set to establish this.", {
        exact: true,
      })
      .count(),
    1,
  );
  assert.match(
    await page.locator(".detail-screen .list-row").last().textContent(),
    /8 reps/,
  );
  await page.screenshot({
    path: output("b2-missing-weight-detail.png"),
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    three,
    "c-three-workouts",
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Your training is building a baseline." })
      .count(),
    1,
  );
  assert.equal(
    await page.getByText("RECENT TRAINING", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByText("RECENT IMPROVEMENTS", { exact: true }).count(),
    0,
  );
  assert.match(await page.locator(".consistency").textContent(), /3 \/ 4/);
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    longTerm,
    "d-five-weeks",
  );
  assert.equal((await page.locator(".working-weight-row").count()) > 1, true);
  assert.equal(
    await page.getByText("RECENT IMPROVEMENTS", { exact: true }).count(),
    1,
  );
  const currentWeek = consistencyForCurrentWeek(longTerm);
  assert.match(
    await page.locator(".consistency").textContent(),
    new RegExp(`${currentWeek.completed} \\/ ${currentWeek.planned}`),
  );
  assert.equal(
    await page.getByText("THIS WEEK", { exact: true }).count(),
    1,
    "weekly completion is not mislabeled as longitudinal consistency",
  );
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    noProgress,
    "e-history-no-progression",
  );
  assert.equal(
    await page.getByText("RECENT IMPROVEMENTS", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("RECENT TRAINING", { exact: true }).count(),
    1,
  );
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    realProgress,
    "f-real-progression",
  );
  assert.equal(
    await page.getByText("RECENT IMPROVEMENTS", { exact: true }).count(),
    1,
  );
  assert.match(
    await page.locator(".progress-lower").textContent(),
    /\+2 reps at 30 kg/,
  );
  assert.equal(
    await page.locator(".progress-lower .navigation-chevron").count(),
    1,
    "Recent Improvements uses the shared navigation chevron",
  );
  assert.equal(
    await page.getByText("RECENT TRAINING", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page, errors } = await openProgress(
    readyProgress,
    "g-ready-to-progress",
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Know where your training stands." })
      .count(),
    1,
  );
  assert.match(
    await page.locator(".progression-row").first().textContent(),
    /Dumbbell Bench Press.*Ready to progress.*Next: 32 kg/,
  );
  await page.locator(".progression-row").first().click();
  assert.match(
    await page.locator(".exercise-progression").textContent(),
    /Ready to progress.*Next: 32 kg/,
  );
  assert.equal(await page.locator(".chart").count(), 0);
  await page.screenshot({
    path: output("g-ready-to-progress-detail.png"),
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Progress QA passed: sparse, baseline, improvement, ready-to-progress and detail states use only persisted data.",
);
