import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  estimateSessionMinutes,
  exerciseCatalog,
  isExerciseAllowed,
  isoDay,
  startWorkout,
  validateProgram,
  weekday,
} from "../src/domain.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const artifactRoot = new URL("../artifacts/today-exercise-edit/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));

function fixture(theme = "light") {
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
    themePreference: theme,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.themePreference === "light" ? "light" : "dark",
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    state,
  );
  await context.addInitScript(() => {
    window.__rookHaptics = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern) => {
        window.__rookHaptics.push(pattern);
        return true;
      },
    });
  });
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
  await page.goto(`http://127.0.0.1:4173/?exercise-edit=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  return { context, page, errors };
}

for (const testCase of [
  { theme: "light", width: 320, height: 700 },
  { theme: "dark", width: 390, height: 700 },
  { theme: "premium", width: 390, height: 844 },
]) {
  const state = fixture(testCase.theme);
  const sourceWorkout = state.program.days.find((day) => day.weekday === weekday());
  const { context, page, errors } = await open(state, testCase);
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();

  assert.equal(
    await page.locator(".today-exercise-options").count(),
    0,
    `${testCase.theme}: normal rows have no permanent overflow menus`,
  );
  assert.equal(await page.locator(".today-exercise-drag-handle").count(), 0);
  assert.equal(await page.locator(".today-exercise-remove").count(), 0);
  await page.locator(".exercise-list-row").first().click();
  assert.equal(await page.locator(".detail-screen").count(), 1);
  await page.getByRole("button", { name: /^Close/ }).click();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await page.getByText("EDIT WORKOUT", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Drag to reorder. Tap × to remove.", { exact: true }).count(), 1);
  assert.equal(await page.locator(".today-start-region").getAttribute("aria-hidden"), "true");
  assert.equal(await page.getByRole("button", { name: "START WORKOUT" }).count(), 0, `${testCase.theme}: start CTA leaves the accessibility tree during editing`);
  assert.equal(await page.locator(".today-exercise-edit-header").evaluate(element => getComputedStyle(element).position), "sticky", `${testCase.theme}: edit exit remains reachable on long lists`);
  assert.equal(
    await page.locator(".today-exercise-drag-handle").count(),
    sourceWorkout.exercises.length,
  );
  assert.equal(
    await page.locator(".today-exercise-remove").count(),
    sourceWorkout.exercises.length,
  );
  const handleBox = await page.locator(".today-exercise-drag-handle").first().boundingBox();
  const removeBox = await page.locator(".today-exercise-remove").first().boundingBox();
  assert.ok(handleBox.width >= 44 && handleBox.height >= 44);
  assert.ok(removeBox.width >= 44 && removeBox.height >= 44);
  if (testCase.theme === "premium") {
    const semanticColors = await page.evaluate(() => ({
      edit: getComputedStyle(document.querySelector(".today-exercise-edit-toggle")).color,
      remove: getComputedStyle(document.querySelector(".today-exercise-remove")).color,
      premiumAccent: getComputedStyle(document.querySelector(".today-start-button")).backgroundColor,
    }));
    assert.notEqual(semanticColors.edit, semanticColors.premiumAccent);
    assert.notEqual(semanticColors.remove, semanticColors.premiumAccent);
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    `${testCase.theme}: edit controls do not overflow the viewport`,
  );
  await page.screenshot({
    path: output(`${testCase.width}-${testCase.theme}-edit-mode.png`),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.locator(".today-exercise-drag-handle").count(), 0);
  assert.equal(await page.locator(".today-exercise-remove").count(), 0);
  assert.equal(await page.getByText("TODAY'S EXERCISES", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "START WORKOUT" }).count(), 1, `${testCase.theme}: start CTA returns after Done`);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture();
  const sourceWorkout = state.program.days.find((day) => day.weekday === weekday());
  const originalOrder = sourceWorkout.exercises.map((exercise) => exercise.id);
  const originalTemplate = structuredClone(sourceWorkout.exercises);
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator(".today-start-region").evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });

  const rows = page.locator(".today-exercise-edit-row");
  const noOpSourceHandle = rows.first().locator(".today-exercise-drag-handle");
  const noOpSourceBox = await noOpSourceHandle.boundingBox();
  const noOpTargetBox = await rows.nth(1).boundingBox();
  await page.mouse.move(noOpSourceBox.x + noOpSourceBox.width / 2, noOpSourceBox.y + noOpSourceBox.height / 2);
  await page.mouse.down();
  await page.locator(".today-reorder-preview").waitFor();
  await page.mouse.move(noOpTargetBox.x + 20, noOpTargetBox.y + noOpTargetBox.height - 2);
  await page.waitForTimeout(20);
  await page.mouse.move(noOpSourceBox.x + 20, noOpSourceBox.y + 2);
  await page.waitForTimeout(20);
  await page.mouse.up();
  await page.locator(".today-reorder-preview").waitFor({ state: "detached" });
  assert.deepEqual(
    await rows.evaluateAll((items) => items.map((item) => item.dataset.entryId)),
    originalOrder,
    "returning a dragged exercise to its original position keeps the order unchanged",
  );
  assert.equal(await page.getByRole("button", { name: "UNDO" }).count(), 0, "a net no-op reorder does not show an update notice");
  const storedAfterNoOp = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(
    storedAfterNoOp.workoutOccurrenceOverrides?.[isoDay()]?.[sourceWorkout.id],
    undefined,
    "a net no-op reorder does not persist an occurrence override",
  );

  const sourceHandle = rows.first().locator(".today-exercise-drag-handle");
  const targetRow = rows.nth(1);
  await sourceHandle.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.locator(".today-reorder-preview").waitFor();
  assert.equal(await page.locator(".today-reorder-preview").count(), 1, "pickup creates one lifted drag preview");
  await page.waitForTimeout(170);
  assert.ok(Number(await page.locator(".today-exercise-edit-row.is-dragging").evaluate(element => getComputedStyle(element).opacity)) <= .1, "source becomes a quiet insertion placeholder while dragging");
  await page.mouse.move(targetBox.x + 20, targetBox.y + targetBox.height - 2);
  await page.waitForTimeout(20);
  assert.ok(
    await page.locator(".today-exercise-edit-row:not(.is-dragging)").evaluateAll(
      (items) => items.some((element) => element.getAnimations().length > 0),
    ),
    "neighboring row animates into its new position",
  );
  assert.notEqual(await page.locator(".today-reorder-preview").evaluate(element => getComputedStyle(element).transform), "none", "drag preview follows the pointer with a transform");
  await page.screenshot({
    path: output("390-light-reorder-active.png"),
    fullPage: false,
  });
  await page.mouse.up();
  await page.locator(".today-reorder-preview").waitFor({ state: "detached" });
  const reordered = await rows.evaluateAll((items) => items.map((item) => item.dataset.entryId));
  assert.notDeepEqual(reordered, originalOrder, "drag handle reorders the selected occurrence");
  const storedAfterReorder = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.deepEqual(
    storedAfterReorder.workoutOccurrenceOverrides[isoDay()][sourceWorkout.id].orderedEntryIds,
    reordered,
    "reorder persists immediately as a date-specific override",
  );
  assert.deepEqual(
    storedAfterReorder.program.days.find((day) => day.id === sourceWorkout.id).exercises,
    originalTemplate,
    "Today reordering does not silently change future recurring workouts",
  );
  assert.ok(await page.evaluate(() => window.__rookHaptics.length >= 2), "pickup and drop provide supported haptic feedback");
  await page.getByRole("button", { name: "UNDO" }).click();
  await page.waitForTimeout(50);
  assert.deepEqual(
    await rows.evaluateAll((items) => items.map((item) => item.dataset.entryId)),
    originalOrder,
    "undo restores the visible and persisted order",
  );

  const firstName = await rows.first().locator(".today-exercise-edit-copy strong").innerText();
  await rows.first().locator(".today-exercise-remove").click();
  assert.equal(
    await page.getByRole("heading", { name: `Remove ${firstName}?`, exact: true }).count(),
    1,
  );
  const dateLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${isoDay()}T12:00:00`));
  assert.equal(
    await page.getByRole("button", { name: new RegExp(`Remove from ${dateLabel}`) }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("button", { name: new RegExp(`Remove from ${sourceWorkout.name}`) }).count(),
    1,
  );
  await page.screenshot({
    path: output("390-light-removal-scopes.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: new RegExp(`Remove from ${dateLabel}`) }).click();
  await page.getByRole("button", { name: "UNDO" }).waitFor();
  assert.equal(await rows.count(), originalOrder.length - 1);
  assert.equal(
    await page.evaluate((workoutId) => JSON.parse(localStorage.getItem("lift-v2-state")).program.days.find((day) => day.id === workoutId).exercises.length, sourceWorkout.id),
    originalOrder.length,
  );
  await page.getByRole("button", { name: "UNDO" }).click();
  await page.waitForTimeout(50);
  assert.equal(await rows.count(), originalOrder.length);

  await rows.first().locator(".today-exercise-remove").click();
  await page.getByRole("button", { name: new RegExp(`Remove from ${sourceWorkout.name}`) }).click();
  await page.getByRole("button", { name: "REMOVE FROM PLAN" }).click();
  await page.getByRole("button", { name: "UNDO" }).waitFor();
  assert.equal(
    await page.evaluate((workoutId) => JSON.parse(localStorage.getItem("lift-v2-state")).program.days.find((day) => day.id === workoutId).exercises.length, sourceWorkout.id),
    originalOrder.length - 1,
  );
  await page.getByRole("button", { name: "UNDO" }).click();
  await page.waitForTimeout(50);
  assert.equal(await rows.count(), originalOrder.length);

  await page.getByRole("button", { name: "COACH", exact: true }).click();
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  assert.equal(await page.locator(".today-exercise-drag-handle").count(), 0, "edit mode does not persist across navigation");
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture();
  state.program.source = "ai-import";
  state.program.userEdited = true;
  // Rotation can map today's calendar slot to either program template. Make
  // both templates long so this remains a stable long-list interaction test.
  state.program.days.forEach((workout) => {
    const originals = structuredClone(workout.exercises);
    const occupied = new Set(workout.exercises.map((entry) => entry.exerciseId));
    const candidates = Object.values(exerciseCatalog).filter(
      (exercise) => !occupied.has(exercise.id) && isExerciseAllowed(exercise, state.profile),
    );
    while (workout.exercises.length < 13) {
      const source = originals[workout.exercises.length % originals.length];
      const exercise = candidates.shift();
      assert.ok(exercise, "long-list fixture has enough eligible unique exercises");
      const nextIndex = workout.exercises.length;
      workout.exercises.push({
        ...structuredClone(source),
        id: `${workout.id}-long-${nextIndex}`,
        exerciseId: exercise.id,
        restSeconds: exercise.restSeconds,
        defaultIncrement: exercise.increment,
        sets: source.sets.map((set, setIndex) => ({
          ...structuredClone(set),
          id: `${workout.id}-long-${nextIndex}-set-${setIndex}`,
        })),
      });
    }
    workout.estimatedMinutes = estimateSessionMinutes(workout.exercises);
  });
  assert.deepEqual(
    validateProgram(state.program, { ...state.profile, sessionMinutes: null }, { ignoreTrainingSafety: true }).errors,
    [],
    "long-list fixture remains a valid imported plan",
  );
  const { context, page, errors } = await open(state, { width: 390, height: 600 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await page.locator(".today-exercise-edit-row").count(), 13, "13-exercise fixture renders the complete long list");
  const firstHandle = page.locator(".today-exercise-drag-handle").first();
  await firstHandle.scrollIntoViewIfNeeded();
  const handleBox = await firstHandle.boundingBox();
  const beforeScroll = await page.evaluate(() => document.scrollingElement.scrollTop);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, 526);
  await page.waitForTimeout(550);
  const afterScroll = await page.evaluate(() => document.scrollingElement.scrollTop);
  assert.ok(afterScroll > beforeScroll, "12+ exercise drag auto-scrolls near the viewport bottom");
  await page.mouse.up();
  await page.locator(".today-reorder-preview").waitFor({ state: "detached" });
  assert.equal(await page.locator(".today-exercise-edit-row").count(), 13);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture();
  const todayWorkout = state.program.days.find((day) => day.weekday === weekday());
  state.activeWorkout = startWorkout(state, todayWorkout);
  state.activeWorkout.exercises[0].sets[0].completed = true;
  const activeExerciseIds = state.activeWorkout.exercises.map((exercise) => exercise.id);
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "RESUME WORKOUT" }).waitFor();
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  assert.equal(await edit.isDisabled(), true, "active workout structural editing is visibly locked");
  assert.match(await page.locator(".today-edit-lock-note").innerText(), /Finish the active workout/);
  assert.equal(await page.locator(".today-exercise-drag-handle").count(), 0);
  assert.equal(await page.locator(".today-exercise-remove").count(), 0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.deepEqual(
    stored.activeWorkout.exercises.map((exercise) => exercise.id),
    activeExerciseIds,
    "active workout exercise order remains untouched",
  );
  assert.equal(
    stored.activeWorkout.exercises[0].sets[0].completed,
    true,
    "completed sets remain untouched",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log("Today exercise editing QA passed: clean normal rows, explicit edit mode, direct drag/remove controls, concrete scopes, occurrence-only reorder, undo, navigation reset, themes, and active-workout safety are correct.");
