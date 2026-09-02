import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture() {
  const state = blankState();
  const today = weekday();
  const other = WEEKDAYS[(WEEKDAYS.indexOf(today) + 2) % 7];
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: [today, other],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  return state;
}

async function open(state) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) =>
      localStorage.setItem("lift-v2-state", JSON.stringify(value)),
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
      body: JSON.stringify({ available: false }),
    }),
  );
  await page.goto(`http://127.0.0.1:4173/?exercise-actions=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  return { context, page, errors };
}

{
  const state = fixture();
  const sourceWorkout = state.program.days.find(
    (day) => day.weekday === weekday(),
  );
  const sourceCount = sourceWorkout.exercises.length;
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  assert.equal(
    await page.locator(".today-exercise-options").count(),
    0,
    "contextual actions do not add a repeated visual control to every row",
  );
  assert.equal(
    await page.locator(".exercise-preview .navigation-chevron").count(),
    0,
    "Today rows do not repeat a detail chevron",
  );
  assert.equal(
    await page.locator('.exercise-list-row[aria-keyshortcuts]').count(),
    sourceCount,
    "planned rows expose their context-menu shortcut semantically",
  );

  const firstRow = page.locator(".exercise-list-row").first();
  await firstRow.click();
  assert.equal(
    await page.locator(".detail-screen").count(),
    1,
    "normal tap still opens exercise detail",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".detail-screen").waitFor({ state: "detached" });

  const holdTarget = page.locator(".exercise-list-row").first();
  const box = await holdTarget.boundingBox();
  await holdTarget.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    button: 0,
    clientX: box.x + 20,
    clientY: box.y + 20,
  });
  await page.waitForTimeout(540);
  await holdTarget.dispatchEvent("pointerup", {
    pointerId: 7,
    pointerType: "touch",
    button: 0,
    clientX: box.x + 20,
    clientY: box.y + 20,
  });
  assert.equal(
    await page.locator(".today-exercise-actions-sheet").count(),
    1,
    "500ms long press opens the action sheet",
  );
  assert.equal(
    await page.locator(".detail-screen").count(),
    0,
    "release after long press does not also navigate to detail",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator(".exercise-list-row").first().click({ button: "right" });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Remove from today/i }).click();
  await page.getByRole("button", { name: "UNDO" }).waitFor();
  assert.equal(
    await page.locator(".exercise-list-row").count(),
    sourceCount - 1,
    "occurrence removal affects only today's resolved workout",
  );
  assert.equal(
    await page.evaluate((workoutId) => {
      const saved = JSON.parse(localStorage.getItem("lift-v2-state"));
      return saved.program.days.find((day) => day.id === workoutId).exercises
        .length;
    }, sourceWorkout.id),
    sourceCount,
    "occurrence removal does not mutate the weekly template",
  );
  await page.getByRole("button", { name: "UNDO" }).click();
  assert.equal(await page.locator(".exercise-list-row").count(), sourceCount);

  await page.locator(".exercise-list-row").first().click({ button: "right" });
  await page.waitForTimeout(250);
  await page
    .getByRole("button", { name: /Remove from weekly plan/i })
    .click();
  await page.getByRole("button", { name: "REMOVE FROM PLAN" }).click();
  await page.getByRole("button", { name: "UNDO" }).waitFor();
  assert.equal(
    await page.evaluate((workoutId) => {
      const saved = JSON.parse(localStorage.getItem("lift-v2-state"));
      return saved.program.days.find((day) => day.id === workoutId).exercises
        .length;
    }, sourceWorkout.id),
    sourceCount - 1,
    "weekly removal is confirmed and targets the recurring entry",
  );
  await page.getByRole("button", { name: "UNDO" }).click();
  assert.equal(await page.locator(".exercise-list-row").count(), sourceCount);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture();
  const todayWorkout = state.program.days.find((day) => day.weekday === weekday());
  state.workoutOccurrenceOverrides = {
    [isoDay()]: {
      [todayWorkout.id]: {
        excludedEntryIds: todayWorkout.exercises.slice(1).map((entry) => entry.id),
      },
    },
  };
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  await page.locator(".exercise-list-row").click({ button: "right" });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Remove from today/i }).click();
  await page.getByRole("heading", { name: /Skip today’s workout/ }).waitFor();
  await page.getByRole("button", { name: "SKIP WORKOUT" }).click();
  await page.getByRole("heading", { name: "Rest day" }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lift-v2-state")).workouts.length,
    ),
    0,
    "skipping the final exercise does not create fake completion credit",
  );
  await page.getByRole("button", { name: "UNDO" }).click();
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture();
  const todayWorkout = state.program.days.find((day) => day.weekday === weekday());
  state.activeWorkout = startWorkout(state, todayWorkout);
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "RESUME WORKOUT" }).waitFor();
  assert.equal(
    await page.locator(".today-exercise-options").count(),
    0,
    "running workout rows do not expose structural removal actions",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Today exercise actions QA passed: tap, long press, scoped removal, confirmation, undo, final-exercise skip, and active-workout locking are correct.",
);
