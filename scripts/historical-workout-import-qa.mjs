import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { verifyLongContent, verifySearchClear } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { GENERIC_HISTORY_CSV_HEADER, applyHistoricalWorkoutImport, parseHistoricalWorkoutCsv } from "../src/historicalWorkoutImport.js";

const artifactRoot = new URL("../artifacts/historical-workout-import/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const row = (date, workout, exercise, order, weight = 80, unit = "kg", reps = 8) => `${date},${workout},${exercise},${order},${weight},${unit},${reps},,,`;
const csv = (...rows) => `${GENERIC_HISTORY_CSV_HEADER}\n${rows.join("\n")}`;

function fixture({ duplicate = false, appearance = "light", style = "standard" } = {}) {
  let state = createReturningUserFixture(1);
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  state.ai.planUpgradeDismissed = true;
  if (duplicate) {
    const preview = parseHistoricalWorkoutCsv({ source: "generic", state, text: csv(row("2024-05-01 18:00:00", "Upper A", "Bench Press", 1)) });
    state = applyHistoricalWorkoutImport(state, preview).state;
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
  await page.goto(`${baseUrl}/?history-import=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'data'); await page.getByRole("button", { name: /Import workout history/ }).click();
  await page.getByRole("heading", { name: "Choose source" }).waitFor();
  await page.waitForTimeout(260);
  return { context, page, errors };
}

const file = (name, content) => ({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
async function selectGeneric(run, content, name = "workouts.csv", captureParse = null) {
  await run.page.getByRole("button", { name: /Generic CSV/ }).click();
  const action = run.page.locator('input[type="file"]').setInputFiles(file(name, content));
  if (captureParse) {
    await run.page.waitForTimeout(40);
    await run.page.screenshot({ path: output(captureParse) });
  }
  await action;
}
async function assertLayout(page, label) {
  await verifyLongContent(page, label);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal overflow`);
}

{
  const run = await open(fixture());
  await run.page.screenshot({ path: output("01-source-picker.png") });
  await selectGeneric(run, csv(row("2024-05-01 18:00:00", "Upper A", "Bench Press", 1), row("2024-05-01 18:00:00", "Upper A", "Barbell Row", 1)), "clean.csv", "02-parse.png");
  await run.page.getByRole("heading", { name: "Review import" }).waitFor();
  await run.page.screenshot({ path: output("03-clean-review.png"), fullPage: true });
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

for (const width of [390, 320]) {
  const run = await open(fixture({ appearance: width === 320 ? 'dark' : 'light' }), width);
  const page=run.page;
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const original=await stored();
  const unknowns = Array.from({ length: 8 }, (_, index) => row("2024-05-02 18:00:00", "Machines", `Unknown Gym Machine ${index + 1}`, 1, 40 + index));
  await selectGeneric(run, csv(...unknowns), "unresolved.csv");
  await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();
  const shot=async name=>{await page.waitForTimeout(280);await page.screenshot({path:output(`${width}-${name}.png`)});};
  await shot('many-unmatched');
  assert.equal(await page.getByRole('button',{name:'MATCH',exact:true}).count(),8);
  await page.getByRole('button',{name:'MATCH',exact:true}).first().click();
  await verifySearchClear(page);
  for(let index=0;index<8;index++) {
    await page.getByText(`Exercise ${index+1} of 8`,{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Review import',exact:true}).count(),0,'no intermediate return to parent');
    await page.getByRole('heading',{name:`Unknown Gym Machine ${index+1}`,exact:true}).waitFor();
    const closeBox=await page.getByRole('button',{name:'Close Map exercise',exact:true}).boundingBox();
    assert.ok(closeBox && closeBox.y>=0 && closeBox.y+closeBox.height<=844,'mapping close remains within the viewport');
    if(index===0||index===2)await shot(`mapping-${index+1}`);
    await page.getByRole('searchbox').fill('Bench Press');
    await page.locator('.history-import-match-list button').first().click();
    assert.deepEqual((await stored()).workouts,original.workouts,'matching never imports history');
  }
  await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'MATCH',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'CHANGE',exact:true}).count(),8);
  await shot('all-matched');
  await page.getByRole('button',{name:'CHANGE',exact:true}).first().click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'CHANGE',exact:true}).count(),8,'back preserves draft mappings');
  await page.getByRole('button',{name:'CHANGE',exact:true}).first().click();
  await page.getByRole('searchbox').fill('Leg Press');
  const choice=page.locator('.history-import-match-list button').first();
  const correctedName=await choice.locator('strong').innerText();await choice.click();
  assert.match(await page.locator('.history-import-mapping-row').first().innerText(),new RegExp(correctedName));
  await page.locator('.remember-import-match input').first().check();
  assert.deepEqual((await stored()).exerciseAliases,original.exerciseAliases,'remembered aliases also wait for import');
  if(width===320) {
    await page.getByRole('button',{name:'Close Import workout history',exact:true}).click();
    assert.deepEqual((await stored()).workouts,original.workouts);
    await openProfileArea(page, 'data'); await page.getByRole('button',{name:/Import workout history/}).click();
    await page.getByRole('heading',{name:'Choose source',exact:true}).waitFor();
  } else {
    await page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true}).click();
    await page.getByRole('heading',{name:'1 workout imported',exact:true}).waitFor();
    assert.equal((await stored()).workouts.length,original.workouts.length+1);
    const imported=(await stored()).workouts.find(workout=>!original.workouts.some(previous=>previous.id===workout.id));
    assert.equal(imported.exercises.length,8,'no unmatched data silently discarded');
  }
  await assertLayout(page,'continuous mapping');assert.deepEqual(run.errors,[]);await run.context.close();
}

{
  const run = await open(fixture({ duplicate: true }));
  await selectGeneric(run, csv(
    row("2024-05-01 18:00:00", "Upper A", "Bench Press", 1),
    row("2024-05-01 18:00:00", "Upper A", "Bench Press", 2, 85),
  ), "duplicates.csv");
  await run.page.getByText("possible duplicate", { exact: false }).waitFor();
  await run.page.screenshot({ path: output("06-duplicate-state.png"), fullPage: true });
  assert.equal(await run.page.getByRole("button", { name: /IMPORT .*WORKOUT/ }).isDisabled(), true);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture({ appearance: "dark", style: "premium" }));
  const rows = Array.from({ length: 1001 }, (_, index) => row(new Date(Date.UTC(2020, 0, 1 + index)).toISOString(), `Session ${index + 1}`, "Bench Press", 1, 70 + index % 10));
  await selectGeneric(run, csv(...rows), "multi-year-1001.csv");
  await run.page.getByText("1,001", { exact: true }).first().waitFor({ timeout: 30000 });
  await run.page.screenshot({ path: output("07-large-import-premium.png") });
  await run.page.getByRole("button", { name: "IMPORT 1,001 WORKOUTS" }).click();
  await run.page.getByRole("heading", { name: "1,001 workouts imported" }).waitFor({ timeout: 15000 });
  await run.page.screenshot({ path: output("08-success.png") });
  const stored = await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(stored.workouts.filter((workout) => workout.historicalImport).length, 1001);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

{
  const run = await open(fixture(), 320);
  await run.page.getByRole("button", { name: /Hevy/ }).click();
  await run.page.locator('input[type="file"]').setInputFiles(file("wrong.csv", "date,name,weight\n2024-01-01,Push,80"));
  await run.page.getByRole("alert").waitFor();
  await run.page.screenshot({ path: output("09-error-320.png") });
  await assertLayout(run.page, "error at 320");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

await browser.close();
console.log("Historical workout import runtime QA passed: source selection, local parse, clean and unresolved review, mapping, duplicates, 1,001-workout import, success, error and 320px layout.");
