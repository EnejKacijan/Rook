import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, exerciseCatalog, STORAGE_KEY } from "../src/domain.js";

const artifacts = new URL("../artifacts/import-review-ux/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifacts));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

async function openImport(notes, { width = 390, theme = "light" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    serviceWorkers: "block",
    colorScheme: theme === "light" ? "light" : "dark",
  });
  if (theme === "premium") {
    const state = blankState();
    state.profile.themePreference = "premium";
    await context.addInitScript(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    }, { key: STORAGE_KEY, value: state });
  }
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
  await page.goto(`http://127.0.0.1:4173/?import-review=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /Already have a plan/i }).click();
  await page.getByPlaceholder(/Paste your workout notes/).fill(notes);
  await page.getByRole("button", { name: "CREATE PREVIEW" }).click();
  await page.getByRole("heading", { name: "Review your plan" }).waitFor();
  return { context, page, errors };
}

const focusedNotes = `WEEKLY WORKOUT PLAN
Goal: General fitness

MONDAY — FUNKCIONALNI DAN
Step-down 2 x 8 reps @ 20 kg
Incline Dumbbell Press 2 x 8 reps
Ravnotežje 2 x 30 sec
Mystery Flow 3 x 10 reps
`;

{
  const { context, page, errors } = await openImport(focusedNotes, {
    width: 320,
    theme: "dark",
  });
  assert.equal(
    await page.getByText("2 exercises need review", { exact: true }).count(),
    1,
    await page.locator("body").innerText(),
  );
  assert.equal(
    await page.locator(".plan-editor-exercise.needs-review").count(),
    2,
  );
  const reviewCard = page
    .locator(".plan-editor-exercise.needs-review")
    .filter({ hasText: "Ravnotežje" });
  assert.equal(await reviewCard.locator(".plan-editor-fields").count(), 1);
  assert.match(
    await reviewCard.innerText(),
    /Ravnotežje[\s\S]*2 sets · 30 sec[\s\S]*doesn’t match a specific exercise/i,
  );
  assert.equal(
    await reviewCard.getByText("NEEDS REVIEW", { exact: true }).count(),
    1,
  );
  assert.equal(
    await reviewCard.getByLabel(/Exercise name for/).count(),
    0,
    "ambiguous imports do not show a redundant name input",
  );
  assert.equal(
    await reviewCard.locator('.plan-editor-weights input').count(),
    0,
    "empty imported-weight fields stay hidden",
  );
  assert.equal(
    await reviewCard.getByRole("button", { name: "ADD IMPORTED WEIGHTS" }).count(),
    0,
    "time-based ambiguous exercises do not expose irrelevant weight controls",
  );
  assert.equal(
    await reviewCard.locator(".import-review-weights").count(),
    0,
    "the complete imported-weight section stays hidden when external load is not relevant",
  );
  assert.equal(
    await reviewCard.getByText("CLOSE", { exact: true }).count(),
    1,
    "the expanded card has one collapse action",
  );
  const decisionColors = await reviewCard.locator(".import-review-primary").evaluate(
    (node) => ({
      background: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
    }),
  );
  assert.deepEqual(decisionColors, {
    background: "rgb(79, 191, 135)",
    color: "rgb(4, 20, 12)",
  });
  await page.screenshot({ path: output("320-dark-needs-review.png"), fullPage: true });
  await reviewCard.getByRole("button", { name: "CHOOSE EXERCISE" }).click();
  const pickerColors = await reviewCard.locator(".plan-editor-picker").evaluate(
    (picker) => ({
      picker: getComputedStyle(picker).backgroundColor,
      search: getComputedStyle(picker.querySelector("input")).backgroundColor,
      list: getComputedStyle(picker.querySelector('[role="listbox"]')).backgroundColor,
      row: getComputedStyle(picker.querySelector('[role="option"]')).backgroundColor,
    }),
  );
  assert.deepEqual(pickerColors, {
    picker: "rgb(23, 26, 25)",
    search: "rgb(28, 32, 30)",
    list: "rgb(28, 32, 30)",
    row: "rgb(28, 32, 30)",
  });
  await page.screenshot({ path: output("320-dark-picker-open.png"), fullPage: true });
  assert.equal(
    await reviewCard.getByText("Possible matches", { exact: true }).count(),
    1,
  );
  const balanceChoice = reviewCard
    .getByRole("option", { name: /BOSU Balance|Y Balance Reach/ })
    .first();
  const chosenName = await balanceChoice.innerText();
  await balanceChoice.click();
  assert.equal(
    await page.getByText("1 exercise needs review", { exact: true }).count(),
    1,
    "the live review counter updates after resolution",
  );
  assert.equal(
    await page.getByRole("button", { name: `Edit ${chosenName}` }).count(),
    1,
    "resolved cards collapse automatically",
  );
  assert.match(
    await page.getByRole("button", { name: `Edit ${chosenName}` }).innerText(),
    /2 sets · 30 sec/,
    "canonical resolution preserves the imported prescription",
  );

  const customCard = page
    .locator(".plan-editor-exercise.needs-review")
    .filter({ hasText: "Mystery Flow" });
  await customCard.locator(".plan-editor-summary").click();
  const keepCustom = customCard.getByRole("button", { name: /KEEP AS CUSTOM/ });
  assert.match(await keepCustom.innerText(), /Mystery Flow.*exactly as written/s);
  await keepCustom.click();
  assert.equal(await page.getByText("All exercises ready", { exact: true }).count(), 1);
  assert.equal(await page.locator(".plan-editor-exercise.needs-review").count(), 0);
  const completedReview = page.locator(".bulk-match-review.is-complete");
  await completedReview.getByText("REVIEW COMPLETE", { exact: true }).waitFor();
  assert.equal(
    await completedReview.getByText("All imported exercises are ready.", { exact: true }).count(),
    1,
    "the bulk review remains as a quiet completion status",
  );
  assert.equal(
    await completedReview.getByRole("button").count(),
    0,
    "the completed review status does not compete with the save CTA",
  );
  assert.equal(await completedReview.getAttribute("role"), "status");

  const weightedCard = page
    .locator(".plan-editor-exercise")
    .filter({ hasText: "Step-down" });
  assert.match(await weightedCard.locator(".plan-editor-summary").innerText(), /20 kg/);
  await weightedCard.locator(".plan-editor-summary").click();
  assert.equal(await weightedCard.locator('.plan-editor-weights input').count(), 0);
  await weightedCard.getByRole("button", { name: "EDIT", exact: true }).click();
  assert.equal(await weightedCard.locator('.plan-editor-weights input').count(), 2);
  const unweightedLoadCard = page
    .locator(".plan-editor-exercise")
    .filter({ hasText: "Incline Dumbbell Press" });
  await unweightedLoadCard.locator(".plan-editor-summary").click();
  assert.equal(
    await unweightedLoadCard.getByRole("button", { name: "ADD IMPORTED WEIGHTS" }).count(),
    1,
    "known externally loaded exercises retain an optional Add weights action",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "the import review has no horizontal overflow at 320px",
  );
  const warningColor = await page
    .locator(".import-review-summary")
    .evaluate((node) => getComputedStyle(node).color);
  assert.notEqual(warningColor, "rgb(0, 0, 0)");
  await page.screenshot({ path: output("320-dark-resolved.png"), fullPage: true });
  await page.getByRole("button", { name: "USE THIS PLAN" }).click();
  await page.waitForFunction(() =>
    Boolean(JSON.parse(localStorage.getItem("lift-v2-state"))?.profile?.onboardingComplete),
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lift-v2-state")),
  );
  const storedCustom = stored.program.days
    .flatMap((day) => day.exercises)
    .find((exercise) => exercise.originalImportedName === "Mystery Flow");
  assert.equal(storedCustom.exerciseSource, "imported-custom");
  assert.equal(storedCustom.matchStatus, "confirmed-custom");
  assert.match(storedCustom.exerciseId, /^imported-custom-/);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await openImport(focusedNotes, {
    width: 390,
    theme: "premium",
  });
  const reviewCard = page
    .locator(".plan-editor-exercise.needs-review")
    .filter({ hasText: "Ravnotežje" });
  const semantics = await reviewCard.evaluate((card) => {
    const root = document.documentElement;
    const status = card.querySelector(".import-review-status");
    const remove = card.querySelector(".import-review-remove");
    const primary = card.querySelector(".import-review-primary");
    const summaryAction = card.querySelector(".plan-editor-summary-action");
    const planSummary = document.querySelector(".import-review-summary");
    return {
      accent: getComputedStyle(root).getPropertyValue("--rook-accent").trim(),
      status: getComputedStyle(status).color,
      remove: getComputedStyle(remove).color,
      primary: getComputedStyle(primary).backgroundColor,
      summaryAction: getComputedStyle(summaryAction).color,
      planSummaryLine: getComputedStyle(planSummary).borderLeftColor,
    };
  });
  assert.notEqual(semantics.status, semantics.primary, "Premium review status stays neutral rather than gold");
  assert.notEqual(semantics.summaryAction, semantics.primary, "Premium card-level review wording stays neutral rather than gold");
  assert.notEqual(semantics.planSummaryLine, semantics.primary, "Premium plan-level review boundary stays neutral rather than gold");
  assert.notEqual(semantics.remove, semantics.primary, "Premium destructive action stays semantically red rather than gold");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output("390-premium-needs-review.png"), fullPage: false });
  await context.close();
}

const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const catalogNames = Object.values(exerciseCatalog)
  .filter((item) => !item.id.startsWith("wg-") && item.name !== "Pallof Press")
  .slice(0, 30)
  .map((item) => item.name);
const longPlan = ["WEEKLY WORKOUT PLAN", "Goal: General fitness", ""];
weekdays.forEach((weekday, dayIndex) => {
  longPlan.push(`${weekday} — DOLGI SLOVENSKI TRENING ${dayIndex + 1}`);
  catalogNames
    .slice(dayIndex * 6, dayIndex * 6 + 6)
    .forEach((name) => longPlan.push(`${name} 2 x 8 reps`));
  longPlan.push("");
});

{
  const { context, page, errors } = await openImport(longPlan.join("\n"), {
    width: 390,
    theme: "light",
  });
  assert.equal(await page.locator(".import-day").count(), 5);
  assert.equal(await page.locator(".plan-editor-exercise").count(), 30);
  assert.equal(await page.locator(".plan-editor-fields").count(), 0);
  assert.equal(await page.getByText("All exercises ready", { exact: true }).count(), 1);
  const heights = await page
    .locator(".plan-editor-exercise")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  assert.ok(heights.every((height) => height < 90));
  await page.screenshot({ path: output("390-light-30-exercises.png"), fullPage: false });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Import-review UX QA passed: ambiguity, canonical/custom auto-resolution, contextual weights, live status, single-close hierarchy, Light/Dark/Premium, 30-exercise scale, and narrow mobile are correct.",
);
