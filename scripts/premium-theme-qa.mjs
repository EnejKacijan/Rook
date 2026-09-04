import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import {
  blankState,
  completeWorkout,
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

function returningFixtureWithCurrentCompletion() {
  let state = returningFixture();
  const day = state.program.days.find((item) => item.weekday === weekday());
  day.exercises[0].notes = "Seat position 3";
  state.activeWorkout = startWorkout(state, day);
  state.activeWorkout.exercises.forEach((exercise) =>
    exercise.sets.forEach((set) => {
      set.weight = exerciseCatalog[exercise.exerciseId]?.bodyweight ? null : 30;
      set.reps = Math.max(1, Number(set.reps) || 8);
      set.completed = true;
    }),
  );
  state = completeWorkout(state);
  return state;
}

function returningFixtureWithRestriction() {
  const state = returningFixture();
  const sourceText = "Avoid Leg Press";
  const quote = "Leg Press";
  const start = sourceText.indexOf(quote);
  state.profile.avoid = sourceText;
  state.profile.trainingSafetyAnalysis = {
    sourceText,
    analysis: {
      schemaVersion: 2,
      findings: [
        {
          kind: "explicit_avoidance",
          confidence: 0.99,
          evidence: [{ start, end: start + quote.length, quote }],
          targetText: quote,
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    },
  };
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
    const elements = [...body.querySelectorAll("*")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      });
    const entry = (element, style, pseudo = "") => {
        return {
          tag: element.tagName,
          className: `${String(element.className || "").slice(0, 100)}${pseudo}`,
          text: String(element.textContent || "").trim().slice(0, 60),
          values: properties.map((property) => `${property}: ${style[property]}`),
        };
    };
    return elements
      .flatMap((element) => {
        const entries = [entry(element, getComputedStyle(element))];
        for (const pseudo of ["::before", "::after"]) {
          const style = getComputedStyle(element, pseudo);
          const background = parseColor(style.backgroundColor);
          const hasContent = !["none", "normal", '""'].includes(style.content);
          const hasBackground = Boolean(background && background[3] > 0.08);
          const hasBorder = [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].some((width) => Number.parseFloat(width) > 0);
          if (hasContent || hasBackground || hasBorder)
            entries.push(entry(element, style, pseudo));
        }
        return entries;
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
await run.page.getByRole("button", { name: "Close edit plan" }).click();
await run.page.getByRole("button", { name: /^Appearance/ }).click();
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

const lightTabRun = await openState(returningFixtureWithCurrentCompletion(), 390, "light");
for (const tab of ["TODAY", "COACH", "PROGRESS", "PROFILE"]) {
  await lightTabRun.page.getByRole("button", { name: tab, exact: true }).click();
  await screenshot(lightTabRun.page, `390-${tab.toLowerCase()}-premium-light.png`);
  assert.deepEqual(
    await visibleGreenLeaks(lightTabRun.page),
    [],
    `Premium Light ${tab} contains no ROOK green`,
  );
}

await lightTabRun.page.getByRole("button", { name: /Export workout plan/ }).click();
await lightTabRun.page.getByText("Include notes", { exact: true }).click();
assert.deepEqual(
  await visibleGreenLeaks(lightTabRun.page),
  [],
  "Premium Light export sheet contains no ROOK green",
);
await screenshot(lightTabRun.page, "390-export-plan-premium-light.png");
await lightTabRun.page.getByRole("button", { name: "Close export workout plan" }).click();

await lightTabRun.page.getByRole("button", { name: /Edit plan/ }).click();
assert.deepEqual(
  await visibleGreenLeaks(lightTabRun.page),
  [],
  "Premium Light plan editor contains no ROOK green",
);
await lightTabRun.page.getByRole("button", { name: /^Edit / }).first().click();
assert.deepEqual(
  await visibleGreenLeaks(lightTabRun.page),
  [],
  "Expanded Premium Light plan editor contains no ROOK green",
);
await screenshot(lightTabRun.page, "390-plan-editor-premium-light.png");
await lightTabRun.page.getByRole("button", { name: "Close edit plan" }).click();

for (const [entry, screenshotName] of [
  [/Training restrictions/, "390-restrictions-premium-light.png"],
  [/Logging & increments/, "390-logging-premium-light.png"],
  [/Appearance/, "390-appearance-settings-premium-light.png"],
]) {
  await lightTabRun.page.getByRole("button", { name: entry }).click();
  assert.deepEqual(
    await visibleGreenLeaks(lightTabRun.page),
    [],
    `Premium Light ${entry} sheet contains no ROOK green`,
  );
  if (screenshotName === "390-logging-premium-light.png") {
    const units = await lightTabRun.page.locator(".unit-segmented").evaluate((control) => {
      const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const track = channels(getComputedStyle(control).backgroundColor);
      const indicator = channels(getComputedStyle(control, "::before").backgroundColor);
      return {
        delta: indicator.reduce((sum, value, index) => sum + Math.abs(value - track[index]), 0),
        active: getComputedStyle(control.querySelector(".active")).color,
        inactive: getComputedStyle(control.querySelector("button:not(.active)")).color,
        border: getComputedStyle(control).borderWidth,
        shadow: getComputedStyle(control).boxShadow,
      };
    });
    assert.ok(units.delta >= 24, "Premium Light selected unit has a clearly differentiated cream fill");
    assert.notEqual(units.active, units.inactive, "Premium Light selected unit text is distinct");
    assert.equal(units.border, "0px", "the unit track does not regain an accent outline");
    assert.equal(units.shadow, "none", "the unit track does not retain a touch focus halo");
  }
  await screenshot(lightTabRun.page, screenshotName);
  await lightTabRun.page.getByRole("button", { name: /^Close/ }).click();
}
assert.deepEqual(lightTabRun.errors, []);
await lightTabRun.context.close();

const lightNoticeState = returningFixture(true);
const noticeDate = new Date();
noticeDate.setDate(noticeDate.getDate() + 1);
lightNoticeState.selectedDate = isoDay(noticeDate);
lightNoticeState.selectedDay = weekday(noticeDate);
const lightNoticeRun = await openState(lightNoticeState, 390, "light");
const activeNotice = lightNoticeRun.page.locator(".active-workout-notice");
assert.equal(await activeNotice.count(), 1);
assert.deepEqual(
  await activeNotice.evaluate((notice) => ({
    background: getComputedStyle(notice).backgroundColor,
    border: getComputedStyle(notice).borderColor,
    eyebrow: getComputedStyle(notice.querySelector(".eyebrow")).color,
    action: getComputedStyle(notice.querySelector("button")).color,
  })),
  {
    background: "rgb(241, 232, 207)",
    border: "rgba(138, 103, 15, 0.3)",
    eyebrow: "rgb(138, 103, 15)",
    action: "rgb(138, 103, 15)",
  },
  "Premium Light active-workout notice uses the restrained gold treatment",
);
assert.deepEqual(
  await visibleGreenLeaks(lightNoticeRun.page),
  [],
  "Premium Light active-workout notice contains no legacy green",
);
await screenshot(lightNoticeRun.page, "390-active-notice-premium-light.png");
assert.deepEqual(lightNoticeRun.errors, []);
await lightNoticeRun.context.close();

const lightRestrictionRun = await openState(returningFixtureWithRestriction(), 390, "light");
await lightRestrictionRun.page.getByRole("button", { name: "PROFILE", exact: true }).click();
await lightRestrictionRun.page.getByRole("button", { name: /Training restrictions/ }).click();
const restrictionSummary = lightRestrictionRun.page.locator(
  ".training-safety-summary.constraints-active",
);
await restrictionSummary.waitFor();
assert.deepEqual(
  await restrictionSummary.evaluate((summary) => ({
    background: getComputedStyle(summary).backgroundColor,
    border: getComputedStyle(summary).borderColor,
    eyebrow: getComputedStyle(summary.querySelector(".eyebrow")).color,
  })),
  {
    background: "rgb(241, 232, 207)",
    border: "rgba(138, 103, 15, 0.3)",
    eyebrow: "rgb(138, 103, 15)",
  },
  "Premium Light applied-restriction summary uses the restrained gold treatment",
);
assert.deepEqual(
  await visibleGreenLeaks(lightRestrictionRun.page),
  [],
  "Premium Light applied-restriction summary contains no legacy green",
);
await restrictionSummary.scrollIntoViewIfNeeded();
await screenshot(lightRestrictionRun.page, "390-applied-restrictions-premium-light.png");
assert.deepEqual(lightRestrictionRun.errors, []);
await lightRestrictionRun.context.close();

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
const premiumViewer = activeRun.page.locator(".exercise-visual-viewer");
await premiumViewer.waitFor();
await activeRun.page.waitForTimeout(240);
const premiumViewerBox = await premiumViewer.boundingBox();
assert.equal(premiumViewerBox.y, 0);
assert.equal(premiumViewerBox.height, 844);
assert.deepEqual(
  await visibleGreenLeaks(activeRun.page),
  [],
  "Premium fullscreen exercise viewer contains no ROOK green",
);
await screenshot(activeRun.page, "320-exercise-viewer-premium.png");
assert.deepEqual(activeRun.errors, []);
await activeRun.context.close();

const lightActiveState = returningFixture(true);
for (const set of lightActiveState.activeWorkout.exercises[
  lightActiveState.activeWorkout.exerciseIndex
].sets) {
  set.completed = true;
  set.reps = Math.max(1, Number(set.reps) || 8);
}
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
const lightNextAction = lightActiveRun.page.getByRole("button", {
  name: "NEXT EXERCISE →",
});
assert.equal(
  await lightNextAction.evaluate((node) => getComputedStyle(node).color),
  "rgb(29, 27, 24)",
  "Premium Light gold actions keep dark ink instead of low-contrast white",
);
  // Capture the settled dock rather than its brief entrance fade.
  await lightActiveRun.page.waitForTimeout(240);
  await screenshot(lightActiveRun.page, "320-active-workout-premium-light.png");
assert.deepEqual(await visibleGreenLeaks(lightActiveRun.page), [], "Premium Light contains no ROOK green");
assert.deepEqual(lightActiveRun.errors, []);
await lightActiveRun.context.close();

const lightCoachRun = await openState(returningFixture(), 390, "light");
await lightCoachRun.page.getByRole("button", { name: "COACH", exact: true }).click();
assert.equal(
  await lightCoachRun.page.locator(".coach-empty .eyebrow").evaluate(
    (node) => getComputedStyle(node).color,
  ),
  "rgb(138, 103, 15)",
  "Premium Light Coach context uses the Premium gold accent",
);
assert.equal(
  await lightCoachRun.page.locator(".bottom-nav .nav-active").evaluate(
    (node) => getComputedStyle(node, "::after").backgroundColor,
  ),
  "rgb(138, 103, 15)",
  "Premium Light active navigation uses gold rather than the light-theme black fallback",
);
assert.equal(
  await lightCoachRun.page.locator(".bottom-nav .nav-active").evaluate(
    (node) => getComputedStyle(node).color,
  ),
  "rgb(138, 103, 15)",
  "Premium Light active navigation label matches its gold indicator",
);
assert.equal(
  await lightCoachRun.page.getByLabel("Ask Coach").isDisabled(),
  true,
  "Premium Light keeps the offline Coach composer disabled",
);
assert.notEqual(
  await lightCoachRun.page.getByRole("button", { name: "Send message" }).evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  ),
  "rgb(184, 137, 30)",
  "Premium Light gold does not make the unavailable Send action look active",
);
await screenshot(lightCoachRun.page, "390-coach-premium-light.png");
assert.deepEqual(
  await visibleGreenLeaks(lightCoachRun.page),
  [],
  "Premium Light Coach contains no ROOK green",
);
assert.deepEqual(lightCoachRun.errors, []);
await lightCoachRun.context.close();

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

const lightLandingRun = await openState(fresh, 375, "light");
assert.deepEqual(
  await visibleGreenLeaks(lightLandingRun.page),
  [],
  "Premium Light landing contains no ROOK green",
);
await lightLandingRun.page.getByRole("button", { name: /Already have a plan/ }).click();
assert.deepEqual(
  await visibleGreenLeaks(lightLandingRun.page),
  [],
  "Premium Light import entry contains no ROOK green",
);
await screenshot(lightLandingRun.page, "375-import-entry-premium-light.png");
assert.deepEqual(lightLandingRun.errors, []);
await lightLandingRun.context.close();

const lightScratchRun = await openState(fresh, 375, "light");
await lightScratchRun.page.getByRole("button", { name: /Start from scratch/ }).click();
assert.deepEqual(
  await visibleGreenLeaks(lightScratchRun.page),
  [],
  "Premium Light scratch-plan entry contains no ROOK green",
);
await screenshot(lightScratchRun.page, "375-scratch-entry-premium-light.png");
assert.deepEqual(lightScratchRun.errors, []);
await lightScratchRun.context.close();

await browser.close();
console.log(
  "Premium theme QA passed: adaptive Dark/Light semantics, restrained set hierarchy, charcoal timer, gold progress/artwork, no ROOK-green leaks, all tabs, viewer, onboarding, and narrow mobile layouts.",
);
