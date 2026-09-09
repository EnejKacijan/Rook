import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const artifactRoot = new URL("../artifacts/onboarding-restrictions/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

async function reachRestrictions() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  const errors = [];
  let semanticCalls = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"available":false,"provider":null}',
    }),
  );
  await page.route("**/api/ai", (route) => {
    semanticCalls += 1;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"AI unavailable in offline QA"}',
    });
  });
  await page.goto(`${baseUrl}/?onboarding-restrictions=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "BUILD MY PLAN" }).click();
  await page.getByRole("combobox", { name: "Age range" }).click();
  await page.getByRole("option", { name: "18–29" }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: /^Beginner/ }).click();
  await page.getByRole("button", { name: "3 days" }).click();
  await page.getByLabel("Any day works").check();
  await page.getByRole("button", { name: "60 min" }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByRole("button", { name: "Commercial gym" }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByRole("button", { name: "Balanced" }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByRole("button", { name: /Balanced starting point/ }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByRole("button", { name: /Add movements or exercises to avoid/ }).click();
  return {
    context,
    page,
    errors,
    semanticCalls: () => semanticCalls,
  };
}

async function enter(run, value) {
  await run.page.getByRole("textbox", { name: "Restrictions or clinician limits" }).fill(value);
  await run.page.getByRole("button", { name: "BUILD MY PLAN" }).click();
}

function ignoreExpectedSemanticOutage(run) {
  run.errors = run.errors.filter(
    (error) => !/server responded with a status of 503/i.test(error),
  );
}

const exact = await reachRestrictions();
await enter(exact, "avoid leg press");
await exact.page.getByRole("heading", { name: "Your week is ready." }).waitFor();
assert.equal(exact.semanticCalls(), 0, "exact avoidance never depends on the semantic API");
assert.equal(
  await exact.page.getByText("Leg press family excluded").isVisible(),
  true,
  "the preview states the exact interpreted restriction scope",
);
assert.doesNotMatch(
  await exact.page.locator(".import-day .import-exercise").allInnerTexts().then((rows) => rows.join("\n")),
  /Leg Press/i,
  "the locally excluded exercise does not appear in the generated plan",
);
await exact.page.screenshot({ path: output("01-exact-avoidance-offline.png") });
await exact.page.getByRole("button", { name: "USE THIS PLAN" }).click();
const saved = await exact.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(saved.profile.avoid, "avoid leg press", "the exact raw restriction remains durable");
assert.equal(
  saved.program.days.some((day) => day.exercises.some((exercise) => exercise.exerciseId === "leg-press")),
  false,
  "the saved program respects the local restriction",
);
assert.deepEqual(exact.errors, []);
await exact.context.close();

const unknown = await reachRestrictions();
await enter(unknown, "avoid Viking press");
await unknown.page.getByText("Rook couldn’t identify that exercise or movement.").waitFor();
assert.equal(unknown.semanticCalls(), 1, "an unknown target gets one semantic-resolution attempt");
assert.equal(await unknown.page.getByRole("button", { name: "EDIT RESTRICTION" }).isVisible(), true);
await unknown.page.getByRole("button", { name: "EDIT RESTRICTION" }).click();
assert.equal(
  await unknown.page.getByRole("textbox", { name: "Restrictions or clinician limits" }).evaluate(
    (element) => element === document.activeElement,
  ),
  true,
  "unknown targets lead directly back to the editable restriction",
);
await unknown.page.screenshot({ path: output("02-unknown-exercise.png") });
ignoreExpectedSemanticOutage(unknown);
assert.deepEqual(unknown.errors, []);
await unknown.context.close();

const medical = await reachRestrictions();
await enter(medical, "My knee hurts on leg press");
await medical.page.getByText("Rook couldn’t safely review this health-related restriction.").waitFor();
assert.equal(medical.semanticCalls(), 1, "medical wording always gets semantic review");
assert.match(
  await medical.page.locator(".training-safety-summary.blocked").innerText(),
  /won’t guess what is safe around pain or injury/i,
);
assert.equal(
  await medical.page.getByRole("button", { name: "CLARIFY RESTRICTION" }).isVisible(),
  true,
  "medical ambiguity is never presented as a retryable network problem",
);
await medical.page.screenshot({ path: output("03-medical-fails-closed.png") });
ignoreExpectedSemanticOutage(medical);
assert.deepEqual(medical.errors, []);
await medical.context.close();

const unsupported = await reachRestrictions();
await enter(unsupported, "Leg press must stay under 40 kg");
await unsupported.page.getByText("Rook can't enforce this limit yet.").waitFor();
assert.equal(unsupported.semanticCalls(), 0, "an explicit unsupported load cap fails closed locally");
assert.equal(await unsupported.page.getByRole("button", { name: "LIMIT NOT SUPPORTED" }).isDisabled(), true);
await unsupported.page.screenshot({ path: output("04-unsupported-load-cap.png") });
assert.deepEqual(unsupported.errors, []);
await unsupported.context.close();

await browser.close();
console.log("Onboarding restriction QA passed: exact offline avoidance, durable enforcement, unknown target recovery, medical fail-closed behavior, and unsupported numeric limits.");
