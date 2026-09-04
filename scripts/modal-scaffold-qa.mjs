import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const outputRoot = new URL("../artifacts/modal-scaffold/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const isOpaque = (color) =>
  /^rgb\(/u.test(color) ||
  (/^rgba\(/u.test(color) && Number(color.match(/,\s*([\d.]+)\)$/u)?.[1]) === 1);

async function verifyLongForm(page, selector, label) {
  const panel = page.locator(selector);
  const header = panel.locator(":scope > .detail-header");
  const compactTitle = header.locator(":scope > strong");
  await panel.waitFor();
  await page.waitForTimeout(220);
  const modal = page.locator('.modal-layer');
  assert.equal(await modal.getAttribute('role'), 'dialog', `${label} exposes dialog semantics`);
  assert.equal(await modal.getAttribute('aria-modal'), 'true', `${label} is announced as modal`);
  const focusableCount = await modal.evaluate((node) => {
    const controls = [...node.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    controls[0]?.focus({ preventScroll: true });
    return controls.length;
  });
  assert.ok(focusableCount >= 2, `${label} has a meaningful focus loop`);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement === [...document.querySelectorAll('.modal-layer button:not([disabled]), .modal-layer [href], .modal-layer input:not([disabled]), .modal-layer select:not([disabled]), .modal-layer textarea:not([disabled]), .modal-layer [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0).at(-1)), true, `${label} traps reverse focus at its final control`);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement === [...document.querySelectorAll('.modal-layer button:not([disabled]), .modal-layer [href], .modal-layer input:not([disabled]), .modal-layer select:not([disabled]), .modal-layer textarea:not([disabled]), .modal-layer [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0)[0]), true, `${label} loops focus back to its first control`);
  const initial = await panel.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      radius: parseFloat(style.borderTopLeftRadius),
      paddingBottom: parseFloat(style.paddingBottom),
      clientHeight: node.clientHeight,
      viewportHeight: innerHeight,
    };
  });
  assert.ok(isOpaque(initial.background), `${label} surface is fully opaque`);
  assert.equal(initial.overflowX, "hidden", `${label} clips across its rounded top`);
  assert.match(initial.overflowY, /auto|scroll/u, `${label} owns vertical scrolling`);
  assert.ok(initial.radius >= 20, `${label} keeps the shared rounded-sheet character`);
  assert.equal(initial.paddingBottom, 20, `${label} ends content 20px above the device safe area`);
  assert.ok(
    initial.clientHeight <= initial.viewportHeight * 0.93,
    `${label} respects the shared viewport cap`,
  );
  assert.ok(
    initial.clientHeight >= 500,
    `${label} retains enough room for an efficient long-form flow`,
  );

  const headerStyle = await header.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      position: style.position,
      background: style.backgroundColor,
      border: style.borderBottomColor,
    };
  });
  assert.equal(headerStyle.position, "sticky", `${label} scrollable header is sticky`);
  assert.ok(isOpaque(headerStyle.background), `${label} header is opaque`);
  assert.equal(await compactTitle.evaluate(node => getComputedStyle(node).opacity), "0", `${label} compact title starts hidden`);
  assert.match(headerStyle.border, /rgba\(.+, 0\)|transparent/u, `${label} divider starts transparent`);

  const [panelBox, headerBox, firstContentBox] = await Promise.all([
    panel.boundingBox(),
    header.boundingBox(),
    panel.locator(":scope > .eyebrow").first().boundingBox(),
  ]);
  assert.ok(headerBox.y >= panelBox.y, `${label} header stays inside the surface`);
  assert.ok(
    firstContentBox.y >= headerBox.y + headerBox.height + 18,
    `${label} content begins below the deliberate header zone`,
  );

  await panel.evaluate((node) => {
    node.scrollTop = Math.min(480, node.scrollHeight - node.clientHeight);
  });
  await page.waitForTimeout(220);
  const [scrolledPanelBox, scrolledHeaderBox] = await Promise.all([
    panel.boundingBox(),
    header.boundingBox(),
  ]);
  assert.ok(
    Math.abs(scrolledHeaderBox.y - scrolledPanelBox.y) <= 2,
    `${label} header remains pinned while content scrolls`,
  );
  assert.equal(await compactTitle.evaluate(node => getComputedStyle(node).opacity), "1", `${label} compact title appears after the hero scrolls away`);
  assert.doesNotMatch(await header.evaluate(node => getComputedStyle(node).borderBottomColor), /rgba\(.+, 0\)|transparent/u, `${label} divider appears only once content scrolls beneath the header`);
  return panel;
}

for (const theme of ["light", "dark", "premium"]) {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  state.profile.themePreference = theme;
  const context = await browser.newContext({
    viewport: { width: 390, height: 700 },
    serviceWorkers: "block",
    colorScheme: theme === "premium" ? "dark" : theme,
  });
  await context.addInitScript((value) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(value));
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
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();

  await page.getByRole("button", { name: "Review priorities" }).click();
  const priorities = await verifyLongForm(
    page,
    ".modal-layer > .priority-settings",
    `${theme} Training priorities`,
  );
  await page.screenshot({ path: output(`${theme}-training-priorities-scrolled.png`) });
  await priorities.evaluate((node) => { node.scrollTop = 0; });
  await page.waitForTimeout(220);
  await page.screenshot({ path: output(`${theme}-training-priorities.png`) });
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.locator(".modal-layer").waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Training restrictions/ }).click();
  await page.waitForTimeout(220);
  const restrictionPanel = page.locator(".training-restrictions-screen");
  const restrictionBox = await restrictionPanel.boundingBox();
  const restrictionHandle = await page.locator(".modal-drag-handle").boundingBox();
  assert.ok(
    restrictionBox.height < 844 * 0.82,
    `${theme} short restrictions sheet sizes to its content`,
  );
  assert.ok(
    Math.abs(restrictionHandle.y - restrictionBox.y) <= 1,
    `${theme} drag handle follows the compact sheet top`,
  );
  await page.screenshot({ path: output(`${theme}-training-restrictions-compact.png`) });
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.locator(".modal-layer").waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 1100 });
  await page.getByRole("button", { name: /Appearance/ }).click();
  const appearanceHeader = page.locator(".appearance-screen > .detail-header");
  await appearanceHeader.waitFor();
  assert.equal(
    await appearanceHeader.evaluate(node => getComputedStyle(node).position),
    "relative",
    `${theme} short Appearance sheet keeps a static header`,
  );
  assert.equal(
    await appearanceHeader.locator(":scope > strong").evaluate(node => getComputedStyle(node).opacity),
    "1",
    `${theme} short Appearance sheet keeps its compact title visible`,
  );
  const appearanceBox = await page.locator(".appearance-screen").boundingBox();
  assert.ok(
    appearanceBox.height < 1100 * 0.6,
    `${theme} Appearance sheet does not reserve empty viewport height`,
  );
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.locator(".modal-layer").waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole("button", { name: "Edit plan" }).click();
  const editPlan = await verifyLongForm(
    page,
    ".modal-layer > .edit-plan-screen",
    `${theme} Edit plan`,
  );
  await page.screenshot({ path: output(`${theme}-edit-plan-scrolled.png`) });
  await editPlan.evaluate((node) => { node.scrollTop = 0; });
  await page.waitForTimeout(220);
  await page.screenshot({ path: output(`${theme}-edit-plan.png`) });
  await page.getByRole("button", { name: /^Close/ }).click();
  await page.locator(".modal-layer").waitFor({ state: "detached" });

  assert.deepEqual(errors, [], `${theme} overlay flows render without errors`);
  await context.close();
}

await browser.close();
console.log(
  "Modal scaffold QA passed: short sheets size to content, long sheets use the shared viewport cap, and headers remain correct in Light, Dark and Premium.",
);
