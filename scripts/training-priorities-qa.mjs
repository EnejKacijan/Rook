import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import {
  blankState,
  buildProgram,
  exerciseCatalog,
  STORAGE_KEY,
  weeklyDirectVolume,
} from "../src/domain.js";

const root = "artifacts/training-priorities";
await mkdir(root, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];

const themeLabel = (appearance, style) => `${style}-${appearance}`;

async function contextFor({
  width = 390,
  appearance = "light",
  style = "standard",
  state = blankState(),
} = {}) {
  Object.assign(state.profile, {
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  });
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"available":false}',
    }),
  );
  await page.goto("http://127.0.0.1:4173", {
    waitUntil: "domcontentloaded",
  });
  return { context, page, errors };
}

async function reachPriorities(page, { days = 4, minutes = 60 } = {}) {
  const next = () =>
    page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByRole("button", { name: "BUILD MY PLAN", exact: true }).click();
  await page.getByRole("combobox", { name: "Age range" }).click();
  await page.getByRole("option", { name: "18–29" }).click();
  await next();
  await page.getByRole("button", { name: "Build muscle", exact: true }).click();
  await page.getByRole("button", { name: /^Intermediate/ }).click();
  await page.getByRole("button", { name: `${days} days`, exact: true }).click();
  const dayOptions = page.locator(".schedule-days .onboarding-option");
  for (const index of [0, 1, 3, 5].slice(0, days))
    await dayOptions.nth(index).click();
  await page.getByRole("button", { name: `${minutes} min`, exact: true }).click();
  await next();
  await page.getByRole("button", { name: "Commercial gym", exact: true }).click();
  await next();
  await page.getByRole("heading", {
    name: "What would you like to emphasize?",
  }).waitFor();
}

async function priorityGeometry(page) {
  return page.locator(".priority-choice-groups").evaluate((root) => {
    const balanced = root.querySelector(".priority-balanced-option button");
    const emphasis = [...root.querySelectorAll(".priority-emphasis-choice button")];
    const balancedRect = balanced.getBoundingClientRect();
    const emphasisRects = emphasis.map((button) => button.getBoundingClientRect());
    return {
      balancedWidth: balancedRect.width,
      groupWidth: root.getBoundingClientRect().width,
      columns: new Set(emphasisRects.map((rect) => Math.round(rect.left))).size,
      heights: emphasisRects.map((rect) => rect.height),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function selectAbs(page) {
  const choices = page.locator(".priority-choice-groups");
  await choices.getByRole("button", { name: "Abs / core", exact: true }).click();
  await page.getByText("1 of 2 selected", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Balanced", exact: true }).getAttribute("aria-pressed"),
    "false",
  );
}

async function captureSelectionCase(options) {
  const { width, appearance, style, variant, selections = [] } = options;
  const { context, page, errors } = await contextFor({
    width,
    appearance,
    style,
  });
  await reachPriorities(page);
  for (const selection of selections)
    await page.locator(".priority-choice-groups").getByRole("button", { name: selection, exact: true }).click();
  const geometry = await priorityGeometry(page);
  assert.ok(geometry.balancedWidth >= geometry.groupWidth - 1);
  assert.equal(geometry.columns, 2);
  assert.equal(geometry.overflow, false);
  assert.ok(geometry.heights.every(height=>height>=44),'wrapped priority labels retain mobile targets');
  for(let i=0;i<geometry.heights.length;i+=2)assert.ok(Math.abs(geometry.heights[i]-geometry.heights[i+1])<=1,'cells align within each row');
  await page.screenshot({
    path: `${root}/${variant}-${width}-${themeLabel(appearance, style)}.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  results.push({ variant, width, appearance, style, geometry });
  await context.close();
}

async function captureGenerated({
  label,
  priority,
  width = 390,
  appearance = "light",
  style = "standard",
  days = 4,
  minutes = 60,
}) {
  const { context, page, errors } = await contextFor({
    width,
    appearance,
    style,
  });
  await reachPriorities(page, { days, minutes });
  if (priority !== "Balanced") {
    await selectAbs(page);
    if (priority === "Chest + Abs / core")
      await page.getByRole("button", { name: "Chest", exact: true }).click();
  }
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByRole("button", { name: /Balanced workload/ }).click();
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await page.getByRole("button", { name: "BUILD MY PLAN", exact: true }).click();
  await page.getByRole("heading", { name: "Your week is ready." }).waitFor({
    timeout: 30000,
  });
  const fullText = await page.locator(".generated-plan-preview").innerText();
  if (priority !== "Balanced") assert.match(fullText, /Cable Crunch/);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await page.screenshot({
    path: `${root}/${label}.png`,
    fullPage: true,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  await context.close();
}

try {
  for (const [appearance, style] of [
    ["light", "standard"],
    ["dark", "standard"],
    ["light", "premium"],
    ["dark", "premium"],
  ])
    await captureSelectionCase({
      width: 390,
      appearance,
      style,
      variant: "abs-selected",
      selections: ["Abs / core"],
    });

  await captureSelectionCase({
    width: 390,
    appearance: "light",
    style: "standard",
    variant: "balanced-selected",
  });
  await captureSelectionCase({
    width: 390,
    appearance: "dark",
    style: "standard",
    variant: "chest-and-abs",
    selections: ["Chest", "Abs / core"],
  });

  const attempted = await contextFor({ width: 390, appearance: "light" });
  await reachPriorities(attempted.page);
  const attemptedChoices = attempted.page.locator(".priority-choice-groups");
  await attemptedChoices.getByRole("button", { name: "Chest", exact: true }).click();
  await attemptedChoices.getByRole("button", { name: "Abs / core", exact: true }).click();
  const third = attemptedChoices.getByRole("button", { name: "Back", exact: true });
  assert.equal(await third.getAttribute("aria-disabled"), "true");
  await third.evaluate((button) => button.click());
  await attempted.page.getByText("Deselect one to choose another.", { exact: true }).waitFor();
  assert.equal(await third.getAttribute("aria-pressed"), "false");
  await attempted.page.screenshot({
    path: `${root}/attempted-third-390-standard-light.png`,
    animations: "disabled",
  });
  assert.deepEqual(attempted.errors, []);
  await attempted.context.close();

  await captureSelectionCase({
    width: 320,
    appearance: "dark",
    style: "premium",
    variant: "two-selected-narrow",
    selections: ["Hamstrings / glutes", "Abs / core"],
  });

  const profileState = blankState();
  Object.assign(profileState.profile, {
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 4,
    availableDays: ["Mon", "Tue", "Thu", "Sat"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Abs / core"],
    prioritySources: {
      manual: ["Abs / core"],
      physiqueSuggested: [],
      physiqueConfirmed: [],
    },
    onboardingComplete: true,
  });
  profileState.program = buildProgram(profileState.profile);
  const profileCase = await contextFor({
    width: 390,
    appearance: "dark",
    style: "standard",
    state: profileState,
  });
  await profileCase.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await profileCase.page.locator('[data-profile-area="training"]').click();
  await profileCase.page.getByRole("button", { name: /Training priorities/ }).click();
  await profileCase.page.getByRole("heading", { name: "What would you like to emphasize?" }).waitFor();
  assert.equal((await priorityGeometry(profileCase.page)).columns, 2);
  await profileCase.page.locator('.priority-settings').evaluate(e=>e.scrollTop=e.scrollHeight);
  const [lastPriorityBox, actionFooterBox] = await Promise.all([
    profileCase.page.locator(".priority-emphasis-choice .onboarding-option").last().boundingBox(),
    profileCase.page.locator(".priority-settings .sheet-action-footer").boundingBox(),
  ]);
  assert.ok(lastPriorityBox && actionFooterBox);
  assert.ok(
    lastPriorityBox.y + lastPriorityBox.height <= actionFooterBox.y,
    "Profile priority choices must clear the sticky action footer",
  );
  await profileCase.page.screenshot({
    path: `${root}/profile-review-priorities-390-standard-dark.png`,
    animations: "disabled",
  });
  assert.deepEqual(profileCase.errors, []);
  await profileCase.context.close();

  await captureGenerated({
    label: "generated-balanced-390-standard-light",
    priority: "Balanced",
  });
  await captureGenerated({
    label: "generated-abs-390-standard-light",
    priority: "Abs / core",
  });
  await captureGenerated({
    label: "generated-abs-short-320-premium-dark",
    priority: "Abs / core",
    width: 320,
    appearance: "dark",
    style: "premium",
    minutes: 30,
  });

  const comparisonProfile = (priorities) => ({
    ...blankState().profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 4,
    availableDays: ["Mon", "Tue", "Thu", "Sat"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities,
    prioritySources: {
      manual: priorities,
      physiqueSuggested: [],
      physiqueConfirmed: [],
    },
  });
  const balanced = buildProgram(comparisonProfile(["Balanced"]));
  const abs = buildProgram(comparisonProfile(["Abs / core"]));
  await writeFile(
    `${root}/plan-comparison.json`,
    JSON.stringify(
      {
        balanced: {
          name: balanced.name,
          directVolume: weeklyDirectVolume(balanced),
        },
        absCore: {
          name: abs.name,
          directVolume: weeklyDirectVolume(abs),
          exercises: coreRows(abs).map(({ day, exercise }) => ({
            day: day.weekday,
            name: exerciseCatalog[exercise.exerciseId].name,
            sets: exercise.sets.length,
          })),
        },
      },
      null,
      2,
    ),
  );
  await writeFile(`${root}/geometry.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

function coreRows(program) {
  return program.days.flatMap((day) =>
    day.exercises
      .filter((exercise) => exerciseCatalog[exercise.exerciseId]?.pattern === "core")
      .map((exercise) => ({ day, exercise })),
  );
}

console.log("Training priorities runtime QA passed.");
