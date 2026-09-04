import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { buildProgram, weekday } from "../src/domain.js";

const outputRoot = new URL("../artifacts/profile-logging/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
function ensureWorkoutToday(state) {
  const today = weekday();
  const scheduled = state.program.days.find((day) => day.weekday === today);
  if (scheduled) return;
  const day = state.program.days[0];
  const replaced = day.weekday;
  day.weekday = today;
  state.profile.availableDays = state.profile.availableDays.map((value) =>
    value === replaced ? today : value,
  );
  state.program.rotationStartDate = null;
}

async function openState(
  state,
  viewport = { width: 390, height: 844 },
  colorScheme = "light",
) {
  const context = await browser.newContext({ viewport, colorScheme });
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

async function profileText(page) {
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  const text = await page.locator(".profile-screen").innerText();
  assert.equal(
    await page
      .getByRole("heading", { name: "Training profile", level: 1 })
      .count(),
    1,
    "Profile keeps a stable page heading",
  );
  assert.equal(
    await page.getByText("CURRENT PROGRAM", { exact: true }).count(),
    1,
    "active program identity is explicit",
  );
  assert.doesNotMatch(
    text,
    /null min|undefined|\bnull\b|Not provided/i,
    "Profile never exposes raw missing values",
  );
  assert.equal(
    await page.getByRole("button", { name: "IMPORT PLAN FROM NOTES" }).count(),
    0,
    "import is not a permanent large CTA",
  );
  assert.equal(
    await page.getByRole("button", { name: "REBUILD PROGRAM" }).count(),
    0,
    "rebuild is not a permanent large CTA",
  );
  return text;
}

const complete = createReturningUserFixture(2);
complete.profile = {
  ...complete.profile,
  name: "Alex",
  ageRange: "30–39",
  sex: "Prefer not to say",
  restTimerEnabled: true,
  restTimerAutoStart: true,
};
ensureWorkoutToday(complete);
{
  const { context, page, errors } = await openState(complete);
  const text = await profileText(page);
  assert.match(text, /ABOUT YOU[\s\S]*Alex[\s\S]*30–39/);
  assert.doesNotMatch(text, /COMPLETE YOUR PROFILE/);
  assert.equal(
    await page.getByRole("button", { name: /Edit plan/ }).count(),
    1,
    "program actions use normal title casing",
  );
  assert.equal(
    await page.getByRole("button", { name: /Ask Coach to adjust/ }).count(),
    1,
    "Coach action uses normal title casing",
  );
  assert.equal(
    await page.getByRole("button", { name: /Replace plan/ }).count(),
    1,
    "replacement action uses normal title casing",
  );
  assert.equal(
    await page.getByRole("button", { name: /^Availability/ }).count(),
    1,
    "Availability is a real interactive planning preference",
  );
  assert.equal(
    await page.getByRole("button", { name: /^Training environment/ }).count(),
    1,
    "Training environment is a real interactive planning preference",
  );
  assert.equal(
    await page.getByRole("button", { name: /^Available equipment/ }).count(),
    1,
    "Available equipment is a real interactive planning preference",
  );
  assert.equal(
    await page.getByText(
      "Used by Coach and future plan changes. Your current program is edited separately.",
      { exact: true },
    ).count(),
    1,
    "Profile separates planning preferences from the current program",
  );
  const programBeforeProfileEdits = await page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem("lift-v2-state")).program),
  );
  const programShapeBeforeProfileEdits = await page.evaluate(() => {
    const program = JSON.parse(localStorage.getItem("lift-v2-state")).program;
    return {
      id: program.id,
      days: program.days.map((day) => ({
        weekday: day.weekday,
        exercises: day.exercises.map((exercise) => exercise.exerciseId),
      })),
    };
  });
  await page.getByRole("button", { name: /^Availability/ }).click();
  assert.equal(
    await page.locator(".day-options button:disabled").count(),
    0,
    "current program days are not locked into future availability",
  );
  const extraAvailableDay = page
    .locator('.day-options button[aria-pressed="false"]')
    .first();
  await extraAvailableDay.click();
  await page.getByRole("button", { name: "SAVE AVAILABILITY" }).click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lift-v2-state")).profile.availableDays
          .length,
    ),
    complete.profile.availableDays.length + 1,
    "extra availability saves without moving current workouts",
  );
  await page.getByRole("button", { name: /^Training environment/ }).click();
  await page.getByRole("button", { name: "Home gym" }).click();
  await page.getByRole("button", { name: "Dumbbells" }).click();
  assert.equal(
    await page.getByRole("button", { name: "SAVE SETUP" }).isDisabled(),
    false,
    "future setup preferences are not blocked by the current plan",
  );
  assert.equal(
    await page
      .getByText(/current program uses equipment outside this setup/i)
      .count(),
    0,
    "the current program is not invalidated by preference changes",
  );
  await page.getByRole("button", { name: "SAVE SETUP" }).click();
  assert.match(
    await page.getByRole("button", { name: /^Training environment/ }).innerText(),
    /Home gym/,
  );
  await page.getByRole("button", { name: /^Available equipment/ }).click();
  await page.getByRole("button", { name: "Resistance bands" }).click();
  await page.getByRole("button", { name: "SAVE SETUP" }).click();
  assert.match(
    await page.getByRole("button", { name: /^Available equipment/ }).innerText(),
    /Dumbbells, Resistance bands/,
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(JSON.parse(localStorage.getItem("lift-v2-state")).program),
    ),
    programBeforeProfileEdits,
    "profile setup edits never silently rebuild the current program",
  );
  await page.reload({ waitUntil: "networkidle" });
  await profileText(page);
  assert.deepEqual(
    await page.evaluate(() => {
      const program = JSON.parse(localStorage.getItem("lift-v2-state")).program;
      return {
        id: program.id,
        days: program.days.map((day) => ({
          weekday: day.weekday,
          exercises: day.exercises.map((exercise) => exercise.exerciseId),
        })),
      };
    }),
    programShapeBeforeProfileEdits,
    "planning preference changes cannot invalidate the current program after reload",
  );
  await page.getByRole("button", { name: /Ask Coach to adjust/i }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Ask Coach" }).inputValue(),
    "I want to adjust my current training plan.",
  );
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Profile has no horizontal overflow at ${width}px`,
    );
    await page.screenshot({
      path: output(`${width}-profile-personalized.png`),
    });
  }
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForTimeout(40);
    const logout = await page
      .getByRole("button", { name: "Log out" })
      .boundingBox();
    const navigation = await page.locator(".bottom-nav").boundingBox();
    const gap = navigation.y - (logout.y + logout.height);
    assert.ok(
      gap >= 10 && gap <= 14,
      `Profile keeps a compact safe gap above navigation at ${width}px: ${gap}`,
    );
    await page.screenshot({
      path: output(`${width}-profile-bottom-spacing.png`),
      fullPage: false,
    });
  }
  await page.getByRole("button", { name: "Replace plan" }).click();
  await page.getByRole("button", { name: /Import from Notes/ }).waitFor();
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: /Logging & increments/ }).click();
  await page.setViewportSize({ width: 390, height: 620 });
  const lightUnitContrast = await page.locator(".unit-segmented").evaluate((control) => {
    const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const track = channels(getComputedStyle(control).backgroundColor);
    const indicator = channels(getComputedStyle(control, "::before").backgroundColor);
    return {
      delta: indicator.reduce((sum, value, index) => sum + Math.abs(value - track[index]), 0),
      active: getComputedStyle(control.querySelector(".active")).color,
      inactive: getComputedStyle(control.querySelector("button:not(.active)")).color,
    };
  });
  assert.ok(lightUnitContrast.delta >= 24, "Standard Light selected unit has a clearly differentiated filled surface");
  assert.notEqual(lightUnitContrast.active, lightUnitContrast.inactive, "Standard Light selected unit text is distinct");
  const rirSwitch = page.getByRole("switch", {
    name: "Track reps in reserve (RIR)",
  });
  const rirInitiallyEnabled = await rirSwitch.isChecked();
  const rirHelp = page.getByRole("button", { name: "What is RIR?" });
  const rirHelpBox = await rirHelp.boundingBox();
  assert.ok(rirHelpBox.width >= 44 && rirHelpBox.height >= 44);
  await rirHelp.click();
  const rirTooltip = page.getByRole("tooltip");
  await rirTooltip.waitFor();
  await page.waitForTimeout(50);
  assert.match(await rirTooltip.innerText(), /Reps in reserve[\s\S]*0 = none left/);
  assert.equal(
    await rirSwitch.isChecked(),
    rirInitiallyEnabled,
    "opening help never changes the RIR setting",
  );
  await page.screenshot({ path: output("390-logging-rir-help.png") });
  await page.mouse.click(10, 300);
  await rirTooltip.waitFor({ state: "detached" });
  assert.equal(
    await page.getByRole("switch", { name: "Rest timer" }).isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "Auto-start after completed set" })
      .isChecked(),
    true,
  );
  const restDuration = page.getByRole("combobox", { name: "Rest duration" });
  assert.equal(
    await restDuration.inputValue(),
    "",
    "existing behavior remains By exercise by default",
  );
  for (const width of [375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: 620 });
    await page.screenshot({ path: output(`${width}-logging.png`) });
  }
  await restDuration.selectOption("120");
  assert.equal(await restDuration.inputValue(), "120");
  await page.screenshot({
    path: output("390-logging-fixed-rest.png"),
    fullPage: false,
  });
  const barbell = page.getByRole("spinbutton", { name: "Barbell increment" });
  await barbell.fill("5");
  await barbell.blur();
  await page.getByRole("button", { name: "lb", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Barbell increment"]')?.value ===
      "11.02",
  );
  assert.equal(
    await barbell.inputValue(),
    "11.02",
    "unit display converts without changing canonical kg value",
  );
  await page.getByRole("button", { name: "kg", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Barbell increment"]')?.value === "5",
  );
  assert.equal(await barbell.inputValue(), "5");
  await barbell.fill("0");
  await barbell.blur();
  assert.equal(
    await barbell.inputValue(),
    "5",
    "non-positive increment is rejected",
  );
  await page
    .locator(".setting-switch")
    .filter({ hasText: "Auto-start after completed set" })
    .click();
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  await page.getByRole("button", { name: "START WORKOUT" }).click();
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await page.locator(".rest-timer.rest-ready").waitFor();
  assert.equal(
    await page.locator(".rest-timer.rest-ready strong").textContent(),
    "2:00",
    "fixed rest duration overrides the exercise prescription",
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.rest
          .seconds,
    ),
    120,
    "fixed rest duration persists into workout timer state",
  );
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.getByRole("button", { name: "SKIP", exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to Today" }).click();
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  const disabledEdit = page.getByRole("button", { name: /Edit plan/ });
  assert.equal(
    await disabledEdit.isDisabled(),
    true,
    "Edit plan remains unavailable during an active workout",
  );
  assert.match(
    await disabledEdit.innerText(),
    /Finish your active workout first\./,
    "disabled Edit plan keeps a readable explanation",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

const partial = createReturningUserFixture(1);
partial.profile = {
  ...partial.profile,
  name: "",
  ageRange: null,
  sex: null,
  sessionMinutes: null,
};
partial.program = buildProgram(partial.profile);
{
  const { context, page, errors } = await openState(partial);
  const text = await profileText(page);
  assert.match(text, /COMPLETE YOUR PROFILE[\s\S]*Add a few details/);
  assert.equal(
    await page
      .locator(".complete-profile")
      .evaluate((element) => getComputedStyle(element).borderLeftWidth),
    "2px",
    "unfinished profile callout has a subtle accent",
  );
  assert.doesNotMatch(text, /Session length/);
  await page.screenshot({
    path: output("390-profile-incomplete.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: /Add a few details/ }).click();
  await page.getByRole("heading", { name: "Complete your profile" }).waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Sex" }).count(),
    0,
    "Sex no longer uses a viewport-clipping native select",
  );
  const sexTrigger = page.locator(".profile-sex-trigger");
  assert.match(await sexTrigger.getAttribute("aria-label") || await sexTrigger.getAttribute("aria-labelledby"), /profile-sex-label/);
  await sexTrigger.click();
  const sexGroup = page.getByRole("group", { name: "Sex" });
  await sexGroup.waitFor();
  assert.equal(
    await sexGroup.getByRole("radio").count(),
    5,
    "Sex choices use native radio semantics",
  );
  assert.deepEqual(
    await sexGroup.locator("label > span").allTextContents(),
    ["Not set", "Female", "Male", "Intersex", "Prefer not to say"],
    "inclusive option set remains complete",
  );
  await page.screenshot({
    path: output("390-profile-sex-options.png"),
    fullPage: false,
  });
  await page.getByText("Intersex", { exact: true }).click();
  await page.getByRole("group", { name: "Sex" }).waitFor({ state: "detached" });
  assert.equal(await sexTrigger.getAttribute("aria-expanded"), "false");
  assert.match(await sexTrigger.innerText(), /Intersex/);
  assert.equal(
    await sexTrigger.evaluate((element) => document.activeElement === element),
    true,
    "selection collapses the options and restores focus to the disclosure",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

for (const importedExtra of [false, true]) {
  const state = createReturningUserFixture(1);
  state.program.source = "ai-import";
  state.program.name = "Weekly Workout Plan: Build Muscle, 4 days/week";
  state.profile = {
    ...state.profile,
    name: importedExtra ? "Mina" : "",
    ageRange: importedExtra ? "18–29" : null,
    sex: null,
    sessionMinutes: null,
  };
  const { context, page, errors } = await openState(state);
  const text = await profileText(page);
  assert.match(text, /Imported plan[\s\S]*4 days\/week/);
  assert.equal(
    await page
      .getByRole("heading", { name: "Imported plan", level: 2 })
      .count(),
    1,
    "imported plan is presented as the current program, not the page title",
  );
  assert.doesNotMatch(text, /Weekly Workout Plan|4 days\/week · 4 days/);
  assert.match(text, /COACHING PREFERENCES/);
  assert.match(text, /Changes don’t update this plan\./);
  assert.equal(
    await page.getByText("TRAINING PRIORITIES", { exact: true }).count(),
    0,
    "an imported plan does not present preferences as properties of the current program",
  );
  await page.getByRole("button", { name: /Edit priorities/ }).click();
  await page
    .getByRole("heading", { name: "What would you like Coach to emphasize?" })
    .waitFor();
  assert.match(
    await page.locator(".priority-settings").innerText(),
    /Your current plan won’t change automatically\./,
  );
  assert.equal(
    await page.getByRole("button", { name: "SAVE PREFERENCES" }).count(),
    1,
  );
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.screenshot({
    path: output(
      `390-profile-imported-${importedExtra ? "with-details" : "incomplete"}.png`,
    ),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Replace plan" }).click();
  await page.getByRole("button", { name: /Import a different plan/ }).waitFor();
  await page.getByRole("button", { name: /Build a personalized plan/ }).click();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /Workout history will remain/,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = createReturningUserFixture(1);
  state.program.source = "manual";
  state.program.name = "My training plan";
  const { context, page, errors } = await openState(state);
  const text = await profileText(page);
  assert.match(text, /COACHING PREFERENCES/);
  assert.match(
    text,
    /Used by Coach and future generated plans\. Changes don’t update this plan\./,
  );
  assert.equal(
    await page.getByText("TRAINING PRIORITIES", { exact: true }).count(),
    0,
    "a scratch plan uses coaching-preference semantics",
  );
  await page.getByRole("button", { name: /Edit priorities/ }).click();
  await page
    .getByRole("heading", { name: "What would you like Coach to emphasize?" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "SAVE PREFERENCES" }).count(),
    1,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

for (const environment of ["Commercial gym", "Home gym"]) {
  const state = createReturningUserFixture(1);
  state.profile.environment = environment;
  state.profile.equipment =
    environment === "Commercial gym"
      ? ["full gym"]
      : ["dumbbells", "resistance bands"];
  state.program = buildProgram(state.profile);
  const { context, page, errors } = await openState(state);
  const text = await profileText(page);
  assert.match(text, new RegExp(environment));
  assert.match(
    text,
    environment === "Commercial gym"
      ? /Full gym/
      : /Dumbbells, Resistance bands/i,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = createReturningUserFixture(1);
  ensureWorkoutToday(state);
  const { context, page, errors } = await openState(state);
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  assert.equal(
    await page.getByText("ILLUSTRATION CREDITS", { exact: true }).count(),
    0,
    "illustration attribution does not sit outside Appearance on Profile",
  );
  await page.getByRole("button", { name: /^Appearance/ }).click();
  assert.equal(
    await page.getByText("ILLUSTRATION CREDITS", { exact: true }).count(),
    1,
    "Appearance owns the illustration attribution",
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Bryl Lim / Everkinetic" })
      .getAttribute("href"),
    "https://bryllim.github.io/workout-guide/",
  );
  assert.equal(
    await page.getByRole("link", { name: "CC BY-SA 4.0" }).getAttribute("href"),
    "https://creativecommons.org/licenses/by-sa/4.0/",
  );
  const illustrations = page.getByRole("switch", {
    name: "Exercise illustrations",
  });
  assert.equal(
    await illustrations.isChecked(),
    true,
    "exercise illustrations are enabled by default",
  );
  await page
    .locator(".setting-switch")
    .filter({ hasText: "Exercise illustrations" })
    .click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("lift-v2-state")).profile
          .showExerciseImages,
    ),
    false,
    "display preference persists immediately",
  );
  assert.equal(
    await page.getByText("ILLUSTRATION CREDITS", { exact: true }).count(),
    1,
    "credits remain visible when illustrations are turned off",
  );
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  assert.equal(
    await page.locator(".exercise-preview img").count(),
    0,
    "Today hides exercise illustrations when disabled",
  );
  await page.locator(".exercise-preview .list-row").first().click();
  assert.equal(
    await page.locator(".exercise-detail-art").count(),
    0,
    "exercise detail hides its illustration when disabled",
  );
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  assert.match(
    await page.getByRole("button", { name: /^Appearance/ }).innerText(),
    /illustrations off/i,
  );
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page
    .locator(".setting-switch")
    .filter({ hasText: "Exercise illustrations" })
    .click();
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  assert.equal(
    await page.locator(".exercise-preview img").count(),
    0,
    "Today remains text-first even when detail illustrations are enabled",
  );
  await page.locator(".exercise-preview .list-row").first().click();
  assert.equal(
    await page.locator(".exercise-detail-art").count(),
    1,
    "exercise detail shows the same faithful library illustration",
  );
  assert.match(
    await page.locator(".exercise-detail-art").getAttribute("src"),
    /\/assets\/wg-.*\.svg$/,
    "exercise detail only uses the bundled library",
  );
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.getByRole("button", { name: "START WORKOUT" }).click();
  const activeArt = page.locator(".exercise-heading-art");
  if (await activeArt.count()) {
    assert.match(
      await activeArt.getAttribute("src"),
      /\/assets\/wg-.*\.svg$/,
      "active workout only uses faithful library illustrations",
    );
  }
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = createReturningUserFixture(1);
  state.profile.restTimerEnabled = false;
  state.profile.restTimerAutoStart = false;
  ensureWorkoutToday(state);
  const { context, page, errors } = await openState(state);
  await page.getByRole("button", { name: "START WORKOUT" }).click();
  await page.getByRole("button", { name: "Complete set 1" }).click();
  assert.equal(
    await page.locator(".rest-timer").count(),
    0,
    "timer UI stays hidden when disabled",
  );
  assert.deepEqual(errors, []);
  await context.close();
}

for (const [theme, colorScheme] of [
  ["light", "light"],
  ["dark", "dark"],
  ["premium", "dark"],
]) {
  const state = createReturningUserFixture(2);
  state.profile = {
    ...state.profile,
    themePreference: theme,
    availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  };
  state.program = buildProgram(state.profile);
  const { context, page, errors } = await openState(
    state,
    { width: 340, height: 700 },
    colorScheme,
  );
  const text = await profileText(page);
  assert.match(
    text,
    /Availability[\s\S]*Mon–Fri/,
    `${theme} profile uses compact continuous schedule copy`,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${theme} profile has no overflow at 340px`,
  );
  await page.screenshot({
    path: output(`340-profile-${theme}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Training environment/ }).click();
  await page.getByRole("button", { name: "Both" }).click();
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await page.getByRole("button", { name: "Resistance bands" }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${theme} equipment sheet has no overflow at 340px`,
  );
  await page.screenshot({
    path: output(`340-equipment-${theme}.png`),
    fullPage: false,
  });
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "125%";
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${theme} profile tolerates larger type without horizontal scrolling`,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Profile/Logging QA passed: clean profile states, persisted illustration preference, contextual plan actions, validated increments, unit conversion, and real rest-timer settings.",
);
