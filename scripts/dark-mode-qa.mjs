import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const root = new URL("../artifacts/dark-mode/", import.meta.url);
await mkdir(root, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, root));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function ensureToday(state) {
  const today = weekday();
  let day = state.program.days.find((item) => item.weekday === today);
  if (!day) {
    day = state.program.days[0];
    const old = day.weekday;
    day.weekday = today;
    state.profile.availableDays = state.profile.availableDays.map((value) =>
      value === old ? today : value,
    );
  }
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.program.rotationStartDate = null;
  return day;
}

function returningFixture(themePreference, active = false) {
  const state = createReturningUserFixture(5);
  state.profile.themePreference = themePreference;
  const day = ensureToday(state);
  if (active) {
    state.activeWorkout = startWorkout(state, day);
    const illustratedIndex = state.activeWorkout.exercises.findIndex(
      (exercise) => exerciseCatalog[exercise.exerciseId]?.artId,
    );
    if (illustratedIndex >= 0) state.activeWorkout.exerciseIndex = illustratedIndex;
  }
  return state;
}

async function openState(state, { width = 390, colorScheme = "light" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    colorScheme,
    serviceWorkers: "block",
  });
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
  return { context, page, errors };
}

async function themeSignals(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: document.documentElement.style.colorScheme,
    meta: document.querySelector('meta[name="theme-color"]')?.content,
    background: getComputedStyle(document.querySelector(".app-shell")).backgroundColor,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}

async function contrastSignals(page) {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const value = (name) => styles.getPropertyValue(name).trim();
    const rgb = (color) => {
      const match = color.match(/[\da-f]{2}/gi);
      return match.map((part) => Number.parseInt(part, 16) / 255);
    };
    const luminance = (color) => {
      const [red, green, blue] = rgb(color).map((part) =>
        part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrast = (foreground, background) => {
      const first = luminance(value(foreground));
      const second = luminance(value(background));
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    return {
      primary: contrast("--rook-text", "--rook-bg"),
      secondary: contrast("--rook-secondary", "--rook-bg"),
      metadata: contrast("--rook-muted", "--rook-bg"),
      disabled: contrast("--rook-disabled-text", "--rook-disabled-surface"),
      accent: contrast("--rook-accent", "--rook-bg"),
      success: contrast("--rook-accent", "--rook-accent-soft"),
      warning: contrast("--rook-warning-text", "--rook-warning-surface"),
      error: contrast("--rook-error-text", "--rook-error-surface"),
      selected: contrast("--rook-on-selected", "--rook-selected"),
      control: contrast("--rook-control-border", "--rook-surface"),
    };
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const selectors = [".app-shell", ".screen", ".week-strip", ".today-hero", ".bottom-nav"];
    return Object.fromEntries(
      selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const box = element.getBoundingClientRect();
        return [selector, [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10)];
      }),
    );
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: output(name), fullPage: false });
}

// Identical persisted state must keep identical geometry in light and dark.
const lightState = returningFixture("light");
const darkState = structuredClone(lightState);
darkState.profile.themePreference = "dark";
const lightRun = await openState(lightState);
const darkRun = await openState(darkState);
assert.deepEqual(await geometry(darkRun.page), await geometry(lightRun.page));
assert.deepEqual(await themeSignals(lightRun.page), {
  theme: "light",
  scheme: "light",
  meta: "#f6f5f2",
  background: "rgb(246, 245, 242)",
  overflow: false,
});
assert.deepEqual(await themeSignals(darkRun.page), {
  theme: "dark",
  scheme: "dark",
  meta: "#111413",
  background: "rgb(17, 20, 19)",
  overflow: false,
});
for (const [state, ratio] of Object.entries(await contrastSignals(darkRun.page))) {
  const minimum = state === "control" ? 3 : 4.5;
  assert.ok(ratio >= minimum, `${state} contrast is ${ratio.toFixed(2)}:1`);
}
await screenshot(lightRun.page, "390-today-light.png");
await screenshot(darkRun.page, "390-today-dark.png");

// Selected, outlined-today, and neutral date semantics stay distinct.
const weekChips = darkRun.page.locator(".week-strip button");
const todayChip = darkRun.page.locator('.week-strip button[aria-current="date"]');
const chipStates = await darkRun.page.locator(".week-strip").evaluate((strip) => {
  const selected = strip.querySelector(".selected-day");
  const neutral = strip.querySelector("button:not(.selected-day):not(.today-date)");
  const style = (element) => {
    const current = getComputedStyle(element);
    return {
      background: current.backgroundColor,
      border: current.borderColor,
      color: current.color,
    };
  };
  return { selected: style(selected), neutral: style(neutral) };
});
assert.equal(chipStates.selected.background, "rgb(235, 238, 236)");
assert.equal(chipStates.selected.color, "rgb(17, 20, 19)");
assert.equal(chipStates.neutral.background, "rgb(35, 40, 37)");
assert.equal(chipStates.neutral.border, "rgb(47, 53, 50)");
if (await todayChip.evaluate((chip) => chip.classList.contains("workout-planned"))) {
  assert.equal(
    await todayChip.locator(".workout-dot").evaluate((dot) => getComputedStyle(dot).backgroundColor),
    "rgb(17, 20, 19)",
    "the planned-workout dot remains visible inside the light selected chip",
  );
}
const todayIndex = await weekChips.evaluateAll((chips) =>
  chips.findIndex((chip) => chip.getAttribute("aria-current") === "date"),
);
if (todayIndex > 0) {
  await weekChips.nth(todayIndex - 1).click();
  const [todayBorder, neutralBorder] = await Promise.all([
    todayChip.evaluate((chip) => getComputedStyle(chip).borderColor),
    darkRun.page.locator('.week-strip button:not(.selected-day):not([aria-current="date"])').first().evaluate((chip) => getComputedStyle(chip).borderColor),
  ]);
  assert.notEqual(todayBorder, neutralBorder, "unselected today keeps a distinct secondary indicator");
  await todayChip.click();
}

// Overview stays text-first; detail keeps faithful art in dark mode.
assert.equal(
  await darkRun.page.locator(".exercise-preview .exercise-list-row img").count(),
  0,
);
await darkRun.page
  .locator(".exercise-preview .exercise-list-row")
  .first()
  .click();
assert.equal(await darkRun.page.locator(".exercise-detail-art").count(), 1);
await screenshot(darkRun.page, "390-exercise-detail-dark.png");
await darkRun.page.getByRole("button", { name: "Close", exact: true }).click();

// Every primary tab renders and remains narrow-safe.
for (const tab of ["COACH", "PROGRESS", "PROFILE"]) {
  await darkRun.page.getByRole("button", { name: tab, exact: true }).click();
  assert.equal(await darkRun.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot(darkRun.page, `390-${tab.toLowerCase()}-dark.png`);
}

// Settings controls keep intentional selected, unselected, and field boundaries.
await darkRun.page.getByRole("button", { name: /Logging & increments/ }).click();
const loggingStates = await darkRun.page.locator(".logging-screen").evaluate((screen) => {
  const style = (selector) => {
    const current = getComputedStyle(screen.querySelector(selector));
    return {
      background: current.backgroundColor,
      border: current.borderColor,
      color: current.color,
    };
  };
  return {
    selected: style(".segmented .active"),
    unselected: style(".segmented button:not(.active)"),
    select: style("select"),
  };
});
assert.equal(loggingStates.selected.background, "rgb(235, 238, 236)");
assert.equal(loggingStates.selected.color, "rgb(17, 20, 19)");
assert.equal(loggingStates.unselected.color, "rgb(137, 145, 140)");
assert.equal(loggingStates.select.border, "rgb(98, 108, 102)");
await screenshot(darkRun.page, "390-logging-dark.png");
await darkRun.page.getByRole("button", { name: "Close", exact: true }).click();

// Appearance picker, explicit override, System live update, and persistence.
await darkRun.page.getByRole("button", { name: /Appearance/ }).click();
await screenshot(darkRun.page, "390-appearance-dark.png");
await darkRun.page.getByRole("button", { name: /^Theme/ }).click();
assert.equal(await darkRun.page.getByRole("dialog", { name: "Theme" }).count(), 1);
await screenshot(darkRun.page, "390-theme-picker-dark.png");
const workoutsBefore = await darkRun.page.evaluate(() =>
  JSON.stringify(JSON.parse(localStorage.getItem("lift-v2-state")).workouts),
);
await darkRun.page.getByRole("button", { name: /^Light/ }).click();
assert.equal((await themeSignals(darkRun.page)).theme, "light");
assert.equal(
  await darkRun.page.evaluate(() =>
    JSON.parse(localStorage.getItem("lift-v2-state")).profile.themePreference,
  ),
  "light",
);
await darkRun.page.getByRole("button", { name: /^Theme/ }).click();
await darkRun.page.getByRole("button", { name: /^System/ }).click();
assert.equal((await themeSignals(darkRun.page)).theme, "light");
await darkRun.page.emulateMedia({ colorScheme: "dark" });
await darkRun.page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
assert.equal((await themeSignals(darkRun.page)).theme, "dark");
assert.equal(
  await darkRun.page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem("lift-v2-state")).workouts),
  ),
  workoutsBefore,
  "theme changes never rewrite workout history",
);
await darkRun.page.reload({ waitUntil: "networkidle" });
assert.equal((await themeSignals(darkRun.page)).theme, "dark");

assert.deepEqual(lightRun.errors, []);
assert.deepEqual(darkRun.errors, []);
await lightRun.context.close();
await darkRun.context.close();

// Active workout, all set-control states, timer, and lower navigation.
const activeRun = await openState(returningFixture("dark", true), { width: 320 });
await activeRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
assert.equal((await themeSignals(activeRun.page)).overflow, false);
assert.equal(
  await activeRun.page.locator(".exercise-heading-art-button").count(),
  1,
  "active logging retains a compact illustration at 320 px",
);
const compactArtBox = await activeRun.page.locator(".exercise-heading-art-button").boundingBox();
await activeRun.page.locator(".exercise-heading-art-button").click();
const visualViewer = activeRun.page.locator(".exercise-visual-viewer");
await visualViewer.waitFor();
const enlargedArtBox = await visualViewer.locator(".exercise-visual-stage img").boundingBox();
assert.ok(
  enlargedArtBox.width >= compactArtBox.width * 3 && enlargedArtBox.height >= compactArtBox.height * 3,
  "dark-mode artwork opens in a meaningfully larger visual-only viewer",
);
assert.equal(await visualViewer.getByRole("button", { name: "Close visual viewer" }).count(), 1);
assert.equal(await activeRun.page.locator(".exercise-detail-overview").count(), 0);
await screenshot(activeRun.page, "320-exercise-visual-viewer-dark.png");
await visualViewer.getByRole("button", { name: "Close visual viewer" }).click();
await visualViewer.waitFor({ state: "detached" });
await activeRun.page.getByRole("button", { name: "Exercise options" }).click();
await activeRun.page.getByRole("button", { name: /View exercise details/ }).click();
assert.equal(
  await activeRun.page.locator(".exercise-detail-art").count(),
  1,
  "exercise artwork remains available in the focused detail view",
);
await activeRun.page.getByRole("button", { name: "Close", exact: true }).click();
await activeRun.page.locator(".exercise-detail-overview").waitFor({ state: "detached" });
await activeRun.page.locator(".exercise-heading").waitFor();
await activeRun.page.getByRole("button", { name: "Replace", exact: true }).click();
const initialReplacementChoices = await activeRun.page
  .locator(".replace-sheet .choice-row")
  .allTextContents();
await activeRun.page.waitForTimeout(750);
assert.deepEqual(
  await activeRun.page.locator(".replace-sheet .choice-row").allTextContents(),
  initialReplacementChoices,
  "visible replacement choices remain stable while the sheet is open",
);
await activeRun.page.getByRole("button", { name: "Close", exact: true }).click();
await activeRun.page.locator(".replace-sheet").waitFor({ state: "detached" });
await screenshot(activeRun.page, "320-active-workout-dark.png");
const setStates = await activeRun.page.locator(".sets").evaluate((sets) => {
  const checks = [...sets.querySelectorAll(".check")];
  const style = (element) => {
    const current = getComputedStyle(element);
    return { background: current.backgroundColor, border: current.borderColor, color: current.color };
  };
  return {
    ready: style(checks.find((check) => !check.disabled)),
    future: style(checks.find((check) => check.disabled)),
    inputBackground: getComputedStyle(sets.querySelector("input")).backgroundColor,
    stepperDivider: getComputedStyle(sets.querySelector(".stepper button")).borderRightColor,
    rirBackground: sets.querySelector("select")
      ? getComputedStyle(sets.querySelector("select")).backgroundColor
      : null,
  };
});
assert.equal(setStates.ready.border, "rgba(79, 191, 135, 0.5)");
assert.equal(setStates.future.color, "rgb(126, 135, 129)");
assert.equal(setStates.inputBackground, "rgba(0, 0, 0, 0)");
assert.notEqual(setStates.stepperDivider, "rgba(0, 0, 0, 0)");
if (setStates.rirBackground)
  assert.equal(setStates.rirBackground, "rgb(28, 32, 30)");
await activeRun.page.getByRole("button", { name: "Complete set 1" }).click();
await activeRun.page.waitForTimeout(220);
assert.equal(
  await activeRun.page.locator(".set-row.set-done .check").first().evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  ),
  "rgb(47, 158, 107)",
);
if (await activeRun.page.locator(".rest-timer").count())
  await screenshot(activeRun.page, "320-rest-timer-dark.png");
assert.deepEqual(activeRun.errors, []);
await activeRun.context.close();

// New-user entry, onboarding, import, and scratch paths in dark mode.
const freshState = blankState();
freshState.profile.themePreference = "dark";
const freshRun = await openState(freshState, { width: 375 });
await screenshot(freshRun.page, "375-entry-dark.png");
await freshRun.page.getByRole("button", { name: "BUILD MY PLAN" }).click();
const onboardingProgress = await freshRun.page.locator(".progress-line").evaluate((track) => {
  const fill = track.querySelector("span");
  return {
    track: getComputedStyle(track).backgroundColor,
    fill: getComputedStyle(fill).backgroundColor,
    ratio: fill.getBoundingClientRect().width / track.getBoundingClientRect().width,
  };
});
assert.equal(onboardingProgress.track, "rgb(38, 43, 40)");
assert.equal(onboardingProgress.fill, "rgb(235, 238, 236)");
assert.ok(
  Math.abs(onboardingProgress.ratio - 1 / 8) < 0.01,
  `first onboarding step should show 1/8 progress, got ${onboardingProgress.ratio}`,
);
await screenshot(freshRun.page, "375-onboarding-first-dark.png");
assert.deepEqual(freshRun.errors, []);
await freshRun.context.close();

for (const [buttonName, fileName, expected] of [
  ["Already have a plan", "390-import-entry-dark.png", /Bring your existing workout into Rook/i],
  ["Start from scratch", "390-scratch-entry-dark.png", /Choose your training days/i],
]) {
  const state = blankState();
  state.profile.themePreference = "dark";
  const run = await openState(state);
  await run.page.getByRole("button", { name: new RegExp(buttonName, "i") }).click();
  assert.match(await run.page.locator("body").innerText(), expected);
  await screenshot(run.page, fileName);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

// System preference follows live OS changes; explicit choices do not.
const systemState = returningFixture("system");
const systemRun = await openState(systemState, { colorScheme: "dark" });
assert.equal((await themeSignals(systemRun.page)).theme, "dark");
await systemRun.page.emulateMedia({ colorScheme: "light" });
await systemRun.page.waitForFunction(() => document.documentElement.dataset.theme === "light");
const explicitState = returningFixture("dark");
const explicitRun = await openState(explicitState, { colorScheme: "light" });
assert.equal((await themeSignals(explicitRun.page)).theme, "dark");
await explicitRun.page.emulateMedia({ colorScheme: "dark" });
assert.equal((await themeSignals(explicitRun.page)).theme, "dark");
assert.deepEqual(systemRun.errors, []);
assert.deepEqual(explicitRun.errors, []);
await systemRun.context.close();
await explicitRun.context.close();

await browser.close();
console.log(
  "Dark mode QA passed: bootstrap, paired geometry, Today, details, every tab, Appearance picker, explicit/System behavior, persistence, active workout, timer, onboarding, import, scratch, and history isolation.",
);
