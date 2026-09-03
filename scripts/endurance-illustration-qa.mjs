import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  estimateSessionMinutes,
  isoDay,
  matchImportedExerciseName,
  weekday,
} from "../src/domain.js";

const artifacts = new URL("../artifacts/endurance-illustrations/", import.meta.url);
await mkdir(artifacts, { recursive: true });

const state = createReturningUserFixture(1);
const today = weekday();
const day =
  state.program.days.find((candidate) => candidate.weekday === today) ||
  state.program.days[0];
const previousDay = day.weekday;
day.weekday = today;
day.name = "Endurance & stability";
state.profile.availableDays = state.profile.availableDays.map((value) =>
  value === previousDay ? today : value,
);
state.profile.showExerciseImages = true;
state.profile.themePreference = "dark";
state.profile.sessionMinutes = 90;
state.selectedDay = today;
state.selectedDate = isoDay();
state.program.rotationStartDate = null;
state.program.source = "ai-import";

const names = [
  "BOSU Balance",
  "Y Balance Reach",
  "Monster Walk",
  "Pogo Jumps",
  "Lateral Skater Hops",
  "Forward Single-Leg Hops",
  "Single-Leg Sit-to-Stand",
];
const base = day.exercises[0];
day.exercises = names.map((name, index) => {
  const exercise = structuredClone(base);
  const recognized = matchImportedExerciseName(name);
  exercise.id = `qa-endurance-${index + 1}`;
  exercise.exerciseId =
    recognized.exerciseId || `imported-custom-endurance-${index + 1}`;
  exercise.originalImportedName = name;
  exercise.importedName = name;
  exercise.importedExercise = {
    id: exercise.exerciseId,
    name,
    source: "imported",
    pattern: null,
    muscles: null,
    equipment: null,
  };
  exercise.matchStatus = recognized.status;
  exercise.sets = exercise.sets.slice(0, 2).map((set, setIndex) => ({
    ...set,
    id: `${exercise.id}-set-${setIndex + 1}`,
  }));
  return exercise;
});
day.estimatedMinutes = estimateSessionMinutes(day.exercises);

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
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

const rows = page.locator(".today-screen .exercise-list-row");
assert.equal(await rows.count(), names.length, await page.locator("body").innerText());
assert.equal(
  await rows.locator("img").count(),
  0,
  "endurance overview rows stay text-first regardless of illustration coverage",
);
assert.equal(await rows.locator(".exercise-thumbnail-slot").count(), 0);

const rowLayout = await rows.evaluateAll((items) =>
  items.map((row) => ({
    titleLeft: Math.round(
      row
        .querySelector(".exercise-row-main > span:last-child")
        .getBoundingClientRect().left,
    ),
  })),
);
assert.equal(new Set(rowLayout.map((item) => item.titleLeft)).size, 1);
await rows.filter({ hasText: "Monster Walk" }).click();
assert.equal(
  await page.locator(".exercise-detail-art").count(),
  1,
  "artwork remains available in the focused exercise detail view",
);
assert.equal(
  await page.getByText(
    "Choose a comfortable starting effort when you begin your first set.",
    { exact: true },
  ).count(),
  1,
  "load-free first-session guidance does not imply a required kg/lb entry",
);
await page.screenshot({
  path: fileURLToPath(new URL("monster-walk-detail-dark.png", artifacts)),
  fullPage: false,
});
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.waitForTimeout(260);
await page.screenshot({
  path: fileURLToPath(new URL("endurance-dark-390.png", artifacts)),
  fullPage: true,
});
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
await page.screenshot({
  path: fileURLToPath(new URL("endurance-light-390.png", artifacts)),
  fullPage: true,
});
assert.deepEqual(errors, []);
await browser.close();
console.log("Endurance overview/detail illustration QA passed.");
