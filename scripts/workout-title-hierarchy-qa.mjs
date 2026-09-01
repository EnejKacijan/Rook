import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  isoDay,
  weekday,
} from "../src/domain.js";

const outputRoot = new URL("../artifacts/workout-title-hierarchy/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({
  theme = "light",
  name = "NOGE B (FUNKCIJA)",
  workoutName,
  workoutDescriptor,
} = {}) {
  const state = blankState();
  const today = weekday();
  const tomorrow = WEEKDAYS[(WEEKDAYS.indexOf(today) + 1) % 7];
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: [today, tomorrow],
    sessionMinutes: 45,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
    themePreference: theme,
  };
  state.program = buildProgram(state.profile);
  state.program.source = "ai-import";
  const selected = state.program.days.find((day) => day.weekday === today);
  selected.name = name;
  selected.originalImportedWorkoutName = name;
  selected.workoutName = workoutName;
  selected.workoutDescriptor = workoutDescriptor;
  state.selectedDay = today;
  state.selectedDate = isoDay();
  return state;
}

async function open(state) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    state,
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false }),
    }),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:4173/?title-qa=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  return { context, page, errors };
}

for (const theme of ["light", "dark"]) {
  const { context, page, errors } = await open(fixture({ theme }));
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  const primary = page.locator(".workout-title-primary");
  const descriptor = page.locator(".workout-title-detail");
  const metadata = page.locator(".today-hero > p");
  assert.equal(await primary.innerText(), "NOGE B");
  assert.equal(await descriptor.innerText(), "Funkcija");
  const [primaryBox, descriptorBox, metadataBox] = await Promise.all([
    primary.boundingBox(),
    descriptor.boundingBox(),
    metadata.boundingBox(),
  ]);
  assert.ok(primaryBox.y + primaryBox.height <= descriptorBox.y + 1);
  assert.ok(descriptorBox.y + descriptorBox.height <= metadataBox.y + 1);
  const hierarchy = await page.locator(".workout-title").evaluate((element) => {
    const primaryStyle = getComputedStyle(element.querySelector(".workout-title-primary"));
    const detailStyle = getComputedStyle(element.querySelector(".workout-title-detail"));
    return {
      primarySize: Number.parseFloat(primaryStyle.fontSize),
      detailSize: Number.parseFloat(detailStyle.fontSize),
      width: document.documentElement.scrollWidth,
    };
  });
  assert.ok(hierarchy.detailSize < hierarchy.primarySize * 0.6);
  assert.equal(hierarchy.width, 320);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output(`320-${theme}.png`), fullPage: false });
  await context.close();
}

{
  const { context, page, errors } = await open(
    fixture({ name: "Monday Madness (John's version)" }),
  );
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  assert.equal(
    await page.locator(".workout-title-primary").innerText(),
    "Monday Madness (John's version)",
  );
  assert.equal(await page.locator(".workout-title-detail").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(
    fixture({
      name: "NOGE B (FUNKCIJA)",
      workoutName: "Spodnji del B",
      workoutDescriptor: "Moč in tehnika",
    }),
  );
  await page.getByRole("button", { name: "START WORKOUT" }).waitFor();
  assert.equal(await page.locator(".workout-title-primary").innerText(), "Spodnji del B");
  assert.equal(await page.locator(".workout-title-detail").innerText(), "Moč in tehnika");
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const state = fixture({
    name: "NOGE B (FUNKCIJA)",
    workoutName: "NOGE B",
    workoutDescriptor: "Funkcija",
  });
  const day = state.program.days.find((item) => item.weekday === weekday());
  const { context, page, errors } = await open(state);
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await page.getByRole("button", { name: /EDIT PLAN/ }).click();
  await page.getByRole("heading", { name: "Edit your plan" }).waitFor();
  const nameField = page.getByLabel(`${day.weekday} workout name`);
  const descriptorField = page.getByLabel(`${day.weekday} workout descriptor`);
  assert.equal(await nameField.inputValue(), "NOGE B");
  assert.equal(await descriptorField.inputValue(), "Funkcija");
  await nameField.fill("Spodnji del B");
  await descriptorField.fill("Moč");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lift-v2-state")),
  );
  const savedDay = stored.program.days.find((item) => item.weekday === day.weekday);
  assert.equal(savedDay.workoutName, "Spodnji del B");
  assert.equal(savedDay.workoutDescriptor, "Moč");
  assert.equal(savedDay.name, "Spodnji del B · Moč");
  assert.equal(savedDay.originalImportedWorkoutName, "NOGE B (FUNKCIJA)");
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Workout title hierarchy QA passed in light/dark mode at 320 px, including ambiguity, structured display fields and separate imported-title editing.",
);
