import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  blankState,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const root = new URL("../artifacts/premium-theme/", import.meta.url);
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
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

function returningFixture(active = false) {
  const state = createReturningUserFixture(5);
  state.profile.themePreference = "premium";
  const day = ensureToday(state);
  if (active) {
    state.activeWorkout = startWorkout(state, day);
    const illustratedIndex = state.activeWorkout.exercises.findIndex(
      (exercise) => exerciseCatalog[exercise.exerciseId]?.artId,
    );
    state.activeWorkout.exerciseIndex = Math.max(0, illustratedIndex);
    const exercise = state.activeWorkout.exercises[state.activeWorkout.exerciseIndex];
    const first = exercise.sets[0];
    first.weight = exerciseCatalog[exercise.exerciseId]?.bodyweight ? 0 : 30;
    first.reps = Math.max(1, Number(first.reps) || 8);
    first.completed = true;
  }
  return state;
}

async function openState(state, width = 390, colorScheme = "dark") {
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
  await page.goto(appUrl, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function screenshot(page, name) {
  await page.screenshot({ path: output(name), fullPage: false });
}

async function premiumSignals(page) {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.theme,
      premiumScheme: document.documentElement.dataset.premiumScheme,
      scheme: document.documentElement.style.colorScheme,
      meta: document.querySelector('meta[name="theme-color"]')?.content,
      background: getComputedStyle(
        document.querySelector(".app-shell, .onboarding, .initial-import-screen") ||
          document.body,
      ).backgroundColor,
      accent: rootStyle.getPropertyValue("--rook-accent").trim(),
      success: rootStyle.getPropertyValue("--rook-success").trim(),
      selected: rootStyle.getPropertyValue("--rook-selected").trim(),
      selectedLine: rootStyle.getPropertyValue("--rook-selected-line").trim(),
      navActive: rootStyle.getPropertyValue("--rook-nav-active").trim(),
      progress: rootStyle.getPropertyValue("--rook-progress").trim(),
      artFilter: rootStyle.getPropertyValue("--rook-art-filter").trim(),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function visibleGreenLeaks(page) {
  return page.locator("body").evaluate((body) => {
    const parseColor = (value) => {
      const match = String(value || "").match(
        /rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+([\d.]+))?/,
      );
      return match
        ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])]
        : null;
    };
    const isGreen = (value) => {
      const color = parseColor(value);
      return Boolean(
        color &&
          color[3] > 0.08 &&
          color[1] > color[0] * 1.12 &&
          color[1] > color[2] * 1.08 &&
          color[1] - color[0] > 12 &&
          color[1] - color[2] > 8,
      );
    };
    const properties = [
      "color",
      "backgroundColor",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
      "outlineColor",
      "fill",
      "stroke",
      "accentColor",
    ];
    return [...body.querySelectorAll("*")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      })
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          className: String(element.className || "").slice(0, 100),
          text: String(element.textContent || "").trim().slice(0, 60),
          values: properties.map((property) => `${property}: ${style[property]}`),
        };
      })
      .filter((entry) => entry.values.some((value) => isGreen(value)));
  });
}

const run = await openState(returningFixture());
assert.deepEqual(await premiumSignals(run.page), {
  theme: "premium",
  premiumScheme: "dark",
  scheme: "dark",
  meta: "#11110f",
  background: "rgb(17, 17, 15)",
  accent: "#d7b15a",
  success: "#b99a50",
  selected: "#242016",
  selectedLine: "#9b7d38",
  navActive: "#d7b15a",
  progress: "#d7b15a",
  artFilter: "grayscale(1) sepia(1) saturate(1.9) brightness(1.46)",
  overflow: false,
});
const weekStateSignals = await run.page.evaluate(() => {
  const planned = document.querySelector(
    ".week-strip .workout-planned:not(.selected-day)",
  );
  const rest = document.querySelector(
    ".week-strip .workout-rest:not(.selected-day)",
  );
  const plannedStyle = getComputedStyle(planned);
  const restStyle = getComputedStyle(rest);
  const plannedDotStyle = getComputedStyle(planned.querySelector(".workout-dot"));
  const today = document.querySelector(".week-strip .today-date");
  return {
    selectedToday: today?.classList.contains("selected-day") || false,
    plannedSurface: plannedStyle.backgroundColor,
    restSurface: restStyle.backgroundColor,
    plannedLine: plannedStyle.borderColor,
    restLine: restStyle.borderColor,
    plannedDotFill: plannedDotStyle.backgroundColor,
    plannedDotBorder: plannedDotStyle.borderStyle,
    todayMarkerWidth: getComputedStyle(today, "::after").width,
  };
});
assert.equal(weekStateSignals.selectedToday, true, "today remains independently marked when selected");
assert.notEqual(
  weekStateSignals.plannedSurface,
  weekStateSignals.restSurface,
  "Premium planned days use a distinct tile surface",
);
assert.notEqual(
  weekStateSignals.plannedLine,
  weekStateSignals.restLine,
  "Premium planned days use a distinct tile border",
);
assert.equal(weekStateSignals.plannedDotFill, "rgba(0, 0, 0, 0)");
assert.equal(weekStateSignals.plannedDotBorder, "solid");
assert.equal(weekStateSignals.todayMarkerWidth, "12px");
const primary = run.page.locator(".today-hero .primary");
if (await primary.count()) {
  assert.equal(
    await primary.evaluate((button) => getComputedStyle(button).backgroundColor),
    "rgb(215, 177, 90)",
    "Premium primary actions use muted champagne rather than ROOK green",
  );
}
await screenshot(run.page, "390-today-premium.png");
assert.deepEqual(await visibleGreenLeaks(run.page), [], "Premium Today contains no ROOK green");
const targetDay = run.page.locator(".week-strip button:not(.selected-day)").first();
const targetDayLabel = await targetDay.getAttribute("aria-label");
await targetDay.click();
assert.equal(
  await run.page.getByRole("button", { name: targetDayLabel }).getAttribute("aria-pressed"),
  "true",
  "a real user day change selects immediately",
);
assert.equal(
  await run.page.locator(".week-strip .day-selection-trace").count(),
  0,
  "Premium day selection does not add a rotating edge trace",
);

for (const tab of ["COACH", "PROGRESS", "PROFILE"]) {
  await run.page.getByRole("button", { name: tab, exact: true }).click();
  assert.equal(
    await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    `${tab} remains narrow-safe in Premium`,
  );
  await screenshot(run.page, `390-${tab.toLowerCase()}-premium.png`);
  assert.deepEqual(await visibleGreenLeaks(run.page), [], `${tab} contains no ROOK green`);
}
await run.page.getByRole("button", { name: /Edit plan/ }).click();
assert.deepEqual(
  await visibleGreenLeaks(run.page),
  [],
  "Premium plan editor cards contain no legacy ROOK green",
);
await run.page.getByRole("button", { name: /^Edit / }).first().click();
assert.deepEqual(
  await visibleGreenLeaks(run.page),
  [],
  "Expanded Premium plan editor controls contain no legacy ROOK green",
);
await screenshot(run.page, "390-plan-editor-premium.png");
await run.page.getByRole("button", { name: "Close", exact: true }).click();
await run.page.getByRole("button", { name: /Appearance/ }).click();
assert.equal(
  await run.page.getByRole("button", { name: /Premium.*Warm gold/ }).getAttribute("aria-pressed"),
  "true",
);
assert.equal(await run.page.locator(".theme-choice-layer").count(), 0);
await screenshot(run.page, "390-appearance-premium.png");
await run.page.reload({ waitUntil: "networkidle" });
assert.equal((await premiumSignals(run.page)).theme, "premium");
assert.equal(
  await run.page.evaluate(() =>
    JSON.parse(localStorage.getItem("lift-v2-state")).profile.themePreference,
  ),
  "premium",
);
assert.deepEqual(run.errors, []);
await run.context.close();

const activeRun = await openState(returningFixture(true), 320);
await activeRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
const art = activeRun.page.locator(".exercise-heading-art");
assert.equal(await art.count(), 1);
assert.match(
  await art.evaluate((image) => getComputedStyle(image).filter),
  /sepia\(1\).*saturate\(1\.9\)/,
  "Premium choice 1A renders exercise art in muted gold",
);
const completedCheck = activeRun.page.locator(".set-row.set-done .check").first();
assert.equal(
  await completedCheck.evaluate((button) => getComputedStyle(button).backgroundColor),
  "rgb(185, 154, 80)",
  "completed check fill uses the receded Premium gold step",
);
assert.equal(
  await completedCheck.evaluate((button) => getComputedStyle(button).borderColor),
  "rgb(185, 154, 80)",
  "completed check outline uses the receded Premium gold step",
);
assert.equal(
  await activeRun.page.locator(".set-row.set-done").first().evaluate(
    (row) => getComputedStyle(row).backgroundColor,
  ),
  "rgba(0, 0, 0, 0)",
  "the completed row stays neutral while the check carries completion",
);
assert.equal((await premiumSignals(activeRun.page)).overflow, false);
await screenshot(activeRun.page, "320-active-workout-premium.png");
assert.deepEqual(await visibleGreenLeaks(activeRun.page), [], "Premium workout contains no ROOK green");
await art.click();
await activeRun.page.locator(".exercise-visual-viewer").waitFor();
await screenshot(activeRun.page, "320-exercise-viewer-premium.png");
assert.deepEqual(activeRun.errors, []);
await activeRun.context.close();

const lightActiveState = returningFixture(true);
lightActiveState.activeWorkout.rest = {
  seconds: 120,
  endsAt: Date.now() + 90_000,
};
const lightActiveRun = await openState(lightActiveState, 320, "light");
await lightActiveRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
const lightSignals = await premiumSignals(lightActiveRun.page);
assert.equal(lightSignals.premiumScheme, "light");
assert.equal(lightSignals.scheme, "light");
assert.equal(lightSignals.accent, "#8a670f");
assert.equal(lightSignals.background, "rgb(247, 245, 240)");
assert.equal(
  await lightActiveRun.page.locator(".exercise-meta").evaluate(
    (node) => getComputedStyle(node).color,
  ),
  "rgb(29, 27, 24)",
  "target metadata remains neutral in Premium Light",
);
assert.equal(
  await lightActiveRun.page.locator(".set-row.set-done .check").first().evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  ),
  "rgb(154, 118, 26)",
  "Premium Light uses a darker completion gold",
);
assert.equal(
  await lightActiveRun.page.locator(".rest-timer").evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  ),
  "rgb(29, 27, 24)",
  "Premium Light keeps the persistent timer charcoal",
);
assert.equal(
  await lightActiveRun.page.locator(".rest-timer i").evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  ),
  "rgb(138, 103, 15)",
  "Premium Light reserves dark bronze for timer progress",
);
assert.equal(
  await lightActiveRun.page.locator(".rest-timer .button").evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  ),
  "rgb(57, 53, 47)",
  "Premium Light timer Skip keeps a dark neutral surface",
);
assert.equal(
  await lightActiveRun.page.locator(".rest-timer .button").evaluate(
    (node) => getComputedStyle(node).color,
  ),
  "rgb(244, 241, 232)",
  "Premium Light timer Skip keeps high-contrast text",
);
  // Capture the settled dock rather than its brief entrance fade.
  await lightActiveRun.page.waitForTimeout(240);
  await screenshot(lightActiveRun.page, "320-active-workout-premium-light.png");
assert.deepEqual(await visibleGreenLeaks(lightActiveRun.page), [], "Premium Light contains no ROOK green");
assert.deepEqual(lightActiveRun.errors, []);
await lightActiveRun.context.close();

const timerCompletionState = returningFixture(true);
timerCompletionState.activeWorkout.rest = {
  seconds: 2,
  endsAt: Date.now() + 2_500,
};
const timerCompletionRun = await openState(timerCompletionState, 320, "dark");
await timerCompletionRun.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
await timerCompletionRun.page.getByText("REST COMPLETE", { exact: true }).waitFor({ timeout: 5_000 });
assert.equal(
  await timerCompletionRun.page.locator(".rest-timer.rest-complete").count(),
  1,
  "timer completion uses one brief status instead of continuous pulsing",
);
assert.deepEqual(timerCompletionRun.errors, []);
await timerCompletionRun.context.close();

const fresh = blankState();
fresh.profile.themePreference = "premium";
const onboardingRun = await openState(fresh, 375);
await onboardingRun.page.getByRole("button", { name: "BUILD MY PLAN" }).click();
assert.equal((await premiumSignals(onboardingRun.page)).overflow, false);
await screenshot(onboardingRun.page, "375-onboarding-premium.png");
assert.deepEqual(await visibleGreenLeaks(onboardingRun.page), [], "Premium onboarding contains no ROOK green");
assert.deepEqual(onboardingRun.errors, []);
await onboardingRun.context.close();

await browser.close();
console.log(
  "Premium theme QA passed: adaptive Dark/Light semantics, restrained set hierarchy, charcoal timer, gold progress/artwork, no ROOK-green leaks, all tabs, viewer, onboarding, and narrow mobile layouts.",
);
