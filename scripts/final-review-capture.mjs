import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const packageRoot = path.resolve("artifacts", "ROOK-PREMONETIZATION-FINAL");
const root = path.join(packageRoot, "screenshots");
await mkdir(path.join(packageRoot, "internal-logs"), { recursive: true });
await mkdir(root, { recursive: true });

const groups = [
  ["001-landing", "landing-qa"],
  ["002-build-plan-steps", "capture-questionnaire"],
  ["003-build-plan-responsive", "onboarding-weekly-structure-qa"],
  ["004-build-processing", "plan-processing-qa"],
  ["005-build-preview", "plan-preview-summary-qa"],
  ["006-start-from-scratch", "scratch-plan-qa"],
  ["007-build-priorities", "priority-hierarchy-qa"],
  ["008-import-entry", "import-entry-qa"],
  ["009-import-decisions", "import-decisions-qa"],
  ["010-import-review-apply", "import-apply-qa"],
  ["011-today", "today-hierarchy-qa"],
  ["012-today-active", "active-today-qa"],
  ["013-same-day-workouts", "same-day-workouts-qa"],
  ["014-missed-session", "missed-resolution-qa"],
  ["015-calendar", "month-calendar-qa"],
  ["016-adjust-today-entry", "adjust-entry-polish-qa"],
  ["017-adjust-today", "adjust-today-qa"],
  ["018-adjust-week-availability", "flexible-availability-qa"],
  ["019-adjust-week-states", "flexible-week-states-qa"],
  ["020-active-workout", "workout-flow-qa"],
  ["021-active-workout-layout", "workout-logging-affordance-qa"],
  ["022-freestyle", "freestyle-workout-qa"],
  ["023-exercise-history", "exercise-history-qa"],
  ["024-warmups", "warmup-sequencing-qa"],
  ["025-advanced-logging", "advanced-logging-qa"],
  ["026-active-supersets", "active-workout-superset-qa"],
  ["027-completion", "completion-feedback-qa"],
  ["028-history-correction", "history-correction-qa"],
  ["029-coach", "coach-history-qa"],
  ["030-coach-adjustments", "coach-coverage-adapt-qa"],
  ["031-progress-low-data", "goal-progress-qa"],
  ["032-progress-logged-data", "logged-exercises-qa"],
  ["033-progression-advice", "progression-advice-qa"],
  ["034-training-blocks", "training-blocks-qa"],
  ["035-next-block", "block-review-qa"],
  ["036-profile", "profile-hub-qa"],
  ["037-profile-preferences", "profile-logging-qa"],
  ["038-profile-priorities", "training-priorities-qa"],
  ["039-gym-profiles", "gym-profiles-qa"],
  ["040-substitutions", "smart-substitutions-qa"],
  ["041-plate-calculator", "plate-calculator-qa"],
  ["042-custom-exercises", "custom-exercises-qa"],
  ["043-plan-history", "plan-history-grouping-qa"],
  ["044-workout-photos", "workout-photo-compare-qa"],
  ["045-workout-photo-timeline", "workout-photo-timeline-qa"],
  ["046-physique-review", "physique-privacy-qa"],
  ["047-history-import", "historical-workout-import-qa"],
  ["048-history-export", "workout-history-export-qa"],
  ["049-plan-export", "export-plan-qa"],
  ["050-backup-restore", "backup-restore-qa"],
  ["051-delete-local-data", "delete-local-data-qa"],
  ["052-notifications", "rest-notifications-qa"],
  ["053-offline", "current-review-offline-surface"],
  ["054-recovery", "recovery-path-qa"],
  ["055-appearance", "appearance-qa"],
  ["056-bottom-navigation", "main-navigation-qa"],
  ["057-premium-recommendation", "recommendation-theme-qa"],
  ["058-warmup-load-source", "warmup-load-source-qa"],
];

const run = { startedAt: new Date().toISOString(), packageRoot, groups: [] };
let next = 0;
async function worker() {
  while (next < groups.length) {
    const [group, script] = groups[next++];
    console.log(`CAPTURE ${group}`);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["--import", "./scripts/current-review-capture-hook.mjs", `scripts/${script}.mjs`], {
        windowsHide: true,
        env: {
          ...process.env,
          ROOK_CURRENT_REVIEW: root,
          ROOK_CURRENT_REVIEW_GROUP: group,
          ROOK_QA_URL: "http://127.0.0.1:4173",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      child.stdout.on("data", (value) => { log += value; });
      child.stderr.on("data", (value) => { log += value; });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, log });
      });
      child.on("error", (error) => { log += error.message; });
    });
    await writeFile(path.join(packageRoot, "internal-logs", `${group}.log`), result.log);
    run.groups.push({
      group,
      script,
      result: result.code === 0 ? "completed" : "partial-or-blocked",
      exitCode: result.code,
      signal: result.signal,
    });
    await writeFile(path.join(packageRoot, "RUN.json"), JSON.stringify(run, null, 2));
    console.log(`${result.code === 0 ? "DONE" : "PARTIAL"} ${group}${result.code === 0 ? "" : ` ${result.log.slice(-300)}`}`);
  }
}

await Promise.all([worker(), worker(), worker()]);
run.finishedAt = new Date().toISOString();
await writeFile(path.join(packageRoot, "RUN.json"), JSON.stringify(run, null, 2));
console.log(`FINISHED ${packageRoot}`);
