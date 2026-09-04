import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { exerciseCatalog, isoDay, startWorkout, weekday } from "../src/domain.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";

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
  await page.goto(appUrl, { waitUntil: "networkidle" });
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
  const anotherDayLabel = await anotherDay.getAttribute("aria-label");
  assert.notEqual(await activeTransform(todayRun.page, anotherDay), "none", `${theme} day cards feel physically pressed`);
  await todayRun.page.getByRole("button", { name: anotherDayLabel }).click();
  assert.equal(
    await todayRun.page.getByRole("button", { name: anotherDayLabel }).getAttribute("aria-pressed"),
    "true",
    `${theme} day selection switches immediately after the tactile press`,
  );
  assert.equal(await todayRun.page.locator(".day-selection-trace").count(), 0, `${theme} avoids rotating border decoration`);

  await todayRun.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await todayRun.page.getByRole("button", { name: /Logging & increments/ }).click();
  const units = todayRun.page.locator(".unit-segmented");
  assert.equal(
    await units.evaluate((node) => getComputedStyle(node, "::before").transitionDuration),
    "0.18s",
    `${theme} units use the shared 180ms sliding indicator`,
  );
  await todayRun.page.getByRole("button", { name: "lb", exact: true }).click();
  await todayRun.page.waitForTimeout(25);
  assert.equal(
    await todayRun.page.getByRole("button", { name: "lb", exact: true }).getAttribute("aria-pressed"),
    "true",
    `${theme} unit semantics update immediately`,
  );
  assert.match(
    await todayRun.page.locator(".increments-heading").textContent(),
    /LB/,
    `${theme} dependent copy updates with the selected unit`,
  );
  assert.equal(
    await todayRun.page.locator(".unit-dependent-values").evaluate((node) => getComputedStyle(node).animationName),
    "rook-unit-values-in",
    `${theme} converted values use one restrained fade`,
  );
  await todayRun.page.getByRole("button", { name: /^Close/ }).click();
  await todayRun.page.getByRole("button", { name: /Edit plan/ }).click();
  const firstEditor = todayRun.page.locator(".plan-editor-summary").first();
  await firstEditor.click();
  await todayRun.page.waitForTimeout(35);
  assert.equal(
    await firstEditor.getAttribute("aria-expanded"),
    "true",
    `${theme} exercise editor opens semantically during the spatial transition`,
  );
  assert.equal(
    await todayRun.page.locator(".plan-editor-fields").count(),
    1,
    `${theme} opens only the selected editor`,
  );
  await todayRun.context.close();

  const workoutRun = await openState(fixture(theme, true));
  await workoutRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
  const addSet = workoutRun.page.getByRole("button", { name: "+ ADD SET" });
  const nextExercise = workoutRun.page.getByRole("button", { name: /NEXT EXERCISE|FINISH WORKOUT/ });
  assert.notEqual(await activeTransform(workoutRun.page, addSet), "none", `${theme} Add Set shares tactile press motion`);
  const setCount = await workoutRun.page.locator(".set-row").count();
  await addSet.click();
  await workoutRun.page.waitForTimeout(35);
  assert.equal(
    await workoutRun.page.locator(".set-row").count(),
    setCount + 1,
    `${theme} Add Set updates the list during the layout transition`,
  );
  const transitionNames = await workoutRun.page.locator(".set-row").evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).viewTransitionName),
  );
  assert.equal(
    new Set(transitionNames).size,
    transitionNames.length,
    `${theme} set rows have stable unique transition identities`,
  );
  await workoutRun.page.waitForTimeout(220);
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
const reducedExerciseName = await reducedRun.page.locator(".exercise-heading h1").textContent();
await reducedRun.page.locator(".up-next button").first().click();
await reducedRun.page.waitForFunction(
  (name) => document.querySelector(".exercise-heading h1")?.textContent !== name,
  reducedExerciseName,
);
assert.equal(
  await reducedRun.page.evaluate(() =>
    document.getAnimations().some((animation) =>
      String(animation.animationName || "").startsWith("rook-exercise-panel-"),
    ),
  ),
  false,
  "reduced motion changes exercises without a traveling panel",
);
await reducedRun.context.close();

const reducedSettings = await openState(fixture("dark"), {
  reducedMotion: "reduce",
});
await reducedSettings.page.getByRole("button", { name: "PROFILE", exact: true }).click();
await reducedSettings.page.getByRole("button", { name: /Logging & increments/ }).click();
assert.equal(
  await reducedSettings.page.locator(".unit-segmented").evaluate(
    (node) => getComputedStyle(node, "::before").transitionDuration,
  ),
  "0s",
  "reduced motion removes the sliding unit transition",
);
await reducedSettings.page.getByRole("button", { name: "lb", exact: true }).click();
await reducedSettings.page.waitForTimeout(25);
assert.equal(
  await reducedSettings.page.locator(".unit-dependent-values").evaluate(
    (node) => getComputedStyle(node).animationName,
  ),
  "none",
  "reduced motion removes the converted-value fade",
);
await reducedSettings.page.evaluate(() => {
  const indicator = document.createElement("div");
  indicator.className = "thinking-dots";
  indicator.innerHTML = "<i></i><i></i><i></i>";
  document.body.append(indicator);
});
assert.equal(
  await reducedSettings.page.locator(".thinking-dots i").first().evaluate(
    (node) => getComputedStyle(node).animationName,
  ),
  "none",
  "reduced motion also stops the repeating Coach thinking animation",
);
await reducedSettings.page.evaluate(() => {
  const completion = document.createElement("main");
  completion.className = "complete-screen";
  completion.innerHTML = '<div class="complete-mark"><span>✓</span></div><h1>Workout complete</h1><div class="stat-grid"><div>Session</div><div>Duration</div><div>Sets</div></div>';
  document.body.append(completion);
});
assert.deepEqual(
  await reducedSettings.page.locator(".complete-screen").evaluate((screen) => ({
    mark: getComputedStyle(screen.querySelector(".complete-mark")).animationName,
    ring: getComputedStyle(screen.querySelector(".complete-mark"), "::after").display,
    heading: getComputedStyle(screen.querySelector("h1")).animationName,
    stats: [...screen.querySelectorAll(".stat-grid > div")].map((item) => getComputedStyle(item).animationName),
  })),
  { mark: "none", ring: "none", heading: "none", stats: ["none", "none", "none"] },
  "reduced motion keeps workout completion immediate and still",
);
await reducedSettings.context.close();

await browser.close();
console.log("Motion QA passed: Light, Dark, and Premium share unit, list, editor, tactile, and completion motion while reduced-motion keeps every state change immediate and still.");
