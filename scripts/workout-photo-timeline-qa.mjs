import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const artifactRoot = new URL("../artifacts/workout-photo-timeline/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function photoWorkout(index, day, photoId = `timeline-photo-${index}`) {
  return {
    id: `timeline-workout-${index}`,
    name: index % 3 === 0 ? "Upper Strength" : index % 3 === 1 ? "Lower Body" : "Full Body Conditioning",
    canonicalPlanDate: day,
    workoutDateKey: day,
    startedAt: `${day}T17:00:00.000Z`,
    completedAt: `${day}T18:00:00.000Z`,
    endedAt: `${day}T18:00:00.000Z`,
    status: "completed",
    durationSeconds: 3120,
    photoId,
    exercises: [{
      id: `bench-${index}`,
      exerciseId: "barbell-bench-press",
      repMin: 6,
      repMax: 8,
      sets: [{ id: `set-${index}`, completed: true, planned: true, weight: 80, reps: 8, rir: 2 }],
    }],
  };
}

function dayBack(index) {
  const date = new Date("2026-09-05T12:00:00");
  date.setDate(date.getDate() - index * 3);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fixture(count, { appearance = "light", style = "standard", corrupt = false } = {}) {
  const state = createReturningUserFixture(2);
  state.activeWorkout = null;
  state.workouts = Array.from({ length: count }, (_, index) =>
    photoWorkout(index, dayBack(index), corrupt && index === 0 ? "corrupt-photo" : undefined),
  );
  if (count >= 5) {
    state.workouts[0] = photoWorkout(0, "2026-09-05");
    state.workouts[1] = photoWorkout(1, "2026-09-05");
    state.workouts[2] = photoWorkout(2, "2026-08-31");
    state.workouts[3] = photoWorkout(3, "2025-12-31");
  }
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  return state;
}

function svg(index) {
  const colors = ["#315e4b", "#8a6242", "#4e5878", "#89606e", "#436b70"];
  const color = colors[index % colors.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760"><rect width="600" height="760" fill="${color}"/><circle cx="300" cy="240" r="120" fill="rgba(255,255,255,.13)"/><path d="M120 650 Q300 320 480 650" fill="rgba(255,255,255,.2)"/></svg>`;
}

async function seedPhotos(page, state, { corrupt = false } = {}) {
  const records = state.workouts.map((workout, index) => ({
    id: workout.photoId,
    workoutId: workout.id,
    createdAt: `${workout.canonicalPlanDate}T18:${String(index % 60).padStart(2, "0")}:00.000Z`,
    width: 600,
    height: 760,
    mimeType: "image/svg+xml",
    body: corrupt && index === 0 ? "not-an-image" : svg(index),
    corrupt: corrupt && index === 0,
  }));
  await page.evaluate(async (items) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("rook-workout-media", 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains("photos")
          ? request.transaction.objectStore("photos")
          : db.createObjectStore("photos", { keyPath: "id" });
        if (!store.indexNames.contains("workoutId")) store.createIndex("workoutId", "workoutId");
        if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt");
        if (!db.objectStoreNames.contains("restore-snapshot")) db.createObjectStore("restore-snapshot", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("photos", "readwrite");
      const store = transaction.objectStore("photos");
      store.clear();
      for (const item of items) store.put({
        id: item.id,
        workoutId: item.workoutId,
        createdAt: item.createdAt,
        width: item.width,
        height: item.height,
        mimeType: item.corrupt ? "image/jpeg" : item.mimeType,
        blob: new Blob([item.body], { type: item.corrupt ? "image/jpeg" : item.mimeType }),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, records);
}

async function open(state, viewport = { width: 390, height: 844 }, options = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: options.serviceWorkers || "block" });
  await context.addInitScript((value) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(value));
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    window.__photoUrlStats = { created: 0, revoked: 0 };
    URL.createObjectURL = (blob) => {
      window.__photoUrlStats.created += 1;
      return originalCreate(blob);
    };
    URL.revokeObjectURL = (url) => {
      window.__photoUrlStats.revoked += 1;
      return originalRevoke(url);
    };
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }));
  await page.goto(`${baseUrl}/?workout-photo-timeline=${Date.now()}`, { waitUntil: "networkidle" });
  await seedPhotos(page, state, options);
  await page.reload({ waitUntil: "networkidle" });
  return { context, page, errors };
}

async function assertClean(run, label) {
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal overflow`);
  assert.deepEqual(run.errors, [], `${label}: ${run.errors.join("; ")}`);
}

async function openTimeline(run) {
  await run.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
  const entry = run.page.locator(".workout-photo-entry-section");
  await entry.scrollIntoViewIfNeeded();
  await entry.getByRole("button").click();
  await run.page.getByRole("heading", { name: "Your training, over time." }).waitFor();
}

const empty = await open(fixture(0));
await empty.page.getByRole("button", { name: "PROGRESS", exact: true }).click();
await empty.page.locator(".workout-photo-entry-section").scrollIntoViewIfNeeded();
await empty.page.screenshot({ path: output("390-progress-entry-empty.png") });
await empty.page.locator(".workout-photo-entry-card").click();
await empty.page.getByText("No workout photos yet.", { exact: true }).waitFor();
await empty.page.screenshot({ path: output("390-empty.png") });
await assertClean(empty, "empty");
await empty.context.close();

const few = await open(fixture(5));
await openTimeline(few);
await few.page.locator(".workout-photo-timeline-item img.is-ready").first().waitFor();
assert.equal(await few.page.getByText("September 2026", { exact: true }).count(), 1);
assert.equal(await few.page.getByText("August 2026", { exact: true }).count(), 1);
assert.equal(await few.page.getByText("December 2025", { exact: true }).count(), 1);
await few.page.screenshot({ path: output("390-few-timeline.png") });
await few.page.locator(".workout-photo-timeline-item").first().click();
await few.page.getByRole("dialog", { name: "Workout photo", exact: true }).waitFor();
await few.page.screenshot({ path: output("390-private-viewer.png") });
await few.page.getByRole("button", { name: "VIEW WORKOUT" }).click();
await few.page.getByText("Workout details", { exact: true }).waitFor();
assert.equal(await few.page.getByText("Private photo saved", { exact: true }).count(), 1);
await few.page.locator(".workout-photo-memory").scrollIntoViewIfNeeded();
await few.page.locator(".workout-photo-thumbnail img").waitFor();
await few.page.screenshot({ path: output("390-history-with-photo.png") });
await assertClean(few, "few/viewer/history");
await few.context.close();

const many = await open(fixture(240));
await openTimeline(many);
await many.page.locator(".workout-photo-timeline-item img.is-ready").first().waitFor();
const initialStats = await many.page.evaluate(() => window.__photoUrlStats);
assert.ok(initialStats.created < 35, `only near-viewport thumbnails load, got ${initialStats.created}`);
assert.equal(await many.page.locator(".workout-photo-timeline-item").count(), 240);
await many.page.screenshot({ path: output("390-many-photos.png") });
await many.page.getByRole("button", { name: "Close workout photos" }).click();
await many.page.locator(".workout-photo-timeline-screen").waitFor({ state: "detached" });
await many.page.waitForTimeout(50);
const cleanupStats = await many.page.evaluate(() => window.__photoUrlStats);
assert.equal(cleanupStats.revoked, cleanupStats.created, "every transient thumbnail URL is revoked on unmount");
await assertClean(many, "hundreds/memory cleanup");
await many.context.close();

const narrow = await open(fixture(18), { width: 320, height: 700 });
await openTimeline(narrow);
await narrow.page.locator(".workout-photo-timeline-item img.is-ready").first().waitFor();
await narrow.page.screenshot({ path: output("320-timeline.png") });
await assertClean(narrow, "320 timeline");
await narrow.context.close();

const corrupt = await open(fixture(3, { corrupt: true }), { width: 390, height: 844 }, { corrupt: true });
await openTimeline(corrupt);
await corrupt.page.getByText("Unavailable", { exact: true }).first().waitFor();
await corrupt.page.screenshot({ path: output("390-corrupt-asset.png") });
await corrupt.page.locator(".workout-photo-timeline-item").first().click();
await corrupt.page.getByText("Photo unavailable", { exact: true }).waitFor();
await corrupt.page.screenshot({ path: output("390-corrupt-viewer.png") });
await assertClean(corrupt, "corrupt asset");
await corrupt.context.close();

const deletion = await open(fixture(1));
await openTimeline(deletion);
await deletion.page.locator(".workout-photo-timeline-item img.is-ready").waitFor();
await deletion.page.locator(".workout-photo-timeline-item").click();
await deletion.page.getByRole("button", { name: "DELETE PHOTO", exact: true }).click();
await deletion.page.getByRole("group", { name: "Confirm photo deletion" }).waitFor();
await deletion.page.screenshot({ path: output("390-delete-confirmation.png") });
await deletion.page.getByRole("group", { name: "Confirm photo deletion" }).getByRole("button", { name: "DELETE PHOTO" }).click();
await deletion.page.getByText("No workout photos yet.", { exact: true }).waitFor();
const deletedState = await deletion.page.evaluate(async () => {
  const state = JSON.parse(localStorage.getItem("lift-v2-state"));
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("rook-workout-media", 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const count = await new Promise((resolve, reject) => {
    const request = database.transaction("photos").objectStore("photos").count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return { workouts: state.workouts.length, photoId: state.workouts[0].photoId || null, count };
});
assert.deepEqual(deletedState, { workouts: 1, photoId: null, count: 0 });
await deletion.context.close();

const offline = await open(
  fixture(3),
  { width: 390, height: 844 },
  { serviceWorkers: "allow" },
);
await offline.page.evaluate(() => navigator.serviceWorker?.ready);
if (!(await offline.page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))) {
  await offline.page.reload({ waitUntil: "networkidle" });
}
// Reload once while online after the worker has control so the current
// fingerprinted build assets are guaranteed to pass through its cache.
await offline.page.reload({ waitUntil: "networkidle" });
assert.equal(
  await offline.page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
  true,
  "offline timeline starts from a service-worker-controlled page",
);
await offline.context.setOffline(true);
await offline.page.reload({ waitUntil: "domcontentloaded" });
await openTimeline(offline);
await offline.page.locator(".workout-photo-timeline-item img.is-ready").first().waitFor();
assert.equal(await offline.page.locator(".workout-photo-timeline-item").count(), 3, "Timeline and private IndexedDB photos remain available offline");
await offline.context.close();

for (const [appearance, style, label] of [
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  const themed = await open(fixture(8, { appearance, style }));
  await openTimeline(themed);
  await themed.page.locator(".workout-photo-timeline-item img.is-ready").first().waitFor();
  await themed.page.screenshot({ path: output(`390-${label}-timeline.png`) });
  await themed.page.locator(".workout-photo-timeline-item").first().click();
  await themed.page.getByRole("dialog", { name: "Workout photo", exact: true }).waitFor();
  await themed.page.screenshot({ path: output(`390-${label}-viewer.png`) });
  await assertClean(themed, `${label} theme`);
  await themed.context.close();
}

console.log("Workout Photo Timeline QA passed: empty/few/hundreds, same-date and month/year grouping, shared private viewer, History linkage, destructive deletion, corrupt assets, lazy loading, object URL cleanup, 320px, and Premium themes.");
await browser.close();
