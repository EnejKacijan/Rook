import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const outputDir = path.join(root, "artifacts", "ui-consistency-audit");
await mkdir(outputDir, { recursive: true });

const boards = [
  [
    ["Backup & Restore", "backup-restore/390-backup-light-standard.png", "backup-restore/390-restore-preview.png", "recovery-path/logout-warning.png"],
    ["Adjust Today", "adjust-today/02-mode-picker.png", "adjust-today/08-review.png", "adjust-today/12-review-premium-dark-390.png"],
    ["Gym Profiles", "gym-profiles/03-multiple-gyms.png", "gym-profiles/05-edit.png", "gym-profiles/10-long-name-320.png"],
  ],
  [
    ["Smart substitutions", "smart-substitutions/390-normal-recommendations.png", "smart-substitutions/390-no-valid-recommendation.png", "smart-substitutions/390-premium-dark.png"],
    ["Plate calculator", "plate-calculator/390-common-80kg.png", "plate-calculator/390-config.png", "plate-calculator/390-impossible-nearest.png"],
    ["Plan history", "plan-history/390-standard-light-list.png", "plan-history/390-complex-diff.png", "plan-history/390-restore-confirmation.png"],
    ["Training blocks", "training-blocks/390-edit-block-no-deload.png", "training-blocks/390-block-details-deload.png", "training-blocks/390-premium-dark-deload.png"],
  ],
  [
    ["Performance insights", "performance-insights/390-weekly-review.png", "performance-insights/390-exercise-detail-e1rm.png", "performance-insights/320-many-prs.png"],
    ["Workout photos", "workout-photo-timeline/390-few-timeline.png", "workout-photo-timeline/390-private-viewer.png", "workout-photo-timeline/390-delete-confirmation.png"],
    ["Custom exercises", "custom-exercises/01-custom-exercise-list.png", "custom-exercises/03-edit-and-alias.png", "custom-exercises/05-delete-confirmation.png"],
    ["Workout import", "historical-workout-import/01-source-picker.png", "historical-workout-import/04-exercise-mapping.png", "historical-workout-import/09-error-320.png"],
  ],
  [
    ["Advanced logging", "advanced-logging/01-normal-unchanged.png", "advanced-logging/05-unilateral.png", "advanced-logging/07-premium-drop.png"],
    ["Rest notifications", "rest-notifications/01-permission-not-requested.png", "rest-notifications/03-denied.png", "rest-notifications/04-premium.png"],
    ["Existing sheet references", "modal-scaffold/light-training-restrictions-compact.png", "modal-scaffold/dark-training-priorities.png", "modal-scaffold/premium-edit-plan.png"],
  ],
];

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

for (let boardIndex = 0; boardIndex < boards.length; boardIndex += 1) {
  const sections = [];
  for (const [title, ...files] of boards[boardIndex]) {
    const images = [];
    for (const file of files) {
      const buffer = await readFile(path.join(root, "artifacts", file));
      images.push(`<figure><img src="data:image/png;base64,${buffer.toString("base64")}" alt=""><figcaption>${path.basename(file)}</figcaption></figure>`);
    }
    sections.push(`<section><h2>${title}</h2><div class="row">${images.join("")}</div></section>`);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    *{box-sizing:border-box} body{margin:0;padding:28px;background:#e9e7e2;color:#1b1a19;font-family:Arial,sans-serif}
    h1{margin:0 0 24px;font-size:24px} section{margin:0 0 32px} h2{margin:0 0 12px;font-size:16px}
    .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
    figure{margin:0;padding:10px;background:#fff;border:1px solid #cbc7c0;border-radius:14px}
    img{display:block;width:100%;height:auto;border:1px solid #dedbd5;background:#f6f5f2}
    figcaption{margin-top:8px;color:#6f6c68;font-size:11px;overflow-wrap:anywhere}
  </style><h1>ROOK UI consistency audit · board ${boardIndex + 1}</h1>${sections.join("")}`);
  await page.screenshot({ path: path.join(outputDir, `board-${boardIndex + 1}.png`), fullPage: true });
  await page.close();
}

await browser.close();
console.log(`Created ${boards.length} UI consistency boards.`);
