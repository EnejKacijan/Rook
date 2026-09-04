import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  exerciseCatalog,
  exerciseName,
  isoDay,
  targetLabel,
  weekday,
} from "../src/domain.js";

const outputRoot = new URL("../artifacts/exercise-history/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function ensureWorkoutToday(state) {
  const today = weekday();
  const scheduled = state.program.days.find((day) => day.weekday === today);
  if (!scheduled) {
    const day = state.program.days[0];
    const replaced = day.weekday;
    day.weekday = today;
    state.profile.availableDays = state.profile.availableDays.map((value) =>
      value === replaced ? today : value,
    );
  }
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.program.rotationStartDate = null;
}

function fixture() {
  const state = createReturningUserFixture(0);
  ensureWorkoutToday(state);
  const day = state.program.days.find((value) => value.weekday === weekday());
  const exercise = day.exercises.find((value) => {
    const item = exerciseCatalog[value.exerciseId];
    return !item?.bodyweight && item?.measure !== "seconds" && item?.artId;
  });
  assert.ok(exercise, "fixture has a load-based exercise");
  state.workouts = [];
  return { state, exercise };
}

async function openDetail(state, exercise, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
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
  await page
    .locator(".exercise-preview .list-row")
    .filter({ hasText: exerciseName(exercise) })
    .first()
    .click();
  await page
    .locator(".detail-header strong")
    .filter({ hasText: exerciseName(exercise) })
    .waitFor();
  return { context, page, errors };
}

{
  const { state, exercise } = fixture();
  const { context, page, errors } = await openDetail(state, exercise);
  const sheet = page.locator(".detail-screen");
  await page.getByText("FIRST SESSION", { exact: true }).waitFor();
  assert.match(await sheet.innerText(), /No history yet\./);
  assert.match(
    await sheet.innerText(),
    /Choose a comfortable starting load when you begin your first set\./,
  );
  assert.match(
    await sheet.innerText(),
    new RegExp(`Target · ${targetLabel(exercise, state.profile.rirEnabled)}`),
  );
  assert.match(
    await sheet.innerText(),
    /Complete this exercise to start its history\./,
  );
  await page.screenshot({ path: output("390-first-session.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { state, exercise } = fixture();
  state.workouts = [
    {
      programId: "previous-plan",
      completedAt: "2026-08-20T12:00:00.000Z",
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: [8, 8, 8].map((reps) => ({
            completed: true,
            reps,
            weight: null,
            rir: null,
          })),
        },
      ],
    },
  ];
  state.program.id = "current-plan";
  const { context, page, errors } = await openDetail(state, exercise);
  const sheet = page.locator(".detail-screen");
  assert.match(await sheet.innerText(), /TRAINING HISTORY/);
  assert.match(await sheet.innerText(), /Weight not logged/);
  assert.match(await sheet.innerText(), /8 \/ 8 \/ 8 reps/);
  assert.doesNotMatch(await sheet.innerText(), /CURRENT WORKING WEIGHT/);
  assert.match(await sheet.innerText(), /Aug 20/);
  await page.screenshot({ path: output("390-history-without-weight.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { state, exercise } = fixture();
  state.workouts = [
    {
      programId: "previous-plan",
      completedAt: "2026-08-12T12:00:00.000Z",
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: [8, 8, 7].map((reps) => ({
            completed: true,
            reps,
            weight: 80,
            rir: 2,
          })),
        },
      ],
    },
    {
      programId: "current-plan",
      completedAt: "2026-08-26T12:00:00.000Z",
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: [{ completed: true, reps: 8, weight: null, rir: null }],
        },
      ],
    },
  ];
  state.program.id = "replacement-plan";
  const { context, page, errors } = await openDetail(state, exercise, 320);
  const sheet = page.locator(".detail-screen");
  assert.match(await sheet.innerText(), /CURRENT WORKING WEIGHT/);
  assert.match(await sheet.innerText(), /80 kg/);
  assert.match(await sheet.innerText(), /8 \/ 8 \/ 7 reps · 2 RIR/);
  assert.match(await sheet.innerText(), /Weight not logged/);
  assert.equal(await sheet.locator(".exercise-detail-art").count(), 1);
  const artButton = sheet.getByRole("button", { name: /View .* illustration/ });
  assert.equal(await artButton.count(), 1, "exercise history artwork is tappable");
  await artButton.click();
  const visualViewer = page.locator(".exercise-visual-viewer");
  await visualViewer.waitFor();
  await page.waitForTimeout(240);
  const viewerBox = await visualViewer.boundingBox();
  assert.equal(viewerBox.y, 0, "history artwork opens at the top of the viewport");
  assert.equal(viewerBox.height, 844, "history artwork uses the full mobile viewport");
  await page.screenshot({ path: output("320-working-weight-visual-viewer.png") });
  await visualViewer.getByRole("button", { name: "Close visual viewer" }).click();
  await visualViewer.waitFor({ state: "detached" });
  await sheet.waitFor();
  await page.waitForTimeout(50);
  assert.match(await sheet.innerText(), /CURRENT WORKING WEIGHT/);
  assert.equal(
    await artButton.evaluate((node) => document.activeElement === node),
    true,
    "closing the viewer returns to exercise history and restores thumbnail focus",
  );
  const overview = await sheet.locator(".exercise-detail-overview").evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  assert.ok(overview.scrollWidth <= overview.clientWidth, JSON.stringify(overview));
  await page.screenshot({ path: output("320-working-weight-global-history.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Exercise history QA passed: first session, reps-only history, working-weight history across plans, compact rows, target copy, illustration, and narrow layout.",
);
