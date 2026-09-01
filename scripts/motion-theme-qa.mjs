import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { exerciseCatalog, isoDay, startWorkout, weekday } from "../src/domain.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture(theme, active = false) {
  const state = createReturningUserFixture(5);
  state.profile.themePreference = theme;
  const today = weekday();
  let day = state.program.days.find((item) => item.weekday === today);
  if (!day) {
    day = state.program.days[0];
    const previousDay = day.weekday;
    day.weekday = today;
    state.profile.availableDays = state.profile.availableDays.map((value) =>
      value === previousDay ? today : value,
    );
  }
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.program.rotationStartDate = null;
  if (active) {
    state.activeWorkout = startWorkout(state, day);
    const exerciseIndex = state.activeWorkout.exercises.findIndex(
      (exercise) => exercise.sets.length >= 3,
    );
    state.activeWorkout.exerciseIndex = Math.max(0, exerciseIndex);
    const exercise = state.activeWorkout.exercises[state.activeWorkout.exerciseIndex];
    while (exercise.sets.length < 3) {
      exercise.sets.push({
        ...exercise.sets.at(-1),
        id: `motion-set-${exercise.sets.length + 1}`,
        completed: false,
        completedAt: null,
        touched: false,
      });
    }
    const weight = exerciseCatalog[exercise.exerciseId]?.bodyweight ? 0 : 30;
    for (const set of exercise.sets.slice(0, 2)) {
      set.weight = weight;
      set.reps = Math.max(1, Number(set.reps) || 8);
      set.rir = 1;
      set.touched = true;
    }
    exercise.sets[0].completed = true;
    exercise.sets[0].completedAt = Date.now() - 1_000;
  }
  return state;
}

async function openState(state, { reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: state.profile.themePreference === "light" ? "light" : "dark",
    reducedMotion,
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    state,
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  return { context, page };
}

async function activeTransform(page, locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "action button has measurable geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(45);
  const transform = await locator.evaluate((node) => getComputedStyle(node).transform);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  return transform;
}

const expectedAccent = {
  light: "#1f6b4c",
  dark: "#4fbf87",
  premium: "#d7b15a",
};

for (const theme of ["light", "dark", "premium"]) {
  const todayRun = await openState(fixture(theme));
  assert.equal(
    await todayRun.page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--rook-accent").trim(),
    ),
    expectedAccent[theme],
    `${theme} keeps its own paint while sharing motion`,
  );
  const start = todayRun.page.locator(".today-hero .button");
  assert.notEqual(await activeTransform(todayRun.page, start), "none", `${theme} Start/Resume has tactile press motion`);
  const anotherDay = todayRun.page.locator(".week-strip button:not(.selected-day)").first();
  await anotherDay.click();
  const trace = todayRun.page.locator(".week-strip .selected-day.day-selection-trace");
  assert.equal(await trace.count(), 1, `${theme} receives the same one-pass day trace`);
  assert.equal(
    await trace.evaluate((node) => getComputedStyle(node, "::after").animationName),
    "rook-day-selection-trace",
    `${theme} day trace uses the shared choreography`,
  );
  await todayRun.page.waitForTimeout(560);
  assert.equal(await trace.count(), 0, `${theme} day trace fully stops`);
  await todayRun.context.close();

  const workoutRun = await openState(fixture(theme, true));
  await workoutRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
  const addSet = workoutRun.page.getByRole("button", { name: "+ ADD SET" });
  const nextExercise = workoutRun.page.getByRole("button", { name: /NEXT EXERCISE|FINISH WORKOUT/ });
  assert.notEqual(await activeTransform(workoutRun.page, addSet), "none", `${theme} Add Set shares tactile press motion`);
  assert.notEqual(await activeTransform(workoutRun.page, nextExercise), "none", `${theme} workout navigation shares tactile press motion`);
  const completion = workoutRun.page.getByRole("button", { name: "Complete set 2" });
  await completion.click();
  const committedRow = workoutRun.page.locator(".set-row.set-completing");
  await committedRow.waitFor();
  assert.equal(await committedRow.locator(".check").getAttribute("aria-pressed"), "true", `${theme} completion semantics update immediately`);
  assert.equal(
    await committedRow.locator(".check > span").evaluate((node) => getComputedStyle(node).animationName),
    "rook-check-commit",
    `${theme} check uses the same restrained commit animation`,
  );
  assert.equal(
    await workoutRun.page.locator(".set-row.set-active:not(.set-done)").count(),
    1,
    `${theme} advances the active state without waiting for decoration`,
  );
  await workoutRun.context.close();
}

const reducedRun = await openState(fixture("dark", true), { reducedMotion: "reduce" });
await reducedRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
assert.equal(
  await activeTransform(reducedRun.page, reducedRun.page.getByRole("button", { name: "+ ADD SET" })),
  "none",
  "reduced motion removes tactile scaling",
);
await reducedRun.page.getByRole("button", { name: "Complete set 2" }).click();
const reducedRow = reducedRun.page.locator(".set-row.set-completing");
await reducedRow.waitFor();
assert.equal(
  await reducedRow.locator(".check > span").evaluate((node) => getComputedStyle(node).animationName),
  "rook-check-fade",
  "reduced motion keeps only a short opacity confirmation",
);
assert.equal(
  await reducedRow.evaluate((node) => getComputedStyle(node, "::after").display),
  "none",
  "reduced motion removes the traveling row wash",
);
await reducedRun.context.close();

await browser.close();
console.log("Motion QA passed: Light, Dark, and Premium share tactile actions, one-pass day trace, set commit feedback, active-state advancement, and reduced-motion behavior without sharing theme colors.");
