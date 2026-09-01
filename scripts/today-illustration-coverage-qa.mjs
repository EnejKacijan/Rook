import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { estimateSessionMinutes, isoDay, weekday } from "../src/domain.js";

const artifacts = new URL("../artifacts/today-illustration-coverage/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const state = createReturningUserFixture(1);
const today = weekday();
const day =
  state.program.days.find((candidate) => candidate.weekday === today) ||
  state.program.days[0];
const previousDay = day.weekday;
day.weekday = today;
state.profile.availableDays = state.profile.availableDays.map((value) =>
  value === previousDay ? today : value,
);
state.profile.showExerciseImages = true;
state.profile.themePreference = "dark";
state.profile.sessionMinutes = 120;
state.selectedDay = today;
state.selectedDate = isoDay();
state.program.rotationStartDate = null;
state.program.source = "ai-import";
for (const workout of state.program.days) {
  workout.name = "Full Body Strength & Conditioning";
  workout.exercises[0].originalImportedName =
    "Single-Arm Incline Machine Chest Press With Neutral Grip";
  workout.exercises[0].importedName = workout.exercises[0].originalImportedName;
}
day.exercises = day.exercises.slice(0, 1);
const importedPluralExercise = structuredClone(day.exercises[0]);
importedPluralExercise.id = "qa-imported-lateral-raises";
importedPluralExercise.exerciseId = "imported-custom-lateral-raises";
importedPluralExercise.originalImportedName = "Lateral Raises";
importedPluralExercise.importedName = "Lateral Raises";
importedPluralExercise.importedExercise = {
  id: importedPluralExercise.exerciseId,
  name: "Lateral Raises",
  source: "imported",
  pattern: null,
  muscles: null,
  equipment: null,
};
importedPluralExercise.matchStatus = "unresolved";
importedPluralExercise.sets = importedPluralExercise.sets.map((set, index) => ({
  ...set,
  id: `${importedPluralExercise.id}-set-${index + 1}`,
}));
day.exercises.push(importedPluralExercise);
const importedMixedLanguageExercise = structuredClone(day.exercises[0]);
importedMixedLanguageExercise.id = "qa-imported-leg-press-calf-raise";
importedMixedLanguageExercise.exerciseId = "imported-custom-leg-press-calf-raise";
importedMixedLanguageExercise.originalImportedName =
  "Calf Raises na Leg Press mašini";
importedMixedLanguageExercise.importedName =
  importedMixedLanguageExercise.originalImportedName;
importedMixedLanguageExercise.importedExercise = {
  id: importedMixedLanguageExercise.exerciseId,
  name: importedMixedLanguageExercise.importedName,
  source: "imported",
  pattern: null,
  muscles: null,
  equipment: null,
};
importedMixedLanguageExercise.matchStatus = "unresolved";
importedMixedLanguageExercise.sets = importedMixedLanguageExercise.sets.map(
  (set, index) => ({
    ...set,
    id: `${importedMixedLanguageExercise.id}-set-${index + 1}`,
  }),
);
day.exercises.push(importedMixedLanguageExercise);
for (const [exerciseId, label, artId] of [
  ["machine-chest-press", "Machine Chest Press", "wg-machine-chest-press"],
  ["single-arm-cable-row", "Single-Arm Cable Row", "wg-single-arm-cable-row"],
  ["machine-shoulder-press", "Machine Shoulder Press", "wg-machine-shoulder-press"],
  [
    "straight-arm-cable-pulldown",
    "Straight-Arm Cable Pulldown",
    "wg-straight-arm-pulldown",
  ],
  ["lateral-raise", "Lateral Raise", "wg-lateral-raise"],
]) {
  const referenceExercise = structuredClone(day.exercises[0]);
  referenceExercise.id = `qa-reference-${exerciseId}`;
  referenceExercise.exerciseId = exerciseId;
  referenceExercise.qaLabel = label;
  referenceExercise.qaArtId = artId;
  delete referenceExercise.originalImportedName;
  delete referenceExercise.importedName;
  delete referenceExercise.importedExercise;
  delete referenceExercise.matchStatus;
  referenceExercise.sets = referenceExercise.sets.map((set, index) => ({
    ...set,
    id: `${referenceExercise.id}-set-${index + 1}`,
  }));
  day.exercises.push(referenceExercise);
}
const ambiguousBalanceExercise = structuredClone(importedPluralExercise);
ambiguousBalanceExercise.id = "qa-missing-balance";
ambiguousBalanceExercise.exerciseId = "imported-custom-balance";
ambiguousBalanceExercise.originalImportedName = "Ravnotežje";
ambiguousBalanceExercise.importedName = "Ravnotežje";
ambiguousBalanceExercise.importedExercise = {
  ...ambiguousBalanceExercise.importedExercise,
  id: ambiguousBalanceExercise.exerciseId,
  name: "Ravnotežje",
};
ambiguousBalanceExercise.sets = ambiguousBalanceExercise.sets.map(
  (set, index) => ({
    ...set,
    id: `${ambiguousBalanceExercise.id}-set-${index + 1}`,
  }),
);
day.exercises.push(ambiguousBalanceExercise);
day.estimatedMinutes = estimateSessionMinutes(day.exercises);

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 780 },
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
const pageText = await page.locator("body").innerText();
const storedProgram = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lift-v2-state")).program,
);
assert.equal(
  await page.locator(".today-screen .workout-title").count(),
  1,
  pageText,
);
assert.equal(
  await rows.locator("img").count(),
  0,
  "Today overview rows never render artwork",
);
assert.equal(
  await rows.locator(".exercise-thumbnail-slot").count(),
  0,
  "Today overview rows reserve no thumbnail column",
);
assert.equal(
  (await page.locator(".today-screen .workout-title").innerText()).replace(/\s+/g, " "),
  day.name,
  `the intended long workout title is rendered: ${JSON.stringify(
    storedProgram.days.map(({ weekday, name }) => ({ weekday, name })),
  )}; rotation=${storedProgram.rotationStartDate}`,
);
assert.equal(
  await rows.count(),
  day.exercises.length,
  pageText,
);
const illustratedDetailRow = rows.filter({ hasText: "Lateral Raises" });
await illustratedDetailRow.click();
assert.equal(
  await page.locator(".exercise-detail-art").count(),
  1,
  "an imported alias keeps its illustration in exercise detail",
);
await page.getByRole("button", { name: "Close", exact: true }).click();
const wideLayout = await rows.evaluateAll((items) =>
  items.map((row) => {
    const main = row.querySelector(".exercise-row-main").getBoundingClientRect();
    const end = row.querySelector(".navigation-row-end").getBoundingClientRect();
    return {
      centerDelta: Math.abs(main.top + main.height / 2 - (end.top + end.height / 2)),
      prescriptionColor: getComputedStyle(
        row.querySelector(".navigation-row-end"),
      ).color,
    };
  }),
);
assert.ok(
  wideLayout.every((item) => item.centerDelta <= 1),
  "prescriptions remain vertically centered",
);
assert.ok(
  wideLayout.every((item) => item.prescriptionColor === "rgb(177, 174, 165)"),
  "dark prescriptions use the readable secondary text token",
);
const workoutTitle = page.locator(".today-screen .workout-title");
const titleMetrics = await workoutTitle.evaluate((element) => ({
  scrollWidth: element.scrollWidth,
  clientWidth: element.clientWidth,
  height: element.getBoundingClientRect().height,
  lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
}));
assert.ok(titleMetrics.scrollWidth <= titleMetrics.clientWidth + 1, "workout title does not overflow");
assert.ok(titleMetrics.height <= titleMetrics.lineHeight * 2.2, "workout title remains within two lines");
await page.screenshot({
  path: fileURLToPath(new URL("mixed-coverage-dark-390.png", artifacts)),
  fullPage: true,
});
await page.setViewportSize({ width: 320, height: 760 });
const layout = await rows.evaluateAll((items) =>
  items.map((row) => {
    const title = row.querySelector(".exercise-row-main > span:last-child");
    const end = row.querySelector(".navigation-row-end");
    const titleBox = title.getBoundingClientRect();
    const endBox = end.getBoundingClientRect();
    return {
      titleLeft: Math.round(titleBox.left),
      prescriptionBelow: endBox.top >= titleBox.bottom,
      imageCount: row.querySelectorAll("img").length,
      thumbnailCount: row.querySelectorAll(".exercise-thumbnail-slot").length,
    };
  }),
);
assert.equal(new Set(layout.map((item) => item.titleLeft)).size, 1, "titles align");
assert.ok(
  layout.every((item) => item.imageCount === 0 && item.thumbnailCount === 0),
  "canonical, imported, and custom overview rows share the same text-only structure",
);
assert.ok(
  layout.every((item) => item.prescriptionBelow),
  "narrow overview rows prioritize the title and move prescriptions below it",
);
await page.screenshot({
  path: fileURLToPath(new URL("mixed-coverage-320.png", artifacts)),
  fullPage: true,
});
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
assert.equal(await rows.locator("img").count(), 0);
await page.screenshot({
  path: fileURLToPath(new URL("mixed-coverage-light-320.png", artifacts)),
  fullPage: true,
});
assert.deepEqual(errors, []);
await browser.close();
console.log("Today illustration coverage QA passed.");
