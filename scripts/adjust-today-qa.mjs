import assert from "node:assert/strict";
import { verifyLongContent } from './post-review-runtime-checks.mjs';
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  adaptedTemplateForToday,
  blankState,
  buildProgram,
  completeWorkout,
  estimateSessionMinutes,
  isoDay,
  startWorkout,
  validateProgram,
  weekday,
  WEEKDAYS,
} from "../src/domain.js";
import { buildBackupArchive } from "../src/backup.js";
import {
  ADJUST_TODAY_MODES,
  applyTodayAdjustment,
  buildTodayAdjustment,
} from "../src/adjustToday.js";

const artifactRoot = new URL("../artifacts/adjust-today/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({ appearance = "light", style = "standard", custom = false } = {}) {
  const state = blankState();
  const today = weekday();
  const otherDays = WEEKDAYS.filter((day) => day !== today);
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    ageRange: "25–39",
    daysPerWeek: 4,
    availableDays: [today, ...otherDays.slice(0, 3)],
    sessionMinutes: 90,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Chest", "Back"],
    onboardingComplete: true,
    rirEnabled: true,
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  };
  state.program = buildProgram(state.profile);
  const selected = state.program.days.find((day) => day.weekday === today);
  selected.name = "Upper Strength and Hypertrophy A";
  if (custom) {
    selected.exercises[0] = {
      ...selected.exercises[0],
      exerciseId: "imported-custom-long-press",
      exerciseSource: "imported-custom",
      importedName: "My Long Custom Press Variation Without Replacement Metadata",
      originalImportedName: "My Long Custom Press Variation Without Replacement Metadata",
      importedExercise: {
        id: "imported-custom-long-press",
        name: "My Long Custom Press Variation Without Replacement Metadata",
        pattern: null,
        muscles: null,
        equipment: null,
      },
      matchStatus: "confirmed-custom",
    };
    state.program.source = "ai-import";
  }
  selected.estimatedMinutes = estimateSessionMinutes(selected.exercises);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  assert.equal(validateProgram(state.program, state.profile).valid, true);
  return state;
}

function completedAdjustedFixture() {
  const state = fixture();
  const proposal = buildTodayAdjustment(state, {
    mode: ADJUST_TODAY_MODES.lessTime,
    minutes: 30,
  }).proposal;
  const applied = applyTodayAdjustment(state, proposal, 1234).state;
  applied.activeWorkout = startWorkout(applied, adaptedTemplateForToday(applied));
  applied.todayAdaptation = null;
  applied.activeWorkout.exercises.forEach((exercise) =>
    exercise.sets.forEach((set) => {
      set.completed = true;
      set.reps = exercise.repMax;
      set.weight = 20;
      set.rir = exercise.targetRir;
    }),
  );
  return completeWorkout(applied);
}

const inAppReviewBackup = await buildBackupArchive(fixture(), []);
await writeFile(output("review-fixture.rook-backup.zip"), inAppReviewBackup.bytes);

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.appearancePreference,
    serviceWorkers: "block",
  });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("rook-adjust-today-fixture")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-adjust-today-fixture", "loaded");
    }
  }, state);
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
  await page.goto(`${baseUrl}/?adjust-today=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  return { context, page, errors };
}

async function assertNoOverflow(page, label) {
  await verifyLongContent(page, label);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    `${label}: no horizontal overflow`,
  );
  const panel = page.locator(".modal-layer > main");
  if (await panel.count()) {
    const box = await panel.boundingBox();
    assert.ok(box.y >= 0 && box.y + Math.min(box.height, page.viewportSize().height) <= page.viewportSize().height + 1, `${label}: sheet stays within viewport`);
  }
}

function contrastRatio(foreground, background) {
  const channels = (value) => {
    const match = String(value).match(/[\d.]+/g);
    assert.ok(match?.length >= 3, `Could not parse color ${value}`);
    return match.slice(0, 3).map(Number);
  };
  const luminance = (value) => {
    const linear = channels(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function assertReadable(locator, label, minimum = 4.5) {
  const colors = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    let current = element;
    let background = null;
    while (current) {
      const candidate = getComputedStyle(current).backgroundColor;
      const alpha = Number(candidate.match(/[\d.]+/g)?.[3] ?? 1);
      if (alpha >= 0.99) {
        background = candidate;
        break;
      }
      current = current.parentElement;
    }
    return { foreground, background: background || "rgb(255, 255, 255)" };
  });
  const ratio = contrastRatio(colors.foreground, colors.background);
  assert.ok(
    ratio >= minimum,
    `${label}: contrast ${ratio.toFixed(2)} is below ${minimum} (${colors.foreground} on ${colors.background})`,
  );
}

async function assertCompactAdjustHeader(page, label) {
  const [header, eyebrow] = await Promise.all([
    page.locator(".adjust-today-sheet > .detail-header").boundingBox(),
    page.locator(".adjust-today-sheet > .eyebrow").first().boundingBox(),
  ]);
  const gap = eyebrow.y - (header.y + header.height);
  assert.ok(gap >= 4 && gap <= 10, `${label}: header-to-content gap is ${gap}px`);
}

async function auditAdjustmentScreens(page, label) {
  await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await page.getByRole("heading", { name: "What changed today?" }).waitFor();
  await assertCompactAdjustHeader(page, `${label} mode`);
  await page.screenshot({ path: output(`matrix-${label}-01-mode.png`) });
  await assertReadable(page.getByRole("heading", { name: "What changed today?" }), `${label} mode heading`);
  await assertReadable(page.locator(".adjust-option-list .choice-row strong").first(), `${label} mode title`);
  await assertReadable(page.locator(".adjust-option-list .choice-row small").first(), `${label} mode description`);

  await page.getByRole("button", { name: /^Less time/ }).click();
  await assertCompactAdjustHeader(page, `${label} less time`);
  await page.screenshot({ path: output(`matrix-${label}-02-less-time.png`) });
  await assertReadable(page.locator(".adjust-chip-grid button.is-selected"), `${label} selected time`);
  await assertReadable(page.locator(".adjust-chip-grid button:not(.is-selected)").first(), `${label} unselected time`);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: /^Different equipment/ }).click();
  await assertCompactAdjustHeader(page, `${label} equipment`);
  await page.screenshot({ path: output(`matrix-${label}-03-equipment.png`) });
  const savedGym = page.locator(".adjust-saved-gyms > button").first();
  await assertReadable(savedGym.locator("strong"), `${label} saved gym label`);
  await assertReadable(savedGym.locator("small"), `${label} saved gym equipment`);
  await savedGym.click();
  await assertReadable(page.locator(".adjust-saved-gyms > button.is-selected > i"), `${label} selected gym check`, 3);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: /^Low energy/ }).click();
  await assertCompactAdjustHeader(page, `${label} low energy`);
  await page.screenshot({ path: output(`matrix-${label}-04-low-energy.png`) });
  await assertReadable(page.getByRole("heading", { name: "Keep the intent. Reduce the fatigue." }), `${label} low-energy heading`);
  await assertReadable(page.locator(".adjust-calm-note"), `${label} low-energy note`);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: /^Something is unavailable/ }).click();
  await assertCompactAdjustHeader(page, `${label} unavailable`);
  await page.screenshot({ path: output(`matrix-${label}-05-unavailable.png`) });
  await assertReadable(page.locator(".adjust-check-list > button > span").first(), `${label} unavailable exercise`);
  await page.getByRole("button", { name: /Close Adjust today/i }).click();
  await page.locator(".modal-layer").waitFor({ state: "detached" });
}

async function openMode(page, label) {
  await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await page.getByRole("heading", { name: "What changed today?" }).waitFor();
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
}

async function createLessTimeReview(page, captureLoading = false) {
  await openMode(page, "Less time");
  const presets = page.locator('.adjust-chip-grid button:not(:has-text("Custom"))');
  await presets.first().click();
  const review = page.getByRole("button", { name: /REVIEW \d+-MINUTE WORKOUT/ });
  if (captureLoading) {
    await review.click({ noWaitAfter: true });
    await page.locator(".adjust-loading").waitFor();
    const adjusting = page.getByRole("button", { name: "ADJUSTING…" });
    assert.equal(await adjusting.isDisabled(), true, "generation disables repeat submission");
    assert.equal(await adjusting.getAttribute("aria-busy"), "true");
    await page.screenshot({ path: output("07-loading.png") });
  } else await review.click();
  await page.locator(".adjust-review-section").first().waitFor();
}

{
  const { context, page, errors } = await open(fixture());
  await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).waitFor();
  await page.screenshot({ path: output("01-today-entry.png") });
  await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await page.screenshot({ path: output("02-mode-picker.png") });
  await page.getByRole("button", { name: /^Less time/ }).click();
  await page.screenshot({ path: output("03-less-time.png") });
  await page.getByRole("button", { name: /REVIEW \d+-MINUTE WORKOUT/ }).click({ noWaitAfter: true });
  await page.locator(".adjust-loading").waitFor();
  const adjusting = page.getByRole("button", { name: "ADJUSTING…" });
  assert.equal(await adjusting.isDisabled(), true, "loading CTA is visibly disabled");
  assert.equal(await adjusting.getAttribute("aria-busy"), "true");
  await page.screenshot({ path: output("07-loading.png") });
  await page.locator(".adjust-review-section").first().waitFor();
  await page.screenshot({ path: output("08-review.png"), fullPage: true });
  await page.getByRole("button", { name: "USE THIS WORKOUT" }).click();
  await page.getByText("Today only · Adjusted for today").waitFor();
  await page.screenshot({ path: output("09-adapted-today.png") });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(stored.todayAdaptation.schemaVersion, 1);
  assert.equal(stored.program.days.find((day) => day.id === stored.todayAdaptation.programDayId).exercises.length, stored.todayAdaptation.originalWorkout.exercises.length);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Today only · Adjusted for today").waitFor();
  await page.getByRole("button", { name: "Restore original" }).click();
  await page.getByText("Restore the original workout?").waitFor();
  await page.screenshot({ path: output("10-restore-original.png") });
  await page.getByRole("button", { name: "KEEP ADJUSTMENT" }).click();
  await page.getByRole("button", { name: "DONE" }).click();
  await page.getByRole("button", { name: "START WORKOUT" }).click();
  await page.locator(".workout-screen").waitFor();
  await page.screenshot({ path: output("15-adjusted-workout-started.png") });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".active-workout-hero").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).count(),
    0,
    "Adjust Today stays unavailable after the workout starts",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await openMode(page, "Different equipment");
  await page.screenshot({ path: output("04-different-equipment.png") });
  assert.equal(await page.getByRole("group", { name: "Saved gyms" }).count(), 1);
  await page.getByRole("button", { name: /Choose equipment/ }).click();
  assert.equal(await page.getByRole("group", { name: "Equipment available today" }).count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await openMode(page, "Low energy");
  await page.screenshot({ path: output("05-low-energy.png") });
  await page.getByRole("button", { name: "REVIEW LOWER-FATIGUE WORKOUT" }).click();
  await page.getByText(/More reps in reserve|One set removed/).first().waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await openMode(page, "Something is unavailable");
  await page.screenshot({ path: output("06-something-unavailable.png") });
  const rows = page.getByRole("group", { name: "Unavailable exercises" }).locator("button");
  await rows.nth(0).click();
  await rows.nth(1).click();
  await page.getByRole("button", { name: "FIND REPLACEMENTS" }).click();
  await page.getByText("Future workouts remain based on your original plan.").waitFor();
  await page.screenshot({ path: output("08-simple-review.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture({ custom: true });
  const { context, page, errors } = await open(state, { width: 320, height: 720 });
  await openMode(page, "Something is unavailable");
  await page.getByRole("group", { name: "Unavailable exercises" }).locator("button").first().click();
  await page.getByRole("button", { name: "FIND REPLACEMENTS" }).click();
  const unresolved = page.locator(".adjust-unresolved");
  await unresolved.getByText(/needs a replacement/).waitFor();
  assert.equal(await page.getByRole("button", { name: "USE THIS WORKOUT" }).isDisabled(), true);
  await unresolved.scrollIntoViewIfNeeded();
  await assertNoOverflow(page, "no-valid-replacement");
  await page.screenshot({ path: output("13-no-valid-replacement.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

const themes = [
  ["light", "standard", 320, "light"],
  ["dark", "standard", 390, "dark"],
  ["light", "premium", 430, "premium-light"],
  ["dark", "premium", 390, "premium-dark"],
];
for (const [appearance, style, width, label] of themes) {
  const { context, page, errors } = await open(
    fixture({ appearance, style }),
    { width, height: 844 },
  );
  await page.screenshot({ path: output(`matrix-${label}-${width}-00-entry.png`) });
  await auditAdjustmentScreens(page, `${label}-${width}`);
  await createLessTimeReview(page);
  await assertNoOverflow(page, `${label}-${width}`);
  await assertReadable(page.locator(".adjust-keep-row strong").first(), `${label}-${width} review exercise`);
  await assertReadable(page.locator(".adjust-change-row small").first(), `${label}-${width} review reason`);
  const applyButton = page.getByRole("button", { name: "USE THIS WORKOUT" });
  await applyButton.scrollIntoViewIfNeeded();
  await applyButton.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.appearance), appearance);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.style), style);
  await page.screenshot({ path: output(`12-review-${label}-${width}.png`) });
  await applyButton.click();
  await page.getByText("Today only · Adjusted for today").waitFor();
  await page.screenshot({ path: output(`matrix-${label}-${width}-07-applied.png`) });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await page.clock.install({ time: new Date() });
  await createLessTimeReview(page);
  await page.clock.setFixedTime(new Date(Date.now() + 86400000));
  const applyButton = page.getByRole("button", { name: "USE THIS WORKOUT" });
  await applyButton.scrollIntoViewIfNeeded();
  await applyButton.click();
  await page.getByText(/workout changed.*create the adjustment again/i).waitFor();
  assert.equal(await applyButton.isDisabled(), true, "stale review cannot be submitted again");
  assert.notEqual(
    await applyButton.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(31, 107, 76)",
    "stale CTA no longer retains the active primary treatment",
  );
  await page.screenshot({ path: output("17-stale-review.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(completedAdjustedFixture());
  await page.getByRole("button", { name: /WORKOUT COMPLETE.*VIEW HISTORY/ }).click();
  await page.getByText("Adjusted workout · Today only").waitFor();
  await page.screenshot({ path: output("16-history-marker.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await createLessTimeReview(page);
  const before = await page.evaluate(() => localStorage.getItem("lift-v2-state"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "lift-v2-state") {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  const applyButton = page.getByRole("button", { name: "USE THIS WORKOUT" });
  await applyButton.scrollIntoViewIfNeeded();
  await applyButton.click();
  await page.getByText(/couldn.t save this adjustment/i).waitFor();
  assert.equal(await applyButton.isDisabled(), true, "failed persistence disables repeat apply");
  const after = await page.evaluate(() => localStorage.getItem("lift-v2-state"));
  assert.equal(after, before, "failed persistence leaves the durable original state untouched");
  assert.ok(
    (await page.locator(".adjust-review-section").count()) >= 1,
    "failed persistence keeps the review open",
  );
  await page.screenshot({ path: output("14-persistence-failure.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture());
  await context.setOffline(true);
  await page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await page.getByRole("heading", { name: "What changed today?" }).waitFor();
  await page.screenshot({ path: output("11-offline-local.png") });
  await page.getByRole("button", { name: /^Low energy/ }).click();
  await page.getByRole("button", { name: "REVIEW LOWER-FATIGUE WORKOUT" }).click();
  await page.getByRole("button", { name: "USE THIS WORKOUT" }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log("Adjust Today QA passed: entry, all modes, loading, simple/long/stale reviews, apply/reload/start recovery, adjusted History, restore confirmation, offline behavior, no-match and persistence failure states, widths, and four themes are clean.");
