import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  estimateSessionMinutes,
  exerciseCatalog,
  isoDay,
  weekday,
} from "../src/domain.js";

const exerciseIds = [
  "incline-machine-press",
  "machine-high-row",
  "bodyweight-split-squat",
  "reverse-lunge",
  "barbell-curl",
  "band-chest-press",
  "band-fly",
  "band-overhead-press",
  "band-leg-curl",
  "band-curl",
  "band-triceps-pressdown",
  "dumbbell-calf-raise",
  "broad-jump",
  "single-arm-cable-lat-pulldown",
  "pendulum-squat",
  "single-leg-leg-press",
  "preacher-curl",
];
const exerciseGroups = [exerciseIds.slice(0, 9), exerciseIds.slice(9)];
const artifacts = new URL("../artifacts/generated-plan-art/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const state = createReturningUserFixture(1);
const today = weekday();
const day =
  state.program.days.find((candidate) => candidate.weekday === today) ||
  state.program.days[0];
const previousDay = day.weekday;
day.weekday = today;
day.name = "Generated illustration audit";
const source = structuredClone(day.exercises[0]);
const exercisesFor = (ids) =>
  ids.map((exerciseId, exerciseIndex) => ({
    ...structuredClone(source),
    id: `generated-art-qa-${exerciseId}`,
    exerciseId,
    sets: source.sets.slice(0, 2).map((set, setIndex) => ({
      ...set,
      id: `generated-art-qa-${exerciseIndex}-${setIndex}`,
    })),
  }));
day.exercises = exercisesFor(exerciseGroups[0]);
day.estimatedMinutes = estimateSessionMinutes(day.exercises);
state.program.rotationStartDate = null;
state.program.source = "ai-import";
state.profile.availableDays = state.profile.availableDays.map((value) =>
  value === previousDay ? today : value,
);
state.profile.showExerciseImages = true;
state.profile.themePreference = "dark";
state.profile.sessionMinutes = 180;
state.selectedDay = today;
state.selectedDate = isoDay();
state.activeWorkout = null;
state.workouts = [];

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  // Tall mobile-width viewport keeps the fixed bottom navigation below the
  // artwork audit rows instead of covering the middle of a full-page capture.
  viewport: { width: 390, height: 1200 },
  serviceWorkers: "block",
});
await context.addInitScript(
  (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
  state,
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
for (const [groupIndex, ids] of exerciseGroups.entries()) {
  if (groupIndex) {
    day.exercises = exercisesFor(ids);
    day.estimatedMinutes = estimateSessionMinutes(day.exercises);
    await page.addInitScript(
      (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
      state,
    );
    await page.reload({ waitUntil: "networkidle" });
  }
  const rows = page.locator(".today-screen .exercise-list-row");
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(
    await rows.count(),
    ids.length,
    await page.locator("body").innerText(),
  );
  for (const exerciseId of ids) {
    const name = exerciseCatalog[exerciseId].name;
    const row = rows.filter({ hasText: name });
    assert.equal(
      await row.locator("img").count(),
      0,
      `${name} remains text-only in the generated-plan overview`,
    );
    await row.click();
    assert.equal(
      await page.locator(".exercise-detail-art").count(),
      1,
      `${name} keeps its generated-plan illustration in detail`,
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.screenshot({
    path: fileURLToPath(
      new URL(`generated-gaps-${groupIndex + 1}-dark-390.png`, artifacts),
    ),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.screenshot({
    path: fileURLToPath(
      new URL(`generated-gaps-${groupIndex + 1}-light-390.png`, artifacts),
    ),
    fullPage: true,
  });
}
assert.deepEqual(errors, []);
await browser.close();
console.log(`Generated-plan overview/detail artwork QA passed for ${exerciseIds.length} exercises.`);
