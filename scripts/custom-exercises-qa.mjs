import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { verifyLongContent, verifySearchClear } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, weekday, WEEKDAYS } from "../src/domain.js";
import { createCustomExercise, customExerciseSnapshot, rememberExerciseAlias } from "../src/customExercises.js";

const artifactRoot = new URL("../artifacts/custom-exercises/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });

function fixture({ appearance = "light", style = "standard", historicalDeleted = false } = {}) {
  const state = blankState();
  const today = weekday();
  state.profile = {
    ...state.profile,
    id: "custom-qa-profile",
    name: "Alex",
    goal: "Build muscle",
    experience: "Intermediate",
    ageRange: "25–39",
    daysPerWeek: 4,
    availableDays: [today, ...WEEKDAYS.filter((day) => day !== today).slice(0, 3)],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  const prime = createCustomExercise(state, {
    name: "Prime Incline Press",
    equipment: ["machines"],
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    pattern: "horizontal-push",
    loggingType: "weight_reps",
    notes: "Seat 4 · neutral handles",
  }, "2026-09-01T10:00:00.000Z").exercise;
  createCustomExercise(state, {
    name: "Single-Arm Counterbalanced High Row With Extra-Long Machine Name",
    equipment: ["machines"],
    primaryMuscle: "back",
    secondaryMuscles: ["lats", "biceps"],
    pattern: "horizontal-pull",
    loggingType: "weight_reps",
  }, "2026-09-02T10:00:00.000Z");
  rememberExerciseAlias(state, "Prime Chest Machine", prime.id, { builtInCatalog: {}, now: "2026-09-03T10:00:00.000Z" });
  if (historicalDeleted) {
    const snapshot = customExerciseSnapshot(prime);
    state.workouts = [{
      id: "historical-custom-workout",
      name: "Upper A",
      workoutDateKey: "2026-08-30",
      canonicalPlanDate: "2026-08-30",
      startedAt: new Date("2026-08-30T10:00:00").getTime(),
      completedAt: new Date("2026-08-30T11:00:00").getTime(),
      durationSeconds: 3600,
      exercises: [{
        id: "historical-prime-entry",
        exerciseId: prime.id,
        importedName: prime.name,
        originalImportedName: prime.name,
        importedExercise: snapshot,
        sets: [{ id: "set-1", weight: 65, reps: 10, completed: true }],
      }],
    }];
    state.customExercises.find((item) => item.id === prime.id).deletedAt = "2026-09-04T10:00:00.000Z";
    state.exerciseAliases.forEach((alias) => { if (alias.exerciseId === prime.id) alias.deletedAt = "2026-09-04T10:00:00.000Z"; });
  }
  return state;
}

async function open(state, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", colorScheme: state.profile.appearancePreference === "dark" ? "dark" : "light" });
  await context.addInitScript((value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)), state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_INTERNET_DISCONNECTED")) errors.push(message.text()); });
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await page.goto(`${baseUrl}/?custom-exercises=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).waitFor();
  await context.setOffline(true);
  return { context, page, errors };
}

async function openLibrary(run) {
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'training'); await run.page.getByRole("button", { name: /Custom exercises/ }).click();
  await run.page.getByRole("heading", { name: "Exercises that fit your gym." }).waitFor();
  await run.page.waitForTimeout(300);
}

async function assertLayout(page, label) {
  await verifyLongContent(page, label);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal overflow`);
}

{
  const run = await open(fixture());
  await openLibrary(run);
  await run.page.screenshot({ path: output("01-custom-exercise-list.png"), fullPage: false });
  assert.equal(await run.page.locator(".custom-exercise-row").count(), 2);
  await run.page.getByRole("button", { name: "ADD CUSTOM EXERCISE" }).click();
  await run.page.screenshot({ path: output("02-create.png"), fullPage: false });
  await run.page.getByLabel("Exercise name").fill("  Pendulum  Squat Pro ");
  await run.page.getByLabel("Exercise equipment").selectOption("machines");
  await run.page.getByLabel("Primary target muscle").selectOption("Quads");
  await run.page.getByLabel("Exercise movement").selectOption("squat");
  await run.page.getByRole("button", { name: "Glutes" }).click();
  await run.page.getByRole("button", { name: "CREATE EXERCISE" }).click();
  await run.page.getByRole("button", { name: /Pendulum Squat Pro/ }).waitFor();
  const stored = await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(stored.customExercises.some((item) => item.name === "Pendulum Squat Pro" && item.pattern === "squat"), true);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture());
  await openLibrary(run);
  await run.page.getByRole("button", { name: /Prime Incline Press/ }).click();
  await run.page.screenshot({ path: output("03-edit-and-alias.png"), fullPage: true });
  await run.page.getByLabel("New exercise alias").fill("Atlantis Incline Press");
  await run.page.getByRole("button", { name: "ADD", exact: true }).click();
  await run.page.getByText("Atlantis Incline Press", { exact: true }).waitFor();
  const original = await run.page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.equal(original.exerciseAliases.some(alias => alias.alias === 'Atlantis Incline Press'), false, 'ADD stages only');
  await run.page.getByRole('button', {name:'Remove alias Prime Chest Machine'}).click();
  await run.page.getByLabel('Exercise name').fill('Prime Edited Press');
  await run.page.screenshot({ path: output("04-alias-draft.png"), fullPage: true });
  await run.page.locator('.custom-exercise-editor .detail-header-back').click();
  await run.page.getByRole('button', {name:/Prime Incline Press/}).click();
  assert.equal(await run.page.getByLabel('Exercise name').inputValue(), 'Prime Incline Press');
  assert.equal(await run.page.getByRole('button',{name:'Remove alias Atlantis Incline Press'}).count(),0);
  assert.equal(await run.page.getByRole('button',{name:'Remove alias Prime Chest Machine'}).count(),1);
  await run.page.getByLabel('New exercise alias').fill('Atlantis Incline Press');
  await run.page.getByRole('button',{name:'ADD',exact:true}).click();
  await run.page.getByRole('button',{name:'Remove alias Prime Chest Machine'}).click();
  await run.page.getByLabel('Exercise name').fill('Prime Edited Press');
  await run.page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('QA quota');};});
  await run.page.getByRole('button',{name:'SAVE DETAILS',exact:true}).click();
  await run.page.getByRole('alert').waitFor();
  assert.deepEqual(await run.page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))),original,'failed save leaves details and aliases unchanged');
  await run.page.screenshot({path:output('04-alias-save-failed.png')});
  await run.page.evaluate(()=>Storage.prototype.setItem=window.qaSetItem);
  await run.page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();
  await run.page.getByRole('button',{name:/Prime Edited Press/}).click();
  const saved=await run.page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  assert.ok(saved.exerciseAliases.some(alias=>alias.alias==='Atlantis Incline Press'&&!alias.deletedAt));
  assert.ok(saved.exerciseAliases.find(alias=>alias.alias==='Prime Chest Machine').deletedAt);
  assert.ok(saved.customExercises.some(exercise=>exercise.name==='Prime Edited Press'));
  await run.page.screenshot({path:output('04-alias-saved.png'),fullPage:true});
  await run.page.getByRole("button", { name: "Delete exercise" }).click();
  await run.page.locator(".custom-delete-confirm").scrollIntoViewIfNeeded();
  await run.page.screenshot({ path: output("05-delete-confirmation.png"), fullPage: false });
  await assertLayout(run.page, "delete confirmation");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture({ appearance: "dark", style: "premium" }), 320);
  await openLibrary(run);
  await run.page.getByRole("button", { name: /Single-Arm Counterbalanced/ }).click();
  await run.page.screenshot({ path: output("06-long-name-premium-320.png"), fullPage: false });
  await assertLayout(run.page, "long name at 320");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture({ historicalDeleted: true }));
  await run.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  await run.page.getByRole("button", { name: /Upper A/ }).click();
  const historicalExercise = run.page.getByRole("button", { name: /Prime Incline Press 1 \/ 1 set/ });
  await historicalExercise.waitFor();
  await historicalExercise.scrollIntoViewIfNeeded();
  await run.page.screenshot({ path: output("07-historical-deleted-custom.png"), fullPage: false });
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture());
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'program'); await run.page.getByRole("button", { name: /Replace plan/ }).click();
  await run.page.getByRole("button", { name: /Import from Notes|Import a different plan/ }).click();
  await run.page.getByPlaceholder(/Paste your workout notes/).fill("MONDAY — PUSH\nPrime Chest Machine 3 x 8 reps @ 55 kg");
  await run.page.getByRole("button", { name: "CREATE PREVIEW" }).click();
  await run.page.getByText("Prime Incline Press", { exact: true }).first().waitFor({ timeout: 10000 });
  assert.equal(await run.page.getByText("NEEDS REVIEW", { exact: true }).count(), 0, "remembered alias resolves without another prompt");
  await run.page.screenshot({ path: output("08-import-alias-resolved.png"), fullPage: false });
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture());
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'program'); await run.page.getByRole("button", { name: /Replace plan/ }).click();
  await run.page.getByRole("button", { name: /Import from Notes|Import a different plan/ }).click();
  await run.page.getByPlaceholder(/Paste your workout notes/).fill("MONDAY — PUSH\nAtlas Converging Press 3 x 8 reps @ 55 kg");
  await run.page.getByRole("button", { name: "CREATE PREVIEW" }).click();
  const card = run.page.locator(".import-decision-content:visible");
  await card.getByRole('heading', { name: 'Match this exercise', exact: true }).waitFor();
  await card.getByRole('searchbox', { name: 'Search exercises', exact: true }).fill("Machine Chest Press");
  await run.page.screenshot({ path: output("09-import-exercise-match.png"), fullPage: false });
  await card.getByRole("button", { name: "Machine Chest Press", exact: true }).click();
  await run.page.getByRole('heading', { name: 'Review your plan', exact: true }).waitFor();
  assert.equal(await run.page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program.source === 'ai-import'), false, 'Matching only updates the import draft');
  // A separate deliberate apply follows the existing 350 ms match handoff
  // guard, which prevents the matching tap from also accepting the plan.
  await run.page.waitForTimeout(400);
  run.page.once('dialog', async dialog => { assert.match(dialog.message(), /Replace the current program/); await dialog.accept(); });
  await run.page.getByRole('button', { name: 'USE THIS PLAN', exact: true }).click();
  await run.page.waitForFunction(() => JSON.parse(localStorage.getItem('lift-v2-state')).program.source === 'ai-import');
  const stored = await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(stored.program.days[0].exercises[0].matchStatus, 'confirmed-match');
  assert.equal(stored.program.days[0].exercises[0].importedName, 'Machine Chest Press');
  assert.equal(stored.exerciseAliases.some((item) => item.alias === "Atlas Converging Press" && !item.deletedAt), false, 'A one-off match does not silently create a remembered alias');
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

await browser.close();
console.log("Custom Exercise + Alias runtime QA passed.");
