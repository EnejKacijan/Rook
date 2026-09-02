import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  exerciseCatalog,
  isExerciseGloballyBlocked,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const root = new URL("../artifacts/active-workout-clarity/", import.meta.url);
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
await mkdir(root, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, root));
const today = weekday();
const days = [today, ...WEEKDAYS.filter((day) => day !== today).slice(0, 3)];

function fixture() {
  const state = blankState();
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
    rirEnabled: true,
    restTimerEnabled: false,
    recommendedWarmupsEnabled: false,
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  const day = state.program.days.find((item) => item.weekday === today);
  state.activeWorkout = startWorkout(state, day);
  state.activeWorkout.name = "Single-Arm Performance Strength Workout With A Long Imported Name";
  state.activeWorkout.exercises.sort(
    (left, right) =>
      Number(Boolean(exerciseCatalog[right.exerciseId]?.artId)) -
      Number(Boolean(exerciseCatalog[left.exerciseId]?.artId)),
  );
  const originals = [...state.activeWorkout.exercises];
  const usedExerciseIds = new Set(originals.map((exercise) => exercise.exerciseId));
  const additionalCatalog = Object.values(exerciseCatalog).filter(
    (item) =>
      !usedExerciseIds.has(item.id) &&
      item.id !== "single-leg-leg-extension" &&
      !isExerciseGloballyBlocked(item),
  );
  while (state.activeWorkout.exercises.length < 10) {
    const copy = structuredClone(
      originals[state.activeWorkout.exercises.length % originals.length],
    );
    copy.id = `qa-exercise-${state.activeWorkout.exercises.length}`;
    copy.exerciseId = additionalCatalog.shift().id;
    delete copy.originalImportedName;
    delete copy.importedName;
    copy.sets = copy.sets
      .slice(0, 2 + (state.activeWorkout.exercises.length % 4))
      .map((set, index) => ({ ...set, id: `${copy.id}-set-${index}` }));
    while (copy.sets.length < 2 + (state.activeWorkout.exercises.length % 4))
      copy.sets.push({
        ...structuredClone(copy.sets.at(-1)),
        id: `${copy.id}-set-${copy.sets.length}`,
      });
    state.activeWorkout.exercises.push(copy);
  }
  for (const exercise of state.activeWorkout.exercises)
    delete exercise.supersetId;
  state.activeWorkout.exerciseIndex = Math.min(
    1,
    state.activeWorkout.exercises.length - 1,
  );
  state.activeWorkout.exercises[1].notes = "Seat at setting 4";
  state.activeWorkout.exercises[1].originalImportedName =
    "Single-Arm Incline Cable Lateral Raise With Extended Range of Motion";
  state.activeWorkout.exercises[1].importedName =
    state.activeWorkout.exercises[1].originalImportedName;
  state.activeWorkout.exercises[2].exerciseId = "single-leg-leg-extension";
  state.activeWorkout.exercises[2].originalImportedName =
    "Single-Leg Leg Extension (curl mašina";
  state.activeWorkout.exercises[2].importedName =
    state.activeWorkout.exercises[2].originalImportedName;
  state.activeWorkout.exercises[3].originalImportedName =
    "Single-Arm Incline Machine Chest Press With Neutral Grip";
  state.activeWorkout.exercises[3].importedName =
    state.activeWorkout.exercises[3].originalImportedName;
  for (const exercise of state.activeWorkout.exercises)
    for (const set of exercise.sets) {
      set.weight = null;
      set.rir = null;
      set.completed = false;
    }
  return state;
}

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript(
  (state) => localStorage.setItem("lift-v2-state", JSON.stringify(state)),
  fixture(),
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
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "RESUME WORKOUT" }).click();

const heading = page.locator(".exercise-heading");
const art = heading.locator(".exercise-heading-art-button");
assert.equal(await art.count(), 1, "active logging retains the compact exercise artwork");
assert.equal(
  await heading.locator(".exercise-user-note").innerText(),
  "Seat at setting 4",
  "the current exercise keeps its user note secondary to its canonical title",
);
const [artBox, toplineBox, heroBox, replaceBox, optionsBox] = await Promise.all([
  art.boundingBox(),
  heading.locator(".exercise-heading-topline").boundingBox(),
  heading.boundingBox(),
  page.getByRole("button", { name: "Replace", exact: true }).boundingBox(),
  page.getByRole("button", { name: "Exercise options" }).boundingBox(),
]);
assert.ok(artBox.x + artBox.width <= toplineBox.x + 1);
assert.ok(replaceBox.y >= toplineBox.y && optionsBox.y >= toplineBox.y);
assert.ok(heroBox.width > 280, "long narrow titles receive the full hero width below the artwork row");
const replaceAction = page.getByRole("button", { name: "Replace", exact: true });
assert.equal(await replaceAction.isEnabled(), true);
assert.equal(
  await replaceAction.evaluate((node) => getComputedStyle(node).color),
  "rgb(35, 110, 81)",
  "enabled Replace remains secondary but clearly actionable in light mode",
);
const activeStateBeforeViewer = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout,
);
await art.click();
const visualViewer = page.locator(".exercise-visual-viewer");
await visualViewer.waitFor();
assert.equal(
  await visualViewer.getByRole("heading", { name: /Single-Arm Incline Cable Lateral Raise/ }).count(),
  1,
  "the visual viewer keeps the exercise identity",
);
assert.equal(
  await page.getByText("No history yet.", { exact: true }).count(),
  0,
  "tapping artwork no longer opens exercise history",
);
const viewerArtBox = await visualViewer.locator(".exercise-visual-stage img").boundingBox();
assert.ok(
  viewerArtBox.width >= artBox.width * 3 && viewerArtBox.height >= artBox.height * 3,
  "the dedicated viewer makes the existing artwork meaningfully larger",
);
await page.getByRole("button", { name: "Close visual viewer" }).click();
await visualViewer.waitFor({ state: "detached" });
assert.deepEqual(
  await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout),
  activeStateBeforeViewer,
  "opening and closing artwork preserves every persisted workout field",
);
await page.getByRole("button", { name: "Exercise options" }).click();
await page.getByRole("heading", { name: "Exercise options" }).waitFor();
assert.equal(await page.getByRole("button", { name: /View exercise details/ }).count(), 1);
await page.getByRole("button", { name: /View exercise details/ }).click();
await page.getByText("No history yet.", { exact: true }).waitFor();
assert.equal(
  await page.locator(".exercise-detail-overview").count(),
  1,
  "history remains available through the semantically separate details action",
);
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.locator(".exercise-detail-overview").waitFor({ state: "detached" });
await page.getByRole("button", { name: "Exercise options" }).click();
await page.getByRole("button", { name: /Create superset/ }).click();
await page.getByRole("heading", { name: /Pair / }).waitFor();
assert.equal(
  await page.getByText("Choose an upcoming exercise.", { exact: false }).count(),
  1,
  "superset creation moved into the secondary exercise-options sheet",
);
await page.getByRole("button", { name: "Close", exact: true }).click();

const progress = page.locator(".workout-header small");
assert.match(
  await progress.innerText(),
  /^0 \/ \d+ sets · (?:\d{2}:\d{2}|\d+:\d{2}:\d{2})$/,
  "header prioritizes completed-set progress before elapsed time",
);
const workoutHeader = page.locator(".workout-header");
const headerGeometry = await workoutHeader.evaluate((header) => {
  const bounds = header.getBoundingClientRect();
  const center = header.querySelector(".workout-header-center").getBoundingClientRect();
  const back = header.querySelector('[aria-label="Back to Today"]').getBoundingClientRect();
  const actions = header.querySelector(".workout-header-actions").getBoundingClientRect();
  const title = header.querySelector(".workout-header-center > strong");
  return {
    centerDelta: Math.abs(center.left + center.width / 2 - innerWidth / 2),
    actionVerticalDelta: Math.abs(back.top + back.height / 2 - (actions.top + actions.height / 2)),
    titleOverflow: title.scrollWidth > title.clientWidth,
    titleWhiteSpace: getComputedStyle(title).whiteSpace,
    headerTop: bounds.top,
  };
});
assert.ok(headerGeometry.centerDelta <= 1, JSON.stringify(headerGeometry));
assert.ok(headerGeometry.actionVerticalDelta <= 1, JSON.stringify(headerGeometry));
assert.equal(headerGeometry.titleOverflow, true, "long imported workout names truncate in the header");
assert.equal(headerGeometry.titleWhiteSpace, "nowrap");
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(50);
assert.ok(
  Math.abs(await workoutHeader.evaluate((header) => header.getBoundingClientRect().top)) <= 1,
  "the workout header remains pinned to the viewport while logging content scrolls",
);

const metadata = heading.locator(".exercise-meta");
assert.doesNotMatch(await metadata.innerText(), /│|\|/);
assert.match(await metadata.innerText(), /^Target /);
assert.equal(await heading.locator(".exercise-history-meta").innerText(), "First session");
const metadataStyles = await metadata.evaluate((node) => ({
  overflow: node.scrollWidth > node.clientWidth,
  height: node.getBoundingClientRect().height,
  lineHeight: parseFloat(getComputedStyle(node).lineHeight),
}));
assert.equal(metadataStyles.overflow, false);
assert.ok(metadataStyles.height <= metadataStyles.lineHeight * 2 + 1, JSON.stringify(metadataStyles));

const title = heading.locator("h1");
const [longTitleBox, headingBox, metadataBox] = await Promise.all([
  title.boundingBox(),
  heading.boundingBox(),
  metadata.boundingBox(),
]);
assert.ok(longTitleBox.x + longTitleBox.width <= headingBox.x + headingBox.width + 1);
assert.ok(metadataBox.y >= longTitleBox.y + longTitleBox.height - 1);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);

const upNextRows = page.locator(".up-next button");
const upNextCount = await upNextRows.count();
const activeShape = await page.evaluate(() => {
  const active = JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout;
  return { index: active.exerciseIndex, count: active.exercises.length };
});
assert.equal(activeShape.count, 10, "the narrow-screen fixture covers a 10-exercise workout");
assert.ok(
  upNextCount >= 8,
  `10-exercise sessions show multiple upcoming exercises (found ${upNextCount}; ${JSON.stringify(activeShape)})`,
);
assert.equal(await page.locator(".up-next button i").count(), 0, "decorative status dots are removed");
const upcomingLayout = await upNextRows.evaluateAll((rows) =>
  rows.map((row) => {
    const main = row.querySelector(".up-next-main").getBoundingClientRect();
    const prescription = row
      .querySelector(".up-next-prescription")
      .getBoundingClientRect();
    const title = row.querySelector(".up-next-title");
    const titleStyle = getComputedStyle(title);
    return {
      centerDelta: Math.abs(
        main.top + main.height / 2 -
          (prescription.top + prescription.height / 2),
      ),
      titleLines:
        title.getBoundingClientRect().height /
        Number.parseFloat(titleStyle.lineHeight),
      paddingTop: Number.parseFloat(getComputedStyle(row).paddingTop),
      overflow: row.scrollWidth > row.clientWidth,
    };
  }),
);
assert.ok(upcomingLayout.every((row) => row.centerDelta <= 1), JSON.stringify(upcomingLayout));
assert.ok(upcomingLayout.every((row) => row.titleLines <= 2.05), JSON.stringify(upcomingLayout));
assert.ok(upcomingLayout.every((row) => row.paddingTop <= 11), JSON.stringify(upcomingLayout));
assert.ok(upcomingLayout.every((row) => !row.overflow), JSON.stringify(upcomingLayout));

const weight = page.getByRole("spinbutton", { name: /Weight in kg for set 1/ });
assert.equal(await weight.getAttribute("placeholder"), "Enter weight");
const unifiedStepper = page.locator(".set-row .stepper:not(.unset)").first();
const stepperSurfaces = await unifiedStepper.evaluate((node) => {
  const [decrement, input, increment] = node.children;
  return {
    decrement: getComputedStyle(decrement).backgroundColor,
    input: getComputedStyle(input).backgroundColor,
    increment: getComputedStyle(increment).backgroundColor,
    divider: getComputedStyle(decrement).borderRightColor,
  };
});
assert.equal(stepperSurfaces.decrement, "rgba(0, 0, 0, 0)");
assert.equal(stepperSurfaces.input, "rgba(0, 0, 0, 0)");
assert.equal(stepperSurfaces.increment, "rgba(0, 0, 0, 0)");
assert.notEqual(stepperSurfaces.divider, "rgba(0, 0, 0, 0)");
const checks = page.locator(".set-row .check");
assert.equal(await checks.nth(0).isDisabled(), true, "missing required load keeps the active set unconfirmable");
assert.equal(await checks.nth(1).isDisabled(), true);
assert.equal(await checks.nth(0).innerText(), "", "disabled confirmation uses a neutral pending ring, not a dash");
assert.equal(await checks.nth(0).locator('.check-pending').count(), 1);
assert.equal(await page.locator('.set-row').nth(0).getAttribute('data-set-state'), 'current');
assert.equal(await page.locator('.set-index-label small').count(), 0, 'set rows no longer render a NEXT text label');
const activeSetNumberStyle = await page.locator('.set-row').nth(0).locator('.set-index-label b').evaluate(
  (node) => ({ color: getComputedStyle(node).color, weight: Number(getComputedStyle(node).fontWeight) }),
);
assert.equal(activeSetNumberStyle.color, 'rgb(31, 107, 76)');
assert.ok(activeSetNumberStyle.weight >= 700, 'the active set number carries the current-set emphasis');
const missingStyle = await checks.nth(0).evaluate((node) => ({
  border: getComputedStyle(node).borderColor,
  color: getComputedStyle(node).color,
}));
const disabledStyle = await checks.nth(1).evaluate((node) => ({
  border: getComputedStyle(node).borderColor,
  color: getComputedStyle(node).color,
  opacity: getComputedStyle(node).opacity,
}));
assert.deepEqual(missingStyle, { border: disabledStyle.border, color: disabledStyle.color });
assert.equal(Number(disabledStyle.opacity), 1);

await weight.fill("135");
assert.equal(await checks.nth(0).isEnabled(), true, "entering a valid load makes the active set confirmable");
assert.equal(await page.locator('.set-row').nth(0).getAttribute('data-set-state'), 'ready');
assert.equal(await checks.nth(0).innerText(), "✓");
await page.waitForTimeout(220);
const readyStyle = await checks.nth(0).evaluate((node) => ({
  border: getComputedStyle(node).borderColor,
  color: getComputedStyle(node).color,
}));
assert.notDeepEqual(readyStyle, missingStyle);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
  "a three-digit load does not introduce horizontal overflow",
);

await page.getByRole("button", { name: "Complete set 1" }).click();
await page.waitForTimeout(220);
assert.equal(await checks.nth(1).isEnabled(), true);
assert.equal(await page.locator('.set-row').nth(0).getAttribute('data-set-state'), 'completed');
assert.equal(await page.locator('.set-row').nth(1).getAttribute('data-set-state'), 'ready');
assert.equal(await page.locator('.set-index-label small').count(), 0);
assert.equal(
  await page.locator('.set-row').nth(1).locator('.set-index-label b').evaluate((node) => getComputedStyle(node).color),
  'rgb(31, 107, 76)',
);
assert.equal(
  await checks.nth(0).evaluate((node) => getComputedStyle(node).backgroundColor),
  "rgb(31, 107, 76)",
);
assert.equal(await checks.nth(0).getAttribute("aria-label"), "Reopen set 1");

const previous = page.getByRole("button", { name: "← PREVIOUS EXERCISE" });
const next = page.getByRole("button", { name: "NEXT EXERCISE →" });
await next.scrollIntoViewIfNeeded();
const [previousBox, nextBox] = await Promise.all([
  previous.boundingBox(),
  next.boundingBox(),
]);
const navigationGap = nextBox.y - (previousBox.y + previousBox.height);
assert.ok(navigationGap >= 6 && navigationGap <= 8, navigationGap);
assert.ok(previousBox.height >= 44 && nextBox.height >= 52);

await page.screenshot({ path: output("320-active-workout-clarity.png") });
await upNextRows.filter({ hasText: "Single-Leg Leg Extension" }).click();
assert.equal(await heading.locator("h1").innerText(), "Single-Leg Leg Extension");
assert.equal(
  await heading.locator(".exercise-heading-art-button").count(),
  1,
  "navigation keeps the normalized active-workout illustration",
);
assert.equal(
  await heading.locator(".exercise-user-note").innerText(),
  "curl mašina",
);
await page.screenshot({ path: output("320-jumped-to-annotated-exercise.png") });
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Active workout clarity QA passed: text-first hero, secondary actions, metadata hierarchy, long names, weight placeholder, check states, and lower navigation are clear at 320px.",
);
