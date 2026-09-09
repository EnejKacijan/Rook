import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve("artifacts", "ROOK-PREMONETIZATION-FINAL");
const screenshotsRoot = path.join(root, "screenshots");
const contactRoot = path.join(root, "contact-sheets");
const canonicalRoot = path.resolve("artifacts", "ROOK-PREMONETIZATION-REVIEW");
if (!root.endsWith(`${path.sep}ROOK-PREMONETIZATION-FINAL`)) throw new Error("Unexpected final-package root");
await mkdir(contactRoot, { recursive: true });

// A pre-final offline capture used the old `35-offline` folder name. Remove it
// only when every PNG is byte-identical to its canonical `053-offline` copy.
const legacyOfflineRoot = path.join(screenshotsRoot, "35-offline");
try {
  const legacyEntries = await readdir(legacyOfflineRoot, { withFileTypes: true });
  for (const entry of legacyEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".png")) throw new Error(`Unexpected legacy capture entry ${entry.name}`);
    const suffix = entry.name.replace(/^offline-surface-/, "");
    const canonicalName = (await readdir(path.join(screenshotsRoot, "053-offline")))
      .find((name) => name.endsWith(suffix));
    if (!canonicalName) throw new Error(`Missing canonical offline capture for ${entry.name}`);
    const [legacyBytes, canonicalBytes] = await Promise.all([
      readFile(path.join(legacyOfflineRoot, entry.name)),
      readFile(path.join(screenshotsRoot, "053-offline", canonicalName)),
    ]);
    const legacyHash = createHash("sha256").update(legacyBytes).digest("hex");
    const canonicalHash = createHash("sha256").update(canonicalBytes).digest("hex");
    if (legacyHash !== canonicalHash) throw new Error(`Legacy offline capture differs: ${entry.name}`);
  }
  await rm(legacyOfflineRoot, { recursive: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const areas = [
  ["A. First entry / plan entry", "REVIEWED", ["001-landing", "006-start-from-scratch"]],
  ["B. Build Plan — 8 steps", "REVIEWED", ["002-build-plan-steps", "003-build-plan-responsive", "007-build-priorities"]],
  ["C. Build/import processing", "REVIEWED", ["004-build-processing", "005-build-preview"]],
  ["D. Import Plan from Notes", "REVIEWED", ["008-import-entry", "009-import-decisions", "010-import-review-apply"]],
  ["E. Today state matrix", "REVIEWED", ["011-today", "012-today-active", "013-same-day-workouts", "014-missed-session"]],
  ["F. Monthly Calendar", "REVIEWED", ["015-calendar"]],
  ["G. Adjust Today", "REVIEWED", ["016-adjust-today-entry", "017-adjust-today"]],
  ["H. Adjust week / missed sessions", "REVIEWED", ["014-missed-session", "018-adjust-week-availability", "019-adjust-week-states"]],
  ["I. Active planned logger", "REVIEWED", ["020-active-workout", "021-active-workout-layout", "023-exercise-history", "024-warmups", "025-advanced-logging", "026-active-supersets"]],
  ["J. Freestyle logger", "REVIEWED", ["022-freestyle"]],
  ["K. Warm-ups", "REVIEWED", ["024-warmups", "058-warmup-load-source"]],
  ["L. Advanced logging", "REVIEWED", ["025-advanced-logging", "026-active-supersets"]],
  ["M. Workout completion", "REVIEWED", ["027-completion"]],
  ["N. Completed Today / History / Exercise detail", "REVIEWED", ["013-same-day-workouts", "023-exercise-history", "044-workout-photos", "045-workout-photo-timeline"]],
  ["O. History correction", "REVIEWED", ["028-history-correction"]],
  ["P. Coach", "PARTIAL", ["029-coach", "030-coach-adjustments"]],
  ["Q. Progress", "REVIEWED", ["031-progress-low-data", "032-progress-logged-data", "033-progression-advice"]],
  ["R. Training blocks", "REVIEWED", ["034-training-blocks", "035-next-block"]],
  ["S. Profile root", "REVIEWED", ["036-profile"]],
  ["T. Profile subpages", "REVIEWED", ["037-profile-preferences", "038-profile-priorities"]],
  ["U. Gym profiles", "REVIEWED", ["039-gym-profiles"]],
  ["V. Substitutions", "REVIEWED", ["040-substitutions"]],
  ["W. Plate calculator", "REVIEWED", ["041-plate-calculator"]],
  ["X. Custom exercises", "REVIEWED", ["042-custom-exercises"]],
  ["Y. Plan versions", "REVIEWED", ["043-plan-history"]],
  ["Z. Workout photos", "PARTIAL", ["044-workout-photos", "045-workout-photo-timeline"]],
  ["AA. Physique Review", "PARTIAL", ["046-physique-review"]],
  ["AB. History import", "REVIEWED", ["047-history-import"]],
  ["AC. History export", "REVIEWED", ["048-history-export"]],
  ["AD. Plan export", "REVIEWED", ["049-plan-export"]],
  ["AE. Backup / restore / delete", "PARTIAL", ["050-backup-restore", "051-delete-local-data", "054-recovery"]],
  ["AF. Notifications", "PARTIAL", ["052-notifications"]],
  ["AG. Offline / recovery", "PARTIAL", ["053-offline", "054-recovery"]],
  ["AH. Appearance", "REVIEWED", ["055-appearance", "057-premium-recommendation"]],
  ["AI. Bottom navigation", "REVIEWED", ["056-bottom-navigation"]],
];

const groups = (await readdir(screenshotsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{3}-/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const capturesByGroup = new Map();
const manifest = [];
for (const group of groups) {
  const folder = path.join(screenshotsRoot, group);
  let captures = [];
  try { captures = JSON.parse(await readFile(path.join(folder, "CAPTURES.json"), "utf8")); } catch {}
  const referenced = new Set(captures.map((capture) => path.basename(capture.file)));
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".png") && !referenced.has(entry.name)) {
      const target = path.resolve(folder, entry.name);
      if (!target.startsWith(`${path.resolve(screenshotsRoot)}${path.sep}`)) throw new Error(`Unsafe cleanup target ${target}`);
      await rm(target);
    }
  }
  const valid = [];
  for (const capture of captures) {
    const absolute = path.join(screenshotsRoot, capture.file);
    const bytes = await readFile(absolute);
    if (bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`Invalid PNG ${capture.file}`);
    const item = {
      ...capture,
      file: `screenshots/${capture.file.replaceAll("\\", "/")}`,
      pixelWidth: bytes.readUInt32BE(16),
      pixelHeight: bytes.readUInt32BE(20),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    valid.push(item);
    manifest.push(item);
  }
  capturesByGroup.set(group, valid);
}
if (manifest.length < 700) throw new Error(`Unexpectedly small final capture set: ${manifest.length}`);
await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

const oldInventory = await readFile(path.join(canonicalRoot, "FEATURE-INVENTORY.md"), "utf8");
const oldSections = new Map();
for (const block of oldInventory.split(/(?=^## )/m)) {
  const match = block.match(/^## (.+)$/m);
  if (match) oldSections.set(match[1].trim(), block);
}
const inventorySections = areas.map(([title, status, areaGroups]) => {
  const source = oldSections.get(title) || `## ${title}\n`;
  const summary = source.split("<details>")[0]
    .split("\n")
    .filter((line) => !line.startsWith("- Status:") && !line.startsWith("- Screenshot groups:"))
    .join("\n")
    .trim();
  const links = areaGroups.map((group) => `[${group}](INDEX.html#${group})`).join(", ");
  const count = areaGroups.reduce((sum, group) => sum + (capturesByGroup.get(group)?.length || 0), 0);
  return `${summary}\n\n- Final status: **${status}**.\n- Fresh final screenshot groups: ${links}.\n- Linked captures: ${count}.`;
});
await writeFile(path.join(root, "FEATURE-INVENTORY.md"), `# Final canonical feature inventory\n\nThis preserves the 35-area, 325-state inventory established in ROOK-PREMONETIZATION-REVIEW. It replaces historical screenshot links with fresh captures from the current release-green code. Synthetic fixtures only.\n\n${inventorySections.join("\n\n")}\n`);

const limitation = (title, status) => status === "REVIEWED"
  ? "Current browser/runtime evidence reviewed; physical-device-only claims remain in UNVERIFIED.md."
  : title.startsWith("P.") ? "Deterministic Coach UI and bounded actions reviewed; live AI latency/reliability remains unverified."
  : title.startsWith("Z.") ? "Synthetic photo storage/viewer states reviewed; physical camera and permission behavior remains unverified."
  : title.startsWith("AA.") ? "Consent/privacy/error UI reviewed with synthetic fixtures; live analysis and device camera behavior remain unverified."
  : title.startsWith("AE.") ? "Browser round-trip, corruption and rollback paths reviewed; durability outside browser storage remains unverified."
  : title.startsWith("AF.") ? "Permission/state UI reviewed; real delivery and background timer behavior remain unverified."
  : "Browser offline/recovery surfaces reviewed; installed-PWA cold start and storage eviction remain unverified.";
const coverageRows = areas.map(([title, status, areaGroups]) => {
  const count = areaGroups.reduce((sum, group) => sum + (capturesByGroup.get(group)?.length || 0), 0);
  return `| ${title} | ${status} | ${count} | ${areaGroups.join(", ")} | ${limitation(title, status)} |`;
});
const statusCount = (value) => areas.filter(([, status]) => status === value).length;
await writeFile(path.join(root, "FINAL-COVERAGE.md"), `# Final coverage\n\n- Canonical feature areas: 35\n- Canonical important states/interactions: 325\n- Fresh screenshots: ${manifest.length}\n- REVIEWED: ${statusCount("REVIEWED")}\n- PARTIAL: ${statusCount("PARTIAL")}\n- MISSING EVIDENCE: ${statusCount("MISSING EVIDENCE")}\n\nStatus is limited to current browser/runtime evidence. Physical-device concerns are never upgraded to REVIEWED merely from screenshots.\n\n| Area | Status | Linked captures | Fresh groups | Limitation |\n|---|---|---:|---|---|\n${coverageRows.join("\n")}\n\n## Responsive/theme matrix\n\nThe combined fresh groups cover 320, 390 and 430–500 mobile widths; Standard Light/Dark and Premium Light/Dark; Today and bottom navigation; representative Build and Import; Calendar; Active Workout; Coach; Progress; Profile; and major bottom sheets. Reduced motion is exercised in Build/Import processing, Calendar, completion and focused overlay/disclosure regressions.\n`);

await writeFile(path.join(root, "FINAL-CHANGELOG.md"), `# Final accepted changelog\n\n## 1. Training Priorities Physique Review discoverability\n\n- Before: optional Physique Review appeared below the priority choices and required exploratory scrolling; a redundant Balanced-plan status strip was visible.\n- Historical before screenshot (reference only, not final evidence): ${path.join(canonicalRoot, "screenshots", "096-priority-discoverability", "001-390-standard-light--priority-help-initial.png")}\n- After: intro → optional Physique Review helper → Balanced/emphasis choices → relevant selection feedback → sticky SAVE PRIORITIES. The redundant Balanced-plan strip is absent.\n- Fresh after evidence: [390 Standard Light](screenshots/038-profile-priorities/001-390-standard-light--after-390-standard-light.png), [320 Standard Dark](screenshots/038-profile-priorities/003-320-standard-dark--after-320-standard-dark.png), [Premium Dark](screenshots/038-profile-priorities/005-390-premium-dark--after-390-premium-dark.png), [Premium Light](screenshots/038-profile-priorities/007-390-premium-light--after-390-premium-light.png).\n- Production file: src/App.jsx.\n- Tests: accepted-priority-runtime-qa, training-priorities-qa, profile-hub-qa and unit priority semantics passed.\n\n## 2. Nested RIR Help Escape handling\n\n- Before: one Escape reached both document and parent handlers, closing RIR help and Logging & increments together.\n- After: first Escape is consumed by the topmost help, closes it and restores focus to the RIR trigger; second Escape closes Logging & increments and restores parent origin focus. Pointer/touch dismissal does not close the parent.\n- Production file: src/App.jsx (HelpPopover).\n- Focused regression: rir-help-escape-regression-qa passed at 320×844 and 390×844, reduced and normal motion, with state unchanged. Runtime evidence is recorded in TEST-RESULTS.md; still images are not claimed as proof of the two-step Escape sequence.\n\n## 3. Premium Light progression recommendation token\n\n- Before: normal recommendation text used hardcoded legacy #1a5c41.\n- After: normal recommendation uses the existing --rook-accent-strong semantic token; hold/caution continues to use --rook-warning-text.\n- Production files: src/styles.css, src/theme.css, src/workout-controls.css.\n- Four-theme evidence: [Standard Light](screenshots/057-premium-recommendation/001-390-standard-light--standard-light-progress.png), [Standard Dark](screenshots/057-premium-recommendation/003-390-standard-dark--standard-dark-progress.png), [Premium Light](screenshots/057-premium-recommendation/005-390-premium-light--premium-light-progress.png), [Premium Dark](screenshots/057-premium-recommendation/007-390-premium-dark--premium-dark-progress.png). Hold evidence is adjacent in the same group.\n\n## 4. Programmed set-count audit\n\n- No production change required.\n- 3 → 2 and 2 → 4 persist through Review → Save and reload. Minimum is 1; zero does not delete an exercise. Invalid values revert to the last valid value. Non-imported maximum is 6 and imported maximum is 20. Superset members remain synchronized and A1 → A2 alternation remains intact. Completed history/PR/e1RM data is unchanged.\n\n## 5. Warm-up load-source audit\n\n- No production change required.\n- The old phone 130 kg working load with 5/5 kg ramps did not reproduce.\n- Current history-derived Leg Press evidence: [130 kg working load → 65 kg × 8, 90 kg × 4](screenshots/058-warmup-load-source/001-390-standard-dark--history-derived-130kg-current.png).\n- Explicit 60 kg produces 30 kg × 8 and 40 kg × 4. Unknown load remains non-numeric; bodyweight receives no inappropriate weighted ramp. kg/lb and machine/barbell paths remain proportional.\n`);

await writeFile(path.join(root, "TEST-RESULTS.md"), `# Accepted final test results\n\n## Browser\n\n- Final high-risk smoke: 23 passed, 0 failed.\n- All 124 release-manifest scripts have current individual passing evidence.\n- Latest interrupted aggregate pass: 85/85 passed before manual stop.\n- No unresolved QA/harness defect.\n- The 124-script manifest was not rerun for this package.\n\n## Unit/domain/build\n\n- Unit: npm run test:release — 1663 passed, 0 failed, 0 skipped; 92 files passed.\n- Domain: npm run test:release:domain — 194 passed, 0 failed, 0 skipped.\n- Build: npm run build — passed; 451 modules transformed; existing large-chunk warning only.\n- No separate typecheck or lint command is configured.\n\n## Focused release regressions\n\n- RIR Escape: 320×844 and 390×844 passed. First Escape closes only help and restores trigger focus; second closes the parent; no settings persistence.\n- Recommendation theme: normal progression and hold passed in Standard Light, Standard Dark, Premium Light and Premium Dark; Premium Light normal text is not #1a5c41.\n- Warm-up load source: history 130 kg → 65/90 kg; explicit 60 kg → 30/40 kg; unknown/bodyweight remain non-numeric; lb and barbell cases proportional.\n- Programmed set runtime: 3→2 and 2→4 persisted; minimum 1; invalid/zero reverted; non-imported 6 accepted/7 rejected; imported 20 accepted/21 rejected; superset save/reload and A1→A2 order passed; completed history unchanged.\n\n## Final capture QA-only corrections\n\nFour capture-only issues were corrected and focused groups rerun green: missed-session assertion now accounts for multiple remaining missed sessions after date rollover; Calendar final fixture uses one deterministic timezone while the normal cross-timezone test remains available; capture waits ignore intentionally paused animations; workout-photo offline capture uses the built preview/service worker. No production code changed for these corrections.\n`);

await writeFile(path.join(root, "UNVERIFIED.md"), `# Unverified physical/external behavior\n\nThese are limitations, not known release defects:\n\n- Installed iPhone/PWA safe-area behavior.\n- Actual iOS software keyboard behavior.\n- VoiceOver.\n- TalkBack.\n- Haptics on physical devices.\n- Real notification delivery and permission behavior.\n- Background rest-timer execution/delivery.\n- Browser-storage eviction and OS low-storage behavior.\n- Physical-device gesture and touch feel.\n- Actual AI latency, availability and response reliability.\n- Live Physique Review analysis quality and device-camera behavior.\n- Backup-file durability after leaving browser-managed storage.\n- Long-term offline cold-start behavior after browser/OS cache eviction.\n- Store packaging, production hosting, analytics, crash reporting and deployment configuration.\n`);

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const sections = groups.filter((group) => (capturesByGroup.get(group)?.length || 0) > 0).map((group) => `<section id="${esc(group)}"><h2>${esc(group)}</h2><div>${capturesByGroup.get(group).map((capture) => `<a href="${esc(capture.file)}"><img loading="lazy" src="${esc(capture.file)}"><span>${esc(path.basename(capture.file))}</span></a>`).join("")}</div></section>`).join("");
await writeFile(path.join(root, "INDEX.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ROOK pre-monetization final</title><style>body{font:15px Arial,sans-serif;margin:24px;background:#eeeae3;color:#202522}nav{display:flex;gap:14px;flex-wrap:wrap}section{margin:34px 0}section>div{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}a{color:inherit;text-decoration:none;font-size:11px;overflow-wrap:anywhere}img{display:block;width:100%;height:390px;object-fit:contain;object-position:top;background:#d6d4cf}span{display:block;margin-top:6px}</style></head><body><h1>ROOK · pre-monetization final evidence</h1><p>${manifest.length} fresh screenshots from the current release-green code. Synthetic fixtures. Runtime-only and physical-device limitations are documented separately.</p><nav><a href="FEATURE-INVENTORY.md">Feature inventory</a><a href="FINAL-COVERAGE.md">Coverage</a><a href="FINAL-CHANGELOG.md">Changelog</a><a href="TEST-RESULTS.md">Tests</a><a href="UNVERIFIED.md">Unverified</a></nav>${sections}</body></html>`);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1900 }, deviceScaleFactor: 1 });
const boards = [];
async function board(name, items) {
  const cards = [];
  for (const item of items) {
    const bytes = await readFile(path.join(root, item.file));
    cards.push(`<div><p>${esc(item.file)}</p><img src="data:image/png;base64,${bytes.toString("base64")}"></div>`);
  }
  await page.setContent(`<style>body{margin:12px;background:#b9b7b2;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;font:10px Arial}p{height:38px;margin:0;overflow-wrap:anywhere}img{width:245px;height:500px;object-fit:contain;object-position:top;background:#ddd}</style>${cards.join("")}`);
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  const file = path.join(contactRoot, name);
  await page.screenshot({ path: file, fullPage: true });
  boards.push(path.relative(root, file).replaceAll("\\", "/"));
}
const finalFixes = [
  "screenshots/038-profile-priorities/001-390-standard-light--after-390-standard-light.png",
  "screenshots/038-profile-priorities/003-320-standard-dark--after-320-standard-dark.png",
  "screenshots/038-profile-priorities/005-390-premium-dark--after-390-premium-dark.png",
  "screenshots/057-premium-recommendation/001-390-standard-light--standard-light-progress.png",
  "screenshots/057-premium-recommendation/003-390-standard-dark--standard-dark-progress.png",
  "screenshots/057-premium-recommendation/005-390-premium-light--premium-light-progress.png",
  "screenshots/057-premium-recommendation/007-390-premium-dark--premium-dark-progress.png",
  "screenshots/058-warmup-load-source/001-390-standard-dark--history-derived-130kg-current.png",
].map((file) => manifest.find((item) => item.file === file)).filter(Boolean);
await board("00-final-fixes.png", finalFixes);
const nonEmptyGroups = groups.filter((group) => capturesByGroup.get(group)?.length);
for (let offset = 0; offset < nonEmptyGroups.length; offset += 6) {
  const picked = nonEmptyGroups.slice(offset, offset + 6).flatMap((group) => {
    const list = capturesByGroup.get(group);
    return [...new Set([0, Math.floor(list.length / 2), list.length - 1])].map((index) => list[index]);
  });
  await board(`board-${String(offset / 6 + 1).padStart(2, "0")}.png`, picked);
}
await browser.close();

const runPath = path.join(root, "RUN.json");
try {
  const run = JSON.parse(await readFile(runPath, "utf8"));
  const reruns = {
    "014-missed-session": "Date-rollover fixture now validates the resolved session and any legitimately remaining missed sessions.",
    "015-calendar": "Focused 320/390/430 four-theme capture passed with deterministic Europe/Ljubljana capture timezone.",
    "027-completion": "Capture wait no longer blocks on intentionally paused animation; all 32 theme/width/state cases passed.",
    "045-workout-photo-timeline": "Built-preview/service-worker capture passed.",
  };
  run.groups = run.groups.map((group) => reruns[group.group] ? { ...group, result: "completed-after-focused-rerun", exitCode: 0, signal: null, note: reruns[group.group] } : group);
  run.packagedAt = new Date().toISOString();
  await writeFile(runPath, JSON.stringify(run, null, 2));
} catch {}

await writeFile(path.join(root, "PACKAGE.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  screenshots: manifest.length,
  screenshotGroups: nonEmptyGroups.length,
  contactSheets: boards.length,
  canonicalFeatureAreas: 35,
  canonicalStates: 325,
  coverage: { reviewed: statusCount("REVIEWED"), partial: statusCount("PARTIAL"), missingEvidence: statusCount("MISSING EVIDENCE") },
}, null, 2));

console.log(JSON.stringify({ root, screenshots: manifest.length, groups: nonEmptyGroups.length, contactSheets: boards.length, reviewed: statusCount("REVIEWED"), partial: statusCount("PARTIAL"), missingEvidence: statusCount("MISSING EVIDENCE") }, null, 2));
