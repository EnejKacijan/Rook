import { PlanProcessing as BuildingOverlay, finishPlanProcessing } from './PlanProcessing.jsx';
import { rememberSwipeParent } from './swipePageMotion.js';
import { focusNavigationTarget } from './navigationFocus.js';
import { combinedAdjustment, isCombinedAdjustment, combinedTransition, reconcileCombinedTermination, persistCombinedState } from './combinedWorkoutLifecycle.js';
import { CoachCombineCard, CoachCombineChoices, CombinedWorkoutNotice, CombinedProvenance } from './CoachCombine.jsx';
import { applyCombinedProposal } from './combineWorkouts.js';
import { WeightUnitChoice } from './WeightUnitChoice.jsx';
import { applySourceUnitDecision } from './importSourceUnits.js';
import { MonthCalendar, CalendarIcon } from './MonthCalendar.jsx';
import './profileHub.css';
import { calendarRange } from './workoutCalendar.js';
import { completionRecognition } from './completionRecognition.js';
import { completedWorkoutsForDate } from './completedWorkoutsForDate.js';
import { FreestyleEntry, FreestyleActions, FreestyleExercisePicker, FreestylePrevious } from './FreestyleWorkout.jsx';
import { removeFreestyleExercise } from './freestyleWorkout.js';
import { adjustedMovedLabel } from './progressPresentation.js';
import { loggedExercises, highestSimpleLoggedLoad } from './loggedExercises.js';
import { importedSetComparable } from './historicalSetSemantics.js';
import { StartupBoundary } from './StartupBoundary.jsx';
import { moveReorderPreview } from './reorderPresentation.js';
import { warmupPrescriptionLabel } from './warmupPrescription.js';
import './loggedExercises.css';
import { PlanNumberInput } from './PlanNumberInput.jsx';
import { nextImportReview } from './nextImportReview.js';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import { bindCoachViewport } from './coachViewport.js';
import { useExerciseSearchSheet } from './useExerciseSearchSheet.js';
import './actionHierarchy.css';
import './bottomNav.css';
import { SearchInput } from './SearchInput.jsx';
import { CustomExerciseFallback } from './CustomExerciseFallback.jsx';
import { PlanConflictResolution, planEditorExerciseAllowed, createPlanEditorExerciseFilter } from './PlanConflictResolution.jsx';
import { removalRows, stagePlanRemoval, undoPlanRemoval } from './planRemovalDraft.js';
import './planRemovalDraft.css';
import { revealPlanConflict } from './revealPlanConflict.js';
import { useAvailableImage } from './useAvailableImage.js';
import { workoutPhotoFile, exportWorkoutPhoto } from './exportWorkoutPhoto.js';
import { PlanReviewIllustration } from './PlanReviewIllustration.jsx';
import { PlanImportIssues } from './PlanImportIssues.jsx';
import { ImportResolution } from './ImportResolution.jsx';
import { useImportNotesPaste } from './useImportNotesPaste.js';
import { StepProgress } from './StepProgress.jsx';
import { exerciseNotePresentation } from './exerciseNotePresentation.js';
import { importMatchEntries, importResolutionGroups, importExerciseReviewGroups } from './importResolution.js';
import { OptionalPlanMatches } from './OptionalPlanMatches.jsx';
import { applySavedPlanImportMatch, keepPlanImportOriginal, planImportSafetyIssues } from './planImportMatching.js';
import { pendingImportIssues, importDecisionSummary } from './planImportReview.js';
import { persistPlanImport } from './planImportTransaction.js';
import { persistProgramReplacement } from './planReplacement.js';
import { deleteCompletedWorkout } from './deleteCompletedWorkout.js';
import { updatePerSideReps, carryPerSideSet } from './advancedLogging.js';
import { Disclosure } from './Disclosure.jsx';
import { groupPlanVersions } from './planHistoryGroups.js';
import { SessionFeedbackPrompt, SessionFeedbackDisplay } from './SessionFeedback.jsx';
import { WorkoutHistoryExport } from './WorkoutHistoryExport.jsx';
import { HistoryCorrectionEditor } from './HistoryCorrectionEditor.jsx';
import { WorkoutPhotoCompare } from './WorkoutPhotoCompare.jsx';
import { BlockReviewSheet } from './BlockReviewSheet.jsx';
import { useSheetBack } from './useSheetBack.js';
import { FlexibleWeekSheet } from './FlexibleWeekSheet.jsx';
import { flexibleSourceForDate, flexibleWeekConflict, missedFlexibleSessions } from './flexibleWeek.js';
import { EstimatedOneRepMaxChart } from './EstimatedOneRepMaxChart.jsx';
import {
  Component,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useCallback,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  AIService,
  normalizeCoachText,
  preparePhysiquePhoto,
} from "./aiService.js";
import { trackFunnelEvent, trackFunnelEventOnce } from "./analytics.js";
import {
  clearWorkoutPhotos,
  deleteWorkoutPhoto,
  getWorkoutPhoto,
  saveWorkoutPhoto,
} from "./workoutPhotos.js";
import {
  createObjectUrlLease,
  groupWorkoutPhotoTimeline,
} from "./workoutPhotoTimeline.js";
import { useWorkoutPhotoCollection } from "./useWorkoutPhotoCollection.js";
import { useSelectionAcknowledgement, useScheduleContinueReveal } from "./useOnboardingInteractions.js";
import { useStepSwipeForward } from "./useStepSwipeForward.js";
import {
  E1RM_FORMULA,
  activeExercisePr,
  exercisePerformance,
  weeklyPerformanceReview,
} from "./performanceInsights.js";

let backupToolsPromise;
const loadBackupTools = () => (backupToolsPromise ||= import("./backup.js"));

function rookViewTransitionName(...parts) {
  return `rook-${parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function runRookViewTransition(change) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function" ||
    reducedMotion
  ) {
    change();
    return null;
  }
  return document.startViewTransition(() => flushSync(change));
}
import { rampWeightForWorkingLoad } from "./warmups.js";
import {
  isSupersetRoundBoundary,
  nextSupersetStep,
  pairActiveWorkoutExercises,
  remapCopiedSupersetIds,
  supersetMeta,
  supersetRoundKey,
  unpairActiveWorkoutExercises,
} from "./supersets.js";
import {
  compileTrainingSafety,
  compileProfileTrainingSafety,
  createTrainingClearanceAttestation,
  createTrainingClearanceResponse,
  createTrainingLimitsResponse,
  exerciseAllowedByTrainingSafety,
  localTrainingSafetyResolution,
  TRAINING_SAFETY_SCHEMA_VERSION,
  trainingSafetyBlocks,
} from "./trainingSafety.js";
import {
  detectSplitPreference,
  onboardingSplitOptions,
  selectStructuralTemplate,
} from "./splitPreferences.js";
import {
  BALANCED_TRAINING_PRIORITY,
  MAX_MANUAL_TRAINING_PRIORITIES,
  TRAINING_EMPHASIS_PRIORITIES,
  TRAINING_PRIORITY_OPTIONS,
  nextManualPrioritySelection,
  normalizeManualPrioritySelection,
} from "./prioritySelection.js";
import {
  EQUIPMENT_BY_ENVIRONMENT,
  EXERCISE_THUMBNAIL_NORMALIZATION,
  PHYSIQUE_PRIORITY_OPTIONS,
  WEEKDAYS,
  adaptedTemplateForToday,
  activeWorkoutCanRestart,
  applyCoachAction,
  applyProgramExerciseChanges,
  applyWeekScheduleChanges,
  blankState,
  bodyWeightFromKg,
  buildProgram,
  buildReplacementProgram,
  coachActionConflict,
  combinedTrainingPriorities,
  completeWorkout,
  completedWorkoutCanResume,
  cancelOptionalSession,
  compatibleReplacementCandidates,
  consistencyForCurrentWeek,
  currentWeekSchedule,
  customSplitValidation,
  displayDate,
  displayWeight,
  effectiveProgressFocus,
  estimateSessionMinutes,
  estimateWorkoutMinutes,
  exerciseCatalog,
  exerciseLoadRequirement,
  exerciseMeasure,
  exerciseMatchesQuery,
  rankExerciseSearch,
  displayEstimatedOneRepMax,
  exerciseName,
  exerciseNote,
  exercisePersonalNote,
  exerciseValueLabel,
  firstScheduledDate,
  formatDuration,
  importedExerciseNameNeedsReview,
  isExerciseAllowed,
  isoDay,
  readStartupState,
  matchImportedExerciseName,
  materializeWarmupPlan,
  nextScheduledWorkout,
  normalizeWorkoutName,
  normalizeSessionNote,
  optionalStrengthForDate,
  optionalSessionElapsedSeconds,
  pauseOptionalSession,
  plannedWorkoutForDate,
  pluralize,
  previousExercise,
  progressionFor,
  profileIsUnder18,
  recentExerciseProgress,
  refreshWorkoutWarmup,
  userSelectableReplacementCandidates,
  removeExerciseFromOccurrence,
  removeExerciseFromWeeklyPlan,
  reorderExercisesForOccurrence,
  restartActiveWorkout,
  resumeCompletedWorkout,
  resumeOptionalSession,
  restoreOccurrenceOverride,
  restoreWeeklyPlanWorkout,
  roundedEstimate,
  saveState,
  STORAGE_KEY,
  saveActiveExercisePersonalNote,
  splitImportedExerciseLabel,
  startWorkout,
  startOptionalSession,
  storedWeight,
  SESSION_NOTE_MAX_LENGTH,
  EXERCISE_PERSONAL_NOTE_MAX_LENGTH,
  targetLabel,
  trainingGoalKey,
  templateForToday,
  validateProgram,
  uid,
  validateProgramExerciseChanges,
  validateWeekScheduleChanges,
  warmupForWorkout,
  weekDate,
  weekKey,
  weekday,
  weightUnit,
  weightCheckinNeedsConfirmation,
  weightTrend,
  upsertWeightCheckin,
  validateWeightCheckin,
  workoutSetSummary,
  workoutPlanDate,
  finishOptionalSession,
  workoutDisplayParts,
  workingSetCanComplete,
} from "./domain.js";
import { EXPERT_ISSUES } from "./expertFeedback.js";
import {
  buildExerciseReorderBlocks,
  chronologicalProgramDays,
  moveExerciseReorderBlock,
  moveWorkoutThroughWeek,
} from "./planReorder.js";
import {
  buildWeeklyPlanExport,
  hasWorkoutExportNotes,
} from "./workoutExport.js";
import { sessionLogSetParts } from "./sessionLog.js";
import {
  ADJUST_TODAY_MODES,
  applyTodayAdjustment,
  buildTodayAdjustment,
  manualReplacementChoices,
  resolveTodayAdjustment,
  restoreOriginalTodayWorkout,
} from "./adjustToday.js";
import {
  CANONICAL_GYM_EQUIPMENT,
  createGymProfile,
  defaultGymProfile,
  deleteGymProfile,
  effectiveGymContext,
  effectiveGymProfile,
  equipmentProfile,
  normalizeGymEquipment,
  normalizeGymProfilesState,
  setDefaultGymProfile,
  updateGymProfile,
} from "./gymProfiles.js";
import {
  normalizeSubstitutionPreferencesState,
  recordSubstitutionPreference,
  substitutionReason,
} from "./substitutions.js";
import {
  CUSTOM_EXERCISE_EQUIPMENT,
  CUSTOM_EXERCISE_LOGGING_TYPES,
  CUSTOM_EXERCISE_MUSCLES,
  CUSTOM_EXERCISE_PATTERNS,
  availableCustomExerciseItems,
  createCustomExercise,
  createCustomExerciseRecord,
  customExerciseCatalogItem,
  customExerciseSnapshot,
  customExerciseUsage,
  deleteCustomExercise,
  normalizeCustomExercisesState,
  normalizeExerciseAlias,
  registerCustomExerciseRecord,
  rememberExerciseAlias,
  removeExerciseAlias,
  resolveRememberedExercise,
  saveCustomExerciseDetails,
} from "./customExercises.js";
import {
  CUSTOM_EXERCISE_LOGGING_MODES,
} from "./customExercises.js";
import {
  historySetDescriptor,
  hasOpenRepTarget,
  hasUnspecifiedRepTarget,
  loggingUnit,
  openRepTargetLabel,
  loggingModeOf,
  segmentKindForSet,
  setTypeLabel,
} from "./advancedLogging.js";
import {
  requestRestNotificationPermission,
  restNotificationCapability,
  restNotificationSettingCopy,
  shouldHandleRestCompletion,
  shouldShowBackgroundRestNotification,
  showRestCompleteNotification,
} from "./restNotifications.js";
import {
  calculatePlateLoad,
  defaultPlateSetup,
  kgToPlateUnit,
  normalizePlateSetup,
  plateLoadingRelation,
  plateUnitToKg,
  selectedPlateBar,
} from "./plateCalculator.js";
import {
  addPlanVersion,
  diffPlanPrograms,
  normalizePlanHistoryState,
  planRestoreImpact,
  programMeaningfullyChanged,
  restorePlanVersion,
} from "./planHistory.js";
import {
  currentTrainingBlock,
  currentTrainingBlockWeek,
  normalizeTrainingBlocksState,
  reconfigureTrainingBlock,
} from "./trainingBlocks.js";
import {
  GENERIC_HISTORY_CSV_HEADER,
  HISTORICAL_IMPORT_SOURCES,
  historicalExerciseChoices,
  historicalExerciseLabel,
} from "./historicalWorkoutImport.js";
import { createHistoryImportClient } from './historyImportClient.js';
import HistoryImportSetup from './HistoryImportSetup.jsx';
const navItems = [
  ["today", "TODAY"],
  ["coach", "COACH"],
  ["progress", "PROGRESS"],
  ["profile", "PROFILE"],
];
const clone = (value) => structuredClone(value);
const afterVisibleFrame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
const waitFor = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function generatePersonalizedProgram(
  profile,
  { onStage, currentProgram = null, workouts = [] } = {},
) {
  const startedAt = performance.now();
  onStage?.("preparing");
  await afterVisibleFrame();
  onStage?.("building");
  await afterVisibleFrame();
  const program = currentProgram
    ? buildReplacementProgram(profile, currentProgram, workouts)
    : buildProgram(profile);
  onStage?.("checking");
  await afterVisibleFrame();
  const validation = validateProgram(program, profile, {
    requireProgramQuality: true,
  });
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  await finishPlanProcessing(startedAt, onStage);
  return { program, source: "personalized-template" };
}
function loadInitialLiftState() {
  const result = readStartupState();
  if (result.status !== 'ready') return result;
  // Any additional startup normalization must also fail closed, before autosave.
  try {
    const initial = normalizePlanHistoryState(normalizeCustomExercisesState(normalizeTrainingBlocksState(result.state)));
    return { status: 'ready', state: initial };
  } catch (error) { return { status: 'error', error }; }
}
function useLiftState(startup) {
  const alreadyPersistedState = useRef(null);
  const [state, setState] = useState(() => {
    const initial = startup.status === 'empty' ? blankState() : startup.state;
    if (initial.profile.onboardingComplete) {
      const landingDate = initial.activeWorkout
        ? initial.selectedDate || initial.activeWorkout.workoutDateKey || isoDay()
        : isoDay();
      initial.selectedDay = weekday(`${landingDate}T12:00:00`);
      initial.selectedDate = landingDate;
    }
    return initial;
  });
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  useLayoutEffect(() => {
    if (alreadyPersistedState.current === state) {
      alreadyPersistedState.current = null;
      setPersistenceFailed(false);
      return;
    }
    const pristineLanding =
      !state.profile.onboardingComplete &&
      state.profile.units !== 'lb' &&
      !state.program &&
      !state.activeWorkout &&
      !state.activeOptionalSession &&
      !state.profile.name &&
      !state.profile.goal &&
      !state.profile.experience &&
      !state.profile.daysPerWeek &&
      !(state.workouts || []).length &&
      !(state.conversations || []).length;
    if (pristineLanding) {
      // An empty in-memory state is NEVER authority to delete persisted data.
      // Confirmed first-run stays unwritten until a meaningful user change.
      return;
    }
    const saved = saveState(state);
    setPersistenceFailed(!saved);
  }, [state]);
  return [
    state,
    (fn, options = {}) =>
      setState((previous) => {
        const draft = clone(previous);
        const previousProgram = clone(previous.program);
        const next = normalizeTrainingBlocksState(
          normalizeSubstitutionPreferencesState(
            normalizeCustomExercisesState(
              normalizeGymProfilesState(fn(draft) || draft),
            ),
          ),
        );
        if (programMeaningfullyChanged(previousProgram, next.program)) {
          const requested = options.planVersion;
          if (requested !== false) {
            const initial = !previousProgram;
            const imported = next.program?.source === "ai-import";
            addPlanVersion(next, {
              previousProgram,
              source:
                requested?.source ||
                (initial ? (imported ? "Imported plan" : "Initial plan") : imported ? "Imported plan" : "Manual edit"),
              reason: requested?.reason || null,
              summary: requested?.summary || null,
            });
          }
        } else normalizePlanHistoryState(next);
        reconcileCombinedTermination(previous,next);
        if(combinedTransition(previous,next) && !options.persistedState) {
          if(!saveState(next)){setPersistenceFailed(true);return previous;}
          alreadyPersistedState.current=next;
        }
        // An atomic importer can publish the exact state it has just saved.
        // Only skip the automatic write if normalization changed nothing.
        if (options.persistedState && JSON.stringify(next) === JSON.stringify(options.persistedState)) alreadyPersistedState.current = next;
        return next;
      }),
    persistenceFailed,
  ];
}

class RookErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error("ROOK render failed", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error-screen" role="alert">
        <p className="eyebrow">ROOK</p>
        <h1>Rook hit a problem.</h1>
        <p>Your saved plan and workout data have not been cleared.</p>
        <button className="button primary" onClick={() => location.reload()}>
          RELOAD APP
        </button>
      </main>
    );
  }
}

function PersistenceHost({ failed, onBackup, children }) {
  if (!failed) return children;
  return (
    <div className="persistence-host">
      <aside className="persistence-warning" role="alert">
        <span>
          Changes can’t be saved on this device. Check browser storage before
          closing Rook.
        </span>
        {onBackup && <button type="button" onClick={onBackup}>BACK UP NOW</button>}
      </aside>
      {children}
    </div>
  );
}
export function resolvedTheme(preference, systemDark = false) {
  if (preference === "premium") return "premium";
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}
export function resolvedAppearance(preference, systemDark = false) {
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}
export function legacyThemePreference(appearance, style) {
  return style === "premium" ? "premium" : appearance;
}
function useResolvedTheme(
  appearancePreference = "system",
  stylePreference = "standard",
) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const appearance = resolvedAppearance(
        appearancePreference,
        media.matches,
      );
      const style = stylePreference === "premium" ? "premium" : "standard";
      document.documentElement.dataset.appearance = appearance;
      document.documentElement.dataset.style = style;
      document.documentElement.dataset.theme = legacyThemePreference(
        appearance,
        style,
      );
      if (style === "premium")
        document.documentElement.dataset.premiumScheme = appearance;
      else delete document.documentElement.dataset.premiumScheme;
      document.documentElement.style.colorScheme = appearance;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          style === "premium"
            ? appearance === "dark" ? "#11110f" : "#f7f5f0"
            : appearance === "dark"
              ? "#111413"
              : "#f6f5f2",
        );
    };
    apply();
    if (appearancePreference !== "system") return undefined;
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, [appearancePreference, stylePreference]);
}
function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function triggerHaptic(type = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function")
    return;
  const pattern = type === "complete" ? [18, 32, 18] : type === "success" ? 14 : 8;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are an optional enhancement and must never block the action.
  }
}
function BackLabel() {
  return (
    <>
      <span className="back-chevron" aria-hidden="true">
        ‹
      </span>
      Back
    </>
  );
}
function trainingSafetyFor(profile) {
  return compileProfileTrainingSafety(
    profile || {},
    Object.values(exerciseCatalog),
  );
}
export function trainingClearanceLimitRows(safety) {
  const rows = [];
  if (safety?.clinicianScope?.label)
    rows.push({ label: "Training scope", value: safety.clinicianScope.label });
  for (const value of safety?.appliedLabels || []) {
    const effort = String(value).match(/^(.+): at least (\d+) RIR$/i);
    if (effort)
      rows.push({ label: effort[1], value: `Keep at least ${effort[2]} RIR` });
    else rows.push({ label: "Avoid", value });
  }
  return rows;
}
function TrainingSafetySummary({
  safety,
  confirmScope,
  confirmClearance,
  setClearanceResponse,
  resetClearanceResponse,
  setLimitsResponse,
  resetLimitsResponse,
  supplementalLimitText,
  setSupplementalLimitText,
  checkSupplementalLimits,
  supplementalLimitStatus,
  editRestriction,
}) {
  const [clearanceReasonOpen, setClearanceReasonOpen] = useState(false);
  const [limitsInputOpen, setLimitsInputOpen] = useState(false);
  if (!safety?.sourceText) return null;
  const blocked = trainingSafetyBlocks(safety.status);
  const clarifyingLimit = safety.status === "needs_clarification";
  const symptomTrigger = safety.status === "needs_trigger_confirmation";
  const unresolvedQuote = safety.semanticAnalysis?.unresolved?.[0]?.evidence?.quote;
  const limitsInput = (
    <div className="supplemental-limits-input">
      <Eyebrow>{clarifyingLimit ? "NEEDS CLARIFICATION" : "TRAINING LIMITS"}</Eyebrow>
      <strong>
        {clarifyingLimit
          ? "What specific training limit were you given?"
          : symptomTrigger
            ? "What movements or exercises make it worse?"
          : "What limits were you given?"}
      </strong>
      {clarifyingLimit && (
        <p>
          Rook couldn't turn {unresolvedQuote ? `“${unresolvedQuote}”` : "that wording"} into
          a rule it can reliably apply. Add the specific exercise, movement,
          range, load, or effort limit you were given.
        </p>
      )}
      <textarea
        aria-label={symptomTrigger ? "Symptom triggers" : clarifyingLimit ? "Specific training limit" : "Training limits"}
        className="text-answer compact-answer"
        value={supplementalLimitText || ""}
        onChange={(event) => setSupplementalLimitText?.(event.target.value)}
        placeholder={symptomTrigger ? "e.g. squats, lunges, leg press" : "e.g. avoid squats, don't take leg press to failure"}
      />
      <small>
        {symptomTrigger
          ? "Write naturally. Rook will only exclude movements or exercises it can identify explicitly."
          : "Write naturally. Rook will only apply limits it can identify explicitly."}
      </small>
      {supplementalLimitStatus === "checking" && (
        <div className="restriction-checking" role="status">
          <span className="restriction-spinner" aria-hidden="true" />
          <span><strong>Checking limits…</strong><small>This can take a few seconds.</small></span>
        </div>
      )}
      {supplementalLimitStatus === "error" && (
        <p>Rook couldn't review these limits. Try again.</p>
      )}
      <div className="training-safety-actions">
        <button
          type="button"
          disabled={!String(supplementalLimitText || "").trim() || supplementalLimitStatus === "checking"}
          onClick={checkSupplementalLimits}
        >
          {supplementalLimitStatus === "checking"
            ? "CHECKING…"
            : clarifyingLimit
              ? "CHECK LIMIT"
              : "CHECK LIMITS"}
        </button>
        {!clarifyingLimit && (
          <button type="button" aria-label="Back to training safety" onClick={() => setLimitsInputOpen(false)}>BACK</button>
        )}
      </div>
    </div>
  );
  if (clarifyingLimit && checkSupplementalLimits)
    return (
      <div className="training-safety-summary needs-confirmation" role="status">
        {limitsInput}
      </div>
    );
  if (safety.status === "needs_limits_confirmation")
    return (
      <div className="training-safety-summary needs-confirmation" role="status">
        {limitsInputOpen ? limitsInput : (
          <>
            <Eyebrow>TRAINING LIMITS</Eyebrow>
            <strong>Were you given any specific training limits?</strong>
            <p>
              These might include exercises or movements to avoid, or limits
              on range, load, or effort.
            </p>
            <div className="training-safety-actions clearance-reasons">
              <button type="button" onClick={() => setLimitsResponse?.("no_specific_limits_reported")}>
                NO SPECIFIC LIMITS WERE GIVEN
              </button>
              <button type="button" onClick={() => setLimitsInputOpen(true)}>
                YES — I WAS GIVEN LIMITS
              </button>
              <button type="button" onClick={() => setLimitsResponse?.("unknown")}>
                I DON'T KNOW / REMEMBER
              </button>
            </div>
          </>
        )}
      </div>
    );
  if (safety.status === "needs_trigger_confirmation")
    return (
      <div className="training-safety-summary needs-confirmation" role="status">
        {limitsInputOpen ? limitsInput : (
          <>
            <Eyebrow>CURRENT SYMPTOMS</Eyebrow>
            <strong>Do you know what makes it worse?</strong>
            <p>
              If a movement or exercise reliably increases the symptom, tell
              Rook what it is. Rook won't guess other restrictions.
            </p>
            <div className="training-safety-actions clearance-reasons">
              <button type="button" onClick={() => setLimitsInputOpen(true)}>
                YES — I KNOW WHAT TRIGGERS IT
              </button>
              <button type="button" onClick={() => setLimitsResponse?.("no_specific_triggers_reported")}>
                NO — NO SPECIFIC TRIGGERS
              </button>
              <button type="button" onClick={() => setLimitsResponse?.("trigger_unknown")}>
                I'M NOT SURE
              </button>
            </div>
          </>
        )}
      </div>
    );
  if (
    safety.status === "needs_clearance_confirmation" &&
    clearanceReasonOpen
  )
    return (
      <div className="training-safety-summary needs-confirmation" role="status">
        <Eyebrow>CLEARANCE STATUS</Eyebrow>
        <strong>Which best matches your situation?</strong>
        <div className="training-safety-actions clearance-reasons">
          <button
            type="button"
            onClick={() => setClearanceResponse?.("clinician_not_cleared")}
          >
            A CLINICIAN SAID NOT YET
          </button>
          <button type="button" onClick={() => setClearanceResponse?.("not_asked")}>
            I HAVEN'T ASKED
          </button>
          <button type="button" onClick={() => setClearanceResponse?.("unknown")}>
            I DON'T KNOW / REMEMBER
          </button>
        </div>
        <button type="button" onClick={() => setClearanceReasonOpen(false)}>
          BACK
        </button>
      </div>
    );
  if (safety.status === "needs_clearance_confirmation")
    {
      const limitRows = trainingClearanceLimitRows(safety);
      const noSpecificLimits =
        ["no_specific_limits_reported", "no_specific_triggers_reported"].includes(
          safety.limitsResponseStatus,
        ) &&
        !limitRows.length;
      const noSpecificTriggers =
        safety.triggerResponseStatus === "no_specific_triggers_reported" &&
        !limitRows.length;
      return (
        <div
          className="training-safety-summary needs-confirmation clearance-review"
          role="status"
        >
          <section className="clearance-limits-block" aria-label="Training limits">
            <Eyebrow>TRAINING LIMITS</Eyebrow>
            {noSpecificLimits ? (
              <>
                <strong>{noSpecificTriggers ? "No specific triggers reported" : "No specific limits reported"}</strong>
                <small>
                  {noSpecificTriggers
                    ? "You told Rook that you don't know of a specific movement or exercise that makes the symptom worse."
                    : "You told Rook that no specific training limits were given."}
                </small>
              </>
            ) : (
              <>
                <strong>Rook will apply these limits</strong>
                <div className="clearance-limit-rows">
                  {limitRows.map((row, index) => (
                    <div className="clearance-limit-row" key={`${row.label}-${row.value}-${index}`}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="clearance-question-block">
            <Eyebrow>ONE QUICK CHECK</Eyebrow>
            <strong>
              {noSpecificLimits
                ? noSpecificTriggers
                  ? "Did a clinician clear you to continue strength training while this symptom is current?"
                  : "Did a clinician clear you to resume strength training?"
                : "Did a clinician clear you to train with these limits?"}
            </strong>
            <p>
              Confirm only whether this matches what you were told. Rook does
              not determine medical clearance.
            </p>
            <div className="training-safety-actions">
              <button type="button" onClick={confirmClearance}>
                {noSpecificLimits
                  ? "YES — I WAS CLEARED TO TRAIN"
                  : "YES — CLEARED WITH THESE LIMITS"}
              </button>
              <button type="button" onClick={() => setClearanceReasonOpen(true)}>
                I CAN'T CONFIRM THAT
              </button>
            </div>
          </section>
        </div>
      );
    }
  if (safety.status === "needs_confirmation")
    return (
      <div className="training-safety-summary needs-confirmation" role="status">
        <Eyebrow>CONFIRM LIMIT</Eyebrow>
        <strong>We understood this as:</strong>
        <p>{safety.clinicianScope?.label}</p>
        <small>
          Confirm only that this matches what you entered. Rook does not
          determine medical clearance.
        </small>
        {confirmScope && (
          <button type="button" onClick={confirmScope}>
            CONFIRM LIMIT
          </button>
        )}
      </div>
    );
  if (blocked)
    return (
      <div className="training-safety-summary blocked" role="alert">
        <Eyebrow>
          {safety.status === "unsupported_limit"
            ? "LIMIT NOT SUPPORTED"
            : safety.status === "needs_clarification"
            ? "NEEDS CLARIFICATION"
            : "TRAINING PAUSED"}
        </Eyebrow>
        <strong>
          {safety.status === "unsupported_limit"
            ? "Rook can't enforce this limit yet."
            : safety.status === "blocked_limits_unknown"
            ? "Training limits aren't confirmed."
            : safety.status === "blocked_trigger_unknown"
            ? "Training limits aren't clear yet."
            : safety.clearanceResponseStatus === "clinician_not_cleared"
            ? "Training hasn't been cleared yet."
            : safety.clearanceResponseStatus
              ? "Clearance isn't confirmed."
              : safety.clearanceDeclined
                ? "Training remains paused."
            : "Rook won’t guess what is safe with an unresolved restriction."}
        </strong>
        <p>{safety.message}</p>
        {safety.status === "unsupported_limit" && Boolean(safety.unsupportedLimits?.length) && (
          <ul className="training-safety-limits">
            {safety.unsupportedLimits.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        )}
        <small>
          {safety.status === "unsupported_limit"
            ? "This plan remains paused because Rook cannot guarantee that limit across planning and workout logging."
            : safety.clearanceResponseStatus
            ? "Your exercise limits are still saved. Update only your clearance status when you know more."
            : "Add specific movements a clinician told you to avoid, or an explicit training limit they gave you. Rook cannot provide medical clearance."}
        </small>
        <div className="training-safety-actions">
          {safety.clearanceResponseStatus && resetClearanceResponse && (
            <button
              type="button"
              onClick={() => {
                setClearanceReasonOpen(false);
                resetClearanceResponse();
              }}
            >
              UPDATE CLEARANCE STATUS
            </button>
          )}
          {safety.status === "blocked_limits_unknown" && resetLimitsResponse && (
            <button type="button" onClick={resetLimitsResponse}>
              UPDATE LIMIT STATUS
            </button>
          )}
          {safety.status === "blocked_trigger_unknown" && resetLimitsResponse && (
            <button type="button" onClick={resetLimitsResponse}>
              UPDATE PAIN LIMITS
            </button>
          )}
          {editRestriction && (
            <button type="button" onClick={editRestriction}>
              EDIT RESTRICTIONS
            </button>
          )}
        </div>
      </div>
    );
  if (safety.status === "constraints_active") {
    const labels = [
      safety.clinicianScopeConfirmed && safety.clinicianScope?.label,
      ...(safety.appliedLabels || []),
    ].filter(Boolean);
    return (
      <div className="training-safety-summary constraints-active" role="status">
        <Eyebrow>RESTRICTIONS APPLIED</Eyebrow>
        <strong>{labels.join(" · ")}</strong>
        <p>Only explicit, enforceable limits are applied.</p>
      </div>
    );
  }
  if (safety.pastResolved)
    return (
      <div className="training-safety-summary past-issue" role="status">
        <Eyebrow>PAST ISSUE NOTED</Eyebrow>
        <strong>No movement restrictions inferred.</strong>
      </div>
    );
  return null;
}
function OnboardingOptionCard({
  label,
  ariaLabel,
  description,
  selected,
  disabled = false,
  ariaDisabled = false,
  describedBy,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`onboarding-option ${selected ? "selected-option" : ""}${ariaDisabled ? " locked-option" : ""}`}
      aria-pressed={selected}
      aria-disabled={ariaDisabled || undefined}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerUp={(event) => event.currentTarget.blur()}
      onClick={(event) => {
        if (ariaDisabled) return;
        onClick?.(event);
      }}
    >
      <span className="option-card-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="option-card-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
function TrainingPriorityChoices({
  selected = [],
  selectionLocked = false,
  onSelect,
  limitReasonId,
}) {
  const option = (label) => {
    const isSelected = selected.includes(label);
    const locked =
      label !== BALANCED_TRAINING_PRIORITY &&
      selectionLocked &&
      !isSelected;
    return (
      <OnboardingOptionCard
        key={label}
        label={label}
        selected={isSelected}
        ariaDisabled={locked}
        describedBy={locked ? limitReasonId : undefined}
        onClick={() => onSelect(label)}
      />
    );
  };
  return (
    <div className="priority-choice-groups">
      <section className="priority-choice-group priority-balanced-choice">
        <Eyebrow>BALANCED</Eyebrow>
        <div className="option-list priority-balanced-option">
          {option(BALANCED_TRAINING_PRIORITY)}
        </div>
      </section>
      <section className="priority-choice-group priority-emphasis-choice">
        <Eyebrow>EMPHASIS AREAS</Eyebrow>
        <div className="option-list option-grid">
          {TRAINING_EMPHASIS_PRIORITIES.map(option)}
        </div>
      </section>
    </div>
  );
}
function localizedWeekdayLabel(day, width = "short") {
  const index = WEEKDAYS.indexOf(day);
  if (index < 0) return day;
  return new Intl.DateTimeFormat(undefined, {
    weekday: width,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, index + 1)));
}
export function splitRecommendationCopy(daysPerWeek) {
  const days = Math.max(2, Math.min(6, Number(daysPerWeek) || 3));
  return `Best fit for your goal, experience and ${days}-day schedule`;
}
function TrainingPreferencesStep({
  answers,
  setAnswers,
  splitChoice,
  splitError,
  chooseSplit,
  specificSplitOpen,
  setSpecificSplitOpen,
  splitOptions,
  safety,
  safetyAnalysisStatus,
  safetyAnalysisErrorKind,
  confirmClearance,
  setClearanceResponse,
  resetClearanceResponse,
  setLimitsResponse,
  resetLimitsResponse,
  supplementalLimitText,
  setSupplementalLimitText,
  checkSupplementalLimits,
  supplementalLimitStatus,
}) {
  const restrictionInputRef = useRef(null);
  const splitInputRef = useRef(null);
  useLayoutEffect(() => {
    const input = splitInputRef.current;
    if (!input || !specificSplitOpen) return;
    // Same bounded auto-grow pattern as the adjacent restrictions field.
    input.style.height = '0px';
    input.style.height = `${Math.min(144, Math.max(66, input.scrollHeight + 2))}px`;
  }, [answers.trainingPreferences, specificSplitOpen, splitChoice]);
  const [slowCheck, setSlowCheck] = useState(false);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const restrictionText = String(answers.avoid || "").trim();
  const restrictionSummary =
    restrictionText.length > 58
      ? `${restrictionText.slice(0, 57).trimEnd()}…`
      : restrictionText;
  const restrictionCount = safety?.appliedLabels?.length || 0;
  const safetyNeedsAttention =
    safetyAnalysisStatus === "checking" ||
    safetyAnalysisStatus === "error" ||
    Boolean(safety?.sourceText && trainingSafetyBlocks(safety.status));
  const openRestrictions = (focus = true) => {
    setRestrictionsOpen(true);
    if (focus)
      requestAnimationFrame(() => {
        restrictionInputRef.current?.focus();
      });
  };
  useEffect(() => {
    setSlowCheck(false);
    if (safetyAnalysisStatus !== "checking") return undefined;
    const timeout = setTimeout(() => setSlowCheck(true), 8000);
    return () => clearTimeout(timeout);
  }, [safetyAnalysisStatus]);
  useEffect(() => {
    if (safetyNeedsAttention) setRestrictionsOpen(true);
  }, [safetyNeedsAttention]);
  useLayoutEffect(() => {
    const input = restrictionInputRef.current;
    if (!restrictionsOpen || !input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(144, Math.max(54, input.scrollHeight))}px`;
    input.style.overflowY = input.scrollHeight > 144 ? "auto" : "hidden";
  }, [answers.avoid, restrictionsOpen]);
  const specificOptions = splitOptions.filter(
    (option) => option.id !== "recommended",
  );
  const selectedSpecific = specificOptions.find(
    (option) => option.id === splitChoice,
  );
  return (
    <div className="preference-fields">
      <section className="onboarding-question-group split-preference">
        <div className="onboarding-group-heading">
          <strong>WEEKLY STRUCTURE</strong>
        </div>
        <div className="option-list split-recommendation">
          <OnboardingOptionCard
            label="LET ROOK CHOOSE"
            description={splitRecommendationCopy(answers.daysPerWeek)}
            selected={splitChoice === "recommended"}
            onClick={() => chooseSplit(splitOptions[0])}
          />
        </div>
        <button
          type="button"
          className="specific-split-toggle"
          aria-expanded={specificSplitOpen}
          aria-controls="specific-split-options"
          onClick={() => setSpecificSplitOpen((open) => !open)}
        >
          <span>
            <strong>I already have a preferred weekly structure</strong>
            {selectedSpecific && <small>{selectedSpecific.label}</small>}
          </span>
          <i className="disclosure-chevron" aria-hidden="true" />
        </button>
        <Disclosure open={specificSplitOpen} revealOnOpen>
          <div
            id="specific-split-options"
            className="option-list split-options"
          >
            {specificOptions.map((option) => (
              <OnboardingOptionCard
                key={option.id}
                label={option.label}
                selected={splitChoice === option.id}
                onClick={() => chooseSplit(option)}
              />
            ))}
          </div>
        {splitChoice === "other" && (<>
          <textarea
            ref={splitInputRef}
            rows={2}
            aria-label="Other preferred split"
            aria-invalid={Boolean(splitError)}
            aria-describedby={splitError ? "custom-split-error" : undefined}
            className="text-answer split-other-answer"
            maxLength={160}
            value={answers.trainingPreferences}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                trainingPreferences: event.target.value,
              }))
            }
            placeholder="List your workout focuses in order (e.g. Push / Pull / Legs)"
          />
          {splitError && <p id="custom-split-error" className="custom-split-error" role="alert">{splitError}</p>}
        </>)}
        </Disclosure>
      </section>
      <section className="onboarding-question-group restriction-preference">
        <div className="onboarding-group-heading">
          <strong>TRAINING RESTRICTIONS · OPTIONAL</strong>
          {restrictionsOpen && !safetyNeedsAttention && (
            <button
              type="button"
              className="restriction-collapse"
              onClick={() => setRestrictionsOpen(false)}
            >
              DONE
            </button>
          )}
        </div>
        {!restrictionsOpen ? (
          <button
            type="button"
            className={`restriction-disclosure${restrictionText ? " has-value" : ""}`}
            aria-expanded="false"
            onClick={() => openRestrictions()}
          >
            <span>
              <strong>
                {restrictionText
                  ? restrictionSummary
                  : "Add movements or exercises to avoid"}
              </strong>
              {restrictionText && (
                <small>
                  {restrictionCount
                    ? pluralize(restrictionCount, "restriction")
                    : "Restriction added"}
                </small>
              )}
            </span>
            <i aria-hidden="true">{restrictionText ? "Edit ›" : "›"}</i>
          </button>
        ) : (
          <div className="restriction-editor">
            <textarea
              ref={restrictionInputRef}
              aria-label="Restrictions or clinician limits"
              className="text-answer compact-answer"
              rows="2"
              maxLength={240}
              value={answers.avoid}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  avoid: event.target.value,
                  trainingSafetyConfirmedHash: null,
                  trainingSafetyClearanceAttestation: null,
                  trainingSafetyClearanceDeclinedHash: null,
                  trainingSafetyClearanceResponse: null,
                  trainingSafetyLimitsResponse: null,
                  trainingSafetySupplementalLimits: null,
                }))
              }
              placeholder="e.g. knee pain or avoid squats"
            />
            <small className="restriction-helper">
              Write it naturally. Rook will account for it when building your
              plan.
            </small>
            {safetyAnalysisStatus === "checking" && (
              <div className="restriction-checking" role="status" aria-live="polite">
                <span className="restriction-spinner" aria-hidden="true" />
                <span>
                  <strong>{slowCheck ? "Still checking…" : "Reviewing what you entered…"}</strong>
                  <small>This can take a few seconds.</small>
                </span>
              </div>
            )}
            {safetyAnalysisStatus === "error" && (
              <div className="training-safety-summary blocked" role="alert">
                <Eyebrow>NEEDS A CLOSER CHECK</Eyebrow>
                <strong>
                  {safetyAnalysisErrorKind === "unknown_target"
                    ? "Rook couldn’t identify that exercise or movement."
                    : safetyAnalysisErrorKind === "medical_context"
                      ? "Rook couldn’t safely review this health-related restriction."
                      : "Rook couldn’t turn this wording into an enforceable restriction."}
                </strong>
                <p>
                  {safetyAnalysisErrorKind === "medical_context"
                    ? "Describe the exact movement to avoid and follow any clinician limits. Rook won’t guess what is safe around pain or injury."
                    : safetyAnalysisErrorKind === "unknown_target"
                      ? "Check the exercise name or use a known movement, such as “avoid leg press”. Rook won’t use a similar exercise unless you choose it."
                      : "Rewrite this as a specific exercise or movement to avoid, such as “avoid leg press”."}
                </p>
              </div>
            )}
            <TrainingSafetySummary
              safety={safety}
              confirmScope={() =>
                setAnswers((current) => ({
                  ...current,
                  trainingSafetyConfirmedHash: safety.constraintHash,
                }))
              }
              confirmClearance={confirmClearance}
              setClearanceResponse={setClearanceResponse}
              resetClearanceResponse={resetClearanceResponse}
              setLimitsResponse={setLimitsResponse}
              resetLimitsResponse={resetLimitsResponse}
              supplementalLimitText={supplementalLimitText}
              setSupplementalLimitText={setSupplementalLimitText}
              checkSupplementalLimits={checkSupplementalLimits}
              supplementalLimitStatus={supplementalLimitStatus}
              editRestriction={() => {
                openRestrictions();
                requestAnimationFrame(() =>
                  restrictionInputRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  }),
                );
              }}
            />
          </div>
        )}
      </section>
      <section className="onboarding-question-group">
        <div className="onboarding-group-heading">
          <strong>EXERCISE PREFERENCE</strong>
        </div>
        <div className="option-list compact-options exercise-preference-options">
          {[
            { value: "Prefer free weights", label: "Free weights" },
            { value: "Prefer machines", label: "Machines" },
            { value: "No preference", label: "No preference" },
          ].map(
            (option) => (
              <OnboardingOptionCard
                key={option.value}
                label={option.label}
                selected={answers.exercisePreference === option.value}
                onClick={() =>
                  setAnswers((current) => ({
                    ...current,
                    exercisePreference: option.value,
                  }))
                }
              />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
function Eyebrow({ children, className = "" }) {
  return <div className={`eyebrow${className ? ` ${className}` : ""}`}>{children}</div>;
}
function SheetHeader({
  title,
  onClose,
  closeLabel = `Close ${typeof title === "string" ? title : "sheet"}`,
  onBack,
  backLabel = "Back",
  trailingAction,
}) {
  return (
    <header className={`detail-header${trailingAction ? " has-trailing-action" : ""}`}>
      {onBack ? (
        <button
          type="button"
          className="detail-header-back"
          aria-label={backLabel}
          onClick={onBack}
        >
          ‹
        </button>
      ) : (
        <span />
      )}
      <strong>{title}</strong>
      {trailingAction}
      {onClose ? (
        <button
          type="button"
          className="detail-header-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}
function Empty({ title, body, action, label = "NOTHING HERE YET" }) {
  return (
    <section className="empty-state">
      <Eyebrow>{label}</Eyebrow>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}
export function workoutTitleParts(name, day) {
  return workoutDisplayParts(name, day);
}
function WorkoutTitle({ workout, name, day }) {
  const parts = workoutTitleParts(workout || name, day);
  const compact =
    !parts.detail &&
    !parts.context &&
    /^(?:Full Body|Upper|Lower|Push|Pull|Legs?|Chest|Back)(?: [ABC])?$/iu.test(
      parts.primary,
    );
  return (
    <h1 className={`workout-title ${compact ? "compact-workout-title" : ""}`}>
      <span className="workout-title-primary">{parts.primary}</span>
      {parts.detail && (
        <span className="workout-title-detail">{parts.detail}</span>
      )}
      {parts.context && (
        <span className="workout-title-context">{parts.context}</span>
      )}
    </h1>
  );
}
function TodayNavGlyph({filled=false}) {
  return <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M1.4 12h21.2" fill="none"/>
    {[{x:2.95,y:9.25,height:5.5},{x:5.7,y:6.5,height:11},{x:15.7,y:6.5,height:11},{x:18.45,y:9.25,height:5.5}].map(plate=>
      <rect key={plate.x} {...plate} width="2.6" fill={filled?'currentColor':'var(--rook-bg)'}/>
    )}
  </g>;
}
function ProfileNavGlyph({filled=false}) {
  return <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" fill={filled?'currentColor':'none'}>
    <circle cx="12" cy="8.25" r="3.5"/>
    <path d="M4.75 19.25v-1.5c0-2.35 3.25-3.75 7.25-3.75s7.25 1.4 7.25 3.75v1.5z"/>
  </g>;
}
function ProgressNavGlyph({filled=false}) {
  return <g stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M3.5 4.25v15.5H21" fill="none" strokeWidth="1.6"/>
    {[{x:6.75,y:14.25},{x:11.5,y:9.75},{x:16.25,y:5.25}].map(({x,y})=>
      <rect key={x} x={x} y={y} width="3" height={18.75-y} fill={filled?'currentColor':'none'} strokeWidth="1.4"/>
    )}
  </g>;
}
export function BottomNav({ page, setPage }) {
  const navRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const root = document.documentElement;
    const measure = () => {
      const height = nav.getBoundingClientRect().height;
      // Mobile Coach temporarily hides navigation while composing.
      if (height > 0) root.style.setProperty('--bottom-nav-total-height', `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => { observer.disconnect(); root.style.removeProperty('--bottom-nav-total-height'); };
  }, []);
  return (
    <nav ref={navRef} className="bottom-nav" aria-label="Main navigation">
      {navItems.map(([id, label]) => (
        <button
          key={id}
          aria-label={label}
          aria-current={page === id ? "page" : undefined}
          className={page === id ? "nav-active" : ""}
          onClick={() => setPage(id)}
        >
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" data-nav-icon={id}>
              <g className="nav-icon-line">
                {id === 'today' && <TodayNavGlyph/>}
                {id === 'coach' && <path d="M4.25 5h15.5v11H9L5.5 19.25V16H4.25zM7.75 9h8.5M7.75 12.25h5"/>}
                {id === 'progress' && <ProgressNavGlyph/>}
                {id === 'profile' && <ProfileNavGlyph/>}
              </g>
              <g className="nav-icon-solid">
                {id === 'today' && <TodayNavGlyph filled/>}
                {id === 'coach' && <><path d="M4.25 5h15.5v11H9L5.5 19.25V16H4.25z"/><path className="nav-icon-knockout" d="M7.75 8.25h8.5v1.5h-8.5zM7.75 11.5h5v1.5h-5z"/></>}
                {id === 'progress' && <ProgressNavGlyph filled/>}
                {id === 'profile' && <ProfileNavGlyph filled/>}
              </g>
            </svg>
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
export function bindScrollableSheetTouch({
  surface,
  scroller,
  disabled = () => false,
  setPosition,
  onDragStart,
  onDismiss,
  onReset,
}) {
  if (!surface || !scroller) return () => {};
  let touch = null;
  let suppressClickUntil = 0;
  const start = (event) => {
    if (disabled() || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    // Opted-in search sheets scroll only their result region. Resolve it at
    // gesture start because Replace can enter/leave search without remounting.
    // Header drags retain ownership even when the results are scrolled down.
    const results = surface.querySelector('[data-exercise-search-scroll]');
    const scrollOwner = results ? (results.contains(event.target) ? results : surface) : scroller;
    touch = {
      scrollOwner,
      startY: y,
      startX: event.touches[0].clientX,
      lastY: y,
      lastAt: performance.now(),
      velocity: 0,
      distance: 0,
      dragging: false,
      canDrag: scrollOwner.scrollTop <= 0,
    };
  };
  const move = (event) => {
    if (!touch || disabled() || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    if (surface.dataset.edgeBackActive === 'true' || (surface.dataset.edgeBackSurface === 'true' && !touch.dragging && Math.abs(event.touches[0].clientX - touch.startX) > Math.abs(y - touch.startY) * 1.4 && Math.abs(event.touches[0].clientX - touch.startX) > 10)) { touch = null; return; }
    const now = performance.now();
    const step = y - touch.lastY;
    const elapsed = Math.max(1, now - touch.lastAt);
    if (!touch.dragging) {
      if (!touch.canDrag) {
        if (touch.scrollOwner.scrollTop <= 0 && step > 0) {
          touch.canDrag = true;
          touch.startY = y;
        }
        touch.lastY = y;
        touch.lastAt = now;
        return;
      }
      const initialDistance = y - touch.startY;
      if (initialDistance <= 0) {
        touch.lastY = y;
        touch.lastAt = now;
        return;
      }
      if (initialDistance < 7) return;
      touch.dragging = true;
      surface.classList.add("is-dragging");
      onDragStart?.();
    }
    event.preventDefault();
    touch.distance = Math.max(0, y - touch.startY);
    touch.velocity = step / elapsed;
    touch.lastY = y;
    touch.lastAt = now;
    setPosition(touch.distance);
  };
  const finish = (cancelled = false) => {
    if (!touch) return;
    const gesture = touch;
    touch = null;
    if (!gesture.dragging) return;
    suppressClickUntil = performance.now() + 350;
    surface.classList.remove("is-dragging");
    const threshold = Math.min(140, surface.offsetHeight * 0.24);
    const velocityFloor = Math.min(72, threshold * 0.72);
    const dismiss =
      !cancelled &&
      (gesture.distance >= threshold ||
        (gesture.distance >= velocityFloor && gesture.velocity >= 0.55));
    if (dismiss) onDismiss();
    else onReset();
  };
  const suppressClick = (event) => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const endTouch = () => finish(false);
  const cancelTouch = () => finish(true);
  surface.addEventListener("touchstart", start, { passive: true });
  surface.addEventListener("touchmove", move, { passive: false });
  surface.addEventListener("touchend", endTouch, { passive: true });
  surface.addEventListener("touchcancel", cancelTouch, { passive: true });
  surface.addEventListener("click", suppressClick, true);
  return () => {
    touch = null;
    surface.classList.remove("is-dragging");
    surface.removeEventListener("touchstart", start);
    surface.removeEventListener("touchmove", move);
    surface.removeEventListener("touchend", endTouch);
    surface.removeEventListener("touchcancel", cancelTouch);
    surface.removeEventListener("click", suppressClick, true);
  };
}
function ModalDragHandle({ layerRef, close, finishClose }) {
  const [header, setHeader] = useState(null);
  const drag = useRef(null);
  const suppressActivation = useRef(false);
  const closeTimer = useRef(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const panel = () => layerRef.current?.firstElementChild;
  useEffect(() => {
    const target = panel();
    const nextHeader = target?.classList.contains("screen")
      ? Array.from(target.children).find((child) =>
          child.matches?.(".detail-header, .long-form-sheet-header"),
        ) || null
      : null;
    setHeader((current) => (current === nextHeader ? current : nextHeader));
  });
  const stopEntranceAnimation = () => {
    const layer = layerRef.current;
    const target = panel();
    if (layer) layer.style.animation = "none";
    if (target) target.style.animation = "none";
  };
  const applyDistance = (distance) => {
    const target = panel();
    if (!target) return;
    target.style.transform = `translateY(${distance}px)`;
    const progress = Math.min(
      1,
      distance / Math.max(1, target.getBoundingClientRect().height * 0.65),
    );
    layerRef.current.style.backgroundColor = `rgba(27, 26, 25, ${(0.35 * (1 - progress)).toFixed(3)})`;
  };
  const settle = (dismiss) => {
    const target = panel();
    if (!target) return;
    if (dismiss && !target.dispatchEvent(new CustomEvent('rook:before-sheet-close', { bubbles: true, cancelable: true }))) dismiss = false;
    target.style.transition = "transform 180ms ease-out";
    if (dismiss) {
      const distance = target.getBoundingClientRect().height + 24;
      applyDistance(distance);
      layerRef.current.style.backgroundColor = "rgba(27, 26, 25, 0)";
      closeTimer.current = setTimeout(finishClose, 180);
    } else {
      target.style.transform = "";
      layerRef.current.style.backgroundColor = "";
      closeTimer.current = setTimeout(() => {
        target.style.transition = "";
      }, 180);
    }
  };
  const start = (event) => {
    if (event.pointerType === "touch") {
      suppressActivation.current = false;
      return;
    }
    clearTimeout(closeTimer.current);
    suppressActivation.current = false;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: performance.now(),
    };
    stopEntranceAnimation();
    const target = panel();
    if (target) target.style.transition = "";
  };
  const move = (event) => {
    if (!drag.current) return;
    event.stopPropagation();
    if (Math.abs(event.clientY - drag.current.startY) > 6) {
      suppressActivation.current = true;
    }
    const now = performance.now();
    drag.current.velocity =
      (event.clientY - drag.current.lastY) /
      Math.max(1, now - drag.current.lastAt);
    drag.current.lastY = event.clientY;
    drag.current.lastAt = now;
    applyDistance(Math.max(0, event.clientY - drag.current.startY));
  };
  const end = (event) => {
    if (!drag.current) return;
    event.stopPropagation();
    const distance = Math.max(0, event.clientY - drag.current.startY);
    const velocity = drag.current.velocity || 0;
    drag.current = null;
    settle(distance >= 72 || (distance >= 24 && velocity > 0.65));
  };
  useEffect(() => {
    if (!header) return undefined;
    const surface = panel();
    return bindScrollableSheetTouch({
      surface,
      scroller: surface,
      setPosition: applyDistance,
      onDragStart: () => {
        stopEntranceAnimation();
        surface.style.transition = "none";
      },
      onDismiss: () => settle(true),
      onReset: () => settle(false),
    });
  }, [header]);
  if (!header) return null;
  return createPortal(
    <div
      className="modal-drag-handle"
      aria-label="Drag down or tap to close"
      role="button"
      tabIndex="0"
      onClick={(event) => {
        if (suppressActivation.current) {
          suppressActivation.current = false;
          event.preventDefault();
          return;
        }
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          close();
        }
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        suppressActivation.current = true;
        drag.current = null;
        settle(false);
      }}
    >
      <i />
    </div>,
    header,
  );
}
function ModalLayer({ children, close, backgroundRef, presentation = "sheet", onCloseStart, instantClose = false, returnFocusRef, lockDocument = true }) {
  const layerRef = useRef(null);
  const closing = useRef(false);
  const closeTimer = useRef(null);
  const historyMarker = useRef(null);
  const historyDismissed = useRef(false);
  const historyCleanupTimer = useRef(null);
  const [panelRevision, setPanelRevision] = useState(0);
  const fullscreen = presentation === "fullscreen";
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
      clearTimeout(historyCleanupTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const panel = layer?.firstElementChild;
    if (!panel) return undefined;
    if (!panel.matches('[role="dialog"], [role="alertdialog"]')) {
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-modal", "true");
      const dialogLabel = panel
        .querySelector(
          "h1, h2, .detail-header strong, .long-form-sheet-header strong",
        )
        ?.textContent?.trim();
      layer.setAttribute("aria-label", dialogLabel || "Rook dialog");
    }
    const header = Array.from(panel.children).find((child) =>
      child.matches?.(".detail-header, .long-form-sheet-header"),
    );
    if (!header) return undefined;

    let largeTitle = null;
    const findLargeTitle = () => {
      const children = Array.from(panel.children);
      const headerIndex = children.indexOf(header);
      largeTitle = children
        .slice(headerIndex + 1)
        .find((child) => child.matches?.("h1, h2")) || null;
    };
    const updateHeader = () => {
      findLargeTitle();
      const scrollable = panel.scrollHeight > panel.clientHeight + 2;
      const scrollTop = Math.max(0, panel.scrollTop);
      const collapsing = Boolean(largeTitle);
      const revealAt = collapsing && scrollable
        ? Math.max(12, largeTitle.offsetTop - header.offsetHeight + 4)
        : Number.POSITIVE_INFINITY;
      header.classList.toggle("is-scrollable-sheet-header", scrollable);
      header.classList.toggle("is-static-sheet-header", !scrollable);
      header.classList.toggle("is-collapsing-sheet-header", collapsing);
      header.classList.toggle("has-scrolled-content", scrollable && scrollTop > 3);
      header.classList.toggle(
        "shows-compact-title",
        collapsing && scrollTop >= revealAt,
      );
    };
    header.classList.add("rook-sheet-header");
    updateHeader();
    const frame = requestAnimationFrame(() => {
      header.classList.add("is-ready");
      updateHeader();
    });
    const mutationObserver = new MutationObserver(() => {
      if (layer.firstElementChild !== panel) { setPanelRevision(value => value + 1); return; }
      requestAnimationFrame(updateHeader);
    });
    mutationObserver.observe(layer, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(updateHeader)
      : null;
    resizeObserver?.observe(panel);
    panel.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateHeader);
    return () => {
      cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      panel.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateHeader);
    };
  }, [children, panelRevision]);
  const requestClose = (options) => {
    if (closing.current) return;
    const fromHistory = options?.fromHistory === true;
    const layer = layerRef.current;
    const panel = layer?.firstElementChild;
    if (panel && !panel.dispatchEvent(new CustomEvent('rook:before-sheet-close', { bubbles: true, cancelable: true }))) return;
    if (!layer || !panel) {
      close();
      return;
    }
    closing.current = true;
    // Presentation can change without remounting the editor or its focus scope.
    if (presentationRef.current === "editor-page") {
      close();
      return;
    }
    layer.style.animation = "none";
    panel.style.animation = "none";
    if (
      fullscreen &&
      !fromHistory &&
      historyMarker.current &&
      window.history.state?.rookExerciseVisual === historyMarker.current
    ) {
      historyDismissed.current = true;
      window.history.back();
    }
    if (fullscreen) {
      if (instantClose) { close(); return; }
      layer.classList.add("is-closing");
      closeTimer.current = setTimeout(close, 160);
      return;
    }
    onCloseStart?.();
    panel.style.transition = "transform 180ms ease-out";
    panel.style.transform = `translateY(${panel.getBoundingClientRect().height + 24}px)`;
    layer.style.backgroundColor = "rgba(27, 26, 25, 0)";
    closeTimer.current = setTimeout(close, 180);
  };
  useEffect(() => {
    const scrollY = window.scrollY;
    const previousFocus = returnFocusRef?.current || document.activeElement;
    const body = document.body;
    const prior = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    if (backgroundRef.current) {
      backgroundRef.current.inert = true;
      backgroundRef.current.setAttribute("aria-hidden", "true");
    }
    // An overlay above an existing sheet inherits that sheet's document lock.
    // Re-locking/restoring the document can pan iOS's visual viewport and make
    // an unchanged parent appear to re-enter on viewer close.
    if (lockDocument) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    const focusable = () =>
      [...layerRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []].filter((element) => element.getClientRects().length > 0);
    const keydown = (event) => {
      // A nested viewer owns keyboard dismissal while its parent is inert.
      if (layerRef.current?.firstElementChild?.inert) return;
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    let popstate = null;
    if (fullscreen) {
      clearTimeout(historyCleanupTimer.current);
      historyDismissed.current = false;
      const existingMarker = window.history.state?.rookExerciseVisual;
      const marker =
        existingMarker ||
        `rook-visual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      historyMarker.current = marker;
      if (!existingMarker)
        window.history.pushState(
          { ...(window.history.state || {}), rookExerciseVisual: marker },
          "",
        );
      popstate = () => {
        historyDismissed.current = true;
        requestClose({ fromHistory: true });
      };
      addEventListener("popstate", popstate);
    }
    addEventListener("keydown", keydown);
    const frame = requestAnimationFrame(() => {
      const panel = layerRef.current?.firstElementChild;
      const scroller = panel?.querySelector(".sheet-scroll") || panel;
      scroller?.scrollTo?.({ top: 0, left: 0 });
      const initialFocus = layerRef.current?.querySelector('[data-sheet-initial-focus]')
        || layerRef.current?.querySelector("[autofocus], .sheet-close, button, input");
      focusNavigationTarget(initialFocus);
    });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("keydown", keydown);
      if (popstate) removeEventListener("popstate", popstate);
      if (
        fullscreen &&
        !historyDismissed.current &&
        historyMarker.current &&
        window.history.state?.rookExerciseVisual === historyMarker.current
      ) {
        const marker = historyMarker.current;
        historyCleanupTimer.current = setTimeout(() => {
          if (
            !historyDismissed.current &&
            window.history.state?.rookExerciseVisual === marker
          ) {
            historyDismissed.current = true;
            window.history.back();
          }
        }, 0);
      }
      if (lockDocument) Object.assign(body.style, prior);
      if (backgroundRef.current) {
        backgroundRef.current.inert = false;
        backgroundRef.current.removeAttribute("aria-hidden");
      }
      if (lockDocument) window.scrollTo(0, scrollY);
      requestAnimationFrame(() => focusNavigationTarget(previousFocus));
    };
  }, []);
  const content =
    typeof children === "function"
      ? children(requestClose)
      : isValidElement(children)
        ? cloneElement(children, { close: requestClose })
        : children;
  return (
    <div
      ref={layerRef}
      className={`modal-layer${fullscreen ? " exercise-visual-layer" : ""}${presentation === "editor-page" ? " edit-plan-page-layer" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {content}
      {!fullscreen && presentation !== "editor-page" && (
        <ModalDragHandle
          layerRef={layerRef}
          close={requestClose}
          finishClose={close}
        />
      )}
    </div>
  );
}

const GOALS = [
  "Build muscle",
  "Get stronger",
  "Lose fat",
  "General fitness",
  "Athletic performance",
];
const GOAL_PLAN_PREVIEWS = {
  "Build muscle": {
    title: "Built for muscle growth",
    detail:
      "Hypertrophy-focused volume, moderate rep ranges, and controlled effort.",
  },
  "Get stronger": {
    title: "Built around strength",
    detail:
      "Heavier strength-focused work, key lifts first, and enough recovery for quality sets.",
  },
  "Lose fat": {
    title: "Built to support fat loss",
    detail:
      "Strength work to help maintain muscle and performance, plus recoverable conditioning. Fat loss still depends on overall energy balance, not lifting alone.",
  },
  "General fitness": {
    title: "Balanced and sustainable",
    detail:
      "Balanced strength and fitness work across the major movement patterns.",
  },
  "Athletic performance": {
    title: "Strength that transfers",
    detail:
      "Strength, power, and quality-first training with fatigue kept manageable.",
  },
};
const PROFILE_GOAL_LABELS = {
  "Build muscle": "Built for muscle growth",
  "Get stronger": "Built for strength",
  "Lose fat": "Built to support fat loss",
  "General fitness": "Built for general fitness",
  "Athletic performance": "Built for athletic performance",
};
const DEFAULT_GOAL_PLAN_PREVIEW = {
  title: "Your goal shapes the details",
  detail:
    "Your choice guides exercise order, training volume, effort, and conditioning.",
};
const EXPERIENCES = ["Beginner", "Intermediate", "Advanced"];
const EXPERIENCE_DESCRIPTIONS = {
  Beginner: "New to structured training",
  Intermediate: "~1–3 years of consistent training",
  Advanced: "Several years of structured training",
};
const EQUIPMENT_LABELS = {
  "full gym": "Full gym",
  "barbell/rack/bench": "Barbell / rack / bench",
  dumbbells: "Dumbbells",
  cables: "Cables",
  machines: "Machines",
  "pull-up bar": "Pull-up bar",
  "resistance bands": "Resistance bands",
  "bodyweight only": "Bodyweight only",
};
const EXERCISE_ART_ASSETS = import.meta.glob("./assets/exercise-art/wg-*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
function exerciseArtId(exercise) {
  const aliasMatch = [
    exercise?.importedName,
    exercise?.name,
    exercise?.exerciseName,
    exercise?.title,
  ]
    .filter(Boolean)
    .map((name) => matchImportedExerciseName(splitImportedExerciseLabel(name).name))
    .find((match) => exerciseCatalog[match?.exerciseId]?.artId);
  const artId =
    exerciseCatalog[exercise?.exerciseId]?.artId ||
    exerciseCatalog[aliasMatch?.exerciseId]?.artId ||
    exercise?.artId;
  return artId || null;
}
export function exerciseArt(exercise) {
  const artId = exerciseArtId(exercise);
  return artId
    ? EXERCISE_ART_ASSETS[`./assets/exercise-art/${artId}.svg`] || null
    : null;
}
const preloadedExerciseArt = new Map();
export function preloadExerciseArt(exercise, fetchPriority = "auto") {
  const source = exerciseArt(exercise);
  if (!source || typeof Image === "undefined") return null;
  if (preloadedExerciseArt.has(source)) return preloadedExerciseArt.get(source);
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = fetchPriority;
  image.src = source;
  const ready = image.decode?.().catch(() => {}) || Promise.resolve();
  preloadedExerciseArt.set(source, ready);
  return ready;
}
export function exerciseThumbnailPresentation(exercise) {
  const artId = exerciseArtId(exercise);
  const normalization = EXERCISE_THUMBNAIL_NORMALIZATION[artId] || {
    scale: 1,
    x: 0,
    y: 0,
  };
  return {
    artId: artId || null,
    style: {
      "--exercise-art-scale": normalization.scale,
      "--exercise-art-offset-x": `${normalization.x}px`,
      "--exercise-art-offset-y": `${normalization.y}px`,
    },
  };
}
export function setupSelectionValid(answers = {}) {
  return Boolean(
    answers.environment &&
      normalizeGymEquipment(answers.equipment || []).length,
  );
}
export function onboardingGenerationProfile(profile = {}) {
  const operationalEnvironment =
    profile.environment === "Both"
      ? profile.primaryTrainingEnvironment
      : profile.environment;
  return {
    ...profile,
    trainingEnvironmentChoice: profile.trainingEnvironmentChoice || profile.environment,
    primaryTrainingEnvironment: operationalEnvironment,
    environment: operationalEnvironment,
  };
}
const PRIORITIES = TRAINING_PRIORITY_OPTIONS;
const EFFORT_STYLES = [
  "Balanced workload · usually 3 sets · 1–2 RIR",
  "Fewer hard sets · 2 sets · 1 RIR",
  "More moderate sets · 3–4 sets · 2–3 RIR",
];
const EFFORT_GUIDANCE = {
  Beginner: {
    question: "How much work per exercise feels manageable?",
    hint: "Choose the amount of work you're most likely to recover from consistently.",
    options: [
      {
        label: "Balanced starting point",
        description: "Usually 3 sets per exercise",
      },
      {
        label: "Fewer hard sets",
        description: "Usually 2 challenging sets per exercise",
      },
      {
        label: "More sets and practice",
        description: "Usually 3–4 moderate sets per exercise",
      },
    ],
  },
  Intermediate: {
    question: "How much work per exercise feels manageable?",
    hint: "Reps in reserve (RIR) means clean reps you could still perform when a set ends. It controls set effort, not calorie burn or fat loss.",
    options: [
      {
        label: "Balanced workload",
        description: "Usually 3 sets · finish with 1–2 reps left",
      },
      {
        label: "Fewer hard sets",
        description: "2 sets · finish with 1 rep left",
      },
      {
        label: "More moderate sets",
        description: "3–4 sets · finish with 2–3 reps left",
      },
    ],
  },
  Advanced: {
    question: "How much work per exercise feels manageable?",
    hint: "RIR means reps in reserve: clean reps you could still perform when a set ends. It controls set effort, not calorie burn or fat loss.",
    options: [
      { label: "Balanced workload", description: "Usually 3 sets · 1–2 RIR" },
      { label: "Fewer hard sets", description: "2 sets · 1 RIR" },
      { label: "More moderate sets", description: "3–4 sets · 2–3 RIR" },
    ],
  },
};
export function effortGuidanceFor(experience) {
  return EFFORT_GUIDANCE[experience] || EFFORT_GUIDANCE.Beginner;
}
export function shouldEnableRir(experience, effortStyle) {
  return experience !== "Beginner" && Boolean(effortStyle);
}
function PhysiqueReview({ profile, onUse, onClose }) {
  const [mode, setMode] = useState("intro");
  const [photos, setPhotos] = useState({});
  const [preparing, setPreparing] = useState(null);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const choosePhoto = async (angle, file) => {
    if (!file) return;
    setPreparing(angle);
    setError("");
    try {
      const dataUrl = await preparePhysiquePhoto(file);
      setPhotos((current) => ({
        ...current,
        [angle]: { angle, dataUrl, name: file.name },
      }));
    } catch (reason) {
      setError(reason.message || "That photo could not be prepared.");
    } finally {
      setPreparing(null);
    }
  };
  const analyze = async () => {
    setMode("analyzing");
    setError("");
    try {
      const review = await AIService.reviewPhysique(
        profile,
        Object.values(photos),
      );
      setResult(review);
      if (review.status === "success") {
        setSelected(review.suggestions.map((item) => item.priorityId));
        setMode("review");
      } else setMode("failure");
    } catch {
      setResult(null);
      setError("We couldn't get a useful physique review from these photos.");
      setMode("failure");
    }
  };
  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const shell = (children) => (
    <main className="onboarding screen physique-review-screen">
      <div className="brand">ROOK</div>
      {children}
    </main>
  );
  if (mode === "intro")
    return shell(
      <>
        <div className="physique-review-content">
          <Eyebrow>PHYSIQUE REVIEW</Eyebrow>
          <h1>Possible areas you may want to prioritize.</h1>
          <p>
            Get an optional second opinion on areas you may want to emphasize.
            Upload a few clear photos and Rook can suggest possible training
            priorities.
          </p>
          <p className="photo-privacy">
            Optional online analysis: when you tap REVIEW PHOTOS, selected photos
            are sent through Rook's server to OpenAI, our AI provider, for a
            one-time review. This is not on-device processing. Provider retention
            applies; immediate deletion is not guaranteed.
          </p>
          <div className="physique-caution">
            Visual estimates can be affected by lighting, pose, camera angle,
            pump and body composition. Suggestions are not objective facts, and
            you choose what to use.
          </div>
        </div>
        <div className="onboarding-footer">
          <Button onClick={() => setMode("upload")}>CONTINUE</Button>
          <Button variant="quiet" onClick={onClose}>
            SKIP
          </Button>
        </div>
      </>,
    );
  if (mode === "analyzing")
    return shell(
      <div className="physique-analysis" role="status" aria-live="polite">
        <div className="building-spinner" aria-hidden="true" />
        <Eyebrow>PHYSIQUE REVIEW</Eyebrow>
        <h1>Reviewing your photos…</h1>
        <p>
          Looking only for possible fitness-training priorities. Your photos are
          not added to your profile.
        </p>
      </div>,
    );
  if (mode === "failure")
    return shell(
      <>
        <div className="physique-review-content">
          <Eyebrow>PHYSIQUE REVIEW</Eyebrow>
          <h1>We couldn't get a useful physique review from these photos.</h1>
          <p>
            {result?.retryMessage ||
              error ||
              "Try clearer framing and lighting, or choose priorities yourself."}
          </p>
        </div>
        <div className="onboarding-footer">
          <Button onClick={() => setMode("upload")}>
            TRY DIFFERENT PHOTOS
          </Button>
          <Button variant="quiet" onClick={onClose}>
            CHOOSE PRIORITIES MYSELF
          </Button>
        </div>
      </>,
    );
  if (mode === "review")
    return shell(
      <>
        <div className="physique-review-content">
          <Eyebrow>PHYSIQUE REVIEW</Eyebrow>
          <h1>Possible areas to emphasize</h1>
          <p>{result.summary || "Choose what you want Rook to prioritize."}</p>
          <div className="physique-suggestions">
            {result.suggestions.map((item) => (
              <button
                key={item.priorityId}
                className={selected.includes(item.priorityId) ? "selected" : ""}
                aria-pressed={selected.includes(item.priorityId)}
                onClick={() => toggle(item.priorityId)}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.priorityLevel === "high"
                      ? "Higher priority"
                      : "Moderate priority"}
                  </small>
                  <em>{item.reason}</em>
                </span>
                <i aria-hidden="true">
                  {selected.includes(item.priorityId) ? "✓" : ""}
                </i>
              </button>
            ))}
          </div>
          <p className="physique-control-copy">
            Choose what YOU want Rook to prioritize.
          </p>
        </div>
        <div className="onboarding-footer">
          <Button
            disabled={!selected.length}
            onClick={() =>
              onUse({
                suggested: result.suggestions,
                confirmed: result.suggestions.filter((item) =>
                  selected.includes(item.priorityId),
                ),
              })
            }
          >
            USE THESE PRIORITIES
          </Button>
          <Button variant="quiet" onClick={onClose}>
            KEEP MY ORIGINAL CHOICES
          </Button>
        </div>
      </>,
    );
  return shell(
    <>
      <div className="physique-review-content">
        <Eyebrow>PHYSIQUE REVIEW</Eyebrow>
        <h1>Add your photos</h1>
        <p>
          Multiple angles give better context, but one clear photo is enough to
          try.
        </p>
        <div className="photo-guidance">
          Relaxed, consistent pose · body visible where relevant · reasonable
          lighting · no extreme angle or post-workout pump.
        </div>
        <p className="photo-privacy" id="physique-photo-privacy">
          Only tapping REVIEW PHOTOS sends resized copies through Rook's server
          to OpenAI for one-time AI analysis. Rook keeps temporary copies while
          this review is open, not in your saved profile; leaving clears them
          from this screen, not your photo library. OpenAI response storage is
          disabled, but processing and safety retention still apply: abuse
          monitoring normally lasts up to 30 days, with legal and flagged-image
          safety exceptions. Immediate deletion is not guaranteed.{" "}
          <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAI data policy</a>
        </p>
        <div className="photo-inputs">
          {["front", "back", "side"].map((angle) => (
            <label key={angle} className={photos[angle] ? "ready" : ""}>
              <input
                type="file"
                accept="image/*"
                aria-describedby="physique-photo-privacy"
                onChange={(event) =>
                  choosePhoto(angle, event.target.files?.[0])
                }
              />
              <span>
                <strong>{titleCase(angle)}</strong>
                <small>
                  {preparing === angle
                    ? "Preparing…"
                    : photos[angle]
                      ? `${photos[angle].name} · ready`
                      : "Camera or photo library"}
                </small>
              </span>
              <i>{photos[angle] ? "✓" : "+"}</i>
            </label>
          ))}
        </div>
        {error && <p className="offline-banner">{error}</p>}
      </div>
      <div className="onboarding-footer">
        <Button
          disabled={!Object.keys(photos).length || Boolean(preparing)}
          onClick={analyze}
        >
          REVIEW PHOTOS
        </Button>
        <Button variant="quiet" onClick={onClose}>
          SKIP
        </Button>
      </div>
    </>,
  );
}
function EntryLanding({ personalize, importPlan, startFromScratch, restoreBackup }) {
  const [previewDays, setPreviewDays] = useState(4);
  const [previewChanged, setPreviewChanged] = useState(false);
  const [previewEquipment, setPreviewEquipment] = useState("Full gym");
  const [previewEquipmentChanged, setPreviewEquipmentChanged] = useState(false);
  const [previewAnnouncement, setPreviewAnnouncement] = useState("");
  const weekPatterns = {
    3: [
      ["MON", "Full body"],
      ["WED", "Full body"],
      ["FRI", "Full body"],
    ],
    4: [
      ["MON", "Upper"],
      ["TUE", "Lower"],
      ["THU", "Upper"],
      ["SAT", "Lower"],
    ],
    5: [
      ["MON", "Push"],
      ["TUE", "Pull"],
      ["WED", "Legs"],
      ["FRI", "Upper"],
      ["SAT", "Lower"],
    ],
  };
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const equipmentExamples = {
    "Full gym": "Barbell Bench Press",
    Dumbbells: "Dumbbell Bench Press",
    Bodyweight: "Push-Up",
  };
  const previewExercise = equipmentExamples[previewEquipment];
  const selectedPattern = new Map(weekPatterns[previewDays]);
  const exampleWeek = weekdays.map((day) => ({
    day,
    workout: selectedPattern.get(day) || "Rest",
    training: selectedPattern.has(day),
  }));
  return (
    <main className="onboarding entry-screen entry-v2">
      <header className="entry-top">
        <div className="brand">ROOK</div>
        <span className="entry-eyebrow">Training, built around you</span>
      </header>
      <div className="entry-content">
        <h1>A plan that fits. And keeps up.</h1>
        <p>
          Tell Rook your schedule, equipment, and experience. It builds your
          week — then adapts as you train.
        </p>
        <div className="entry-primary-action">
          <Button onClick={personalize}>BUILD MY PLAN</Button>
          <p className="entry-primary-note">
            About 2 minutes · No account needed
          </p>
        </div>
        <section className="entry-demo" aria-labelledby="entry-demo-title">
          <div className="entry-demo-header">
            <span id="entry-demo-title">SEE HOW ROOK ADAPTS</span>
          </div>
          <fieldset className="entry-demo-control">
            <legend>DAYS I CAN TRAIN</legend>
            <div className="entry-days">
              {[3, 4, 5].map((days) => (
                <label key={days}>
                  <input
                    type="radio"
                    name="landing-preview-days"
                    value={days}
                    checked={previewDays === days}
                    onChange={() => {
                      setPreviewChanged(true);
                      setPreviewDays(days);
                      setPreviewAnnouncement(
                        `Training days set to ${days}. Week preview updated.`,
                      );
                    }}
                  />
                  <span>{days}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="entry-demo-control">
            <legend>EQUIPMENT</legend>
            <div className="entry-equipment">
              {["Full gym", "Dumbbells", "Bodyweight"].map((equipment) => (
                <label key={equipment}>
                  <input
                    type="radio"
                    name="landing-preview-equipment"
                    value={equipment}
                    checked={previewEquipment === equipment}
                    onChange={() => {
                      const exercise = equipmentExamples[equipment];
                      setPreviewEquipmentChanged(true);
                      setPreviewEquipment(equipment);
                      setPreviewAnnouncement(
                        `Equipment set to ${equipment}. Rook might choose ${exercise}.`,
                      );
                    }}
                  />
                  <span>{equipment}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="entry-demo-output">
            <div className="entry-equipment-example">
              <span>ROOK MIGHT CHOOSE</span>
              <strong
                key={previewEquipment}
                className={
                  previewEquipmentChanged
                    ? "entry-equipment-value-transition"
                    : undefined
                }
              >
                {previewExercise}
              </strong>
            </div>
            <p
              className="visually-hidden"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {previewAnnouncement}
            </p>
            <div className="entry-week-result">
              <div className="entry-week-header">
                <span>A WEEK LIKE THIS</span>
                <small>{previewDays} training days</small>
              </div>
              <ul
                key={previewDays}
                className={previewChanged ? "entry-week-transition" : undefined}
                aria-label={`${previewDays}-day illustrative training week`}
              >
                {exampleWeek.map(({ day, workout, training }) => (
                  <li className={training ? "training-day" : "rest-day"} key={day}>
                    <i aria-hidden="true" />
                    <strong>{day.slice(0, 1)}</strong>
                    <small>{workout}</small>
                  </li>
                ))}
              </ul>
              <p>Example only · Your plan is personalized.</p>
            </div>
          </div>
        </section>
      </div>
      <div className="entry-actions">
        <button className="existing-plan-action" onClick={importPlan}>
          <strong>Already have a plan?</strong>
          <small>Bring your current routine into Rook</small>
        </button>
        <button className="scratch-plan-action" onClick={startFromScratch}>
          <strong>Start from scratch</strong>
          <small>Create your workouts manually</small>
        </button>
        <button className="restore-backup-action" onClick={restoreBackup}>
          Restore from backup
        </button>
      </div>
    </main>
  );
}
function Onboarding({ update, exit, onPlanAccepted, initialUnits = 'kg' }) {
  const [step, setStep] = useState(0);
  const onboardingRootRef = useRef(null);
  const selectionAcknowledgement = useSelectionAcknowledgement(step);
  const revealScheduleContinue = useScheduleContinueReveal(step, onboardingRootRef);
  const [ageMenuOpen, setAgeMenuOpen] = useState(false);
  const [activeAgeIndex, setActiveAgeIndex] = useState(0);
  const [ageMenuLayout, setAgeMenuLayout] = useState({
    opensAbove: false,
    maxHeight: 264,
  });
  const agePickerRef = useRef(null);
  const ageTriggerRef = useRef(null);
  const ageOptionRefs = useRef([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [physiqueOpen, setPhysiqueOpen] = useState(false);
  const [generationStage, setGenerationStage] = useState("preparing");
  const [buildFailed, setBuildFailed] = useState(false);
  const generationRef = useRef(false);
  const generationRun = useRef(0);
  const lastBuildProfile = useRef(null);
  const restrictionTextRef = useRef("");
  const safetyRequestRef = useRef(false);
  const [safetyAnalysis, setSafetyAnalysis] = useState({
    sourceText: "",
    analysis: null,
    status: "idle",
  });
  const [supplementalLimitText, setSupplementalLimitText] = useState("");
  const [supplementalLimitStatus, setSupplementalLimitStatus] = useState("idle");
  const supplementalLimitTextRef = useRef("");
  const generatedPreviewRootRef = useRef(null);
  const generatedPreviewNavigationRef = useRef(null);
  const generatedPreviewHeadingRef = useRef(null);
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [equipmentSetupExpanded, setEquipmentSetupExpanded] = useState(false);
  const [answers, setAnswers] = useState(() => ({...blankState().profile, units: initialUnits}));
  const [anyDayWorks, setAnyDayWorks] = useState(false);
  const manualAvailableDaysRef = useRef([]);
  restrictionTextRef.current = String(answers.avoid || "");
  supplementalLimitTextRef.current = supplementalLimitText;
  useEffect(() => {
    setSafetyAnalysis((current) =>
      current.sourceText === restrictionTextRef.current
        ? current
        : { sourceText: restrictionTextRef.current, analysis: null, status: "idle" },
    );
    setNotice("");
    setBuildFailed(false);
    setSupplementalLimitText("");
    setSupplementalLimitStatus("idle");
  }, [answers.avoid]);
  const [splitChoice, setSplitChoice] = useState("recommended");
  const [specificSplitOpen, setSpecificSplitOpen] = useState(false);
  useEffect(() => {
    setBuildFailed(false);
    setNotice("");
  }, [answers.trainingPreferences, answers.trainingSplitChoice, answers.daysPerWeek]);
  const [followUps, setFollowUps] = useState([]);
  const [followIndex, setFollowIndex] = useState(0);
  const [followText, setFollowText] = useState("");
  const effortGuidance = effortGuidanceFor(answers.experience);
  const ageRangeOptions = ["Under 18", "18–29", "30–39", "40–49", "50–59", "60+"];
  const availableGoals =
    answers.ageRange === "Under 18"
      ? GOALS.filter((goal) => goal !== "Lose fat")
      : GOALS;
  useEffect(() => {
    if (answers.ageRange !== "Under 18" || answers.goal !== "Lose fat") return;
    setAnswers((current) => ({ ...current, goal: null }));
  }, [answers.ageRange, answers.goal]);
  useLayoutEffect(() => {
    if (!answers.primaryTrainingEnvironment) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.activeElement?.blur();
        const setupScreen = document.querySelector(".onboarding-setup");
        setupScreen?.scrollTo({ top: 0, left: 0 });
        let ancestor = setupScreen?.parentElement;
        while (ancestor) {
          ancestor.scrollTop = 0;
          ancestor.scrollLeft = 0;
          ancestor = ancestor.parentElement;
        }
        setupScreen?.scrollIntoView({ block: "start" });
        window.scrollTo({ top: 0, left: 0 });
      });
    });
  }, [answers.environment, answers.primaryTrainingEnvironment]);
  useEffect(() => {
    if (!ageMenuOpen) return undefined;
    const selectedIndex = Math.max(0, ageRangeOptions.indexOf(answers.ageRange));
    setActiveAgeIndex(selectedIndex);
    const outsidePointer = (event) => {
      if (!agePickerRef.current?.contains(event.target)) setAgeMenuOpen(false);
    };
    document.addEventListener("pointerdown", outsidePointer);
    return () => {
      document.removeEventListener("pointerdown", outsidePointer);
    };
  }, [ageMenuOpen, answers.ageRange]);
  useLayoutEffect(() => {
    if (!ageMenuOpen) return undefined;
    const updateAgeMenuLayout = () => {
      const rect = ageTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 10;
      const spaceAbove = rect.top - 10;
      const nextAction = agePickerRef.current
        ?.closest(".onboarding")
        ?.querySelector(".primary");
      const nextActionTop = nextAction?.getBoundingClientRect().top;
      const clearSpaceBelow = nextActionTop
        ? Math.min(spaceBelow, nextActionTop - rect.bottom - 12)
        : spaceBelow;
      const opensAbove = clearSpaceBelow < 176 && spaceAbove > clearSpaceBelow;
      const availableSpace = opensAbove ? spaceAbove : clearSpaceBelow;
      setAgeMenuLayout({
        opensAbove,
        maxHeight: Math.min(264, Math.max(132, availableSpace - 6)),
      });
    };
    updateAgeMenuLayout();
    window.addEventListener("resize", updateAgeMenuLayout);
    window.visualViewport?.addEventListener("resize", updateAgeMenuLayout);
    return () => {
      window.removeEventListener("resize", updateAgeMenuLayout);
      window.visualViewport?.removeEventListener("resize", updateAgeMenuLayout);
    };
  }, [ageMenuOpen]);
  useEffect(() => {
    if (!ageMenuOpen) return;
    const frame = requestAnimationFrame(() => {
      ageOptionRefs.current[activeAgeIndex]?.focus({ preventScroll: true });
      ageOptionRefs.current[activeAgeIndex]?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ageMenuOpen, activeAgeIndex]);
  useEffect(() => {
    setAgeMenuOpen(false);
    const frame = requestAnimationFrame(() => {
      document.activeElement?.blur?.();
      window.scrollTo({ top: 0, left: 0 });
      document.querySelector(".onboarding")?.scrollTo({ top: 0, left: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, followIndex]);
  const allStages = [
    {
      key: "personal",
      label: "STARTING POINT",
      question: "Set the right starting point.",
      personal: true,
    },
    {
      key: "goal",
      label: "YOUR GOAL",
      question: "What are you training for?",
      helper:
        "Choose the main outcome you want this plan to support. You can change this later.",
      options: availableGoals,
    },
    {
      key: "experience",
      label: "EXPERIENCE",
      question: "What’s your training experience?",
      hideHelper: true,
      options: EXPERIENCES,
    },
    {
      key: "schedule",
      label: "YOUR SCHEDULE",
      question: "What does a realistic training week look like?",
      helper: "Choose a routine you can consistently maintain.",
    },
    {
      key: "setup",
      label: "TRAINING SETUP",
      question: "Where will you train?",
      helper: "ROOK will only use exercises that fit your available equipment.",
    },
    {
      key: "priorities",
      label: "TRAINING PRIORITIES",
      question: "What would you like to emphasize?",
      helper:
        "Optional. Choose up to two areas to emphasize, or keep the plan balanced.",
      options: PRIORITIES,
      multi: true,
      optional: true,
    },
    {
      key: "effortStyle",
      label: "TRAINING VOLUME",
      question: effortGuidance.question,
      options: EFFORT_STYLES,
      optional: true,
      optionalHint: effortGuidance.hint,
    },
    {
      key: "preferences",
      label: "FINAL PREFERENCES",
      question: "Anything else before ROOK builds your plan?",
      options: [],
      optional: true,
    },
  ];
  const stages = allStages;
  const stage = stages[step];
  const value =
    stage.key === "priorities"
      ? answers.prioritySources?.manual || []
      : answers[stage.key];
  useEffect(() => {
    trackFunnelEvent("onboarding_step_viewed", {
      path: "personalized",
      step: stage.key,
      stepIndex: step + 1,
      totalSteps: stages.length,
    });
  }, [step]);
  useEffect(() => {
    if (generatedPreview)
      trackFunnelEventOnce("first_plan_viewed", {
        path: "personalized",
        planType: generatedPreview.program.templateId || "personalized",
      });
  }, [generatedPreview]);
  useLayoutEffect(() => {
    if (!generatedPreview) return;
    const root = generatedPreviewRootRef.current;
    const scrollingElement = document.scrollingElement;
    if (root) root.scrollTop = 0;
    if (scrollingElement) scrollingElement.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    generatedPreviewHeadingRef.current?.focus({ preventScroll: true });
  }, [generatedPreview]);
  const goalPlanPreview =
    GOAL_PLAN_PREVIEWS[answers.goal] || DEFAULT_GOAL_PLAN_PREVIEW;
  const splitOptions = onboardingSplitOptions(answers.daysPerWeek);
  const singleDecision = stage.key === 'goal' || stage.key === 'experience';
  const choose = (option, event) => {
    if (singleDecision && !selectionAcknowledgement.begin(event, advance)) return;
    if (stage.multi)
      setAnswers((current) => {
        const selected =
          stage.key === "priorities"
            ? current.prioritySources?.manual || []
            : current[stage.key] || [];
        let next =
          stage.key === "priorities"
            ? nextManualPrioritySelection(selected, option)
            : selected.includes(option)
              ? selected.filter((item) => item !== option)
              : [...selected, option];
        if (stage.key === "priorities") {
          const prioritySources = { ...current.prioritySources, manual: next };
          return {
            ...current,
            prioritySources,
            priorities: combinedTrainingPriorities(
              next,
              prioritySources.physiqueConfirmed,
            ),
          };
        }
        return { ...current, [stage.key]: next };
      });
    else if (stage.key === "experience")
      setAnswers((current) => ({
        ...current,
        experience: option,
        rirEnabled: shouldEnableRir(option, current.effortStyle),
      }));
    else if (stage.key === "effortStyle")
      setAnswers((current) => ({
        ...current,
        effortStyle: option,
        rirEnabled: shouldEnableRir(current.experience, option),
      }));
    else setAnswers((current) => ({ ...current, [stage.key]: option }));
  };
  const chooseAvailableDay = (option) => {
    if (anyDayWorks) return;
    setAnswers((current) => {
      const availableDays = current.availableDays.includes(option)
        ? current.availableDays.filter((item) => item !== option)
        : [...current.availableDays, option];
      manualAvailableDaysRef.current = [...availableDays];
      return { ...current, availableDays };
    });
  };
  const toggleAnyDayWorks = () => {
    if (anyDayWorks) {
      setAnyDayWorks(false);
      setAnswers((current) => ({
        ...current,
        availableDays: [...manualAvailableDaysRef.current],
      }));
      return;
    }
    manualAvailableDaysRef.current = [...answers.availableDays];
    setAnyDayWorks(true);
    setAnswers((current) => ({ ...current, availableDays: [...WEEKDAYS] }));
  };
  const chooseFrequency = (option) => {
    // A changed day count can make a custom week invalid, not disposable.
    if (splitChoice !== "other") {
      setSplitChoice("recommended");
      setSpecificSplitOpen(false);
    }
    setAnswers((current) => ({
      ...current,
      daysPerWeek: option,
      trainingSplitChoice: splitChoice === "other" ? "other" : "recommended",
      trainingPreferences: splitChoice === "other" ? current.trainingPreferences : "",
    }));
  };
  const chooseSplit = (option) => {
    setSplitChoice(option.id);
    if (option.id === "recommended") setSpecificSplitOpen(false);
    else setSpecificSplitOpen(true);
    setAnswers((current) => ({
      ...current,
      trainingSplitChoice: option.id,
      trainingPreferences: option.id === "other" && current.trainingSplitChoice === "other" ? current.trainingPreferences : option.value ?? "",
    }));
  };
  const chooseEnvironment = (option) => {
    document.activeElement?.blur();
    setEquipmentSetupExpanded(option === "Home gym");
    setAnswers((current) => ({
      ...current,
      environment: option,
      primaryTrainingEnvironment:
        option === "Both" ? null : option,
      equipment: option === "Commercial gym" ? ["full gym"] : [],
    }));
  };
  const choosePrimaryEnvironment = (option) => {
    document.activeElement?.blur();
    setEquipmentSetupExpanded(option === "Home gym");
    setAnswers((current) => ({
      ...current,
      primaryTrainingEnvironment: option,
      equipment: option === "Commercial gym" ? ["full gym"] : [],
    }));
  };
  const chooseEquipment = (option) =>
    setAnswers((current) => {
      if (option === "full gym")
        return {
          ...current,
          equipment:
            current.equipment.length === 1 && current.equipment[0] === option
              ? []
              : [option],
        };
      const selected = current.equipment.filter(
        (item) => item !== "full gym" && item !== "bodyweight only",
      );
      let next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      if (option === "bodyweight only") next = ["bodyweight only"];
      return { ...current, equipment: normalizeGymEquipment(next) };
    });
  const scheduleValid = Boolean(
    answers.daysPerWeek &&
    answers.sessionMinutes &&
    answers.availableDays.length >= answers.daysPerWeek,
  );
  const setupValid =
    setupSelectionValid(answers) &&
    (answers.environment !== "Both" ||
      Boolean(answers.primaryTrainingEnvironment));
  const answersWithSafety =
    safetyAnalysis.analysis && safetyAnalysis.sourceText === String(answers.avoid || "")
      ? {
          ...answers,
          trainingSafetyAnalysis: {
            sourceText: safetyAnalysis.sourceText,
            analysis: safetyAnalysis.analysis,
          },
        }
      : answers;
  const analyzedSafety =
    safetyAnalysis.status === "ready" ? trainingSafetyFor(answersWithSafety) : null;
  const safetyBlocked =
    stage.key === "preferences" &&
    analyzedSafety &&
    trainingSafetyBlocks(analyzedSafety.status);
  const splitValidation = useMemo(() =>
    stage.key === "preferences" ? customSplitValidation(onboardingGenerationProfile(answersWithSafety), analyzedSafety) : { valid: true },
    [stage.key, answersWithSafety, analyzedSafety],
  );
  const splitInvalid = !splitValidation.valid;
  const splitError = splitInvalid && answers.trainingPreferences.trim() ? splitValidation.message : null;
  const valid =
    !safetyBlocked &&
    !splitInvalid &&
    (stage.personal
    ? Boolean(answers.ageRange)
    : stage.key === "schedule"
      ? scheduleValid
      : stage.key === "setup"
        ? setupValid
        : stage.optional ||
          stage.custom ||
          (stage.multi ? value.length > 0 : value !== null));
  const finalize = async (profile) => {
    if (generationRef.current || safetyRequestRef.current) return;
    const generationProfile = onboardingGenerationProfile(profile);
    // Reject incomplete/partially recognized custom intent before processing
    // or safety/network work. buildProgram enforces the same guard independently.
    try {
      selectStructuralTemplate(generationProfile, generationProfile.daysPerWeek);
    } catch (error) {
      if (error.code !== 'custom-split-conflict') throw error;
      setSpecificSplitOpen(true);
      setBuildFailed(false);
      return;
    }
    let effectiveProfile = generationProfile;
    const sourceText = String(profile?.avoid || "");
    let cached = profile?.trainingSafetyAnalysis;
    if (
      cached?.sourceText !== sourceText ||
      cached?.analysis?.schemaVersion !== TRAINING_SAFETY_SCHEMA_VERSION
    )
      cached = null;
    if (sourceText.trim() && !cached?.analysis) {
      const localResolution = localTrainingSafetyResolution(
        sourceText,
        Object.values(exerciseCatalog),
      );
      if (localResolution.status === "resolved") {
        effectiveProfile = { ...generationProfile, trainingSafetyAnalysis: null };
        setAnswers((current) =>
          String(current.avoid || "") === sourceText
            ? { ...current, trainingSafetyAnalysis: null }
            : current,
        );
        setSafetyAnalysis({
          sourceText,
          analysis: null,
          status: "ready",
          resolution: "local",
        });
      } else {
        safetyRequestRef.current = true;
        setSafetyAnalysis({ sourceText, analysis: null, status: "checking" });
        setNotice("");
        try {
          const analysis = await AIService.analyzeTrainingSafety(sourceText);
          if (restrictionTextRef.current !== sourceText) return;
          effectiveProfile = {
            ...generationProfile,
            trainingSafetyAnalysis: { sourceText, analysis },
          };
          trainingSafetyFor(effectiveProfile);
          setAnswers((current) =>
            String(current.avoid || "") === sourceText
              ? { ...current, trainingSafetyAnalysis: { sourceText, analysis } }
              : current,
          );
          setSafetyAnalysis({ sourceText, analysis, status: "ready" });
        } catch {
          if (restrictionTextRef.current === sourceText) {
            setSafetyAnalysis({
              sourceText,
              analysis: null,
              status: "error",
              errorKind: localResolution.reason,
            });
            setNotice("");
          }
          return;
        } finally {
          safetyRequestRef.current = false;
        }
      }
    }
    const trainingSafety = trainingSafetyFor(effectiveProfile);
    if (trainingSafetyBlocks(trainingSafety.status)) {
      setNotice("");
      setBuildFailed(false);
      return;
    }
    generationRef.current = true;
    const run = ++generationRun.current;
    const startedAt = performance.now();
    lastBuildProfile.current = effectiveProfile;
    setBusy(true);
    setNotice("");
    setBuildFailed(false);
    setGenerationStage("preparing");
    trackFunnelEvent("plan_generation_started", {
      path: "personalized",
      source: "local",
      daysPerWeek: effectiveProfile.daysPerWeek,
      sessionMinutes: effectiveProfile.sessionMinutes,
    });
    try {
      await afterVisibleFrame();
      const result = await generatePersonalizedProgram(effectiveProfile, {
        onStage: setGenerationStage,
      });
      await afterVisibleFrame();
      if (run !== generationRun.current) return;
      trackFunnelEvent("plan_generation_completed", {
        path: "personalized",
        source: result.source,
        durationMs: Math.round(performance.now() - startedAt),
        daysPerWeek: result.program.days.length,
        exerciseCount: result.program.days.reduce(
          (sum, day) => sum + day.exercises.length,
          0,
        ),
      });
      setGeneratedPreview({ ...result, profile: effectiveProfile });
      setBusy(false);
      generationRef.current = false;
    } catch (error) {
      if (run !== generationRun.current) return;
      trackFunnelEvent("plan_generation_failed", {
        path: "personalized",
        source: "local",
        durationMs: Math.round(performance.now() - startedAt),
        reason: "validation",
      });
      if (error.code === 'custom-split-conflict') {
        setSpecificSplitOpen(true);
        setBuildFailed(false);
      } else {
        setNotice("We couldn't build a valid plan from these answers. Review your schedule, equipment and restrictions, then try again.");
        setBuildFailed(true);
      }
      setBusy(false);
      generationRef.current = false;
    }
  };
  const cancelGeneration = () => {
    generationRun.current++;
    generationRef.current = false;
    setBusy(false);
    setBuildFailed(false);
    setNotice("Generation cancelled. Your answers are still here.");
  };
  const acceptGenerated = async (program) => {
    setBusy(true);
    setGenerationStage("saving");
    await afterVisibleFrame();
    trackFunnelEvent("onboarding_completed", {
      path: "personalized",
      source: generatedPreview.source,
      totalSteps: stages.length,
      daysPerWeek: program.days.length,
    });
    update((state) => {
      state.profile = { ...generatedPreview.profile, onboardingComplete: true };
      state.program = {
        ...program,
        rotationStartDate: firstScheduledDate(program),
      };
      state.selectedDay = weekday();
      state.selectedDate = isoDay();
      state.ai = { ...state.ai, lastPlanSource: generatedPreview.source };
      return state;
    }, { planVersion: { source: "Initial plan", reason: "Personalized plan created" } });
    onPlanAccepted?.();
  };
  const structuredDone = async () => {
    trackFunnelEvent("onboarding_step_completed", {
      path: "personalized",
      step: stage.key,
      stepIndex: step + 1,
      totalSteps: stages.length,
    });
    await finalize(answers);
  };
  const confirmTrainingClearance = () => {
    if (!analyzedSafety) return;
    const nextProfile = {
      ...answersWithSafety,
      trainingSafetyClearanceAttestation:
        createTrainingClearanceAttestation(analyzedSafety),
      trainingSafetyClearanceDeclinedHash: null,
      trainingSafetyClearanceResponse: null,
    };
    setAnswers(nextProfile);
    requestAnimationFrame(() => finalize(nextProfile));
  };
  const setTrainingClearanceResponse = (status) => {
    if (!analyzedSafety) return;
    setAnswers({
      ...answersWithSafety,
      trainingSafetyClearanceAttestation: null,
      trainingSafetyClearanceDeclinedHash: null,
      trainingSafetyClearanceResponse: createTrainingClearanceResponse(
        analyzedSafety,
        status,
      ),
    });
  };
  const resetTrainingClearanceResponse = () =>
    setAnswers({
      ...answersWithSafety,
      trainingSafetyClearanceAttestation: null,
      trainingSafetyClearanceDeclinedHash: null,
      trainingSafetyClearanceResponse: null,
    });
  const setTrainingLimitsResponse = (status) => {
    if (!analyzedSafety) return;
    setAnswers({
      ...answersWithSafety,
      trainingSafetyLimitsResponse: createTrainingLimitsResponse(
        analyzedSafety,
        status,
      ),
      trainingSafetySupplementalLimits: null,
      trainingSafetyClearanceAttestation: null,
      trainingSafetyClearanceDeclinedHash: null,
      trainingSafetyClearanceResponse: null,
    });
    setSupplementalLimitText("");
    setSupplementalLimitStatus("idle");
  };
  const resetTrainingLimitsResponse = () => {
    setAnswers({
      ...answersWithSafety,
      trainingSafetyLimitsResponse: null,
      trainingSafetySupplementalLimits: null,
      trainingSafetyClearanceAttestation: null,
      trainingSafetyClearanceDeclinedHash: null,
      trainingSafetyClearanceResponse: null,
    });
    setSupplementalLimitText("");
    setSupplementalLimitStatus("idle");
  };
  const checkSupplementalLimits = async () => {
    const supplementalText = supplementalLimitText.trim();
    if (!supplementalText || supplementalLimitStatus === "checking") return;
    setSupplementalLimitStatus("checking");
    try {
      const questionContext =
        analyzedSafety?.status === "needs_trigger_confirmation"
          ? "symptom_triggers"
          : null;
      const analysis = await AIService.analyzeTrainingSafety(
        supplementalText,
        questionContext,
      );
      if (supplementalLimitTextRef.current.trim() !== supplementalText) return;
      setAnswers({
        ...answersWithSafety,
        trainingSafetyLimitsResponse: null,
        trainingSafetySupplementalLimits: {
          text: supplementalText,
          analysis,
          questionContext,
          resolvesUnresolved: analyzedSafety?.status === "needs_clarification",
        },
        trainingSafetyClearanceAttestation: null,
        trainingSafetyClearanceDeclinedHash: null,
        trainingSafetyClearanceResponse: null,
      });
      setSupplementalLimitStatus("ready");
    } catch {
      setSupplementalLimitStatus("error");
    }
  };
  const advance = () => {
    trackFunnelEvent("onboarding_step_completed", {
      path: "personalized",
      step: stage.key,
      stepIndex: step + 1,
      totalSteps: stages.length,
    });
    setStep((index) => index === step ? index + 1 : index);
  };
  const submitFollowUp = async (skipped) => {
    const question = followUps[followIndex]?.question || followUps[followIndex];
    const response = skipped
      ? { question, answer: null, skipped: true }
      : { question, answer: followText.trim(), skipped: false };
    const nextAnswers = [...answers.followUpAnswers, response];
    const profile = { ...answers, followUpAnswers: nextAnswers };
    if (followIndex < followUps.length - 1) {
      setAnswers(profile);
      setFollowIndex((index) => index + 1);
      setFollowText("");
    } else await finalize(profile);
  };
  useStepSwipeForward(onboardingRootRef, {
    active: !physiqueOpen && !generatedPreview && !followUps.length,
    step,
    enabled: step < stages.length - 1 && valid && !busy &&
      safetyAnalysis.status !== 'checking' && !ageMenuOpen &&
      !selectionAcknowledgement.acknowledging,
    onForward: advance,
  });
  if (physiqueOpen)
    return (
      <PhysiqueReview
        profile={answers}
        onClose={() => setPhysiqueOpen(false)}
        onUse={({ suggested, confirmed }) => {
          setAnswers((current) => {
            const prioritySources = {
              ...current.prioritySources,
              physiqueSuggested: suggested,
              physiqueConfirmed: confirmed,
            };
            return {
              ...current,
              prioritySources,
              priorities: combinedTrainingPriorities(
                prioritySources.manual,
                confirmed,
              ),
            };
          });
          setPhysiqueOpen(false);
        }}
      />
    );
  if (generatedPreview)
    return (
      <main
        ref={generatedPreviewRootRef}
        className="screen detail-screen generated-plan-preview initial-import-screen"
      >
        <header className="detail-header">
          <button
            aria-label="Back to onboarding"
            disabled={busy}
            onClick={() => generatedPreviewNavigationRef.current?.back()}
          >
            ‹
          </button>
          <strong>Plan preview</strong>
          <span />
        </header>
        <PlanEditor
          source={generatedPreview.program}
          generatedAcceptance
          previewNavigationRef={generatedPreviewNavigationRef}
          profile={generatedPreview.profile}
          onSave={acceptGenerated}
          onCancel={() => setGeneratedPreview(null)}
          saving={busy}
          headingRef={generatedPreviewHeadingRef}
        />
        {busy && <BuildingOverlay stage={generationStage} />}
      </main>
    );
  if (followUps.length) {
    const followUp = followUps[followIndex];
    return (
      <main className="onboarding follow-up-onboarding">
        <div className="brand">ROOK</div>
        <div className="progress-line">
          <span style={{ width: "100%" }} />
        </div>
        <span className="step-count">
          COACH {followIndex + 1}/{followUps.length}
        </span>
        <div className="onboarding-content">
          <Eyebrow>ONE USEFUL DETAIL</Eyebrow>
          <h1>{followUp.question || followUp}</h1>
          {followUp.hint && <p className="follow-up-hint">{followUp.hint}</p>}
          <p className="follow-up-note">
            Optional. Your answer only helps refine the plan.
          </p>
          <textarea
            className="text-answer"
            disabled={busy}
            value={followText}
            onChange={(event) => setFollowText(event.target.value)}
            placeholder="Your answer"
          />
          {notice && <p className="offline-banner">{notice}</p>}
        </div>
        <div className="onboarding-footer">
          <Button
            disabled={busy || (!buildFailed && !followText.trim())}
            onClick={() =>
              buildFailed
                ? finalize(lastBuildProfile.current)
                : submitFollowUp(false)
            }
          >
            {busy
              ? "BUILDING…"
              : buildFailed
                ? "TRY AGAIN"
                : followIndex === followUps.length - 1
                  ? "BUILD MY PLAN"
                  : "CONTINUE"}
          </Button>
          {!busy && !buildFailed && (
            <Button variant="quiet" onClick={() => submitFollowUp(true)}>
              SKIP QUESTION
            </Button>
          )}
        </div>
        {busy && (
          <BuildingOverlay
            stage={generationStage}
            onCancel={cancelGeneration}
          />
        )}
      </main>
    );
  }
  return (
    <main ref={onboardingRootRef} className={`onboarding onboarding-${stage.key}${selectionAcknowledgement.acknowledging ? " is-acknowledging" : ""}`}>
      <div className={step === 0 ? 'onboarding-start-brand' : undefined}>
        {step === 0 && <button type="button" className="detail-header-back onboarding-start-back" aria-label="Back to plan options" onClick={exit}>‹</button>}
        <div className="brand">ROOK</div>
      </div>
      <StepProgress step={step+1} total={stages.length} />
      <div className="onboarding-content" key={stage.key} data-swipe-back-content>
        <Eyebrow>{stage.label}</Eyebrow>
        <h1>{stage.question}</h1>
        {!stage.hideHelper && (
          <p>
            {stage.personal
              ? "Age helps ROOK choose a more appropriate starting workload and training setup. Your first name is optional."
              : stage.helper ||
                stage.optionalHint ||
                (stage.optional
                  ? "Optional. Choose only what matters to you."
                  : "Choose the answer that best fits your routine.")}
          </p>
        )}
        {stage.personal ? (
          <div className="personal-fields">
            <div className="personal-field">
              <span id="age-range-label">Age range</span>
              <div className="age-range-picker" ref={agePickerRef}>
                <button
                  ref={ageTriggerRef}
                  type="button"
                  className="age-range-trigger"
                  role="combobox"
                  aria-label="Age range"
                  aria-labelledby="age-range-label"
                  aria-expanded={ageMenuOpen}
                  aria-controls="age-range-options"
                  aria-haspopup="listbox"
                  onClick={() => setAgeMenuOpen((open) => !open)}
                  onKeyDown={(event) => {
                    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                      event.preventDefault();
                      const selectedIndex = Math.max(
                        0,
                        ageRangeOptions.indexOf(answers.ageRange),
                      );
                      setActiveAgeIndex(selectedIndex);
                      setAgeMenuOpen(true);
                    }
                    if (event.key === "Escape") setAgeMenuOpen(false);
                  }}
                >
                  <span className={answers.ageRange ? "" : "placeholder"}>
                    {answers.ageRange || "Select age range"}
                  </span>
                  <i className="disclosure-chevron" aria-hidden="true" />
                </button>
                {ageMenuOpen && (
                  <div
                    id="age-range-options"
                    className={`age-range-options${ageMenuLayout.opensAbove ? " opens-above" : ""}`}
                    role="listbox"
                    aria-label="Age range options"
                    style={{ maxHeight: `${ageMenuLayout.maxHeight}px` }}
                  >
                    {ageRangeOptions.map((option, index) => (
                      <button
                        ref={(element) => {
                          ageOptionRefs.current[index] = element;
                        }}
                        type="button"
                        key={option}
                        role="option"
                        tabIndex={index === activeAgeIndex ? 0 : -1}
                        aria-selected={answers.ageRange === option}
                        className={index === activeAgeIndex ? "is-active" : ""}
                        onPointerMove={() => setActiveAgeIndex(index)}
                        onClick={() => {
                          setAnswers((current) => ({
                            ...current,
                            ageRange: option,
                          }));
                          setAgeMenuOpen(false);
                          requestAnimationFrame(() =>
                            ageTriggerRef.current?.focus({ preventScroll: true }),
                          );
                        }}
                        onKeyDown={(event) => {
                          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                            event.preventDefault();
                            const nextIndex =
                              event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? ageRangeOptions.length - 1
                                  : (index + (event.key === "ArrowDown" ? 1 : -1) + ageRangeOptions.length) % ageRangeOptions.length;
                            setActiveAgeIndex(nextIndex);
                            ageOptionRefs.current[nextIndex]?.focus({
                              preventScroll: true,
                            });
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setAgeMenuOpen(false);
                            requestAnimationFrame(() =>
                              ageTriggerRef.current?.focus({ preventScroll: true }),
                            );
                          } else if (event.key === "Tab") {
                            setAgeMenuOpen(false);
                          }
                        }}
                      >
                        <span>{option}</span>
                        {answers.ageRange === option ? (
                          <i aria-hidden="true">✓</i>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <WeightUnitChoice compact value={answers.units} onChange={units=>{
              update(current=>{current.profile.units=units;return current;});
              setAnswers(current=>({...current,units}));
            }}/>
            <label>
              <span>
                First name <small>optional</small>
              </span>
              <input
                aria-label="First name"
                value={answers.name}
                maxLength={40}
                autoComplete="given-name"
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="What should Coach call you?"
              />
            </label>
            <p className="privacy-note">
              Stored only in your local Rook profile. Your name never changes
              exercise selection.
            </p>
          </div>
        ) : stage.key === "schedule" ? (
          <div className="schedule-fields">
            <section className="onboarding-question-group schedule-frequency">
              <div className="onboarding-group-heading">
                <strong>Workouts per week</strong>
              </div>
              <div className="option-list">
                {[2, 3, 4, 5, 6].map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={`${option} days`}
                    selected={answers.daysPerWeek === option}
                    onClick={() => chooseFrequency(option)}
                  />
                ))}
              </div>
            </section>
            <section
              className="onboarding-question-group schedule-days"
              aria-labelledby="schedule-days-label"
              aria-describedby="schedule-availability-status"
            >
              <div className="onboarding-group-heading">
                <strong id="schedule-days-label">Days you can train</strong>
                <label className="select-all-check">
                  <input
                    type="checkbox"
                    aria-label="Any day works"
                    checked={anyDayWorks}
                    onChange={toggleAnyDayWorks}
                  />
                  <i aria-hidden="true">{anyDayWorks ? "✓" : ""}</i>
                  <span>Any day works</span>
                </label>
              </div>
              <div className="option-list day-options">
                {WEEKDAYS.map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={localizedWeekdayLabel(option, "short")}
                    ariaLabel={localizedWeekdayLabel(option, "long")}
                    selected={answers.availableDays.includes(option)}
                    disabled={anyDayWorks}
                    describedBy="schedule-availability-status"
                    onClick={() => chooseAvailableDay(option)}
                  />
                ))}
              </div>
              <div id="schedule-availability-status" aria-live="polite">
                <small className="schedule-selection-count">
                {anyDayWorks
                  ? "7 days available"
                  : `${answers.availableDays.length} ${
                      answers.availableDays.length === 1 ? "day" : "days"
                    } selected`}
                </small>
                {answers.daysPerWeek &&
                answers.availableDays.length < answers.daysPerWeek && (
                  <small className="schedule-hint">
                    Choose at least {answers.daysPerWeek} available days.
                  </small>
                )}
              </div>
            </section>
            <section className="onboarding-question-group schedule-duration">
              <div className="onboarding-group-heading">
                <strong>Time per workout</strong>
              </div>
              <div className="option-list">
                {[30, 45, 60, 75, 90, 120].map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={`${option} min`}
                    selected={answers.sessionMinutes === option}
                    onClick={() => {
                      setAnswers((current) => ({
                        ...current,
                        sessionMinutes: option,
                      }));
                      revealScheduleContinue(Boolean(answers.daysPerWeek && answers.availableDays.length >= answers.daysPerWeek));
                    }}
                  />
                ))}
              </div>
              <small className="schedule-duration-note">
                {answers.sessionMinutes === 120
                  ? "ROOK may finish sooner. It won’t add work just to fill the time."
                  : "Session length is estimated. Some full-body workouts may run a few minutes longer."}
              </small>
            </section>
          </div>
        ) : stage.key === "setup" ? (
          <div className="setup-fields">
            <section className="onboarding-question-group setup-environment">
              <div className="option-list">
                {["Commercial gym", "Home gym", "Both"].map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={option}
                    selected={answers.environment === option}
                    onClick={() => chooseEnvironment(option)}
                  />
                ))}
              </div>
            </section>
            {answers.environment === "Commercial gym" &&
              !equipmentSetupExpanded && (
              <div className="setup-confirmation">
                <span>
                  <strong>Full gym access</strong>
                  <small>
                    Your plan can use standard commercial-gym equipment.
                  </small>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEquipmentSetupExpanded(true);
                  }}
                >
                  CUSTOMIZE EQUIPMENT
                </button>
              </div>
            )}
            {answers.environment === "Both" &&
              !answers.primaryTrainingEnvironment && (
              <section className="onboarding-question-group setup-primary-environment">
                <div className="onboarding-group-heading">
                  <strong>Build this plan primarily for</strong>
                  <small>You can use another Gym Profile later.</small>
                </div>
                <div className="option-list">
                  {["Commercial gym", "Home gym"].map((option) => (
                    <OnboardingOptionCard
                      key={option}
                      label={option}
                      selected={answers.primaryTrainingEnvironment === option}
                      onClick={() => choosePrimaryEnvironment(option)}
                    />
                  ))}
                </div>
              </section>
            )}
            {answers.environment === "Both" &&
              answers.primaryTrainingEnvironment === "Commercial gym" &&
              !equipmentSetupExpanded && (
                <div className="setup-confirmation">
                  <span>
                    <strong>Commercial gym primary</strong>
                    <small>
                      Full gym access for your first plan.
                    </small>
                  </span>
                  <div className="setup-confirmation-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEquipmentSetupExpanded(true);
                      }}
                    >
                      CUSTOMIZE EQUIPMENT
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          primaryTrainingEnvironment: null,
                          equipment: [],
                        }))
                      }
                    >
                      CHANGE PRIMARY
                    </button>
                  </div>
                </div>
              )}
            {answers.environment &&
              ((equipmentSetupExpanded && (answers.environment !== "Both" || answers.primaryTrainingEnvironment)) ||
                answers.environment === "Home gym" ||
                (answers.environment === "Both" &&
                  answers.primaryTrainingEnvironment === "Home gym")) && (
                <section className="onboarding-question-group setup-equipment">
                  <div className="onboarding-group-heading">
                    <div className="setup-equipment-title-row">
                      <strong>
                        {answers.environment === "Home gym" ||
                        answers.primaryTrainingEnvironment === "Home gym"
                          ? "What equipment do you have?"
                          : "Available equipment"}
                      </strong>
                      {equipmentSetupExpanded &&
                        answers.environment === "Commercial gym" && (
                          <button
                            type="button"
                            onClick={() => {
                              setEquipmentSetupExpanded(false);
                              setAnswers((current) => ({ ...current, equipment: ["full gym"] }));
                            }}
                          >
                            USE FULL GYM DEFAULT
                          </button>
                        )}
                      {answers.environment === "Both" &&
                        answers.primaryTrainingEnvironment && (
                          <button
                            type="button"
                            onClick={() =>
                              setAnswers((current) => ({
                                ...current,
                                primaryTrainingEnvironment: null,
                                equipment: [],
                              }))
                            }
                          >
                            CHANGE PRIMARY
                          </button>
                        )}
                    </div>
                    <small>
                      Select all equipment you have, or choose Bodyweight only.
                    </small>
                  </div>
                  <div className="option-list option-grid">
                    {CANONICAL_GYM_EQUIPMENT.map(
                      (option) => (
                        <OnboardingOptionCard
                          key={option}
                          label={EQUIPMENT_LABELS[option] || option}
                          selected={answers.equipment.includes(option)}
                          onClick={() => chooseEquipment(option)}
                        />
                      ),
                    )}
                  </div>
                </section>
              )}
          </div>
        ) : stage.custom ? (
          <div className="preference-fields">
            <section className="onboarding-question-group split-preference">
              <div className="onboarding-group-heading">
                <strong>Preferred split</strong>
                <small>Based on {answers.daysPerWeek} days/week</small>
              </div>
              <div className="option-list split-options">
                {splitOptions.map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={option.label}
                    selected={splitChoice === option.id}
                    onClick={() => chooseSplit(option)}
                  />
                ))}
              </div>
              {splitChoice === "other" && (
                <textarea
                  aria-label="Other preferred split"
                  className="text-answer split-other-answer"
                  value={answers.trainingPreferences}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      trainingPreferences: event.target.value,
                    }))
                  }
                  placeholder="Write your preferred split or training style"
                />
              )}
            </section>
            <section className="onboarding-question-group">
              <div className="onboarding-group-heading">
                <strong>Training restrictions</strong>
                <small>Optional</small>
              </div>
              <textarea
                aria-label="Restrictions or clinician limits"
                className="text-answer compact-answer"
                value={answers.avoid}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    avoid: event.target.value,
                    trainingSafetyConfirmedHash: null,
                  }))
                }
                placeholder="Pain, recent surgery, or movements you've been told to avoid"
              />
              <TrainingSafetySummary
                safety={trainingSafetyFor(answers)}
                confirmScope={() => {
                  const safety = trainingSafetyFor(answers);
                  setAnswers((current) => ({
                    ...current,
                    trainingSafetyConfirmedHash: safety.constraintHash,
                  }));
                }}
              />
            </section>
            <section className="onboarding-question-group">
              <div className="onboarding-group-heading">
                <strong>Exercise style</strong>
              </div>
              <div className="option-list compact-options">
                {[
                  "Prefer free weights",
                  "Prefer machines",
                  "No preference",
                ].map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={option}
                    selected={answers.exercisePreference === option}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        exercisePreference: option,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          </div>
        ) : stage.key === "priorities" ? (
          <>
          <button
            className="physique-review-entry"
            onClick={() => setPhysiqueOpen(true)}
          >
            <span>
              <strong>Not sure what to prioritize?</strong>
              <small>Get an optional physique review</small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
          <TrainingPriorityChoices
            selected={value}
            selectionLocked={
              value.filter(
                (item) => item !== BALANCED_TRAINING_PRIORITY,
              ).length >= MAX_MANUAL_TRAINING_PRIORITIES
            }
            limitReasonId="onboarding-priority-limit"
            onSelect={choose}
          />
          </>
        ) : (
          <div className={`option-list ${stage.multi ? "option-grid" : ""}`}>
            {stage.options.map((option, index) => {
              const selected = stage.multi
                ? value.includes(option)
                : value === option;
              const effortCopy =
                stage.key === "effortStyle"
                  ? effortGuidance.options[index]
                  : null;
              const description =
                effortCopy?.description ||
                (stage.key === "experience"
                  ? EXPERIENCE_DESCRIPTIONS[option]
                  : null);
              const label =
                effortCopy?.label || EQUIPMENT_LABELS[option] || option;
              return (
                <OnboardingOptionCard
                  key={option}
                  label={label}
                  description={description}
                  selected={selected}
                  onClick={(event) => choose(option, event)}
                />
              );
            })}
          </div>
        )}
        {stage.key === "priorities" && (
          <>
            <span id="onboarding-priority-limit" className="visually-hidden">
              Maximum of two priorities selected. Deselect one to choose another.
            </span>
            {!value.includes("Balanced") && value.length > 0 && <div
              className="priority-selection-summary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>
                {`${value.length} of ${MAX_MANUAL_TRAINING_PRIORITIES} selected`}
              </strong>
              <small>
                {value.length >= MAX_MANUAL_TRAINING_PRIORITIES
                    ? "Deselect one to choose another."
                    : value.join(" + ")}
                </small>
              </div>}
            </>
          )}
        {stage.key === "preferences" && (
          <TrainingPreferencesStep
            answers={answers}
            setAnswers={setAnswers}
            splitChoice={splitChoice}
            splitError={splitError}
            chooseSplit={chooseSplit}
            specificSplitOpen={specificSplitOpen}
            setSpecificSplitOpen={setSpecificSplitOpen}
            splitOptions={splitOptions}
            safety={analyzedSafety}
            safetyAnalysisStatus={safetyAnalysis.status}
            safetyAnalysisErrorKind={safetyAnalysis.errorKind}
            confirmClearance={confirmTrainingClearance}
            setClearanceResponse={setTrainingClearanceResponse}
            resetClearanceResponse={resetTrainingClearanceResponse}
            setLimitsResponse={setTrainingLimitsResponse}
            resetLimitsResponse={resetTrainingLimitsResponse}
            supplementalLimitText={supplementalLimitText}
            setSupplementalLimitText={(value) => {
              setSupplementalLimitText(value);
              setSupplementalLimitStatus("idle");
            }}
            checkSupplementalLimits={checkSupplementalLimits}
            supplementalLimitStatus={supplementalLimitStatus}
          />
        )}
        {stage.key === "goal" && (
          <section
            className={`goal-plan-preview ${answers.goal ? "has-selection" : ""}`}
            aria-label="How this affects your plan"
            aria-live="polite"
          >
            <span>HOW THIS AFFECTS YOUR PLAN</span>
            <strong>{goalPlanPreview.title}</strong>
            <p>{goalPlanPreview.detail}</p>
          </section>
        )}
        {notice && <p className="offline-banner">{notice}</p>}
      </div>
      <div className="onboarding-footer">
        {!singleDecision && <Button
          disabled={!valid || busy || safetyAnalysis.status === "checking"}
          onClick={() => {
            if (
              step === stages.length - 1 &&
              safetyAnalysis.status === "error"
            ) {
              const input = document.querySelector(
                '[aria-label="Restrictions or clinician limits"]',
              );
              input?.focus();
              input?.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
            if (step === stages.length - 1) {
              if (buildFailed) finalize(lastBuildProfile.current);
              else structuredDone();
            } else advance();
          }}
        >
          {busy
            ? "BUILDING…"
            : safetyAnalysis.status === "checking" &&
                step === stages.length - 1
              ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    CHECKING RESTRICTIONS…
                  </>
                )
              : safetyAnalysis.status === "error" &&
                  step === stages.length - 1
                ? safetyAnalysis.errorKind === "medical_context"
                  ? "CLARIFY RESTRICTION"
                  : "EDIT RESTRICTION"
                : safetyBlocked && step === stages.length - 1
                  ? analyzedSafety.clearanceResponseStatus
                    ? "UPDATE CLEARANCE STATUS ABOVE"
                    : ["needs_limits_confirmation", "needs_trigger_confirmation"].includes(analyzedSafety.status)
                      ? "ANSWER QUESTION ABOVE"
                    : analyzedSafety.status === "blocked_limits_unknown"
                        ? "UPDATE LIMIT STATUS ABOVE"
                    : analyzedSafety.status === "blocked_trigger_unknown"
                      ? "UPDATE PAIN LIMITS ABOVE"
                    : analyzedSafety.status === "needs_clearance_confirmation"
                      ? "ANSWER CLEARANCE ABOVE"
                    : analyzedSafety.status === "unsupported_limit"
                      ? "LIMIT NOT SUPPORTED"
                    : analyzedSafety.status === "needs_confirmation"
                    ? "CONFIRM LIMIT ABOVE"
                    : analyzedSafety.status === "needs_clarification"
                      ? "CLARIFY RESTRICTIONS ABOVE"
                      : "UPDATE RESTRICTIONS ABOVE"
            : buildFailed && step === stages.length - 1
              ? "TRY AGAIN"
              : step === stages.length - 1
                ? "BUILD MY PLAN"
                : stage.key === "effortStyle" && !value
                  ? "SKIP FOR NOW"
                  : "CONTINUE"}
        </Button>}
        {!busy &&
          (step > 0 ? (
            <Button
              variant="quiet"
              className="bottom-back"
              aria-label="Back"
              onClick={() => setStep((index) => index - 1)}
            >
              <BackLabel />
            </Button>
          ) : null)}
      </div>
      {busy && (
        <BuildingOverlay stage={generationStage} onCancel={cancelGeneration} />
      )}
    </main>
  );
}

function localDate(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
export function weekLabel(date) {
  const monday = weekDate("Mon", date);
  const sunday = weekDate("Sun", date);
  const month = (value) =>
    new Intl.DateTimeFormat("en", { month: "short" }).format(value);
  const day = (value) =>
    new Intl.DateTimeFormat("en", { day: "numeric" }).format(value);
  return monday.getMonth() === sunday.getMonth() &&
    monday.getFullYear() === sunday.getFullYear()
    ? `${month(monday)} ${day(monday)}–${day(sunday)}`
    : `${month(monday)} ${day(monday)}–${month(sunday)} ${day(sunday)}`;
}
function WeekNavigation({ date, canGoBack, canGoForward, move, openCalendar, calendarOpen }) {
  return (
    <div className="week-navigation" aria-label="Change week">
      <button
        aria-label="Previous week"
        disabled={!canGoBack}
        onClick={() => move(-1)}
      >
        ‹
      </button>
      <button type="button" className="week-calendar-trigger" aria-label={`Open calendar, ${weekLabel(date)}`} aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={openCalendar}><CalendarIcon/><span>{weekLabel(date)}</span></button>
      <button
        aria-label="Next week"
        disabled={!canGoForward}
        onClick={() => move(1)}
      >
        ›
      </button>
    </div>
  );
}
function WeekStrip({ state, referenceDate, selectedDate, selectDate }) {
  const schedule = new Map(
    currentWeekSchedule(state, referenceDate).map((item) => [
      item.scheduledDate,
      item.workout,
    ]),
  );
  const workouts = state.workouts;
  return (
    <div className="week-strip" aria-label={weekLabel(referenceDate)}>
      {WEEKDAYS.map((day) => {
        const date = weekDate(day, referenceDate);
        const scheduledWorkout = schedule.get(isoDay(date));
        const complete = workouts.some(
          (workout) =>
            workoutPlanDate(workout) === isoDay(date) &&
            (!scheduledWorkout ||
              workout.programDayId === scheduledWorkout.id ||
              (!workout.programDayId &&
                workout.templateId === scheduledWorkout.weekday)),
        );
        const isToday = isoDay(date) === isoDay();
        const isSelected = isoDay(date) === isoDay(selectedDate);
        const planned =
          schedule.has(isoDay(date)) ||
          Boolean(optionalStrengthForDate(state, date));
        const workoutState = complete
          ? "workout-completed"
          : planned
            ? "workout-planned"
            : "workout-rest";
        const statusLabel = complete
          ? ", completed workout"
          : planned
            ? ", planned workout"
            : ", rest day";
        const selectDay = () => {
          if (isSelected) return;
          selectDate(day, date);
        };
        return (
          <button
            key={day}
            aria-label={`${day} ${date.getDate()}${isToday ? ", today" : ""}${statusLabel}`}
            aria-current={isToday ? "date" : undefined}
            aria-pressed={isSelected}
            className={`${isSelected ? "selected-day" : ""} ${isToday ? "today-date" : ""} ${workoutState}`}
            onClick={selectDay}
          >
            <small>{day[0]}</small>
            {(complete || planned) && (
              <i
                aria-hidden="true"
                className={complete ? "completed-dot" : "workout-dot"}
              />
            )}
            <strong>{date.getDate()}</strong>
          </button>
        );
      })}
    </div>
  );
}
function PlanReadyNotice({ workoutToday, nextWorkout, dismiss }) {
  return (
    <aside className="plan-ready-notice" role="status" aria-live="polite">
      <button
        type="button"
        aria-label="Dismiss plan ready message"
        onClick={dismiss}
      >
        ×
      </button>
      <Eyebrow>YOUR PLAN IS READY</Eyebrow>
      {workoutToday ? (
        <p>Today’s workout is ready below.</p>
      ) : (
        <div>
          <strong>Your first workout</strong>
          <span>
            {nextWorkout
              ? `${new Intl.DateTimeFormat("en", { weekday: "long" }).format(localDate(nextWorkout.scheduledDate))} · ${nextWorkout.workout.name}`
              : "Your weekly program is ready."}
          </span>
        </div>
      )}
    </aside>
  );
}
export function formatActiveWorkoutDuration(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds))
    ? Math.max(0, Number(seconds))
    : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 100) return "99+ h";
  return `${hours}:${String(totalMinutes % 60).padStart(2, "0")} h`;
}
export function formatWorkoutElapsedDuration(seconds) {
  const totalSeconds = Number.isFinite(Number(seconds))
    ? Math.max(0, Math.floor(Number(seconds)))
    : 0;
  const secondsPart = String(totalSeconds % 60).padStart(2, "0");
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60)
    return `${String(totalMinutes).padStart(2, "0")}:${secondsPart}`;
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}:${secondsPart}`;
}
function TodayExerciseRow({
  exercise,
  detail,
  profile,
  setDetail,
  actions,
  editing = false,
  dragging = false,
  onRemove,
  onMove,
  onDragStart,
}) {
  const keyboardContext = useRef(false);
  const keyboardContextTimer = useRef(null);
  useEffect(() => {
    if (profile.showExerciseImages === false) return undefined;
    const preload = () => preloadExerciseArt(exercise, "low");
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 750 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(preload, 0);
    return () => clearTimeout(timer);
  }, [exercise, profile.showExerciseImages]);
  useEffect(
    () => () => {
      clearTimeout(keyboardContextTimer.current);
    },
    [],
  );
  const openActions = () => {
    if (!actions) return;
    setDetail({ todayExerciseActions: { ...actions, exercise } });
  };
  const openContextActions = (event) => {
    if (!actions) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    if (
      nativeEvent?.pointerType === "touch" ||
      nativeEvent?.sourceCapabilities?.firesTouchEvents
    )
      return;
    if (keyboardContext.current) {
      keyboardContext.current = false;
      clearTimeout(keyboardContextTimer.current);
      return;
    }
    openActions();
  };
  if (editing)
    return (
      <div
        className={`exercise-list-item today-exercise-edit-row${dragging ? " is-dragging" : ""}`}
        data-entry-id={exercise.id}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const inHandleColumn = event.clientX <= bounds.left + 44;
          if (inHandleColumn) onDragStart?.(event, exercise.id);
        }}
        style={{
          viewTransitionName: rookViewTransitionName("today-exercise", exercise.id),
        }}
      >
        <button
          type="button"
          className="today-exercise-drag-handle"
          aria-label={`Reorder ${exerciseName(exercise)}`}
          onKeyDown={(event) => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            onMove?.(exercise.id, event.key === 'ArrowUp' ? -1 : 1);
          }}
        >
          <i aria-hidden="true" />
        </button>
        <span className="today-exercise-edit-copy">
          <strong>{exerciseName(exercise)}</strong>
          {detail && <small>{detail}</small>}
        </span>
        <span className="today-exercise-edit-target">
          {targetLabel(exercise, profile.rirEnabled)}
        </span>
        <button
          type="button"
          className="today-exercise-remove"
          aria-label={`Remove ${exerciseName(exercise)}`}
          aria-haspopup="dialog"
          onClick={() => onRemove?.(exercise)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    );
  return (
    <div
      className={`exercise-list-item${detail ? " has-secondary" : ""}`}
      style={{
        viewTransitionName: rookViewTransitionName("today-exercise", exercise.id),
      }}
      onContextMenu={openContextActions}
    >
      <button
        onClick={() => setDetail({ exercise })}
        onKeyDown={(event) => {
          if (
            !actions ||
            !(
              (event.shiftKey && event.key === "F10") ||
              event.key === "ContextMenu"
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          keyboardContext.current = true;
          clearTimeout(keyboardContextTimer.current);
          keyboardContextTimer.current = setTimeout(
            () => (keyboardContext.current = false),
            250,
          );
          openActions();
        }}
        aria-keyshortcuts={actions ? "Shift+F10 ContextMenu" : undefined}
        className={`list-row exercise-list-row${detail ? " has-secondary" : ""}`}
      >
        <span className="exercise-row-main">
          <span>
            <strong>{exerciseName(exercise)}</strong>
            {detail && <small>{detail}</small>}
          </span>
        </span>
        <span className="navigation-row-end">
          <span>{targetLabel(exercise, profile.rirEnabled)}</span>
        </span>
      </button>
    </div>
  );
}
export function activeWorkoutNoticeDetails(
  workout,
  dateKey,
  now = Date.now(),
) {
  const summary = workoutSetSummary(workout);
  const elapsed = Math.max(0, Number(now) - Number(workout?.startedAt || now)) / 1000;
  const progress = `${summary.completed} / ${pluralize(summary.total, workout.exercises.every(e=>loggingUnit(e)==='round')?'round':'set')} · ${formatActiveWorkoutDuration(elapsed)}`;
  const startedOnAnotherDate = Boolean(
    dateKey && dateKey !== isoDay(new Date(now)),
  );
  return startedOnAnotherDate
    ? `${displayDate(localDate(dateKey))} · ${progress}`
    : progress;
}
function ActiveWorkoutNotice({ workout, dateKey, now, onResume }) {
  const details = activeWorkoutNoticeDetails(workout, dateKey, now);
  return (
    <aside className="active-workout-notice" aria-label="Workout in progress">
      <span>
        <Eyebrow>WORKOUT IN PROGRESS</Eyebrow>
        <strong>{workout.name}</strong>
        <small className="active-workout-notice-progress">{details}</small>
      </span>
      <button
        className="text-button"
        aria-label={`Resume ${workout.name} workout`}
        onClick={onResume}
      >
        RESUME
      </button>
    </aside>
  );
}
function ActiveOptionalSessionNotice({ session, now, onResume }) {
  const elapsed = optionalSessionElapsedSeconds(session, now);
  const stateLabel = session.status === "paused" ? "Paused" : "In progress";
  return (
    <aside
      className="active-workout-notice active-optional-session-notice"
      aria-label="Optional session in progress"
    >
      <span>
        <Eyebrow>OPTIONAL SESSION</Eyebrow>
        <strong>{session.activity}</strong>
        <small className="active-workout-notice-progress">
          {stateLabel} · {formatDuration(Math.floor(elapsed))}
        </small>
      </span>
      <button
        className="text-button"
        aria-label={`Resume ${session.activity} optional session`}
        onClick={onResume}
      >
        RESUME
      </button>
    </aside>
  );
}

function ActiveOptionalSession({ state, update, setPage }) {
  const active = state.activeOptionalSession;
  const [now, setNow] = useState(Date.now());
  const [completedSummary, setCompletedSummary] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const screenRef = useRef(null);
  const session = completedSummary || active;

  useEffect(() => {
    screenRef.current?.focus();
  }, [completedSummary?.id]);
  useEffect(() => {
    if (!active || active.status !== "active") return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id, active?.status, active?.runningSince]);
  useEffect(() => {
    if (!session) setPage("today");
  }, [session, setPage]);
  if (!session) return null;

  if (completedSummary) {
    return (
      <main
        ref={screenRef}
        className="screen optional-session-screen optional-session-complete"
        tabIndex="-1"
      >
        <section className="optional-session-complete-body">
          <span className="optional-session-complete-mark" aria-hidden="true">✓</span>
          <Eyebrow>SESSION COMPLETE</Eyebrow>
          <h1>{completedSummary.activity}</h1>
          <strong className="optional-session-summary-time">
            {formatDuration(completedSummary.elapsedSeconds)}
          </strong>
          <dl className="optional-session-facts">
            <div>
              <dt>Target</dt>
              <dd>{completedSummary.duration} min</dd>
            </div>
            {completedSummary.kind === "Cardio" && (
              <div>
                <dt>Intensity</dt>
                <dd>{completedSummary.intensity}</dd>
              </div>
            )}
          </dl>
          <p>Your planned rest day is unchanged.</p>
          <Button onClick={() => setPage("today")}>DONE</Button>
        </section>
      </main>
    );
  }

  const elapsed = optionalSessionElapsedSeconds(active, now);
  const togglePause = () => {
    const changedAt = Date.now();
    update((current) =>
      active.status === "paused"
        ? resumeOptionalSession(current, changedAt)
        : pauseOptionalSession(current, changedAt),
    );
    setNow(changedAt);
    triggerHaptic("tap");
  };
  const finish = () => {
    const finishedAt = Date.now();
    setCompletedSummary({
      ...active,
      status: "completed",
      elapsedSeconds: Math.max(
        0,
        Math.round(optionalSessionElapsedSeconds(active, finishedAt)),
      ),
    });
    update((current) => finishOptionalSession(current, finishedAt));
    triggerHaptic("success");
  };
  return (
    <main
      ref={screenRef}
      className="screen optional-session-screen"
      tabIndex="-1"
    >
      <header className="optional-session-header">
        <button aria-label="Back to Today" onClick={() => setPage("today")}>‹</button>
        <div>
          <strong>OPTIONAL SESSION</strong>
          <small>{active.status === "paused" ? "Paused" : "In progress"}</small>
        </div>
        <button className="text-button" onClick={finish}>Finish</button>
      </header>
      <section className="optional-session-body">
        <Eyebrow>OPTIONAL SESSION</Eyebrow>
        <h1>{active.activity}</h1>
        <strong className="optional-session-clock" aria-label={`${Math.floor(elapsed)} seconds elapsed`}>
          {formatDuration(Math.floor(elapsed))}
        </strong>
        <dl className="optional-session-facts">
          <div>
            <dt>Target</dt>
            <dd>{active.duration} min</dd>
          </div>
          {active.kind === "Cardio" && (
            <div>
              <dt>Intensity</dt>
              <dd>{active.intensity}</dd>
            </div>
          )}
        </dl>
        <p className="optional-session-plan-note">
          This optional activity does not replace or complete a strength workout.
        </p>
        <div className="optional-session-actions">
          <Button variant="secondary" onClick={togglePause}>
            {active.status === "paused" ? "RESUME" : "PAUSE"}
          </Button>
          <Button onClick={finish}>FINISH SESSION</Button>
        </div>
        {!confirmCancel ? (
          <button
            type="button"
            className="text-button optional-session-cancel"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel session
          </button>
        ) : (
          <div className="optional-session-cancel-confirm" role="group" aria-label="Cancel optional session">
            <p>Cancel this session? It won’t be logged.</p>
            <div>
              <button type="button" onClick={() => setConfirmCancel(false)}>KEEP SESSION</button>
              <button
                type="button"
                onClick={() => {
                  update((current) => cancelOptionalSession(current));
                  setPage("today");
                }}
              >
                CANCEL SESSION
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
export function Today({
  state,
  update,
  setPage,
  setDetail,
  planReady,
  dismissPlanReady,
}) {
  const active = state.activeWorkout;
  const activeOptional = state.activeOptionalSession;
  const trackedActive = active || activeOptional;
  const startLock = useRef(false);
  const undoTimer = useRef(null);
  const weekGesture = useRef(null);
  const weekMotionTimer = useRef(null);
  const weekMotionFrame = useRef(null);
  const suppressWeekClickUntil = useRef(0);
  const todayReorderGesture = useRef(null);
  const todayEditOrderRef = useRef([]);
  const todayReorderPreviewRef = useRef(null);
  const todayReorderRectsRef = useRef(null);
  const todayReorderAnimationsRef = useRef([]);
  const todayReorderSettleTimer = useRef(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [undoNotice, setUndoNotice] = useState(null);
  const [weekMotion, setWeekMotion] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBackground = useRef(null);
  const [todayEditMode, setTodayEditMode] = useState(false);
  const [todayEditOrder, setTodayEditOrder] = useState([]);
  const [todayDraggingId, setTodayDraggingId] = useState(null);
  const [todayReorderPreview, setTodayReorderPreview] = useState(null);
  const [todayEditAnnouncement, setTodayEditAnnouncement] = useState("");
  useLayoutEffect(() => {
    const previous = todayReorderRectsRef.current;
    todayReorderRectsRef.current = null;
    if (!previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    todayReorderAnimationsRef.current.forEach((animation) => animation.cancel());
    todayReorderAnimationsRef.current = [];
    document.querySelectorAll(".today-exercise-edit-row").forEach((row) => {
      if (row.dataset.entryId === todayReorderGesture.current?.exerciseId) return;
      const before = previous.get(row.dataset.entryId);
      if (!before) return;
      const after = row.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 1) return;
      const animation = row.animate(
        [
          { transform: `translate3d(0, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 190,
          easing: "cubic-bezier(.2, 0, 0, 1)",
        },
      );
      todayReorderAnimationsRef.current.push(animation);
    });
  }, [todayEditOrder]);
  const selectedDate = state.selectedDate
    ? localDate(state.selectedDate)
    : weekDate(state.selectedDay || weekday());
  const [now, setNow] = useState(Date.now());
  const lastCalendarDay = useRef(isoDay());
  useEffect(() => {
    const refreshCalendar = () => {
      const nextDay = isoDay(), previousDay = lastCalendarDay.current;
      lastCalendarDay.current = nextDay;
      setNow(Date.now());
      if (nextDay !== previousDay && state.selectedDate === previousDay) update(current => ({ ...current, selectedDate: nextDay, selectedDay: weekday(nextDay) }));
    };
    const interval = setInterval(refreshCalendar, 30000);
    window.addEventListener('focus', refreshCalendar);
    document.addEventListener('visibilitychange', refreshCalendar);
    return () => { clearInterval(interval); window.removeEventListener('focus', refreshCalendar); document.removeEventListener('visibilitychange', refreshCalendar); };
  }, [state.selectedDate, update]);
  useEffect(() => {
    if (!trackedActive) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id, activeOptional?.id, activeOptional?.status]);
  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(weekMotionTimer.current);
      cancelAnimationFrame(weekMotionFrame.current);
      todayReorderGesture.current?.cleanup?.();
      clearTimeout(todayReorderSettleTimer.current);
      todayReorderAnimationsRef.current.forEach((animation) => animation.cancel());
    },
    [],
  );
  const showUndo = (notice) => {
    clearTimeout(undoTimer.current);
    setUndoNotice(notice);
    undoTimer.current = setTimeout(() => setUndoNotice(null), 5000);
  };
  const undoBanner = undoNotice && (
    <aside className="today-undo" role="status" aria-live="polite">
      <span>{undoNotice.message}</span>
      <button
        type="button"
        onClick={() => {
          undoNotice.undo();
          clearTimeout(undoTimer.current);
          setUndoNotice(null);
          triggerHaptic("tap");
        }}
      >
        UNDO
      </button>
    </aside>
  );
  const selectedIso = isoDay(selectedDate);
  const selectedDay = weekday(selectedDate);
  const viewingToday = selectedIso === isoDay();
  useEffect(() => {
    todayReorderGesture.current?.cleanup?.();
    setTodayEditMode(false);
    setTodayEditOrder([]);
    todayEditOrderRef.current = [];
    todayReorderGesture.current = null;
    setTodayDraggingId(null);
    setTodayReorderPreview(null);
    clearTimeout(todayReorderSettleTimer.current);
  }, [selectedIso]);
  const activeDateKey = active
    ? active.workoutDateKey || isoDay(active.startedAt || new Date())
    : null;
  const selectedActiveWorkout = Boolean(active && selectedIso === activeDateKey);
  const recurringTemplate = plannedWorkoutForDate(state, selectedDate);
  const adaptedTemplate = adaptedTemplateForToday(state, selectedDate);
  const template =
    adaptedTemplate || optionalStrengthForDate(state, selectedDate);
  const todayAdjustment =
    viewingToday &&
    recurringTemplate &&
    state.todayAdaptation?.date === selectedIso &&
    state.todayAdaptation?.programDayId === recurringTemplate.id &&
    state.todayAdaptation?.schemaVersion === 1 &&
    Array.isArray(state.todayAdaptation?.workout?.exercises)
      ? state.todayAdaptation
      : null;
  const trainingSafety = trainingSafetyFor(state.profile);
  const restrictedTemplateConflicts = trainingSafetyBlocks(trainingSafety.status)
    ? []
    : plannedExerciseSafetyConflicts(
        template ? { days: [template] } : null,
        trainingSafety,
      );
  const restrictedTemplateConflict = restrictedTemplateConflicts[0] || null;
  const trainingPaused =
    trainingSafetyBlocks(trainingSafety.status) ||
    Boolean(restrictedTemplateConflict);
  const todaySafety = restrictedTemplateConflict
    ? {
        ...trainingSafety,
        status: "needs_clarification",
        message:
          restrictedTemplateConflict.reason === "effort"
            ? `${restrictedTemplateConflict.exerciseName} is prescribed harder than the current restriction allows. Review it before starting.`
            : `${restrictedTemplateConflict.exerciseName} conflicts with the current restriction. Replace it before starting.`,
      }
    : trainingSafety;
  const selectedMonday = weekDate("Mon", selectedDate);
  const currentMonday = weekDate("Mon");
  const datedWorkouts = state.workouts.filter(
    (workout) => workout.completedAt && workoutPlanDate(workout),
  );
  const dateBounds = calendarRange(state);
  const canGoBack = isoDay(selectedMonday) > dateBounds.min;
  const canGoForward = selectedMonday < weekDate("Mon", dateBounds.max);
  const selectDate = (day, date) => {
    dismissPlanReady?.();
    update((current) => {
      current.selectedDay = day;
      current.selectedDate = isoDay(date);
      return current;
    });
  };
  const moveWeek = (direction) => {
    if ((direction < 0 && !canGoBack) || (direction > 0 && !canGoForward))
      return false;
    const target = new Date(selectedDate);
    target.setDate(target.getDate() + direction * 7);
    selectDate(weekday(target), target);
    clearTimeout(weekMotionTimer.current);
    cancelAnimationFrame(weekMotionFrame.current);
    setWeekMotion("");
    weekMotionFrame.current = requestAnimationFrame(() => {
      setWeekMotion(direction > 0 ? "next" : "previous");
      weekMotionTimer.current = setTimeout(() => setWeekMotion(""), 220);
    });
    triggerHaptic("tap");
    return true;
  };
  const beginWeekGesture = (event) => {
    if (event.button !== 0) return;
    weekGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      intent: null,
    };
  };
  const trackWeekGesture = (event) => {
    const gesture = weekGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    if (!gesture.intent && Math.max(horizontal, vertical) >= 10) {
      gesture.intent =
        horizontal > vertical * 1.35 ? "horizontal" : "vertical";
    }
    if (gesture.intent === "horizontal") event.preventDefault();
  };
  const endWeekGesture = (event) => {
    const gesture = weekGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    weekGesture.current = null;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const distance = Math.abs(deltaX);
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = distance / elapsed;
    const hasHorizontalIntent =
      gesture.intent === "horizontal" ||
      (distance >= 10 && distance > Math.abs(deltaY) * 1.35);
    if (!hasHorizontalIntent) return;

    // A horizontal drag should never also select the day beneath the finger.
    suppressWeekClickUntil.current = performance.now() + 180;
    if (distance >= 44 || (distance >= 24 && velocity >= 0.45)) {
      moveWeek(deltaX < 0 ? 1 : -1);
    }
  };
  const cancelWeekGesture = () => {
    weekGesture.current = null;
  };
  const suppressWeekClick = (event) => {
    if (performance.now() >= suppressWeekClickUntil.current) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const noticeSchedule = planReady
    ? [...currentWeekSchedule(state), ...currentWeekSchedule(state, nextWeek)]
        .filter((item) => item.scheduledDate >= isoDay())
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    : [];
  const workoutToday =
    planReady && Boolean(plannedWorkoutForDate(state, new Date()));
  const calendar = (
    <>
      {calendarOpen && createPortal(<ModalLayer close={()=>setCalendarOpen(false)} backgroundRef={calendarBackground}>{requestClose=><MonthCalendar state={state} selectedDate={selectedIso}
        header={<SheetHeader title="Calendar" onClose={requestClose} closeLabel="Close calendar"/>}
        onSelect={key=>{const date=localDate(key);selectDate(weekday(date),date);requestClose();}}/>}</ModalLayer>,document.body)}
      <div
        className={`week-selector${weekMotion ? ` week-transition-${weekMotion}` : ""}`}
        onClickCapture={suppressWeekClick}
        onPointerDown={beginWeekGesture}
        onPointerMove={trackWeekGesture}
        onPointerUp={endWeekGesture}
        onPointerCancel={cancelWeekGesture}
      >
        <div className="screen-top">
          <WeekNavigation
            date={selectedDate}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            move={moveWeek}
            calendarOpen={calendarOpen}
            openCalendar={event=>{calendarBackground.current=event.currentTarget.closest('.app-shell');setCalendarOpen(true);}}
          />
          <strong className="today-program-name">
            {displayProgramName(state.program)}
          </strong>
        </div>
        <WeekStrip
          state={state}
          referenceDate={selectedDate}
          selectedDate={selectedDate}
          selectDate={selectDate}
        />
      </div>
      {combinedAdjustment(state) && <CombinedWorkoutNotice state={state} update={update} />}
      {flexibleWeekConflict(state) && <aside className="flexible-week-missed"><strong>Review your temporary schedule</strong><small>Your plan changed. Some moved sessions need review.</small><button className="text-button" onClick={() => setDetail({ flexibleWeek: {} })}>REVIEW SCHEDULE</button></aside>}
      {selectedIso === isoDay() && !trackedActive && missedFlexibleSessions(state).length > 0 && <aside className="flexible-week-missed today-missed-row"><div><small>MISSED SESSION</small><strong>{missedFlexibleSessions(state)[0].workout.name} · {displayDate(localDate(missedFlexibleSessions(state)[0].scheduledDate))}</strong></div><button className="text-button" aria-label="Reschedule missed session" onClick={() => setDetail({ flexibleWeek: { sessionId: missedFlexibleSessions(state)[0].logicalSessionId } })}>RESCHEDULE</button></aside>}
      {planReady && (
        <PlanReadyNotice
          workoutToday={workoutToday}
          nextWorkout={noticeSchedule[0]}
          dismiss={dismissPlanReady}
        />
      )}
    </>
  );
  const activeNotice = active && !selectedActiveWorkout && (
    <ActiveWorkoutNotice
      workout={active}
      dateKey={activeDateKey}
      now={now}
      onResume={() => setPage("workout")}
    />
  );
  const dayHeader = label => <div className="today-day-header"><Eyebrow>{label}</Eyebrow><button className="text-button today-overflow-entry" aria-label="Today options" aria-haspopup="dialog" onClick={() => setDetail({ todayActions: {date:selectedIso,hasWorkout:Boolean(plannedWorkoutForDate(state,selectedDate))} })}>•••</button></div>;
  const freestyleEntry = <FreestyleEntry state={state} update={update} setPage={setPage} setDetail={setDetail} date={selectedIso} />;
  const activeOptionalNotice = activeOptional && (
    <ActiveOptionalSessionNotice
      session={activeOptional}
      now={now}
      onResume={() => setPage("optional-session")}
    />
  );
  if (selectedActiveWorkout) {
    const sets = active.exercises.flatMap((exercise) => exercise.sets);
    const completedSets = sets.filter((set) => set.completed).length;
    const elapsed = Math.max(0, now - Number(active.startedAt || now)) / 1000;
    return (
      <main className="screen today-screen">
        {calendar}
        <section className="today-hero active-workout-hero">
          {dayHeader(displayDate(selectedDate))}
          <WorkoutTitle workout={active} day={selectedDay} />
          <p>
            {active.source === 'freestyle' && sets.length === 0
              ? 'No exercises yet'
              : `${completedSets} / ${pluralize(sets.length, active.exercises.every(e=>loggingUnit(e)==='round')?'round':'set')}`} ·{" "}
            {formatActiveWorkoutDuration(elapsed)}
          </p>
          <Button onClick={() => setPage("workout")}>
            RESUME WORKOUT
          </Button>
        </section>
        {active.source !== 'freestyle' && <FreestyleEntry state={state} update={update} setPage={setPage} setDetail={setDetail} date={selectedIso} historyOnly />}
        {active.source === 'freestyle' && active.exercises.length === 0 ? null : <section className="exercise-preview">
          <div className="today-exercise-list-heading">
            <Eyebrow>WORKOUT EXERCISES</Eyebrow>
            {active.source !== 'freestyle' && <button
              type="button"
              className="text-button"
              disabled
              aria-describedby="active-workout-edit-lock"
            >
              Edit exercises
            </button>}
          </div>
          {active.source !== 'freestyle' && <small id="active-workout-edit-lock" className="today-edit-lock-note">
            Finish the active workout to edit exercises.
          </small>}
          {active.exercises.map((exercise, index) => {
            const done = exercise.sets.filter((set) => set.completed).length;
            const current = index === active.exerciseIndex;
            const detail =
              done > 0 || current
                ? `${done} of ${pluralize(exercise.sets.length, loggingUnit(exercise))}${current ? " · current" : ""}`
                : null;
            return (
              <TodayExerciseRow
                key={exercise.id}
                exercise={exercise}
                detail={detail}
                profile={state.profile}
                setDetail={setDetail}
              />
            );
          })}
        </section>
        }
        {active.source === 'freestyle' && <FreestyleEntry state={state} update={update} setPage={setPage} setDetail={setDetail} date={selectedIso} historyOnly />}
        {undoBanner}
      </main>
    );
  }
  const completed = datedWorkouts.find(
    (workout) =>
      workout.source !== 'freestyle' &&
      (workoutPlanDate(workout) === selectedIso || (template?.logicalSessionId && workout.logicalSessionId === template.logicalSessionId)) &&
      (!template ||
        workout.programDayId === template.id ||
        (!workout.programDayId && workout.templateId === template.weekday)),
  );
  const isHistoricalWeek = selectedMonday < currentMonday;
  const movedSource = flexibleSourceForDate(state, selectedIso)[0];
  if (!template && !completed && movedSource) return <main className="screen today-screen">{calendar}{activeNotice}{activeOptionalNotice}<section className="today-hero">{dayHeader(displayDate(selectedDate))}<h1>{movedSource.name}</h1><p>{movedSource.skipped ? 'Skipped this week' : `Moved to ${displayDate(localDate(movedSource.scheduledDate))}`}</p>{!movedSource.skipped && <Button variant="secondary" onClick={() => selectDate(weekday(movedSource.scheduledDate), localDate(movedSource.scheduledDate))}>VIEW DESTINATION</Button>}{freestyleEntry}</section></main>;
  if (!template && !completed) {
    const upcoming = nextScheduledWorkout(state, selectedDate);
    const upcomingTitle = upcoming
      ? workoutDisplayParts(upcoming.workout, upcoming.workout.weekday)
      : null;
    const completedOptional = (state.optionalSessions || []).filter(
      (item) =>
        item.date === selectedIso &&
        item.status === "completed" &&
        ["Cardio", "Mobility"].includes(item.kind),
    );
    const isToday = selectedIso === isoDay();
    return (
      <main className={`screen today-screen${trackedActive ? " viewing-other-workout" : ""}`}>
        {calendar}
        {activeNotice}
        {activeOptionalNotice}
        {isToday && state.program.trainingBlock?.completed && <section className="block-complete-card"><Eyebrow>BLOCK COMPLETE</Eyebrow><strong>{state.program.trainingBlock.name}</strong><p>Review the completed block before choosing what comes next.</p><button className="text-button" onClick={()=>setDetail('block-review')}>REVIEW BLOCK</button></section>}
        <section className="rest-day-state">
          {dayHeader('REST DAY')}
          <h1>Rest day</h1>
          <p>
            {isHistoricalWeek
              ? "No workout was planned on this date."
              : "This is a planned recovery day."}
          </p>
          <FreestyleEntry state={state} update={update} setPage={setPage} setDetail={setDetail} date={selectedIso}
            historyOnly={completedWorkoutsForDate(state.workouts, selectedIso).length > 0} />
          {upcoming && (
            <div className="rest-up-next">
              <Eyebrow>UP NEXT</Eyebrow>
              <time dateTime={upcoming.scheduledDate}>
                {displayDate(localDate(upcoming.scheduledDate))}
              </time>
              <h2>{upcomingTitle.primary}</h2>
              {upcomingTitle.detail && (
                <small className="rest-up-next-descriptor">
                  {upcomingTitle.detail}
                </small>
              )}
              <span>
                {pluralize(upcoming.workout.exercises.length, "exercise")} · ~
                {roundedEstimate(upcoming.workout.estimatedMinutes)} min
              </span>
              <Button
                className="rest-view-workout"
                variant="secondary"
                onClick={() =>
                  selectDate(
                    weekday(upcoming.scheduledDate),
                    localDate(upcoming.scheduledDate),
                  )
                }
              >
                VIEW WORKOUT
              </Button>
            </div>
          )}
          {isToday && !trackedActive && (
            <button
              className="text-button train-anyway"
              onClick={() => setDetail({ restTraining: selectedIso })}
            >
              Train today instead
            </button>
          )}
          {completedOptional.length > 0 && (
            <div className="optional-session-history" aria-label="Completed optional activities">
              {completedOptional.map((optional) => (
                <div className="optional-session-note" key={optional.id}>
                  <strong>✓ {optional.activity} completed</strong>
                  <small>
                    {formatDuration(Math.max(0, Number(optional.elapsedSeconds) || 0))}
                    {optional.kind === "Cardio" ? ` · ${optional.intensity}` : ""}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
        {undoBanner}
      </main>
    );
  }
  const session = completed || template;
  const blockPhaseLabel = (session.trainingBlock?.label || (session.trainingBlock?.plannedDeload ? "Planned deload" : "")).trim();
  const editableTodayWorkout = Boolean(
    !completed &&
      !isHistoricalWeek &&
      !trackedActive &&
      recurringTemplate &&
      session.exercises.every((exercise) =>
        recurringTemplate.exercises.some((entry) => entry.id === exercise.id),
      ),
  );
  const todayEditLocked = Boolean(
    !completed && !isHistoricalWeek && trackedActive && recurringTemplate,
  );
  const sessionExerciseMap = new Map(
    session.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const effectiveTodayEditOrder = [
    ...todayEditOrder.filter((entryId) => sessionExerciseMap.has(entryId)),
    ...session.exercises
      .map((exercise) => exercise.id)
      .filter((entryId) => !todayEditOrder.includes(entryId)),
  ];
  const displayedExercises = todayEditMode
    ? effectiveTodayEditOrder.map((entryId) => sessionExerciseMap.get(entryId))
    : session.exercises;
  const actionForExercise = (exercise) =>
    editableTodayWorkout &&
    recurringTemplate.exercises.some((entry) => entry.id === exercise.id)
      ? {
          planDate: selectedIso,
          workoutId: recurringTemplate.id,
          planEntryId: exercise.id,
          onApplied: (notice) => {
            const orderBeforeRemoval = [...effectiveTodayEditOrder];
            showUndo({
              ...notice,
              undo: () => {
                notice.undo();
                todayEditOrderRef.current = orderBeforeRemoval;
                setTodayEditOrder(orderBeforeRemoval);
              },
            });
          },
        }
      : null;
  const openTodayExerciseRemoval = (exercise) => {
    const actions = actionForExercise(exercise);
    if (!actions) return;
    setDetail({ todayExerciseActions: { ...actions, exercise } });
  };
  const commitTodayExerciseOrder = (
    nextOrder,
    previousOverride,
    previousOrder,
  ) => {
    if (!editableTodayWorkout) return;
    runRookViewTransition(() =>
      update((current) =>
        reorderExercisesForOccurrence(current, {
          planDate: selectedIso,
          workoutId: recurringTemplate.id,
          orderedEntryIds: nextOrder,
        }),
      ),
    );
    showUndo({
      message: `${recurringTemplate.name} order updated`,
      undo: () =>
        runRookViewTransition(() => {
          update((current) =>
            restoreOccurrenceOverride(current, {
              planDate: selectedIso,
              workoutId: recurringTemplate.id,
              previousOverride,
            }),
          );
          todayEditOrderRef.current = previousOrder;
          setTodayEditOrder(previousOrder);
        }),
    });
  };
  const reorderTodayExercise = (exerciseId, direction) => {
    const orderedExercises = effectiveTodayEditOrder.map((entryId) =>
      sessionExerciseMap.get(entryId),
    );
    const blocks = buildExerciseReorderBlocks(orderedExercises);
    const sourceIndex = blocks.findIndex((block) =>
      block.exercises.some((exercise) => exercise.id === exerciseId),
    );
    const targetIndex = sourceIndex + direction;
    if (
      sourceIndex < 0 ||
      blocks[sourceIndex].locked ||
      targetIndex < 0 ||
      targetIndex >= blocks.length
    )
      return;
    const moved = moveExerciseReorderBlock(
      orderedExercises,
      exerciseId,
      targetIndex,
    );
    if (moved === orderedExercises) return;
    const nextOrder = moved.map((exercise) => exercise.id);
    const previousOverride = clone(
      state.workoutOccurrenceOverrides?.[selectedIso]?.[recurringTemplate.id] ||
        null,
    );
    todayEditOrderRef.current = nextOrder;
    setTodayEditOrder(nextOrder);
    setTodayEditAnnouncement(
      `${exerciseName(sessionExerciseMap.get(exerciseId))} moved ${direction < 0 ? "earlier" : "later"}.`,
    );
    commitTodayExerciseOrder(
      nextOrder,
      previousOverride,
      effectiveTodayEditOrder,
    );
  };
  const captureTodayReorderRects = () => {
    todayReorderRectsRef.current = new Map(
      [...document.querySelectorAll(".today-exercise-edit-row")].map((row) => [
        row.dataset.entryId,
        row.getBoundingClientRect(),
      ]),
    );
  };
  const todayReorderScroller = (element) => {
    let current = element?.parentElement;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        current.scrollHeight > current.clientHeight
      )
        return current;
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const startTodayExerciseDrag = (event, exerciseId) => {
    if (!editableTodayWorkout || event.button !== 0) return;
    const orderedExercises = effectiveTodayEditOrder.map((entryId) =>
      sessionExerciseMap.get(entryId),
    );
    const sourceBlock = buildExerciseReorderBlocks(orderedExercises).find(
      (block) => block.exercises.some((exercise) => exercise.id === exerciseId),
    );
    if (!sourceBlock || sourceBlock.locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const sourceRow = event.currentTarget.closest(".today-exercise-edit-row");
    const sourceBounds = sourceRow?.getBoundingClientRect();
    if (!sourceBounds) return;
    const scroller = todayReorderScroller(sourceRow);
    todayEditOrderRef.current = effectiveTodayEditOrder;
    const finishAtWindow = (pointerEvent) =>
      finishTodayExerciseDrag(pointerEvent);
    const cancelAtWindow = (pointerEvent) =>
      finishTodayExerciseDrag(pointerEvent, true);
    const moveAtWindow = (pointerEvent) => moveTodayExerciseDrag(pointerEvent);
    window.addEventListener("pointermove", moveAtWindow, { passive: false });
    window.addEventListener("pointerup", finishAtWindow);
    window.addEventListener("pointercancel", cancelAtWindow);
    todayReorderGesture.current = {
      pointerId: event.pointerId,
      exerciseId,
      originalOrder: effectiveTodayEditOrder,
      previousOverride: clone(
        state.workoutOccurrenceOverrides?.[selectedIso]?.[recurringTemplate.id] ||
          null,
      ),
      clientY: event.clientY,
      startY: event.clientY,
      sourceTop: sourceBounds.top,
      sourceHeight: sourceBounds.height,
      scroller,
      scrollTopAtStart: scroller.scrollTop,
      frameTime: performance.now(),
      moved: false,
      cleanup: () => {
        window.removeEventListener("pointermove", moveAtWindow);
        window.removeEventListener("pointerup", finishAtWindow);
        window.removeEventListener("pointercancel", cancelAtWindow);
        cancelAnimationFrame(todayReorderGesture.current?.autoScrollFrame);
      },
    };
    setTodayDraggingId(exerciseId);
    setTodayReorderPreview({
      exerciseId,
      label: exerciseName(sessionExerciseMap.get(exerciseId)),
      target: targetLabel(
        sessionExerciseMap.get(exerciseId),
        state.profile.rirEnabled,
      ),
      left: sourceBounds.left,
      top: sourceBounds.top,
      width: sourceBounds.width,
      height: sourceBounds.height,
    });
    triggerHaptic("tap");
    todayReorderGesture.current.autoScrollFrame = requestAnimationFrame(
      runTodayExerciseAutoScroll,
    );
  };
  const updateTodayExerciseDrag = (clientY) => {
    const gesture = todayReorderGesture.current;
    if (!gesture) return;
    gesture.clientY = clientY;
    moveReorderPreview(todayReorderPreviewRef.current, "--today-reorder-y", clientY - gesture.startY);
    const scrollDelta = gesture.scroller.scrollTop - gesture.scrollTopAtStart;
    const originalPointerY = gesture.startY - scrollDelta;
    if (
      gesture.moved &&
      Math.abs(clientY - originalPointerY) <= gesture.sourceHeight / 2
    ) {
      const currentOrder = todayEditOrderRef.current;
      const differsFromOriginal =
        currentOrder.length !== gesture.originalOrder.length ||
        currentOrder.some(
          (entryId, index) => entryId !== gesture.originalOrder[index],
        );
      if (differsFromOriginal) {
        captureTodayReorderRects();
        todayEditOrderRef.current = gesture.originalOrder;
        setTodayEditOrder(gesture.originalOrder);
      }
      return;
    }
    const rows = [...document.querySelectorAll(".today-exercise-edit-row")];
    const targetRow = rows.find((row) => {
      const bounds = row.getBoundingClientRect();
      return clientY >= bounds.top && clientY <= bounds.bottom;
    });
    if (!targetRow) return;
    const targetId = targetRow.dataset.entryId;
    const orderedExercises = todayEditOrderRef.current
      .map((entryId) => sessionExerciseMap.get(entryId))
      .filter(Boolean);
    const blocks = buildExerciseReorderBlocks(orderedExercises);
    const sourceIndex = blocks.findIndex((block) =>
      block.exercises.some((exercise) => exercise.id === gesture.exerciseId),
    );
    const targetIndex = blocks.findIndex((block) =>
      block.exercises.some((exercise) => exercise.id === targetId),
    );
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const targetBounds = targetRow.getBoundingClientRect();
    let destination = targetIndex + (clientY > targetBounds.top + targetBounds.height / 2 ? 1 : 0);
    if (sourceIndex < destination) destination -= 1;
    const moved = moveExerciseReorderBlock(
      orderedExercises,
      gesture.exerciseId,
      destination,
    );
    if (moved === orderedExercises) return;
    const nextOrder = moved.map((exercise) => exercise.id);
    if (nextOrder.join('|') === todayEditOrderRef.current.join('|')) return;
    gesture.moved = true;
    captureTodayReorderRects();
    todayEditOrderRef.current = nextOrder;
    setTodayEditOrder(nextOrder);
  };
  const moveTodayExerciseDrag = (event) => {
    const gesture = todayReorderGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateTodayExerciseDrag(event.clientY);
  };
  const runTodayExerciseAutoScroll = (time) => {
    const gesture = todayReorderGesture.current;
    if (!gesture) return;
    const scroller = gesture.scroller;
    const viewport = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect();
    const zone = 64;
    let direction = 0;
    let depth = 0;
    if (gesture.clientY < viewport.top + zone) {
      direction = -1;
      depth = (viewport.top + zone - gesture.clientY) / zone;
    } else if (gesture.clientY > viewport.bottom - zone - 72) {
      direction = 1;
      depth = (gesture.clientY - (viewport.bottom - zone - 72)) / zone;
    }
    const elapsed = Math.min(32, time - (gesture.frameTime || time));
    gesture.frameTime = time;
    if (direction) {
      const before = scroller.scrollTop;
      scroller.scrollTop +=
        direction * (160 + 620 * Math.min(1, depth)) * elapsed / 1000;
      if (scroller.scrollTop !== before)
        updateTodayExerciseDrag(gesture.clientY);
    }
    gesture.autoScrollFrame = requestAnimationFrame(runTodayExerciseAutoScroll);
  };
  const finishTodayExerciseDrag = (event, cancelled = false) => {
    const gesture = todayReorderGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.cleanup?.();
    todayReorderGesture.current = null;
    const finalOrder = todayEditOrderRef.current;
    const hasNetOrderChange =
      finalOrder.length !== gesture.originalOrder.length ||
      finalOrder.some((entryId, index) => entryId !== gesture.originalOrder[index]);
    if (cancelled || !gesture.moved || !hasNetOrderChange) {
      if (cancelled) {
        captureTodayReorderRects();
        todayEditOrderRef.current = gesture.originalOrder;
        setTodayEditOrder(gesture.originalOrder);
      }
      setTodayDraggingId(null);
      setTodayReorderPreview(null);
      return;
    }
    const nextOrder = finalOrder;
    setTodayEditAnnouncement(
      `${exerciseName(sessionExerciseMap.get(gesture.exerciseId))} reordered.`,
    );
    commitTodayExerciseOrder(
      nextOrder,
      gesture.previousOverride,
      gesture.originalOrder,
    );
    triggerHaptic("tap");
    const finishSettle = () => {
      setTodayDraggingId(null);
      setTodayReorderPreview(null);
    };
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const finalRow = [...document.querySelectorAll(".today-exercise-edit-row")]
      .find((row) => row.dataset.entryId === gesture.exerciseId);
    const preview = todayReorderPreviewRef.current;
    if (reducedMotion || !finalRow || !preview) {
      finishSettle();
      return;
    }
    const finalBounds = finalRow.getBoundingClientRect();
    preview.classList.add("is-settling");
    preview.style.setProperty(
      "--today-reorder-y",
      `${finalBounds.top - gesture.sourceTop}px`,
    );
    todayReorderSettleTimer.current = setTimeout(finishSettle, 190);
  };
  const prior = template
    ? [...datedWorkouts]
        .reverse()
        .find(
          (workout) =>
            workoutPlanDate(workout) < selectedIso &&
            (workout.programDayId === template.id ||
              workout.templateId === template.weekday),
        )
    : null;
  const historyBeforeSelectedDate = datedWorkouts.filter(
    (workout) => workoutPlanDate(workout) < selectedIso,
  );
  const exerciseHistory = new Map(
    session.exercises.map((exercise) => [
      exercise.exerciseId,
      previousExercise(historyBeforeSelectedDate, exercise.exerciseId),
    ]),
  );
  const isFirstSession =
    !completed && !prior && ![...exerciseHistory.values()].some(Boolean);
  const start = () => {
    if (trainingPaused) {
      setDetail(
        restrictedTemplateConflict
          ? {
              editPlan: {
                reviewExerciseIds: restrictedTemplateConflicts.map(item => item.exerciseEntryId),
              },
            }
          : "training-restrictions",
      );
      return;
    }
    if (startLock.current) return;
    startLock.current = true;
    setStarting(true);
    setStartError("");
    triggerHaptic("tap");
    try {
      dismissPlanReady?.();
      if (state.workouts.length === 0)
        trackFunnelEventOnce("first_workout_started", {
          source: template.optionalSessionId ? "optional" : "plan",
          exerciseCount: template.exercises.length,
        });
      if (isCombinedAdjustment(template.todayOnlyAdjustment)) {
        const next = structuredClone(state);
        next.activeWorkout = startWorkout(state, template);
        next.todayAdaptation = null;
        persistCombinedState(state, next, saveState);
        update(() => next, {planVersion:false, persistedState:next});
      } else update((current) => {
        current.activeWorkout = startWorkout(current, template);
        if (template.adapted) current.todayAdaptation = null;
        return current;
      });
      setPage("workout");
    } catch (error) {
      startLock.current = false;
      setStarting(false);
      setStartError("Couldn’t start this workout. Please try again.");
      console.error("Unable to start workout", error);
    }
  };
  const duration = completed?.durationSeconds
    ? `${Math.max(1, Math.round(completed.durationSeconds / 60))} min logged`
    : `~${roundedEstimate(template.estimatedMinutes)} min`;
  return (
    <main className={`screen today-screen${trackedActive ? " viewing-other-workout" : ""}`}>
      {calendar}
      {activeNotice}
      {activeOptionalNotice}
      {viewingToday && state.program.trainingBlock?.completed && (
        <section className="block-complete-card">
          <Eyebrow>BLOCK COMPLETE</Eyebrow>
          <strong>{state.program.trainingBlock.name}</strong>
          <p>Review the completed block before choosing what comes next.</p>
          <button className="text-button" onClick={() => setDetail("block-review")}>
            REVIEW BLOCK
          </button>
        </section>
      )}
      <section className="today-hero">
        {dayHeader(displayDate(selectedDate))}
        <WorkoutTitle workout={session} day={selectedDay} />
        <CombinedProvenance adjustment={session.adjustment || session.todayOnlyAdjustment} />
        {session.flexibleWeekMoved && <small className="flexible-week-origin">Moved from {displayDate(localDate(session.originalScheduledDate))}</small>}
        {session.trainingBlock && (
          <button type="button" onClick={() => setDetail("training-block")} aria-label="View training block" className={`today-block-week${session.trainingBlock.plannedDeload ? " is-deload" : ""}`}>
            <strong>Week {session.trainingBlock.blockWeekNumber} of {session.trainingBlock.totalWeeks}</strong>
            {blockPhaseLabel ? (
              <span className="today-block-phase"> · {blockPhaseLabel.replace(/\S+$/u, "")}<span className="today-block-phase-end">{blockPhaseLabel.match(/\S+$/u)?.[0]}<span className="today-block-chevron" aria-hidden="true">›</span></span></span>
            ) : <span className="today-block-chevron" aria-hidden="true">›</span>}
          </button>
        )}
        <p>
          {session.exercises.length} exercises · {duration}
          {completed
            ? " · completed"
            : isHistoricalWeek
              ? " · not logged"
              : prior
                ? ` · last done ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(localDate(workoutPlanDate(prior)))}`
                : isFirstSession
                  ? " · first session"
                  : ""}
        </p>
        {!completed && !isHistoricalWeek && trainingPaused && (
          <TrainingSafetySummary safety={todaySafety} />
        )}
        {completed ? (
          <Button
            variant="secondary"
            onClick={() => setDetail({ completedWorkout: completed.id })}
          >
            WORKOUT COMPLETE · VIEW HISTORY
          </Button>
        ) : isHistoricalWeek ? (
          <Button variant="secondary" disabled>
            WORKOUT NOT LOGGED
          </Button>
        ) : trackedActive ? (
          <p id="other-active-workout-edit-lock" className="active-workout-start-lock">
            Finish the active session before starting this workout.
          </p>
        ) : trainingPaused ? (
          <Button
            variant={restrictedTemplateConflict ? "primary" : "secondary"}
            onClick={() =>
              setDetail(
                restrictedTemplateConflict
                  ? {
                      editPlan: {
                        reviewExerciseIds: restrictedTemplateConflicts.map(item => item.exerciseEntryId),
                      },
                    }
                  : "training-restrictions",
              )
            }
          >
            {restrictedTemplateConflict ? restrictedTemplateConflicts.length > 1 ? `REVIEW ${restrictedTemplateConflicts.length} CONFLICTS` : "REVIEW CONFLICT" : "REVIEW RESTRICTIONS"}
          </Button>
        ) : (
          <div
            className={`today-start-region${todayEditMode ? " is-hidden" : ""}`}
            aria-hidden={todayEditMode || undefined}
            inert={todayEditMode ? true : undefined}
          >
            <div>
              <Button
                className="today-start-button"
                onClick={start}
                disabled={starting || todayEditMode}
                aria-busy={starting}
              >
                <span aria-live="polite">
                  {starting ? "STARTING…" : "START WORKOUT"}
                </span>
              </Button>
              {viewingToday && recurringTemplate && !todayEditMode && (
                <div className="today-adjust-actions">
                  {todayAdjustment ? (
                    <>
                      <small>Today only · Adjusted for today</small>
                      <span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setDetail({ adjustToday: { view: "review" } })
                          }
                        >
                          Review adjustment
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setDetail({ adjustToday: { view: "restore" } })
                          }
                        >
                          Restore original
                        </button>
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button today-adjust-entry"
                      onClick={() => setDetail({ adjustToday: { view: "mode" } })}
                    >
                      ADJUST TODAY
                    </button>
                  )}
                </div>
              )}
              {startError && (
                <p className="today-start-error" role="alert">
                  {startError}
                </p>
              )}
            </div>
          </div>
        )}
        <FreestyleEntry state={state} update={update} setPage={setPage} setDetail={setDetail} date={selectedIso} historyOnly representedWorkoutId={completed?.id} />
      </section>
      <section className={`exercise-preview${todayEditMode ? " is-editing" : ""}`}>
        <div className="today-exercise-edit-header">
          <div className="today-exercise-list-heading">
            <Eyebrow>
              {todayEditMode
                ? "EDIT EXERCISES"
                : completed
                  ? "WORKOUT EXERCISES"
                  : viewingToday
                    ? "TODAY'S EXERCISES"
                    : "WORKOUT EXERCISES"}
            </Eyebrow>
            {(editableTodayWorkout || todayEditLocked) && (
              <button
                type="button"
                className="text-button today-exercise-edit-toggle"
                aria-label={todayEditMode ? "Done" : "Edit exercises"}
                aria-pressed={todayEditMode}
                aria-describedby={todayEditLocked ? "other-active-workout-edit-lock" : undefined}
                disabled={todayEditLocked}
                onClick={() => {
                  if (todayEditMode) {
                    todayReorderGesture.current?.cleanup?.();
                    setTodayEditMode(false);
                    setTodayDraggingId(null);
                    setTodayReorderPreview(null);
                    todayReorderGesture.current = null;
                    return;
                  }
                  const order = session.exercises.map((exercise) => exercise.id);
                  todayEditOrderRef.current = order;
                  setTodayEditOrder(order);
                  setTodayEditMode(true);
                  setTodayEditAnnouncement("Workout edit mode on. Changes save automatically.");
                }}
              >
                {!todayEditMode && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m16 3 5 5L8 21H3v-5L16 3Z M13 6l5 5" /></svg>}
                {todayEditMode ? "Done" : "Edit"}
              </button>
            )}
          </div>
          {todayEditMode && (
            <small className="today-edit-help">
              Drag to reorder. Tap × to remove.
            </small>
          )}
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">
          {todayEditAnnouncement}
        </span>
        {displayedExercises.map((exercise) => {
          const previous = exerciseHistory.get(exercise.exerciseId);
          const completedSets = exercise.sets.filter(
            (set) => set.completed,
          ).length;
          const previousSets =
            previous?.sets.filter((set) => set.completed) || [];
          const weightedSet = previousSets.find(
            (set) => set.weight !== null && set.weight !== undefined,
          );
          const load = weightedSet
            ? `${displayWeight(weightedSet.weight, state.profile.units)} ${weightUnit(state.profile.units)}`
            : previous && exerciseCatalog[exercise.exerciseId]?.bodyweight
              ? "Bodyweight"
              : null;
          const previousResult = previous
            ? `Last: ${load ? `${load} · ` : ""}${previousSets.map((set) => set.reps).join(" / ")}`
            : null;
          const detail = completed
            ? `${completedSets} sets logged`
            : isHistoricalWeek
              ? "Not logged"
              : previousResult || (!isFirstSession ? "First session" : null);
          return (
            <TodayExerciseRow
              key={exercise.id}
              exercise={exercise}
              detail={detail}
              profile={state.profile}
              setDetail={setDetail}
              actions={actionForExercise(exercise)}
              editing={todayEditMode}
              dragging={todayDraggingId === exercise.id}
              onRemove={openTodayExerciseRemoval}
              onMove={reorderTodayExercise}
              onDragStart={startTodayExerciseDrag}
            />
          );
        })}
        {todayReorderPreview && (
          <div
            ref={todayReorderPreviewRef}
            className="today-reorder-preview"
            aria-hidden="true"
            style={{
              left: `${todayReorderPreview.left}px`,
              top: `${todayReorderPreview.top}px`,
              width: `${todayReorderPreview.width}px`,
              minHeight: `${todayReorderPreview.height}px`,
            }}
          >
            <i aria-hidden="true" />
            <strong>{todayReorderPreview.label}</strong>
            <small>{todayReorderPreview.target}</small>
          </div>
        )}
      </section>
      {undoBanner}
    </main>
  );
}

export function normalizeStepperValue(raw, { min = 0, integer = false } = {}) {
  if (raw === "") return null;
  const numeric = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, integer ? Math.trunc(numeric) : numeric);
}
export function validStepperDraft(raw, { integer = false } = {}) {
  const value = String(raw);
  return integer ? /^\d*$/.test(value) : /^\d*(?:[.,]\d*)?$/.test(value);
}
export function alignedStepperValue(value, step, direction, min = 0) {
  const numeric = Number(value);
  const increment = Number(step);
  if (!Number.isFinite(numeric) || !(increment > 0)) return numeric;
  const decimalPlaces = (input) => {
    const text = String(input).toLowerCase();
    if (text.includes("e-")) {
      const [coefficient, exponent] = text.split("e-");
      return Number(exponent) + (coefficient.split(".")[1]?.length || 0);
    }
    return text.split(".")[1]?.length || 0;
  };
  const precision = Math.min(
    6,
    Math.max(decimalPlaces(numeric), decimalPlaces(increment), decimalPlaces(min)),
  );
  const scale = 10 ** precision;
  const valueUnits = Math.round(numeric * scale);
  const stepUnits = Math.max(1, Math.round(increment * scale));
  const minimumUnits = Math.round(Number(min) * scale);
  const remainder = ((valueUnits % stepUnits) + stepUnits) % stepUnits;
  const nextUnits =
    direction > 0
      ? valueUnits + (remainder === 0 ? stepUnits : stepUnits - remainder)
      : valueUnits - (remainder === 0 ? stepUnits : remainder);
  return Number((Math.max(minimumUnits, nextUnits) / scale).toFixed(precision));
}
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  disabled,
  emptyLabel,
  integer = false,
  alignToStep = false,
  allowIncrementFromEmpty = false,
}) {
  const [draft, setDraft] = useState(null);
  const numeric = Number(value || 0);
  const shownValue = draft ?? value ?? "";
  const empty = shownValue === "";
  const shownNumeric = normalizeStepperValue(shownValue, { min, integer });
  const commit = (raw) => {
    const next = normalizeStepperValue(raw, { min, integer });
    if (next !== undefined) onChange(next);
  };
  return (
    <div className={`stepper ${empty ? "unset" : ""}`}>
      <button
        aria-label={`Decrease ${label}`}
        disabled={disabled || empty}
        onClick={() =>
          onChange(
            alignToStep
              ? alignedStepperValue(numeric, step, -1, min)
              : Math.max(min, Number((numeric - step).toFixed(2))),
          )
        }
      >
        −
      </button>
      <input
        aria-label={label}
        role="spinbutton"
        aria-valuemin={min}
        aria-valuenow={
          typeof shownNumeric === "number" ? shownNumeric : undefined
        }
        aria-valuetext={empty ? (emptyLabel === 'Bodyweight' ? 'Bodyweight' : undefined) : String(shownValue)}
        placeholder={emptyLabel === 'Bodyweight' ? undefined : emptyLabel}
        inputMode={integer ? "numeric" : "decimal"}
        type="text"
        value={shownValue}
        disabled={disabled}
        onFocus={() => setDraft(String(value ?? ""))}
        onChange={(event) => {
          const nextDraft = event.target.value;
          if (!validStepperDraft(nextDraft, { integer })) return;
          setDraft(nextDraft);
          commit(nextDraft);
        }}
        onBlur={() => {
          if (draft !== null) commit(draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {empty && emptyLabel && draft === null && <span className="stepper-empty-label" aria-hidden="true">{emptyLabel}</span>}
      <button
        aria-label={`Increase ${label}`}
        disabled={disabled || (empty && !allowIncrementFromEmpty)}
        onClick={() =>
          onChange(
            empty
              ? Math.max(min, Number(step))
              : alignToStep
                ? alignedStepperValue(numeric, step, 1, min)
                : Number((numeric + step).toFixed(2)),
          )
        }
      >
        +
      </button>
    </div>
  );
}
function WorkoutConfirmation({ confirmation, cancel, continueAction, error }) {
  const sheetRef = useRef(null);
  if (!confirmation) return null;
  const next = confirmation.type === "next";
  const setLabel = pluralize(confirmation.incomplete, "set");
  return (
    <div
      className="workout-confirm-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workout-confirm-title"
      aria-describedby="workout-confirm-detail"
    >
      <div ref={sheetRef} className="workout-confirm drag-anywhere">
        <header className="sheet-header-chrome">
          <SheetDragHandle sheetRef={sheetRef} close={cancel} dragAnywhere />
        </header>
        <Eyebrow>{next ? "INCOMPLETE EXERCISE" : "END SESSION"}</Eyebrow>
        <h2 id="workout-confirm-title">
          {next
            ? `${setLabel} ${confirmation.incomplete === 1 ? "is" : "are"} still incomplete.`
            : "Finish workout early?"}
        </h2>
        <p id="workout-confirm-detail">
          {next
            ? `${confirmation.incomplete === 1 ? "The incomplete set won't" : "Incomplete sets won't"} be logged if you continue.`
            : `${confirmation.completed} of ${pluralize(confirmation.planned, "set")} ${confirmation.completed === 1 ? "is" : "are"} complete. Only completed sets will be logged; incomplete set entries won’t count.`}
        </p>
        {confirmation.combined && <p>Both source sessions will become available again. Only your actual completed sets are saved.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="workout-confirm-actions">
          <Button onClick={cancel}>
            {next ? "RETURN TO EXERCISE" : "KEEP TRAINING"}
          </Button>
          <Button variant="secondary" onClick={continueAction}>
            {next
              ? `SKIP INCOMPLETE ${confirmation.incomplete === 1 ? "SET" : "SETS"}`
              : "FINISH ANYWAY"}
          </Button>
        </div>
      </div>
    </div>
  );
}
function ActiveWorkout({ state, update, setPage, setDetail, onLiveFinish }) {
  const active = state.activeWorkout;
  const [now, setNow] = useState(Date.now());
  const [confirmation, setConfirmation] = useState(null);
  const [combinedSaveError, setCombinedSaveError] = useState('');
  const [exerciseTransitioning, setExerciseTransitioning] = useState(false);
  const [exerciseCompleting, setExerciseCompleting] = useState(false);
  const [exerciseNavigationAnnouncement, setExerciseNavigationAnnouncement] =
    useState("");
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [dismissingWarmup, setDismissingWarmup] = useState(null);
  const [recentlyCompletedSetId, setRecentlyCompletedSetId] = useState(null);
  const [restCompleteVisible, setRestCompleteVisible] = useState(false);
  const screenRef = useRef(null);
  const exerciseHeadingRef = useRef(null);
  const workoutActionLockRef = useRef(false);
  const workoutActionUnlockTimerRef = useRef(null);
  const completionFeedbackTimerRef = useRef(null);
  const restCompleteTimerRef = useRef(null);
  const handledRestCompletionRef = useRef(null);
  const warmupDismissTimerRef = useRef(null);
  const warmupDismissLockRef = useRef(false);
  const latestCompletedSet = active?.exercises
    ?.flatMap((entry) => entry.sets)
    .filter((set) => Number(set.completedAt) > 0)
    .sort((a, b) => Number(b.completedAt) - Number(a.completedAt))[0];
  const latestCompletedAt = Number(latestCompletedSet?.completedAt || 0);
  const seenCompletionRef = useRef(latestCompletedAt);
  const restLeft =
    state.profile.restTimerEnabled && Number.isFinite(active?.rest?.endsAt)
      ? Math.max(0, Math.ceil((active.rest.endsAt - now) / 1000))
      : 0;
  const restReady =
    state.profile.restTimerEnabled && active?.rest?.pending === true;
  useEffect(() => {
    const syncNow = () => setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("pageshow", syncNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("pageshow", syncNow);
    };
  }, []);
  useEffect(() => {
    if (latestCompletedAt > seenCompletionRef.current) {
      seenCompletionRef.current = latestCompletedAt;
      setRecentlyCompletedSetId(latestCompletedSet.id);
      triggerHaptic("success");
      clearTimeout(completionFeedbackTimerRef.current);
      completionFeedbackTimerRef.current = setTimeout(
        () => setRecentlyCompletedSetId(null),
        260,
      );
    }
  }, [latestCompletedAt, latestCompletedSet?.id]);
  useEffect(() => {
    if (restLeft > 0) {
      setRestCompleteVisible(false);
      clearTimeout(restCompleteTimerRef.current);
      return;
    }
    if (
      shouldHandleRestCompletion({
        rest: active?.rest,
        now,
        handledKey: handledRestCompletionRef.current,
      })
    ) {
      const capability = restNotificationCapability(window);
      const hidden = document.visibilityState !== "visible";
      handledRestCompletionRef.current = `rest:${Number(active.rest.endsAt)}`;
      setRestCompleteVisible(true);
      if (!hidden) triggerHaptic("complete");
      if (
        shouldShowBackgroundRestNotification({
          rest: active.rest,
          now,
          enabled: state.profile.restTimerNotificationsEnabled === true,
          permission: capability.permission,
          hidden,
        })
      ) {
        update((current) => {
          if (
            current.activeWorkout?.rest?.endsAt === active.rest.endsAt &&
            !Number.isFinite(Number(current.activeWorkout.rest.notificationAttemptedAt))
          ) {
            current.activeWorkout.rest.notificationAttemptedAt = now;
            current.activeWorkout.updatedAt = now;
          }
          return current;
        });
        void showRestCompleteNotification(window);
      }
      clearTimeout(restCompleteTimerRef.current);
      restCompleteTimerRef.current = setTimeout(
        () => setRestCompleteVisible(false),
        1400,
      );
    }
  }, [restLeft, active?.rest?.endsAt, active?.rest?.notificationAttemptedAt, now, state.profile.restTimerNotificationsEnabled, update]);
  useEffect(
    () => () => {
      clearTimeout(completionFeedbackTimerRef.current);
      clearTimeout(restCompleteTimerRef.current);
      clearTimeout(warmupDismissTimerRef.current);
      clearTimeout(workoutActionUnlockTimerRef.current);
    },
    [],
  );
  useEffect(
    () => {
      setWarmupOpen(false);
      setDismissingWarmup(null);
      warmupDismissLockRef.current = false;
      clearTimeout(warmupDismissTimerRef.current);
    },
    [active?.id, active?.exerciseIndex],
  );
  const currentExercise = active?.exercises?.[active.exerciseIndex] || null;
  const activeArtwork = useAvailableImage(state.profile.showExerciseImages !== false ? exerciseArt(currentExercise) : null);
  const upcomingExercise = active?.exercises?.[active.exerciseIndex + 1] || null;
  useEffect(() => {
    if (state.profile.showExerciseImages === false) return;
    preloadExerciseArt(currentExercise, "high");
    preloadExerciseArt(upcomingExercise, "low");
  }, [
    currentExercise,
    upcomingExercise,
    state.profile.showExerciseImages,
  ]);
  if (!active)
    return (
      <main className="screen">
        <Empty
          title="No active workout"
          body="Start a planned session from Today."
          action={<Button onClick={() => setPage("today")}>GO TO TODAY</Button>}
        />
      </main>
    );
  const exercise = currentExercise;
  if (active.source === 'freestyle' && !exercise) return <main className="screen workout-screen freestyle-workout">
    <header className="workout-header"><button aria-label="Back to Today" onClick={() => setPage('today')}>‹</button><div className="workout-header-center"><strong>Freestyle workout</strong><small>{formatWorkoutElapsedDuration(Math.floor((now - active.startedAt) / 1000))}</small></div><span className="workout-header-actions"><button className="text-button" disabled>Finish</button></span></header>
    <section className="freestyle-empty"><h1>No exercises yet</h1><p>Add the first exercise when you’re ready. Your plan won’t change.</p><FreestyleActions state={state} update={update} setDetail={setDetail} setPage={setPage} empty /></section>
  </main>;
  const exerciseIllustration = activeArtwork.source;
  const superset = supersetMeta(active.exercises, active.exerciseIndex);
  const canonicalSupersetStep = superset
    ? nextSupersetStep(active.exercises, superset.id)
    : null;
  const prior = previousExercise(state.workouts, exercise.exerciseId);
  const elapsed = Math.floor((now - active.startedAt) / 1000);
  const item = exerciseCatalog[exercise.exerciseId];
  const performancePr = activeExercisePr(state.workouts, exercise, {
    e1rmEligible: exerciseSupportsEstimatedOneRepMax(exercise),
  });
  const increment =
    state.profile.increments[item?.equipment?.[0]] ?? exercise.defaultIncrement;
  const recommendation = active.source === 'freestyle' ? null : progressionFor(
    exercise,
    state.workouts,
    state.profile,
  );
  const remainingSets = exercise.sets.filter((set) => !set.completed);
  const recommendationApplied = Boolean(
    recommendation?.weight &&
    remainingSets.length &&
    remainingSets.every(
      (set) => Number(set.weight) === Number(recommendation.weight),
    ),
  );
  const unit = weightUnit(state.profile.units);
  const summary = workoutSetSummary(active);
  const totalSets = active.exercises.reduce(
    (sum, entry) => sum + entry.sets.length,
    0,
  );
  const activeSetIndex = superset
    ? canonicalSupersetStep?.exerciseIndex === active.exerciseIndex
      ? canonicalSupersetStep.setIndex
      : -1
    : exercise.sets.findIndex((set) => !set.completed);
  const plateTargetSet =
    activeSetIndex >= 0 ? exercise.sets[activeSetIndex] : remainingSets[0];
  const plateTargetKg =
    Number(plateTargetSet?.weight) > 0
      ? Number(plateTargetSet.weight)
      : Number(recommendation?.weight) > 0
        ? Number(recommendation.weight)
        : null;
  const plateCalculatorAvailable = Boolean(
    plateTargetKg &&
      plateLoadingRelation(exercise) === "symmetric-barbell-total" &&
      effectiveGymContext(state, active).id,
  );
  const previousIndex = active.exerciseIndex - 1;
  const hasPreviousExercise = previousIndex >= 0;
  const nextIndex = active.exerciseIndex + 1;
  const nextExercise = active.exercises[nextIndex] || null;
  const incompleteCurrent = exercise.sets.filter((set) => !set.completed).length;
  const supersetRoundIndex = superset
    ? Math.max(
        0,
        Math.min(
          canonicalSupersetStep?.roundIndex ?? superset.roundCount - 1,
          superset.roundCount - 1,
        ),
      )
    : null;
  const supersetNextLabel = superset
    ? superset.role === "A1" &&
      superset.partner.exercise.sets[supersetRoundIndex] &&
      !superset.partner.exercise.sets[supersetRoundIndex].completed
      ? `Next: ${exerciseName(superset.partner.exercise)}`
      : `Rest after both · ${formatDuration(superset.restSeconds)}`
    : null;
  const mutate = (fn) =>
    update((current) => {
      fn(current.activeWorkout);
      current.activeWorkout.updatedAt = Date.now();
      return current;
    });
  const updateSet = (index, field, value) =>
    mutate((workout) => {
      const set = workout.exercises[workout.exerciseIndex].sets[index];
      set[field] = value;
      if (field === 'rir') set.rirEntryMode = 'manual';
      set.touched = true;
    });
  const updateWeight = (index, value) =>
    mutate((workout) => {
      const sets = workout.exercises[workout.exerciseIndex].sets;
      const target = sets[index];
      if (!target) return;
      const empty = (weight) =>
        weight === null || weight === undefined || weight === "";
      const same = (a, b) =>
        (empty(a) && empty(b)) ||
        (!empty(a) && !empty(b) && Number(a) === Number(b));
      const normalizedValue =
        loadRequirement === "optional" && Number(value) === 0 ? null : value;
      let previousOldWeight = target.weight;
      target.weight = normalizedValue;
      target.touched = true;
      target.weightEntryMode = "manual";
      target.weightProvenance = Number(normalizedValue) > 0 ? "explicit" : null;
      delete target.weightSourceSetId;
      for (let setIndex = index + 1; setIndex < sets.length; setIndex++) {
        const set = sets[setIndex];
        const previous = sets[setIndex - 1];
        const oldWeight = set.weight;
        const linked =
          set.weightEntryMode === "auto" &&
          set.weightSourceSetId === previous.id;
        const legacyLinked =
          !set.weightEntryMode &&
          !set.weightSourceSetId &&
          same(oldWeight, previousOldWeight);
        if (!set.completed && (loggingModeOf(workout.exercises[workout.exerciseIndex]) !== 'per_side' || set.weightEntryMode !== 'manual') && (empty(oldWeight) || linked || legacyLinked)) {
          set.weight = previous.weight;
          set.weightEntryMode = "auto";
          set.weightSourceSetId = previous.id;
          set.weightProvenance = previous.weightProvenance || null;
        }
        previousOldWeight = oldWeight;
      }
    });
  const updateReps = (index, value) =>
    mutate((workout) => {
      const sets = workout.exercises[workout.exerciseIndex].sets;
      const target = sets[index];
      if (!target) return;
      let previousOldReps = target.reps;
      target.reps = value;
      target.touched = true;
      target.repsEntryMode = "manual";
      delete target.repsSourceSetId;
      for (let setIndex = index + 1; setIndex < sets.length; setIndex++) {
        const set = sets[setIndex];
        const previous = sets[setIndex - 1];
        const oldReps = set.reps;
        const linked =
          set.repsEntryMode === "auto" &&
          set.repsSourceSetId === previous.id;
        const legacyLinked =
          !set.repsEntryMode &&
          !set.repsSourceSetId &&
          Number(oldReps) === Number(previousOldReps);
        if (!set.completed && (linked || legacyLinked)) {
          set.reps = previous.reps;
          set.repsEntryMode = "auto";
          set.repsSourceSetId = previous.id;
        }
        previousOldReps = oldReps;
      }
    });
  const updateSideReps = (index, side, value) =>
    mutate((workout) => {
      const set = workout.exercises[workout.exerciseIndex].sets[index];
      if (!set) return;
      updatePerSideReps(set, side, value);
    });
  const updateSegment = (setIndex, segmentIndex, field, value) =>
    mutate((workout) => {
      const segment = workout.exercises[workout.exerciseIndex].sets[setIndex]
        ?.segments?.[segmentIndex];
      if (!segment) return;
      segment[field] = value;
      segment.completed =
        Number(segment.reps) > 0 &&
        (loadRequirement !== "required" || Number(segment.weight) > 0);
    });
  const toggleSet = (index) =>
    mutate((workout) => {
      const current = workout.exercises[workout.exerciseIndex];
      const currentExerciseIndex = workout.exerciseIndex;
      const group = supersetMeta(workout.exercises, currentExerciseIndex);
      const canonicalStep = group
        ? nextSupersetStep(workout.exercises, group.id)
        : null;
      const nextIncomplete = current.sets.findIndex((set) => !set.completed);
      const set = current.sets[index];
      const timestamp = Date.now();
      if (!set.completed && !workingSetCanComplete(current, set)) return;
      if (
        !set.completed &&
        (group
          ? canonicalStep?.exerciseIndex !== currentExerciseIndex ||
            canonicalStep?.setIndex !== index
          : index !== nextIncomplete)
      )
        return;
      if (set.completed && timestamp - Number(set.completedAt || 0) < 700)
        return;
      set.completed = !set.completed;
      if (set.completed) set.completedAt = timestamp;
      else delete set.completedAt;
      if (set.completed) carryPerSideSet(current, index);
      if (group) {
        workout.handledSupersetRestRounds ||= [];
        if (!set.completed) {
          workout.rest = null;
          return;
        }
        const completedStep = {
          exercise: current,
          exerciseIndex: currentExerciseIndex,
          set,
          setIndex: index,
          roundIndex: index,
        };
        const roundClosed = isSupersetRoundBoundary(
          workout.exercises,
          completedStep,
        );
        const nextStep = nextSupersetStep(workout.exercises, group.id);
        if (nextStep) workout.exerciseIndex = nextStep.exerciseIndex;
        if (!roundClosed) return;
        const roundKey = supersetRoundKey(group.id, index);
        if (workout.handledSupersetRestRounds.includes(roundKey)) return;
        workout.handledSupersetRestRounds.push(roundKey);
        const fixedRestSeconds = Number(state.profile.restTimerSeconds);
        const restSeconds =
          fixedRestSeconds > 0 ? fixedRestSeconds : group.restSeconds;
        if (
          !workout.rest &&
          state.profile.restTimerEnabled &&
          restSeconds > 0
        )
          workout.rest = state.profile.restTimerAutoStart
            ? { endsAt: timestamp + restSeconds * 1000, seconds: restSeconds }
            : { pending: true, seconds: restSeconds };
        return;
      }
      const fixedRestSeconds = Number(state.profile.restTimerSeconds);
      const restSeconds =
        fixedRestSeconds > 0 ? fixedRestSeconds : Number(current.restSeconds);
      workout.rest =
        set.completed && state.profile.restTimerEnabled && restSeconds > 0
          ? state.profile.restTimerAutoStart
            ? { endsAt: timestamp + restSeconds * 1000, seconds: restSeconds }
            : { pending: true, seconds: restSeconds }
          : null;
    });
  const addSet = () =>
    runRookViewTransition(() => mutate((workout) => {
      const sets = workout.exercises[workout.exerciseIndex].sets;
      if (sets.length >= 6) return;
      const previous = sets.at(-1);
      sets.push({
        ...clone(previous),
        id: `set-${Date.now()}`,
        planned: false,
        completed: false,
        added: true,
        touched: false,
        rir: null,
        weight: previous?.weight ?? null,
        weightEntryMode: "auto",
        weightSourceSetId: previous?.id || null,
        repsEntryMode: "auto",
        repsSourceSetId: previous?.id || null,
      });
      delete sets.at(-1).setType;
      delete sets.at(-1).segments;
      delete sets.at(-1).completedAt;
    }));
  const removeExtraSet = (index) => {
    const set = exercise.sets[index];
    if (!set?.added) return;
    if (
      set.completed &&
      !confirm(
        "Remove this completed extra set? Its logged values will be deleted.",
      )
    )
      return;
    runRookViewTransition(() =>
      mutate((workout) => {
        workout.exercises[workout.exerciseIndex].sets.splice(index, 1);
        workout.rest = null;
      }),
    );
  };
  const moveToExercise = (
    index,
    { alreadyLocked = false, haptic = "tap", announcement = "" } = {},
  ) => {
    if (
      (!alreadyLocked && workoutActionLockRef.current) ||
      index < 0 ||
      index >= active.exercises.length ||
      index === active.exerciseIndex
    )
      return;
    if (!alreadyLocked) workoutActionLockRef.current = true;
    setExerciseTransitioning(true);
    if (haptic) triggerHaptic(haptic);
    const unlock = () => {
      clearTimeout(workoutActionUnlockTimerRef.current);
      workoutActionLockRef.current = false;
      setExerciseTransitioning(false);
    };
    mutate((workout) => {
      workout.exerciseIndex = index;
      workout.rest = null;
    });
    setExerciseCompleting(false);
    setConfirmation(null);
    setExerciseNavigationAnnouncement(announcement);
    screenRef.current?.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        exerciseHeadingRef.current?.focus({ preventScroll: true }),
      ),
    );
    workoutActionUnlockTimerRef.current = setTimeout(unlock, 80);
  };
  const finishWorkout = () => {
    if (workoutActionLockRef.current) return;
    workoutActionLockRef.current = true;
    if(!isCombinedAdjustment(active.adjustment)&&active.exercises.some(hasUnspecifiedRepTarget)&&!summary.completed){
      update(completeWorkout);setConfirmation(null);setPage('today');return;
    }
    if (isCombinedAdjustment(active.adjustment)) {
      try {
        const next = persistCombinedState(state, completeWorkout(state), saveState);
        if(next.workouts.length > state.workouts.length) {
          onLiveFinish?.({priorWorkouts:state.workouts,startedAt:active.startedAt,presented:false});
          if(!state.workouts.length)trackFunnelEventOnce('first_workout_completed',{setCount:summary.completed,endedEarly:summary.completed<summary.total});
        }
        update(() => next, {planVersion:false, persistedState:next});
        setConfirmation(null);
        setPage(next.workouts.length > state.workouts.length ? 'complete' : 'today');
      } catch (error) {
        workoutActionLockRef.current = false;
        setCombinedSaveError(error.message);
      }
      return;
    }
    if (state.workouts.length === 0)
      trackFunnelEventOnce("first_workout_completed", {
        setCount: summary.completed,
        endedEarly: summary.completed < summary.total,
      });
    onLiveFinish?.({priorWorkouts: state.workouts, startedAt: state.activeWorkout.startedAt, presented: false});
    update(completeWorkout);
    setConfirmation(null);
    setPage("complete");
  };
  const requestNext = () => {
    if (workoutActionLockRef.current) return;
    if (incompleteCurrent)
      setConfirmation({ type: "next", incomplete: incompleteCurrent });
    else {
      workoutActionLockRef.current = true;
      setExerciseTransitioning(true);
      setExerciseCompleting(true);
      triggerHaptic("success");
      const completeNavigation = () =>
        moveToExercise(nextIndex, {
          alreadyLocked: true,
          haptic: null,
          announcement: `Exercise complete. Next: ${exerciseName(nextExercise)}`,
        });
      clearTimeout(workoutActionUnlockTimerRef.current);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        requestAnimationFrame(completeNavigation);
      else
        workoutActionUnlockTimerRef.current = setTimeout(
          completeNavigation,
          240,
        );
    }
  };
  const requestFinish = () => {
    if (workoutActionLockRef.current) return;
    if (active.source === 'freestyle' && !summary.completed) return;
    if (summary.completed < summary.total)
      setConfirmation({
        type: "finish",
        combined: isCombinedAdjustment(active.adjustment),
        completed: summary.completed,
        planned: summary.total,
      });
    else finishWorkout();
  };
  const confirmAction = () =>
    confirmation?.type === "next"
      ? moveToExercise(nextIndex, {
          announcement: `Skipped ${exerciseName(exercise)}. Next: ${exerciseName(nextExercise)}`,
        })
      : finishWorkout();
  const canRestartWorkout = activeWorkoutCanRestart(active);
  const restartWorkout = () => {
    const restartedAt = Date.now();
    update((current) => restartActiveWorkout(current, restartedAt));
    setNow(restartedAt);
    setConfirmation(null);
    setWarmupOpen(false);
    setDismissingWarmup(null);
    warmupDismissLockRef.current = false;
    setRecentlyCompletedSetId(null);
    setExerciseCompleting(false);
    setExerciseNavigationAnnouncement("");
    setRestCompleteVisible(false);
    clearTimeout(completionFeedbackTimerRef.current);
    clearTimeout(restCompleteTimerRef.current);
    clearTimeout(warmupDismissTimerRef.current);
    setDetail(null);
    requestAnimationFrame(() =>
      screenRef.current?.scrollTo({ top: 0, behavior: "auto" }),
    );
  };
  const timed = exerciseMeasure(exercise) === "seconds";
  const perSide = loggingModeOf(exercise) === "per_side" && !timed;
  const entryUnit = loggingUnit(exercise);
  const loadRequirement = exerciseLoadRequirement(exercise);
  const compactNoLoad = loadRequirement === "none" && !perSide;
  const addedBodyweightLoad =
    loadRequirement === "optional" && Boolean(item?.bodyweight);
  const loadContext = item?.equipment?.includes("resistance bands")
    ? "Band"
    : item?.bodyweight || item?.equipment?.includes("bodyweight")
      ? "Bodyweight"
      : "No load";
  const loadInputLabel = addedBodyweightLoad
    ? "Added weight (optional)"
    : loadRequirement === "optional"
      ? "Weight (optional)"
      : "Weight";
  const timerVisible =
    !confirmation && (restReady || restLeft > 0 || restCompleteVisible);
  const currentWarmup = (active.warmup?.stages || []).find(
    (stage) =>
      stage.exerciseIndex === active.exerciseIndex &&
      stage.exerciseId === exercise.exerciseId &&
      (!stage.exerciseInstanceId || stage.exerciseInstanceId === exercise.id) &&
      !stage.skipped &&
      !stage.completed,
  );
  const warmup = currentWarmup || dismissingWarmup;
  const warmupExercise = warmup
    ? active.exercises.find(
        (entry) =>
          entry.id === warmup.exerciseInstanceId &&
          entry.exerciseId === warmup.exerciseId,
      ) ||
      (!warmup.exerciseInstanceId &&
      active.exercises[warmup.exerciseIndex]?.exerciseId === warmup.exerciseId
        ? active.exercises[warmup.exerciseIndex]
        : null)
    : null;
  const warmupExerciseName = warmupExercise
    ? exerciseName(warmupExercise)
    : null;
  const warmupDismissing = Boolean(!currentWarmup && dismissingWarmup);
  const warmupCompleting = Boolean(
    warmupDismissing && dismissingWarmup?._dismissal === "completed",
  );
  const warmupCollapsing = Boolean(
    warmupDismissing && dismissingWarmup?._dismissPhase === "collapsing",
  );
  const initialWarmup = warmup?.exerciseIndex === 0;
  const upNextBlocks = [];
  const seenUpNextSupersets = new Set();
  active.exercises.forEach((entry, index) => {
    if (index <= active.exerciseIndex) return;
    if (superset && entry.supersetId === superset.id) return;
    if (!entry.supersetId) {
      upNextBlocks.push({ index, entries: [entry] });
      return;
    }
    if (seenUpNextSupersets.has(entry.supersetId)) return;
    seenUpNextSupersets.add(entry.supersetId);
    const entries = active.exercises.filter(
      (candidate) => candidate.supersetId === entry.supersetId,
    );
    upNextBlocks.push({
      index: active.exercises.findIndex(
        (candidate) => candidate.supersetId === entry.supersetId,
      ),
      entries,
    });
  });
  const finishWarmupDismissal = (shouldFocusWorkingSet = false) => {
    clearTimeout(warmupDismissTimerRef.current);
    setDismissingWarmup(null);
    warmupDismissLockRef.current = false;
    if (!shouldFocusWorkingSet) return;
    requestAnimationFrame(() => {
      screenRef.current
        ?.querySelector(".sets .set-row:not(.set-done) .check")
        ?.focus({ preventScroll: true });
    });
  };
  const dismissCurrentWarmup = (field) => {
    if (!currentWarmup || warmupDismissLockRef.current) return;
    warmupDismissLockRef.current = true;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isCompletion = field === "completed";
    const warmupHeight = screenRef.current
      ?.querySelector(".workout-warmup")
      ?.getBoundingClientRect().height;
    const snapshot = {
      ...clone(currentWarmup),
      _dismissal: field,
      _dismissPhase: isCompletion ? "acknowledging" : "collapsing",
      _dismissHeight: warmupHeight || 0,
    };
    if (document.activeElement?.closest?.(".workout-warmup"))
      document.activeElement.blur();
    if (!isCompletion) setWarmupOpen(false);
    setDismissingWarmup(reducedMotion ? null : snapshot);
    mutate((workout) => {
      const stage = workout.warmup?.stages?.find(
        (item) => item.id === currentWarmup.id,
      );
      if (stage) stage[field] = true;
    });
    clearTimeout(warmupDismissTimerRef.current);
    if (reducedMotion) {
      finishWarmupDismissal(isCompletion);
      return;
    }
    if (isCompletion && !reducedMotion) {
      warmupDismissTimerRef.current = setTimeout(() => {
        setDismissingWarmup((value) =>
          value?._dismissal === "completed"
            ? { ...value, _dismissPhase: "collapsing" }
            : value,
        );
        warmupDismissTimerRef.current = setTimeout(
          () => finishWarmupDismissal(true),
          260,
        );
      }, 240);
      return;
    }
    warmupDismissTimerRef.current = setTimeout(
      () => finishWarmupDismissal(isCompletion),
      isCompletion ? 150 : 260,
    );
  };
  const finishWarmup = () => dismissCurrentWarmup("completed");
  const toggleWarmupItem = (stageId, collection, itemId) =>
    mutate((workout) => {
      const item = workout.warmup?.stages
        ?.find((stage) => stage.id === stageId)
        ?.[collection]?.find((entry) => entry.id === itemId);
      if (item) item.completed = !item.completed;
    });
  const toggleRampSet = (stageId, exerciseId, setId) =>
    mutate((workout) => {
      const set = workout.warmup?.stages
        ?.find((stage) => stage.id === stageId)
        ?.rampUpSets
        ?.find((entry) => entry.exerciseId === exerciseId)
        ?.sets.find((entry) => entry.id === setId);
      if (set) set.completed = !set.completed;
    });
  const rampLabel = (entry, set) => {
    const workingExercise = active.exercises.find(
      (candidate) => candidate.exerciseId === entry.exerciseId,
    );
    const workingWeight = workingExercise?.sets.find(
      (candidate) => Number(candidate.weight) > 0,
    )?.weight;
    const catalogItem = exerciseCatalog[entry.exerciseId];
    const equipmentKey = catalogItem?.equipment?.find((key) =>
      Object.hasOwn(state.profile.increments || {}, key),
    );
    const increment =
      state.profile.increments?.[equipmentKey] || catalogItem?.increment || 1;
    const weight =
      rampWeightForWorkingLoad(workingWeight, set.loadPercent, increment) ??
      set.weight;
    if (weight !== null && weight !== undefined)
      return `${displayWeight(weight, state.profile.units)} ${unit} × ${set.reps}`;
    if (set.loadInstruction)
      return `${set.technique ? "Technique · " : ""}${set.loadInstruction} × ${set.reps}`;
    return set.loadPercent
      ? `${set.loadPercent}% of working load × ${set.reps}`
      : `${set.reps} controlled reps`;
  };
  const warmupStepOrder = warmup
    ? [
        ...warmup.general.map((item) => ({
          id: item.id,
          completed: item.completed,
        })),
        ...warmup.movementPreparation.map((item) => ({
          id: item.id,
          completed: item.completed,
        })),
        ...warmup.rampUpSets.flatMap((entry) =>
          entry.sets.map((set) => ({ id: set.id, completed: set.completed })),
        ),
      ]
    : [];
  const currentWarmupStepId = warmupStepOrder.find(
    (step) => !step.completed,
  )?.id;
  const completedWarmupSteps = warmupStepOrder.filter(
    (step) => step.completed,
  ).length;
  const warmupStepClass = (id, completed) =>
    `warmup-check-row${completed ? " completed" : id === currentWarmupStepId ? " current" : ""}`;
  return (
    <main
      ref={screenRef}
      className={`screen workout-screen ${timerVisible ? "rest-timer-visible" : ""}${active.source === 'freestyle' ? ' freestyle-workout' : ''}`}
    >
      {!confirmation && combinedSaveError && <p role="alert">{combinedSaveError}</p>}
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {exerciseNavigationAnnouncement}
      </p>
      <header className="workout-header">
        <button aria-label="Back to Today" onClick={() => setPage("today")}>
          ‹
        </button>
        <div className="workout-header-center">
          <strong>{active.name}</strong>
          <small aria-live="polite">
            {summary.completed} / {pluralize(totalSets, active.exercises.every(e=>loggingUnit(e)==='round')?'round':'set')} ·{" "}
            {formatWorkoutElapsedDuration(elapsed)}
          </small>
        </div>
        <span className="workout-header-actions">
          <button
            className="text-button"
            disabled={exerciseTransitioning || (active.source === 'freestyle' && !summary.completed)}
            aria-disabled={exerciseTransitioning || (active.source === 'freestyle' && !summary.completed)}
            onClick={requestFinish}
          >
            Finish
          </button>
          <button
            type="button"
            className={`workout-options-trigger${canRestartWorkout ? "" : " unavailable"}`}
            aria-label="Workout options"
            aria-hidden={!canRestartWorkout}
            tabIndex={canRestartWorkout ? 0 : -1}
            disabled={!canRestartWorkout}
            onClick={() =>
              setDetail({ workoutOptions: true, onRestart: restartWorkout })
            }
          >
            <span aria-hidden="true">•••</span>
          </button>
        </span>
      </header>
      <div
        key={`exercise-panel-${exercise.id}`}
        className="exercise-panel"
      >
        {warmup && (
        <section
          className={`workout-warmup ${warmupOpen ? "open" : ""}${warmupCompleting ? " completing completed" : ""}${warmupCollapsing ? " dismissing" : ""}`}
          aria-hidden={warmupCollapsing || undefined}
          style={
            warmupCompleting
              ? {
                  "--warmup-completion-height": `${dismissingWarmup?._dismissHeight || 0}px`,
                }
              : undefined
          }
          onTransitionEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.propertyName ===
                (warmupCompleting ? "height" : "grid-template-rows") &&
              warmupCollapsing
            )
              finishWarmupDismissal(warmupCompleting);
          }}
        >
          <div className="workout-warmup-content">
            {warmupCompleting ? (
              <div
                className="warmup-complete-status"
                role="status"
                aria-live="polite"
              >
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Warm-up complete</strong>
                </div>
              </div>
            ) : (
              <div className="workout-warmup-bar">
                <button
                  className="workout-warmup-toggle"
                  aria-expanded={warmupOpen}
                  onClick={() => setWarmupOpen((value) => !value)}
                >
                  <span>
                    <strong>Warm-up{warmup.estimatedMinutes != null ? ` · ~${warmup.estimatedMinutes} min` : ''}</strong>
                    <small>
                      {warmupOpen
                        ? `${completedWarmupSteps} of ${warmupStepOrder.length} complete`
                        : warmupExerciseName
                          ? `For ${warmupExerciseName}`
                          : null}
                    </small>
                  </span>
                  <i className="disclosure-chevron" aria-hidden="true" />
                </button>
                <button
                  className="text-button warmup-skip"
                  onClick={() => dismissCurrentWarmup("skipped")}
                >
                  Skip
                </button>
              </div>
            )}
              {active.warmup?.safetyMessage && (
                <p className="warmup-safety" role="status">
                  {active.warmup.safetyMessage}
                </p>
              )}
              <Disclosure open={warmupOpen}>
                <div className="warmup-details" inert={warmupCompleting ? '' : undefined}>
                  {warmup.general.length > 0 && (
                    <div className="warmup-checklist-section">
                      <small className="warmup-section-label">GENERAL</small>
                      {warmup.general.map((item) => (
                        <button
                          type="button"
                          aria-pressed={Boolean(item.completed)}
                          className={warmupStepClass(item.id, item.completed)}
                          key={item.id}
                          onClick={() =>
                            toggleWarmupItem(warmup.id, "general", item.id)
                          }
                        >
                          <span>{item.label}</span>
                          {warmupPrescriptionLabel(item) && <strong>{warmupPrescriptionLabel(item)}</strong>}
                          <i aria-hidden="true">✓</i>
                        </button>
                      ))}
                    </div>
                  )}
                  {warmup.movementPreparation.length > 0 && (
                    <div className="warmup-checklist-section">
                      <small className="warmup-section-label">PREPARATION</small>
                      {warmup.movementPreparation.map((item) => (
                        <button
                          type="button"
                          aria-pressed={Boolean(item.completed)}
                          className={warmupStepClass(item.id, item.completed)}
                          key={item.id}
                          onClick={() =>
                            toggleWarmupItem(
                              warmup.id,
                              "movementPreparation",
                              item.id,
                            )
                          }
                        >
                          <span>{item.label}</span>
                          {warmupPrescriptionLabel(item) && <strong>{warmupPrescriptionLabel(item)}</strong>}
                          <i aria-hidden="true">✓</i>
                        </button>
                      ))}
                    </div>
                  )}
                  {warmup.rampUpSets.map((entry) => (
                    <div className="warmup-ramp" key={entry.exerciseId}>
                      <small className="warmup-section-label">
                        {entry.exerciseName} · RAMP-UP
                      </small>
                      {entry.sets.map((set) => (
                        <button
                          type="button"
                          aria-pressed={Boolean(set.completed)}
                          className={warmupStepClass(set.id, set.completed)}
                          key={set.id}
                          onClick={() =>
                            toggleRampSet(
                              warmup.id,
                              entry.exerciseId,
                              set.id,
                            )
                          }
                        >
                          <span>{rampLabel(entry, set)}</span>
                          <i aria-hidden="true">✓</i>
                        </button>
                      ))}
                    </div>
                  ))}
                  {warmup.rampUpSets.length > 0 && (
                    <small className="warmup-count-note">
                      Ramp-up sets don’t count toward working sets.
                    </small>
                  )}
                  <button
                    type="button"
                    className="warmup-finish"
                    onClick={finishWarmup}
                  >
                    {initialWarmup ? "FINISH WARM-UP" : "FINISH RAMP-UP"}
                  </button>
                </div>
              </Disclosure>
          </div>
        </section>
      )}
      <section
        key={`exercise-heading-${exercise.id}`}
        className={`exercise-heading${exerciseIllustration ? " has-illustration" : ""}${exerciseName(exercise).length > 36 ? " long-title" : ""}`}
      >
        {exerciseIllustration && (
          <button
            type="button"
            id={`active-exercise-art-${exercise.id}`}
            className="exercise-heading-art-button"
            aria-label={`View ${exerciseName(exercise)} illustration`}
            onClick={() =>
              setDetail({
                visual: exercise,
                returnFocusId: `active-exercise-art-${exercise.id}`,
              })
            }
          >
            <img
              className="exercise-heading-art"
              onError={activeArtwork.onError}
              src={exerciseIllustration}
              alt=""
              aria-hidden="true"
              decoding="async"
              fetchpriority="high"
            />
          </button>
        )}
        <div className="exercise-heading-content">
          <div className={`exercise-heading-topline${superset ? "" : " exercise-position-topline"}`}>
            <Eyebrow>
              {superset
                ? `SUPERSET · ROUND ${supersetRoundIndex + 1} OF ${superset.roundCount}`
                : `EXERCISE ${active.exerciseIndex + 1} OF ${active.exercises.length}`}
            </Eyebrow>
            <div className="workout-exercise-actions">
              <button
                className="text-button"
                disabled={exercise.sets.some((set) => set.completed)}
                title={
                  exercise.sets.some((set) => set.completed)
                    ? "Replacement is locked after work is logged."
                    : "Replace this exercise for today"
                }
                onClick={() => setDetail({ replace: exercise })}
              >
                Replace
              </button>
              <button
                className="exercise-options-button"
                aria-label="Exercise options"
                aria-description={exercisePersonalNote(exercise) ? "Note added. Edit note in this menu." : "Includes Add note."}
                title="Exercise options"
                onClick={() => setDetail({ options: exercise })}
              >
                <span aria-hidden="true">•••</span>
                {exercisePersonalNote(exercise) && <i className="exercise-note-present" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <h1 ref={exerciseHeadingRef} tabIndex={-1}>
            {exerciseName(exercise)}
          </h1>
          <p className="exercise-meta">
            {active.source === 'freestyle' ? 'Freestyle · Choose your sets and reps' : <>Target {targetLabel(exercise, state.profile.rirEnabled)}</>}
          </p>
          {(active.source !== 'freestyle' || !prior) && <small className="exercise-history-meta">
            {prior
              ? `Last ${prior.sets
                .filter((set) => set.completed)
                .map((set) => exerciseValueLabel(exercise, set.reps))
                .join(" / ")}`
              : "First session"}
          </small>}
          {performancePr && (
            <small className="active-performance-pr" role="status" aria-live="polite">
              {performancePr.label}
            </small>
          )}
          {exerciseNotePresentation(exercise,state.program).cue && (
            <small className="exercise-user-note exercise-program-note">{exerciseNotePresentation(exercise,state.program).cue}</small>
          )}
          {exerciseNotePresentation(exercise,state.program).reference&&<button className="text-button exercise-source-link" onClick={()=>setDetail({exerciseNote:exercise})}>Original import in Notes</button>}
          {exercisePersonalNote(exercise) && (
            <small className="exercise-personal-note">
              <span>Your note</span> · {exercisePersonalNote(exercise)}
            </small>
          )}
          {superset && (
            <small className="superset-next-step">{supersetNextLabel}</small>
          )}
        </div>
      </section>
      {active.source === 'freestyle' && <FreestylePrevious state={state} exercise={exercise} update={update} setDetail={setDetail} />}
      {recommendation && (
        <section
          className={`recommendation ${recommendation.type} ${recommendationApplied ? "applied" : ""}`}
          role={recommendationApplied ? "status" : undefined}
        >
          <div>
            <strong>
              {recommendationApplied
                ? "Applied to this workout"
                : recommendation.title}
            </strong>
            <p>
              {recommendation.weight
                ? recommendationApplied
                  ? `${displayWeight(recommendation.weight, state.profile.units)} ${unit} is set for today’s remaining sets.`
                  : `Next: ${displayWeight(recommendation.weight, state.profile.units)} ${unit}. ${recommendation.detail}`
                : recommendation.detail}
            </p>
          </div>
          {recommendation.weight && !recommendationApplied && (
            <Button
              className="compact"
              onClick={() =>
                mutate((workout) => {
                  const sets = workout.exercises[workout.exerciseIndex].sets;
                  let previous = null;
                  sets.forEach((set) => {
                    if (set.completed) {
                      previous = set;
                      return;
                    }
                    set.weight = recommendation.weight;
                    set.touched = true;
                    set.weightEntryMode =
                      previous && !previous.completed ? "auto" : "manual";
                    if (set.weightEntryMode === "auto")
                      set.weightSourceSetId = previous.id;
                    else delete set.weightSourceSetId;
                    previous = set;
                  });
                })
              }
            >
              USE
            </Button>
          )}
        </section>
      )}
      <section key={`exercise-sets-${exercise.id}`} className="sets exercise-transition-content">
        <div
          className={`set-labels ${state.profile.rirEnabled && !timed ? "with-rir" : ""}${perSide ? " per-side" : ""}${compactNoLoad ? " no-load" : ""}`}
        >
          <span />
          {!compactNoLoad && <span className="set-load-heading">
            {loadRequirement === "none" ? "LOAD" : `${addedBodyweightLoad ? "+ " : ""}${unit.toUpperCase()}`}
            {plateCalculatorAvailable && (
              <button
                type="button"
                className="plate-calculator-entry"
                aria-label={`Open plate calculator for ${displayWeight(plateTargetKg, state.profile.units)} ${unit}`}
                title="Plate calculator"
                onClick={() =>
                  setDetail({
                    plateCalculator: {
                      exerciseId: exercise.exerciseId,
                      setId: plateTargetSet?.id,
                      targetKg: plateTargetKg,
                      onSelect: (weightKg) =>
                        updateWeight(Math.max(0, activeSetIndex), weightKg),
                    },
                  })
                }
              >
                <i aria-hidden="true"><b /><b /><b /></i>
              </button>
            )}
          </span>}
          <span>{perSide ? "PER SIDE" : timed ? "SEC" : "REPS"}</span>
          {state.profile.rirEnabled && !timed && (
            <span className="set-label-help">
              <HelpPopover
                id="active-workout-rir-help"
                circleOnly
                label="What is RIR?"
                term="RIR"
                title="Reps in reserve"
              >
                How many clean reps you could still perform when the set ends.
                0 = none left; 1 = one left; up to 4.
              </HelpPopover>
            </span>
          )}
          <span className="set-done-heading">DONE</span>
        </div>
        {exercise.sets.map((set, index) => {
          const activeSet = index === activeSetIndex;
          const future = !set.completed && !activeSet;
          const canComplete = workingSetCanComplete(exercise, set);
          const ready = activeSet && canComplete;
          const edited = activeSet && Boolean(set.touched);
          const checkDisabled = !set.completed && (!activeSet || !canComplete);
          const specialType = setTypeLabel(set);
          const segmentKind = segmentKindForSet(set);
          return (
            <Fragment key={set.id}>
            <div
              style={{
                viewTransitionName: rookViewTransitionName("set", set.id),
              }}
              className={`set-row ${state.profile.rirEnabled && !timed ? "with-rir" : ""}${perSide ? " per-side" : ""}${compactNoLoad ? " no-load" : ""}${specialType || entryUnit === 'round' ? " special-set" : ""} ${set.completed ? "set-done" : ""} ${activeSet ? "set-active" : ""} ${ready ? "set-ready" : ""} ${edited ? "set-edited" : ""} ${future ? "set-future" : ""} ${set.added ? "set-extra" : ""}${recentlyCompletedSetId === set.id ? " set-completing" : ""}`}
              data-set-state={set.completed ? "completed" : ready ? "ready" : activeSet ? "current" : "untouched"}
              aria-current={activeSet ? "step" : undefined}
            >
              {set.added ? (
                <button
                  className="extra-set-label"
                  aria-label={`Remove extra ${entryUnit} ${index + 1}`}
                  onClick={() => removeExtraSet(index)}
                >
                  <b>{index + 1}</b>
                  <small>EXTRA</small>
                </button>
              ) : (
                <span className="set-index-label">
                  <b>{index + 1}</b>
                  {entryUnit === 'round' && <small>ROUND</small>}
                  {specialType && <small>{specialType}</small>}
                </span>
              )}
              {!compactNoLoad && (loadRequirement === "none" ? (
                <span
                  className="set-load-context"
                  aria-label={`Load for ${entryUnit} ${index + 1}: ${loadContext}`}
                >
                  {loadContext}
                </span>
              ) : (
                <Stepper
                  label={`${loadInputLabel} in ${unit} for ${entryUnit} ${index + 1}`}
                  value={displayWeight(set.weight, state.profile.units)}
                  step={displayWeight(increment, state.profile.units)}
                  alignToStep
                  allowIncrementFromEmpty={loadRequirement === "optional"}
                  emptyLabel={
                    addedBodyweightLoad
                      ? "Bodyweight"
                      : loadRequirement === "optional"
                        ? "Optional"
                        : "Enter weight"
                  }
                  onChange={(value) =>
                    updateWeight(index, storedWeight(value, state.profile.units))
                  }
                />
              ))}
              {perSide ? (
                <div className="unilateral-reps" aria-label={`Per-side reps for ${entryUnit} ${index + 1}`}>
                  {[["left", "L"], ["right", "R"]].map(([side, label]) => (
                    <div className="unilateral-side" key={side}><span>{label}</span><Stepper label={`${side} reps for ${entryUnit} ${index + 1}`} value={set.sides?.[side]?.reps ?? null} step={1} min={1} integer allowIncrementFromEmpty onChange={value => updateSideReps(index, side, value)} /></div>
                  ))}
                </div>
              ) : (
                <Stepper
                  label={`${timed ? "Seconds" : "Reps"} for ${entryUnit} ${index + 1}`}
                  value={set.reps}
                  step={timed ? 5 : 1}
                  min={1}
                  integer
                  onChange={(value) => updateReps(index, value)}
                />
              )}
              {state.profile.rirEnabled && !timed && (
                <>
                <select
                  className="rir-native"
                  aria-label={`RIR for ${entryUnit} ${index + 1}`}
                  value={set.rir ?? ""}
                  onChange={(event) =>
                    updateSet(
                      index,
                      "rir",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  <option value="">RIR</option>
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value} RIR
                    </option>
                  ))}
                </select>
                <span className="rir-display" aria-hidden="true"><span className="rir-value">{set.rir == null ? 'RIR' : `${set.rir} RIR`}</span><svg viewBox="0 0 12 12"><path d="m2 4 4 4 4-4" /></svg></span>
                </>
              )}
              <button
                className="check"
                data-check-state={set.completed ? "completed" : ready ? "ready" : activeSet ? "current" : "disabled"}
                disabled={checkDisabled}
                aria-pressed={set.completed}
                aria-label={set.completed ? `Undo logged ${entryUnit} ${index + 1}` : `Log ${entryUnit} ${index + 1}`}
                onClick={() => toggleSet(index)}
              >
                <span className="check-mark" aria-hidden="true">✓</span>
              </button>
            </div>
            {segmentKind && (set.segments || []).length > 0 && (
              <div className={`set-segments ${set.completed ? "is-completed" : ""}`} aria-label={`${specialType} segments for set ${index + 1}`}>
                {(set.segments || []).map((segment, segmentIndex) => (
                  <div className="set-segment" key={segment.id}>
                    <span>{segmentKind === "drop" ? `DROP ${segmentIndex + 1}` : `PAUSE ${segmentIndex + 1}`}</span>
                    {loadRequirement !== "none" && <label><small>{unit.toUpperCase()}</small><input type="number" min="0" step={displayWeight(increment, state.profile.units)} value={segment.weight === null ? "" : displayWeight(segment.weight, state.profile.units)} onChange={(event) => updateSegment(index, segmentIndex, "weight", event.target.value === "" ? null : storedWeight(Number(event.target.value), state.profile.units))} /></label>}
                    <label><small>REPS</small><input type="number" min="1" step="1" value={segment.reps ?? ""} onChange={(event) => updateSegment(index, segmentIndex, "reps", event.target.value === "" ? null : Number(event.target.value))} /></label>
                    <i aria-label={segment.completed ? "Segment ready" : "Segment incomplete"}>{segment.completed ? "✓" : ""}</i>
                  </div>
                ))}
              </div>
            )}
            </Fragment>
          );
        })}
        <Button
          variant="secondary"
          disabled={exercise.sets.length >= 6}
          onClick={addSet}
        >
          + ADD {entryUnit.toUpperCase()}
        </Button>
        <div className="workout-primary-action">
          {hasPreviousExercise && (
            <Button
              variant="quiet"
              className="workout-previous"
              disabled={exerciseTransitioning}
              aria-disabled={exerciseTransitioning}
              onClick={() => moveToExercise(previousIndex)}
            >
              ← PREVIOUS EXERCISE
            </Button>
          )}
          {canonicalSupersetStep ? (
            <Button variant="secondary" disabled>
              LOG NEXT SET TO CONTINUE
            </Button>
          ) : active.source === 'freestyle' && !nextExercise && !summary.completed ? (
            <Button variant="secondary" onClick={() => setDetail({ freestylePicker: true })}>+ ADD EXERCISE</Button>
          ) : (
            <Button
              variant={
                nextExercise && incompleteCurrent > 0
                  ? "secondary"
                  : "primary"
              }
              className={
                nextExercise
                  ? incompleteCurrent > 0
                    ? "workout-next-pending"
                    : `workout-next-ready${exerciseCompleting ? " workout-next-completing" : ""}`
                  : ""
              }
              onClick={nextExercise ? requestNext : requestFinish}
              disabled={!nextExercise && active.source === 'freestyle' && !summary.completed}
              aria-disabled={exerciseTransitioning}
              aria-label={
                exerciseCompleting
                  ? "Exercise complete"
                  : nextExercise
                    ? "NEXT EXERCISE →"
                    : "FINISH WORKOUT"
              }
            >
              {exerciseCompleting ? (
                <span className="exercise-complete-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M5.5 12.5 10 17l8.5-10" />
                  </svg>
                </span>
              ) : nextExercise ? (
                "NEXT EXERCISE →"
              ) : (
                "FINISH WORKOUT"
              )}
            </Button>
          )}
        </div>
      </section>
      {upNextBlocks.length > 0 && (
        <section className="up-next">
          <Eyebrow>UP NEXT</Eyebrow>
          {upNextBlocks.map((block) => (
            <button
              key={block.entries.map((entry) => entry.id).join("-")}
              disabled={exerciseTransitioning}
              aria-disabled={exerciseTransitioning}
              onClick={() => moveToExercise(block.index)}
            >
              <span className="up-next-main">
                <strong className="up-next-title">
                  {block.entries.length === 2
                    ? `SUPERSET · A1 ${exerciseName(block.entries[0])} · A2 ${exerciseName(block.entries[1])}`
                    : exerciseName(block.entries[0])}
                </strong>
                {block.entries.length === 1 && exerciseNote(block.entries[0]) && (
                  <small className="up-next-note up-next-program-note">
                    {exerciseNote(block.entries[0])}
                  </small>
                )}
                {block.entries.length === 1 &&
                  exercisePersonalNote(block.entries[0]) && (
                    <small className="up-next-note up-next-personal-note">
                      <span>Your note</span> · {exercisePersonalNote(block.entries[0])}
                    </small>
                  )}
              </span>
              <small className="up-next-prescription">
                {block.entries.length === 2
                  ? pluralize(
                      block.entries.reduce(
                        (sum, entry) =>
                          sum + entry.sets.filter((set) => !set.completed).length,
                        0,
                      ),
                      "set",
                    ) + " remaining"
                  : active.source === 'freestyle' ? `${block.entries[0].sets.length} sets` : targetLabel(
                      block.entries[0],
                      state.profile.rirEnabled,
                    )}
              </small>
            </button>
          ))}
        </section>
      )}
      {active.source === 'freestyle' && <FreestyleActions state={state} update={update} setDetail={setDetail} setPage={setPage} hideAdd={!nextExercise && !summary.completed && !canonicalSupersetStep} />}
      </div>
      <WorkoutConfirmation
        confirmation={confirmation}
        error={combinedSaveError}
        cancel={() => setConfirmation(null)}
        continueAction={confirmAction}
      />
      {restReady && !confirmation && (
        <aside className="rest-timer rest-ready">
          <span>
            <Eyebrow>REST TIMER</Eyebrow>
            <strong>{formatDuration(active.rest.seconds)}</strong>
          </span>
          <div />
          <Button
            variant="dark"
            onClick={() =>
              mutate((workout) => {
                workout.rest = {
                  seconds: workout.rest.seconds,
                  endsAt: Date.now() + workout.rest.seconds * 1000,
                };
              })
            }
          >
            START
          </Button>
        </aside>
      )}
      {restLeft > 0 && !confirmation && (
        <aside className="rest-timer">
          <span>
            <Eyebrow>REST</Eyebrow>
            <strong>{formatDuration(restLeft)}</strong>
          </span>
          <div>
            <i
              style={{ width: `${(restLeft / active.rest.seconds) * 100}%` }}
            />
          </div>
          <Button
            variant="dark"
            onClick={() =>
              mutate((workout) => {
                workout.rest = null;
              })
            }
          >
            SKIP
          </Button>
        </aside>
      )}
      {restCompleteVisible && restLeft === 0 && !confirmation && (
        <aside className="rest-timer rest-complete" role="status">
          <span>
            <Eyebrow>REST</Eyebrow>
            <strong>REST COMPLETE</strong>
          </span>
          <div>
            <i style={{ width: "100%" }} />
          </div>
        </aside>
      )}
    </main>
  );
}

function persistSessionNote(update, workoutId, value, finish = false) {
  const raw = String(value || "").slice(0, SESSION_NOTE_MAX_LENGTH);
  const stored = finish ? normalizeSessionNote(raw) : raw;
  update((current) => {
    const workout = current.workouts.find((item) => item.id === workoutId);
    if (!workout) return current;
    if (stored) workout.sessionNote = stored;
    else delete workout.sessionNote;
    return current;
  });
  return stored || "";
}

function SessionNoteEditor({ workout, update, optional = true }) {
  const draft = workout.sessionNote || "";
  const helperId = `session-note-helper-${workout.id}`;
  const commit = (value = draft) =>
    persistSessionNote(update, workout.id, value, true);
  return (
    <section className="session-note-editor">
      <div className="session-note-heading">
        <Eyebrow>SESSION NOTE{optional ? " · OPTIONAL" : ""}</Eyebrow>
        {draft.length >= 450 && (
          <small aria-live="polite">
            {draft.length} / {SESSION_NOTE_MAX_LENGTH}
          </small>
        )}
      </div>
      <textarea
        aria-label="Session note"
        aria-describedby={helperId}
        maxLength={SESSION_NOTE_MAX_LENGTH}
        placeholder="Anything worth remembering?"
        rows={2}
        value={draft}
        onChange={(event) => {
          const next = event.target.value.slice(0, SESSION_NOTE_MAX_LENGTH);
          persistSessionNote(update, workout.id, next);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
      <small id={helperId}>Saved automatically with this workout.</small>
    </section>
  );
}

function PrivateWorkoutPhotoViewer({
  photoUrl,
  workout,
  busy = false,
  onClose,
  onDelete,
  onViewWorkout,
  error = "",
}) {
  const [viewerError, setViewerError] = useState(false);
  const [exportFile, setExportFile] = useState(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeViewerRef = useRef(null);
  const date = workoutPlanDate(workout);
  const summary = workoutSetSummary(workout);

  useEffect(() => {
    let disposed = false;
    setExportFile(null); setPhotoLoaded(false); setViewerError(false); setExportStatus('');
    // All viewer URLs are leases over locally stored blobs. Never fetch a remote photo.
    if (photoUrl?.startsWith('blob:')) {
      fetch(photoUrl).then(response => { if (!response.ok) throw new Error(); return response.blob(); })
        .then(blob => { const file = workoutPhotoFile(blob, date); if (!disposed) setExportFile(file); })
        .catch(() => { if (!disposed) setExportStatus('This photo is unavailable for export.'); });
    }
    return () => { disposed = true; };
  }, [photoUrl, date]);
  const savePhoto = async () => {
    if (!exportFile || !photoLoaded || viewerError || exportBusy) return;
    setExportBusy(true); setExportStatus('');
    try {
      const result = await exportWorkoutPhoto(exportFile);
      setExportStatus(result === 'downloaded' ? 'Photo copy downloaded.' : '');
    } catch { setExportStatus('Couldn’t save the photo. Please try again.'); }
    finally { setExportBusy(false); }
  };

  useEffect(() => {
    focusNavigationTarget(closeViewerRef.current);
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      // The photo is the topmost dialog; do not also dismiss its parent sheet.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (confirmDelete) setConfirmDelete(false);
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [confirmDelete, onClose]);

  return (
    <div className="workout-photo-viewer" role="dialog" aria-modal="true" aria-label="Workout photo">
      <header className="workout-photo-viewer-chrome">
        <button
          ref={closeViewerRef}
          type="button"
          className="workout-photo-viewer-close"
          aria-label="Close workout photo"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="workout-photo-viewer-panel">
        {viewerError || !photoUrl ? (
          <div className="workout-photo-viewer-error" role="alert">
            <strong>Photo unavailable</strong>
            <p>This private photo couldn’t be displayed on this device.</p>
          </div>
        ) : (
          <img
            src={photoUrl}
            alt="Private workout photo"
            onLoad={() => setPhotoLoaded(true)}
            onError={() => setViewerError(true)}
          />
        )}
        <div className="workout-photo-viewer-context">
          <strong>{workout.name || "Completed workout"}</strong>
          <span>
            {date ? displayDate(localDate(date)) : "Completed workout"}
            {summary.completed > 0 ? ` · ${pluralize(summary.completed, "working set")}` : ""}
          </span>
          <small>Stored privately on this device. Never uploaded by ROOK.</small>
        </div>
        {!confirmDelete ? (
          <div className="workout-photo-viewer-actions">
            {onViewWorkout && (
              <button type="button" onClick={onViewWorkout}>VIEW WORKOUT</button>
            )}
            <button type="button" disabled={!exportFile || !photoLoaded || viewerError || exportBusy} onClick={savePhoto}>SAVE PHOTO</button>
            <button type="button" className="workout-photo-delete" onClick={() => setConfirmDelete(true)}>
              DELETE PHOTO
            </button>
          </div>
        ) : (
          <div className="workout-photo-delete-confirm" role="group" aria-label="Confirm photo deletion">
            <p>Delete this photo? Your workout will remain saved.</p>
            {error && <p role="alert">{error}</p>}
            <button type="button" onClick={() => setConfirmDelete(false)}>KEEP PHOTO</button>
            <button type="button" disabled={busy} onClick={onDelete}>DELETE PHOTO</button>
          </div>
        )}
        {exportStatus && <p className="workout-photo-export-status" role="status">{exportStatus}</p>}
      </div>
    </div>
  );
}

function LazyWorkoutPhotoThumbnail({ entry, onOpen, onAvailability, selectionMode = false, selectionIndex = 0, disabled = false }) {
  const hostRef = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [unavailable, setUnavailable] = useState(!entry.metadataAvailable);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof IntersectionObserver !== "function") {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([observation]) => setNearViewport(Boolean(observation?.isIntersecting)),
      { rootMargin: "240px 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let current = true;
    let lease = null;
    setPhotoUrl("");
    setImageReady(false);
    if (!nearViewport || !entry.metadataAvailable) return () => { current = false; };
    getWorkoutPhoto(entry.id)
      .then((record) => {
        if (!current) return;
        if (!record?.blob || !String(record.mimeType || record.blob.type || "").startsWith("image/")) {
          setUnavailable(true);
          onAvailability?.(entry.id, false);
          return;
        }
        setUnavailable(false);
        lease = createObjectUrlLease(record.blob);
        setPhotoUrl(lease.url);
      })
      .catch(() => {
        if (current) { setUnavailable(true); onAvailability?.(entry.id, false); }
      });
    return () => {
      current = false;
      lease?.revoke();
    };
  }, [entry.id, entry.metadataAvailable, nearViewport, onAvailability]);

  return (
    <button
      ref={hostRef}
      type="button"
      className={`workout-photo-timeline-item${unavailable ? " is-unavailable" : ""}${selectionIndex ? " is-compare-selected" : ""}`}
      aria-label={`${selectionMode ? 'Select' : 'View'} photo from ${entry.workoutName}, ${entry.day}`}
      aria-pressed={selectionMode ? Boolean(selectionIndex) : undefined}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="workout-photo-timeline-image">
        {photoUrl && !unavailable && (
          <img
            className={imageReady ? "is-ready" : ""}
            src={photoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => { setImageReady(true); onAvailability?.(entry.id, true); }}
            onError={() => { setUnavailable(true); onAvailability?.(entry.id, false); }}
          />
        )}
        {selectionIndex > 0 && <span className="photo-compare-selection-mark" aria-hidden="true">✓</span>}
        {unavailable ? (
          <span aria-hidden="true">Unavailable</span>
        ) : !imageReady ? (
          <span className="workout-photo-thumbnail-loading" aria-hidden="true">
            <i aria-hidden="true" />
            <small>Loading</small>
          </span>
        ) : null}
      </span>
      <strong>{entry.workoutName}</strong>
      <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(localDate(entry.day))}</small>
    </button>
  );
}

function WorkoutPhotoTimelineScreen({ state, update, close, setDetail }) {
  const [compareMode, setCompareMode] = useState(false);
  const [availability, setAvailability] = useState({});
  const onAvailability = useCallback((id, usable) => setAvailability(current => current[id] === usable ? current : { ...current, [id]: usable }), []);
  const photos = useWorkoutPhotoCollection(state.workouts);
  const [selected, setSelected] = useState(null);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerUnavailable, setViewerUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const entries = photos.entries;
  const groups = useMemo(() => groupWorkoutPhotoTimeline(entries), [entries]);

  useEffect(() => {
    let current = true;
    let lease = null;
    setViewerUrl("");
    setViewerUnavailable(false);
    setViewerLoading(Boolean(selected));
    if (!selected) return () => { current = false; };
    getWorkoutPhoto(selected.id)
      .then((record) => {
        if (!current) return;
        if (!record?.blob) {
          setViewerUnavailable(true);
          return;
        }
        lease = createObjectUrlLease(record.blob);
        setViewerUrl(lease.url);
      })
      .catch(() => { if (current) setViewerUnavailable(true); })
      .finally(() => { if (current) setViewerLoading(false); });
    return () => {
      current = false;
      lease?.revoke();
    };
  }, [selected]);

  const removePhoto = async (photo) => {
    if (!photo || busy) return false;
    setBusy(true);
    try {
      await deleteWorkoutPhoto(photo.id);
      update((current) => {
        const workout = current.workouts.find((item) => item.id === photo.workoutId);
        if (workout?.photoId === photo.id) delete workout.photoId;
        return current;
      });
      onAvailability(photo.id, false);
      setSelected(null);
      setStatus("Photo deleted. Your workout is unchanged.");
      triggerHaptic("tap");
      return true;
    } catch {
      setStatus("Photo couldn’t be deleted. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (compareMode) return <WorkoutPhotoCompare entries={entries} availability={availability} onAvailability={onAvailability} onBack={() => setCompareMode(false)} onClose={close} onDeletePhoto={removePhoto} onViewWorkout={id => setDetail({ completedWorkout: id })} busy={busy} status={status} Header={SheetHeader} Thumbnail={LazyWorkoutPhotoThumbnail} Viewer={PrivateWorkoutPhotoViewer} />;

  return (
    <main className="screen detail-screen workout-photo-timeline-screen">
      <SheetHeader title="Workout photos" onClose={close} closeLabel="Close workout photos" />
      <Eyebrow>PRIVATE TIMELINE</Eyebrow>
      <h1>Your training, over time.</h1>
      <p className="workout-photo-timeline-intro">
        Photos stay on this device. ROOK does not upload or analyze them.
      </p>
      <p className="workout-photo-timeline-status" role="status" aria-live="polite">{status}</p>
      {entries.length >= 2 && <button className="text-button workout-photo-compare-entry" disabled={entries.filter(entry => entry.metadataAvailable && availability[entry.id] === true).length < 2} onClick={() => setCompareMode(true)}>COMPARE</button>}
      {photos.status === "error" && <p role="status">Workout photos couldn’t be read on this device. <button className="text-button" onClick={photos.refresh}>Try again</button></p>}
      {photos.status === "error" ? null : photos.status === "loading" && !entries.length ? (
        <p className="muted">Loading workout photos…</p>
      ) : groups.length ? (
        <div className="workout-photo-timeline-groups">
          {groups.map((group) => (
            <section key={group.key} className="workout-photo-timeline-group">
              <Eyebrow>{group.label}</Eyebrow>
              <div className="workout-photo-timeline-grid">
                {group.entries.map((entry) => (
                  <LazyWorkoutPhotoThumbnail
                    key={entry.id}
                    entry={entry}
                    onAvailability={onAvailability}
                    onOpen={() => setSelected(entry)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : photos.status === "ready" ? (
        <section className="workout-photo-timeline-empty">
          <strong>No workout photos yet.</strong>
          <p>If you ever save one after a workout, it will appear here. Photos are always optional.</p>
        </section>
      ) : null}
      {selected && !viewerLoading && (viewerUrl || viewerUnavailable) && (
        <PrivateWorkoutPhotoViewer
          photoUrl={viewerUrl}
          workout={selected.workout}
          busy={busy}
          onClose={() => setSelected(null)}
          onDelete={() => removePhoto(selected)}
          onViewWorkout={() => setDetail({ completedWorkout: selected.workoutId })}
        />
      )}
    </main>
  );
}

function WorkoutPhotoMemory({ workout, update }) {
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(workout.photoId));
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let current = true;
    let objectUrl = "";
    setPhotoUrl("");
    setMissing(false);
    setLoading(Boolean(workout.photoId));
    if (!workout.photoId) return () => { current = false; };
    getWorkoutPhoto(workout.photoId)
      .then((record) => {
        if (!current) return;
        if (!record?.blob) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(record.blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => {
        if (current) setMissing(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workout.photoId]);

  const updateReference = (photoIdValue) =>
    update((current) => {
      const stored = current.workouts.find((item) => item.id === workout.id);
      if (!stored) return current;
      if (photoIdValue) stored.photoId = photoIdValue;
      else delete stored.photoId;
      return current;
    });

  const choosePhoto = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || busy) return;
    const previousPhotoId = workout.photoId;
    setBusy(true);
    setStatus("Saving photo…");
    try {
      const saved = await saveWorkoutPhoto(workout.id, file);
      updateReference(saved.id);
      if (previousPhotoId && previousPhotoId !== saved.id)
        deleteWorkoutPhoto(previousPhotoId).catch(() => {});
      setStatus("Photo saved with this workout.");
      triggerHaptic("success");
    } catch {
      setStatus("Photo couldn’t be saved. Your workout was saved.");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!workout.photoId || busy) return;
    setBusy(true);
    setStatus("Deleting photo…");
    try {
      await deleteWorkoutPhoto(workout.photoId);
      updateReference(null);
      setViewerOpen(false);
      setConfirmDelete(false);
      setStatus("Photo deleted. Your workout is unchanged.");
      triggerHaptic("tap");
    } catch {
      setStatus("Photo couldn’t be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const picker = (
    <label className={`workout-photo-picker${busy ? " is-disabled" : ""}`}>
      <span>{workout.photoId ? "CHANGE PHOTO" : "ADD PHOTO"}</span>
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        aria-label={workout.photoId ? "Change workout photo" : "Add workout photo"}
        onChange={choosePhoto}
      />
    </label>
  );

  return (
    <section className="workout-photo-memory" aria-labelledby={`workout-photo-title-${workout.id}`}>
      <div className="workout-photo-heading">
        <Eyebrow>WORKOUT PHOTO · OPTIONAL</Eyebrow>
        <p id={`workout-photo-title-${workout.id}`}>
          Save a post-workout photo to look back on your progress over time.
          <small>Stored privately on this device.</small>
        </p>
      </div>
      {loading ? (
        <p className="workout-photo-loading">Loading photo…</p>
      ) : photoUrl ? (
        <>
          <button
            type="button"
            className="workout-photo-thumbnail"
            aria-label="View workout photo"
            onClick={() => setViewerOpen(true)}
          >
            <img src={photoUrl} alt="Private workout photo" />
            <span>VIEW PHOTO</span>
          </button>
          <div className="workout-photo-actions">
            {picker}
            <button
              type="button"
              className="workout-photo-delete-inline"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              DELETE
            </button>
          </div>
        </>
      ) : missing ? (
        <div className="workout-photo-missing">
          <p>Photo unavailable on this device.</p>
          <button type="button" onClick={() => updateReference(null)}>
            REMOVE REFERENCE
          </button>
        </div>
      ) : (
        picker
      )}
      <p className="workout-photo-status" role="status" aria-live="polite">
        {status}
      </p>
      {viewerOpen && photoUrl && (
        <PrivateWorkoutPhotoViewer
          photoUrl={photoUrl}
          workout={workout}
          busy={busy}
          onClose={() => setViewerOpen(false)}
          onDelete={removePhoto}
        />
      )}
      {confirmDelete && !viewerOpen && (
        <div className="workout-photo-delete-confirm inline" role="group" aria-label="Confirm photo deletion">
          <p>Delete this photo? Your workout will remain saved.</p>
          <button type="button" onClick={() => setConfirmDelete(false)}>KEEP PHOTO</button>
          <button type="button" disabled={busy} onClick={removePhoto}>DELETE PHOTO</button>
        </div>
      )}
    </section>
  );
}

function ExportSheet({ request, state, close }) {
  const hasNotes = state.program.days.some((day) =>
    hasWorkoutExportNotes(day),
  );
  const [includeNotes, setIncludeNotes] = useState(false);
  const [feedback, setFeedback] = useState("");
  const artifact = useMemo(
    () =>
      buildWeeklyPlanExport({
        state,
        date: request.date,
        units: state.profile.units,
        includeNotes,
      }),
    [includeNotes, request.date, state],
  );
  const shareAvailable =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    try {
      await navigator.share({ title: artifact.title, text: artifact.text });
      setFeedback("Shared.");
    } catch (error) {
      if (error?.name !== "AbortError")
        setFeedback("Couldn’t open sharing. Try Copy instead.");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.text);
      setFeedback("Copied to clipboard.");
    } catch {
      setFeedback("Couldn’t copy. Download the text file instead.");
    }
  };
  const download = () => {
    try {
      const url = URL.createObjectURL(
        new Blob([artifact.text], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = artifact.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setFeedback(`Downloaded ${artifact.filename}.`);
    } catch {
      setFeedback("Couldn’t download the file. Try Copy instead.");
    }
  };
  return (
    <main className="screen detail-screen content-fit-screen export-sheet">
      <SheetHeader
        title="Export workout plan"
        onClose={close}
        closeLabel="Close export workout plan"
      />
      <Eyebrow className="export-plan-label">EXPORT PLAN</Eyebrow>
      <h1>{artifact.title}</h1>
      <p className="export-plan-type">Weekly plan</p>
      <div className="export-helper">
        <p>A text version of your plan, generated privately on this device.</p>
        <small>Nothing is uploaded by ROOK.</small>
      </div>
      {hasNotes && (
        <SettingSwitch
          className="export-notes-toggle"
          label="Include notes"
          help="Off by default for privacy"
          checked={includeNotes}
          onChange={setIncludeNotes}
        />
      )}
      <Eyebrow className="export-preview-label">PREVIEW</Eyebrow>
      <pre className="export-preview">{artifact.text}</pre>
      <SheetActionFooter className="export-action-footer">
      <div className="export-actions">
        {shareAvailable && <Button onClick={share}>SHARE</Button>}
        <Button variant={shareAvailable ? "secondary" : "dark"} onClick={copy}>
          COPY
        </Button>
        <Button variant="quiet" onClick={download}>DOWNLOAD .TXT</Button>
      </div>
      <p className="export-feedback" role="status" aria-live="polite">
        {feedback}
      </p>
      </SheetActionFooter>
    </main>
  );
}

function WorkoutSessionLog({ exercises, units, label = "SESSION LOG", emptyCopy }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <section className="complete-session-log">
      <Eyebrow>{label}</Eyebrow>
      {exercises.length ? (
        exercises.map((exercise, exerciseIndex) => {
          const planned = exercise.sets.length;
          const logged = exercise.sets.filter((set) => set.completed).length;
          const itemId = exercise.id || `${exercise.exerciseId}-${exerciseIndex}`;
          const disclosureId = `session-log-sets-${String(itemId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const expanded = expandedId === itemId;
          return (
            <div
              className={`session-log-item${expanded ? " is-expanded" : ""}`}
              key={itemId}
            >
              <button
                type="button"
                className="list-row session-log-trigger"
                aria-expanded={expanded}
                aria-controls={disclosureId}
                onClick={() => setExpandedId(expanded ? null : itemId)}
              >
                <strong>{exerciseName(exercise)}</strong>
                <span className="session-log-summary">
                  <span>
                    {logged} / {pluralize(planned, loggingUnit(exercise))}
                  </span>
                </span>
              </button>
              <div
                id={disclosureId}
                className="session-log-details"
                aria-hidden={!expanded}
              >
                <div>
                  {exercise.sets.map((set, setIndex) => {
                    const parts = sessionLogSetParts(
                      exercise,
                      set,
                      setIndex,
                      units,
                    );
                    return (
                      <div
                        className={`session-log-set${set.completed ? "" : " is-unlogged"}`}
                        key={set.id || setIndex}
                      >
                        {parts.map((part, partIndex) => (
                          <span key={`${part}-${partIndex}`}>{part}</span>
                        ))}
                      </div>
                    );
                  })}
                  {(exercise.personalNote || exercise.sets.some(s=>s.rawImport?.version===2)&&exercise.notes) && <p className="sheet-footnote">{[...new Set([exercise.personalNote,exercise.sets.some(s=>s.rawImport?.version===2)?exercise.notes:null].filter(Boolean))].join('\n')}</p>}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <p className="muted">{emptyCopy || "No completed sets were recorded."}</p>
      )}
    </section>
  );
}

export function CompletedWorkoutDetail({ workoutId, state, update, close, setPage }) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteRef = useRef(false);
  const detailRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const confirmationRef = useRef(null);
  const liveDeleteState = useRef(state);
  liveDeleteState.current = state;
  useEffect(() => {
    const panel = confirmationRef.current;
    const guard = event => { if (deleteRef.current) event.preventDefault(); };
    panel?.addEventListener('rook:before-sheet-close', guard);
    return () => panel?.removeEventListener('rook:before-sheet-close', guard);
  }, [deleting]);
  if (!workout) return null;
  if (editing) return <HistoryCorrectionEditor workout={workout} state={state} update={update} onDone={()=>setEditing(false)} closeSheet={close} Header={SheetHeader}/>;
  const summary = workoutSetSummary(workout);
  const date = workoutPlanDate(workout);
  const canResume = completedWorkoutCanResume(state, workout.id);
  const resume = () => {
    const resumedAt = Date.now();
    update((current) =>
      resumeCompletedWorkout(
        current,
        workout.id,
        resumedAt,
        `ui-resume:${workout.id}:${workout.completedAt}`,
      ),
    );
    close();
    setPage("workout");
  };
  return (
    <main ref={detailRef} className="screen detail-screen completed-workout-detail">
      <SheetHeader
        title="Workout details"
        onClose={close}
        closeLabel="Close workout details"
      />
      <Eyebrow>{date ? displayDate(localDate(date)) : "COMPLETED WORKOUT"}</Eyebrow>
      <h1>{workout.name}</h1>
      <CombinedProvenance adjustment={workout.adjustment} />
      {isCombinedAdjustment(workout.adjustment) && !workout.combinedSourcesResolved && <small>Finished early · source sessions remain available</small>}
      <div className="completed-workout-detail-actions">
        <button type="button" className="text-button" onClick={()=>setEditing(true)}>Edit</button>
        <button ref={deleteTriggerRef} type="button" className="text-button danger-text"
          aria-label="Delete workout" aria-haspopup="dialog" aria-expanded={deleting}
          disabled={Boolean(state.activeWorkout || state.activeOptionalSession)}
          onClick={()=>{setDeleteError('');setDeleting(true);}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
          Delete
        </button>
      </div>
      {(state.activeWorkout || state.activeOptionalSession) && <small>Finish your active workout before deleting history.</small>}
      {workout.flexibleWeekMoved && workout.originalScheduledDate && <small className="completed-adjustment-marker">Originally planned for {displayDate(localDate(workout.originalScheduledDate))}</small>}
      {workout.adjustment && (
        <small className="completed-adjustment-marker">Adjusted workout · Today only</small>
      )}
      {workout.historicalImport && (
        <small className="completed-import-marker">
          Imported from {workout.historicalImport.sourceLabel || "workout history"}
        </small>
      )}
      {workout.photoId && (
        <small className="completed-photo-marker">Private photo saved</small>
      )}
      <div className="completed-workout-summary">
        <span>
          <strong>{workout.historicalImport?.version===2 && workout.durationSeconds==null ? 'Not recorded' : formatDuration(workout.durationSeconds)}</strong>
          <small>DURATION</small>
        </span>
        <span>
          <strong>{summary.completed} / {summary.total}</strong>
          <small>SETS</small>
        </span>
      </div>
      <WorkoutPhotoMemory workout={workout} update={update} />
      <SessionNoteEditor workout={workout} update={update} />
      <SessionFeedbackDisplay value={workout.sessionFeedback} />
      <WorkoutSessionLog
        exercises={workout.exercises}
        units={state.profile.units}
      />
      {canResume && (
        <section className="completed-workout-resume">
          {confirmingResume ? (
            <div className="completed-workout-resume-confirm" role="alert">
              <Eyebrow>RESUME SESSION</Eyebrow>
              <h2>Resume this workout?</h2>
              <p>
                Its empty completion will be removed from your progress, and
                the workout will reopen where you left it. Your weekly plan
                won’t change.
              </p>
              <div>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingResume(false)}
                >
                  CANCEL
                </Button>
                <Button onClick={resume}>RESUME WORKOUT</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="choice-row completed-workout-resume-option"
              onClick={() => setConfirmingResume(true)}
            >
              <strong>Resume workout</strong>
              <small>Reopen this accidentally completed empty session.</small>
            </button>
          )}
        </section>
      )}
      {deleting && createPortal(
        <ModalLayer backgroundRef={detailRef} returnFocusRef={deleteTriggerRef} lockDocument={false} close={() => setDeleting(false)}>
          {requestClose => <main ref={confirmationRef} className="screen detail-screen completed-workout-delete-confirm">
            <SheetHeader title="Delete workout" onBack={deleteBusy ? undefined : requestClose} backLabel="Back to workout details" />
            <h1>Delete this workout?</h1>
            <p>This removes the logged workout and recalculates your progress. Your training plan is unchanged.</p>
            <p>Any photos attached to this workout will also be deleted. This cannot be undone.</p>
            <strong>{workout.name}</strong>
            {deleteError && <p role="alert" className="offline-banner">{deleteError}</p>}
            <SheetActionFooter>
              <Button variant="danger" disabled={deleteBusy} onClick={async () => {
                if(deleteRef.current) return;
                deleteRef.current=true;setDeleteBusy(true);setDeleteError('');
                try {
                  const next=await deleteCompletedWorkout(state,workoutId,{isCurrent:()=>liveDeleteState.current===state});
                  update(()=>next,{planVersion:false,persistedState:next});close();
                } catch(error) {
                  if(error.code==='rollback-failed') { location.reload(); return; }
                  setDeleteError('Workout could not be deleted. Your saved data has not been replaced. Try again.');
                } finally {deleteRef.current=false;setDeleteBusy(false);}
              }}>{deleteBusy?'DELETING…':'DELETE WORKOUT'}</Button>
              <Button variant="quiet" disabled={deleteBusy} data-sheet-initial-focus onClick={requestClose}>CANCEL</Button>
            </SheetActionFooter>
          </main>}
        </ModalLayer>, document.body,
      )}
    </main>
  );
}

function Complete({ state, update, setPage, setDetail, liveFinish, persistenceFailed }) {
  const session = state.workouts.at(-1);
  const [liveEntry] = useState(()=>Boolean(liveFinish && !liveFinish.presented && liveFinish.startedAt===session?.startedAt));
  const [motionCancelled,setMotionCancelled] = useState(false);
  useEffect(()=>{if(persistenceFailed)setMotionCancelled(true);},[persistenceFailed]);
  const recognition = useMemo(()=>liveFinish?.startedAt===session?.startedAt ? completionRecognition(session,liveFinish.priorWorkouts,{eligible:exercise=>exerciseSupportsEstimatedOneRepMax(exercise)&&! /assist/i.test(exerciseName(exercise))}) : null,[liveFinish,session?.id]);
  const headingRef = useRef(null);
  const completionFeedbackSentRef = useRef(false);
  const completedExercises = (session?.exercises || []).filter((item) =>
    item.sets.some((set) => set.completed),
  );
  const summary = session
    ? workoutSetSummary(session)
    : { completed: 0, total: 0 };
  const endedEarly = Boolean(
    session &&
      (session.status === "ended-early" || summary.completed === 0 || summary.completed < summary.total),
  );
  const setResult = endedEarly
    ? `${summary.completed} of ${pluralize(summary.total, "set")}`
    : pluralize(summary.completed, "set");
  const visibleExercises = endedEarly ? session.exercises : completedExercises;
  useEffect(() => {
    if (!session || !liveEntry || completionFeedbackSentRef.current || liveFinish.presented) return;
    completionFeedbackSentRef.current = true;
    liveFinish.presented = true;
    requestAnimationFrame(() => {
      if (!headingRef.current) return;
      // useLiftState writes in an effect. Do not confirm a failed local write
      // with a success haptic; this read never changes persistence behavior.
      try {
        const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!persistenceFailed && stored?.workouts?.some(w=>w.id===session.id && w.completedAt===session.completedAt))
          triggerHaptic(endedEarly ? "success" : "complete");
      } catch { /* The existing persistence warning remains the error surface. */ }
      headingRef.current.focus({ preventScroll: true });
    });
  }, [endedEarly, session?.id, liveEntry, liveFinish, persistenceFailed]);
  if (!session) return null;
  return (
    <main
      className={`screen complete-screen ${endedEarly ? "ended-early" : ""} ${liveEntry && !persistenceFailed && !motionCancelled ? "is-live-completion" : ""}`}
    >
      <div className="complete-mark" aria-hidden="true">
        <span>✓</span>
      </div>
      <h1 ref={headingRef} tabIndex={-1} aria-describedby={!persistenceFailed && recognition ? "completion-recognition" : undefined}>
        {summary.completed===0 ? "Workout ended" : endedEarly ? "Workout ended early" : "Workout complete"}
      </h1>
      <div className="stat-grid">
        <div>
          <strong>{session.name}</strong>
          <small>SESSION</small>
        </div>
        <div>
          <strong>{formatDuration(session.durationSeconds)}</strong>
          <small>DURATION</small>
        </div>
        <div>
          <strong>{setResult}</strong>
          <small>{endedEarly ? "COMPLETED" : "LOGGED"}</small>
        </div>
      </div>
      {!persistenceFailed && recognition && <p id="completion-recognition" className="completion-recognition">
        <strong>{recognition.label}</strong>
        {recognition.type==='pr' && <span>{exerciseName(recognition.exercise)} · {recognition.record.repPr || recognition.record.weightPr
          ? `${displayWeight(recognition.record.weight,state.profile.units)} ${weightUnit(state.profile.units)} × ${recognition.record.reps}`
          : `${displayEstimatedOneRepMax(recognition.record.estimatedOneRepMax,state.profile.units)} ${weightUnit(state.profile.units)} estimated`}</span>}
      </p>}
      <WorkoutPhotoMemory workout={session} update={update} />
      <SessionNoteEditor workout={session} update={update} />
      <SessionFeedbackPrompt key={session.id} workout={session} state={state} update={update} />
      <WorkoutSessionLog
        exercises={visibleExercises}
        units={state.profile.units}
        label={endedEarly ? "SESSION LOG" : "LOGGED"}
      />
      <section className="coach-note">
        <Eyebrow>{endedEarly ? "SAVED" : "NEXT SESSION"}</Eyebrow>
        <p>
          {endedEarly
            ? "Completed sets were saved. Incomplete sets were left unlogged."
            : "Completed values are saved. They will appear as real previous-session data the next time this exercise is programmed."}
        </p>
      </section>
      <div className="complete-done-dock">
        <Button
          variant="primary"
          className="complete-done"
          onClick={() => {
            if (workoutPlanDate(session) !== isoDay())
              update((current) => {
                current.selectedDate = isoDay();
                current.selectedDay = weekday();
                return current;
              });
            setPage("today");
          }}
        >
          DONE
        </Button>
      </div>
    </main>
  );
}
function ScheduleActionCard({ action, result, state, onAccept, onViewToday }) {
  const schedule = currentWeekSchedule(state);
  const workoutName = (id) =>
    schedule.find((item) => item.workoutId === id)?.workout.name || "Workout";
  if (result?.status === "applied")
    return (
      <div className="action-card action-card-applied">
        <h3>This week updated</h3>
        <div className="action-applied" role="status">
          ✓ APPLIED TO THIS WEEK
        </div>
        <small>Your schedule has been updated.</small>
        <button className="text-button action-view-today" onClick={onViewToday}>
          View this week →
        </button>
      </div>
    );
  return (
    <div className="action-card schedule-action-card">
      <h3>Review proposed change</h3>
      <p>{action.explanation}</p>
      {action.changes.map((change) => (
        <div className="schedule-change" key={change.workoutId}>
          <span>
            <Eyebrow>{weekday(change.toDate)}</Eyebrow>
            <strong>{workoutName(change.workoutId)}</strong>
            <small>Moved from {displayDate(localDate(change.fromDate))}</small>
          </span>
          <span>
            <Eyebrow>{weekday(change.fromDate)}</Eyebrow>
            <strong>Rest</strong>
          </span>
        </div>
      ))}
      <small>
        Other sessions stay unchanged. Nothing moves until you apply it.
      </small>
      <Button onClick={() => onAccept(action)}>APPLY TO THIS WEEK</Button>
    </div>
  );
}
function ProgramExerciseActionCard({
  action,
  result,
  state,
  onAccept,
  onUndo,
  onViewToday,
}) {
  const workoutName = (id) =>
    state.program?.days.find((day) => day.id === id)?.name || "Workout";
  if (result?.status === "conflict")
    return (
      <div className="action-card action-card-conflict" role="status">
        <h3>Plan changed</h3>
        <p>This proposal is out of date. Ask Coach to prepare it again.</p>
        <button className="text-button action-view-today" onClick={onViewToday}>
          View program →
        </button>
      </div>
    );
  if (result?.status === "applied")
    return (
      <div className="action-card action-card-applied">
        <h3>Program updated</h3>
        <div className="action-applied" role="status">
          ✓ APPLIED TO PROGRAM
        </div>
        <small>Your recurring workouts now include the reviewed changes.</small>
        <button className="text-button action-view-today" onClick={onViewToday}>
          View program →
        </button>
        {result.undoSnapshot && (
          <button className="text-button" onClick={onUndo}>
            Undo
          </button>
        )}
      </div>
    );
  return (
    <div className="action-card program-action-card">
      <h3>Review program changes</h3>
      <p>{action.explanation}</p>
      {action.changes.map((change) => (
        <div className="program-change" key={change.workoutId}>
          <Eyebrow>{workoutName(change.workoutId)}</Eyebrow>
          {(change.operations || []).map((operation) => (
            <span
              className={
                operation.type === "replace"
                  ? "program-change-replace"
                  : "program-change-remove"
              }
              key={`${operation.type}-${operation.exerciseEntryId}`}
            >
              <i>{operation.type === "replace" ? "→" : "−"}</i>
              <strong>
                {exerciseCatalog[operation.fromExerciseId]?.name || "Exercise"}
                {operation.type === "replace" && (
                  <> → {exerciseCatalog[operation.toExerciseId]?.name || "Exercise"}</>
                )}
              </strong>
            </span>
          ))}
          {(change.addExerciseIds || []).map((id) => (
            <span className="program-change-add" key={`add-${id}`}>
              <i>+</i>
              <strong>{exerciseCatalog[id]?.name || "Exercise"}</strong>
            </span>
          ))}
          {(change.removeExerciseIds || []).map((id) => (
            <span className="program-change-remove" key={`remove-${id}`}>
              <i>−</i>
              <strong>{exerciseCatalog[id]?.name || "Exercise"}</strong>
            </span>
          ))}
        </div>
      ))}
      <small>Nothing changes until you apply it.</small>
      <Button onClick={() => onAccept(action)}>APPLY TO PROGRAM</Button>
    </div>
  );
}
function OptionalWorkoutActionCard({ action, result, onAccept, onViewToday }) {
  const target = localDate(action.targetDate || result?.targetDate || isoDay());
  const isToday = isoDay(target) === isoDay();
  const dayName = new Intl.DateTimeFormat("en", { weekday: "long" }).format(
    target,
  );
  const destination = isToday ? "today" : dayName;
  if (result?.status === "applied")
    return (
      <div className="action-card action-card-applied">
        <h3>Workout added</h3>
        <div className="action-applied" role="status">
          ✓ APPLIED TO {isToday ? "TODAY" : dayName.toUpperCase()}
        </div>
        <small>
          {result.workoutName} is ready on {destination}. Your recurring plan
          was not changed.
        </small>
        <button className="text-button action-view-today" onClick={onViewToday}>
          View {destination}’s workout →
        </button>
      </div>
    );
  return (
    <div className="action-card optional-workout-action">
      <h3>{action.name}</h3>
      <p>{action.explanation}</p>
      <div className="optional-workout-meta">
        <strong>{pluralize(action.exerciseIds.length, "exercise")}</strong>
        <span>~{roundedEstimate(action.minutes)} min</span>
      </div>
      <Eyebrow>COACH SUGGESTS</Eyebrow>
      <div className="optional-workout-list">
        {action.exerciseIds.map((id) => (
          <div key={id}>
            <span aria-hidden="true">+</span>
            <strong>{exerciseCatalog[id]?.name || "Exercise"}</strong>
          </div>
        ))}
      </div>
      <small>
        This adds one optional workout on {destination}. Your weekly program and
        schedule stay unchanged.
      </small>
      <Button onClick={() => onAccept(action)}>{action.label}</Button>
    </div>
  );
}
function AdaptActionCard({
  action,
  result,
  state,
  onAccept,
  onUndo,
  onViewToday,
}) {
  const target = localDate(action.targetDate || result?.targetDate || isoDay());
  const isToday = isoDay(target) === isoDay();
  const dayName = new Intl.DateTimeFormat("en", { weekday: "long" }).format(
    target,
  );
  const source =
    action.type === "adapt-today"
      ? (isToday && state.activeWorkout) ||
        state.program?.days.find((day) => day.id === action.programDayId) ||
        plannedWorkoutForDate(state, target)
      : null;
  const sourceExercises = source?.exercises || [];
  const sourceIds = sourceExercises.map((exercise) => exercise.exerciseId);
  const validSuggestedIds = [...new Set(action.exerciseIds || [])].filter(
    (id) => sourceIds.includes(id) || exerciseCatalog[id],
  );
  const targetSets = new Map(
    (action.setTargets || []).map((item) => [
      item.exerciseId,
      Number(item.sets),
    ]),
  );
  const lockedIds = new Set(
    state.activeWorkout && source === state.activeWorkout
      ? sourceExercises
          .filter(
            (exercise, index) =>
              index === state.activeWorkout.exerciseIndex ||
              exercise.sets.some((set) => set.completed),
          )
          .map((exercise) => exercise.exerciseId)
      : [],
  );
  const initialIds = [...new Set([...validSuggestedIds, ...lockedIds])];
  const [reviewing, setReviewing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const actionsRef = useRef(null);
  useEffect(() => {
    setSelectedIds(initialIds);
    setReviewing(false);
  }, [
    action.targetDate,
    action.workoutId,
    action.programDayId,
    (action.exerciseIds || []).join("|"),
    (action.setTargets || [])
      .map((item) => `${item.exerciseId}:${item.sets}`)
      .join("|"),
  ]);
  useLayoutEffect(() => {
    if (!reviewing) return;
    const scroller = actionsRef.current?.closest(".coach-scroll");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [reviewing, selectedIds.join("|")]);
  const displayIds = [
    ...sourceIds,
    ...validSuggestedIds.filter((id) => !sourceIds.includes(id)),
  ];
  const setCountFor = (id) => {
    const sourceExercise = sourceExercises.find(
      (item) => item.exerciseId === id,
    );
    return Math.max(
      1,
      Math.min(
        sourceExercise?.sets.length || 3,
        targetSets.get(id) || sourceExercise?.sets.length || 2,
      ),
    );
  };
  const materialize = (id) => {
    const existing = sourceExercises.find((item) => item.exerciseId === id);
    return existing
      ? { ...existing, sets: existing.sets.slice(0, setCountFor(id)) }
      : {
          exerciseId: id,
          sets: Array.from({ length: setCountFor(id) }, () => ({})),
          restSeconds: exerciseCatalog[id]?.restSeconds || 90,
        };
  };
  const selected = new Set(selectedIds);
  const selectedExercises = displayIds
    .filter((id) => selected.has(id))
    .map(materialize);
  const selectedMinutes = estimateSessionMinutes(selectedExercises);
  const selectedSetCount = selectedExercises.reduce(
    (sum, exercise) => sum + exercise.sets.length,
    0,
  );
  const suggestedExercises = validSuggestedIds.map(materialize);
  const suggestedMinutes = estimateSessionMinutes(suggestedExercises);
  const requestedMinutes = Number(action.requestedMinutes || action.minutes);
  const toggleExercise = (id) => {
    if (lockedIds.has(id)) return;
    setSelectedIds((current) =>
      current.includes(id)
        ? current.length > 1
          ? current.filter((value) => value !== id)
          : current
        : [...current, id],
    );
  };
  const reviewedIds = displayIds.filter((id) => selected.has(id));
  const reviewedAction = {
    ...action,
    exerciseIds: reviewedIds,
    setTargets: reviewedIds.map((id) => ({
      exerciseId: id,
      sets: setCountFor(id),
    })),
    addedExerciseIds: reviewedIds.filter((id) => !sourceIds.includes(id)),
    skippedExerciseIds: sourceIds.filter((id) => !selected.has(id)),
    requestedMinutes,
    estimatedMinutes: selectedMinutes,
    minutes: requestedMinutes,
  };
  const nameFor = (id) => {
    const exercise =
      sourceExercises.find((item) => item.exerciseId === id) ||
      state.program?.days
        .flatMap((day) => day.exercises)
        .find((item) => item.exerciseId === id);
    return exercise
      ? exerciseName(exercise)
      : exerciseCatalog[id]?.name || "Exercise";
  };
  const skippedIds = (action.skippedExerciseIds || []).length
    ? action.skippedExerciseIds
    : sourceIds.filter((id) => !validSuggestedIds.includes(id));
  const skippedNames = skippedIds.map(nameFor);
  const suggestionRow = (id) => {
    const original = sourceExercises.find((item) => item.exerciseId === id)
      ?.sets.length;
    const sets = setCountFor(id);
    return (
      <div className="adapt-suggestion-row" key={id}>
        <strong>{nameFor(id)}</strong>
        <small>
          {original
            ? sets < original
              ? `${sets} of ${original} sets`
              : pluralize(sets, "set")
            : `New · ${pluralize(sets, "set")}`}
        </small>
      </div>
    );
  };
  if (result?.status === "conflict")
    return (
      <div className="action-card action-card-conflict" role="status">
        <h3>Today’s workout changed</h3>
        <p>
          This proposal was based on an earlier version of the workout. Ask
          Coach to refresh it before applying changes.
        </p>
        <small>Your newer workout entries were kept.</small>
      </div>
    );
  if (result?.status === "undo-conflict")
    return (
      <div className="action-card action-card-conflict" role="status">
        <h3>Workout changed since this update</h3>
        <p>Undo is no longer available because newer workout changes were kept.</p>
      </div>
    );
  if (result?.status === "undone")
    return (
      <div className="action-card action-card-applied" role="status">
        <h3>Changes undone</h3>
        <small>Your previous workout structure is restored.</small>
        <button className="text-button action-view-today" onClick={onViewToday}>
          View workout →
        </button>
      </div>
    );
  if (result?.status === "applied")
    return (
      <div
        className="action-card action-card-applied today-update-confirmation"
        role="status"
        aria-live="polite"
      >
        <span className="today-update-check" aria-hidden="true">
          ✓
        </span>
        <div className="today-update-copy">
          <h3>{isToday ? "Today" : dayName} updated</h3>
          <small>
            Your changes are applied to {isToday ? "today’s" : `${dayName}’s`}{" "}
            {result.workoutName}.
          </small>
          <button
            className="text-button action-view-today"
            onClick={onViewToday}
          >
            View workout →
          </button>
          {result.undoSnapshot && (
            <button className="text-button action-undo" onClick={onUndo}>
              Undo
            </button>
          )}
        </div>
      </div>
    );
  if (!isToday)
    return (
      <div className="action-card">
        <h3>Shorten {dayName}’s workout</h3>
        <p>
          {validSuggestedIds.length} exercises ·{" "}
          {validSuggestedIds.reduce((sum, id) => sum + setCountFor(id), 0)} sets
        </p>
        <p className="adapt-duration-contract">
          {adaptationDurationLabel(requestedMinutes, suggestedMinutes)}
        </p>
        <Eyebrow>COACH SUGGESTS</Eyebrow>
        <div className="adapt-suggestion-list">
          {validSuggestedIds.map(suggestionRow)}
        </div>
        {(action.skippedExerciseIds || []).length > 0 && (
          <p className="adapt-skip-summary">
            Skip {action.skippedExerciseIds.length}{" "}
            {action.skippedExerciseIds.length === 1 ? "exercise" : "exercises"}{" "}
            on {dayName}
          </p>
        )}
        <Button
          onClick={() =>
            onAccept({
              ...action,
              requestedMinutes,
              estimatedMinutes: suggestedMinutes,
            })
          }
        >
          {action.label}
        </Button>
        <small>Nothing changes until you apply it.</small>
      </div>
    );
  return (
    <div className={`action-card ${reviewing ? "action-card-reviewing" : ""}`}>
      <h3>
        {reviewing ? "Review the shorter workout" : "Shorten today’s workout"}
      </h3>
      <p>
        {reviewing
          ? `${selectedExercises.length} exercises · ${selectedSetCount} sets`
          : `${validSuggestedIds.length} exercises · ${validSuggestedIds.reduce((sum, id) => sum + setCountFor(id), 0)} sets`}
      </p>
      <p className="adapt-duration-contract">
        {adaptationDurationLabel(
          requestedMinutes,
          reviewing ? selectedMinutes : suggestedMinutes,
        )}
      </p>
      {reviewing ? (
        <div className="adapt-review-list">
          {displayIds.map((id) => {
            const exercise = sourceExercises.find(
              (item) => item.exerciseId === id,
            );
            const checked = selected.has(id);
            const locked = lockedIds.has(id);
            const original = exercise?.sets.length;
            const sets = setCountFor(id);
            return (
              <button
                type="button"
                key={exercise?.id || id}
                className={checked ? "selected" : ""}
                aria-pressed={checked}
                disabled={locked}
                onClick={() => toggleExercise(id)}
              >
                <span className="adapt-check" aria-hidden="true">
                  {checked ? "✓" : ""}
                </span>
                <span>
                  <strong>{nameFor(id)}</strong>
                  <small>
                    {locked
                      ? exercise?.sets.some((set) => set.completed)
                        ? `Already logged · ${pluralize(sets, "set")} kept`
                        : `Current exercise · ${pluralize(sets, "set")} kept`
                      : checked
                        ? original
                          ? sets < original
                            ? `Keep · ${sets} of ${original} sets`
                            : `Keep · ${pluralize(sets, "set")}`
                          : `Add · ${pluralize(sets, "set")}`
                        : "Skip today"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <Eyebrow>COACH SUGGESTS</Eyebrow>
          <div className="adapt-suggestion-list">
            {validSuggestedIds.map(suggestionRow)}
          </div>
          {skippedNames.length > 0 && (
            <p className="adapt-skip-summary">
              Skip today: {skippedNames.join(", ")}
            </p>
          )}
        </>
      )}
      <div ref={actionsRef} className="action-card-buttons">
        {reviewing ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedIds(initialIds);
                setReviewing(false);
              }}
            >
              CANCEL
            </Button>
            <Button onClick={() => onAccept(reviewedAction)}>
              APPLY CHANGES
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setReviewing(true)}>
              REVIEW CHANGES
            </Button>
            <Button
              onClick={() =>
                onAccept({
                  ...action,
                  requestedMinutes,
                  estimatedMinutes: suggestedMinutes,
                })
              }
            >
              {action.label}
            </Button>
          </>
        )}
      </div>
      <small>Nothing changes until you apply it.</small>
    </div>
  );
}
function ActionCard(props) {
  return props.action.type === "combine-workouts" ? <CoachCombineCard {...props} /> : props.action.type === "week-schedule-change" ? (
    <ScheduleActionCard {...props} />
  ) : props.action.type === "program-exercise-change" ? (
    <ProgramExerciseActionCard {...props} />
  ) : props.action.type === "add-today-workout" ? (
    <OptionalWorkoutActionCard {...props} />
  ) : props.action.type === "resume-empty-completed-workout" ? (
    <ResumeWorkoutActionCard {...props} />
  ) : (
    <AdaptActionCard {...props} />
  );
}

function ResumeWorkoutActionCard({ action, result, state, onAccept, onViewWorkout }) {
  const workout = state.workouts.find(
    (item) => item.id === action.targetCompletedWorkoutId,
  );
  if (result?.status === "conflict")
    return (
      <div className="action-card action-card-conflict" role="status">
        <h3>Workout can’t be resumed</h3>
        <p>It changed, was already resumed, or another workout is now active.</p>
      </div>
    );
  if (result?.status === "applied")
    return (
      <div className="action-card action-card-applied" role="status">
        <h3>Workout resumed</h3>
        <small>The empty completion is no longer counted in your progress.</small>
        <button className="text-button action-view-today" onClick={onViewWorkout}>
          Continue workout →
        </button>
      </div>
    );
  if (!workout) return null;
  return (
    <div className="action-card resume-workout-action-card">
      <Eyebrow>CORRECT EMPTY COMPLETION</Eyebrow>
      <h3>Resume {workout.name}</h3>
      <p>
        Reopen the frozen workout from {displayDate(localDate(action.trainingDate))}.
        Your weekly plan and other history stay unchanged.
      </p>
      <Button onClick={() => onAccept(action)}>RESUME WORKOUT</Button>
      <small>Nothing changes until you apply it.</small>
    </div>
  );
}
function CoachReply({ text, thinking = false }) {
  const paragraphs = thinking
    ? []
    : normalizeCoachText(text)
        .split(/\n{2,}/)
        .map((value) => value.trim())
        .filter(Boolean);
  return (
    <div
      className={`coach-message ${thinking ? "coach-thinking" : ""}`}
      role={thinking ? "status" : undefined}
    >
      <header>
        <span aria-hidden="true">R</span>
        <strong>ROOK COACH</strong>
      </header>
      {thinking ? (
        <>
          <div className="thinking-dots" aria-label="Coach is thinking">
            <i />
            <i />
            <i />
          </div>
          <span className="thinking-reduced-label">Thinking…</span>
        </>
      ) : (
        paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
      )}
    </div>
  );
}
export function coachContextSummary(state) {
  const today = state.activeWorkout || adaptedTemplateForToday(state);
  const loggedWorkouts = state.workouts.filter(
    (workout) => workoutSetSummary(workout).completed > 0,
  );
  const hasWorkingWeights = loggedWorkouts.some((workout) =>
    workout.exercises.some((exercise) =>
      exercise.sets.some(
        (set) =>
          set.completed &&
          importedSetComparable(set) &&
          set.weight !== null &&
          set.weight !== undefined &&
          set.weight !== "" &&
          Number.isFinite(Number(set.weight)) &&
          Number(set.weight) > 0,
      ),
    ),
  );
  const primary = today
    ? `${today.name} today · ${today.exercises.length} exercises`
    : "Rest day today";
  if (!loggedWorkouts.length) {
    return {
      primary,
      secondary: today
        ? "Your current plan and today’s workout are in context."
        : "Your current plan and weekly schedule are in context.",
    };
  }
  return {
    primary,
    secondary: `${loggedWorkouts.length} ${loggedWorkouts.length === 1 ? "workout" : "workouts"} logged${hasWorkingWeights ? " · Recent working weights available" : " · Completed training history available"}`,
  };
}
export function contextualCoachPrompts(state, now = Date.now()) {
  const date = new Date(now), key = isoDay(date);
  const today = state.activeWorkout || adaptedTemplateForToday(state, date);
  const hasHistory = state.workouts.some(
    (workout) => workoutSetSummary(workout).completed > 0,
  );
  const completed = new Set(state.workouts.filter(workout => workout.completedAt && weekKey(workoutPlanDate(workout)) === weekKey(date)).map(workout => workout.programDayId));
  const active = Boolean(state.activeWorkout || state.activeOptionalSession);
  const canMove = currentWeekSchedule(state, date).some(item => !completed.has(item.workoutId) && item.workoutId !== state.activeWorkout?.programDayId);
  const canShorten = Boolean(today && !active && !state.workouts.some(workout => workout.completedAt && workoutPlanDate(workout) === key && workout.programDayId === today.id));
  const shorten = "Shorten today’s workout", move = "Move a workout this week", progress = "Review logged progress";
  const explain = today ? "Explain today’s workout" : nextScheduledWorkout(state, date) ? "Explain my next workout" : "Explain my program";
  const preferred = active ? [explain, progress, "Explain my program"]
    : flexibleWeekConflict(state) ? [move, shorten, progress]
    : canShorten ? [shorten, move, hasHistory ? progress : explain]
    : [move, explain, progress];
  return [...new Set([...preferred, explain, "Explain my program", "How my plan fits my goals"])]
    .filter(prompt => prompt !== shorten || canShorten)
    .filter(prompt => prompt !== move || canMove)
    .filter(prompt => prompt !== progress || hasHistory).slice(0, 3);
}
function Coach({ state, update, setPage }) {
  const [message, setMessage] = useState(state.coachDraft || "");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const coachAvailable = online && state.ai.available !== false;
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationFromHistory, setConversationFromHistory] = useState(false);
  const conversationBackRef = useRef(null);
  const conversationScrolls = useRef(new Map());
  const scrollConversationId = useRef(null);
  const closeHistory = () => { setMenuOpen(false); setConversationFromHistory(false); };
  const scrollRef = useRef(null);
  const historyScrollRef = useRef(null);
  const historyScrollTop = useRef(0);
  const composerRef = useRef(null);
  const coachRef = useRef(null);
  const contentRef = useRef(null);
  useLayoutEffect(() => bindCoachViewport(coachRef.current, scrollRef.current), []);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "0px";
    const contentHeight = composer.scrollHeight;
    composer.style.height = `${Math.min(Math.max(contentHeight, 54), 124)}px`;
    composer.style.overflowY = contentHeight > 124 ? "auto" : "hidden";
  }, [message]);
  const activeId = state.activeCoachConversationId;
  const currentMessages = state.conversations.filter(
    (entry) => (entry.conversationId || "legacy") === activeId,
  );
  const latestMessage = currentMessages.at(-1);
  const threads = useMemo(() => {
    const grouped = new Map();
    for (const entry of state.conversations) {
      const id = entry.conversationId || "legacy";
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(entry);
    }
    return [...grouped.entries()]
      .map(([id, entries]) => ({
        id,
        entries,
        title: entries[0]?.user || "Coach conversation",
        updatedAt: entries.at(-1)?.createdAt || 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.conversations]);
  const historyGroups = useMemo(() => {
    const today = isoDay();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = isoDay(yesterdayDate);
    const groups = new Map();
    for (const thread of threads) {
      const date = thread.updatedAt ? isoDay(new Date(thread.updatedAt)) : null;
      const label =
        date === today
          ? "TODAY"
          : date === yesterday
            ? "YESTERDAY"
            : thread.updatedAt
              ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric" })
                  .format(new Date(thread.updatedAt))
                  .toUpperCase()
              : "EARLIER";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(thread);
    }
    return [...groups.entries()];
  }, [threads]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    addEventListener("online", change);
    addEventListener("offline", change);
    return () => {
      removeEventListener("online", change);
      removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeHistory();
    };
    addEventListener("keydown", closeOnEscape);
    return () => removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  useEffect(() => {
    if (conversationFromHistory && !menuOpen) focusNavigationTarget(conversationBackRef.current);
  }, [conversationFromHistory, menuOpen]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousFocus = document.activeElement;
    const background = [contentRef.current].filter(Boolean);
    background.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    const focusable = () => [
      ...(document
        .querySelector(".coach-history-surface")
        ?.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ) || []),
    ];
    const frame = requestAnimationFrame(() => {
      if (historyScrollRef.current)
        historyScrollRef.current.scrollTop = historyScrollTop.current;
      focusNavigationTarget(focusable()[0]);
    });
    const keydown = (event) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("keydown", keydown);
      background.forEach((element) => {
        element.inert = false;
        element.removeAttribute("aria-hidden");
      });
      requestAnimationFrame(() => previousFocus?.focus?.());
    };
  }, [menuOpen]);
  useEffect(() => {
    const switchedConversation = scrollConversationId.current !== activeId;
    scrollConversationId.current = activeId;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current)
        scrollRef.current.scrollTop = switchedConversation ? conversationScrolls.current.get(activeId) ?? scrollRef.current.scrollHeight : scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    currentMessages.length,
    latestMessage?.reply,
    latestMessage?.actionResult?.status,
    sending,
    activeId,
  ]);
  const send = async (value, { preserveDraft = false, combineSelection } = {}) => {
    const text = value.trim();
    if (!text || sendingRef.current || sending || !coachAvailable) return;
    sendingRef.current = true;
    const conversationId = activeId || `thread-${Date.now()}`;
    const entryId = `msg-${Date.now()}`;
    setSending(true);
    if (!preserveDraft) setMessage("");
    update((current) => {
      if (!preserveDraft) current.coachDraft = "";
      current.activeCoachConversationId = conversationId;
      current.conversations.push({
        id: entryId,
        conversationId,
        user: text,
        reply: null,
        createdAt: Date.now(),
      });
      return current;
    });
    try {
      const reply = await AIService.coach(
        { ...state, activeCoachConversationId: conversationId },
        text,
        {selection:combineSelection},
      );
      update((current) => {
        const entry = current.conversations.find((item) => item.id === entryId);
        if (entry) entry.reply = reply;
        return current;
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const applyEntryAction = (entry, reviewedAction) => {
    if (reviewedAction?.type === 'combine-workouts') {
      if (state.conversations.find(e=>e.id===entry.id)?.actionResult?.status==='applied') return;
      const next=applyCombinedProposal(state,reviewedAction.proposal,value=>{
        const stored=value.conversations.find(e=>e.id===entry.id);
        if(!stored)return false;
        stored.actionResult={status:'applied',appliedAt:Date.now(),scope:'combined-occurrences',workoutId:value.todayAdaptation.id,revision:value.todayAdaptation.revision||0};
        return saveState(value);
      });
      update(()=>next,{planVersion:false,persistedState:next});
      return;
    }
    return update((current) => {
      const stored = current.conversations.find((item) => item.id === entry.id);
      if (!stored?.reply?.action || stored.actionResult?.status === "applied")
        return current;
      const acceptedAction = reviewedAction || stored.reply.action;
      const undoSnapshot =
        acceptedAction.type === "adapt-today"
          ? {
              activeWorkout: structuredClone(current.activeWorkout),
              todayAdaptation: structuredClone(current.todayAdaptation),
            }
          : acceptedAction.type === "program-exercise-change"
            ? { program: structuredClone(current.program) }
            : null;
      const workoutName =
        current.activeWorkout?.name ||
        adaptedTemplateForToday(current)?.name ||
        "workout";
      const conflict = coachActionConflict(current, acceptedAction);
      if (conflict) {
        stored.actionResult = {
          status: "conflict",
          detectedAt: Date.now(),
          reason: conflict,
        };
        return current;
      }
      applyCoachAction(current, acceptedAction);
      if (acceptedAction.type === "resume-empty-completed-workout") {
        if (
          current.activeWorkout?.resumedFromCompletionId ===
          acceptedAction.targetCompletedWorkoutId
        )
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            scope: "empty-workout-correction",
            workoutId: current.activeWorkout.id,
          };
      } else if (acceptedAction.type === "week-schedule-change") {
        const schedule = currentWeekSchedule(current);
        const applied = acceptedAction.changes.every((change) =>
          schedule.some(
            (item) =>
              item.workoutId === change.workoutId &&
              item.scheduledDate === change.toDate,
          ),
        );
        if (applied)
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            scope: "current-week",
          };
      } else if (acceptedAction.type === "program-exercise-change") {
        const applied = acceptedAction.changes.every((change) => {
          const exercises =
            current.program?.days.find((day) => day.id === change.workoutId)
              ?.exercises || [];
          const ids = exercises.map((exercise) => exercise.exerciseId);
          return (
            (change.addExerciseIds || []).every((id) => ids.includes(id)) &&
            (change.removeExerciseIds || []).every((id) => !ids.includes(id)) &&
            (change.operations || []).every((operation) =>
              operation.type === "replace"
                ? exercises.some(
                    (exercise) =>
                      exercise.id === operation.exerciseEntryId &&
                      exercise.exerciseId === operation.toExerciseId,
                  )
                : !exercises.some(
                    (exercise) => exercise.id === operation.exerciseEntryId,
                  ),
            )
          );
        });
        if (applied)
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            scope: "recurring-program",
            undoSnapshot,
            appliedSnapshot: {
              program: structuredClone(current.program),
            },
          };
      } else if (acceptedAction.type === "add-today-workout") {
        const targetDate = acceptedAction.targetDate || isoDay();
        const optional = optionalStrengthForDate(
          current,
          localDate(targetDate),
        );
        const ids =
          optional?.exercises.map((exercise) => exercise.exerciseId) || [];
        if (acceptedAction.exerciseIds.every((id) => ids.includes(id)))
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            workoutName: optional.name,
            targetDate,
            exerciseIds: ids,
            scope: targetDate === isoDay() ? "optional-today" : "optional-date",
          };
      } else {
        const targetDate = acceptedAction.targetDate || isoDay();
        const expected = acceptedAction.exerciseIds || [];
        const appliedIds =
          targetDate === isoDay() && current.activeWorkout?.adapted
            ? current.activeWorkout.exercises.map(
                (exercise) => exercise.exerciseId,
              )
            : current.todayAdaptation?.date === targetDate
              ? current.todayAdaptation.exerciseIds
              : [];
        const targetWorkoutName =
          current.program?.days.find(
            (day) => day.id === acceptedAction.programDayId,
          )?.name || workoutName;
        if (
          expected.length &&
          expected.every((id) => appliedIds.includes(id))
        ) {
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            workoutName: targetWorkoutName,
            targetDate,
            exerciseIds: expected,
            undoSnapshot,
            appliedSnapshot: undoSnapshot
              ? {
                  activeWorkout: structuredClone(current.activeWorkout),
                  todayAdaptation: structuredClone(current.todayAdaptation),
                }
              : null,
          };
          const actualMinutes =
            (targetDate === isoDay() &&
              current.activeWorkout?.adaptation?.estimatedMinutes) ||
            current.todayAdaptation?.estimatedMinutes ||
            acceptedAction.estimatedMinutes ||
            acceptedAction.minutes;
          stored.reply.text = `Shortened ${targetWorkoutName} to about ${roundedEstimate(actualMinutes)} minutes. Your changes are now applied.`;
        }
      }
      return current;
    }, { planVersion: { source: "Coach", reason: "Coach adaptation" } });
  };
  const undoEntryAction = (entry) =>
    update((current) => {
      const stored = current.conversations.find((item) => item.id === entry.id);
      const result = stored?.actionResult;
      if (
        result?.status !== "applied" ||
        !result.undoSnapshot ||
        !result.appliedSnapshot
      )
        return current;
      const currentSnapshot = {
        ...(result.undoSnapshot.program
          ? { program: current.program }
          : {
              activeWorkout: current.activeWorkout,
              todayAdaptation: current.todayAdaptation,
            }),
      };
      if (JSON.stringify(currentSnapshot) !== JSON.stringify(result.appliedSnapshot)) {
        stored.actionResult = {
          ...result,
          status: "undo-conflict",
          reason: "workout-changed",
        };
        return current;
      }
      if (result.undoSnapshot.program) {
        current.programChangeHistory ||= [];
        current.programChangeHistory.push({
          id: `program-change-undo-${Date.now()}`,
          type: "undo-exercise-review",
          programId: current.program?.id || result.undoSnapshot.program.id,
          fromVersion: current.program?.version || null,
          toVersion: result.undoSnapshot.program.version || 1,
          appliedAt: new Date().toISOString(),
        });
        current.program = structuredClone(result.undoSnapshot.program);
      } else {
        current.activeWorkout = structuredClone(result.undoSnapshot.activeWorkout);
        current.todayAdaptation = structuredClone(result.undoSnapshot.todayAdaptation);
      }
      stored.actionResult = { ...result, status: "undone", undoneAt: Date.now() };
      return current;
    }, { planVersion: { source: "Restored version", reason: "Coach change undone" } });
  const hasConversation = currentMessages.length > 0;
  const prompts = contextualCoachPrompts(state);
  const contextSummary = coachContextSummary(state);
  const choosePrompt = (prompt) => {
    send(prompt, { preserveDraft: true });
  };
  const newConversation = () => {
    update((current) => {
      current.activeCoachConversationId = null;
      return current;
    });
    setMenuOpen(false);
    setConversationFromHistory(false);
  };
  const openConversation = (id) => {
    update((current) => {
      current.activeCoachConversationId = id;
      return current;
    });
    setMenuOpen(false);
    setConversationFromHistory(true);
  };
  return (
    <main
      ref={coachRef}
      className={`screen coach-screen ${hasConversation ? "coach-active" : "coach-home"} ${menuOpen ? "coach-menu-open" : ""}`}
    >
      <div className="coach-content-surface" ref={contentRef}>
        <header className="coach-header">
          <div className="coach-header-context">
            {conversationFromHistory && <button ref={conversationBackRef} type="button" className="coach-conversation-back" aria-label="Back to conversation history" onClick={() => setMenuOpen(true)}>‹</button>}
            <div>
            <Eyebrow>COACH</Eyebrow>
            {hasConversation && <strong>Conversation</strong>}
            </div>
          </div>
          <button
            className="coach-history-trigger"
            aria-label="Conversation history"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4.7 8.4A8 8 0 1 1 4 12" />
              <path d="M4.7 4.8v3.6h3.6" />
              <path d="M12 8v4l2.7 1.7" />
            </svg>
            <span>HISTORY</span>
          </button>
        </header>
      <div className="coach-scroll" ref={scrollRef} onScroll={event => conversationScrolls.current.set(activeId, event.currentTarget.scrollTop)}>
        {!hasConversation && (
          <header className="coach-intro">
            <h1>Your plan and real training data, in context.</h1>
          </header>
        )}
        {!coachAvailable && (
          <div className="offline-banner" role="status">
            Coach unavailable. Logging and data-based progression still work
            locally.
          </div>
        )}
        {!hasConversation && (
          <>
            <aside className="coach-empty" role="note">
              <Eyebrow>WHAT COACH KNOWS</Eyebrow>
              <strong>{contextSummary.primary}</strong>
              <p>{contextSummary.secondary}</p>
            </aside>
            <section className="prompt-list">
              <Eyebrow>SHORTCUTS</Eyebrow>
              <p className="coach-shortcut-helper">Review proposed changes before you apply them.</p>
              <div>
                {prompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    disabled={sending || !coachAvailable}
                    onClick={() => choosePrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        <section className="conversation" aria-live="polite">
          {currentMessages.map((entry) => (
            <div className="message-pair" key={entry.id}>
              <p className="user-message">{entry.user}</p>
              {entry.reply ? (
                <>
                  <CoachReply text={entry.reply.text} />
                  {entry===latestMessage && entry.reply.combineRequest && <CoachCombineChoices key={entry.id} request={entry.reply.combineRequest} busy={sending||!coachAvailable} onSend={(text,selection)=>send(text,{preserveDraft:true,combineSelection:selection})} />}
                  {entry.reply.action && (
                    <ActionCard
                      action={entry.reply.action}
                      result={entry.actionResult}
                      reviewDraft={entry.combineReview}
                      onReviewChange={(proposal)=>update(current=>{const stored=current.conversations.find(e=>e.id===entry.id);if(stored&&!stored.actionResult)stored.combineReview=proposal;return current;},{planVersion:false})}
                      onReviewCancelled={(cancelled)=>update(current=>{const stored=current.conversations.find(e=>e.id===entry.id);if(stored&&!stored.actionResult)stored.combineReviewCancelled=cancelled;return current;},{planVersion:false})}
                      state={state}
                      onAccept={(accepted) => applyEntryAction(entry, accepted)}
                      onUndo={() => undoEntryAction(entry)}
                      onViewToday={() => setPage("today")}
                      onViewWorkout={() => setPage("workout")}
                    />
                  )}
                </>
              ) : null}
            </div>
          ))}
          {sending && <CoachReply thinking />}
        </section>
      </div>
      <form
        className={`coach-input${coachAvailable ? "" : " is-unavailable"}`}
        onSubmit={(event) => {
          event.preventDefault();
          send(message);
        }}
      >
        <textarea
          ref={composerRef}
          rows="1"
          aria-label="Ask Coach"
          disabled={!coachAvailable}
          value={message}
          onChange={(event) => {
            const draft = event.target.value;
            setMessage(draft);
            update((current) => {
              current.coachDraft = draft;
              return current;
            });
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!sending && coachAvailable && message.trim()) send(message);
            }
          }}
          placeholder={coachAvailable ? "Ask about your training…" : "Coach unavailable"}
        />
        <Button
          type="submit"
          onPointerDown={(event) => {
            if (event.button === 0 && document.activeElement === composerRef.current)
              event.preventDefault();
          }}
          className={`coach-send ${!coachAvailable ? "is-unavailable" : sending ? "is-sending" : message.trim() ? "is-ready" : "is-empty"}`}
          disabled={sending || !coachAvailable || !message.trim()}
          aria-label={sending ? "Sending message" : "Send message"}
          aria-busy={sending}
        >
          <span aria-hidden="true">{sending ? "…" : "↑"}</span>
        </Button>
      </form>
      </div>
      {(menuOpen || conversationFromHistory) && (
        <section
          className={`coach-history-surface${menuOpen ? "" : " coach-history-parent"}`}
          inert={menuOpen ? undefined : ""}
          aria-hidden={menuOpen ? undefined : true}
          role="dialog"
          aria-modal={menuOpen ? true : undefined}
          aria-labelledby="coach-history-title"
        >
          <header className="coach-history-header">
            <button
              type="button"
              aria-label="Back to Coach"
              onClick={closeHistory}
            >
              ‹
            </button>
            <h2 id="coach-history-title">Conversation history</h2>
            <button type="button" onClick={newConversation}>
              NEW
            </button>
          </header>
          <div
            className="coach-history-scroll"
            ref={historyScrollRef}
            onScroll={(event) => {
              historyScrollTop.current = event.currentTarget.scrollTop;
            }}
          >
            {historyGroups.length ? (
              historyGroups.map(([label, group]) => (
                <section className="coach-history-group" key={label}>
                  <Eyebrow>{label}</Eyebrow>
                  <div>
                    {group.map((thread) => {
                      const count = thread.entries.length;
                      const date = thread.updatedAt
                        ? new Date(thread.updatedAt)
                        : null;
                      const recency = date
                        ? label === "TODAY" || label === "YESTERDAY"
                          ? new Intl.DateTimeFormat("en", {
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(date)
                          : new Intl.DateTimeFormat("en", {
                              month: "short",
                              day: "numeric",
                            }).format(date)
                        : null;
                      return (
                        <button
                          type="button"
                          className={thread.id === activeId ? "active" : ""}
                          aria-current={
                            thread.id === activeId ? "true" : undefined
                          }
                          key={thread.id}
                          onClick={() => openConversation(thread.id)}
                        >
                          <span>
                            <strong title={thread.title}>{thread.title}</strong>
                            <small>
                              {count} {count === 1 ? "message" : "messages"}
                              {recency ? ` · ${recency}` : ""}
                            </small>
                          </span>
                          <span
                            className="coach-history-chevron"
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="coach-history-empty">
                <h3>No conversations yet</h3>
                <p>Your Coach conversations will appear here.</p>
                <Button onClick={newConversation}>START A CONVERSATION</Button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
function progressionCountLabel(rows = []) {
  const counts = rows.reduce(
    (result, { result: status }) => {
      if (status?.type === "progress") result.improving += 1;
      else if (status?.type === "stalled") result.stalled += 1;
      else if (status) result.holding += 1;
      return result;
    },
    { improving: 0, holding: 0, stalled: 0 },
  );
  return [
    counts.improving ? `${counts.improving} improving` : null,
    counts.holding ? `${counts.holding} holding` : null,
    counts.stalled ? `${counts.stalled} stalled` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function weightTrendEarlyState(trend) {
  if (!trend.entries.length)
    return {
      title: "No weight check-ins yet",
      body: "Add your first check-in to start your weight history.",
    };
  if (trend.entries.length === 1)
    return {
      title: "First check-in saved",
      body: "Add more check-ins to see how your weight changes over time.",
    };
  return {
    title: "Building your trend",
    body: "Keep checking in. Day-to-day weight can fluctuate, so ROOK needs measurements across more than one week before showing a trend.",
  };
}

function GoalProgress({
  state,
  progressionRows,
  improvements,
  setDetail,
}) {
  const focus = effectiveProgressFocus(state);
  const sectionLabel = state.progressFocusOverrideByPlanId?.[state.program?.id] ? 'PROGRESS FOCUS' : 'GOAL PROGRESS';
  const progressionLabel = progressionCountLabel(progressionRows);
  const hasComparableData = progressionRows.length >= 2;
  const trend = weightTrend(state.weightCheckins);
  const earlyTrend = weightTrendEarlyState(trend);
  const unit = weightUnit(state.profile.units);
  const formatTrendWeight = (value) =>
    `${bodyWeightFromKg(value, unit).toFixed(1)} ${unit}`;
  const trendDays = trend.comparison?.days || 0;
  const trendInterval =
    trendDays >= 27 && trendDays <= 29
      ? "4 weeks"
      : `${trendDays} ${trendDays === 1 ? "day" : "days"}`;
  const trendChange = trend.ready
    ? `${trend.changeKg < 0 ? "−" : trend.changeKg > 0 ? "+" : ""}${Math.abs(bodyWeightFromKg(trend.changeKg, unit)).toFixed(1)} ${unit} over ${trendInterval}`
    : null;
  const trainingProgress = hasComparableData
    ? progressionLabel
    : "More comparable workouts are needed";
  if (!focus)
    return (
      <section className="goal-progress-section">
        <Eyebrow>PROGRESS FOCUS</Eyebrow>
        <div className="goal-progress-card">
          <h2>No focus selected.</h2>
          <p>
            Choose what Progress highlights. This won’t change your plan.
          </p>
          <button
            type="button"
            className="goal-progress-action"
            onClick={() => setDetail({ progressFocus: true })}
          >
            CHOOSE FOCUS
          </button>
        </div>
      </section>
    );
  const content = {
    build_muscle: {
      title: "Muscle-building progress",
      label: "TRAINING PROGRESSION",
      value: hasComparableData
        ? progressionLabel
        : "Repeat the same exercises to build a trend",
      footer:
        "Workout logs can show training progression, not how much muscle you've gained.",
    },
    get_stronger: {
      title: "Strength progress",
      label: "EXERCISES PROGRESSING",
      value: improvements.length
        ? `${improvements.length} improved recently`
        : "Complete the same lift at least twice to compare strength",
      footer: "Compared only across compatible completed sessions.",
    },
    general_fitness: {
      title: "General fitness",
      label: "BROAD TRAINING PROGRESS",
      value: trainingProgress,
      footer:
        "Consistency and broad training progress matter more than a single fitness score.",
    },
    athletic_performance: {
      title: "Athletic support",
      label: "GYM PROGRESSION",
      value: trainingProgress,
      footer:
        "ROOK tracks your supporting training. It does not infer speed, jump or sport performance from lifting logs.",
    },
  }[focus];
  if (focus !== "lose_fat")
    return (
      <section className="goal-progress-section">
        <Eyebrow>{sectionLabel}</Eyebrow>
        <div className="goal-progress-card">
          <h2>{content.title}</h2>
          <div className="goal-progress-metric">
            <span>{content.label}</span>
            <strong>{content.value}</strong>
          </div>
          <p className="goal-progress-footnote">{content.footer}</p>
        </div>
      </section>
    );
  const tracking = Boolean(state.weightTrackingEnabled);
  return (
    <section className="goal-progress-section">
      <Eyebrow>{sectionLabel}</Eyebrow>
      <div className="goal-progress-card">
        {tracking ? (
          <button
            type="button"
            className="weight-trend-title"
            aria-label="Open weight history"
            onClick={() => setDetail({ weightHistory: true })}
          >
            <h2>Weight trend</h2>
            <span aria-hidden="true">›</span>
          </button>
        ) : (
          <h2>Fat-loss support</h2>
        )}
        {tracking ? (
          <div className="weight-trend-summary">
            {trend.ready && <span>TREND WEIGHT</span>}
            <strong>
              {trend.ready
                ? formatTrendWeight(trend.latest.weightKg)
                : earlyTrend.title}
            </strong>
            {trendChange && <small>{trendChange}</small>}
            {!trend.ready && <small>{earlyTrend.body}</small>}
          </div>
        ) : null}
        <div className="goal-progress-metric">
          <span>STRENGTH WHILE LOSING</span>
          <strong>{trainingProgress}</strong>
        </div>
        {trend.stable && (
          <p className="weight-trend-notice">
            <strong>No clear change over the last 4 weeks.</strong> Short flat
            periods are normal. ROOK won't tell you to eat less or train more
            from weight alone.
          </p>
        )}
        {trend.rapidDownward && (
          <p className="weight-trend-notice" role="status">
            Your recent weight trend is changing quickly. ROOK can't tell
            whether that rate is appropriate for you. Consider checking with a
            qualified healthcare professional, especially if the change is
            unplanned or you feel unwell.
          </p>
        )}
        {!tracking && (
          <button
            type="button"
            className="goal-progress-action"
            onClick={() => setDetail({ weightOptIn: true })}
          >
            ADD WEIGHT CHECK-INS
          </button>
        )}
        <p className="goal-progress-footnote">
          {tracking
            ? "Trend weight smooths normal day-to-day changes. It is not a body-fat estimate."
            : "Workout logs show training progress, not body-weight or body-fat change."}
        </p>
      </div>
    </section>
  );
}

function ProgressFocusSheet({ state, update, close }) {
  const selected = effectiveProgressFocus(state);
  const goals = profileIsUnder18(state.profile)
    ? GOALS.filter((goal) => goal !== "Lose fat")
    : GOALS;
  return (
    <main className="screen detail-screen progress-focus-sheet">
      <SheetHeader title="Progress focus" onClose={close} />
      <Eyebrow>PROGRESS FOCUS</Eyebrow>
      <h1>What should Progress highlight?</h1>
      <p>This only changes Progress. Your workouts stay the same.</p>
      <div className="progress-focus-options" role="radiogroup">
        {goals.map((goal) => {
          const key = trainingGoalKey(goal);
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected === key}
              className={selected === key ? "selected" : ""}
              key={goal}
              onClick={() => {
                update((current) => {
                  current.progressFocusOverrideByPlanId ||= {};
                  current.progressFocusOverrideByPlanId[current.program.id] = key;
                  return current;
                });
                close();
              }}
            >
              <span>{goal}</span>
              {selected === key && <i aria-hidden="true">✓</i>}
            </button>
          );
        })}
      </div>
    </main>
  );
}

function WeightOptInSheet({ update, setDetail, close }) {
  return (
    <main className="screen detail-screen weight-opt-in-sheet">
      <SheetHeader title="Weight check-ins" onClose={close} />
      <Eyebrow>OPTIONAL · PRIVATE</Eyebrow>
      <h1>Weight check-ins</h1>
      <p>
        Weight check-ins are optional and stay on this device. They show
        body-weight change, not body fat. If you have an eating-disorder
        history, are pregnant, or weight tracking feels compulsive or
        distressing, use training progress instead.
      </p>
      <Button
        onClick={() => {
          update((current) => {
            current.weightTrackingEnabled = true;
            return current;
          });
          setDetail({ weightEditor: {} });
        }}
      >
        ENABLE CHECK-INS
      </Button>
      <Button variant="quiet" onClick={close}>
        NOT NOW
      </Button>
    </main>
  );
}

function WeightEditor({ state, update, request, setDetail }) {
  const entry = request?.entry || null;
  const unit = weightUnit(state.profile.units);
  const [value, setValue] = useState(
    entry ? String(bodyWeightFromKg(entry.weightKg, unit)) : "",
  );
  const [date, setDate] = useState(entry?.localDate || isoDay());
  const [error, setError] = useState("");
  const [confirmDifferent, setConfirmDifferent] = useState(false);
  const save = (skipConfirmation = false) => {
    const validation = validateWeightCheckin({ value, units: unit, localDate: date });
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    if (
      !skipConfirmation &&
      weightCheckinNeedsConfirmation(
        state.weightCheckins.filter((item) => item.id !== entry?.id),
        date,
        validation.weightKg,
      )
    ) {
      setConfirmDifferent(true);
      return;
    }
    update((current) => {
      current.weightTrackingEnabled = true;
      current.weightCheckins = upsertWeightCheckin(current.weightCheckins, {
        ...entry,
        localDate: date,
        weightKg: validation.weightKg,
      });
      return current;
    });
    setDetail({ weightHistory: true, saved: true });
  };
  return (
    <main className="screen detail-screen weight-editor-sheet">
      <SheetHeader
        title={entry ? "Edit weight" : "Add weight"}
        onBack={() => setDetail({ weightHistory: true })}
        backLabel="Back to weight history"
      />
      {confirmDifferent ? (
        <div className="weight-confirmation">
          <Eyebrow>CHECK THIS WEIGHT</Eyebrow>
          <h1>This is quite different from your recent check-in.</h1>
          <p>Save it anyway?</p>
          <Button onClick={() => save(true)}>SAVE ANYWAY</Button>
          <Button variant="quiet" onClick={() => setConfirmDifferent(false)}>
            EDIT
          </Button>
        </div>
      ) : (
        <form
          className="weight-entry-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label>
            <span>Weight</span>
            <div className="weight-input-wrap">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={unit === "lb" ? "22" : "10"}
                max={unit === "lb" ? "1543" : "700"}
                value={value}
                aria-describedby={error ? "weight-entry-error" : undefined}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError("");
                }}
              />
              <span>{unit}</span>
            </div>
          </label>
          <label>
            <span>Date</span>
            <input
              type="date"
              max={isoDay()}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setError("");
              }}
            />
          </label>
          <p className="weight-entry-helper">
            Use the same scale and similar conditions when practical.
          </p>
          {error && (
            <p id="weight-entry-error" className="offline-banner" role="alert">
              {error}
            </p>
          )}
          <SheetActionFooter>
          <Button type="submit">SAVE</Button>
          {entry && (
            <button
              type="button"
              className="weight-delete-action"
              onClick={() => {
                if (!confirm("Delete this weight check-in?")) return;
                update((current) => {
                  current.weightCheckins = current.weightCheckins.filter(
                    (item) => item.id !== entry.id,
                  );
                  return current;
                });
                setDetail({ weightHistory: true });
              }}
            >
              DELETE CHECK-IN
            </button>
          )}
          </SheetActionFooter>
        </form>
      )}
    </main>
  );
}

function WeightHistory({ state, setDetail, close, saved }) {
  const trend = weightTrend(state.weightCheckins);
  const earlyTrend = weightTrendEarlyState(trend);
  const unit = weightUnit(state.profile.units);
  const values = trend.points.map((point) => point.weightKg);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const range = Math.max(0.1, maximum - minimum);
  const points = trend.points
    .map((point, index) => {
      const x = trend.points.length === 1 ? 50 : (index / (trend.points.length - 1)) * 100;
      const y = 92 - ((point.weightKg - minimum) / range) * 78;
      return `${x},${y}`;
    })
    .join(" ");
  const summary = trend.ready
    ? `Weight trend: ${bodyWeightFromKg(trend.latest.weightKg, unit).toFixed(1)} ${unit}, ${trend.changeKg < 0 ? "down" : trend.changeKg > 0 ? "up" : "unchanged by"} ${Math.abs(bodyWeightFromKg(trend.changeKg, unit)).toFixed(1)} ${unit} over ${trend.comparison.days} days.`
    : "Weight trend is still building.";
  const weeklyAverages = trend.weeks.filter((week) => week.samples >= 2).reverse();
  return (
    <main className="screen detail-screen weight-history-sheet">
      <SheetHeader title="Weight history" onClose={close} />
      {saved && <p className="weight-saved" role="status">Weight saved</p>}
      <section className="weight-history-overview">
        <Eyebrow>WEIGHT TREND</Eyebrow>
        <h1>
          {trend.ready
            ? `${bodyWeightFromKg(trend.latest.weightKg, unit).toFixed(1)} ${unit}`
            : earlyTrend.title}
        </h1>
        <p>{trend.ready ? summary.replace(/^Weight trend: /, "") : earlyTrend.body}</p>
        {trend.ready && trend.points.length >= 2 && (
          <svg
            className="weight-trend-chart"
            viewBox="0 0 100 100"
            role="img"
            aria-label={summary}
            preserveAspectRatio="none"
          >
            <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </section>
      <div className="weight-history-actions">
        <button onClick={() => setDetail({ weightEditor: {} })}>ADD WEIGHT</button>
      </div>
      {weeklyAverages.length > 0 && (
        <section className="weight-history-averages">
          <Eyebrow>WEEKLY AVERAGES</Eyebrow>
          {weeklyAverages.map((week) => (
            <div className="weight-history-average-row" key={week.weekStart}>
              <span>
                <strong>Weekly average</strong>
                <small>
                  Week of {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${week.weekStart}T12:00:00`))}
                </small>
              </span>
              <strong>{bodyWeightFromKg(week.weightKg, unit).toFixed(1)} {unit}</strong>
            </div>
          ))}
        </section>
      )}
      <section className="weight-history-list">
        <Eyebrow>CHECK-INS</Eyebrow>
        {trend.entries.length ? (
          [...trend.entries].reverse().map((entry) => (
            <button
              type="button"
              className="list-row"
              key={entry.id}
              onClick={() => setDetail({ weightEditor: { entry } })}
            >
              <span>
                <strong>{bodyWeightFromKg(entry.weightKg, unit).toFixed(1)} {unit}</strong>
                <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${entry.localDate}T12:00:00`))}</small>
              </span>
              <span className="navigation-chevron" aria-hidden="true">›</span>
            </button>
          ))
        ) : (
          <p className="muted">No weight check-ins yet.</p>
        )}
      </section>
    </main>
  );
}

function LoggedExerciseRow({row,state,onClick,compact=false}) {
  const rowRef = useRef(null);
  useEffect(() => {
    if (state.profile.showExerciseImages === false || typeof IntersectionObserver !== "function") return undefined;
    const element = rowRef.current;
    // Only warm artwork for visible/nearby choices, not the entire history/catalog.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      preloadExerciseArt(row.exercise, "low");
      observer.disconnect();
    }, { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [row.exercise.exerciseId, state.profile.showExerciseImages]);
  const item=row.exercise,bodyweight=Boolean(exerciseCatalog[item.exerciseId]?.bodyweight||item.importedExercise?.bodyweight);
  const load=exerciseMeasure(item)==='seconds'||exerciseLoadRequirement(item)==='none'?null:highestSimpleLoggedLoad(item);
  const compactMeta=[row.date?new Intl.DateTimeFormat('en',{day:'numeric',month:'short'}).format(localDate(row.date)):'Date unavailable',load!==null?`${bodyweight?'Highest added load':'Highest load'} ${displayWeight(load,state.profile.units)} ${weightUnit(state.profile.units)}`:bodyweight?'Bodyweight':null].filter(Boolean).join(' · ');
  return <button ref={rowRef} className="list-row logged-exercise-row" onClick={onClick} onPointerDown={()=>{if(state.profile.showExerciseImages!==false)preloadExerciseArt(item,"high");}} onFocus={()=>{if(state.profile.showExerciseImages!==false)preloadExerciseArt(item,"high");}}><span><strong>{exerciseName(item)}</strong>{compact?<small>{compactMeta}</small>:<><small>{row.date?`Latest logged session · ${new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(localDate(row.date))}`:'Date unavailable'}</small>{load!==null?<small>{bodyweight?'Highest added load':'Highest logged load'} · {displayWeight(load,state.profile.units)} {weightUnit(state.profile.units)}</small>:bodyweight&&<small>Bodyweight</small>}</>}</span><span className="navigation-chevron" aria-hidden="true">›</span></button>;
}
function LoggedExercises({state,setDetail,close,initial={}}) {
  const [query,setQuery]=useState(initial.query||'');const ref=useRef(null);
  useLayoutEffect(()=>{if(ref.current)ref.current.scrollTop=initial.scroll||0;},[]);
  const rows=loggedExercises(state.workouts).map(row=>({...row,id:row.exercise.exerciseId,name:exerciseName(row.exercise),aliases:exerciseCatalog[row.exercise.exerciseId]?.aliases||[]}));
  const filtered=rankExerciseSearch(rows.filter(row=>exerciseMatchesQuery(row,query)),query);
  return <main ref={ref} className="screen detail-screen logged-exercises-sheet"><SheetHeader title="Logged exercises" onClose={close}/><p>Most recent first</p><SearchInput aria-label="Search logged exercises" placeholder="Search logged exercises" value={query} onChange={e=>setQuery(e.target.value)} onClear={()=>setQuery('')}/><div>{filtered.map(row=><LoggedExerciseRow key={row.exercise.exerciseId} row={row} state={state} onClick={()=>setDetail({exercise:row.exercise,returnToLogged:{query,scroll:ref.current?.scrollTop||0}})}/>)}</div>{!filtered.length&&<p role="status">{query?`No logged exercises match “${query}”.`:'No exercises logged yet'}</p>}</main>;
}
function Progress({ state, update, setDetail, setPage }) {
  const completedWorkouts = state.workouts.filter(
    (workout) =>
      workout.completedAt && workoutSetSummary(workout).completed > 0,
  );
  const photos = useWorkoutPhotoCollection(state.workouts);
  const weeklyReview = weeklyPerformanceReview(state, new Date(), {
    e1rmEligible: exerciseSupportsEstimatedOneRepMax,
    exerciseLabel: exerciseName,
  });
  const consistency = state.flexibleWeek ? { completed: weeklyReview.completed, planned: weeklyReview.planned } : consistencyForCurrentWeek(state);
  const weekComplete =
    consistency.planned > 0 &&
    consistency.completed === consistency.planned;
  const unit = weightUnit(state.profile.units);
  const latest = [];
  const seen = new Set();
  for (const workout of [...completedWorkouts].reverse())
    for (const exercise of workout.exercises)
      if (
        !seen.has(exercise.exerciseId) &&
        exercise.sets.some((set) => set.completed)
      ) {
        seen.add(exercise.exerciseId);
        latest.push(exercise);
      }
  const earlyExercises = [];
  const plannedSeen = new Set();
  for (const day of state.program.days || [])
    for (const exercise of day.exercises || [])
      if (!plannedSeen.has(exercise.exerciseId)) {
        plannedSeen.add(exercise.exerciseId);
        earlyExercises.push(exercise);
      }
  const loggedRows = loggedExercises(state.workouts);
  const progressionExercises = [];
  const progressionSeen = new Set();
  for (const exercise of [...latest, ...earlyExercises])
    if (!progressionSeen.has(exercise.exerciseId)) {
      progressionSeen.add(exercise.exerciseId);
      progressionExercises.push(exercise);
    }
  const progressionPriority = (result) => {
    if (result.type === "progress") return 0;
    if (/smaller increment/i.test(result.title)) return 1;
    if (result.type === "stalled") return 2;
    return 3;
  };
  const allProgressionRows = progressionExercises
    .map((exercise) => ({
      exercise,
      result: progressionFor(exercise, state.workouts, state.profile),
    }))
    .filter((item) => item.result)
    .sort(
      (left, right) =>
        progressionPriority(left.result) - progressionPriority(right.result),
    );
  const progressionRows = allProgressionRows.slice(0, 4);
  const improvements = recentExerciseProgress(completedWorkouts);
  const title =
    completedWorkouts.length === 0
      ? "Your progress starts here."
      : completedWorkouts.length === 1
        ? "Your first baseline is set."
        : progressionRows.length
          ? "Know where your training stands."
          : "Your training is building a baseline.";
  const intro =
    completedWorkouts.length === 0
      ? "Complete your first workout to start building training history."
      : completedWorkouts.length === 1
        ? "ROOK now has a starting point for your logged training."
        : "See what is ready to progress, what to hold and what improved.";
  const dateLabel = (value) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
      ? localDate(value)
      : new Date(value);
    const days = Math.round(
      (new Date(isoDay()).getTime() - new Date(isoDay(date)).getTime()) /
        86400000,
    );
    return days === 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
          }).format(date);
  };
  const earlyData = !effectiveProgressFocus(state) && !progressionRows.length && !improvements.length;
  const goalSection = (<GoalProgress
        state={state}
        progressionRows={allProgressionRows}
        improvements={improvements}
        setDetail={setDetail}
      />);
  const progressionSection = (<section className="progression-overview">
        <Eyebrow>PROGRESSION</Eyebrow>
        {progressionRows.length ? (
          progressionRows.map(({ exercise, result }) => (
            <button
              key={exercise.exerciseId}
              className={`list-row progression-row progression-${result.type}${/smaller increment/i.test(result.title) ? " progression-caution" : ""}`}
              onClick={() => setDetail({ exercise })}
            >
              <span>
                <strong>{exerciseName(exercise)}</strong>
                <small>{result.title}</small>
                {result.type === "progress" && result.weight ? (
                  <small className="progression-next">
                    Next: {displayWeight(result.weight, state.profile.units)} {unit}
                  </small>
                ) : null}
              </span>
              <span className="navigation-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))
        ) : (
          <p className="progression-empty">
            More comparable sessions are needed before ROOK can suggest a progression.
          </p>
        )}
      </section>);
  const photoSection = (<section className="workout-photo-entry-section">
        <Eyebrow>WORKOUT PHOTOS</Eyebrow>
        <button
          type="button"
          className="workout-photo-entry-card"
          onClick={() => setDetail("workout-photos")}
        >
          <span>
            <strong>
              {photos.entries.length
                ? pluralize(photos.entries.length, "private photo")
                : photos.status === "ready" ? "No workout photos yet"
                : photos.status === "error" ? "Workout photos unavailable"
                : "Loading workout photos…"}
            </strong>
            <small>
              {photos.entries.length
                ? "Look back through your photo timeline."
                : photos.status === "ready" ? "Optional photos saved after workouts will appear here."
                : photos.status === "error" ? "Open your timeline to try again."
                : "Reading saved photos on this device."}
            </small>
          </span>
          <span className="navigation-chevron" aria-hidden="true">›</span>
        </button>
        <small className="workout-photo-entry-privacy">Stored privately on this device.</small>
      </section>);
  const trainingSections = (<>{improvements.length > 0 ? (
        <section className="progress-lower recent-improvements-section">
          <Eyebrow>RECENT IMPROVEMENTS</Eyebrow>
          <div className="recent-improvements-group">
          {improvements.slice(0, 3).map((item) => (
            <button
              key={item.exerciseId}
              className="list-row"
              onClick={() => setDetail({ exercise: item.exercise })}
            >
              <span>
                <strong>{exerciseName(item.exercise)}</strong>
                <small>
                  <span className="improvement-delta">{item.type === "weight"
                    ? `+${displayWeight(item.deltaWeight, state.profile.units)} ${unit}`
                    : `+${item.deltaReps} ${item.deltaReps === 1 ? "rep" : "reps"}`}</span>
                  {item.type === "weight" ? ' since last session' : item.weight !== null ? ` at ${displayWeight(item.weight, state.profile.units)} ${unit}` : ''}
                </small>
              </span>
              <span className="navigation-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
          </div>
        </section>
      ) : completedWorkouts.length > 0 ? (
        <section className="progress-lower">
          <Eyebrow>RECENT TRAINING</Eyebrow>
          {[...completedWorkouts]
            .reverse()
            .slice(0, 3)
            .map((workout) => {
              const sets = workoutSetSummary(workout).completed;
              return (
                <button
                  className="list-row recent-session-row"
                  key={workout.id}
                  onClick={() => setDetail({ completedWorkout: workout.id })}
                >
                  <span>
                    <strong>{workout.name}</strong>
                    <small>
                      {dateLabel(workoutPlanDate(workout))} ·{" "}
                      {pluralize(sets, "set")}
                    </small>
                  </span>
                  <span className="navigation-chevron" aria-hidden="true">›</span>
                </button>
              );
            })}
        </section>
      ) : null}
      <section className={`working-weights-section logged-exercises-preview${loggedRows.length ? '' : ' is-empty'}`}>
        <Eyebrow>EXERCISE HISTORY</Eyebrow>
        {loggedRows.length?<>{loggedRows.slice(0,6).map(row=><LoggedExerciseRow compact key={row.exercise.exerciseId} row={row} state={state} onClick={()=>setDetail({exercise:row.exercise})}/>)}<button className="list-row logged-exercises-all" onClick={()=>setDetail({loggedExercises:{}})}><span>View all logged exercises ({loggedRows.length})</span><span aria-hidden="true">›</span></button></>:<><h3>No exercises logged yet</h3><p>Complete a workout to see your exercises and latest session details here.</p><button className="text-button" onClick={()=>setPage('today')}>Go to Today</button></>}
      </section></>);
  return (
    <main className="screen progress-screen">
      <Eyebrow>PROGRESS</Eyebrow>
      <h1>{title}</h1>
      <p className="progress-lede">{intro}</p>
      <section className="weekly-review-section">
        <div className="weekly-review-heading">
          <Eyebrow>WEEKLY REVIEW</Eyebrow>
          <small>
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(localDate(weeklyReview.start))}
            {" – "}
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(localDate(weeklyReview.end))}
          </small>
        </div>
        {weeklyReview.blockContext && (
          <p className="weekly-review-context">
            {weeklyReview.blockContext.plannedDeload ? "Planned deload · " : ""}
            {weeklyReview.blockContext.weeks?.length > 1 ? `Program weeks ${weeklyReview.blockContext.weeks.join(' / ')}` : `Week ${weeklyReview.blockContext.week} of ${weeklyReview.blockContext.totalWeeks}`}
          </p>
        )}
        <div className={`weekly-review-card${weeklyReview.empty ? " is-empty" : ""}`}>
          {consistency.planned > 0 ? (
            <>
              <div
                className="consistency"
                aria-label={`${consistency.completed} of ${consistency.planned} planned sessions completed this week${weekComplete ? ". Week complete." : ""}`}
              >
                <strong>{consistency.completed} / {consistency.planned}</strong>
                <span>planned sessions completed</span>
                {weekComplete && (
                  <span className="weekly-completion-mark" aria-hidden="true">
                    <svg viewBox="0 0 16 16"><path d="m4 8.2 2.5 2.5L12 5.5" /></svg>
                  </span>
                )}
              </div>
              <div className="consistency-bars">
                {Array.from({ length: consistency.planned }, (_, index) => (
                  <i className={index < consistency.completed ? "filled" : ""} key={index} />
                ))}
              </div>
            </>
          ) : (
            <strong className="weekly-review-empty-title">No sessions planned.</strong>
          )}
          <dl className="weekly-review-metrics">
            <div><dt>Working sets</dt><dd>{weeklyReview.completedSets}</dd></div>
            <div><dt>Progressed</dt><dd>{weeklyReview.exercisesProgressed}</dd></div>
            <div><dt>PRs</dt><dd>{weeklyReview.prCount}</dd></div>
            <div>
              <dt>Adjusted / moved</dt>
              <dd
                className="weekly-review-adjustments"
                aria-label={adjustedMovedLabel(
                  weeklyReview.adjusted,
                  weeklyReview.moved,
                )}
              >
                <span>{weeklyReview.adjusted} adjusted</span>
                <span className="weekly-review-adjustment-tail">
                  <span className="weekly-review-adjustment-separator" aria-hidden="true">·</span>
                  <span>{weeklyReview.moved} moved</span>
                </span>
              </dd>
            </div>
            {weeklyReview.skipped > 0 && (
              <div><dt>Skipped</dt><dd>{weeklyReview.skipped}</dd></div>
            )}
          </dl>
          <div className="weekly-review-summary">
            {weeklyReview.summary.slice(0, 4).map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
      </section>
      {earlyData ? <>{trainingSections}{progressionSection}{goalSection}{photoSection}</> : <>{goalSection}{progressionSection}{photoSection}{trainingSections}</>}
    </main>
  );
}
function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}
function titleCase(value) {
  return String(value || "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function cleanProgramName(name) {
  return String(name || "")
    .trim()
    .replace(/\s*(?:[,·|–—-]\s*)?\d+\s*days?\s*(?:\/|per)\s*week\b/gi, "")
    .replace(
      /^(?:(?:weekly|current|existing)\s+)?(?:workout|training)\s+plan\b\s*(?:[:\-–—|]\s*)?/i,
      "",
    )
    .replace(/^[,·|:–—-]+|[,·|:–—-]+$/g, "")
    .trim();
}
function derivedSplitName(program) {
  const names = (program?.days || [])
    .map((day) =>
      String(day.name || "")
        .replace(/\s*·.*$/u, "")
        .replace(/\s+(?:A|B|C|\d+)$/i, "")
        .trim(),
    )
    .filter(Boolean);
  return [...new Set(names)].join(" / ");
}
export function displayProgramName(program) {
  if (program?.nameEdited && String(program.name || "").trim())
    return String(program.name).trim();
  const imported = program?.source === "ai-import";
  const cleaned = cleanProgramName(program?.name);
  if (cleaned && !/^(?:personalized|imported)\s+plan$/i.test(cleaned))
    return cleaned;
  return imported
    ? "Imported plan"
    : derivedSplitName(program) || "Personalized plan";
}
function exerciseSupportsEstimatedOneRepMax(exercise) {
  const catalog = exerciseCatalog[exercise?.exerciseId];
  return Boolean(
    exercise &&
      exerciseMeasure(exercise) !== "seconds" &&
      exerciseLoadRequirement(exercise) === "required" &&
      !catalog?.bodyweight,
  );
}
export function exerciseHistoryWeightLabel({
  timed = false,
  bodyweight = false,
  loadRequirement,
  loadContext,
  weight,
  units = "kg",
} = {}) {
  const hasWeight = !(
    weight === null ||
    weight === undefined ||
    weight === "" ||
    !Number.isFinite(Number(weight))
  );
  if (loadRequirement === "none")
    return timed
      ? "Timed hold"
      : loadContext || (bodyweight ? "Bodyweight" : "No load");
  if (timed && !hasWeight) return "Timed hold";
  if (bodyweight && !hasWeight) return "Bodyweight";
  if (!hasWeight) return "Weight not logged";
  const prefix = bodyweight && loadRequirement === "optional" ? "+" : "";
  return `${prefix}${displayWeight(Number(weight), units)} ${weightUnit(units)}`;
}
export function exerciseHistoryPerformanceLabel(exercise, sets = []) {
  const completed = sets
    .filter((set) => set.completed);
  const advanced =
    loggingModeOf(exercise) === "per_side" ||
    completed.some((set) => set.rawImport?.version === 2) ||
    completed.some((set) => setTypeLabel(set));
  if (advanced)
    return completed.map((set) => historySetDescriptor(exercise, set)).join(" / ");
  const values = completed
    .filter((set) => Number.isFinite(Number(set.reps)))
    .map((set) => Number(set.reps));
  if (!values.length) return "";
  const timed = exerciseMeasure(exercise) === "seconds";
  const effort = completed.map((set) =>
    set.rir === null || set.rir === undefined || set.rir === ""
      ? null
      : Number(set.rir),
  );
  const commonRir =
    !timed &&
    effort.length === completed.length &&
    effort.every((value) => Number.isFinite(value)) &&
    effort.every((value) => value === effort[0])
      ? ` · ${effort[0]} RIR`
      : "";
  return `${values.join(" / ")} ${timed ? "sec" : "reps"}${commonRir}`;
}
export function exerciseHistoryEntries(workouts = [], exerciseId, limit = 8) {
  return workouts
    .flatMap((workout) =>
      (workout.exercises || [])
        .filter(
          (item) =>
            item.exerciseId === exerciseId &&
            (item.sets || []).some((set) => set.completed),
        )
        .map((item) => ({
          ...item,
          date:
            workoutPlanDate(workout) ||
            workout.completedAt ||
            workout.endedAt ||
            workout.startedAt,
        })),
    )
    .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0))
    .slice(-limit);
}
export function latestLoggedWeightSet(history = []) {
  return [...history]
    .reverse()
    .flatMap((item) => [...(item.sets || [])].reverse())
    .find(
      (set) =>
        set.completed &&
        importedSetComparable(set) &&
        set.weight !== null &&
        set.weight !== undefined &&
        set.weight !== "" &&
        Number.isFinite(Number(set.weight)) &&
        Number(set.weight) > 0,
    );
}
export function adaptationDurationLabel(requestedMinutes, estimatedMinutes) {
  const requested = Number(requestedMinutes);
  const estimate = roundedEstimate(estimatedMinutes);
  if (!Number.isFinite(requested) || requested <= 0) return `~${estimate} min`;
  return Math.abs(estimate - requested) <= 5
    ? `~${estimate} min · fits ${requested} min goal`
    : `Closest valid option · ~${estimate} min (${requested} min goal)`;
}
export function profileTrainingRows(profile) {
  const equipment = (profile?.equipment || [])
    .filter(present)
    .map((value) =>
      value === "full gym"
        ? "Full gym"
        : EQUIPMENT_LABELS[value] || titleCase(value),
    )
    .join(", ");
  return [
    ["Goal", profile?.goal],
    ["Experience", profile?.experience],
    ["Availability", formatScheduleDays(profile?.availableDays)],
    [
      "Session length",
      Number.isFinite(Number(profile?.sessionMinutes)) &&
      Number(profile.sessionMinutes) > 0
        ? `${Number(profile.sessionMinutes)} min`
        : null,
    ],
    ["Training environment", profile?.environment],
    ["Available equipment", equipment],
  ].filter(([, value]) => present(value));
}
export function formatScheduleDays(days = []) {
  const selected = new Set((days || []).filter((day) => WEEKDAYS.includes(day)));
  const ordered = WEEKDAYS.filter((day) => selected.has(day));
  if (!ordered.length) return "";
  const indexes = ordered.map((day) => WEEKDAYS.indexOf(day));
  const continuous = indexes.every(
    (index, position) => position === 0 || index === indexes[position - 1] + 1,
  );
  return continuous && ordered.length > 1
    ? `${ordered[0]}–${ordered.at(-1)}`
    : ordered.join(", ");
}
function InfoRow({ label, value, onClick }) {
  if (onClick)
    return (
      <button className="info-row info-row-action" onClick={onClick}>
        <span>{label}</span>
        <span className="info-row-end">
          <strong>{value}</strong>
          <i aria-hidden="true">›</i>
        </span>
      </button>
    );
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function ConditioningCard({ conditioning }) {
  if (!conditioning) return null;
  return (
    <article className="plan-conditioning-card">
      <div>
        <span>WEEKLY CONDITIONING</span>
        <strong>
          {conditioning.sessionsPerWeek} × {conditioning.durationMinutes} min
        </strong>
      </div>
      <p>{conditioning.intensity}</p>
      <small>{conditioning.modalities}</small>
      <small>{conditioning.placement}</small>
      <em>{conditioning.progression}</em>
    </article>
  );
}
export function splitAdaptationCopy(program) {
  const preference = program?.splitPreference;
  if (!preference) return "";
  const schedule = `${program.days?.length || 0}-day schedule`;
  if (preference.fallbackReason === "split-needs-pull-equipment")
    return `${preference.label} needs pulling equipment for dedicated pull sessions, so Rook used a structure that fits your available equipment.`;
  if (preference.fallbackReason === "bodyweight-high-frequency-volume")
    return `Rook adapted your ${preference.label} preference to keep a high-frequency bodyweight plan within recoverable weekly volume.`;
  if (!preference.honored)
    return `${preference.label} does not fit this ${schedule}, so Rook used the closest sensible structure.`;
  if (["adapted", "inspired"].includes(preference.fidelity))
    return `Rook adapted your ${preference.label} preference to fit this ${schedule} and your other constraints.`;
  return "";
}
function PersonalizationSummary({ profile, program }) {
  const equipment = (profile.equipment || [])
    .map((value) =>
      value === "full gym"
        ? "Full gym"
        : EQUIPMENT_LABELS[value] || titleCase(value),
    )
    .join(", ");
  const focus = (profile.priorities || []).filter(
    (value) => value !== "Balanced",
  );
  const splitPreference = program.splitPreference?.id === 'custom'
    ? program.splitPreference
    : detectSplitPreference(profile);
  const items = [
    ["GOAL", `${profile.goal} · ${profile.experience}`],
    [
      "WEEK",
      `${pluralize(program.days.length, "session")} · ${program.days.map((day) => day.weekday).join(", ")}`,
    ],
    ["SESSION", program.durationFidelity ? `${profile.sessionMinutes} min target` : `Up to ${profile.sessionMinutes} min`],
    ["EQUIPMENT", equipment || profile.environment],
  ];
  if (splitPreference) items.push(["STYLE", splitPreference.label]);
  if (focus.length) items.push(["FOCUS", focus.join(", ")]);
  else items.push(["FOCUS", "Balanced"]);
  if (String(profile.avoid || "").trim()) {
    const safety = trainingSafetyFor(profile);
    const rows = trainingClearanceLimitRows(safety);
    const first = rows[0];
    const restrictionSummary =
      safety.appliedLabels?.includes("Leg presses")
        ? "Leg press family excluded"
        : rows.length === 1 && first?.label === "Avoid"
        ? `${first.value} excluded`
        : rows.length === 1
          ? `${first.label}: ${first.value}`
          : `${pluralize(rows.length, "restriction")} active`;
    items.push(["RESTRICTIONS", restrictionSummary]);
  }
  const adaptationNote = splitAdaptationCopy(program);
  return (
    <section
      className="personalization-summary"
      aria-label="How your answers shaped this plan"
    >
      <div>
        <Eyebrow>BUILT FROM YOUR ANSWERS</Eyebrow>
        <strong>Built to fit your week from day one.</strong>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {adaptationNote && (
        <p className="split-adaptation-note">{adaptationNote}</p>
      )}
    </section>
  );
}
function Profile({ state, update, setDetail, setPage, onLogout }) {
  const [area, setArea] = useState(null);
  const previousArea = useRef(null), navigationMotion = useRef(null);
  const hubPosition = useRef(0), returnControl = useRef(null), profileRef = useRef(null);
  const openArea = (next, event) => {
    rememberSwipeParent(profileRef.current);
    hubPosition.current = window.scrollY; returnControl.current = next;
    setArea(next);
  };
  const backToProfile = () => setArea(null);
  useLayoutEffect(() => {
    if (area) { window.scrollTo(0, 0); focusNavigationTarget(profileRef.current?.querySelector('.detail-header-back')); }
    else { window.scrollTo(0, hubPosition.current); focusNavigationTarget(profileRef.current?.querySelector(`[data-profile-area="${returnControl.current}"]`)); }
  }, [area]);
  useLayoutEffect(() => {
    if (previousArea.current === area) return;
    previousArea.current = area;
    navigationMotion.current?.cancel();
    const surface = profileRef.current;
    if (surface?.dataset.swipeBackCommitted) { delete surface.dataset.swipeBackCommitted; return; }
    if (!surface || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tokens = getComputedStyle(surface);
    navigationMotion.current = surface.animate([
      { transform: `translateX(${area ? 18 : -18}px)`, opacity: .96 },
      { transform: 'translateX(0)', opacity: 1 },
    ], {
      duration: parseFloat(tokens.getPropertyValue('--rook-motion-layout')) || 190,
      easing: tokens.getPropertyValue('--rook-ease-standard').trim() || 'cubic-bezier(.2,0,0,1)',
    });
    return () => navigationMotion.current?.cancel();
  }, [area]);
  const p = state.profile;
  const profileSafety = trainingSafetyFor(p);
  const profileSafetyConflicts = plannedExerciseSafetyConflicts(
    state.program,
    profileSafety,
  );
  const imported = ["ai-import", "imported"].includes(state.program.source);
  const preferencesOnly = ["ai-import", "imported", "manual", "scratch"].includes(
    state.program.source,
  );
  const personal = [
    ["Name", p.name],
    ["Age", p.ageRange],
    ["Sex", p.sex],
  ].filter(([, value]) => present(value));
  const personalIncomplete = !p.ageRange;
  const training = profileTrainingRows(p).filter(
    ([label]) => !["Training environment", "Available equipment"].includes(label),
  );
  const primaryGym = defaultGymProfile(state);
  const gymSummary = primaryGym
    ? `${primaryGym.name} · Default${state.gymProfiles.length > 1 ? ` · +${state.gymProfiles.length - 1}` : ""}`
    : "Set up your first gym";
  const trainingSettingDetails = {
    Availability: { profileTrainingSetting: "schedule" },
    "Training environment": {
      profileTrainingSetting: "setup",
      focus: "environment",
    },
    "Available equipment": {
      profileTrainingSetting: "setup",
      focus: "equipment",
    },
  };
  const confirmedPriorities = (p.prioritySources?.physiqueConfirmed || [])
    .map((item) => ({
      label: PHYSIQUE_PRIORITY_OPTIONS[item.priorityId]?.label || item.label,
      level:
        item.priorityLevel === "high" ? "Higher emphasis" : "Moderate emphasis",
    }))
    .filter((item) => item.label);
  const confirmedLabels = new Set(
    confirmedPriorities.map((item) => item.label),
  );
  const manualPriorities = (
    p.prioritySources?.manual ||
    p.priorities ||
    []
  ).filter((value) => value !== "Balanced" && !confirmedLabels.has(value));
  const hasPriorities =
    manualPriorities.length > 0 || confirmedPriorities.length > 0;
  const goalContext = PROFILE_GOAL_LABELS[p.goal] || null;
  const programTitle = imported
    ? "Imported plan"
    : displayProgramName(state.program);
  const frequency = `${pluralize(state.program.days.length, "day")}/week`;
  const block = state.program.trainingBlock;
  const programSummary = `${frequency}${block ? ` · ${block.completed ? "Block complete" : `Week ${block.currentWeek || 1} of ${block.totalWeeks || 1}`}` : !imported && goalContext ? ` · ${goalContext}` : ""}`;
  const areaTitle = {program:"Program",training:"Training setup",preferences:"Preferences",data:"Data & backup"}[area];
  return (
    <main ref={profileRef} onKeyDown={event=>{if(area && event.key==='Escape'){event.preventDefault();backToProfile();}}} className={`screen profile-screen${area ? ' profile-management-screen' : ' profile-hub'}`}>
      {area && <div className="profile-subpage-header"><SheetHeader title={areaTitle} onBack={backToProfile} backLabel="Back to Profile" /></div>}
      <header className="profile-program">
        {!area && <>
        <Eyebrow>PROFILE</Eyebrow>
        <h1>Training profile</h1>
        </>}
        {!area ? <button data-profile-area="program" className="profile-current-program profile-program-entry" onClick={event=>openArea('program',event)} aria-label={`Current program: ${programTitle}, ${programSummary}`}>
          <span><Eyebrow>CURRENT PROGRAM</Eyebrow><h2>{programTitle}</h2><p>{programSummary}</p></span><span aria-hidden="true">›</span>
        </button> : area === 'program' &&
        <div className="profile-current-program">
          <Eyebrow>CURRENT PROGRAM</Eyebrow>
          <h2>{programTitle}</h2>
          <p>
            {programSummary}
          </p>
        </div>}
      </header>
      {area === 'training' && (
        <section>
          <Eyebrow>ABOUT YOU</Eyebrow>
          <button className="list-row" onClick={()=>setDetail('profile-details')}><span><strong>Personal details</strong><small>{personal.length ? personal.map(([,value])=>value).join(' · ') : 'Add name, age or sex'}</small></span><span aria-hidden="true">›</span></button>
        </section>
      )}
      {!area && personalIncomplete && (
        <section className="complete-profile">
          <Eyebrow>COMPLETE YOUR PROFILE</Eyebrow>
          <button
            className="list-row"
            onClick={() => setDetail("profile-details")}
          >
            <span>
              <strong>Add a few details</strong>
              <small>Improve Coach recommendations.</small>
            </span>
            <span>›</span>
          </button>
        </section>
      )}
      {!area && <section className="profile-manage"><Eyebrow>MANAGE</Eyebrow>
        {[['training','Training setup','Schedule, gyms, restrictions, priorities and custom exercises'],['preferences','Preferences','Logging, units, appearance and notifications'],['data','Data & backup','Import, export, backup, restore and local data']].map(([id,title,summary])=><button data-profile-area={id} key={id} className="list-row" onClick={event=>openArea(id,event)}><span><strong>{title}</strong><small>{summary}</small></span><span aria-hidden="true">›</span></button>)}
      </section>}
      {area === 'training' && <>
        <section className="planning-setup">
          <Eyebrow>TRAINING</Eyebrow>
          <p className="planning-setup-copy">
            Used by Coach and future plan changes. Your current program is
            edited separately.
          </p>
          {training.map(([label, value]) => (
            <InfoRow
              key={label}
              label={label}
              value={value}
              onClick={
                trainingSettingDetails[label]
                  ? () => setDetail(trainingSettingDetails[label])
                  : undefined
              }
            />
          ))}
          <InfoRow
            label="Gym profiles"
            value={gymSummary}
            onClick={() => setDetail("gym-profiles")}
          />
          <button
            className="list-row"
            onClick={() => setDetail("training-restrictions")}
          >
            <span>
              <strong>Training restrictions</strong>
              <small>
                {trainingSafetyBlocks(profileSafety.status)
                  ? "Training paused · Needs review"
                  : profileSafetyConflicts.length
                    ? "Plan review required"
                  : profileSafety.status === "constraints_active"
                    ? "Explicit restrictions applied"
                    : profileSafety.pastResolved
                      ? "Past issue noted"
                      : "None added"}
              </small>
            </span>
            <span>›</span>
          </button>
        </section>
      </>}
      {area === 'program' && state.program.conditioning && (
        <section>
          <Eyebrow>CARDIO</Eyebrow>
          <ConditioningCard conditioning={state.program.conditioning} />
        </section>
      )}
      {area === 'training' && <section>
        <Eyebrow>
          {preferencesOnly ? "COACHING PREFERENCES" : "TRAINING PRIORITIES"}
        </Eyebrow>
        <button
          className="list-row"
          onClick={() => setDetail("training-priorities")}
        >
          <span>
            <strong>
              Training priorities
            </strong>
            <small>
              {hasPriorities ? [...manualPriorities,...confirmedPriorities.map(item=>item.label)].join(' · ') : 'None selected'}
            </small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("custom-exercises")}>
          <span><strong>Custom exercises</strong><small>{pluralize((state.customExercises || []).filter(item=>!item.deletedAt).length,"exercise")} · {pluralize((state.exerciseAliases || []).filter(item=>!item.deletedAt).length,"alias","aliases")}</small></span><span aria-hidden="true">›</span>
        </button>
      </section>}
      {area === 'program' && <section className="program-actions">
        <Eyebrow>PROGRAM</Eyebrow>
        <button className="list-row" onClick={() => setDetail("training-block")}>
          <span>
            <strong>Training block</strong>
            <small>
              {state.program.trainingBlock?.completed
                ? `${state.program.trainingBlock.name} · Complete`
                : `${state.program.trainingBlock?.name || "Current block"} · Week ${state.program.trainingBlock?.currentWeek || 1} of ${state.program.trainingBlock?.totalWeeks || 1}`}
            </small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" disabled={Boolean(state.activeWorkout)} onClick={() => setDetail("edit-plan")}>
          <span><strong>Edit plan</strong><small>{state.activeWorkout ? "Finish your active workout first." : "Names, exercises, sets, reps and weights"}</small></span>
          {!state.activeWorkout && <span>›</span>}
        </button>
        <button className="list-row" onClick={() => setDetail("plan-history")}>
          <span>
            <strong>Plan history</strong>
            <small>{pluralize(state.planVersions?.length || 0, "saved version")}</small>
          </span>
          <span>›</span>
        </button>
        <button
          className="list-row"
          onClick={() =>
            setDetail({ export: { date: state.selectedDate } })
          }
        >
          <span>
            <strong>Export workout plan</strong>
            <small>Share, copy or download the full plan</small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row profile-separated-action" onClick={() => setDetail("change-plan")}>
          <span>
            <strong>Replace plan</strong>
            <small>Build or import a different program</small>
          </span>
          <span>›</span>
        </button>
      </section>}
      {area === 'preferences' && <section>
        <Eyebrow>SETTINGS</Eyebrow>
        <button className="list-row" onClick={() => setDetail("logging")}> 
          <span>
            <strong>Logging & increments</strong>
            <small>
              {weightUnit(p.units)} · Reps in reserve{" "}
              {p.rirEnabled ? "on" : "off"} · Timer{" "}
              {p.restTimerEnabled
                ? p.restTimerSeconds
                  ? formatDuration(p.restTimerSeconds)
                  : "on"
                : "off"}
            </small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("appearance")}>
          <span>
            <strong>Appearance</strong>
            <small>
              {titleCase(p.appearancePreference || "system")} · {titleCase(
                p.stylePreference || "standard",
              )} · Illustrations{" "}
              {p.showExerciseImages === false ? "off" : "on"}
            </small>
          </span>
          <span>›</span>
        </button>
      </section>}
      {area === 'data' && <><section className="profile-data-actions">
        <Eyebrow>DATA</Eyebrow>
        <button className="list-row" onClick={() => setDetail("import-workout-history")}>
          <span>
            <strong>Import workout history</strong>
            <small>Hevy, Strong or other CSV / XLSX · Parsed on this device</small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("export-workout-history")}>
          <span><strong>Export workout history</strong><small>CSV or JSON · Your training records</small></span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("backup-rook")}>
          <span>
            <strong>Back up ROOK</strong>
            <small>Create a complete local recovery file</small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("restore-backup")}>
          <span>
            <strong>Restore backup</strong>
            <small>Replace local data from a ROOK backup</small>
          </span>
          <span>›</span>
        </button>
      </section>
      <button className="list-row profile-separated-action profile-delete-action" onClick={onLogout}>
        <span><strong className="danger-text">Delete local data</strong><small>Erase ROOK data from this device</small></span><span aria-hidden="true">›</span>
      </button>
      </>}
    </main>
  );
}

export function plannedExerciseSafetyConflicts(program, safety) {
  if (!program || !safety || trainingSafetyBlocks(safety.status)) return [];
  const hasCurrentPainContext = safety.semanticAnalysis?.findings?.some(
    (finding) =>
      ["current_unresolved_pain", "symptom_trigger"].includes(finding.kind),
  );
  return (program.days || []).flatMap((day) =>
    (day.exercises || []).flatMap((exercise) => {
      const item = exerciseCatalog[exercise.exerciseId];
      const minimumRir =
        safety.constraints?.minRirByExerciseId?.[exercise.exerciseId];
      const conflictsWithMovement =
        item && !exerciseAllowedByTrainingSafety(item, safety);
      const conflictsWithEffort =
        Number.isFinite(minimumRir) &&
        Number(exercise.targetRir) < minimumRir;
      if (!conflictsWithMovement && !conflictsWithEffort) return [];
      return [{
        dayId: day.id,
        dayName: workoutDisplayParts(day, day.weekday).primary,
        exerciseEntryId: exercise.id,
        exerciseId: exercise.exerciseId,
        exerciseName: exerciseName(exercise),
        reason: conflictsWithMovement ? "movement" : "effort",
        context: hasCurrentPainContext ? "pain" : "explicit-limit",
      }];
    }),
  );
}

export function restrictionPlanSuggestions(program, profile, conflicts) {
  const suggestions = (conflicts || []).map((conflict) => {
    const day = program?.days?.find((item) => item.id === conflict.dayId);
    const exercise = day?.exercises?.find(
      (item) => item.id === conflict.exerciseEntryId,
    );
    const candidates =
      exercise &&
      conflict.reason === "movement" &&
      conflict.context !== "pain"
      ? compatibleReplacementCandidates(
          exercise,
          profile,
          day.exercises.map((item) => item.exerciseId),
        ).slice(0, 4)
      : [];
    const canRemove = Boolean(
      conflict.reason === "movement" && day && day.exercises.length > 1,
    );
    return {
      ...conflict,
      candidates,
      canRemove,
      choice: "review",
    };
  });
  for (const day of program?.days || []) {
    const daySuggestions = suggestions.filter((item) => item.dayId === day.id);
    if (
      daySuggestions.length === day.exercises.length &&
      daySuggestions.every((item) => !item.candidates.length)
    ) {
      daySuggestions.forEach((item) => {
        item.canRemove = false;
        item.choice = "review";
      });
    }
  }
  return suggestions;
}

export function restrictionSuggestionChanges(suggestions) {
  return (suggestions || [])
    .filter((item) => item.choice !== "review")
    .reduce((result, item) => {
      let change = result.find(
        (candidate) => candidate.workoutId === item.dayId,
      );
      if (!change) {
        change = {
          workoutId: item.dayId,
          operations: [],
          addExerciseIds: [],
          removeExerciseIds: [],
        };
        result.push(change);
      }
      change.operations.push({
        type: item.choice === "remove" ? "remove" : "replace",
        exerciseEntryId: item.exerciseEntryId,
        fromExerciseId: item.exerciseId,
        ...(item.choice === "remove" ? {} : { toExerciseId: item.choice }),
      });
      return result;
    }, []);
}

function TrainingRestrictions({ state, update, close, reviewPlan }) {
  const [sourceText, setSourceText] = useState(state.profile.avoid || "");
  const [confirmedScopeHash, setConfirmedScopeHash] = useState(
    state.profile.trainingSafetyConfirmedHash || null,
  );
  const existingAnalysis =
    state.profile.trainingSafetyAnalysis?.sourceText === sourceText &&
    state.profile.trainingSafetyAnalysis?.analysis?.schemaVersion ===
      TRAINING_SAFETY_SCHEMA_VERSION
      ? state.profile.trainingSafetyAnalysis.analysis
      : null;
  const [analysis, setAnalysis] = useState(existingAnalysis);
  const [analysisStatus, setAnalysisStatus] = useState(
    existingAnalysis ? "ready" : "idle",
  );
  const [clearanceAttestation, setClearanceAttestation] = useState(
    state.profile.trainingSafetyClearanceAttestation || null,
  );
  const [clearanceDeclinedHash, setClearanceDeclinedHash] = useState(
    state.profile.trainingSafetyClearanceDeclinedHash || null,
  );
  const [clearanceResponse, setClearanceResponse] = useState(
    state.profile.trainingSafetyClearanceResponse || null,
  );
  const [limitsResponse, setLimitsResponse] = useState(
    state.profile.trainingSafetyLimitsResponse || null,
  );
  const [supplementalLimits, setSupplementalLimits] = useState(
    state.profile.trainingSafetySupplementalLimits || null,
  );
  const [supplementalLimitText, setSupplementalLimitText] = useState(
    state.profile.trainingSafetySupplementalLimits?.text || "",
  );
  const [supplementalLimitStatus, setSupplementalLimitStatus] = useState("idle");
  const [pendingImpact, setPendingImpact] = useState(null);
  const supplementalLimitTextRef = useRef(supplementalLimitText);
  supplementalLimitTextRef.current = supplementalLimitText;
  const localProfile = {
    ...state.profile,
    avoid: sourceText,
    trainingSafetyAnalysis: analysis
      ? { sourceText, analysis }
      : null,
    trainingSafetyConfirmedHash: confirmedScopeHash,
    trainingSafetyClearanceAttestation: clearanceAttestation,
    trainingSafetyClearanceDeclinedHash: clearanceDeclinedHash,
    trainingSafetyClearanceResponse: clearanceResponse,
    trainingSafetyLimitsResponse: limitsResponse,
    trainingSafetySupplementalLimits: supplementalLimits,
  };
  const safety = trainingSafetyFor(localProfile);
  const commit = (semanticAnalysis, { keepOpen = false } = {}) => {
    const savedText = sourceText.trim();
    update((current) => {
      current.profile.avoid = savedText;
      current.profile.trainingSafetyConfirmedHash = confirmedScopeHash;
      current.profile.trainingSafetyAnalysis = semanticAnalysis
        ? { sourceText: savedText, analysis: semanticAnalysis }
        : null;
      current.profile.trainingSafetyClearanceAttestation = clearanceAttestation;
      current.profile.trainingSafetyClearanceDeclinedHash = clearanceDeclinedHash;
      current.profile.trainingSafetyClearanceResponse = clearanceResponse;
      current.profile.trainingSafetyLimitsResponse = limitsResponse;
      current.profile.trainingSafetySupplementalLimits = supplementalLimits;
      return current;
    });
    if (!keepOpen) close();
  };
  const reviewImpactBeforeCommit = (semanticAnalysis, compiledSafety) => {
    const conflicts = plannedExerciseSafetyConflicts(
      state.program,
      compiledSafety,
    );
    if (trainingSafetyBlocks(compiledSafety.status) || conflicts.length) {
      setPendingImpact({
        analysis: semanticAnalysis,
        safety: compiledSafety,
        conflicts,
        suggestions: restrictionPlanSuggestions(
          state.program,
          localProfile,
          conflicts,
        ),
      });
      return true;
    }
    return false;
  };
  const save = async () => {
    const candidateText = sourceText.trim();
    if (!candidateText) return commit(null);
    if (analysis && analysisStatus === "ready") {
      if (!reviewImpactBeforeCommit(analysis, safety)) commit(analysis);
      return;
    }
    setAnalysisStatus("checking");
    try {
      const result = await AIService.analyzeTrainingSafety(candidateText);
      const parsed = compileTrainingSafety(candidateText, Object.values(exerciseCatalog), {
        confirmedScopeHash,
        semanticAnalysis: result,
        clearanceAttestation,
        clearanceDeclinedHash,
        clearanceResponse,
        limitsResponse,
      });
      setSourceText(candidateText);
      setAnalysis(result);
      setAnalysisStatus("ready");
      if (
        !["needs_confirmation", "needs_clearance_confirmation", "needs_limits_confirmation", "needs_trigger_confirmation"].includes(
          parsed.status,
        )
      ) {
        if (!reviewImpactBeforeCommit(result, parsed)) commit(result);
      }
    } catch {
      setAnalysisStatus("error");
    }
  };
  return (
    <main className="screen detail-screen training-restrictions-screen">
      <SheetHeader
        title="Training restrictions"
        onClose={close}
        closeLabel="Close training restrictions"
      />
      <Eyebrow>TRAINING RESTRICTIONS</Eyebrow>
      <h1>Set clear training limits.</h1>
      <p>
        Add current pain, recent surgery, movements you avoid, or limits a
        clinician gave you. Rook uses these as safety constraints. It does not
        diagnose conditions or change your plan automatically.
      </p>
      <p className="restriction-plan-notice">
        If a restriction conflicts with your plan, Rook can prepare similar
        options or removals for review. Nothing changes until you apply it.
      </p>
      <textarea
        aria-label="Restrictions or clinician limits"
        className="text-answer"
        maxLength={600}
        value={sourceText}
        onChange={(event) => {
          setSourceText(event.target.value);
          setConfirmedScopeHash(null);
          setClearanceAttestation(null);
          setClearanceDeclinedHash(null);
          setClearanceResponse(null);
          setLimitsResponse(null);
          setSupplementalLimits(null);
          setSupplementalLimitText("");
          setSupplementalLimitStatus("idle");
          setAnalysis(null);
          setAnalysisStatus("idle");
          setPendingImpact(null);
        }}
        placeholder="Example: Avoid squats, or surgeon cleared upper-body strength training only"
      />
      <TrainingSafetySummary
        safety={analysisStatus === "ready" ? safety : null}
        confirmScope={() => setConfirmedScopeHash(safety.constraintHash)}
        confirmClearance={() => {
          setClearanceAttestation(createTrainingClearanceAttestation(safety));
          setClearanceDeclinedHash(null);
          setClearanceResponse(null);
        }}
        setClearanceResponse={(status) => {
          setClearanceAttestation(null);
          setClearanceDeclinedHash(null);
          setClearanceResponse(createTrainingClearanceResponse(safety, status));
        }}
        resetClearanceResponse={() => setClearanceResponse(null)}
        setLimitsResponse={(status) => {
          setLimitsResponse(createTrainingLimitsResponse(safety, status));
          setSupplementalLimits(null);
          setSupplementalLimitText("");
          setClearanceAttestation(null);
          setClearanceDeclinedHash(null);
          setClearanceResponse(null);
        }}
        resetLimitsResponse={() => {
          setLimitsResponse(null);
          setSupplementalLimits(null);
          setSupplementalLimitText("");
          setSupplementalLimitStatus("idle");
          setClearanceAttestation(null);
          setClearanceDeclinedHash(null);
          setClearanceResponse(null);
        }}
        supplementalLimitText={supplementalLimitText}
        setSupplementalLimitText={(value) => {
          setSupplementalLimitText(value);
          setSupplementalLimitStatus("idle");
        }}
        supplementalLimitStatus={supplementalLimitStatus}
        checkSupplementalLimits={async () => {
          const supplementalText = supplementalLimitText.trim();
          if (!supplementalText || supplementalLimitStatus === "checking") return;
          setSupplementalLimitStatus("checking");
          try {
            const questionContext =
              safety.status === "needs_trigger_confirmation"
                ? "symptom_triggers"
                : null;
            const result = await AIService.analyzeTrainingSafety(
              supplementalText,
              questionContext,
            );
            if (supplementalLimitTextRef.current.trim() !== supplementalText) return;
            setSupplementalLimits({
              text: supplementalText,
              analysis: result,
              questionContext,
              resolvesUnresolved: safety.status === "needs_clarification",
            });
            setLimitsResponse(null);
            setClearanceAttestation(null);
            setClearanceDeclinedHash(null);
            setClearanceResponse(null);
            setSupplementalLimitStatus("ready");
          } catch {
            setSupplementalLimitStatus("error");
          }
        }}
      />
      {analysisStatus === "checking" && (
        <div className="restriction-checking" role="status" aria-live="polite">
          <span className="restriction-spinner" aria-hidden="true" />
          <span>
            <strong>Reviewing what you entered…</strong>
            <small>This can take a few seconds.</small>
          </span>
        </div>
      )}
      {analysisStatus === "error" && (
        <p role="alert">Rook couldn't verify these restrictions. Try again.</p>
      )}
      {pendingImpact && (
        <section className="restriction-impact-review" role="alertdialog" aria-labelledby="restriction-impact-title">
          <Eyebrow>PLAN IMPACT</Eyebrow>
          <h2 id="restriction-impact-title">
            {pendingImpact.conflicts.length
              ? "This affects your current plan"
              : "Training will be paused"}
          </h2>
          <p>
            {pendingImpact.conflicts.length
              ? `${pluralize(pendingImpact.conflicts.length, "planned exercise")} ${pendingImpact.conflicts.length === 1 ? "conflicts" : "conflict"} with this restriction. Review each suggestion before applying it.`
              : "Rook can’t safely apply this limit without additional review. If you save, training will stay paused until the restriction is clarified."}
          </p>
          {pendingImpact.conflicts.length > 0 && (
            <div className="restriction-change-list">
              {pendingImpact.suggestions.map((suggestion) => (
                <label
                  className="restriction-change"
                  key={`${suggestion.dayId}-${suggestion.exerciseEntryId}`}
                >
                  <span>
                    <strong>{suggestion.exerciseName}</strong>
                    <small>{suggestion.dayName}</small>
                  </span>
                  <select
                    aria-label={`Plan change for ${suggestion.exerciseName} in ${suggestion.dayName}`}
                    value={suggestion.choice}
                    onChange={(event) =>
                      setPendingImpact((current) => ({
                        ...current,
                        suggestions: current.suggestions.map((item) =>
                          item.exerciseEntryId === suggestion.exerciseEntryId &&
                          item.dayId === suggestion.dayId
                            ? { ...item, choice: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  >
                    {(suggestion.candidates.length > 0 || suggestion.canRemove) && (
                      <option value="review" disabled>
                        Choose a plan change…
                      </option>
                    )}
                    {suggestion.candidates.map((candidate) => (
                      <option value={candidate.id} key={candidate.id}>
                        Replace with {candidate.name}
                      </option>
                    ))}
                    {suggestion.canRemove && (
                      <option value="remove">Remove from workout</option>
                    )}
                    {!suggestion.candidates.length && !suggestion.canRemove && (
                      <option value="review">Review manually</option>
                    )}
                  </select>
                  {suggestion.choice !== "review" && (
                    <small className="restriction-change-effect">
                      {suggestion.choice === "remove"
                        ? "Removes this recurring slot. Completed history stays unchanged."
                        : "Keeps the set and rep targets, resets the planned load, and leaves completed history unchanged."}
                    </small>
                  )}
                </label>
              ))}
              <small className="restriction-change-note">
                Similar options match the exercise’s movement role and your
                saved limits. They are not a medical recommendation. Active
                workouts and completed history stay unchanged. Nothing changes
                until you apply.
              </small>
              {pendingImpact.suggestions.some(
                (item) => item.choice === "review",
              ) && (
                <small className="restriction-change-warning">
                  {pluralize(
                    pendingImpact.suggestions.filter(
                      (item) => item.choice === "review",
                    ).length,
                    "conflict",
                  )} still need a choice or manual review.
                </small>
              )}
              {state.activeWorkout && (
                <small className="restriction-change-warning">
                  Finish the active workout before changing the recurring plan.
                </small>
              )}
            </div>
          )}
          <SheetActionFooter>
          <Button
            onClick={() => {
              const manualReview = pendingImpact.suggestions.filter(
                (item) => item.choice === "review",
              );
              const changes = restrictionSuggestionChanges(
                pendingImpact.suggestions,
              );
              const checked = validateProgramExerciseChanges(
                { ...state, profile: localProfile },
                changes,
              );
              if (changes.length && !state.activeWorkout && checked.valid) {
                const savedText = sourceText.trim();
                update((current) => {
                  current.profile.avoid = savedText;
                  current.profile.trainingSafetyConfirmedHash = confirmedScopeHash;
                  current.profile.trainingSafetyAnalysis = pendingImpact.analysis
                    ? { sourceText: savedText, analysis: pendingImpact.analysis }
                    : null;
                  current.profile.trainingSafetyClearanceAttestation = clearanceAttestation;
                  current.profile.trainingSafetyClearanceDeclinedHash = clearanceDeclinedHash;
                  current.profile.trainingSafetyClearanceResponse = clearanceResponse;
                  current.profile.trainingSafetyLimitsResponse = limitsResponse;
                  current.profile.trainingSafetySupplementalLimits = supplementalLimits;
                  applyProgramExerciseChanges(current, checked.changes);
                  return current;
                });
              } else {
                commit(pendingImpact.analysis, { keepOpen: true });
              }
              if (manualReview.length || state.activeWorkout || !checked.valid)
                reviewPlan?.(
                  (manualReview.length
                    ? manualReview
                    : pendingImpact.suggestions
                  ).map((item) => item.exerciseEntryId),
                );
              else close();
            }}
          >
            {pendingImpact.conflicts.length
              ? restrictionSuggestionChanges(pendingImpact.suggestions).length &&
                !state.activeWorkout &&
                validateProgramExerciseChanges(
                  { ...state, profile: localProfile },
                  restrictionSuggestionChanges(pendingImpact.suggestions),
                ).valid
                ? `SAVE & APPLY ${pluralize(
                    restrictionSuggestionChanges(pendingImpact.suggestions)
                      .flatMap((change) => change.operations).length,
                    "CHANGE",
                  ).toUpperCase()}`
                : "SAVE & REVIEW PLAN"
              : "SAVE & PAUSE TRAINING"}
          </Button>
          <Button variant="quiet" onClick={() => setPendingImpact(null)}>
            EDIT RESTRICTION
          </Button>
          </SheetActionFooter>
        </section>
      )}
      <SheetActionFooter enabled={!pendingImpact}>
      <Button
        onClick={save}
        disabled={
          Boolean(pendingImpact) ||
          analysisStatus === "checking" ||
          (analysisStatus === "ready" &&
            ["needs_confirmation", "needs_clearance_confirmation", "needs_limits_confirmation", "needs_trigger_confirmation"].includes(
              safety.status,
            ))
        }
      >
        {analysisStatus === "checking" ? "CHECKING…" : "SAVE RESTRICTIONS"}
      </Button>
      </SheetActionFooter>
    </main>
  );
}

export function displayImportedPlanName(name) {
  const withoutSchedule = cleanProgramName(name);
  const importedGoal = withoutSchedule.match(
    /^imported\s+plan\s*[:\-–—]\s*(.+)$/i,
  )?.[1];
  const meaningful = importedGoal ? titleCase(importedGoal) : withoutSchedule;
  return meaningful || "Imported plan";
}
function TrainingPriorities({ state, update, close, adjustPlan }) {
  const preferencesOnly = ["ai-import", "imported", "manual", "scratch"].includes(
    state.program.source,
  );
  const [sources, setSources] = useState(() => {
    const initial = clone(
      state.profile.prioritySources || {
        manual: state.profile.priorities || [],
        physiqueSuggested: [],
        physiqueConfirmed: [],
      },
    );
    initial.manual = normalizeManualPrioritySelection(initial.manual);
    return initial;
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const manual = sources.manual || [];
  const confirmed = sources.physiqueConfirmed || [];
  const specificPriorities = manual.filter((option) => option !== "Balanced");
  const selectionLocked =
    specificPriorities.length >= MAX_MANUAL_TRAINING_PRIORITIES;
  const toggleManual = (option) =>
    setSources((current) => {
      const next = nextManualPrioritySelection(current.manual || [], option);
      setSaved(false);
      return { ...current, manual: next };
    });
  if (reviewOpen)
    return (
      <PhysiqueReview
        profile={{ ...state.profile, prioritySources: sources }}
        onClose={() => setReviewOpen(false)}
        onUse={({ suggested, confirmed: accepted }) => {
          setSources((current) => ({
            ...current,
            physiqueSuggested: suggested,
            physiqueConfirmed: accepted,
          }));
          setReviewOpen(false);
        }}
      />
    );
  const save = () => {
    update((current) => {
      current.profile.prioritySources = clone(sources);
      current.profile.priorities = combinedTrainingPriorities(
        sources.manual,
        sources.physiqueConfirmed,
      );
      return current;
    });
    setSaved(true);
  };
  return (
    <main className="screen detail-screen priority-settings">
      <SheetHeader
        title={preferencesOnly ? "Coaching preferences" : "Training priorities"}
        onClose={close}
        closeLabel={`Close ${preferencesOnly ? "coaching preferences" : "training priorities"}`}
      />
      <Eyebrow>
        {preferencesOnly ? "COACHING PREFERENCES" : "TRAINING PRIORITIES"}
      </Eyebrow>
      <h1>
        {preferencesOnly
          ? "What would you like Coach to emphasize?"
          : "What would you like to emphasize?"}
      </h1>
      <p>
        {preferencesOnly
          ? "Choose up to two areas. These guide Coach recommendations and future Rook-generated programs. Your current plan won’t change automatically."
          : "Choose up to two areas. These guide Coach and future program rebuilds. Your current plan won’t change unless you explicitly adjust or rebuild it."}
      </p>
      <span id="priority-limit-reason" className="visually-hidden">
        Maximum of two priorities selected. Deselect one to choose another.
      </span>
      {!preferencesOnly && <button
        className="physique-review-entry"
        onClick={() => setReviewOpen(true)}
      >
        <span>
          <strong>{confirmed.length ? "Run another optional review" : "Not sure what to prioritize?"}</strong>
          <small>Get an optional physique review</small>
        </span>
        <i>›</i>
      </button>}
      <TrainingPriorityChoices
        selected={manual}
        selectionLocked={selectionLocked}
        limitReasonId="priority-limit-reason"
        onSelect={toggleManual}
      />
      {(preferencesOnly || (manual.length > 0 && !manual.includes("Balanced"))) && <div
        className="priority-selection-summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>
          {manual.includes("Balanced") || manual.length === 0
            ? "Balanced plan"
            : `${manual.length} of ${MAX_MANUAL_TRAINING_PRIORITIES} selected`}
        </strong>
        <small>
          {manual.includes("Balanced") || manual.length === 0
            ? "No muscle group gets extra weekly volume."
            : selectionLocked
              ? "Deselect one to choose another."
              : manual.join(" + ")}
        </small>
      </div>}
      {saved && (
        <div className="priority-save-status" role="status" aria-live="polite">
          <strong>
            {preferencesOnly ? "Preferences saved." : "Priorities saved."}
          </strong>{" "}
          Current plan unchanged.
        </div>
      )}
      {confirmed.length > 0 && (
        <section className="confirmed-physique">
          <Eyebrow>CONFIRMED FROM PHYSIQUE REVIEW</Eyebrow>
          {confirmed.map((item) => (
            <div className="info-row" key={item.priorityId}>
              <span>
                {PHYSIQUE_PRIORITY_OPTIONS[item.priorityId]?.label ||
                  item.label}
              </span>
              <button
                aria-label={`Remove ${item.label}`}
                onClick={() =>
                  setSources((current) => ({
                    ...current,
                    physiqueConfirmed: current.physiqueConfirmed.filter(
                      (value) => value.priorityId !== item.priorityId,
                    ),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </section>
      )}
      {preferencesOnly && <button
        className="physique-review-entry"
        onClick={() => setReviewOpen(true)}
      >
        <span>
          <strong>
            {confirmed.length
              ? "Run another optional review"
              : "Not sure what to prioritize?"}
          </strong>
          <small>Get an optional physique review</small>
        </span>
        <i>›</i>
      </button>}
      <SheetActionFooter>
      <Button onClick={save}>
        {preferencesOnly ? "SAVE PREFERENCES" : "SAVE PRIORITIES"}
      </Button>
      {saved && (
        <Button variant="quiet" onClick={adjustPlan}>
          {preferencesOnly ? "ASK COACH TO ADJUST PLAN" : "ADJUST CURRENT PLAN"}
        </Button>
      )}
      </SheetActionFooter>
    </main>
  );
}
export function ScratchPlan({ state, update, close, onPlanAccepted }) {
  const [name, setName] = useState("My training plan");
  const [days, setDays] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const draftSessionRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const profile = useMemo(
    () => ({
      ...state.profile,
      daysPerWeek: days.length,
      availableDays: days,
      environment: state.profile.environment || "Commercial gym",
      equipment: state.profile.equipment?.length
        ? state.profile.equipment
        : ["full gym"],
      priorities: state.profile.priorities?.length
        ? state.profile.priorities
        : ["Balanced"],
    }),
    [state.profile, days],
  );
  const toggleDay = (day) =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : current.length >= 6
          ? current
        : WEEKDAYS.filter((value) => current.includes(value) || value === day),
    );
  const backToSetup = () => {
    const current = draftSessionRef.current.read().program;
    setName(current.name);
    setDays(WEEKDAYS.filter(day => current.days.some(workout => workout.weekday === day)));
    setEditing(false);
  };
  const leaveSetup = () => {
    if (draftSessionRef.current?.read().dirty &&
        !window.confirm('Discard this unfinished Scratch plan and return to start?')) return;
    close();
  };
  const begin = () => {
    if (draft) {
      const current = draftSessionRef.current.read();
      const sameDays = current.program.days.length === days.length &&
        current.program.days.every(workout => days.includes(workout.weekday));
      if (sameDays) {
        draftSessionRef.current.rename(name.trim());
        setEditing(true);
        return;
      }
      // No round-trip reconciliation exists for a different Scratch schedule.
      // Rebuilding edited work is an explicit discard, never implicit Continue.
      if (current.dirty && !window.confirm('Changing training days starts a new Scratch plan. Discard your current draft edits and start again?')) return;
    }
    setSaveError('');
    setDraft({
      id: uid('manual-program'),
      name: name.trim(),
      source: "manual",
      goalAtCreation: null,
      userEdited: true,
      version: 1,
      createdAt: new Date().toISOString(),
      days: days.map((day) => ({
        id: uid(`manual-day-${day}`),
        weekday: day,
        location:
          profile.environment === "Home gym" ? "Home" : "Commercial gym",
        type: "workout",
        name: `${day} Workout`,
        nameEdited: true,
        estimatedMinutes: 0,
        exercises: [],
      })),
    });
    setEditing(true);
  };
  const save = (program) => {
    const validationProfile = { ...profile, sessionMinutes: null };
    const checked = validateProgram(program, validationProfile, {
      preserveSchedule: true,
    });
    if (!checked.valid) return;
    trackFunnelEvent("onboarding_completed", {
      path: "scratch",
      source: "manual",
      daysPerWeek: program.days.length,
    });
    try {
      const next = persistProgramReplacement(state, {...program, profileSnapshot: clone(validationProfile)}, {profile: validationProfile, source:'manual'}, saveState);
      update(() => next, {planVersion:false,persistedState:next});
    } catch (error) { setSaveError(error.message); return; }
    onPlanAccepted?.();
  };
  return (
    <>
      {draft && <main key={draft.id} className="screen detail-screen initial-import-screen scratch-editor-screen"
        hidden={!editing} inert={!editing ? '' : undefined} aria-hidden={!editing || undefined}
        style={!editing ? { display: 'none' } : undefined}>
        <header className="detail-header">
          <button
            aria-label="Back to plan setup"
            onClick={backToSetup}
          >
            ‹
          </button>
          <strong>Manual plan</strong>
          <span />
        </header>
        {saveError && <p className="offline-banner" role="alert">{saveError}</p>}
        <PlanEditor
          source={draft}
          profile={profile}
          mode="scratch"
          active={editing}
          scratchSessionRef={draftSessionRef}
          exerciseState={state}
          onRegisterCustomExercise={(record) => update((current) => { registerCustomExerciseRecord(current, record); return current; })}
          onRememberExerciseAlias={(alias, exerciseId) => update((current) => { rememberExerciseAlias(current, alias, exerciseId, { builtInCatalog: exerciseCatalog }); return current; })}
          onSave={save}
          onCancel={backToSetup}
          showCancel={false}
        />
      </main>}
    {!editing && <main className="screen detail-screen initial-import-screen scratch-plan-screen">
      <header className="detail-header">
        <button aria-label="Back to start" onClick={leaveSetup}>
          ‹
        </button>
        <strong>Start from scratch</strong>
        <span />
      </header>
      <Eyebrow>MANUAL PLAN</Eyebrow>
      <h1>Create your own week.</h1>
      <p>Choose your training days, then build each workout yourself.</p>
      <label className="scratch-plan-name">
        <span>WEEKLY PLAN NAME</span>
        <input
          aria-label="Weekly plan name"
          maxLength="60"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <section className="scratch-days">
        <div className="scratch-days-heading">
          <Eyebrow>TRAINING DAYS</Eyebrow>
          {days.length > 0 && (
            <button type="button" onClick={() => setDays([])}>
              Clear
            </button>
          )}
        </div>
        <div className="scratch-day-options">
          {WEEKDAYS.map((day) => {
            const selected = days.includes(day);
            return (
              <button
                type="button"
                key={day}
                aria-label={day}
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                disabled={!selected && days.length >= 6}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            );
          })}
        </div>
        <small>
          {days.length
            ? `${days.length} training ${days.length === 1 ? "day" : "days"} selected`
            : "Choose at least one day"}
        </small>
        {days.length >= 6 && (
          <small className="scratch-days-limit">Up to 6 training days</small>
        )}
      </section>
      <Button disabled={!name.trim() || !days.length} onClick={begin}>
        CONTINUE
      </Button>
      <Button
        variant="quiet"
        className="bottom-back"
        aria-label="Back"
        onClick={leaveSetup}
      >
        <BackLabel />
      </Button>
    </main>}
    </>
  );
}
export function planEditorAllowsSupersets(mode = "review") {
  return mode === "edit" || mode === "import";
}

function SupersetPartnerPicker({
  exercise,
  candidates,
  profile,
  onConfirm,
  onClose,
  className = "",
  helper = "Rook will alternate one set of each exercise, then start your rest.",
}) {
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const selectedPartner = candidates.find(
    (candidate) => candidate.id === selectedPartnerId,
  );
  useEffect(() => {
    if (
      selectedPartnerId &&
      !candidates.some((candidate) => candidate.id === selectedPartnerId)
    ) {
      setSelectedPartnerId(null);
    }
  }, [candidates, selectedPartnerId]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);
  return (
    <main
      className={`sheet replace-sheet superset-partner-sheet ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="superset-partner-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="superset-partner-header">
        <div className="superset-partner-header-row">
          <Eyebrow>CREATE SUPERSET</Eyebrow>
          <button
            className="sheet-close superset-partner-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h2 id="superset-partner-title">Choose a second exercise</h2>
        <p>
          Pair it with {exerciseName(exercise)}. {helper}
        </p>
      </header>
      <div
        className="superset-partner-options"
        role="radiogroup"
        aria-label={`Exercise to pair with ${exerciseName(exercise)}`}
      >
        {candidates.map((candidate) => {
          const selected = candidate.id === selectedPartnerId;
          const prescription = targetLabel(candidate, profile.rirEnabled);
          return (
            <button
              type="button"
              className={`choice-row superset-partner-option${selected ? " is-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              aria-label={`${exerciseName(candidate)}, ${prescription}`}
              key={candidate.id}
              onClick={() => setSelectedPartnerId(candidate.id)}
            >
              <span>
                <strong>{exerciseName(candidate)}</strong>
                <small>{prescription}</small>
              </span>
              <i aria-hidden="true">✓</i>
            </button>
          );
        })}
      </div>
      <SheetActionFooter className="superset-partner-footer" separate gutter={22}>
        <Button
          disabled={!selectedPartner}
          onClick={() => selectedPartner && onConfirm(selectedPartner.id)}
        >
          CREATE SUPERSET
        </Button>
      </SheetActionFooter>
    </main>
  );
}

function WorkoutActionsSheet({ day, days, collapsed, onToggle, onCopy, close }) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [targetId, setTargetId] = useState(null);
  const screenRef = useRef(null);
  const navigated = useRef(false);
  useLayoutEffect(() => {
    if (navigated.current) focusNavigationTarget(screenRef.current?.querySelector(copyOpen ? '.detail-header-back' : '.plan-copy-open'));
  }, [copyOpen]);
  const targets = days.filter(target => target.id !== day.id);
  const canCopy = Boolean(day.exercises.length && targets.some(target => !target.exercises.length));
  const selected = targets.find(target => target.id === targetId && !target.exercises.length);
  return <main ref={screenRef} className="screen detail-screen plan-workout-actions-sheet" role="dialog" aria-modal="true" aria-label={copyOpen ? 'Copy exercises' : 'Workout options'}>
    <SheetHeader title={copyOpen ? 'Copy exercises' : 'Workout options'} onClose={close}
      onBack={copyOpen ? () => setCopyOpen(false) : undefined} backLabel="Back to workout options" />
    <div className="plan-workout-actions-body">
      <p className="plan-workout-action-source">{day.weekday} · {workoutDisplayParts(day, day.weekday).primary}</p>
      {copyOpen ? <>
        <h2>Copy exercises to</h2>
        <div className="plan-copy-destinations" role="radiogroup" aria-label="Destination workout">
          {targets.map(target => <button type="button" key={target.id} role="radio" aria-checked={targetId === target.id}
            disabled={target.exercises.length > 0} onClick={() => setTargetId(target.id)}>
            <span><strong>{target.weekday} · {workoutDisplayParts(target, target.weekday).primary}</strong>
              <small>{target.exercises.length ? 'Already has exercises' : 'Empty workout'}</small></span>
            <i aria-hidden="true">{targetId === target.id ? '✓' : ''}</i>
          </button>)}
        </div>
      </> : <>
        <button type="button" className="choice-row plan-copy-open" disabled={!canCopy} onClick={() => { navigated.current = true; setCopyOpen(true); }}>
          <span>Copy exercises to another day{!canCopy && <small>{day.exercises.length ? 'No empty workout available' : 'Add an exercise first'}</small>}</span><span aria-hidden="true">›</span>
        </button>
        <button type="button" className="choice-row" onClick={() => { onToggle(); close(); }}>{collapsed ? 'Expand workout' : 'Collapse workout'}</button>
      </>}
    </div>
    {copyOpen && <SheetActionFooter separate><Button disabled={!selected} onClick={() => { onCopy(day.id, selected.id); close(); }}>COPY</Button></SheetActionFooter>}
  </main>;
}

export function PlanEditor({
  source,
  profile,
  mode = "review",
  generatedAcceptance = false,
  previewNavigationRef,
  sourceReview = null,
  saveError = '',
  onSave,
  onCancel,
  showCancel = true,
  saving = false,
  reviewExerciseIds = [],
  headingRef,
  exerciseState = null,
  onRegisterCustomExercise,
  onRememberExerciseAlias,
  onDirtyChange,
  active = true,
  scratchSessionRef,
}) {
  const withWarmupPreference = (value) => {
    const next = {
      ...clone(value),
      includeRecommendedWarmups:
        value.includeRecommendedWarmups ??
        profile.recommendedWarmupsEnabled !== false,
    };
    if(mode==='import')for(const day of next.days||[])for(const exercise of day.exercises||[])applySavedPlanImportMatch(exercise,exerciseState);
    return next;
  };
  const [program, setProgram] = useState(() => withWarmupPreference(source));
  // Read-only source identities for grouped review, after the existing remembered
  // mapping step. Keep excluded members available without asking known aliases again.
  const importReviewSource = useRef(program);
  const pendingNumberCommits = useRef(new Set());
  const initialImportMatches = useRef(importMatchEntries(program).map(entry=>entry.id));
  const [resolutionOpen,setResolutionOpen] = useState(()=>mode==='import'&&importResolutionGroups(sourceReview,program).length>0);
  const [resolutionRevisit,setResolutionRevisit] = useState(null);
  const [optionalMatchesOpen,setOptionalMatchesOpen]=useState(false);
  const matchHandoffUntil=useRef(0);
  const resolutionMatches = [...new Set([...initialImportMatches.current,...importMatchEntries(program).map(entry=>entry.id)])];
  initialImportMatches.current = resolutionMatches;
  const [resolvedImportIssues, setResolvedImportIssues] = useState({});
  const [importResolutionRevisions,setImportResolutionRevisions] = useState({});
  const excludedImportExercises=useRef(new Map());
  const [importReviewRequest, setImportReviewRequest] = useState(0);
  const importReviewRef = useRef(null);
  const pendingSourceReviews = pendingImportIssues(sourceReview, resolvedImportIssues).length;
  const sourceDecisionSummary = importDecisionSummary(sourceReview, resolvedImportIssues);
  const advancedReviewOriginals = useRef(new Map());
  const revealImportReview = () => {
    if(mode==='import'){setResolutionOpen(true);return;}
    setImportReviewRequest(value => value + 1);
    const reviewPanel = importReviewRef.current?.querySelector('.plan-import-issues');
    const panel = reviewPanel?.querySelector('.plan-import-notes, .plan-import-choice[data-unresolved="true"]') || reviewPanel;
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const resolveImportIssue = (issue, value) => {
    let dependentDecisions=[];
    if(issue.field==='prescription'&&value){
      const ex=program.days.find(d=>d.id===issue.dayId)?.exercises.find(e=>e.id===issue.exerciseId);
      const candidate=ex&&clone(ex);
      if(candidate&&issue.partialPrescription)candidate.partialPrescription=issue.partialPrescription;
      if(candidate?.partialPrescription&&!resolvePartialPrescription(candidate,value)) {resolveImportIssue(issue,null);return;}
      const count=issue.partialPrescription||ex?.partialPrescription?candidate?.sets.length:Number(value.sets);
      if(ex&&ex.sets.length!==count)dependentDecisions=(sourceReview?.issues||[]).filter(item=>item.id!==issue.id&&item.exerciseId===issue.exerciseId&&['advanced','sourceUnit'].includes(item.field));
    }
    if(issue.field==='optional'&&value!==null&&!['include','exclude'].includes(value?.value)){resolveImportIssue(issue,null);return;}
    if(issue.field==='sourceUnit' && value && !applySourceUnitDecision(clone(program),issue,value.unit)) {
      setResolvedImportIssues(current=>({...current,[issue.id]:false}));
      return;
    }
    if (value === null) {
      setResolvedImportIssues(current => ({...current,[issue.id]:false}));
      if(issue.id.startsWith('hybrid-'))setProgram(current=>({...current,importMetadata:{...current.importMetadata,pendingHybrid:[...new Set([...(current.importMetadata?.pendingHybrid||[]),issue.id])]}}));
      return;
    }
    const restoredOptional=issue.field==='optional'&&value.value==='include'?excludedImportExercises.current.get(issue.exerciseId):null;
    setProgram(current => {
      const next = clone(current);
      const day = next.days.find(item => item.id === issue.dayId);
      const exercise = day?.exercises.find(item => item.id === issue.exerciseId);
      // A changed set count only invalidates decisions tied to those set slots.
      // Do not clear unrelated exercise matches, optional choices or answers.
      for(const dependent of dependentDecisions){
        const original=advancedReviewOriginals.current.get(dependent.id);
        const set=original&&exercise?.sets.find(item=>item.id===original.id);
        if(set)for(const key of ['setType','segments','rir']){if(Object.hasOwn(original,key))set[key]=clone(original[key]);else delete set[key];}
      }
      if (issue.field === 'day' && day) day.weekday = value.value;
      if (issue.field === 'rir' && exercise) exercise.targetRir = value.value === '' ? null : Number(value.value);
      if (issue.field === 'loggingMode' && exercise) exercise.loggingMode = value.value;
      if (issue.field === 'advanced' && exercise) {
        // Re-selecting a method/target replaces this decision rather than adding
        // a second special set. Other prescription fields remain untouched.
        const previous = advancedReviewOriginals.current.get(issue.id);
        if (previous) {
          const oldSet = exercise.sets.find(set => set.id === previous.id);
          if (oldSet) for (const key of ['setType','segments','rir']) {
            if (Object.hasOwn(previous, key)) oldSet[key] = clone(previous[key]);
            else delete oldSet[key];
          }
        }
        const set = exercise.sets[value.setIndex];
        if (set) advancedReviewOriginals.current.set(issue.id, clone(set));
        if (set && ['drop','rest_pause','amrap'].includes(value.value)) {
          set.setType = value.value;
          if (value.value !== 'amrap') set.segments = [];
        }
        if (set && value.value === 'failure') set.rir = 0;
        exercise.notes = [...new Set([exercise.notes, issue.source].filter(Boolean))].join('\n');
      }
      if (issue.field === 'load' && exercise) exercise.sets.forEach(set => { set.weight = value.value === '' ? null : Number((Number(value.value) * (value.unit === 'lb' ? 0.45359237 : 1)).toFixed(2)); });
      if (issue.field === 'sourceUnit') applySourceUnitDecision(next,issue,value.unit);
      if (issue.field === 'prescription' && exercise) {
        if(issue.partialPrescription)exercise.partialPrescription=clone(issue.partialPrescription);
        if (exercise.partialPrescription) resolvePartialPrescription(exercise,value);
        else {
        exercise.repMin = value.repMin; exercise.repMax = value.repMax;
        exercise.sets = Array.from({length: value.sets}, (_, index) => ({ ...exercise.sets[Math.min(index,exercise.sets.length-1)], id: exercise.sets[index]?.id || `${exercise.id}-review-set-${index}`, reps: value.repMin, completed: false }));
        }
      }
      if (issue.field === 'alternative' && exercise && value.option) {
        const option=value.option,match=matchImportedExerciseName(option.name),item=exerciseCatalog[match.exerciseId];
        exercise.repMin=option.repMin;exercise.repMax=option.repMax;
        exercise.sets=Array.from({length:option.sets},(_,index)=>({id:exercise.sets[index]?.id||`${exercise.id}-alternative-${index}`,reps:option.repMin,weight:option.weight,completed:false}));
        exercise.targetRir=option.targetRir??null;
        exercise.loggingMode=option.loggingMode||'normal';
        if(option.measure)exercise.measure=option.measure;else delete exercise.measure;
        exercise.restSeconds=option.restSeconds??item?.restSeconds??90;
        exercise.importedName=option.name;exercise.originalImportedName=option.name;
        if(item&&['matched','alias'].includes(match.status)){
          exercise.exerciseId=item.id;exercise.exerciseSource='catalog';exercise.matchStatus='confirmed-match';delete exercise.importedExercise;
        }else{
          exercise.exerciseId=`imported-custom-${exercise.id}`;exercise.exerciseSource='imported-custom';exercise.matchStatus='original';
          exercise.importedExercise={id:exercise.exerciseId,name:option.name,source:'imported',pattern:null,muscles:null,equipment:null};
        }
      }
      if (['instruction','alternative'].includes(issue.field) && exercise) exercise.notes = [exercise.notes,issue.source].filter(Boolean).join('\n');
      applyHybridDecision(next,issue,value,{excluded:excludedImportExercises.current,resolved:resolvedImportIssues,issues:sourceReview?.issues||[]});
      if(next.importMetadata?.pendingHybrid)next.importMetadata.pendingHybrid=[...new Set([...next.importMetadata.pendingHybrid,...dependentDecisions.filter(item=>item.id.startsWith('hybrid-')).map(item=>item.id)])];
      return next;
    });
    if(dependentDecisions.length)setImportResolutionRevisions(current=>({...current,...Object.fromEntries(dependentDecisions.map(item=>[item.id,(current[item.id]||0)+1]))}));
    setResolvedImportIssues(current => ({...current,
      ...Object.fromEntries(dependentDecisions.map(item=>[item.id,false])),
      ...restoredOptional?.resolved,
      ...(issue.field==='optional'&&value.value==='exclude'?Object.fromEntries(sourceReview.issues.filter(i=>i.exerciseId===issue.exerciseId).map(i=>[i.id,{excluded:true}])):{}),[issue.id]:value}));
  };
  const reviewConflicts = useMemo(() => reviewExerciseIds.length
    ? plannedExerciseSafetyConflicts(program, trainingSafetyFor(profile)).filter(item => reviewExerciseIds.includes(item.exerciseEntryId))
    : [], [program, profile, reviewExerciseIds.join("|")]);
  const reviewTargetId = reviewConflicts[0]?.exerciseEntryId;
  const [dirty, setDirty] = useState(false);
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  const firstUnresolvedExercise = (value) =>
    value.days
      .flatMap((day) => day.exercises)
      .find((exercise) =>
        ["unresolved", "needs-name-review"].includes(exercise.matchStatus),
      )?.id ?? null;
  const [expandedExerciseId, setExpandedExerciseId] = useState(() =>
    reviewExerciseIds[0] || firstUnresolvedExercise(source),
  );
  const [exercisePickerId, setExercisePickerId] = useState(null);
  const [importAdvanceTarget, setImportAdvanceTarget] = useState(null);
  useEffect(() => {
    if (!importAdvanceTarget || expandedExerciseId !== importAdvanceTarget) return;
    let cancelled = false, cancelReveal;
    const frame = requestAnimationFrame(async () => {
      const target = document.getElementById(`import-exercise-${importAdvanceTarget}`);
      let screen = target?.parentElement;
      while (screen && !(screen.scrollHeight > screen.clientHeight && /auto|scroll/.test(getComputedStyle(screen).overflowY))) screen = screen.parentElement;
      screen ||= document.scrollingElement;
      if (!target || !screen) return;
      const animations = screen.getAnimations({subtree:true}).filter(animation => animation.effect?.getTiming().iterations !== Infinity);
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      if (cancelled || !target.isConnected) return;
      const header = screen.querySelector('.detail-header, .long-form-sheet-header');
      cancelReveal = revealPlanConflict(screen, target, (header?.getBoundingClientRect().height || 64) + 16);
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); cancelReveal?.(); };
  }, [importAdvanceTarget, expandedExerciseId]);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [rememberMatchIds, setRememberMatchIds] = useState([]);
  const [prescriptionEditorId, setPrescriptionEditorId] = useState(null);
  const [weightEditorId, setWeightEditorId] = useState(null);
  const [addingToDayId, setAddingToDayId] = useState(null);
  const [removedExercises, setRemovedExercises] = useState([]);
  const [customCreation, setCustomCreation] = useState(null);
  const [customAddNotice, setCustomAddNotice] = useState('');
  const customBackgroundRef = useRef(null);
  const customTriggerRef = useRef(null);
  const [workoutActionsDayId, setWorkoutActionsDayId] = useState(null);
  const workoutActionsBackgroundRef = useRef(null);
  const workoutActionsTriggerRef = useRef(null);
  const [pairingExerciseId, setPairingExerciseId] = useState(null);
  const [expandedWarmupDayId, setExpandedWarmupDayId] = useState(null);
  const [collapsedDayIds, setCollapsedDayIds] = useState([]);
  const resetKey = `${source.id}|${reviewExerciseIds.join("|")}`;
  const initializedKey = useRef(resetKey);
  const revealedReviewTarget = useRef(null);
  const reorderRootRef = useRef(null);
  const reorderGestureRef = useRef(null);
  const reorderPreviewRef = useRef(null);
  const reorderFrameRef = useRef(null);
  const programRef = useRef(program);
  const beginCustomCreation = (name = "", addToDayId = null) => {
    customBackgroundRef.current = reorderRootRef.current?.closest('.screen') || null;
    customTriggerRef.current = document.activeElement;
    setCustomAddNotice('');
    setCustomCreation({ name, addToDayId });
  };
  const commitReorderRef = useRef(null);
  const suppressReorderClickUntil = useRef(0);
  const [reorderView, setReorderView] = useState(null);
  // Opt in only for generated acceptance previews. Mode and live gesture are
  // separate: dropping a card never leaves the mode or applies this draft.
  const [previewReordering, setPreviewReordering] = useState(false);
  const cancelReorderRef = useRef(null);
  const reorderEntryRef = useRef(null);
  const previewFooterAnchorRef = useRef(null);
  const previewRestoreFocusRef = useRef(false);
  const explicitPreview = generatedAcceptance && mode === 'review';
  const reorderMode = explicitPreview && previewReordering;
  const SummaryElement = reorderMode ? 'div' : 'button';
  const finishPreviewReorder = () => {
    cancelReorderRef.current?.();
    // Restoring an expanded editor adds height above the existing footer.
    // Keep a currently visible footer in place using its current scroll owner;
    // header Back must not jump down to a footer that is off screen.
    const footer = reorderRootRef.current?.parentElement?.querySelector('.sheet-action-footer');
    if (footer) {
      let scroller = footer.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      scroller ||= document.scrollingElement;
      const bounds = footer.getBoundingClientRect();
      if (scroller && bounds.top >= 0 && bounds.top < window.innerHeight)
        previewFooterAnchorRef.current = { footer, scroller, top: bounds.top };
    }
    previewRestoreFocusRef.current = true;
    setPreviewReordering(false);
  };
  useLayoutEffect(() => {
    const anchor = previewFooterAnchorRef.current;
    previewFooterAnchorRef.current = null;
    if (!reorderMode && anchor?.footer.isConnected)
      anchor.scroller.scrollTop += anchor.footer.getBoundingClientRect().top - anchor.top;
    if (!reorderMode && previewRestoreFocusRef.current) {
      previewRestoreFocusRef.current = false;
      focusNavigationTarget(reorderEntryRef.current);
    }
  }, [reorderMode]);
  const backFromPreview = () => {
    if (reorderMode) finishPreviewReorder();
    else onCancel?.();
  };
  useImperativeHandle(previewNavigationRef, () => ({ back: backFromPreview }));
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  programRef.current = program;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Scratch keeps this editor mounted while visiting setup. Read only at a
  // navigation boundary; do not mirror every keystroke into another draft store.
  useImperativeHandle(scratchSessionRef, () => ({
    read() {
      flushSync(() => [...pendingNumberCommits.current].forEach(commit => commit()));
      return { program: programRef.current, dirty: dirtyRef.current };
    },
    rename(name) {
      if (programRef.current.name === name) return;
      setProgram(current => ({ ...current, name, nameEdited: true }));
      setDirty(true);
    },
  }), []);
  useLayoutEffect(() => {
    const gesture = reorderGestureRef.current;
    if (!reorderView || !gesture?.active || !reorderPreviewRef.current) return;
    reorderPreviewRef.current.style.setProperty(
      "--reorder-drag-y",
      `${gesture.clientY - gesture.startY}px`,
    );
  }, [reorderView]);
  useEffect(() => {
    // The state initializer already prepared this source on mount.
    if (initializedKey.current === resetKey) return;
    initializedKey.current = resetKey;
    setResolvedImportIssues({});
    setImportReviewRequest(0);
    const next = withWarmupPreference(source);
    importReviewSource.current = next;
    setProgram(next);
    setDirty(false);
    setExpandedExerciseId(reviewExerciseIds[0] || firstUnresolvedExercise(next));
    setExercisePickerId(null);
    setExerciseQuery("");
    setRememberMatchIds([]);
    setPrescriptionEditorId(null);
    setWeightEditorId(null);
    setAddingToDayId(null);
    setRemovedExercises([]);
    setWorkoutActionsDayId(null);
    setPairingExerciseId(null);
    setExpandedWarmupDayId(null);
    setCollapsedDayIds([]);
    setPreviewReordering(false);
  }, [resetKey]);
  useEffect(() => {
    if (reviewTargetId) setExpandedExerciseId(reviewTargetId);
  }, [resetKey, reviewTargetId]);
  useEffect(() => {
    if (!reviewTargetId || expandedExerciseId !== reviewTargetId) return;
    // Initial Review Plan navigation may reveal its target; manual disclosure
    // toggles must not repeat that navigation scroll.
    if (revealedReviewTarget.current === `${resetKey}|${reviewTargetId}`) return;
    let cancelled = false;
    let cancelReveal;
    const frame = requestAnimationFrame(async () => {
      const target = document.getElementById(`import-exercise-${reviewTargetId}`);
      const screen = target?.closest('.detail-screen');
      if (!target || !screen) return;
      // Do not compete with the sheet entrance or scroll the background page.
      const animations = [];
      for (let node = screen; node; node = node.parentElement) animations.push(...node.getAnimations());
      await Promise.all(animations.filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      if (cancelled || !target.isConnected) return;
      const header = screen.querySelector('.detail-header, .long-form-sheet-header');
      const inset = (header?.getBoundingClientRect().height || 64) + 16;
      revealedReviewTarget.current = `${resetKey}|${reviewTargetId}`;
      cancelReveal = revealPlanConflict(screen, target, inset);
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); cancelReveal?.(); };
  }, [resetKey, reviewTargetId, expandedExerciseId]);
  const imported = program.source === "ai-import";
  const scratch = mode === "scratch";
  const directEditor = mode === "edit" || scratch;
  const preview = ["review", "import", "expert"].includes(mode);
  const compactWarmupPreview = mode === "review" || mode === "expert";
  const importReview = imported && mode === "import";
  const importSafety = importReview ? trainingSafetyFor(exerciseState?.profile || profile) : null;
  const importApplySafetyIssues=importReview?planImportSafetyIssues(program,exerciseState?.profile||profile):[];
  const originalImportCount=importReview?program.days.flatMap(day=>day.exercises).filter(exercise=>['original','confirmed-custom'].includes(exercise.matchStatus)).length:0;
  const importSafetyConflicts = importReview ? plannedExerciseSafetyConflicts(program, importSafety) : [];
  const importGym = importReview ? defaultGymProfile(exerciseState) : null;
  const importUnavailable = importGym ? program.days.flatMap(day => day.exercises).filter(exercise => {
    const item = exerciseCatalog[exercise.exerciseId];
    return item && !isExerciseAllowed(item, { ...effectiveGymProfile(exerciseState, null), ignoreTrainingSafety: true });
  }) : [];
  const allowSupersets = planEditorAllowsSupersets(mode);
  const supportsReorder = mode === "edit" || importReview || mode === "review" || scratch;
  const allowReorder = supportsReorder && (!explicitPreview || reorderMode);
  const allowAddExercises = supportsReorder;
  const orderedProgramDays = useMemo(
    () => sourceReview ? program.days : chronologicalProgramDays(program.days),
    [program.days, sourceReview],
  );
  const unresolved = program.days
    .flatMap((day) => day.exercises)
    .filter((exercise) =>
      ["unresolved", "needs-name-review"].includes(exercise.matchStatus),
    ).length;
  const totalExercises = program.days.reduce(
    (total, day) => total + day.exercises.length,
    0,
  );
  const readyExercises = totalExercises - unresolved;
  // A reps-only open target is not consent to an empty timed prescription after
  // changing the exercise identity. Use the existing prescription editor.
  const openDurationReview = importReview && program.days.flatMap(day=>day.exercises).find(exercise=>hasUnspecifiedRepTarget(exercise)&&exerciseMeasure(exercise)==='seconds');
  const keepableUnresolved = program.days
    .flatMap((day) => day.exercises)
    .filter((exercise) =>
      ["unresolved", "needs-name-review"].includes(exercise.matchStatus),
    ).length;
  const allEditorItems = useMemo(
    () => [...Object.values(exerciseCatalog), ...availableCustomExerciseItems(exerciseState)],
    [exerciseState?.customExercises],
  );
  const catalogNeeded = exercisePickerId !== null || addingToDayId !== null;
  const catalogCache = useRef(null);
  const catalog = useMemo(() => {
    if (!catalogNeeded) return [];
    if (catalogCache.current?.source === allEditorItems && catalogCache.current.profile === profile) return catalogCache.current.items;
    const items = allEditorItems.filter(createPlanEditorExerciseFilter(profile)).sort((a, b) => a.name.localeCompare(b.name));
    catalogCache.current = { source: allEditorItems, profile, items };
    return items;
  }, [catalogNeeded, allEditorItems, profile]);
  const editorCatalog = useMemo(() => Object.fromEntries(allEditorItems.map(item => [item.id, item])), [allEditorItems]);
  const pairingContext = pairingExerciseId
    ? program.days
        .map((day) => {
          const exercise = day.exercises.find(
            (item) => item.id === pairingExerciseId,
          );
          if (!exercise || exercise.supersetId) return null;
          return {
            day,
            exercise,
            candidates: day.exercises.filter(
              (candidate) =>
                candidate.id !== exercise.id &&
                !candidate.supersetId &&
                candidate.sets.length === exercise.sets.length,
            ),
          };
        })
        .find(Boolean)
    : null;
  const commitReorder = (gesture) => {
    const current = programRef.current;
    if (!current || !gesture || gesture.targetIndex === null) return false;
    if (gesture.kind === "exercise") {
      const sourceDay = current.days.find((day) => day.id === gesture.dayId);
      if (!sourceDay) return false;
      const moved = moveExerciseReorderBlock(
        sourceDay.exercises,
        gesture.exerciseId,
        gesture.targetIndex,
      );
      if (moved === sourceDay.exercises) return false;
      const next = clone(current);
      const targetDay = next.days.find((day) => day.id === gesture.dayId);
      targetDay.exercises = moved.map((exercise) => clone(exercise));
      targetDay.estimatedMinutes = estimateWorkoutMinutes(targetDay, profile, next);
      const apply = () => setProgram(next);
      if (gesture.animate) runRookViewTransition(apply);
      else apply();
      setDirty(true);
      setReorderAnnouncement(`${gesture.label} moved in ${targetDay.weekday}.`);
      return true;
    }
    const moved = moveWorkoutThroughWeek(
      current.days,
      gesture.dayId,
      gesture.targetIndex,
    );
    if (moved === current.days) return false;
    const destination = moved.find((day) => day.id === gesture.dayId);
    const apply = () => setProgram({ ...current, days: moved, scheduleOrderEdited: true });
    if (gesture.animate) runRookViewTransition(apply);
    else apply();
    setDirty(true);
    setReorderAnnouncement(
      `${gesture.label} moved to ${destination?.weekday || "the selected day"}.`,
    );
    return true;
  };
  commitReorderRef.current = commitReorder;

  const moveExerciseWithControls = (dayId, exerciseId, destination) => {
    const day = programRef.current.days.find((item) => item.id === dayId);
    const blocks = buildExerciseReorderBlocks(day?.exercises || []);
    const sourceIndex = blocks.findIndex((block) =>
      block.exercises.some((exercise) => exercise.id === exerciseId),
    );
    if (sourceIndex < 0 || blocks[sourceIndex].locked) return;
    const targetIndex =
      destination === "first"
        ? 0
        : destination === "last"
          ? blocks.length - 1
          : sourceIndex + destination;
    commitReorder({
      kind: "exercise",
      dayId,
      exerciseId,
      label: exerciseName(blocks[sourceIndex].exercises[0]),
      targetIndex,
      animate: true,
    });
  };
  const moveWorkoutWithControls = (dayId, destination) => {
    const days = chronologicalProgramDays(programRef.current.days);
    const sourceIndex = days.findIndex((day) => day.id === dayId);
    if (sourceIndex < 0) return;
    const targetIndex =
      destination === "first"
        ? 0
        : destination === "last"
          ? days.length - 1
          : sourceIndex + destination;
    commitReorder({
      kind: "workout",
      dayId,
      label: workoutDisplayParts(days[sourceIndex], days[sourceIndex].weekday)
        .primary,
      targetIndex,
      animate: true,
    });
  };

  useEffect(() => {
    if (!allowReorder || !active) return undefined;
    const root = reorderRootRef.current;
    if (!root) return undefined;
    const clearFrame = () => {
      if (reorderFrameRef.current)
        cancelAnimationFrame(reorderFrameRef.current);
      reorderFrameRef.current = null;
    };
    const resetDisplacement = (gesture) => {
      gesture?.units?.forEach((unit) =>
        unit.elements.forEach((element) => {
          element.style.removeProperty("transform");
          element.classList.remove("reorder-live-source");
          element.classList.remove("reorder-drop-before", "reorder-drop-after");
        }),
      );
    };
    const clearCandidate = () => {
      const gesture = reorderGestureRef.current;
      // Release ownership before DOM restoration or lostpointercapture can
      // dispatch another event. No move blocker or auto-scroll survives idle.
      reorderGestureRef.current = null;
      clearFrame();
      if (gesture?.holdTimer) clearTimeout(gesture.holdTimer);
      gesture?.releaseListeners?.();
      if (gesture) gesture.active = false;
      if (gesture?.pointerId != null && gesture.activator.hasPointerCapture?.(gesture.pointerId))
        gesture.activator.releasePointerCapture(gesture.pointerId);
      resetDisplacement(gesture);
      root.classList.remove("is-reordering", "is-week-reordering");
      if (gesture?.compactStyle) {
        root.style.paddingTop = gesture.compactStyle.paddingTop;
        root.style.minHeight = gesture.compactStyle.minHeight;
        gesture.scroller.scrollTop = gesture.compactStyle.scrollTop;
        gesture.scroller.style.overflowAnchor = gesture.compactStyle.overflowAnchor;
      }
      setReorderView(null);
    };
    const activatorFor = (target) => {
      const activator = target.closest?.("[data-reorder-kind]");
      if (!activator || !root.contains(activator)) return null;
      const blocked = target.closest?.(
        "input, textarea, select, a, [contenteditable='true'], [data-no-reorder]",
      );
      return blocked ? null : activator;
    };
    const scrollContainerFor = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const overflow = getComputedStyle(current).overflowY;
        if (
          /(auto|scroll)/.test(overflow) &&
          current.scrollHeight > current.clientHeight
        )
          return current;
        current = current.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const measureUnits = (gesture) => {
      let groups;
      if (gesture.kind === "workout") {
        groups = Array.from(
          root.querySelectorAll("[data-reorder-workout-section]"),
        ).map((element) => ({
          index: Number(element.dataset.reorderIndex),
          elements: [element],
        }));
      } else {
        const cards = Array.from(
          root.querySelectorAll("[data-reorder-block-index]"),
        ).filter(
          (card) =>
            card.closest("[data-day-id]")?.dataset.dayId === gesture.dayId,
        );
        const grouped = new Map();
        cards.forEach((card) => {
          const index = Number(card.dataset.reorderBlockIndex);
          const entry = grouped.get(index) || { index, elements: [] };
          entry.elements.push(card);
          grouped.set(index, entry);
        });
        groups = [...grouped.values()];
      }
      const units = groups
        .sort((first, second) => first.index - second.index)
        .map((unit) => {
          const rects = unit.elements.map((element) =>
            element.getBoundingClientRect(),
          );
          const top = Math.min(...rects.map((rect) => rect.top));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          return {
            ...unit,
            top,
            bottom,
            height: bottom - top,
            center: (top + bottom) / 2,
          };
        });
      const sourceUnit = units.find((unit) => unit.index === gesture.sourceIndex);
      if (!sourceUnit) return null;
      const parent = sourceUnit.elements[0]?.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const gap = Number.parseFloat(parentStyle?.rowGap || parentStyle?.gap || "0") || 0;
      return { units, sourceUnit, sourceSpan: sourceUnit.height + gap };
    };
    const targetForPosition = (gesture, clientY) => {
      const scrollDelta = gesture.scroller.scrollTop - gesture.scrollTopAtActivation;
      const activeCenter =
        gesture.sourceUnit.top + clientY - gesture.startY + gesture.sourceUnit.height / 2;
      const remainingCenters = gesture.units
        .filter((unit) => unit.index !== gesture.sourceIndex)
        .map((unit) =>
          unit.center -
          scrollDelta -
          (gesture.kind !== "workout" && unit.index > gesture.sourceIndex ? gesture.sourceSpan : 0),
        );
      let targetIndex = remainingCenters.filter((center) => activeCenter >= center).length;
      const previous = gesture.lastTargetIndex;
      if (previous !== undefined && targetIndex !== previous) {
        const hysteresis = gesture.pointerType === "mouse" ? 3 : 6;
        if (
          targetIndex > previous &&
          activeCenter < remainingCenters[targetIndex - 1] + hysteresis
        )
          targetIndex = previous;
        if (
          targetIndex < previous &&
          activeCenter > remainingCenters[targetIndex] - hysteresis
        )
          targetIndex = previous;
      }
      return targetIndex;
    };
    const applyDisplacement = (gesture, targetIndex) => {
      const remaining = gesture.units.filter(unit => unit.index !== gesture.sourceIndex);
      gesture.units.forEach((unit) => {
        let offset = 0;
        if (
          targetIndex > gesture.sourceIndex &&
          unit.index > gesture.sourceIndex &&
          unit.index <= targetIndex
        )
          offset = -gesture.sourceSpan;
        if (
          targetIndex < gesture.sourceIndex &&
          unit.index >= targetIndex &&
          unit.index < gesture.sourceIndex
        )
          offset = gesture.sourceSpan;
        unit.elements.forEach((element) => {
          element.classList.toggle("reorder-drop-before", unit === remaining[targetIndex] && element === unit.elements[0]);
          element.classList.toggle("reorder-drop-after", targetIndex === remaining.length && unit === remaining.at(-1) && element === unit.elements.at(-1));
          if (unit.index === gesture.sourceIndex)
            element.classList.add("reorder-live-source");
          element.style.transform = offset
            ? `translate3d(0, ${offset}px, 0)`
            : "translate3d(0, 0, 0)";
        });
      });
    };
    const publish = (gesture) => {
      const targetIndex = targetForPosition(gesture, gesture.clientY);
      if (
        gesture.lastTargetIndex !== undefined &&
        gesture.lastTargetIndex !== targetIndex &&
        performance.now() - (gesture.lastTargetHapticAt || 0) >= 100
      ) {
        triggerHaptic("tap");
        gesture.lastTargetHapticAt = performance.now();
      }
      gesture.lastTargetIndex = targetIndex;
      gesture.targetIndex = targetIndex;
      applyDisplacement(gesture, targetIndex);
      if (!gesture.viewPublished) {
        gesture.viewPublished = true;
        setReorderView({
          kind: gesture.kind,
          dayId: gesture.dayId,
          exerciseId: gesture.exerciseId,
          sourceIndex: gesture.sourceIndex,
          targetIndex,
          label: gesture.label,
          meta: gesture.meta,
          left: gesture.sourceUnit.left,
          width: gesture.sourceUnit.width,
          top: gesture.sourceUnit.top,
        });
      }
      moveReorderPreview(reorderPreviewRef.current, "--reorder-drag-y", gesture.clientY - gesture.startY);
    };
    const autoScroll = (time) => {
      const gesture = reorderGestureRef.current;
      if (!gesture?.active) return;
      const scroller = gesture.scroller;
      const viewport = scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
      const zone = 56;
      let direction = 0;
      let depth = 0;
      if (gesture.clientY < viewport.top + zone) {
        direction = -1;
        depth = (viewport.top + zone - gesture.clientY) / zone;
      } else if (gesture.clientY > viewport.bottom - zone - 16) {
        direction = 1;
        depth = (gesture.clientY - (viewport.bottom - zone - 16)) / zone;
      }
      const elapsed = Math.min(32, time - (gesture.frameTime || time));
      gesture.frameTime = time;
      if (direction) {
        if (gesture.kind === "workout") {
          const elements = [...root.querySelectorAll('[data-reorder-workout-section]')];
          if ((direction > 0 && elements.at(-1)?.getBoundingClientRect().bottom <= viewport.bottom - 16) ||
              (direction < 0 && elements[0]?.getBoundingClientRect().top >= viewport.top + 16)) {
            reorderFrameRef.current = requestAnimationFrame(autoScroll);
            return;
          }
        }
        const distance = direction * (180 + 720 * Math.min(1, depth)) * elapsed / 1000;
        const before = scroller.scrollTop;
        scroller.scrollTop += distance;
        if (scroller.scrollTop !== before) publish(gesture);
      }
      reorderFrameRef.current = requestAnimationFrame(autoScroll);
    };
    const activate = (gesture) => {
      if (!gesture || reorderGestureRef.current !== gesture) return;
      // Measure the final collapsed geometry, not the old expanded card height.
      if (gesture.kind !== "workout" && !explicitPreview)
        flushSync(() => { setExpandedExerciseId(null); setExercisePickerId(null); });
      gesture.active = true;
      gesture.holdTimer = null;
      gesture.scroller = scrollContainerFor(gesture.activator);
      if (gesture.kind === "workout") {
        const section = gesture.activator.closest('[data-reorder-workout-section]');
        const oldTop = section.getBoundingClientRect().top;
        const padding = parseFloat(getComputedStyle(root).paddingTop) || 0;
        gesture.compactStyle = { paddingTop: root.style.paddingTop, minHeight: root.style.minHeight, scrollTop: gesture.scroller.scrollTop, overflowAnchor: gesture.scroller.style.overflowAnchor };
        gesture.scroller.style.overflowAnchor = "none";
        // Keep the source under the pointer and prevent scroll clamping while
        // display:none takes all expanded exercise content out of layout.
        root.style.minHeight = `${root.getBoundingClientRect().height}px`;
        root.classList.add("is-week-reordering");
        root.style.paddingTop = `${padding + Math.max(0, oldTop - section.getBoundingClientRect().top)}px`;
        gesture.scroller.scrollTop = gesture.compactStyle.scrollTop;
      }
      const measured = measureUnits(gesture);
      if (!measured) {
        clearCandidate();
        return;
      }
      gesture.units = measured.units;
      gesture.sourceUnit = measured.sourceUnit;
      gesture.sourceSpan = measured.sourceSpan;
      gesture.sourceUnit.left = Math.min(
        ...gesture.sourceUnit.elements.map(
          (element) => element.getBoundingClientRect().left,
        ),
      );
      gesture.sourceUnit.width = Math.max(
        ...gesture.sourceUnit.elements.map(
          (element) => element.getBoundingClientRect().right,
        ),
      ) - gesture.sourceUnit.left;
      gesture.scrollTopAtActivation = gesture.scroller.scrollTop;
      triggerHaptic("tap");
      publish(gesture);
      reorderFrameRef.current = requestAnimationFrame(autoScroll);
    };
    const buildCandidate = (activator, clientY, pointerType) => {
      const kind = activator.dataset.reorderKind;
      const dayId = activator.dataset.dayId;
      const exerciseId = activator.dataset.exerciseId || null;
      const sourceIndex = Number(
        kind === "workout"
          ? activator.closest("[data-reorder-workout-section]")?.dataset.reorderIndex
          : activator.closest("[data-reorder-block-index]")?.dataset.reorderBlockIndex,
      );
      const day = programRef.current.days.find((item) => item.id === dayId);
      const exercise = day?.exercises.find((item) => item.id === exerciseId);
      const exerciseBlock = kind === "exercise"
        ? buildExerciseReorderBlocks(day?.exercises || [])[sourceIndex]
        : null;
      const label = kind === "workout"
        ? workoutDisplayParts(day, day?.weekday).primary
        : exerciseName(exercise);
      return {
        kind,
        dayId,
        exerciseId,
        sourceIndex,
        label,
        meta: kind === "workout"
          ? `${day?.exercises.length || 0} exercises · ~${roundedEstimate(day?.estimatedMinutes)} min`
          : exerciseBlock?.exercises.length === 2
            ? `Superset · ${exerciseName(exerciseBlock.exercises[0])} + ${exerciseName(exerciseBlock.exercises[1])}`
            : null,
        pointerType,
        activator,
        startY: clientY,
        clientY,
        targetIndex: sourceIndex,
        active: false,
      };
    };
    const finish = (commit = true) => {
      const gesture = reorderGestureRef.current;
      if (!gesture) return;
      const wasActive = gesture.active;
      clearCandidate();
      if (wasActive) {
        suppressReorderClickUntil.current = performance.now() + 500;
        if (commit && commitReorderRef.current?.(gesture)) triggerHaptic("tap");
      }
    };
    cancelReorderRef.current = () => finish(false);
    const touchStart = (event) => {
      if (reorderGestureRef.current) finish(false);
      if (event.touches.length !== 1) {
        finish(false);
        return;
      }
      const activator = activatorFor(event.target);
      if (!activator) return;
      const touch = event.touches[0];
      const gesture = buildCandidate(activator, touch.clientY, "touch");
      gesture.touchId = touch.identifier;
      gesture.startX = touch.clientX;
      reorderGestureRef.current = gesture;
      listenForGesture(gesture);
      if (gesture.kind === "workout" || activator.matches('.plan-exercise-drag-handle')) activate(gesture);
      else gesture.holdTimer = setTimeout(() => activate(gesture), 350);
    };
    const touchMove = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture || gesture.pointerType !== "touch") return;
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === gesture.touchId,
      );
      if (!touch || event.touches.length !== 1) { finish(false); return; }
      if (!gesture.active) {
        const distance = Math.hypot(
          touch.clientX - gesture.startX,
          touch.clientY - gesture.startY,
        );
        if (distance > 8) clearCandidate();
        return;
      }
      // A handle's touch-action:none may already suppress native scrolling;
      // a non-cancelable move is not itself a cancellation of that drag.
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      gesture.clientY = touch.clientY;
      publish(gesture);
    };
    const touchEnd = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture || gesture.pointerType !== "touch") return;
      const ended = Array.from(event.changedTouches).some(
        (item) => item.identifier === gesture.touchId,
      );
      if (ended) finish(true);
    };
    const touchCancel = () => finish(false);
    const pointerDown = (event) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      if (reorderGestureRef.current) finish(false);
      const activator = activatorFor(event.target);
      if (!activator) return;
      const gesture = buildCandidate(activator, event.clientY, event.pointerType);
      gesture.pointerId = event.pointerId;
      gesture.startX = event.clientX;
      if (event.pointerType === "pen")
        gesture.holdTimer = setTimeout(() => activate(gesture), 250);
      reorderGestureRef.current = gesture;
      listenForGesture(gesture);
    };
    const pointerMove = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture || gesture.pointerType === "touch" || gesture.pointerId !== event.pointerId)
        return;
      const distance = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      if (!gesture.active && gesture.pointerType === "pen") {
        if (distance > 6) clearCandidate();
        return;
      }
      if (!gesture.active && distance >= 4) {
        activate(gesture);
        if (gesture.active) gesture.activator.setPointerCapture?.(event.pointerId);
      }
      if (!gesture.active) return;
      event.preventDefault();
      gesture.clientY = event.clientY;
      publish(gesture);
    };
    const pointerEnd = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture) return;
      if (gesture.pointerType === "touch") {
        // A pointer cancellation is terminal for touch ownership too, even
        // when no later touchcancel reaches the original handle.
        if (event.type === "pointercancel" && event.pointerType === "touch") finish(false);
        return;
      }
      if (gesture.pointerId !== event.pointerId) return;
      finish(event.type === "pointerup");
    };
    const listenForGesture = (gesture) => {
      // Like Today editing, track the live gesture at the window boundary;
      // pointer release outside the list must still terminate ownership.
      const listeners = gesture.pointerType === "touch"
        ? [["touchmove", touchMove], ["touchend", touchEnd], ["touchcancel", touchCancel], ["pointercancel", pointerEnd]]
        : [["pointermove", pointerMove], ["pointerup", pointerEnd], ["pointercancel", pointerEnd], ["lostpointercapture", pointerEnd]];
      listeners.forEach(([type, handler]) => window.addEventListener(type, handler, {capture:true, passive:!type.endsWith("move")}));
      gesture.releaseListeners = () => listeners.forEach(([type, handler]) => window.removeEventListener(type, handler, true));
    };
    const clickCapture = (event) => {
      if (performance.now() < suppressReorderClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const cancelOnEscape = (event) => {
      if (event.key === "Escape" && reorderGestureRef.current) finish(false);
    };
    const cancelCompactWeek = (event) => {
      if (event.key !== "Escape" || reorderGestureRef.current?.kind !== "workout") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
    };
    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("click", clickCapture, true);
    window.addEventListener("keydown", cancelOnEscape);
    window.addEventListener("keydown", cancelCompactWeek, true);
    window.addEventListener("blur", clearCandidate);
    document.addEventListener("visibilitychange", clearCandidate);
    return () => {
      clearCandidate();
      cancelReorderRef.current = null;
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("click", clickCapture, true);
      window.removeEventListener("keydown", cancelOnEscape);
      window.removeEventListener("keydown", cancelCompactWeek, true);
      window.removeEventListener("blur", clearCandidate);
      document.removeEventListener("visibilitychange", clearCandidate);
    };
  }, [allowReorder, resolutionOpen, active, explicitPreview]);
  const mutateExercise = (dayId, exerciseId, mutate) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      const exercise = day?.exercises.find((item) => item.id === exerciseId);
      if (!exercise) return current;
      mutate(exercise);
      day.estimatedMinutes = estimateWorkoutMinutes(day, profile, next);
      return next;
    });
  };
  const createSuperset = (dayId, firstExerciseId, secondExerciseId) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day) return current;
      const firstIndex = day.exercises.findIndex(
        (item) => item.id === firstExerciseId,
      );
      const secondIndex = day.exercises.findIndex(
        (item) => item.id === secondExerciseId,
      );
      if (
        firstIndex < 0 ||
        secondIndex < 0 ||
        firstIndex === secondIndex ||
        day.exercises[firstIndex].supersetId ||
        day.exercises[secondIndex].supersetId
      )
        return current;
      const [second] = day.exercises.splice(secondIndex, 1);
      const updatedFirstIndex = day.exercises.findIndex(
        (item) => item.id === firstExerciseId,
      );
      day.exercises.splice(updatedFirstIndex + 1, 0, second);
      const supersetId = `superset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      day.exercises[updatedFirstIndex].supersetId = supersetId;
      day.exercises[updatedFirstIndex + 1].supersetId = supersetId;
      return next;
    });
    setPairingExerciseId(null);
  };
  const removeSuperset = (dayId, supersetId) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day) return current;
      day.exercises.forEach((exercise) => {
        if (exercise.supersetId === supersetId) delete exercise.supersetId;
      });
      return next;
    });
    setPairingExerciseId(null);
  };
  const removeExercise = (dayId, exerciseId) => {
    const sourceDay = programRef.current?.days.find((item) => item.id === dayId);
    const removed = sourceDay?.exercises.find((item) => item.id === exerciseId);
    if (!sourceDay || !removed || (!scratch && sourceDay.exercises.length <= 1))
      return;
    if (mode === 'edit') {
      const result=stagePlanRemoval(programRef.current,removedExercises,dayId,exerciseId);
      result.program.days.find(d=>d.id===dayId).estimatedMinutes=estimateWorkoutMinutes(result.program.days.find(d=>d.id===dayId),profile,result.program);
      setProgram(result.program);setRemovedExercises(result.records);setDirty(true);
      setExpandedExerciseId(null);setExercisePickerId(null);setExerciseQuery('');
      return;
    }
    if (
      removed.supersetId &&
      !confirm(
        `Remove ${exerciseName(removed)}? Its partner will stay in the day and the superset pairing will be removed.`,
      )
    )
      return;
    runRookViewTransition(() => {
      setExpandedExerciseId(null);
      setExercisePickerId(null);
      setExerciseQuery("");
      setDirty(true);
      setProgram((current) => {
        const next = clone(current);
        const day = next.days.find((item) => item.id === dayId);
        if (!day) return current;
        day.exercises = day.exercises.filter((item) => item.id !== exerciseId);
        if (day.warmupPlan?.mode === "custom")
          day.warmupPlan.rampUpSets = (day.warmupPlan.rampUpSets || []).filter(
            (group) => group.targetExerciseEntryId !== exerciseId,
          );
        day.exercises.forEach((item) => {
          if (item.supersetId === removed.supersetId) delete item.supersetId;
        });
        day.estimatedMinutes = estimateWorkoutMinutes(day, profile, next);
        return next;
      });
    });
  };
  const addExercise = (dayId, catalogId, createdRecord = null) => {
    const item = createdRecord ? customExerciseCatalogItem(createdRecord) : editorCatalog[catalogId];
    const targetDay = programRef.current?.days.find(day => day.id === dayId);
    if (!item || !planEditorExerciseAllowed(item, profile) || !targetDay || targetDay.exercises.length >= 8 || targetDay.exercises.some(exercise => exercise.exerciseId === item.id)) return false;
    const exerciseId = `manual-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const compound = item.kind === "compound" || item.kind === "power";
    const repMin =
      item.measure === "seconds"
        ? item.durationRange?.[0] || 20
        : compound
          ? 6
          : 10;
    const repMax =
      item.measure === "seconds"
        ? item.durationRange?.[1] || 40
        : compound
          ? 10
          : 15;
    runRookViewTransition(() => {
      setDirty(true);
      setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((value) => value.id === dayId);
      if (
        !day ||
        day.exercises.some((exercise) => exercise.exerciseId === item.id) ||
        day.exercises.length >= 8
      )
        return current;
      day.exercises.push({
        id: exerciseId,
        exerciseId: item.id,
        exerciseSource: item.custom ? "custom" : "catalog",
        ...(item.custom
          ? {
              importedName: item.name,
              originalImportedName: item.name,
              importedExercise: customExerciseSnapshot(
                createdRecord || (exerciseState?.customExercises || []).find((record) => record.id === item.id),
              ),
              matchStatus: "confirmed-custom",
              measure: item.measure,
              loadRequirement: item.loadRequirement,
            }
          : {}),
        programmingRole: compound ? "main" : "accessory",
        sets: Array.from({ length: 3 }, (_, index) => ({
          id: `${exerciseId}-set-${index}`,
          weight: null,
          reps: repMin,
          completed: false,
        })),
        repMin,
        repMax,
        targetRir: null,
        restSeconds: item.restSeconds,
        defaultIncrement: item.increment,
      });
      day.estimatedMinutes = estimateWorkoutMinutes(day, profile, next);
        return next;
      });
      setAddingToDayId(null);
      setExerciseQuery("");
    });
    return true;
  };
  const replaceExercise = (dayId, exerciseId, catalogId) => {
    if (!editorCatalog[catalogId] || !planEditorExerciseAllowed(editorCatalog[catalogId], profile)) return;
    const sourceExercise = programRef.current?.days.find((item) => item.id === dayId)?.exercises.find((item) => item.id === exerciseId);
    const sourceAlias = sourceExercise?.importedSourceName || sourceExercise?.originalImportedName || sourceExercise?.importedName || sourceExercise?.importedExercise?.name;
    if(importReview&&sourceExercise){
      const item=editorCatalog[catalogId],mapped={...sourceExercise,exerciseId:item.id,...(item.custom?{measure:item.measure,loadRequirement:item.loadRequirement}:{})};
      const measureChanged=exerciseMeasure(sourceExercise)!==exerciseMeasure(mapped);
      const loadChanged=exerciseLoadRequirement(sourceExercise)!==exerciseLoadRequirement(mapped);
      // A mapping is not consent to reinterpret a prior answer. Reuse the same
      // resolution store and only invalidate dimensions whose contract changed.
      // Same-unit variants, other exercises, effort and source corrections survive.
      for(const issue of sourceReview?.issues||[])if(issue.exerciseId===exerciseId&&resolvedImportIssues[issue.id]&&
        (issue.field==='prescription'&&measureChanged||issue.field==='load'&&loadChanged))resolveImportIssue(issue,null);
    }
    mutateExercise(dayId, exerciseId, (exercise) => {
      const item = editorCatalog[catalogId];
      if (!item) return;
      if (importReview)
        exercise.importedSourceName ??=
          exercise.originalImportedName || exercise.importedName || null;
      exercise.exerciseId = item.id;
      exercise.exerciseSource = item.custom ? "custom" : "catalog";
      exercise.defaultIncrement = item.increment;
      if(!exercise.hybridSource&&!hasUnspecifiedRepTarget(exercise)&&loggingUnit(exercise)!=='round')exercise.restSeconds = item.restSeconds;
      if(exercise.hybridSource)exercise.loadRequirement=exerciseLoadRequirement(item);
      exercise.importedName = item.name;
      exercise.originalImportedName = item.name;
      exercise.matchStatus = "confirmed-match";
      if(importReview)exercise.importMappingDecision='match';
      if (item.custom) {
        const record = (exerciseState?.customExercises || []).find((value) => value.id === item.id);
        exercise.importedExercise = customExerciseSnapshot(record);
        exercise.measure = item.measure;
        exercise.loadRequirement = item.loadRequirement;
      } else delete exercise.importedExercise;
      if (!importReview)
        exercise.sets.forEach((set) => {
          set.weight = null;
        });
    });
    if (importReview && rememberMatchIds.includes(exerciseId) && sourceAlias)
      onRememberExerciseAlias?.(sourceAlias, catalogId);
    setExercisePickerId(null);
    setExerciseQuery("");
    if (importReview) {
      const nextId=nextImportReview(programRef.current,exerciseId);
      setExpandedExerciseId(nextId);
      setImportAdvanceTarget(nextId);
      setPrescriptionEditorId(null);
      setWeightEditorId(null);
    }
  };
  const setImportedName = (dayId, exerciseId, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      exercise.importedName = value;
      exercise.originalImportedName = value;
      if (exercise.importedExercise) exercise.importedExercise.name = value;
    });
  const confirmImportedName = (exercise) => {
    const name = String(
      exercise.originalImportedName || exercise.importedName || "",
    ).trim();
    if (!name) return;
    const match = matchImportedExerciseName(name);
    const item = exerciseCatalog[match.exerciseId];
    if (item) {
      exercise.exerciseId = item.id;
      exercise.exerciseSource = "catalog";
      exercise.defaultIncrement = item.increment;
      if(!hasUnspecifiedRepTarget(exercise)&&loggingUnit(exercise)!=='round')exercise.restSeconds ??= item.restSeconds;
      exercise.matchStatus = "confirmed-match";
      delete exercise.importedExercise;
    } else {
      const customId = String(exercise.exerciseId || "").startsWith(
        "imported-custom-",
      )
        ? exercise.exerciseId
        : `imported-custom-${exercise.id}`;
      exercise.exerciseId = customId;
      exercise.exerciseSource = "imported-custom";
      exercise.importedExercise = {
        id: customId,
        name,
        source: "imported",
        pattern: null,
        muscles: null,
        equipment: null,
      };
      exercise.defaultIncrement ||= 1;
      exercise.matchStatus = "confirmed-custom";
    }
    exercise.importedName = name;
    exercise.originalImportedName = name;
  };
  const confirmCustom = (dayId, exerciseId) => {
    const sourceExercise = programRef.current?.days.find((item) => item.id === dayId)?.exercises.find((item) => item.id === exerciseId);
    if(sourceExercise?.hybridSource?.choice||sourceExercise?.hybridSource?.unresolved)return;
    if(importReview){mutateExercise(dayId,exerciseId,keepPlanImportOriginal);return;}
    const name = String((sourceExercise?.hybridSource?sourceExercise.originalImportedName:null)||sourceExercise?.importedSourceName || sourceExercise?.originalImportedName || sourceExercise?.importedName || "").trim();
    if (name && sourceExercise && !String(sourceExercise.exerciseId).startsWith("custom-exercise-")) {
      const record = createCustomExerciseRecord({ id: sourceExercise.exerciseId, name, equipment: ["machines"], primaryMuscle: "Full body", loggingType: "weight_reps" });
      onRegisterCustomExercise?.(record);
      mutateExercise(dayId, exerciseId, (exercise) => {
        exercise.exerciseId = record.id;
        exercise.exerciseSource = "custom";
        exercise.importedName = name;
        exercise.originalImportedName = name;
        exercise.importedExercise = customExerciseSnapshot(record, "imported");
        exercise.defaultIncrement ||= 1;
        if(!exercise.hybridSource&&!hasUnspecifiedRepTarget(exercise)&&loggingUnit(exercise)!=='round')exercise.restSeconds ||= 90;
        exercise.matchStatus = "confirmed-custom";
      });
    } else mutateExercise(dayId, exerciseId, confirmImportedName);
    const nextId = importReview && name ? nextImportReview(programRef.current, exerciseId) : null;
    setExpandedExerciseId(nextId);
    setImportAdvanceTarget(nextId);
    setExercisePickerId(null);
    setExerciseQuery("");
    setPrescriptionEditorId(null);
    setWeightEditorId(null);
  };
  const confirmAllCustom = () => {
    setDirty(true);
    setExpandedExerciseId(null);
    setProgram((current) => {
      const next = clone(current);
      next.days.forEach((day) =>
        day.exercises
          .filter((exercise) =>
            ["unresolved", "needs-name-review"].includes(
              exercise.matchStatus,
            ),
          )
          .forEach(confirmImportedName),
      );
      return next;
    });
  };
  const setCount = (dayId, exerciseId, count) => {
    // Commit before the following Save click, not in an async view-transition
    // callback. The input holds intermediate text without resizing the plan.
      setDirty(true);
      setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      const exercise = day?.exercises.find((item) => item.id === exerciseId);
      if (!day || !exercise) return current;
      const total = Math.max(
        1,
        Math.min(imported ? 20 : 6, Number(count) || 1),
      );
      const resize = (target) => {
        if (total < target.sets.length)
          target.sets = target.sets.slice(0, total);
        else
          while (target.sets.length < total)
            target.sets.push({
              id: `edited-set-${Date.now()}-${target.id}-${target.sets.length}`,
              weight: scratch ? (target.sets[0]?.weight ?? null) : null,
              reps: target.repMin,
              completed: false,
            });
      };
      resize(exercise);
      if (exercise.supersetId)
        day.exercises
          .filter(
            (candidate) =>
              candidate.id !== exercise.id &&
              candidate.supersetId === exercise.supersetId,
          )
          .forEach(resize);
      day.estimatedMinutes = estimateWorkoutMinutes(day, profile, next);
        return next;
      });
  };
  const setRep = (dayId, exerciseId, key, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      const numeric = Math.max(1, Math.min(100, Number(value) || 1));
      if(hasUnspecifiedRepTarget(exercise)){
        exercise.importPrescriptionCorrections={...exercise.importPrescriptionCorrections,origin:'user',source:exercise.importPrescriptionCorrections?.source||{repMin:null,repMax:null},values:{...exercise.importPrescriptionCorrections?.values,repMin:numeric,repMax:numeric}};
        exercise.repMin=numeric;exercise.repMax=numeric;delete exercise.repTarget;
      }
      exercise[key] = numeric;
      if (exercise.repMin > exercise.repMax)
        exercise[key === "repMin" ? "repMax" : "repMin"] = numeric;
      exercise.sets.forEach((set) => {
        if (!set.completed) set.reps = exercise.repMin;
      });
    });
  const setWeight = (dayId, exerciseId, setIndex, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      exercise.sets[setIndex].weight =
        value === "" ? null : Math.max(0, Number(value));
      exercise.sets[setIndex].weightProvenance =
        value === "" ? null : "explicit-plan";
    });
  const setStartingWeight = (dayId, exerciseId, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      const weight =
        value === ""
          ? null
          : Math.max(0, storedWeight(value, profile.units));
      exercise.sets.forEach((set) => {
        set.weight = weight;
        set.weightProvenance = weight === null ? null : "explicit-plan";
      });
    });
  const setProgramName = (value) => {
    setDirty(true);
    setProgram((current) => ({ ...current, name: value, nameEdited: true }));
  };
  const setWorkoutName = (dayId, value) => {
    setDirty(true);
    setProgram((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.id !== dayId) return day;
        const parts = workoutDisplayParts(day, day.weekday);
        const descriptor = day.workoutDescriptor ?? parts.detail;
        return {
          ...day,
          name: descriptor ? `${value} · ${descriptor}` : value,
          workoutName: value,
          workoutDescriptor: descriptor || undefined,
          nameEdited: true,
        };
      }),
    }));
  };
  const setWorkoutDescriptor = (dayId, value) => {
    setDirty(true);
    setProgram((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.id !== dayId) return day;
        const primary = workoutDisplayParts(day, day.weekday).primary;
        return {
          ...day,
          name: value.trim() ? `${primary} · ${value}` : primary,
          workoutName: primary,
          workoutDescriptor: value,
          nameEdited: true,
        };
      }),
    }));
  };
  const setWarmups = (value) => {
    setDirty(true);
    setProgram((current) => {
      const next = { ...current, includeRecommendedWarmups: value };
      next.days = current.days.map(day => day.durationPlanningVersion
        ? { ...day, estimatedMinutes: estimateWorkoutMinutes(day, profile, next) } : day);
      return next;
    });
  };
  const editWarmup = (dayId) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day) return current;
      if (!day.warmupPlan || day.warmupPlan.mode === "auto")
        day.warmupPlan = materializeWarmupPlan(day, profile, next);
      else if (day.warmupPlan.mode === "none")
        day.warmupPlan = {
          mode: "custom",
          provenance: "user",
          items: [],
          rampUpSets: [],
        };
      return next;
    });
    setExpandedWarmupDayId(dayId);
  };
  const mutateWarmup = (dayId, mutate) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day?.warmupPlan) return current;
      day.warmupPlan.provenance = "user";
      mutate(day.warmupPlan, day);
      if (
        day.warmupPlan.mode === "custom" &&
        !(day.warmupPlan.items || []).length &&
        !(day.warmupPlan.rampUpSets || []).length
      )
        day.warmupPlan = { mode: "none", items: [], rampUpSets: [] };
      if (day.durationPlanningVersion) day.estimatedMinutes = estimateWorkoutMinutes(day, profile, next);
      return next;
    });
  };
  const addWarmupItem = (dayId) => {
    if (program.days.find((day) => day.id === dayId)?.warmupPlan?.mode !== "custom")
      editWarmup(dayId);
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day) return current;
      if (day.warmupPlan?.mode !== "custom")
        day.warmupPlan = { mode: "custom", items: [], rampUpSets: [] };
      day.warmupPlan.provenance = "user";
      day.warmupPlan.items ||= [];
      day.warmupPlan.items.push({
        id: `warmup-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: "New warm-up movement",
        minutes: null,
        sets: 1,
        reps: 10,
        seconds: null,
        provenance: "user",
      });
      return next;
    });
    setExpandedWarmupDayId(dayId);
  };
  const restoreAutomaticWarmup = (dayId) => {
    setDirty(true);
    setProgram((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayId ? { ...day, warmupPlan: { mode: "auto" } } : day,
      ),
    }));
    setExpandedWarmupDayId(null);
  };
  const copyDayExercises = (sourceDayId, targetDayId) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const sourceDay = next.days.find((day) => day.id === sourceDayId);
      const targetDay = next.days.find((day) => day.id === targetDayId);
      if (!sourceDay?.exercises.length || !targetDay || targetDay.exercises.length)
        return current;
      const copiedExerciseIds = new Map();
      targetDay.exercises = remapCopiedSupersetIds(
        sourceDay.exercises.map((exercise, exerciseIndex) => {
          const exerciseId = `manual-exercise-${Date.now()}-${exerciseIndex}-${Math.random().toString(36).slice(2, 7)}`;
          copiedExerciseIds.set(exercise.id, exerciseId);
          return {
            ...clone(exercise),
            id: exerciseId,
            sets: exercise.sets.map((set, setIndex) => ({
              ...clone(set),
              id: `${exerciseId}-set-${setIndex}`,
              completed: false,
            })),
          };
        }),
        () =>
          `superset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
      if (sourceDay.warmupPlan) {
        targetDay.warmupPlan = clone(sourceDay.warmupPlan);
        targetDay.warmupPlan.items = (targetDay.warmupPlan.items || []).map(
          (item, index) => ({
            ...item,
            id: `warmup-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          }),
        );
        targetDay.warmupPlan.rampUpSets = (
          targetDay.warmupPlan.rampUpSets || []
        ).map((group, index) => ({
          ...group,
          id: `warmup-ramp-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          targetExerciseEntryId:
            copiedExerciseIds.get(group.targetExerciseEntryId) || null,
          sets: (group.sets || []).map((set, setIndex) => ({
            ...set,
            id: `warmup-ramp-set-${Date.now()}-${index}-${setIndex}`,
          })),
        })).filter((group) => group.targetExerciseEntryId);
      }
      targetDay.estimatedMinutes = estimateWorkoutMinutes(targetDay, profile, next);
      return next;
    });
    setCollapsedDayIds((current) =>
      current.filter((dayId) => dayId !== targetDayId),
    );
  };
  const toggleDayDetails = (dayId) =>
    setCollapsedDayIds((current) =>
      current.includes(dayId)
        ? current.filter((value) => value !== dayId)
        : [...current, dayId],
    );
  const exerciseSummary = (exercise) => {
    if(exercise.partialPrescription?.roundCount!=null||exercise.partialPrescription?.repFloor!=null||exercise.partialPrescription?.repCeiling!=null)return targetLabel(exercise);
    const timed = exerciseMeasure(exercise) === "seconds";
    const value = exercise.failureTarget
      ? openRepTargetLabel(exercise)
      : exercise.repMin === exercise.repMax
        ? exercise.repMin
        : `${exercise.repMin}\u2013${exercise.repMax}`;
    const reps = hasUnspecifiedRepTarget(exercise)?(timed?'Duration needs review':'Reps not specified'):`${value}${exercise.failureTarget ? "" : timed ? " sec" : " reps"}`;
    const weights = exercise.sets
      .map((set) => set.weight)
      .filter(
      (set) =>
        set !== null && set !== undefined && set !== "",
      );
    const weightSummary = weights.length
      ? ` \u00b7 ${weights.map((weight) => displayWeight(Number(weight), profile.units)).join(" / ")} ${weightUnit(profile.units)}`
      : "";
    return `${exercise.importRole?`${exercise.importRole} · `:''}${hasOpenRepTarget(exercise)&&loggingUnit(exercise)!=='round' ? `${exercise.sets.length} × ${value}` : `${pluralize(exercise.sets.length, loggingUnit(exercise))} \u00b7 ${reps}`}${imported ? weightSummary : ""}`;
  };
  const importedSourceLabel = (exercise) =>
    String(
      exercise.importedSourceName ||
        exercise.originalImportedName ||
        exercise.importedName ||
        exerciseName(exercise),
    ).trim();
  const likelyImportedMatches = (exercise, choices) => {
    const sourceName = importedSourceLabel(exercise);
    const direct = choices.filter((item) =>
      exerciseMatchesQuery(item, sourceName),
    );
    if (direct.length) return direct.slice(0, 3);
    return compatibleReplacementCandidates(
      exercise,
      profile,
      program.days.flatMap((day) =>
        day.exercises.map((item) => item.exerciseId),
      ),
    )
      .filter((item) => choices.some((choice) => choice.id === item.id))
      .slice(0, 3);
  };
  const copy =
    mode === "edit"
      ? {
          eyebrow: "PROGRAM",
          title: "Edit your plan",
          body: "Rename your plan or workouts, and adjust exercises and prescriptions. Your completed workout history stays saved.",
          action: "SAVE CHANGES",
        }
      : mode === "scratch"
        ? {
            eyebrow: "MANUAL PLAN",
            title: "Build your week.",
            body: "Add exercises to each day, then adjust your sets and targets.",
            action: "USE THIS PLAN",
          }
        : mode === "import"
          ? {
              eyebrow: "IMPORT PLAN",
              title: "Review your plan",
              body: "Inspect your workouts and make any final edits before using this plan.",
              action: "USE THIS PLAN",
            }
          : mode === "expert"
            ? {
                eyebrow: "EXPERT CORRECTION",
                title: "Show the better version",
                body: "Edit only what you would change. The original AI plan remains attached to this review.",
                action: "SAVE CORRECTION",
              }
            : {
                eyebrow: "PERSONALIZED PLAN",
                title: "Your week is ready.",
                body:
                  program.source === "personalized-replacement"
                    ? "Updated exercise variations while keeping your goals, schedule and training settings."
                    : "See how your answers shaped the plan, then review any workout before you start.",
                action: "USE THIS PLAN",
              };
  const namesValid =
    String(program.name || "").trim() &&
    program.days.every(
      (day) =>
        String(
          day.workoutName !== undefined
            ? day.workoutName
            : workoutDisplayParts(day, day.weekday).primary || "",
        ).trim() &&
        (!scratch || day.exercises.length >= 1),
    );
  const saveProgram = (event) => {
    if (reorderMode) { finishPreviewReorder(); return; }
    if(importApplySafetyIssues.length)return;
    if(importReview&&(Date.now()<matchHandoffUntil.current||event?.detail>1))return;
    // Keyboard/programmatic activation need not blur the field first.
    const beforeNumbers = programRef.current;
    flushSync(() => [...pendingNumberCommits.current].forEach(commit => commit()));
    const program = programRef.current;
    if(importReview&&program.days.some(day=>day.exercises.some(exercise=>hasUnspecifiedRepTarget(exercise)&&exerciseMeasure(exercise)==='seconds')))return;
    onSave({
      ...program,
      name: String(program.name).trim(),
      days: program.days.map((day) => ({
        ...day,
        name: String(day.name).trim(),
        workoutName: day.workoutName
          ? String(day.workoutName).trim()
          : undefined,
        workoutDescriptor: day.workoutDescriptor
          ? String(day.workoutDescriptor).trim()
          : undefined,
      })),
      userEdited: Boolean(program.userEdited || dirty || program !== beforeNumbers),
      version: Number(program.version || 1) + (mode === "edit" ? 1 : 0),
      updatedAt: new Date().toISOString(),
    });
  };
  const scratchEmptyDays = scratch ? program.days.filter(day => !day.exercises.length) : [];
  const scratchReadiness = !scratch ? ''
    : !String(program.name || '').trim() ? 'Enter a plan name to continue.'
    : program.days.some(day => !String(day.workoutName !== undefined ? day.workoutName : workoutDisplayParts(day, day.weekday).primary || '').trim()) ? 'Enter a name for each workout to continue.'
    : unresolved > 0 ? 'Review the unresolved exercises to continue.'
    : scratchEmptyDays.length === 1 ? `${scratchEmptyDays[0].weekday} still needs an exercise.`
    : scratchEmptyDays.length ? 'Add an exercise to each day to continue.' : '';
  const planNameField = <label className="plan-name-field">
    <span>{scratch ? 'Plan name' : 'WEEKLY PLAN NAME'}</span>
    <input aria-label="Weekly plan name" type="text" maxLength={60}
      value={program.name || ''} onChange={event => setProgramName(event.target.value)} />
  </label>;
  if(importReview&&optionalMatchesOpen)return <OptionalPlanMatches program={program} profile={profile} onMatch={replaceExercise} onOriginal={confirmCustom} onBack={()=>setOptionalMatchesOpen(false)}/>;
  if(importReview&&resolutionOpen)return <ImportResolution
    review={sourceReview} program={program} reviewProgram={importReviewSource.current} resolved={resolvedImportIssues} matchIds={resolutionMatches}
    revisions={importResolutionRevisions} excludedExercises={excludedImportExercises.current}
    revisit={resolutionRevisit}
    onResolve={resolveImportIssue} onMatch={replaceExercise} onCustom={confirmCustom}
    candidates={(dayId,exercise,query)=>{
      const day=program.days.find(item=>item.id===dayId);
      const available=allEditorItems.filter(createPlanEditorExerciseFilter(profile)).filter(item=>!day.exercises.some(other=>other.id!==exercise.id&&other.exerciseId===item.id));
      return query.trim()?rankExerciseSearch(available.filter(item=>exerciseMatchesQuery(item,query)),query):likelyImportedMatches(exercise,available);
    }}
    onDone={choice=>{if(choice?.fromMatch)matchHandoffUntil.current=Date.now()+350;setResolutionOpen(false);setExpandedExerciseId(null);requestAnimationFrame(()=>headingRef?.current?.scrollIntoView({block:'start'}));}}
    onBack={onCancel}
  />;
  return (
    <>
      {customCreation && createPortal(<ModalLayer close={() => setCustomCreation(null)} backgroundRef={customBackgroundRef} returnFocusRef={customTriggerRef}>
        <CustomExercisesScreen state={exerciseState} createOnly initialName={customCreation.name} createLabel={customCreation.addToDayId ? 'CREATE & ADD' : 'CREATE EXERCISE'}
          update={updater => {
            const next = updater(clone(exerciseState));
            const record = next.customExercises.find(item => !exerciseState.customExercises?.some(existing => existing.id === item.id));
            if (record) onRegisterCustomExercise(record);
          }}
          onCreated={record => {
            const dayId = customCreation.addToDayId;
            setCustomCreation(null);
            if (dayId && addExercise(dayId, record.id, record)) return;
            setExerciseQuery(record.name);
            if (dayId) setCustomAddNotice('Exercise created in your library, but it cannot be added to this workout. Your plan draft is unchanged. Check its training restrictions and exercise limit.');
          }}
        />
      </ModalLayer>, document.body)}
      {workoutActionsDayId && createPortal(<ModalLayer close={() => setWorkoutActionsDayId(null)} backgroundRef={workoutActionsBackgroundRef} returnFocusRef={workoutActionsTriggerRef}>
        <WorkoutActionsSheet day={program.days.find(day => day.id === workoutActionsDayId)} days={orderedProgramDays}
          collapsed={collapsedDayIds.includes(workoutActionsDayId)} onToggle={() => toggleDayDetails(workoutActionsDayId)} onCopy={copyDayExercises} />
      </ModalLayer>, document.body)}
      {!scratch && <Eyebrow>{copy.eyebrow}</Eyebrow>}
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {copy.title}
      </h1>
      <p>{copy.body}</p>
      {scratch && planNameField}
      {mode === "review" && (
        <PersonalizationSummary profile={profile} program={program} />
      )}
      <div className="plan-warmup-preference">
        <SettingSwitch
          label={scratch ? 'Recommended warm-ups' : 'Include recommended warm-ups'}
          checked={program.includeRecommendedWarmups !== false}
          disabled={reorderMode}
          onChange={setWarmups}
        />
        <small>
          {scratch ? 'Ramp-up sets are controlled separately.' : 'Short warm-ups matched to each workout. Ramp-up sets are controlled separately.'}
        </small>
      </div>
      {(mode === 'import'||program.importMetadata?.sourceNotes?.length>0) && <div ref={importReviewRef}><PlanImportIssues review={sourceReview} resolved={resolvedImportIssues} program={program} onResolve={resolveImportIssue} reviewRequest={importReviewRequest} summaryOnly={importReview} decisionGroups={importReview?importExerciseReviewGroups(sourceReview,importReviewSource.current,resolutionMatches):[]} onChange={id=>{setResolutionRevisit(id);setResolutionOpen(true);}} /></div>}
      {importReview&&<section className="plan-import-matching-summary" aria-label="Exercise library links"><p>{totalExercises-originalImportCount-unresolved} linked · {originalImportCount} original names{unresolved?` · ${unresolved} source choices to resolve`:''}</p>{originalImportCount>0&&<><p>Some exercises keep their original names. Linking them to the ROOK library is optional.</p><button className="button secondary" onClick={()=>setOptionalMatchesOpen(true)}>Review exercise matches · Optional</button></>}</section>}
      {importApplySafetyIssues.length>0&&<section className="plan-import-issues" role="alert"><span className="eyebrow">COMPATIBILITY TO RESOLVE</span>{importApplySafetyIssues.map(message=><p key={message}>{message}</p>)}<p>Edit the affected exercise below, or go back to clarify your setup. Source values have not been changed.</p></section>}
      {importReview && (trainingSafetyBlocks(importSafety.status) || importSafetyConflicts.length > 0) && <section className="plan-import-issues">
        <span className="eyebrow">TRAINING RESTRICTIONS</span>
        <p>{trainingSafetyBlocks(importSafety.status) ? 'Your restrictions need clarification before this plan can be started.' : `${[...new Set(importSafetyConflicts.map(item => item.exerciseName))].join(', ')} conflicts with your saved restrictions. Review before training.`}</p>
        <p>No exercises have been removed or replaced automatically.</p>
      </section>}
      {importUnavailable.length > 0 && <section className="plan-import-issues">
        <span className="eyebrow">EQUIPMENT TO REVIEW</span>
        <p>Not available at {importGym.name}: {[...new Set(importUnavailable.map(exerciseName))].join(', ')}.</p>
        <p>Keep your intended plan or choose replacements below. Nothing has been replaced automatically.</p>
      </section>}
      <section
        ref={reorderRootRef}
        className={`import-preview plan-editor${explicitPreview ? ' generated-reorder-preview' : ''}${reorderMode ? ' is-preview-reorder' : ''}${generatedAcceptance && profile.showExerciseImages !== false ? " has-review-illustrations" : ""}${importReview ? " is-import-review" : ""}${importReview && unresolved === 0 && namesValid ? " has-ready-sticky-action" : ""}${reorderView ? " is-reordering" : ""}${reorderView?.kind === 'workout' ? ' is-week-reordering' : ''}`}
      >
        {!scratch && <div className="import-plan-meta">
          {mode === "edit" || importReview ? (
            planNameField
          ) : (
            <h2>
              {imported
                ? displayImportedPlanName(program.name)
                : displayProgramName(program)}
            </h2>
          )}
          {explicitPreview ? <div className="plan-preview-mode-row">
            <small>{`${pluralize(program.days.length, "day")}/week`}</small>
            {reorderMode ? <span className="plan-preview-mode-status" role="status">Reordering</span> :
              <button ref={reorderEntryRef} type="button" className="text-button" disabled={saving}
                aria-pressed={false} onClick={() => setPreviewReordering(true)}>Reorder</button>}
          </div> : <small>{`${pluralize(program.days.length, "day")}/week`}</small>}
        </div>}
        {allowReorder && (
          <p className={scratch || explicitPreview ? 'visually-hidden' : 'plan-reorder-help'} id="plan-reorder-help">
            {explicitPreview ? "Drag a handle to reorder workouts or exercises. Use Alt and arrow keys, or Tab to the move actions." : directEditor ? "Drag a handle to reorder workouts or exercises." : "Press and hold a workout or exercise to reorder."}
          </p>
        )}
        {importReview && (
          <button
            type="button"
            className={`import-review-summary${unresolved ? " has-issues" : " is-ready"}`}
            onClick={() => {
              const nextId = firstUnresolvedExercise(program);
              if (!nextId) return;
              setExpandedExerciseId(nextId);
              setExercisePickerId(null);
              requestAnimationFrame(() =>
                document
                  .getElementById(`import-exercise-${nextId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
              );
            }}
          >
            <span>
              <strong>
                {unresolved
                  ? `${pluralize(unresolved, "exercise")} to match`
                  : "All exercises ready"}
              </strong>
              <small>
                {unresolved
                  ? "Choose an exercise or keep the imported name as custom."
                  : `${readyExercises} of ${totalExercises} executable · library linking is optional`}
              </small>
            </span>
            {unresolved ? <b>REVIEW NEXT</b> : <i aria-hidden="true">✓</i>}
          </button>
        )}
        {program.conditioning && (
          <ConditioningCard conditioning={program.conditioning} />
        )}
        {orderedProgramDays.map((day, dayIndex) => {
          const exerciseCount = day.exercises.length;
          const dayTitleParts = workoutDisplayParts(day, day.weekday);
          const dayNameValid = Boolean(
            String(
              day.workoutName !== undefined
                ? day.workoutName
                : dayTitleParts.primary || "",
            ).trim(),
          );
          const editableDescriptor = Boolean(
            imported || day.workoutDescriptor || day.originalImportedWorkoutName,
          );
          const ready = exerciseCount >= 1 && dayNameValid;
          const collapsed = directEditor && collapsedDayIds.includes(day.id);
          const addCandidates = addingToDayId === day.id ? rankExerciseSearch(catalog.filter(item =>
            !day.exercises.some(exercise => exercise.exerciseId === item.id) && exerciseMatchesQuery(item, exerciseQuery)), exerciseQuery) : [];
          const exerciseBlocks = buildExerciseReorderBlocks(day.exercises);
          const warmupMode = day.warmupPlan?.mode || "auto";
          const warmupIncluded =
            program.includeRecommendedWarmups !== false &&
            warmupMode !== "none";
          const warmupPrescription = warmupIncluded
            ? warmupForWorkout(day, profile, program)
            : null;
          const warmupMovementCount = warmupPrescription
            ? (warmupPrescription.general?.length || 0) +
              (warmupPrescription.movementPreparation?.length || 0)
            : 0;
          const warmupRampGroupCount =
            warmupPrescription?.rampUpSets?.length || 0;
          const warmupCard = !collapsed && !compactWarmupPreview && (() => {
                const warmupExpanded = expandedWarmupDayId === day.id;
                const warmupItems = day.warmupPlan?.items || [];
                const rampGroups = day.warmupPlan?.rampUpSets || [];
                const editable = mode === "edit" || mode === "import" || scratch;
                const warmupCustomized =
                  warmupMode === "custom" &&
                  day.warmupPlan?.provenance !== "generated-materialized";
                const warmupSummaryParts = [];
                if (warmupMovementCount > 0) {
                  warmupSummaryParts.push(
                    pluralize(warmupMovementCount, "movement"),
                  );
                }
                if (warmupRampGroupCount > 0) {
                  warmupSummaryParts.push(
                    pluralize(warmupRampGroupCount, "ramp-up group"),
                  );
                }
                const warmupSummary = warmupIncluded
                  ? warmupSummaryParts.join(" · ") || "Warm-up included"
                  : "Not included";
                return (
                  <div className={`plan-warmup-card mode-${warmupMode}${scratch ? ' scratch-warmup-row' : ''}`}>
                    {mode === 'edit' && <p className="eyebrow plan-warmup-eyebrow">WARM-UP</p>}
                    <div className="plan-warmup-card-header">
                      {scratch ? <strong>Warm-up · {!warmupIncluded ? 'Off' : warmupMode === 'auto' ? 'Automatic' : warmupCustomized ? 'Custom' : 'Recommended'}</strong> : <span>
                        {mode !== 'edit' && <small>WARM-UP</small>}
                        <strong>
                          {warmupMode === "auto"
                            ? "Recommended warm-up"
                            : warmupMode === "none"
                              ? "No warm-up"
                              : warmupCustomized
                                ? "Custom warm-up"
                                : "Recommended warm-up"}
                        </strong>
                        <em>{warmupSummary}</em>
                      </span>}
                      {editable && (
                        <button
                          type="button"
                          className="text-button"
                          aria-label={scratch ? `${warmupMode === 'custom' && warmupExpanded ? 'Finish editing' : 'Edit'} warm-up for ${day.weekday}` : undefined}
                          onClick={() =>
                            warmupMode === "custom" && warmupExpanded
                              ? setExpandedWarmupDayId(null)
                              : editWarmup(day.id)
                          }
                        >
                          {scratch ? (warmupMode === 'custom' && warmupExpanded ? 'Done' : 'Edit') : warmupMode === "custom" && warmupExpanded ? "DONE" : "EDIT"}
                        </button>
                      )}
                    </div>
                    {warmupMode === "custom" && warmupExpanded && (
                      <div className="plan-warmup-editor">
                        {warmupItems.length > 0 && (
                          <section className="plan-warmup-editor-group">
                            <header>
                              <small>GENERAL PREPARATION</small>
                              <span>{pluralize(warmupItems.length, "movement")}</span>
                            </header>
                            <div className="plan-warmup-editor-list">
                              {warmupItems.map((item, itemIndex) => (
                                <div className="plan-warmup-item" key={item.id}>
                                  {item.prescriptionText && <small>{item.prescriptionText}</small>}
                                  <input
                                    aria-label={`Warm-up movement ${itemIndex + 1}`}
                                    value={item.label || ""}
                                    maxLength={80}
                                    onChange={(event) =>
                                      mutateWarmup(day.id, (plan) => {
                                        plan.items[itemIndex].label = event.target.value;
                                      })
                                    }
                                  />
                                  <div>
                                    <label>
                                      <span>SETS</span>
                                      <PlanNumberInput commits={pendingNumberCommits.current} min="1" max="10" value={item.sets || 1} onCommit={(value) => mutateWarmup(day.id, (plan) => { plan.items[itemIndex].sets = value; })} />
                                    </label>
                                    <label>
                                      <span>REPS</span>
                                      <input type="number" min="1" max="100" value={item.reps || ""} placeholder="—" onChange={(event) => mutateWarmup(day.id, (plan) => { plan.items[itemIndex].reps = event.target.value ? Math.max(1, Number(event.target.value)) : null; plan.items[itemIndex].prescriptionText = null; plan.items[itemIndex].minutes = null; if (event.target.value) plan.items[itemIndex].seconds = null; })} />
                                    </label>
                                    <label>
                                      <span>SEC</span>
                                      <input type="number" min="1" max="1800" value={item.seconds || (!item.reps && Number(item.minutes) > 1 ? Math.round(Number(item.minutes) * 60) : "")} placeholder="—" onChange={(event) => mutateWarmup(day.id, (plan) => { const seconds = event.target.value ? Math.max(1, Number(event.target.value)) : null; plan.items[itemIndex].seconds = seconds; plan.items[itemIndex].prescriptionText = null; plan.items[itemIndex].minutes = seconds ? seconds / 60 : null; if (seconds) plan.items[itemIndex].reps = null; })} />
                                    </label>
                                    <button type="button" aria-label={`Remove ${item.label || "warm-up movement"}`} onClick={() => mutateWarmup(day.id, (plan) => { plan.items.splice(itemIndex, 1); })}>×</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                        {rampGroups.length > 0 && (
                          <section className="plan-warmup-editor-group">
                            <header>
                              <small>RAMP-UP</small>
                              <span>{pluralize(rampGroups.length, "exercise")}</span>
                            </header>
                            <div className="plan-warmup-editor-list">
                              {rampGroups.map((group, groupIndex) => {
                                const target = day.exercises.find(
                                  (exercise) => exercise.id === group.targetExerciseEntryId,
                                );
                                return (
                                  <div className="plan-warmup-ramp" key={group.id}>
                                    <span>
                                      <strong>{target ? exerciseName(target) : "Exercise needs review"}</strong>
                                      <small>
                                        RAMP-UP SETS · {group.sets.map((set) => `${set.reps} × ${set.loadKind === "percent_working" ? `${set.loadValue}%` : set.loadKind === "absolute" ? `${set.loadValue} ${weightUnit(profile.units)}` : set.loadInstruction || "light"}`).join(" · ")}
                                      </small>
                                    </span>
                                    <button type="button" aria-label="Remove ramp-up sets" onClick={() => mutateWarmup(day.id, (plan) => { plan.rampUpSets.splice(groupIndex, 1); })}>×</button>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        )}
                        <div className="plan-warmup-editor-actions">
                          <button type="button" className="text-button plan-add-warmup" onClick={() => addWarmupItem(day.id)}>+ ADD MOVEMENT</button>
                          <button type="button" className="text-button plan-restore-warmup" onClick={() => restoreAutomaticWarmup(day.id)}>RESTORE RECOMMENDED</button>
                        </div>
                      </div>
                    )}
                    {warmupMode === "none" && editable && !scratch && (
                      <button type="button" className="text-button plan-restore-warmup" onClick={() => restoreAutomaticWarmup(day.id)}>RESTORE RECOMMENDED WARM-UP</button>
                    )}
                  </div>
                );
              })();
          return (
          <div
            className={`import-day${scratch ? " scratch-workout-day" : ""}${allowReorder ? " plan-edit-day-section" : ""}${ready ? " is-ready" : " is-incomplete"}${collapsed ? " is-collapsed" : ""}${reorderView?.kind === "workout" && reorderView.dayId === day.id ? " reorder-placeholder" : ""}`}
            key={day.id}
            style={{
              viewTransitionName: rookViewTransitionName("workout", day.id),
            }}
            data-day-id={day.id}
            data-reorder-workout-section={allowReorder ? "true" : undefined}
            data-reorder-index={allowReorder ? dayIndex : undefined}
          >
            {allowReorder && (
              <div className="plan-workout-reorder-bar">
                <button
                  type="button"
                  className="plan-workout-drag-surface"
                  role="button"
                  tabIndex="0"
                  aria-describedby="plan-reorder-help"
                  aria-label={explicitPreview ? `Move ${dayTitleParts.primary}, ${day.weekday} workout` : `Hold and drag ${dayTitleParts.primary} to another training day`}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  data-reorder-kind="workout"
                  data-day-id={day.id}
                  onKeyDown={(event) => {
                    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key))
                      return;
                    event.preventDefault();
                    moveWorkoutWithControls(
                      day.id,
                      event.key === "ArrowUp" ? -1 : 1,
                    );
                  }}
                >
                  <i aria-hidden="true" />
                </button>
                <span className="plan-workout-day-label">{day.weekday ? day.weekday.toUpperCase() : 'DAY NEEDED'}</span>
                <span className="plan-workout-compact-summary">{dayTitleParts.primary} · {pluralize(exerciseCount, "exercise")}{Number(day.estimatedMinutes) > 0 ? ` · ~${roundedEstimate(day.estimatedMinutes)} min` : ''}</span>
                {scratch && <button type="button" className="plan-workout-overflow" data-no-reorder aria-label={`Workout options for ${day.weekday} ${dayTitleParts.primary}`}
                  aria-haspopup="dialog" onClick={event => {
                    workoutActionsTriggerRef.current = event.currentTarget;
                    workoutActionsBackgroundRef.current = reorderRootRef.current?.closest('.screen');
                    setWorkoutActionsDayId(day.id);
                  }}>•••</button>}
                <div className="plan-reorder-a11y" data-no-reorder>
                  <button
                    type="button"
                    disabled={dayIndex === 0}
                    onClick={() => moveWorkoutWithControls(day.id, -1)}
                  >MOVE EARLIER</button>
                  <button
                    type="button"
                    disabled={dayIndex === orderedProgramDays.length - 1}
                    onClick={() => moveWorkoutWithControls(day.id, 1)}
                  >MOVE LATER</button>
                  <button
                    type="button"
                    disabled={dayIndex === 0}
                    onClick={() => moveWorkoutWithControls(day.id, "first")}
                  >MOVE FIRST</button>
                  <button
                    type="button"
                    disabled={dayIndex === orderedProgramDays.length - 1}
                    onClick={() => moveWorkoutWithControls(day.id, "last")}
                  >MOVE LAST</button>
                </div>
              </div>
            )}
            {mode === "edit" || scratch || importReview ? (
              <div className="workout-name-fields">
                {importReview && <label className="workout-name-field">
                  <span>WORKOUT DAY</span>
                  <select aria-label={`Calendar day for ${day.name}`} value={day.weekday || ''}
                    onChange={event => { const value = event.target.value; setProgram(current => ({ ...current, days: current.days.map(item => item.id === day.id ? { ...item, weekday: value } : item) })); setDirty(true); }}>
                    <option value="">Choose day</option>
                    {WEEKDAYS.map(value => <option key={value} value={value} disabled={program.days.some(other => other.id !== day.id && other.weekday === value)}>{value}</option>)}
                  </select>
                </label>}
                <label className="workout-name-field">
                  {!scratch && <span>{allowReorder ? "WORKOUT NAME" : `${day.weekday.toUpperCase()} WORKOUT NAME`}</span>}
                  <input
                    aria-label={`${day.weekday} workout name`}
                    type="text"
                    maxLength={60}
                    value={editableDescriptor ? dayTitleParts.primary : day.name || ""}
                    placeholder="e.g. Upper, Lower or Push"
                    onChange={(event) =>
                      setWorkoutName(day.id, event.target.value)
                    }
                  />
                </label>
                {editableDescriptor && (
                  <label className="workout-name-field workout-descriptor-field">
                    <span>FOCUS / STYLE · OPTIONAL</span>
                    <input
                      aria-label={`${day.weekday} workout descriptor`}
                      type="text"
                      maxLength={48}
                      value={day.workoutDescriptor ?? dayTitleParts.detail}
                      placeholder="e.g. Chest focus, Strength or Hypertrophy"
                      onChange={(event) =>
                        setWorkoutDescriptor(day.id, event.target.value)
                      }
                    />
                  </label>
                )}
              </div>
            ) : (
              <strong className="plan-editor-workout-title">
                <span>{day.weekday} · {dayTitleParts.primary}</span>
                {dayTitleParts.detail && <small>{dayTitleParts.detail}</small>}
              </strong>
            )}
            {compactWarmupPreview && warmupIncluded && (
              <small className="plan-warmup-status">Warm-up included</small>
            )}
            {scratch && exerciseCount > 0 && (
              <div className="scratch-day-status">
                <small
                  className={
                    ready
                      ? "ready"
                      : !dayNameValid
                        ? "validation-error"
                        : ""
                  }
                >
                  {pluralize(exerciseCount, "exercise")}
                </small>
              </div>
            )}
            {!collapsed && <div className="plan-editor-cards">
              {!scratch && warmupCard}
              {removalRows(day, removedExercises).map(({exercise, removed}) => {
                if(removed)return <div className="plan-removed-exercise" key={exercise.id}><span>{exerciseName(exercise)} removed</span><button type="button" className="text-button" onClick={()=>{
                  const result=undoPlanRemoval(programRef.current,removedExercises,exercise.id);
                  const restoredDay=result.program.days.find(d=>d.id===day.id);restoredDay.estimatedMinutes=estimateWorkoutMinutes(restoredDay,profile,result.program);
                  setProgram(result.program);setRemovedExercises(result.records);setExpandedExerciseId(exercise.id);setDirty(true);
                }}>UNDO</button></div>;
                const exerciseIndex=day.exercises.findIndex(item=>item.id===exercise.id);
                const expanded = expandedExerciseId === exercise.id;
                const safetyConflict = reviewConflicts.find(item => item.exerciseEntryId === exercise.id);
                const safetyReviewRequired = Boolean(safetyConflict);
                const needsReview = ["unresolved", "needs-name-review"].includes(
                  exercise.matchStatus,
                );
                const needsSpecificName =
                  exercise.matchStatus === "needs-name-review" ||
                  importedExerciseNameNeedsReview(
                    exercise.originalImportedName || exercise.importedName,
                  );
                const pickerOpen = exercisePickerId === exercise.id;
                const timed = exerciseMeasure(exercise) === "seconds";
                const loadRequirement = exerciseLoadRequirement(exercise);
                const acceptsStartingWeight =
                  scratch && loadRequirement !== "none";
                const startingWeight = exercise.sets.length
                  ? exercise.sets[0].weight
                  : null;
                const importedWeights = exercise.sets
                  .map((set, index) => ({ index, value: set.weight }))
                  .filter(
                    ({ value }) =>
                      value !== null && value !== undefined && value !== "",
                  );
                const externalLoadRelevant =
                  importedWeights.length > 0 ||
                  (!timed && loadRequirement !== "none");
                const pair = exercise.supersetId
                  ? supersetMeta(day.exercises, exerciseIndex)
                  : null;
                const reorderBlockIndex = exerciseBlocks.findIndex((block) =>
                  block.exercises.some((item) => item.id === exercise.id),
                );
                const reorderBlock = exerciseBlocks[reorderBlockIndex];
                const pairRole = pair?.role || null;
                const eligiblePartners = day.exercises.filter(
                  (candidate) =>
                    candidate.id !== exercise.id &&
                    !candidate.supersetId &&
                    candidate.sets.length === exercise.sets.length,
                );
                const availableExercises = pickerOpen ? rankExerciseSearch(catalog.filter(
                  (item) =>
                    !day.exercises.some(
                      (other) =>
                        other.id !== exercise.id &&
                        other.exerciseId === item.id,
                    ) &&
                    exerciseMatchesQuery(item, exerciseQuery),
                ), exerciseQuery) : [];
                const likelyMatches = pickerOpen && needsReview
                  ? likelyImportedMatches(exercise, availableExercises)
                  : [];
                const likelyMatchIds = new Set(
                  likelyMatches.map((item) => item.id),
                );
                const otherAvailableExercises = exerciseQuery.trim()
                  ? availableExercises
                  : availableExercises.filter(
                      (item) => !likelyMatchIds.has(item.id),
                    );
                const similarExercises = pickerOpen && preview ? rankExerciseSearch(compatibleReplacementCandidates(
                  exercise,
                  profile,
                  day.exercises.map((item) => item.exerciseId),
                ).filter(
                  (item) =>
                    !day.exercises.some(
                      (other) =>
                        other.id !== exercise.id &&
                        other.exerciseId === item.id,
                    ) && exerciseMatchesQuery(item, exerciseQuery),
                ), exerciseQuery) : [];
                const pickerExercises = preview
                  ? similarExercises
                  : availableExercises;
                const pendingMatch = exercise.matchStatus === 'confirmed-match' ? editorCatalog[exercise.exerciseId] : null;
                return (
                  <article
                    id={`import-exercise-${exercise.id}`}
                    tabIndex={safetyReviewRequired ? -1 : undefined}
                    className={`import-exercise plan-editor-exercise${expanded ? " is-expanded" : ""}${needsReview ? " needs-review" : ""}${safetyReviewRequired ? " safety-review-required" : ""}${pairRole ? ` is-superset superset-${pairRole.toLowerCase()}` : ""}${reorderView?.kind === "exercise" && reorderView.dayId === day.id && reorderView.sourceIndex === reorderBlockIndex ? " reorder-placeholder" : ""}`}
                    key={exercise.id}
                    style={{
                      viewTransitionName: rookViewTransitionName(
                        "exercise",
                        day.id,
                        exercise.id,
                      ),
                    }}
                    data-reorder-block-index={allowReorder ? reorderBlockIndex : undefined}
                    data-review={needsReview ? "required" : undefined}
                  >
                    <div className={(directEditor || reorderMode) && allowReorder && !reorderBlock?.locked ? "plan-editor-card-header" : "plan-editor-card-header is-static"}>
                    {(directEditor || reorderMode) && allowReorder && !reorderBlock?.locked && (
                      <button
                        type="button"
                        className="plan-exercise-drag-handle"
                        aria-label={explicitPreview ? `Move ${exerciseName(exercise)} in ${day.weekday} ${dayTitleParts.primary}${pair ? ' superset' : ''}` : `Move ${exerciseName(exercise)}`}
                        aria-describedby="plan-reorder-help"
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        data-reorder-kind="exercise"
                        data-day-id={day.id}
                        data-exercise-id={exercise.id}
                        onKeyDown={(event) => {
                          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                          event.preventDefault();
                          moveExerciseWithControls(day.id, exercise.id, event.key === "ArrowUp" ? -1 : 1);
                        }}
                      ><i aria-hidden="true" /></button>
                    )}
                    <SummaryElement
                      type={reorderMode ? undefined : 'button'}
                      className="plan-editor-summary"
                      aria-expanded={reorderMode ? undefined : expanded}
                      aria-label={reorderMode ? undefined : `${expanded ? "Collapse" : needsReview ? "Review" : "Edit"} ${exerciseName(exercise)}`}
                      aria-describedby={[
                        allowReorder ? "plan-reorder-help" : null,
                        needsReview ? `import-review-status-${exercise.id}` : null,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                      aria-keyshortcuts={allowReorder ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                      data-reorder-kind={!directEditor && !explicitPreview && allowReorder && !reorderBlock?.locked ? "exercise" : undefined}
                      data-day-id={allowReorder ? day.id : undefined}
                      data-exercise-id={allowReorder ? exercise.id : undefined}
                      onKeyDown={(event) => {
                        if (!allowReorder || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key))
                          return;
                        event.preventDefault();
                        moveExerciseWithControls(
                          day.id,
                          exercise.id,
                          event.key === "ArrowUp" ? -1 : 1,
                        );
                      }}
                      onClick={() => {
                        if (reorderMode) return;
                        setExpandedExerciseId(expanded ? null : exercise.id);
                        setExercisePickerId(null);
                        setExerciseQuery("");
                      }}
                    >
                      {generatedAcceptance && !reorderMode && <PlanReviewIllustration exercise={exercise} catalog={exerciseCatalog} resolveArt={exerciseArt} enabled={profile.showExerciseImages !== false} name={exerciseName(exercise)} />}
                      <span className="plan-editor-heading">
                        <strong>
                          {pairRole && (
                            <i className="superset-role">PAIR</i>
                          )}
                          {exerciseName(exercise)}
                        </strong>
                        <small>{exerciseSummary(exercise)}</small>
                        {pair && (
                          <small className="superset-round-rest">
                            Paired with {exerciseName(pair.partner.exercise)}
                            {pairRole === "A2"
                              ? ` · rest ${pair.restSeconds} sec after both`
                              : ""}
                          </small>
                        )}
                      </span>
                      {!reorderMode && <span className="plan-editor-summary-action">
                        <b>
                          {expanded
                            ? "CLOSE"
                            : safetyReviewRequired
                              ? "REVIEW REQUIRED"
                            : needsReview
                              ? "NEEDS REVIEW"
                              : "EDIT"}
                        </b>
                        <i aria-hidden="true" />
                      </span>}
                    </SummaryElement>
                    </div>
                    {needsReview && (
                      <span
                        id={`import-review-status-${exercise.id}`}
                        className="visually-hidden"
                      >
                        Needs review
                      </span>
                    )}
                    {allowReorder && !reorderBlock?.locked && (
                      <div className="plan-reorder-a11y exercise-reorder-a11y" data-no-reorder>
                        <button
                          type="button"
                          disabled={reorderBlockIndex === 0}
                          onClick={() => moveExerciseWithControls(day.id, exercise.id, -1)}
                        >MOVE EARLIER</button>
                        <button
                          type="button"
                          disabled={reorderBlockIndex === exerciseBlocks.length - 1}
                          onClick={() => moveExerciseWithControls(day.id, exercise.id, 1)}
                        >MOVE LATER</button>
                        <button
                          type="button"
                          disabled={reorderBlockIndex === 0}
                          onClick={() => moveExerciseWithControls(day.id, exercise.id, "first")}
                        >MOVE FIRST</button>
                        <button
                          type="button"
                          disabled={reorderBlockIndex === exerciseBlocks.length - 1}
                          onClick={() => moveExerciseWithControls(day.id, exercise.id, "last")}
                        >MOVE LAST</button>
                      </div>
                    )}
                    <Disclosure open={expanded}>
                      {expanded && <div
                        className="plan-editor-fields"
                        style={{
                          viewTransitionName: rookViewTransitionName(
                            "editor-fields",
                            day.id,
                            exercise.id,
                          ),
                        }}
                      >
                        {generatedAcceptance && <PlanReviewIllustration exercise={exercise} catalog={exerciseCatalog} resolveArt={exerciseArt} enabled={profile.showExerciseImages !== false} expanded name={exerciseName(exercise)} />}
                        {safetyReviewRequired ? <PlanConflictResolution
                          key={`${exercise.id}-${safetyConflict.reason}`}
                          exercise={exercise} day={day} profile={profile} conflict={safetyConflict}
                          allExercises={allEditorItems}
                          onCreateCustom={onRegisterCustomExercise ? beginCustomCreation : undefined}
                          minimumRir={trainingSafetyFor(profile).constraints?.minRirByExerciseId?.[exercise.exerciseId]}
                          onReplace={catalogId => replaceExercise(day.id, exercise.id, catalogId)}
                          onRemove={() => removeExercise(day.id, exercise.id)}
                          onEffort={value => {
                            const minimum = trainingSafetyFor(profile).constraints?.minRirByExerciseId?.[exercise.exerciseId];
                            if (Number.isInteger(value) && value >= minimum && value <= 4) mutateExercise(day.id, exercise.id, item => { item.targetRir = value; });
                          }}
                        /> : <>
                        {needsReview && importReview ? (
                          <div className="import-review-resolution">
                            <span className="import-review-status">
                              NEEDS REVIEW
                            </span>
                            <p>
                              “{importedSourceLabel(exercise)}” doesn’t match a
                              specific exercise. Choose the movement you meant,
                              or keep it as a custom exercise.
                            </p>
                            <button
                              type="button"
                              className="plan-editor-picker-trigger import-review-primary"
                              aria-expanded={pickerOpen}
                              aria-controls={`exercise-picker-${exercise.id}`}
                              onClick={() => {
                                setExercisePickerId(
                                  pickerOpen ? null : exercise.id,
                                );
                                setExerciseQuery("");
                              }}
                            >
                              <strong>CHOOSE EXERCISE</strong>
                              <i aria-hidden="true" />
                            </button>
                            <Disclosure open={pickerOpen} revealOnOpen>
                              <div
                                className="plan-editor-picker import-review-picker"
                                id={`exercise-picker-${exercise.id}`}
                              >
                                <SearchInput onClear={() => setExerciseQuery("")}
                                  type="search"
                                  aria-label={`Search replacement for ${exerciseName(exercise)}`}
                                  placeholder="Search exercises"
                                  value={exerciseQuery}
                                  onChange={(event) =>
                                    setExerciseQuery(event.target.value)
                                  }
                                />
                                <div role="listbox" aria-label="Available exercises">
                                  {!exerciseQuery.trim() && likelyMatches.length > 0 && (
                                    <small className="import-review-picker-label">
                                      Possible matches
                                    </small>
                                  )}
                                  {!exerciseQuery.trim() &&
                                    likelyMatches.map((item) => (
                                      <button
                                        type="button"
                                        role="option"
                                        aria-selected={pendingMatch?.id === item.id}
                                        className={pendingMatch?.id === item.id ? "is-selected" : ""}
                                        key={item.id}
                                        onClick={() => replaceExercise(day.id, exercise.id, item.id)}
                                      >
                                        {item.name}
                                        {pendingMatch?.id === item.id && <i aria-hidden="true">✓</i>}
                                      </button>
                                    ))}
                                  {!exerciseQuery.trim() && (
                                    <small className="import-review-picker-label">
                                      Other exercises
                                    </small>
                                  )}
                                  {otherAvailableExercises.map((item) => (
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={pendingMatch?.id === item.id}
                                      className={pendingMatch?.id === item.id ? "is-selected" : ""}
                                      key={item.id}
                                      onClick={() => replaceExercise(day.id, exercise.id, item.id)}
                                    >
                                      {item.name}
                                      {pendingMatch?.id === item.id && <i aria-hidden="true">✓</i>}
                                    </button>
                                  ))}
                                </div>
                                {(
                                  <div className="import-match-confirmation">                                    <label className="remember-import-match">
                                      <input
                                        type="checkbox"
                                        checked={rememberMatchIds.includes(exercise.id)}
                                        onChange={(event) =>
                                          setRememberMatchIds((current) =>
                                            event.target.checked
                                              ? [...new Set([...current, exercise.id])]
                                              : current.filter((id) => id !== exercise.id),
                                          )
                                        }
                                      />
                                      <span>
                                        <strong>Remember this match</strong>
                                        <small>Use it automatically for future imports.</small>
                                      </span>
                                    </label>                                  </div>
                                )}
                              </div>
                            </Disclosure>
                            <button
                              type="button"
                              className="import-review-custom-trigger"
                              disabled={!importedSourceLabel(exercise)}
                              onClick={() =>
                                confirmCustom(day.id, exercise.id)
                              }
                            >
                              <strong>KEEP AS CUSTOM</strong>
                              <small>
                                Use “{importedSourceLabel(exercise)}” exactly as written
                              </small>
                            </button>
                          </div>
                        ) : needsReview ? (
                          <label className="plan-editor-select plan-editor-custom-name">
                            <span>Exercise name</span>
                            <input
                              aria-label={`Exercise name for ${exerciseName(exercise)}`}
                              type="text"
                              value={
                                exercise.originalImportedName ||
                                exercise.importedName ||
                                ""
                              }
                              onChange={(event) =>
                                setImportedName(
                                  day.id,
                                  exercise.id,
                                  event.target.value,
                                )
                              }
                            />
                            <small>
                              Type the correct name or keep it as a custom exercise.
                            </small>
                          </label>
                        ) : (
                          <div className="plan-editor-select">
                            <span>{preview ? "Change exercise" : "Exercise"}</span>
                            <button
                              type="button"
                              className="plan-editor-picker-trigger"
                              aria-expanded={pickerOpen}
                              aria-controls={`exercise-picker-${exercise.id}`}
                              onClick={() => {
                                setExercisePickerId(
                                  pickerOpen ? null : exercise.id,
                                );
                                setExerciseQuery("");
                              }}
                            >
                              <strong>{exerciseName(exercise)}</strong>
                              <i aria-hidden="true" />
                            </button>
                            <Disclosure open={pickerOpen} revealOnOpen>
                              <div
                                className="plan-editor-picker"
                                id={`exercise-picker-${exercise.id}`}
                              >
                                <SearchInput onClear={() => setExerciseQuery("")}
                                  type="search"
                                  aria-label={`Search replacement for ${exerciseName(exercise)}`}
                                  placeholder="Search exercises"
                                  value={exerciseQuery}
                                  onChange={(event) =>
                                    setExerciseQuery(event.target.value)
                                  }
                                />
                                {onRegisterCustomExercise && <CustomExerciseFallback onCreate={() => beginCustomCreation(exerciseQuery)} />}
                                <div
                                  role="listbox"
                                  aria-label="Available exercises"
                                >
                                  {pickerExercises.length ? (
                                    pickerExercises.map((item) => (
                                      <button
                                        type="button"
                                        role="option"
                                        aria-selected={
                                          item.id === exercise.exerciseId
                                        }
                                        key={item.id}
                                        onClick={() =>
                                          replaceExercise(
                                            day.id,
                                            exercise.id,
                                            item.id,
                                          )
                                        }
                                      >
                                        {item.name}
                                        {item.id === exercise.exerciseId && (
                                          <i aria-hidden="true">✓</i>
                                        )}
                                      </button>
                                    ))
                                  ) : (
                                    <small>
                                      {preview
                                        ? "No similar exercises match your search."
                                        : "No exercises match your search."}
                                    </small>
                                  )}
                                </div>
                              </div>
                            </Disclosure>
                          </div>
                        )}
                        {importReview && (
                          <div className="import-review-compact-editor">
                            <span>
                              <small>PRESCRIPTION</small>
                              <strong>{exerciseSummary(exercise).split(" · ").slice(0, 2).join(" · ")}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPrescriptionEditorId(
                                  prescriptionEditorId === exercise.id
                                    ? null
                                    : exercise.id,
                                )
                              }
                            >
                              {prescriptionEditorId === exercise.id
                                ? "CLOSE"
                                : "EDIT PRESCRIPTION"}
                            </button>
                          </div>
                        )}
                        {(!importReview ||
                          prescriptionEditorId === exercise.id) && (
                        <div className="plan-editor-prescription">
                          <label>
                            <span>{loggingUnit(exercise)==='round'?'Rounds':'Sets'}</span>
                            <PlanNumberInput
                              commits={pendingNumberCommits.current}
                              aria-label={`${loggingUnit(exercise)==='round'?'Rounds':'Sets'} for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={imported ? "20" : "6"}
                              value={exercise.sets.length}
                              onCommit={(value) =>
                                setCount(
                                  day.id,
                                  exercise.id,
                                  value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>{timed ? "Min sec" : "Min reps"}</span>
                            <PlanNumberInput
                              commits={pendingNumberCommits.current}
                              aria-label={`Minimum ${timed ? "seconds" : "reps"} for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={timed ? 600 : 100}
                              value={exercise.repMin}
                              onCommit={(value) =>
                                setRep(
                                  day.id,
                                  exercise.id,
                                  "repMin",
                                  value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>{timed ? "Max sec" : "Max reps"}</span>
                            <PlanNumberInput
                              commits={pendingNumberCommits.current}
                              aria-label={`Maximum ${timed ? "seconds" : "reps"} for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={timed ? 600 : 100}
                              value={exercise.repMax}
                              onCommit={(value) =>
                                setRep(
                                  day.id,
                                  exercise.id,
                                  "repMax",
                                  value,
                                )
                              }
                            />
                          </label>
                        </div>
                        )}
                        {acceptsStartingWeight && (
                          <label className="plan-editor-starting-weight">
                            <span>Starting weight · optional</span>
                            <div>
                              <input
                                aria-label={`Starting weight for ${exerciseName(exercise)} in ${weightUnit(profile.units)}`}
                                type="number"
                                min="0"
                                step={profile.units === "lb" ? "1" : "0.5"}
                                value={displayWeight(
                                  startingWeight,
                                  profile.units,
                                )}
                                placeholder="—"
                                onChange={(event) =>
                                  setStartingWeight(
                                    day.id,
                                    exercise.id,
                                    event.target.value,
                                  )
                                }
                              />
                              <strong>{weightUnit(profile.units)}</strong>
                            </div>
                            <small>
                              Used for every working set. You can adjust sets
                              during the workout.
                            </small>
                          </label>
                        )}
                        {imported && !importReview && (
                          <div className="plan-editor-weights">
                            <span>Imported weight · kg</span>
                            <div>
                              {exercise.sets.map((set, index) => (
                                <label key={set.id}>
                                  <small>{loggingUnit(exercise)==='round'?'Round':'Set'} {index + 1}</small>
                                  <input
                                    aria-label={`Kilograms for ${exerciseName(exercise)} ${loggingUnit(exercise)} ${index + 1}`}
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={set.weight ?? ""}
                                    placeholder="—"
                                    onChange={(event) =>
                                      setWeight(
                                        day.id,
                                        exercise.id,
                                        index,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {importReview && externalLoadRelevant && (
                          <div className="import-review-weights">
                            <div className="import-review-compact-editor">
                              <span>
                                <small>IMPORTED WEIGHTS</small>
                                {importedWeights.length > 0 && (
                                  <strong>
                                    {importedWeights
                                      .map(({ value }) => Number(value))
                                      .join(" / ")} kg
                                  </strong>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setWeightEditorId(
                                    weightEditorId === exercise.id
                                      ? null
                                      : exercise.id,
                                  )
                                }
                              >
                                {weightEditorId === exercise.id
                                  ? "CLOSE"
                                  : importedWeights.length
                                    ? "EDIT"
                                    : "ADD IMPORTED WEIGHTS"}
                              </button>
                            </div>
                            {weightEditorId === exercise.id && (
                              <div className="plan-editor-weights is-on-demand">
                                <div>
                                  {exercise.sets.map((set, index) => (
                                    <label key={set.id}>
                                      <small>Set {index + 1}</small>
                                      <input
                                        aria-label={`Kilograms for ${exerciseName(exercise)} set ${index + 1}`}
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={set.weight ?? ""}
                                        placeholder="—"
                                        onChange={(event) =>
                                          setWeight(
                                            day.id,
                                            exercise.id,
                                            index,
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {exercise.notes && (
                          <small className="imported-note">
                            {exercise.notes}
                          </small>
                        )}
                        {needsReview && !importReview && (
                          <div className="match-review">
                            <small>
                              {needsSpecificName
                                ? "Review exercise name"
                                : "Check exercise name"}
                            </small>
                            <div>
                              <button
                                type="button"
                                disabled={
                                  !String(
                                    exercise.originalImportedName ||
                                      exercise.importedName ||
                                      "",
                                  ).trim()
                                }
                                onClick={() =>
                                  confirmCustom(day.id, exercise.id)
                                }
                              >
                                KEEP AS CUSTOM
                              </button>
                              <span>Keep this exercise even if it is not in Rook.</span>
                            </div>
                          </div>
                        )}
                        {importReview ? (
                          <div className="plan-editor-actions import-review-footer-actions">
                            <button
                              type="button"
                              className="import-review-remove"
                              disabled={!scratch && day.exercises.length <= 1}
                              onClick={() => removeExercise(day.id, exercise.id)}
                            >
                              REMOVE EXERCISE
                            </button>
                          </div>
                        ) : (
                        <div className="plan-editor-actions">
                          <button
                            type="button"
                            className="plan-exercise-remove danger-text"
                            disabled={!scratch && day.exercises.length <= 1}
                            onClick={() => removeExercise(day.id, exercise.id)}
                          >
                            REMOVE
                          </button>
                          {allowSupersets && pair && (
                            <button
                              type="button"
                              onClick={() =>
                                removeSuperset(day.id, pair.id)
                              }
                            >
                              REMOVE SUPERSET
                            </button>
                          )}
                          {allowSupersets && !pair && eligiblePartners.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={
                                pairingExerciseId === exercise.id
                              }
                              onClick={() =>
                                setPairingExerciseId(
                                  pairingExerciseId === exercise.id
                                    ? null
                                    : exercise.id,
                                )
                              }
                            >
                              CREATE SUPERSET
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedExerciseId(null);
                              setExercisePickerId(null);
                              setExerciseQuery("");
                            }}
                          >
                            DONE
                          </button>
                        </div>
                        )}
                        </>}
                      </div>}
                    </Disclosure>
                  </article>
                );
              })}
            </div>}
            {allowAddExercises && (
              <div className="scratch-add-exercise">
                {customAddNotice && addingToDayId === day.id && <p role="alert" className="profile-setting-error">{customAddNotice}</p>}
                {!collapsed && addingToDayId === day.id ? (
                  <>
                    <div className="scratch-exercise-search">
                      <SearchInput onClear={() => setExerciseQuery("")}
                        type="search"
                        aria-label={`Search exercise for ${day.weekday}`}
                        placeholder="Search exercises"
                        value={exerciseQuery}
                        onChange={(event) =>
                          setExerciseQuery(event.target.value)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAddingToDayId(null);
                          setExerciseQuery("");
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                    {onRegisterCustomExercise && <CustomExerciseFallback onCreate={() => beginCustomCreation(exerciseQuery, day.id)} />}
                    <div
                      className="scratch-exercise-results"
                      role="listbox"
                      aria-label={`Exercises for ${day.weekday}`}
                    >
                      {addCandidates.map((item) => (
                          <button
                            type="button"
                            role="option"
                            key={item.id}
                            onClick={() => addExercise(day.id, item.id)}
                          >
                            {item.name}
                          </button>
                        ))}
                    </div>
                    {!addCandidates.length && <p className="plan-picker-empty" role="status">No matching exercises</p>}
                    <small>Saved restrictions apply. Custom exercises that cannot be verified are not offered.</small>
                  </>
                ) : (
                  <div className="plan-workout-tools">
                    <button type="button" className="plan-workout-add" disabled={day.exercises.length >= 8}
                      onClick={() => { setCollapsedDayIds(current => current.filter(id => id !== day.id)); setAddingToDayId(day.id); setExerciseQuery(''); }}>
                      {exerciseCount === 0 ? '+ Add first exercise' : '+ Add exercise'}
                    </button>
                    {directEditor && !scratch && <button type="button" className="plan-workout-overflow" aria-label={`Workout options for ${day.weekday} ${dayTitleParts.primary}`}
                      aria-haspopup="dialog" onClick={event => {
                        workoutActionsTriggerRef.current = event.currentTarget;
                        workoutActionsBackgroundRef.current = reorderRootRef.current?.closest('.screen');
                        setWorkoutActionsDayId(day.id);
                      }}>•••</button>}
                  </div>
                )}
              </div>
            )}
            {scratch && !collapsed && warmupCard}
          </div>
          );
        })}
        {reorderView && (
          <div
            ref={reorderPreviewRef}
            className={`plan-reorder-preview ${reorderView.kind}`}
            aria-hidden="true"
            style={{
              left: `${reorderView.left}px`,
              top: `${reorderView.top}px`,
              width: `${reorderView.width}px`,
            }}
          >
            <strong>{reorderView.label}</strong>
            {reorderView.meta && <small>{reorderView.meta}</small>}
          </div>
        )}
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </p>
      </section>
      {importReview && (
        <section
          className={`bulk-match-review${keepableUnresolved ? "" : " is-complete"}`}
          role={keepableUnresolved ? undefined : "status"}
          aria-live={keepableUnresolved ? undefined : "polite"}
        >
          {keepableUnresolved ? (
            <>
              <Eyebrow>MATCH EXERCISES</Eyebrow>
              <button type="button" onClick={confirmAllCustom}>
                <i aria-hidden="true">✓</i>
                <span>
                  <strong>KEEP ALL AS CUSTOM</strong>
                  <small>Preserve the imported names exactly as written.</small>
                </span>
              </button>
            </>
          ) : (
            <div className="bulk-match-review-complete">
              <i aria-hidden="true">✓</i>
              <span>
                <strong>{pendingImportIssues(sourceReview,resolvedImportIssues).length ? 'EXERCISES MATCHED' : 'REVIEW COMPLETE'}</strong>
                <small>{openDurationReview?'Review the duration target':pendingSourceReviews ? `Exercises ready · ${sourceDecisionSummary}` : 'Ready to use'}</small>
              </span>
            </div>
          )}
        </section>
      )}
      <SheetActionFooter anchorPlanViewport={scratch || mode === 'edit'}>
      {saveError && <p className="offline-banner" role="alert">{saveError}</p>}
      {scratchReadiness && <p className="scratch-readiness" role="status">{scratchReadiness}</p>}
      {openDurationReview && <p role="status">Set the duration for {exerciseName(openDurationReview)} in Edit prescription, or choose a rep-based exercise.</p>}
      {importReview && pendingSourceReviews > 0 && <button type="button" className="button quiet import-review-remaining" onClick={revealImportReview}>{sourceDecisionSummary} · REVIEW</button>}
      <Button
        className={
          importReview && unresolved === 0 && namesValid
            ? "import-ready-sticky-action"
            : ""
        }
        disabled={saving || (!reorderMode && (importApplySafetyIssues.length>0 || Boolean(openDurationReview) || unresolved > 0 || !namesValid || pendingImportIssues(sourceReview,resolvedImportIssues).length > 0 || (sourceReview && (program.days.some(day=>!WEEKDAYS.includes(day.weekday)) || new Set(program.days.map(day=>day.weekday)).size!==program.days.length))))}
        onClick={reorderMode ? finishPreviewReorder : saveProgram}
      >
        {saving ? "SAVING…" : reorderMode ? 'Done reordering' : copy.action}
      </Button>
      {showCancel && <Button
        variant="quiet"
        className={mode === "import" ? "" : "bottom-back"}
        aria-label={mode === "import" ? undefined : "Back"}
        disabled={saving}
        onClick={backFromPreview}
      >
        {mode === "import" ? "EDIT NOTES" : <BackLabel />}
      </Button>}
      </SheetActionFooter>
      {pairingContext && pairingContext.candidates.length > 0 && (
        <div
          className="modal-layer superset-picker-layer"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPairingExerciseId(null);
          }}
        >
          <SupersetPartnerPicker
            exercise={pairingContext.exercise}
            candidates={pairingContext.candidates}
            profile={profile}
            className="plan-superset-sheet"
            onClose={() => setPairingExerciseId(null)}
            onConfirm={(partnerId) =>
              createSuperset(
                pairingContext.day.id,
                pairingContext.exercise.id,
                partnerId,
              )
            }
          />
        </div>
      )}
    </>
  );
}

function ExpertLab({ state, close, initialCount = 0, onSaved }) {
  const [candidate, setCandidate] = useState(null);
  const [corrected, setCorrected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("preparing");
  const [error, setError] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [issue, setIssue] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [selectedExerciseIds, setSelectedExerciseIds] = useState([]);
  const [explanation, setExplanation] = useState("");
  const [saved, setSaved] = useState(null);
  const [savedCount, setSavedCount] = useState(initialCount);
  const resetReview = () => {
    setCorrected(null);
    setReviewMode(false);
    setIssue("");
    setSelectedDayId("");
    setSelectedExerciseIds([]);
    setExplanation("");
    setSaved(null);
  };
  const generate = async () => {
    setBusy(true);
    setError("");
    resetReview();
    try {
      const result = await AIService.generateExpertCandidate(state.profile, {
        onStage: setStage,
        workouts: state.workouts,
        currentProgram: state.program,
      });
      setCandidate(result.program);
    } catch (reason) {
      const message = reason.message || "";
      setError(
        /took too long|not configured|unavailable/i.test(message)
          ? message
          : "AI could not return a readable candidate. Try generating another one.",
      );
    } finally {
      setBusy(false);
    }
  };
  const chooseDay = (dayId) => {
    setSelectedDayId(dayId);
    setSelectedExerciseIds([]);
  };
  const toggleExercise = (dayId, exerciseId) => {
    if (selectedDayId !== dayId) {
      setSelectedDayId(dayId);
      setSelectedExerciseIds([exerciseId]);
      return;
    }
    setSelectedExerciseIds((values) =>
      values.includes(exerciseId)
        ? values.filter((id) => id !== exerciseId)
        : [...values, exerciseId],
    );
  };
  const submit = async (verdict) => {
    if (!candidate || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await AIService.saveExpertFeedback({
        verdict,
        issue: verdict === "needs_improvement" ? issue : null,
        selectedDayId,
        selectedExerciseIds,
        explanation,
        profile: state.profile,
        candidateProgram: candidate,
        correctedProgram: corrected,
      });
      setSaved({ verdict, ...result });
      setSavedCount((value) => value + 1);
      onSaved?.();
    } catch (reason) {
      setError(reason.message || "Expert feedback could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  if (editing && candidate)
    return (
      <main className="screen detail-screen expert-correction-screen">
        <header className="detail-header">
          <button aria-label="Back to review" onClick={() => setEditing(false)}>
            ‹
          </button>
          <strong>Corrected plan</strong>
          <span />
        </header>
        <PlanEditor
          source={corrected || candidate}
          profile={state.profile}
          mode="expert"
          exerciseState={state}
          onSave={(program) => {
            setCorrected(program);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </main>
    );
  return (
    <main className="screen detail-screen expert-lab-screen">
      <header className="detail-header">
        <button aria-label="Close Expert Lab" onClick={close}>
          ‹
        </button>
        <strong>AI Training Lab</strong>
        <span>{savedCount}</span>
      </header>
      <Eyebrow>EXPERT REVIEW</Eyebrow>
      <h1>Teach Rook how you program.</h1>
      <p>
        Generate a plan from your current profile, mark what is good or wrong,
        and optionally save your better version.
      </p>
      {!candidate && (
        <section className="expert-start">
          <div>
            <strong>Current test profile</strong>
            <small>
              {state.profile.experience} · {state.profile.goal} ·{" "}
              {pluralize(state.profile.daysPerWeek, "day")}/week ·{" "}
              {state.profile.sessionMinutes} min
            </small>
          </div>
          {error && <p className="offline-banner">{error}</p>}
          <Button disabled={busy} onClick={generate}>
            {busy ? "GENERATING…" : "GENERATE PLAN TO REVIEW"}
          </Button>
        </section>
      )}
      {candidate && (
        <>
          <section className="expert-candidate">
            <div className="expert-candidate-heading">
              <span>
                <Eyebrow>AI CANDIDATE</Eyebrow>
                <h2>{candidate.name}</h2>
              </span>
              <button disabled={saving} onClick={generate}>
                NEW
              </button>
            </div>
            {reviewMode && (
              <div className="expert-selection-note">
                <strong>Mark what your feedback refers to</strong>
                <small>
                  Optional · select a day or exercises only when your comment is
                  specific to them.
                </small>
              </div>
            )}
            {candidate.days.map((day) => (
              <article
                className={`expert-day-card ${reviewMode ? "reviewing" : ""} ${selectedDayId === day.id ? "selected" : ""}`}
                key={day.id}
              >
                <button
                  className="expert-day-heading"
                  aria-disabled={!reviewMode}
                  onClick={() => reviewMode && chooseDay(day.id)}
                >
                  <span>
                    <small>{day.weekday}</small>
                    <strong>
                      {normalizeWorkoutName(day.name, day.weekday)}
                    </strong>
                  </span>
                  <em>{day.exercises.length} exercises</em>
                </button>
                <div>
                  {day.exercises.map((exercise) => {
                    const marked =
                      selectedDayId === day.id &&
                      selectedExerciseIds.includes(exercise.id);
                    return (
                      <button
                        type="button"
                        className={`expert-exercise-choice ${marked ? "marked" : ""}`}
                        disabled={!reviewMode}
                        aria-pressed={marked}
                        aria-label={`${marked ? "Unmark" : "Mark"} ${exerciseName(exercise)}`}
                        key={exercise.id}
                        onClick={() => toggleExercise(day.id, exercise.id)}
                      >
                        <span>
                          <strong>{exerciseName(exercise)}</strong>
                          <small>{targetLabel(exercise, true)}</small>
                        </span>
                        <i aria-hidden="true">{marked ? "✓" : ""}</i>
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
          {!saved && !reviewMode && (
            <section className="expert-verdict">
              <Eyebrow>YOUR VERDICT</Eyebrow>
              <div>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => submit("good")}
                >
                  {saving ? "SAVING…" : "GOOD PLAN"}
                </Button>
                <Button
                  variant="dark"
                  disabled={saving}
                  onClick={() => setReviewMode(true)}
                >
                  NEEDS IMPROVEMENT
                </Button>
              </div>
            </section>
          )}
          {!saved && reviewMode && (
            <section className="expert-feedback-form">
              <Eyebrow>WHAT IS WRONG?</Eyebrow>
              <div className="expert-issue-grid">
                {EXPERT_ISSUES.map(([id, label]) => (
                  <button
                    className={issue === id ? "selected" : ""}
                    key={id}
                    onClick={() => setIssue(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="expert-explanation">
                <span>
                  Your reasoning{" "}
                  <small>{issue === "other" ? "required" : "optional"}</small>
                </span>
                <textarea
                  rows="4"
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  placeholder="What would you change, and why?"
                />
              </label>
              <button
                className={`expert-correction-button ${corrected ? "ready" : ""}`}
                onClick={() => setEditing(true)}
              >
                <span>
                  <strong>
                    {corrected
                      ? "Corrected version saved"
                      : "Edit the better version"}
                  </strong>
                  <small>
                    {corrected
                      ? "Tap to adjust it again."
                      : "Optional · change exercises, sets or reps."}
                  </small>
                </span>
                <i>{corrected ? "✓" : "›"}</i>
              </button>
              {error && <p className="offline-banner">{error}</p>}
              <Button
                disabled={
                  saving ||
                  !issue ||
                  (issue === "other" && explanation.trim().length < 3)
                }
                onClick={() => submit("needs_improvement")}
              >
                {saving ? "SAVING…" : "SAVE EXPERT FEEDBACK"}
              </Button>
              <Button
                variant="quiet"
                disabled={saving}
                onClick={() => setReviewMode(false)}
              >
                BACK
              </Button>
            </section>
          )}
          {saved && (
            <section className="expert-saved">
              <i>✓</i>
              <Eyebrow>SAVED LOCALLY</Eyebrow>
              <h2>
                {saved.verdict === "good"
                  ? "Good plan recorded."
                  : "Improvement recorded."}
              </h2>
              <p>
                This candidate, profile and your review are now part of the
                expert dataset.
              </p>
              <Button onClick={generate}>REVIEW ANOTHER PLAN</Button>
            </section>
          )}
          {error && !reviewMode && <p className="offline-banner">{error}</p>}
        </>
      )}
      {busy && <BuildingOverlay stage={stage} />}
    </main>
  );
}

function ImportPlan({
  state,
  update,
  close,
  onPlanAccepted,
  initial = false,
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const importRun = useRef(0);
  const [hybridDraft,setHybridDraft] = useState(null);
  const [importLibraryDraft,setImportLibraryDraft] = useState(null);
  const [importStage, setImportStage] = useState('reading');
  const importTextRef = useRef(null);
  const notesPaste = useImportNotesPaste(importTextRef, value=>{setText(value);setHybridDraft(null);}, () => setError(''));
  const importAbortRef = useRef(null);
  const importApplyingRef = useRef(false);
  useEffect(() => () => importAbortRef.current?.abort(), []);
  useEffect(() => {
    if (initial && preview)
      trackFunnelEventOnce("first_plan_viewed", {
        path: "import",
        planType: "imported",
      });
  }, [initial, preview]);
  const generate = async (interpretWithAI=false) => {
    if(importAbortRef.current)return;
    const run = ++importRun.current;
    setImportStage('reading');
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const startedAt = performance.now();
    setBusy(true);
    trackFunnelEvent("plan_generation_started", {
      path: "import",
      source: "notes",
    });
    setError("");
    try {
      await afterVisibleFrame();
      const result = await AIService.importTrainingPlan(
        state.profile,
        text.trim(),
        { signal: controller.signal, review: true, onStage: setImportStage, interpretWithAI },
      );
      if (run === importRun.current) await finishPlanProcessing(startedAt, setImportStage);
      if (run === importRun.current) {
        trackFunnelEvent("plan_generation_completed", {
          path: "import",
          source: result.source || "notes",
          durationMs: Math.round(performance.now() - startedAt),
          daysPerWeek: result.program.days.length,
          exerciseCount: result.program.days.reduce(
            (sum, day) => sum + day.exercises.length,
            0,
          ),
        });
        if(result.hybrid?.needsAI){setHybridDraft(result);}
        else {setPreview(result);setHybridDraft(null);}
        setImportLibraryDraft(clone(state));
      }
    } catch (reason) {
      if (run === importRun.current) {
        trackFunnelEvent("plan_generation_failed", {
          path: "import",
          source: "notes",
          durationMs: Math.round(performance.now() - startedAt),
          reason: "parse_or_provider",
        });
        const message = reason.message || "The plan could not be imported.";
        setError(/current plan.*unchanged/i.test(message) ? message : `${message} Your current plan is unchanged.`);
      }
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
      if (run === importRun.current) setBusy(false);
    }
  };
  const cancelImport = () => {
    importRun.current++;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setBusy(false);
    setError("Import cancelled. Your notes are still here.");
  };
  const apply = (program) => {
    if (importApplyingRef.current) return;
    if (state.activeWorkout || state.activeOptionalSession) {
      setError('Finish or discard your active workout before replacing your plan.');
      return;
    }
    if (
      !initial &&
      !confirm(
        "Replace the current program with this imported plan? Workout history will remain.",
      )
    )
      return;
    importApplyingRef.current = true;
    try {
      const importState = {...state,customExercises:importLibraryDraft?.customExercises||state.customExercises,exerciseAliases:importLibraryDraft?.exerciseAliases||state.exerciseAliases};
      const next = persistPlanImport(importState, program, preview.profile,
        { date: isoDay(), weekday: weekday(), initial }, saveState);
      update(() => next, { planVersion: false, persistedState: next });
    } catch (reason) {
      importApplyingRef.current = false;
      setError(reason.message || 'Your plan could not be saved. Your current plan is unchanged.');
      return;
    }
    if (initial)
      trackFunnelEvent("onboarding_completed", {
        path: "import",
        source: "ai-import",
        daysPerWeek: program.days.length,
      });
    close();
    onPlanAccepted?.();
  };
  return (
    <main
      className={`screen detail-screen import-plan-screen ${!preview ? "is-compose" : ""} ${initial ? "initial-import-screen" : ""}`}
    >
      <SheetHeader
        title="Import plan"
        {...(initial
          ? { onBack: close, backLabel: "Back to start" }
          : { onClose: close, closeLabel: "Close import plan" })}
      />
      {!preview ? (
        <>
        <div className="import-plan-compose">
          <Eyebrow>FROM NOTES</Eyebrow>
          <h1>Bring your existing workout into Rook.</h1>
          <p>
            Paste your workout notes. Rook will structure them for review before
            saving.
          </p>
          <div className="import-format-examples">
            <small>EXAMPLES</small>
            <div>
              <code>Monday: Push</code>
              <code>Bench Press 3×8–10</code>
              <code>Squat 4×5 @ 2 RIR</code>
            </div>
          </div>
          <div className="import-plan-text-wrap">
            <textarea
              ref={importTextRef}
              className="text-answer import-plan-text"
              value={text}
              disabled={busy}
              aria-describedby="import-notes-status"
              onChange={(event) => { setText(event.target.value); setHybridDraft(null); notesPaste.clearStatus(); }}
              placeholder="Paste your workout notes here..."
            />
            <button
              type="button"
              className="import-plan-paste"
              disabled={busy || notesPaste.pasting}
              onClick={notesPaste.paste}
              aria-label="Paste workout notes from clipboard"
            >
              PASTE
            </button>
          </div>
          <small className="import-plan-helper" id="import-notes-status" role="status" aria-live="polite" aria-atomic="true">
            {notesPaste.status || 'Plain-text workout notes work best. You’ll review anything Rook can’t match.'}
          </small>
          {hybridDraft&&<ImportInterpretationOffer draft={hybridDraft.hybrid} busy={busy} onInterpret={()=>generate(true)} onReview={()=>{setPreview(hybridDraft);setHybridDraft(null);}}/>}
        </div>
        {!hybridDraft&&<SheetActionFooter className="import-compose-footer" pageScroll={initial}>
          {error && <p className="offline-banner">{error}</p>}
          <Button disabled={busy || text.trim().length === 0} onClick={()=>generate(false)}>
            {busy ? 'PREPARING…' : error && !error.startsWith('Import cancelled') ? 'TRY AGAIN' : 'CREATE PREVIEW'}
          </Button>
        </SheetActionFooter>}
        {hybridDraft&&error&&<p role="alert" className="import-plan-helper">{error}</p>}
        </>
      ) : (
        <>
        <PlanEditor
          source={preview.program}
          profile={preview.profile}
          mode="import"
          sourceReview={preview.sourceReview}
          saveError={error}
          exerciseState={importLibraryDraft||state}
          onRegisterCustomExercise={(record) => setImportLibraryDraft(current => { const next=clone(current||state);registerCustomExerciseRecord(next,record);return next; })}
          onRememberExerciseAlias={(alias, exerciseId) => setImportLibraryDraft(current => { const next=clone(current||state);rememberExerciseAlias(next,alias,exerciseId,{builtInCatalog:exerciseCatalog});return next; })}
          onSave={apply}
          onCancel={() => setPreview(null)}
        />
        </>
      )}
      {busy && <BuildingOverlay kind="import" stage={importStage} onCancel={cancelImport} />}
    </main>
  );
}

function RestTrainingSheet({ date, state, update, close, setPage, setDetail }) {
  const [mode, setMode] = useState("menu");
  const [move, setMove] = useState(null);
  const [cardioType, setCardioType] = useState("Walking");
  const [duration, setDuration] = useState(20);
  const [intensity, setIntensity] = useState("Easy");
  const [startError, setStartError] = useState("");
  const sheetRef = useRef(null);
  const eligible = currentWeekSchedule(state, date).filter(
    (item) =>
      item.scheduledDate > date &&
      !state.workouts.some(
        (workout) =>
          workout.completedAt &&
          workout.programDayId === item.workoutId &&
          weekKey(workoutPlanDate(workout)) === weekKey(date),
      ) &&
      state.activeWorkout?.programDayId !== item.workoutId,
  );
  const startOptional = (kind) => {
    if (state.activeWorkout || state.activeOptionalSession) {
      setStartError("Finish or resume the active session before starting another.");
      return;
    }
    if (date !== isoDay()) {
      setStartError("Optional sessions can only be started for today.");
      return;
    }
    const startedAt = Date.now();
    update((current) =>
      startOptionalSession(
        current,
        {
          date,
          kind,
          activity: kind === "Cardio" ? cardioType : "Mobility / recovery",
          duration,
          intensity: kind === "Cardio" ? intensity : "Easy",
        },
        startedAt,
      ),
    );
    close();
    setPage("optional-session");
  };
  const applyMove = () => {
    if (!move) return;
    if (state.flexibleWeek || state.todayAdaptation) {
      setDetail({ flexibleWeek: { sessionId: move.logicalSessionId || `${move.workoutId}:${move.originalDate}` } });
      return;
    }
    update((current) => {
      applyWeekScheduleChanges(
        current,
        [
          {
            workoutId: move.workoutId,
            fromDate: move.scheduledDate,
            toDate: date,
          },
        ],
        localDate(date),
      );
      current.selectedDay = weekday(date);
      current.selectedDate = date;
      return current;
    });
    close();
  };
  const option = (title, body, action) => (
    <button className="rest-training-option" onClick={action}>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      <i>›</i>
    </button>
  );
  return (
    <main
      ref={sheetRef}
      className="sheet rest-training-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rest-training-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="sheet-header-chrome">
        <SheetDragHandle sheetRef={sheetRef} close={close} />
        <button className="sheet-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>
      {mode !== "menu" && (
        <button
          className="sheet-back text-button"
          onClick={() => {
            setMode("menu");
            setMove(null);
          }}
        >
          ‹ Back
        </button>
      )}
      {mode === "menu" && (
        <>
          <Eyebrow>REST DAY</Eyebrow>
          <h2 id="rest-training-title">Choose today&apos;s activity</h2>
          <p>
            Keep recovery light, or move one of this week&apos;s planned workouts
            here.
          </p>
          {option(
            "MOVE A PLANNED WORKOUT HERE",
            "Train one of this week's planned sessions today.",
            () => setMode("move"),
          )}
          {option(
            "LIGHT CARDIO",
            "Add an easy session without changing the strength plan.",
            () => setMode("cardio"),
          )}
          {option(
            "MOBILITY / RECOVERY",
            "Add a light recovery-focused session.",
            () => {
              setDuration(15);
              setMode("mobility");
            },
          )}
          {option(
            "ASK COACH",
            "Let Coach use this week’s actual schedule and history.",
            () => {
              update((current) => {
                current.coachDraft =
                  "I want to train today even though it's a rest day. What makes the most sense?";
                return current;
              });
              close();
              setPage("coach");
            },
          )}
        </>
      )}
      {mode === "move" && !move && (
        <>
          <Eyebrow>MOVE A WORKOUT</Eyebrow>
          <h2 id="rest-training-title">Planned later this week</h2>
          <p>Select an uncompleted workout. Nothing moves until you confirm.</p>
          {eligible.length ? (
            eligible.map((item) => (
              <button
                className="move-workout-row"
                key={item.workoutId}
                onClick={() => setMove(item)}
              >
                <span>
                  <small>{displayDate(localDate(item.scheduledDate))}</small>
                  <strong>{item.workout.name}</strong>
                  <em>
                    {item.workout.exercises.length} exercises · ~
                    {roundedEstimate(item.workout.estimatedMinutes)} min
                  </em>
                </span>
                <i>›</i>
              </button>
            ))
          ) : (
            <p className="offline-banner">
              No eligible upcoming workout can be moved.
            </p>
          )}
        </>
      )}
      {mode === "move" && move && (
        <>
          <Eyebrow>REVIEW MOVE</Eyebrow>
          <h2 id="rest-training-title">Move {move.workout.name}</h2>
          <div className="move-preview">
            <span>
              <small>FROM</small>
              <strong>{displayDate(localDate(move.scheduledDate))}</strong>
            </span>
            <span>
              <small>TO</small>
              <strong>{displayDate(localDate(date))}</strong>
            </span>
          </div>
          <p>
            The recurring program stays unchanged. This move applies only to
            this week.
          </p>
          <Button onClick={applyMove}>MOVE WORKOUT</Button>
        </>
      )}
      {mode === "cardio" && (
        <>
          <Eyebrow>OPTIONAL SESSION</Eyebrow>
          <h2 id="rest-training-title">Light cardio</h2>
          <label className="optional-field">
            <span>Type</span>
            <select
              value={cardioType}
              onChange={(event) => setCardioType(event.target.value)}
            >
              {["Walking", "Cycling", "Elliptical", "Easy run", "Other"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <div className="optional-duration">
            <span>Duration</span>
            <div>
              <button
                onClick={() => setDuration((value) => Math.max(10, value - 5))}
              >
                −
              </button>
              <strong>{duration} min</strong>
              <button
                onClick={() => setDuration((value) => Math.min(90, value + 5))}
              >
                +
              </button>
            </div>
          </div>
          <div className="segmented">
            {["Easy", "Moderate"].map((value) => (
              <button
                key={value}
                className={intensity === value ? "active" : ""}
                onClick={() => setIntensity(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {startError && <p className="offline-banner" role="alert">{startError}</p>}
          <Button onClick={() => startOptional("Cardio")}>START SESSION</Button>
          <small className="sheet-footnote">
            Optional · does not complete a planned strength workout.
          </small>
        </>
      )}
      {mode === "mobility" && (
        <>
          <Eyebrow>OPTIONAL SESSION</Eyebrow>
          <h2 id="rest-training-title">Mobility / recovery</h2>
          <p>
            A short, easy recovery session. It will not modify your strength
            plan.
          </p>
          <div className="optional-duration">
            <span>Duration</span>
            <div>
              <button
                onClick={() => setDuration((value) => Math.max(5, value - 5))}
              >
                −
              </button>
              <strong>{duration} min</strong>
              <button
                onClick={() => setDuration((value) => Math.min(45, value + 5))}
              >
                +
              </button>
            </div>
          </div>
          {startError && <p className="offline-banner" role="alert">{startError}</p>}
          <Button onClick={() => startOptional("Mobility")}>START SESSION</Button>
        </>
      )}
    </main>
  );
}

function ProfileDetails({ state, update, close }) {
  const [details, setDetails] = useState(() => ({
    name: state.profile.name || "",
    ageRange: state.profile.ageRange || "",
    sex: state.profile.sex || "",
  }));
  const [sexOptionsOpen, setSexOptionsOpen] = useState(false);
  const sexTriggerRef = useRef(null);
  const sexOptionRefs = useRef([]);
  const sexOptions = ["", "Female", "Male", "Intersex", "Prefer not to say"];
  const sexOptionLabel = (option) => option || "Not set";
  const openSexOptions = (focusOffset = 0) => {
    const selectedIndex = Math.max(0, sexOptions.indexOf(details.sex));
    const nextIndex = Math.min(
      sexOptions.length - 1,
      Math.max(0, selectedIndex + focusOffset),
    );
    setSexOptionsOpen(true);
    requestAnimationFrame(() => sexOptionRefs.current[nextIndex]?.focus({ preventScroll: true }));
  };
  const chooseSex = (option) => {
    setDetails((current) => ({ ...current, sex: option }));
    setSexOptionsOpen(false);
    requestAnimationFrame(() =>
      sexTriggerRef.current?.focus({ preventScroll: true }),
    );
  };
  const save = () => {
    update((current) => {
      current.profile.name = details.name.trim();
      current.profile.ageRange = details.ageRange || null;
      current.profile.sex = details.sex || null;
      return current;
    });
    close();
  };
  return (
    <main className="screen detail-screen profile-details-screen">
      <SheetHeader
        title="Profile details"
        onClose={close}
        closeLabel="Close profile details"
      />
      <Eyebrow>ABOUT YOU</Eyebrow>
      <h1>Complete your profile</h1>
      <p>
        These details give Coach useful context. You can leave any of them
        blank.
      </p>
      <div className="personal-fields">
        <label>
          <span>
            First name <small>optional</small>
          </span>
          <input
            value={details.name}
            maxLength={40}
            autoComplete="given-name"
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>
            Age range <small>optional</small>
          </span>
          <select
            value={details.ageRange}
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                ageRange: event.target.value,
              }))
            }
          >
            <option value="">Not set</option>
            {["Under 18", "18–29", "30–39", "40–49", "50–59", "60+"].map(
              (option) => (
                <option key={option}>{option}</option>
              ),
            )}
          </select>
        </label>
        <div className="personal-field profile-sex-field">
          <span id="profile-sex-label">
            Sex <small>optional</small>
          </span>
          <button
            ref={sexTriggerRef}
            type="button"
            className="profile-sex-trigger"
            aria-labelledby="profile-sex-label profile-sex-value"
            aria-expanded={sexOptionsOpen}
            aria-controls="profile-sex-options"
            onClick={() =>
              sexOptionsOpen ? setSexOptionsOpen(false) : openSexOptions()
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                openSexOptions(details.sex ? 0 : 1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                openSexOptions(details.sex ? 0 : sexOptions.length - 1);
              }
              if (event.key === "Escape") setSexOptionsOpen(false);
            }}
          >
            <span id="profile-sex-value" className={details.sex ? "" : "placeholder"}>
              {sexOptionLabel(details.sex)}
            </span>
            <i className="disclosure-chevron" aria-hidden="true" />
          </button>
          <Disclosure open={sexOptionsOpen} revealOnOpen>
            <fieldset
              id="profile-sex-options"
              className="profile-sex-options"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setSexOptionsOpen(false);
                requestAnimationFrame(() =>
                  sexTriggerRef.current?.focus({ preventScroll: true }),
                );
              }}
            >
              <legend className="visually-hidden">Sex</legend>
              {sexOptions.map((option, index) => (
                <label
                  key={option || "not-set"}
                  className={details.sex === option ? "is-selected" : ""}
                >
                  <input
                    ref={(element) => {
                      sexOptionRefs.current[index] = element;
                    }}
                    type="radio"
                    name="profile-sex"
                    value={option}
                    checked={details.sex === option}
                    onChange={() => chooseSex(option)}
                  />
                  <span>{sexOptionLabel(option)}</span>
                  <i aria-hidden="true">{details.sex === option ? "✓" : ""}</i>
                </label>
              ))}
            </fieldset>
          </Disclosure>
        </div>
      </div>
      <SheetActionFooter><Button onClick={save}>SAVE DETAILS</Button></SheetActionFooter>
    </main>
  );
}
function ProfileTrainingSetting({ state, update, close, setting, focus }) {
  const profile = state.profile;
  const minimumDays = 1;
  const [availableDays, setAvailableDays] = useState(() =>
    WEEKDAYS.filter((day) => (profile.availableDays || []).includes(day)),
  );
  const [environment, setEnvironment] = useState(
    profile.environment || "Commercial gym",
  );
  const [equipment, setEquipment] = useState(() => [
    ...(profile.equipment || []),
  ]);
  const toggleDay = (day) =>
    setAvailableDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : WEEKDAYS.filter((item) => item === day || current.includes(item)),
    );
  const chooseEnvironment = (next) => {
    setEnvironment(next);
    setEquipment((current) => {
      const home = current.filter((item) => item !== "full gym");
      if (next === "Commercial gym") return ["full gym"];
      if (next === "Both") return ["full gym", ...home];
      return home;
    });
  };
  const toggleEquipment = (option) =>
    setEquipment((current) => {
      const implicit = environment === "Both" ? ["full gym"] : [];
      const home = current.filter((item) => item !== "full gym");
      let next = home.includes(option)
        ? home.filter((item) => item !== option)
        : [...home, option];
      if (option === "bodyweight only") next = ["bodyweight only"];
      else next = next.filter((item) => item !== "bodyweight only");
      return [...implicit, ...next];
    });
  const setupValid = setupSelectionValid({ environment, equipment });
  const scheduleValid = availableDays.length >= minimumDays;
  const save = () => {
    update((current) => {
      if (setting === "schedule") {
        current.profile.availableDays = WEEKDAYS.filter((day) =>
          availableDays.includes(day),
        );
        current.profile.daysPerWeek = Math.min(
          Math.max(1, Number(current.profile.daysPerWeek) || 1),
          availableDays.length,
        );
      } else {
        current.profile.environment = environment;
        current.profile.equipment = equipment;
      }
      return current;
    });
    close();
  };
  const setupTitle =
    focus === "equipment" ? "Available equipment" : "Training environment";
  return (
    <main className="screen detail-screen profile-training-setting-screen">
      <SheetHeader
        title={setting === "schedule" ? "Availability" : setupTitle}
        onClose={close}
        closeLabel={`Close ${setting === "schedule" ? "availability" : setupTitle.toLowerCase()}`}
      />
      <div className="profile-setting-scroll">
      {setting === "schedule" ? (
        <>
          <Eyebrow>PLANNING PREFERENCE</Eyebrow>
          <h1>When can you train?</h1>
          <p>
            Days you’re generally available to train. This won’t move workouts
            in your current program.
          </p>
          <section className="profile-setting-options schedule-days">
            <div className="option-list day-options">
              {WEEKDAYS.map((day) => (
                <OnboardingOptionCard
                  key={day}
                  label={localizedWeekdayLabel(day, "short")}
                  ariaLabel={localizedWeekdayLabel(day, "long")}
                  selected={availableDays.includes(day)}
                  onClick={() => toggleDay(day)}
                />
              ))}
            </div>
            <small className="schedule-selection-count" aria-live="polite">
              {availableDays.length} {availableDays.length === 1 ? "day" : "days"} selected
            </small>
            {!scheduleValid && (
              <small className="profile-setting-error">
                Keep at least {minimumDays} days available for this program.
              </small>
            )}
          </section>
        </>
      ) : (
        <>
          <Eyebrow>TRAINING SETUP</Eyebrow>
          <h1>{setupTitle}</h1>
          <p>
            {focus === "equipment"
              ? "Used for exercise recommendations and future plan changes. This won’t replace exercises in your current program."
              : "Used by Coach and future plan changes. This won’t change your current program."}
          </p>
          <section className="profile-setting-options setup-environment">
            <div className="option-list">
              {["Commercial gym", "Home gym", "Both"].map((option) => (
                <OnboardingOptionCard
                  key={option}
                  label={option}
                  selected={environment === option}
                  onClick={() => chooseEnvironment(option)}
                />
              ))}
            </div>
          </section>
          {environment === "Commercial gym" ? (
            <div className="setup-confirmation profile-setup-confirmation">
              <strong>Full gym access</strong>
              <small>Standard commercial-gym equipment is included.</small>
            </div>
          ) : (
            <section className="profile-setting-options setup-equipment">
              <div className="onboarding-group-heading">
                <strong>
                  {environment === "Both"
                    ? "Equipment available at home"
                    : "Available equipment"}
                </strong>
                <small>Select all that apply</small>
              </div>
              <div className="option-list option-grid">
                {(EQUIPMENT_BY_ENVIRONMENT[environment] || []).map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={EQUIPMENT_LABELS[option] || option}
                    selected={equipment.includes(option)}
                    onClick={() => toggleEquipment(option)}
                  />
                ))}
              </div>
              {!setupValid && (
                <small className="profile-setting-error">
                  Select at least one available equipment option.
                </small>
              )}
            </section>
          )}
        </>
      )}
      </div>
      <SheetActionFooter className="profile-setting-footer" separate>
        <Button
          disabled={setting === "schedule" ? !scheduleValid : !setupValid}
          onClick={save}
        >
          {setting === "schedule" ? "SAVE AVAILABILITY" : "SAVE SETUP"}
        </Button>
      </SheetActionFooter>
    </main>
  );
}
function EditPlan({ state, update, close, reviewExerciseIds = [], fullscreen = false, onExpand }) {
  const screenRef = useRef(null);
  const dirtyRef = useRef(false);
  const reportDirty = useCallback(value=>{dirtyRef.current=value;},[]);
  const canLeave = () => {
    if (!dirtyRef.current) return true;
    if (!window.confirm('Discard unsaved plan changes?')) return false;
    dirtyRef.current = false;
    return true;
  };
  const back = () => {if(canLeave())close();};
  useEffect(()=>{
    const screen=screenRef.current;
    const guard=event=>{if(!canLeave())event.preventDefault();};
    screen?.addEventListener('rook:before-sheet-close',guard);
    return()=>screen?.removeEventListener('rook:before-sheet-close',guard);
  },[]);
  useLayoutEffect(() => {
    if (fullscreen) focusNavigationTarget(screenRef.current?.querySelector('.detail-header-back'));
  }, [fullscreen]);
  const save = (program) => {
    update((current) => {
      current.program = program;
      current.ai = { ...current.ai, lastPlanSource: "manual-edit" };
      return current;
    }, { planVersion: { source: "Manual edit" } });
    dirtyRef.current=false;
    close();
  };
  return (
    <main ref={screenRef} className="screen detail-screen edit-plan-screen">
      <SheetHeader
        title="Edit plan"
        onClose={fullscreen ? undefined : back}
        onBack={fullscreen ? back : undefined}
        backLabel="Back to Program"
        trailingAction={!fullscreen && !state.activeWorkout ? (
          <button
            type="button"
            className="edit-plan-expand"
            aria-label="Expand Edit plan to full screen"
            onClick={onExpand}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            </svg>
          </button>
        ) : undefined}
        closeLabel="Close edit plan"
      />
      {state.activeWorkout ? (
        <>
          <Eyebrow>ACTIVE WORKOUT</Eyebrow>
          <h1>Finish your workout first.</h1>
          <p>
            Your active set data is protected. Return here after finishing to
            edit the recurring plan.
          </p>
        </>
      ) : (
        <PlanEditor
          source={state.program}
          profile={state.profile}
          mode="edit"
          onDirtyChange={reportDirty}
          showCancel={!fullscreen}
          exerciseState={state}
          onRegisterCustomExercise={(record) => update((current) => { registerCustomExerciseRecord(current, record); return current; })}
          onRememberExerciseAlias={(alias, exerciseId) => update((current) => { rememberExerciseAlias(current, alias, exerciseId, { builtInCatalog: exerciseCatalog }); return current; })}
          reviewExerciseIds={reviewExerciseIds}
          onSave={save}
          onCancel={back}
        />
      )}
    </main>
  );
}
function SheetDragHandle({
  sheetRef,
  close,
  disabled = false,
  dragAnywhere = false,
}) {
  const drag = useRef(null);
  const dismissTimer = useRef(null);
  useEffect(() => () => clearTimeout(dismissTimer.current), []);
  const layer = () =>
    sheetRef.current?.closest(
      ".modal-layer, .workout-confirm-layer",
    );
  const setPosition = (distance) => {
    if (!sheetRef.current) return;
    const value = Math.max(0, distance);
    sheetRef.current.style.transform = `translateY(${value}px)`;
    const progress = Math.min(
      1,
      value / Math.max(1, sheetRef.current.offsetHeight),
    );
    if (layer())
      layer().style.backgroundColor = `rgba(27,26,25,${0.35 * (1 - progress)})`;
  };
  const start = (event) => {
    if (disabled || event.button > 0 || event.pointerType === "touch") return;
    if (!dragAnywhere) event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      y: event.clientY,
      time: performance.now(),
      moved: false,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
    };
    sheetRef.current.style.transition = "none";
  };
  const move = (event) => {
    if (!drag.current) return;
    const distance = Math.max(0, event.clientY - drag.current.y);
    if (distance > 6 && !drag.current.moved) {
      drag.current.moved = true;
      drag.current.captureTarget?.setPointerCapture?.(drag.current.pointerId);
    }
    setPosition(distance);
  };
  const end = (event) => {
    if (!drag.current) return;
    const activeDrag = drag.current;
    const distance = Math.max(0, event.clientY - activeDrag.y);
    const velocity =
      distance / Math.max(1, performance.now() - activeDrag.time);
    drag.current = null;
    const surface = sheetRef.current;
    if (activeDrag.moved && surface) {
      const suppress = (click) => {
        click.preventDefault();
        click.stopPropagation();
      };
      surface.addEventListener("click", suppress, {
        capture: true,
        once: true,
      });
      setTimeout(() => surface.removeEventListener("click", suppress, true), 0);
    }
    sheetRef.current.style.transition = "transform 180ms ease";
    if (
      distance > Math.min(140, sheetRef.current.offsetHeight * 0.22) ||
      (distance > 28 && velocity > 0.65)
    ) {
      setPosition(sheetRef.current.offsetHeight);
      if (layer()) layer().style.backgroundColor = "rgba(27,26,25,0)";
      dismissTimer.current = setTimeout(close, 180);
    } else {
      setPosition(0);
      if (layer()) layer().style.backgroundColor = "rgba(27,26,25,.35)";
    }
  };
  useEffect(() => {
    const surface = sheetRef.current;
    if (!dragAnywhere || disabled || !surface) return undefined;
    surface.addEventListener("pointerdown", start);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", end);
    return () => {
      surface.removeEventListener("pointerdown", start);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", end);
      surface.removeEventListener("pointercancel", end);
    };
  });
  useEffect(() => {
    const surface = sheetRef.current;
    if (!surface || disabled) return undefined;
    const scroller = surface.querySelector(".sheet-scroll") || surface;
    return bindScrollableSheetTouch({
      surface,
      scroller,
      disabled: () => disabled,
      setPosition,
      onDragStart: () => {
        surface.style.transition = "none";
      },
      onDismiss: () => {
        surface.style.transition = "transform 180ms ease";
        setPosition(surface.offsetHeight);
        if (layer()) layer().style.backgroundColor = "rgba(27,26,25,0)";
        dismissTimer.current = setTimeout(close, 180);
      },
      onReset: () => {
        surface.style.transition = "transform 180ms ease";
        setPosition(0);
        if (layer()) layer().style.backgroundColor = "rgba(27,26,25,.35)";
      },
    });
  }, [disabled]);
  return (
    <div
      className={`sheet-grab-zone${disabled ? " disabled" : ""}`}
      aria-label="Drag down or tap to close"
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : close}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          close();
        }
      }}
      onPointerDown={dragAnywhere ? undefined : start}
      onPointerMove={dragAnywhere ? undefined : move}
      onPointerUp={dragAnywhere ? undefined : end}
      onPointerCancel={dragAnywhere ? undefined : end}
    >
      <i />
    </div>
  );
}
function ChangePlanSheet({ state, update, close, setDetail, onPlanAccepted }) {
  const imported = state.program.source === "ai-import";
  const [mode, setMode] = useState("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generationStage, setGenerationStage] = useState("preparing");
  const [preview, setPreview] = useState(null);
  const requestRef = useRef(false);
  const requestRun = useRef(0);
  const sheetRef = useRef(null);
  const blocked = Boolean(state.activeWorkout || state.activeOptionalSession);
  const build = async () => {
    if (requestRef.current) return;
    requestRef.current = true;
    const run = ++requestRun.current;
    setBusy(true);
    setError("");
    setGenerationStage("preparing");
    try {
      await afterVisibleFrame();
      const result = await generatePersonalizedProgram(state.profile, {
        onStage: setGenerationStage,
        workouts: state.workouts,
        currentProgram: state.program,
      });
      await afterVisibleFrame();
      if (run !== requestRun.current) return;
      setPreview(result);
      setBusy(false);
      requestRef.current = false;
    } catch {
      if (run !== requestRun.current) return;
      setError("We couldn't build your plan. Your current plan is unchanged.");
      setBusy(false);
      requestRef.current = false;
    }
  };
  const cancelBuild = () => {
    requestRun.current++;
    requestRef.current = false;
    setBusy(false);
    setError("Plan generation cancelled. Your current plan is unchanged.");
  };
  const accept = async (program) => {
    if (requestRef.current) return;
    requestRef.current = true;
    setBusy(true);
    setGenerationStage("saving");
    await afterVisibleFrame();
    try {
      const next = persistProgramReplacement(state, program, {source:preview.source}, saveState);
      update(() => next, {planVersion:false,persistedState:next});
    } catch (error) {
      setError(error.message);setBusy(false);requestRef.current=false;return;
    }
    close();
    onPlanAccepted?.();
  };
  if (mode === 'scratch') return <ScratchPlan state={state} update={update} close={() => setMode('menu')} onPlanAccepted={() => {close();onPlanAccepted?.();}} />;
  if (preview)
    return (
      <main
        ref={sheetRef}
        className="sheet change-plan-sheet plan-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-plan-title"
      >
        <header className="long-form-sheet-header">
          <SheetDragHandle sheetRef={sheetRef} close={close} disabled={busy} />
          <span />
          <strong id="change-plan-title">Plan preview</strong>
          <button
            className="sheet-close"
            aria-label="Close"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        {error && <p className="offline-banner" role="alert">{error}</p>}
        <PlanEditor
          source={preview.program}
          profile={state.profile}
          generatedAcceptance
          exerciseState={state}
          onSave={accept}
          onCancel={() => setPreview(null)}
          saving={busy}
        />
        {busy && <BuildingOverlay stage={generationStage} />}
      </main>
    );
  return (
    <main
      ref={sheetRef}
      className="sheet change-plan-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-plan-title"
    >
      <header className="sheet-header-chrome">
        <SheetDragHandle sheetRef={sheetRef} close={close} disabled={busy} />
        <button className="sheet-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>
      {mode === "menu" ? (
        <>
          <Eyebrow>PROGRAM</Eyebrow>
          <h2 id="change-plan-title">Change plan</h2>
          <p>
            Your workout history stays saved when you replace the current
            program.
          </p>
          {blocked && (
            <p className="offline-banner">
              Finish your active workout before changing plans.
            </p>
          )}
          <button
            className="plan-choice"
            disabled={blocked}
            onClick={() => setMode("confirm-build")}
          >
            <span>
              <strong>Build a personalized plan</strong>
              <small>Use your current goals, schedule and equipment.</small>
            </span>
            <i>›</i>
          </button>
          <button
            className="plan-choice"
            disabled={blocked}
            onClick={() => setDetail("import-plan")}
          >
            <span>
              <strong>
                {imported ? "Import a different plan" : "Import from Notes"}
              </strong>
              <small>Replace the program with your existing plan.</small>
            </span>
            <i>›</i>
          </button>
          <button className="plan-choice" disabled={blocked} onClick={() => setMode('scratch')}>
            <span><strong>Start from scratch</strong><small>Create the workouts yourself, then review before replacing.</small></span><i>›</i>
          </button>
        </>
      ) : (
        <>
          <button
            className="sheet-back text-button"
            onClick={() => setMode("menu")}
          >
            ‹ Back
          </button>
          <Eyebrow>REPLACE PROGRAM</Eyebrow>
          <h2 id="change-plan-title">Build a new personalized plan?</h2>
          <p>
            This replaces your current program using the profile details already
            saved. Workout history will remain.
          </p>
          {error && <p className="offline-banner">{error}</p>}
          <Button disabled={busy} onClick={build}>
            {busy ? "BUILDING…" : error ? "TRY AGAIN" : "BUILD NEW PLAN"}
          </Button>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => setMode("menu")}
          >
            CANCEL
          </Button>
        </>
      )}
      {busy && (
        <BuildingOverlay stage={generationStage} onCancel={cancelBuild} />
      )}
    </main>
  );
}
function SettingSwitch({
  label,
  help,
  accessory,
  checked,
  onChange,
  disabled = false,
  className = "",
}) {
  const inputId = accessory ? `setting-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined;
  if (accessory) {
    return (
      <div
        className={`setting-switch setting-switch-with-accessory${disabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}
      >
        <label className="setting-switch-text" htmlFor={inputId}>
          {label}
        </label>
        {accessory}
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label
          className="setting-switch-toggle"
          htmlFor={inputId}
          aria-hidden="true"
        >
          <i />
        </label>
      </div>
    );
  }
  return (
    <label
      className={`setting-switch${disabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <span>
        {help ? (
          <>
            <strong>{label}</strong>
            <small>{help}</small>
          </>
        ) : (
          label
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function HelpPopover({ id, label, title, term, children, circleOnly=false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 260 });
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const pointerInside = useRef(true);
  const pointerCircle = useRef(null);
  const insideCircle = (point, box=triggerRef.current?.getBoundingClientRect()) => {
    return Boolean(box&&Math.hypot(point.clientX-box.left-box.width/2,point.clientY-box.top-box.height/2)<=Math.min(box.width,box.height)/2);
  };
  const beginCirclePress = point => {
    pointerCircle.current=triggerRef.current?.getBoundingClientRect();
    pointerInside.current=insideCircle(point,pointerCircle.current);
  };
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outsidePointer = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !contentRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      // The help is the topmost dismissible layer. Do not also dismiss its
      // parent sheet when this event reaches the window-level sheet handler.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outsidePointer);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outsidePointer);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const content = contentRef.current?.getBoundingClientRect();
      if (!trigger || !content) return;
      const viewport = window.visualViewport;
      const viewportLeft = 0;
      const viewportTop = 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const width = Math.min(280, viewportWidth - 24);
      const left = Math.min(
        viewportLeft + viewportWidth - width - 12,
        Math.max(viewportLeft + 12, trigger.left + trigger.width / 2 - width / 2),
      );
      const below = viewportTop + viewportHeight - trigger.bottom;
      const above = trigger.top - viewportTop;
      const opensAbove = below < content.height + 10 && above > below;
      const preferredTop = opensAbove
        ? trigger.top - content.height - 6
        : trigger.bottom + 6;
      const top = Math.min(
        viewportTop + viewportHeight - content.height - 12,
        Math.max(viewportTop + 12, preferredTop),
      );
      setPosition({ left, top, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`help-popover${term ? " help-popover-with-term" : ""}`}
    >
      {term && <span className="help-popover-term">{term}</span>}
      <button
        ref={triggerRef}
        type="button"
        className="help-popover-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onPointerDown={circleOnly?beginCirclePress:undefined}
        onTouchStart={circleOnly?event=>beginCirclePress(event.touches[0]):undefined}
        onPointerCancel={circleOnly?()=>{pointerInside.current=false;}:undefined}
        onClick={event => {
          // Expanded content can move between contact and its compatibility click.
          // Hit-test against the contact-time circle, not its new layout position.
          if(circleOnly&&event.detail!==0&&(!pointerInside.current||!insideCircle(event,pointerCircle.current)))return;
          setOpen(current=>!current);
        }}
      >
        <span className="help-popover-mark" aria-hidden="true" />
      </button>
      {open && createPortal(
        <span
          ref={contentRef}
          id={id}
          className="help-popover-content"
          role="tooltip"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
          }}
        >
          <strong>{title}</strong>
          <span>{children}</span>
        </span>,
        document.body,
      )}
    </span>
  );
}
function IncrementInput({ label, value, units, update }) {
  const shown = String(displayWeight(value, units));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1000) {
      setDraft(shown);
      return;
    }
    update(numeric);
  };
  return (
    <label className="increment-row">
      <span>{label}</span>
      <input
        aria-label={`${label} increment`}
        inputMode="decimal"
        type="number"
        min="0.1"
        max="1000"
        step="0.1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
function backupDisplayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function BackupSheet({ state, update, close, onBackupCreated }) {
  const [busy, setBusy] = useState(false);
  const [createdFile, setCreatedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [unavailablePhotoCount, setUnavailablePhotoCount] = useState(0);
  const photoCount = (state.workouts || []).filter((workout) => workout.photoId).length;
  const create = async (allowUnavailablePhotos = false) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setHandoffError("");
    if (!allowUnavailablePhotos) setUnavailablePhotoCount(0);
    try {
      const {
        backupFile,
        createBackup,
        requestPersistentStorage,
      } = await loadBackupTools();
      await requestPersistentStorage();
      const archive = await createBackup(state, { allowUnavailablePhotos });
      const file = backupFile(archive);
      setCreatedFile(file);
      setUnavailablePhotoCount(0);
      update((current) => {
        current.dataSafety = {
          ...(current.dataSafety || {}),
          lastBackupCreatedAt: archive.manifest.createdAt,
        };
        return current;
      });
      setMessage("");
      triggerHaptic("success");
    } catch (error) {
      const { backupUserMessage } = await loadBackupTools();
      setMessage(backupUserMessage(error, "backup"));
      setUnavailablePhotoCount(error?.unavailablePhotos?.length || 0);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy || !createdFile) return;
    setBusy(true);
    setHandoffError("");
    setMessage("");
    try {
      const { presentBackupFile } = await loadBackupTools();
      const result = await presentBackupFile(createdFile);
      if (result === "cancelled") return;
      setMessage(result === "shared" ? "Share sheet opened. Check your chosen destination for the file." : "Download started. Check your browser’s downloads and save the file outside ROOK.");
      onBackupCreated?.();
    } catch (error) {
      if (error?.name !== "AbortError")
        setHandoffError("Could not start saving your backup. The prepared file is still available. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="screen detail-screen data-backup-screen">
      <SheetHeader title="Back up ROOK" onClose={close} />
      <Eyebrow>BACK UP ROOK</Eyebrow>
      <h1>Keep a recovery copy of your training.</h1>
      <p>
        Your backup is created on this device. ROOK does not upload it.
      </p>
      <section className="backup-includes" aria-label="Backup contents">
        <Eyebrow>INCLUDES</Eyebrow>
        <ul>
          <li>Training plan and workout history</li>
          <li>Set logs, progression and notes</li>
          <li>Profile, preferences and settings</li>
          <li>{photoCount ? `${photoCount} private workout ${photoCount === 1 ? "photo" : "photos"}` : "Workout photos"}</li>
        </ul>
      </section>
      <p className="backup-photo-privacy">
        Your backup file may contain copies of your private workout photos.
      </p>
      {state.dataSafety?.lastBackupCreatedAt && (
        <p className="backup-last-created">
          Prepared {backupDisplayDate(state.dataSafety.lastBackupCreatedAt)}
        </p>
      )}
      {createdFile && <p className="backup-status" role="status">Backup ready to save. Save the file outside ROOK to keep a recovery copy.</p>}
      {!createdFile && state.dataSafety?.lastBackupCreatedAt && <p className="backup-status">Preparation does not confirm a saved copy. Create a new backup to save it from this sheet.</p>}
      {message && <p className="backup-status" role="status">{message}</p>}
      {createdFile && <>
        {handoffError && <p id="backup-handoff-error" className="backup-status is-error" role="alert">{handoffError}</p>}
        <Button disabled={busy} aria-describedby={handoffError ? "backup-handoff-error" : undefined} onClick={save}>
          {busy ? "PLEASE WAIT…" : handoffError ? "TRY AGAIN" : "SAVE BACKUP"}
        </Button>
      </>}
      <Button variant={createdFile ? "secondary" : "primary"} disabled={busy} onClick={() => create(false)}>
        {busy ? (createdFile ? "PLEASE WAIT…" : "CREATING BACKUP…") : createdFile ? "CREATE A NEW BACKUP" : "CREATE BACKUP"}
      </Button>
      {unavailablePhotoCount > 0 && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => create(true)}
        >
          {`CREATE WITHOUT ${unavailablePhotoCount} UNAVAILABLE ${unavailablePhotoCount === 1 ? "PHOTO" : "PHOTOS"}`}
        </Button>
      )}
    </main>
  );
}

function RestoreBackupSheet({ state, update, close, onRestored }) {
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const choose = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      const { parseBackupArchive } = await loadBackupTools();
      setPrepared(await parseBackupArchive(file));
    } catch (reason) {
      const { backupUserMessage } = await loadBackupTools();
      setError(backupUserMessage(reason, "restore"));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!prepared || busy) return;
    setBusy(true);
    setError("");
    try {
      const { commitPreparedRestore } = await loadBackupTools();
      const restoredState = await commitPreparedRestore(prepared, { currentState: state });
      update(() => restoredState);
      if (onRestored) {
        onRestored(restoredState);
        triggerHaptic("success");
        return;
      }
      setRestored(true);
      setPrepared(null);
      triggerHaptic("success");
    } catch (reason) {
      const { backupUserMessage } = await loadBackupTools();
      setError(backupUserMessage(reason, "restore"));
    } finally {
      setBusy(false);
    }
  };
  if (restored)
    return (
      <main className="screen detail-screen data-backup-screen restore-success-screen">
        <SheetHeader title="Restore backup" onClose={close} />
        <div className="complete-mark" aria-hidden="true">✓</div>
        <Eyebrow>RESTORE COMPLETE</Eyebrow>
        <h1>ROOK has been restored.</h1>
        <p>Your plan, history, settings, notes and workout photos are ready.</p>
        <Button onClick={close}>DONE</Button>
      </main>
    );
  return (
    <main className="screen detail-screen data-backup-screen restore-backup-screen">
      <SheetHeader title="Restore backup" onClose={close} />
      <Eyebrow>{prepared ? "REVIEW BACKUP" : "RESTORE BACKUP"}</Eyebrow>
      {prepared ? (
        <>
          <h1>ROOK backup</h1>
          <p>Created {backupDisplayDate(prepared.manifest.createdAt)}</p>
          <dl className="restore-summary">
            <div><dt>Plan</dt><dd>{prepared.state.program?.name || "No active plan"}</dd></div>
            <div><dt>Workouts</dt><dd>{prepared.manifest.counts.workouts}</dd></div>
            <div><dt>Workout photos</dt><dd>{prepared.manifest.counts.workoutPhotos}</dd></div>
            {prepared.manifest.omittedPhotos?.length > 0 && (
              <div><dt>Unavailable photos</dt><dd>{prepared.manifest.omittedPhotos.length}</dd></div>
            )}
            <div><dt>Settings</dt><dd>Included</dd></div>
          </dl>
          <p className="restore-replace-warning">
            This backup will replace the ROOK data currently stored on this device.
          </p>
          {error && <p className="backup-status is-error" role="alert">{error}</p>}
          <Button disabled={busy} onClick={restore}>
            {busy ? "RESTORING…" : "RESTORE & REPLACE"}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => setPrepared(null)}>CANCEL</Button>
        </>
      ) : (
        <>
          <h1>Restore ROOK from a backup file.</h1>
          <p>
            ROOK validates the complete backup before changing anything on this device.
          </p>
          <p className="restore-replace-warning">
            Restoring replaces your current local ROOK data. It does not merge workouts.
          </p>
          {error && <p className="backup-status is-error" role="alert">{error}</p>}
          <label className={`button primary backup-file-picker${busy ? " is-disabled" : ""}`}>
            <span>{busy ? "CHECKING BACKUP…" : "CHOOSE BACKUP"}</span>
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label="Choose ROOK backup file"
              disabled={busy}
              onChange={choose}
            />
          </label>
        </>
      )}
    </main>
  );
}

function LogoutConfirmSheet({ close, backUpFirst, logOut }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const removeLocalData = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await clearWorkoutPhotos();
      logOut();
    } catch {
      setError("ROOK couldn’t remove all local data. Nothing else was deleted. Try again.");
      setBusy(false);
    }
  };
  return (
    <main
      className="sheet logout-confirm-sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-body"
    >
      <SheetHeader title="Delete local data" onClose={close} />
      <Eyebrow>LOCAL DATA</Eyebrow>
      <h2 id="logout-confirm-title">Delete local data?</h2>
      <p id="logout-confirm-body">
        This permanently removes your ROOK data from this device, including workout
        history and photos. Save a backup first if you want to restore it later.
      </p>
      {error && <p className="backup-status is-error" role="alert">{error}</p>}
      <div className="logout-confirm-actions">
        <Button disabled={busy} onClick={backUpFirst}>BACK UP FIRST</Button>
        <Button disabled={busy} variant="danger" className="logout-delete-action" onClick={removeLocalData}>
          {busy ? "DELETING…" : "DELETE LOCAL DATA"}
        </Button>
        <Button disabled={busy} variant="quiet" onClick={close}>CANCEL</Button>
      </div>
    </main>
  );
}

function gymEquipmentSummary(equipment = []) {
  const normalized = normalizeGymEquipment(equipment);
  if (normalized.includes("full gym")) return "Full gym";
  return normalized.map((item) => EQUIPMENT_LABELS[item] || titleCase(item)).join(", ");
}

function knownProgramEquipmentConflicts(state, equipment) {
  const effectiveProfile = {
    ...equipmentProfile(state.profile, equipment),
    avoid: "",
    ignoreTrainingSafety: true,
  };
  return (state.program?.days || []).reduce(
    (count, day) =>
      count +
      (day.exercises || []).filter((exercise) => {
        const catalog = exerciseCatalog[exercise.exerciseId];
        return catalog ? !isExerciseAllowed(catalog, effectiveProfile) : false;
      }).length,
    0,
  );
}

function plateValue(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function gymSupportsBarbell(equipment = []) {
  return equipment.includes("full gym") || equipment.includes("barbell/rack/bench");
}

function PlateSetupFields({ setup, onChange }) {
  const [customBarWeight, setCustomBarWeight] = useState("");
  const updateBar = (index, field, value) =>
    onChange({
      ...setup,
      bars: setup.bars.map((bar, barIndex) =>
        barIndex === index ? { ...bar, [field]: value } : bar,
      ),
    });
  const updatePlate = (index, field, value) =>
    onChange({
      ...setup,
      plates: setup.plates.map((plate, plateIndex) =>
        plateIndex === index ? { ...plate, [field]: value } : plate,
      ),
    });
  const addBar = () => {
    const weight = Number(customBarWeight);
    if (!(weight > 0)) return;
    const id = `bar-custom-${Date.now().toString(36)}`;
    onChange({
      ...setup,
      selectedBarId: id,
      bars: [
        ...setup.bars,
        { id, name: `${plateValue(weight)} ${setup.unit} bar`, weight },
      ],
    });
    setCustomBarWeight("");
  };
  return (
    <>
      <section className="plate-config-section">
        <div className="onboarding-group-heading">
          <strong>Plate unit</strong>
          <small>Match the plates at this gym</small>
        </div>
        <div className="segmented plate-unit-segmented" aria-label="Plate units">
          {["kg", "lb"].map((unit) => (
            <button
              key={unit}
              className={setup.unit === unit ? "active" : ""}
              aria-pressed={setup.unit === unit}
              onClick={() => {
                if (setup.unit !== unit) onChange(defaultPlateSetup(unit));
              }}
            >
              {unit}
            </button>
          ))}
        </div>
      </section>
      <section className="plate-config-section">
        <div className="onboarding-group-heading">
          <strong>Bars</strong>
          <small>Select the bar you are using</small>
        </div>
        <div className="plate-bar-list" role="radiogroup" aria-label="Available bars">
          {setup.bars.map((bar, index) => (
            <div className="plate-config-row" key={bar.id}>
              <button
                className={setup.selectedBarId === bar.id ? "is-selected" : ""}
                role="radio"
                aria-checked={setup.selectedBarId === bar.id}
                onClick={() => onChange({ ...setup, selectedBarId: bar.id })}
              >
                <span><strong>{bar.name}</strong><small>{plateValue(bar.weight)} {setup.unit}</small></span>
                <i aria-hidden="true">{setup.selectedBarId === bar.id ? "✓" : ""}</i>
              </button>
              {setup.bars.length > 1 && (
                <button
                  className="plate-row-remove"
                  aria-label={`Remove ${bar.name}`}
                  onClick={() => {
                    const bars = setup.bars.filter((_, barIndex) => barIndex !== index);
                    onChange({
                      ...setup,
                      bars,
                      selectedBarId: setup.selectedBarId === bar.id ? bars[0].id : setup.selectedBarId,
                    });
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="plate-add-row">
          <label>
            <span>Custom bar</span>
            <input
              type="number"
              min="1"
              max="200"
              step="0.5"
              inputMode="decimal"
              value={customBarWeight}
              placeholder={`Weight in ${setup.unit}`}
              onChange={(event) => setCustomBarWeight(event.target.value)}
            />
          </label>
          <button disabled={!(Number(customBarWeight) > 0)} onClick={addBar}>ADD</button>
        </div>
      </section>
      <section className="plate-config-section">
        <div className="onboarding-group-heading">
          <strong>Plate inventory</strong>
          <small>Pairs available at this gym</small>
        </div>
        <div className="plate-inventory-labels" aria-hidden="true"><span>PLATE</span><span>PAIRS</span><span /></div>
        <div className="plate-inventory-list">
          {setup.plates.map((plate, index) => (
            <div className="plate-inventory-row" key={`${index}-${plate.size}`}>
              <label>
                <span className="visually-hidden">Plate size {index + 1}</span>
                <input
                  type="number"
                  min="0.01"
                  max="200"
                  step="0.25"
                  inputMode="decimal"
                  value={plate.size}
                  onChange={(event) => updatePlate(index, "size", event.target.value)}
                />
                <small>{setup.unit}</small>
              </label>
              <input
                aria-label={`Pairs of ${plate.size} ${setup.unit} plates`}
                type="number"
                min="1"
                max="20"
                step="1"
                inputMode="numeric"
                value={plate.pairs}
                onChange={(event) => updatePlate(index, "pairs", event.target.value)}
              />
              <button
                aria-label={`Remove ${plate.size} ${setup.unit} plate`}
                onClick={() => onChange({ ...setup, plates: setup.plates.filter((_, plateIndex) => plateIndex !== index) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-button plate-add-size"
          onClick={() => onChange({ ...setup, plates: [...setup.plates, { size: "", pairs: 1 }] })}
        >
          + Add plate size
        </button>
      </section>
    </>
  );
}

function PlateSetupScreen({ gym, state, update, onBack, close }) {
  const [draft, setDraft] = useState(() =>
    normalizePlateSetup(gym.plateSetup, state.profile.units),
  );
  const save = () => {
    update((current) => {
      const target = current.gymProfiles.find((item) => item.id === gym.id);
      if (target) {
        target.plateSetup = normalizePlateSetup(draft, draft.unit);
        target.updatedAt = new Date().toISOString();
      }
      return current;
    });
    onBack();
  };
  return (
    <main className="screen detail-screen plate-setup-screen">
      <SheetHeader title="Plate setup" onClose={close} onBack={onBack} />
      <Eyebrow>{gym.name}</Eyebrow>
      <h1>Bars and plates</h1>
      <p>Used only for plate calculations at this gym.</p>
      <PlateSetupFields setup={draft} onChange={setDraft} />
      <SheetActionFooter><Button onClick={save}>SAVE PLATE SETUP</Button></SheetActionFooter>
    </main>
  );
}

function PlateCalculatorSheet({ request, state, update, close }) {
  const [configuring, setConfiguring] = useState(false);
  const gymContext = effectiveGymContext(state, state.activeWorkout);
  const gym = state.gymProfiles.find((item) => item.id === gymContext.id) || null;
  const setup = normalizePlateSetup(gym?.plateSetup, state.profile.units);
  const [draft, setDraft] = useState(setup);
  if (configuring) {
    const save = () => {
      update((current) => {
        const target = current.gymProfiles.find((item) => item.id === gym?.id);
        if (target) {
          target.plateSetup = normalizePlateSetup(draft, draft.unit);
          target.updatedAt = new Date().toISOString();
        }
        return current;
      });
      setConfiguring(false);
    };
    return (
      <main className="screen detail-screen plate-setup-screen">
        <SheetHeader title="Plate setup" onClose={close} onBack={() => setConfiguring(false)} />
        <Eyebrow>{gym?.name || "CURRENT GYM"}</Eyebrow>
        <h1>Bars and plates</h1>
        <p>Changes apply to plate calculations at this gym.</p>
        <PlateSetupFields setup={draft} onChange={setDraft} />
        <SheetActionFooter><Button onClick={save}>SAVE PLATE SETUP</Button></SheetActionFooter>
      </main>
    );
  }
  const bar = selectedPlateBar(setup);
  const target = kgToPlateUnit(request.targetKg, setup.unit);
  const result = calculatePlateLoad({ target, barWeight: bar.weight, plates: setup.plates });
  const exact = result.exact;
  const applyAlternative = (option) => {
    request.onSelect?.(plateUnitToKg(option.total, setup.unit));
    close();
  };
  const combination = (option) => (
    <div className="plate-combination" aria-label={`${plateValue(option.perSide)} ${setup.unit} per side`}>
      {option.plates.length ? option.plates.map((plate) => (
        <span key={plate.size}>
          <strong>{plateValue(plate.size)}</strong>
          {plate.count > 1 && <small>× {plate.count}</small>}
        </span>
      )) : <em>Empty bar</em>}
    </div>
  );
  return (
    <main className="sheet plate-calculator-sheet" role="dialog" aria-modal="true" aria-labelledby="plate-calculator-title">
      <button className="sheet-close" aria-label="Close" onClick={close}>×</button>
      <Eyebrow>PLATE CALCULATOR</Eyebrow>
      <h2 id="plate-calculator-title">{plateValue(target)} {setup.unit}</h2>
      <p className="plate-gym-context">{gym?.name || "Current gym"}</p>
      {exact ? (
        <section className="plate-result" aria-label="Exact plate combination">
          <Eyebrow>PER SIDE</Eyebrow>
          {combination(exact)}
          <p className="plate-bar-summary">Bar: {plateValue(bar.weight)} {setup.unit}</p>
        </section>
      ) : (
        <>
          <p className="plate-unavailable-note" role="status">
            {result.status === "below-bar"
              ? `The target is lighter than the selected ${plateValue(bar.weight)} ${setup.unit} bar.`
              : "This target cannot be loaded exactly with the saved plate inventory."}
          </p>
          <section className="plate-nearest" aria-label="Nearest achievable loads">
            <Eyebrow>CLOSEST AVAILABLE</Eyebrow>
            {[result.lower, result.upper].filter(Boolean).map((option) => (
              <button key={option.total} onClick={() => applyAlternative(option)}>
                <span><strong>{plateValue(option.total)} {setup.unit}</strong><small>Use for this set</small></span>
                <i aria-hidden="true">›</i>
              </button>
            ))}
            {!result.lower && !result.upper && <p>No load is possible with this setup.</p>}
          </section>
          <p className="plate-target-preserved">Your logged target stays unchanged until you choose an alternative.</p>
        </>
      )}
      <button className="text-button plate-config-entry" onClick={() => { setDraft(setup); setConfiguring(true); }}>
        Configure bars and plates
      </button>
    </main>
  );
}

const planVersionDate = (value, long = false) =>
  new Intl.DateTimeFormat("en", long
    ? { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(new Date(value));
const planVersionTime = (value) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const planVersionDayKey = (value) =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

function planDiffLabel(change) {
  const exercise = change.exerciseId ? exerciseName({ exerciseId: change.exerciseId }) : null;
  const fromExercise = change.fromExerciseId ? exerciseName({ exerciseId: change.fromExerciseId }) : null;
  if (change.kind === "exercise-added") return `Added ${exercise}`;
  if (change.kind === "exercise-removed") return `Removed ${exercise}`;
  if (change.kind === "exercise-replaced") return `${fromExercise} → ${exercise}`;
  if (["sets", "reps", "rir"].includes(change.kind)) return `${exercise} · ${change.title}`;
  return change.title;
}

function TrainingBlockScreen({ state, update, close }) {
  const screenRef = useRef(null);
  const block = currentTrainingBlock(state);
  const [view, setView] = useState("overview");
  const [name, setName] = useState(block?.name || "Training block");
  const [totalWeeks, setTotalWeeks] = useState(block?.totalWeeks || 6);
  const [includeDeload, setIncludeDeload] = useState(block?.plannedDeloadWeek != null);
  const [archivedId, setArchivedId] = useState(null);
  useLayoutEffect(() => {
    const reset = () => {
      if (screenRef.current) screenRef.current.scrollTop = 0;
    };
    reset();
    const frame = requestAnimationFrame(reset);
    const timer = setTimeout(reset, 0);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [view, block?.id]);
  if (!block) return null;
  if (view === "review" || view === "history") return <BlockReviewSheet state={state} update={update} close={close} Header={SheetHeader} blockId={view === "history" ? archivedId : undefined} onBack={()=>setView('overview')}/>;
  const currentWeek = currentTrainingBlockWeek(state);
  const completedWeeks = block.completed ? block.totalWeeks : Math.max(0, block.currentWeek - 1);
  const dateLabel = (value) =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(`${String(value).slice(0, 10)}T12:00:00`),
    );
  const save = () => {
    update((current) => {
      current.program.trainingBlock = reconfigureTrainingBlock(current.program, {
        name,
        totalWeeks,
        includeDeload,
        plannedDeloadWeek: includeDeload ? totalWeeks : null,
      });
      current.program.version = Number(current.program.version || 1) + 1;
      current.program.updatedAt = new Date().toISOString();
      return current;
    }, {
      planVersion: {
        source: "Manual edit",
        reason: "Training block edited",
        summary: `Updated ${name || "training block"}`,
      },
    });
    setView("overview");
    triggerHaptic("success");
  };
  const weekRows = (sourceBlock) => (
    <section className="training-block-weeks" aria-label="Program weeks">
      {(sourceBlock.weeks || []).map((week) => {
        const status = sourceBlock.completed || week.weekNumber < sourceBlock.currentWeek
          ? "complete"
          : week.weekNumber === sourceBlock.currentWeek
            ? "current"
            : "upcoming";
        return (
          <article className={`training-block-week is-${status}${week.phase === "deload" ? " is-deload" : ""}`} key={week.id}>
            <span><small>WEEK</small><strong>{week.weekNumber}</strong></span>
            <div>
              <strong>{week.label}</strong>
              <small>{week.reason}</small>
            </div>
            <i>{status === "complete" ? "✓" : status === "current" ? "NOW" : ""}</i>
          </article>
        );
      })}
    </section>
  );
  if (view === "edit")
    return (
      <main ref={screenRef} key="training-block-edit" className="screen detail-screen training-block-screen training-block-edit">
        <SheetHeader title="Edit training block" onBack={() => setView("overview")} onClose={close} />
        <Eyebrow>PERMANENT PLAN</Eyebrow>
        <h1>Edit block</h1>
        <p>Keep progression simple. Editing the block updates the permanent plan and saves a Plan History version.</p>
        <label className="training-block-name">
          <span>Block name</span>
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <section className="training-block-field">
          <Eyebrow>BLOCK LENGTH</Eyebrow>
          <div className="training-block-length">
            {[4, 6].map((weeks) => (
              <button className={totalWeeks === weeks ? "is-selected" : ""} aria-pressed={totalWeeks === weeks} key={weeks} onClick={() => setTotalWeeks(weeks)}>
                {weeks} weeks
              </button>
            ))}
          </div>
        </section>
        <button className={`training-block-deload${includeDeload ? " is-selected" : ""}`} aria-pressed={includeDeload} onClick={() => setIncludeDeload((value) => !value)}>
          <span><strong>Planned deload</strong><small>Use the final week for lower volume and more reps in reserve.</small></span>
          <i aria-hidden="true">{includeDeload ? "✓" : ""}</i>
        </button>
        {state.activeWorkout && <p className="training-block-warning">Finish the active workout before changing its permanent block.</p>}
        <SheetActionFooter><Button disabled={Boolean(state.activeWorkout) || !name.trim()} onClick={save}>SAVE BLOCK</Button></SheetActionFooter>
      </main>
    );
  return (
    <main ref={screenRef} key="training-block-overview" className="screen detail-screen training-block-screen">
      <SheetHeader title="Training block" onClose={close} />
      <Eyebrow>{block.completed ? "BLOCK COMPLETE" : "CURRENT BLOCK"}</Eyebrow>
      <h1>{block.name}</h1>
      <p className="training-block-progress">
        {block.completed ? `${block.totalWeeks} weeks completed` : `Week ${block.currentWeek} of ${block.totalWeeks} · ${currentWeek?.label || "Current targets"}`}
      </p>
      <dl className="training-block-summary">
        <div><dt>Started</dt><dd>{dateLabel(block.startDate)}</dd></div>
        <div><dt>Weeks complete</dt><dd>{completedWeeks} of {block.totalWeeks} weeks</dd></div>
        <div><dt>Deload</dt><dd>{block.plannedDeloadWeek ? `Week ${block.plannedDeloadWeek}` : "None"}</dd></div>
        <div><dt>Workouts</dt><dd>{state.program.days.length} per week</dd></div>
      </dl>
      {weekRows(block)}
      <section className="training-block-workouts">
        <Eyebrow>WEEKLY WORKOUTS</Eyebrow>
        <p>{state.program.days.map((day) => day.name || day.weekday).join(" · ")}</p>
      </section>
      {state.completedTrainingBlocks?.length > 0 && (
        <section className="training-block-history-count"><p>{pluralize(state.completedTrainingBlocks.length, "completed block")} saved locally.</p>{state.completedTrainingBlocks.filter(item=>item.id!==block.id).slice().reverse().map(item=><button className="list-row" key={item.id} onClick={()=>{setArchivedId(item.id);setView('history');}}><span>{item.name}<small>{item.completedAt?.slice(0,10)}</small></span><span aria-hidden="true">›</span></button>)}</section>
      )}
      {block.completed ? (
        <div className="training-block-complete-actions">
          <Button onClick={(event) => { event.currentTarget.blur(); setView('review'); }}>REVIEW BLOCK</Button>
        </div>
      ) : (
        <>
        <Button variant="secondary" disabled={Boolean(state.activeWorkout)} aria-describedby={state.activeWorkout ? "training-block-edit-lock" : undefined} onClick={(event) => { event.currentTarget.blur(); setView("edit"); }}>
          EDIT BLOCK
        </Button>
        {state.activeWorkout && <p id="training-block-edit-lock" className="sheet-footnote training-block-edit-lock">Finish or discard your active workout to edit this block.</p>}
        </>
      )}
    </main>
  );
}

function PlanHistoryScreen({ state, update, close }) {
  const screenRef = useRef(null);
  const versions = [...(state.planVersions || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const versionDayCounts = versions.reduce((counts, version) => {
    const key = planVersionDayKey(version.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const [selectedId, setSelectedId] = useState(null);
  const [expandedVersionGroups, setExpandedVersionGroups] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [restored, setRestored] = useState(false);
  const backToVersions = () => { setSelectedId(null); setConfirming(false); };
  useSheetBack(screenRef, selectedId || 'list', selectedId ? 'list' : null, backToVersions, !confirming);
  const selected = versions.find((item) => item.id === selectedId) || null;
  const chronological = [...versions].reverse();
  const parent = selected?.parentVersionId
    ? chronological.find((item) => item.id === selected.parentVersionId)
    : null;
  const changes = selected ? diffPlanPrograms(parent?.program || null, selected.program) : [];
  const latestId = versions[0]?.id || null;
  const impact = selected ? planRestoreImpact(state, selected.id) : null;
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (screen) screen.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      if (screenRef.current) screenRef.current.scrollTop = 0;
    });
    const timer = setTimeout(() => {
      if (screenRef.current) screenRef.current.scrollTop = 0;
    }, 0);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [selectedId]);
  const restore = () => {
    if (!selected) return;
    const targetId = selected.id;
    const targetDate = planVersionDate(selected.timestamp);
    update((current) => {
      const result = restorePlanVersion(current, targetId);
      return result.status === "restored" ? result.state : current;
    }, {
      planVersion: {
        source: "Restored version",
        reason: `Restored ${targetDate} version`,
        summary: `Restored ${selected.summary}`,
      },
    });
    setConfirming(false);
    setSelectedId(null);
    setRestored(true);
    triggerHaptic("success");
  };
  if (selected)
    return (
      <main ref={screenRef} key="plan-version-detail" className="screen detail-screen plan-history-screen plan-version-detail">
        <SheetHeader title="Plan version" onBack={backToVersions} onClose={close} />
        <Eyebrow>{selected.source}</Eyebrow>
        <h1>{selected.summary}</h1>
        <p className="plan-version-timestamp">{planVersionDate(selected.timestamp, true)}</p>
        {selected.reason && <p className="plan-version-reason">{selected.reason}</p>}
        <section className="plan-version-changes" aria-label="Changes in this version">
          <Eyebrow>WHAT CHANGED</Eyebrow>
          {changes.length ? changes.map((change, index) => (
            <div className={`plan-diff-row is-${change.kind}`} key={`${change.kind}-${change.workoutId || "plan"}-${change.exerciseId || index}`}>
              <span aria-hidden="true" />
              <div><strong>{planDiffLabel(change)}</strong><small>{change.detail}</small></div>
            </div>
          )) : <p className="plan-history-empty-copy">No structural differences are available for this imported version.</p>}
        </section>
        {!confirming ? (
          <Button
            variant={selected.id === latestId ? "secondary" : "primary"}
            disabled={selected.id === latestId}
            onClick={() => setConfirming(true)}
          >
            {selected.id === latestId ? "CURRENT VERSION" : "RESTORE THIS VERSION"}
          </Button>
        ) : (
          <section className="plan-restore-confirm" role="alert">
            <Eyebrow>RESTORE PLAN</Eyebrow>
            <h2>Restore this version?</h2>
            <p>Your current permanent plan will be replaced. Workout History and completed workouts stay unchanged.</p>
            {impact?.activeWorkoutPreserved && <p>Your active workout will continue unchanged as its own snapshot.</p>}
            {impact?.flexibleWeekNeedsReview > 0 && <p>Your temporary schedule will need review against this restored plan. Completed and active workouts remain fixed.</p>}
            {impact?.todayAdjustmentRemoved && <p>Today’s unstarted adjustment will be removed because it belongs to the current plan.</p>}
            {Boolean(impact?.flexibleWeekReferencesRemoved || impact?.occurrenceReferencesRemoved) && (
              <p>Temporary schedule references that do not exist in this version will be cleared.</p>
            )}
            <div><Button variant="quiet" onClick={() => setConfirming(false)}>CANCEL</Button><Button onClick={restore}>RESTORE VERSION</Button></div>
          </section>
        )}
      </main>
    );
  return (
    <main ref={screenRef} key="plan-history-list" className="screen detail-screen plan-history-screen">
      <SheetHeader title="Plan history" onClose={close} />
      <Eyebrow>PERMANENT PLAN</Eyebrow>
      <h1>Plan versions</h1>
      <p>Review meaningful changes to your recurring training plan. Workout History is separate.</p>
      {restored && <p className="plan-history-restored" role="status">Previous version restored. A new current version was saved.</p>}
      {versions.length ? (
        <section className="plan-history-list" aria-label="Plan versions">
          {groupPlanVersions(versions).map(group => {
            const rows = group.versions.map(version => (
            <button className="plan-history-version" key={version.id} onClick={(event) => {
              event.currentTarget.blur();
              setSelectedId(version.id);
              setRestored(false);
            }}>
              <time dateTime={version.timestamp}>
                <span>{planVersionDate(version.timestamp)}</span>
                {versionDayCounts.get(planVersionDayKey(version.timestamp)) > 1 && <small>{planVersionTime(version.timestamp)}</small>}
              </time>
              <span><strong>{version.summary}</strong><small>{version.source}{version.id === latestId ? " · Current" : ""}</small></span>
              <i aria-hidden="true">›</i>
            </button>
            ));
            if (group.versions.length === 1) return rows;
            const open = !!expandedVersionGroups[group.id];
            return <div key={group.id} className="plan-history-group">
              <button className="plan-history-version" aria-expanded={open} aria-controls={`versions-${group.id}`}
                onClick={() => setExpandedVersionGroups(current => ({ ...current, [group.id]: !open }))}>
                <time dateTime={group.versions[0].timestamp}>{planVersionDate(group.versions[0].timestamp)}</time>
                <span><strong>{group.versions.length} training-target refinements</strong>
                  <small>{open ? 'Collapse' : 'Expand'} · Every version remains available</small></span>
                <i aria-hidden="true">{open ? '⌃' : '⌄'}</i>
              </button>
              <Disclosure open={open} id={`versions-${group.id}`}>{rows}</Disclosure>
            </div>;
          })}
        </section>
      ) : (
        <section className="plan-history-empty" role="status">
          <strong>No plan versions yet</strong>
          <p>Your first permanent plan will appear here.</p>
        </section>
      )}
      <small className="plan-history-retention">ROOK keeps the initial plan and the 40 most recent meaningful versions on this device.</small>
    </main>
  );
}

export function HistoricalWorkoutImportScreen({ state, update, close }) {
  const liveImportState = useRef(state);
  liveImportState.current = state;
  const [source, setSource] = useState(null);
  const [fileSetup, setFileSetup] = useState(null);
  const [fileSettings, setFileSettings] = useState([]);
  const [fileIndex, setFileIndex] = useState(0);
  const fileOptions = fileSettings[fileIndex]?.options || {};
  const sheetIndex = fileSettings[fileIndex]?.sheetIndex || 0;
  const currentFile = fileSetup?.files[fileIndex];
  const setFileOptions = options => setFileSettings(current => current.map((item,i)=>i===fileIndex?{...item,options}:item));
  const [dateOnlyGroupingConfirmed, setDateOnlyGroupingConfirmed] = useState(false);
  const [keepExistingMeasurements, setKeepExistingMeasurements] = useState(false);
  const [busy, setBusy] = useState(false);
  const clientRef = useRef(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const [importProgress,setImportProgress]=useState('Reading selected files');
  const importStarted=useRef(0);
  const [importMetrics,setImportMetrics]=useState(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clientRef.current?.close(); clientRef.current = null; }; }, []);
  const replaceImportJob = () => {
    clientRef.current?.close();clientRef.current=createHistoryImportClient();
    return clientRef.current;
  };
  const request = async (type, payload, job=clientRef.current ||= createHistoryImportClient()) => {
    const cancelled=()=>new DOMException('Import cancelled.','AbortError');
    if(job!==clientRef.current||!alive.current)throw cancelled();
    try{
      const result=await job.request(type,payload,progress=>{if(job===clientRef.current&&alive.current)setImportProgress(progress.stage);});
      if(job!==clientRef.current||!alive.current)throw cancelled();
      return result;
    }catch(error){if(job!==clientRef.current||!alive.current)throw cancelled();throw error;}
  };
  const [step, setStep] = useState("source");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [mappingName, setMappingName] = useState(null);
  const [mappingQueue, setMappingQueue] = useState([]);
  const mappingScreenRef = useRef(null);
  const [query, setQuery] = useState("");
  const [ambiguousAction, setAmbiguousAction] = useState(null);
  const [showInvalid, setShowInvalid] = useState(false);
  const fileRef = useRef(null);
  const choices = useMemo(() => mappingName ? historicalExerciseChoices(state, query) : [], [state.customExercises, query, mappingName]);
  const mapping = preview?.exerciseMappings.find((item) => item.sourceKey === mappingName) || null;
  const mappingRow = item => <div className={`history-import-mapping-row${item.match?.requiresReview&&!item.exerciseId ? ' needs-review' : ''}`} key={item.sourceKey}>
    <span><strong>{item.sourceName}</strong><small>{item.ignored ? 'Ignored' : item.exerciseId?.startsWith('custom-') ? 'Kept as a separate imported exercise' : item.exerciseId ? historicalExerciseLabel(state, item.exerciseId) : item.match?.tier === 'B' ? `Suggested: ${historicalExerciseLabel(state, item.match.suggestedExerciseId)}` : 'Saved mapping needs attention'}</small></span>
    <button disabled={busy} onClick={() => openMapping(item)}>{item.exerciseId || item.ignored ? 'CHANGE' : 'REVIEW'}</button>
    {item.matchStatus === 'manual' && <label className="remember-import-match"><input type="checkbox" checked={item.rememberMatch} onChange={() => toggleRemember(item)} /><span><strong>Remember this match</strong><small>Use it automatically in future imports.</small></span></label>}
  </div>;
  const openMapping = (item, currentPreview=preview) => {
    const unresolved = currentPreview.exerciseMappings.filter(entry => entry.matchStatus==='custom-auto' && !entry.ignored&&!entry.optionalReviewed).map(entry => entry.sourceKey);
    const index = unresolved.indexOf(item.sourceKey);
    setMappingQueue(index < 0 ? [item.sourceKey] : [...unresolved.slice(index), ...unresolved.slice(0, index)]);
    setMappingName(item.sourceKey); setQuery('');
  };
  useLayoutEffect(() => {
    if (!mappingName) return;
    mappingScreenRef.current?.scrollTo(0, 0);
    mappingScreenRef.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [mappingName]);
  const selectSource = (value) => { setSource(value); setStep("file"); setError(""); };
  const cancelImport = () => {
    clientRef.current?.close();clientRef.current=null;
    operation.current=false;setBusy(false);setFileSetup(null);setPreview(null);setMappingName(null);setError('');setStep('file');
  };
  const reviewMatches = async () => {
    if(operation.current)return;operation.current=true;setBusy(true);setError('');
    try{
      const next=await request('matches',{state});setPreview(next);
      const first=next.exerciseMappings.find(m=>m.matchStatus==='custom-auto'&&!m.ignored&&!m.optionalReviewed);
      if(first)openMapping(first,next);
    }catch(reason){if(reason.name!=='AbortError'&&alive.current)setError(reason.message);}
    finally{operation.current=false;if(alive.current)setBusy(false);}
  };
  useLayoutEffect(()=>{
    if(step!=='review'||!preview||!importStarted.current)return;
    setImportMetrics(current=>({...current,...preview.timing,visiblePreviewMs:performance.now()-importStarted.current}));
    importStarted.current=0;
  },[step,preview]);
  const chooseFile = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const job=replaceImportJob();importStarted.current=performance.now();setImportMetrics(null);setImportProgress('Reading selected files');
    setFileSetup(null);setPreview(null);
    setDateOnlyGroupingConfirmed(false);
    setKeepExistingMeasurements(false);
    setError(""); setStep("parsing");
    await afterVisibleFrame();
    try {
      if(files.length>10||files.reduce((n,file)=>n+file.size,0)>25*1024*1024)throw new Error('Choose up to 10 files, no more than 25 MB combined.');
      const started=performance.now();
      const buffers=await Promise.all(files.map(async file=>({name:file.name,buffer:await file.arrayBuffer()})));
      if(job!==clientRef.current||!alive.current)return;
      setImportMetrics({fileRead:{calls:files.length,bytes:files.reduce((n,f)=>n+f.size,0),milliseconds:performance.now()-started}});
      const setup=await request('file',{files:buffers,options:{source}},job);
      if(!alive.current)return;
      const settings=setup.files.map(file=>({sheetIndex:file.sheetIndex,options:{source}}));
      setFileSetup(setup);setFileIndex(0);setFileSettings(settings);setAmbiguousAction(null);
      if(setup.files.some(file=>file.info.needsMapping||file.info.needsWeightUnit||file.info.needsLengthUnit||file.info.needsDistanceUnit||file.sheets.length>1||file.info.source==='generic'))setStep('setup');
      else {
        const next=await request('parse',{state,settings},job);
        if(alive.current){setPreview(next);setStep('review');}
      }
    } catch (reason) { if(reason.name!=='AbortError'&&alive.current){setError(reason.message || "This workout file could not be read."); setStep("file");} }
  };
  const parseSetup = async () => {
    setDateOnlyGroupingConfirmed(false);
    setError('');setStep('parsing');
    try{const next=await request('parse',{state,settings:fileSettings});if(alive.current){setPreview(next);setStep('review');}}
    catch(reason){if(reason.name!=='AbortError'&&alive.current){setError(reason.message);setStep('setup');}}
  };
  const resolve = async (resolution, sourceName = mappingName, advance = true) => {
    if(operation.current)return;operation.current=true;setBusy(true);
    try {
      const next=await request('resolve',{state,sourceName,resolution});
      if(!alive.current)return;setPreview(next);
      if(advance){setMappingName(mappingQueue.find(name=>next.exerciseMappings.some(item=>item.sourceKey===name&&!item.optionalReviewed&&!item.ignored))||null);setQuery('');}
    }catch(reason){if(reason.name!=='AbortError'&&alive.current)setError(reason.message);}
    finally{operation.current=false;if(alive.current)setBusy(false);}
  };
  const toggleRemember = item => resolve({type:'match',exerciseId:item.exerciseId,rememberMatch:!item.rememberMatch},item.sourceKey,false);
  const apply = async () => {
    if(operation.current)return;operation.current=true;
    setError(""); setStep("importing"); await afterVisibleFrame();
    try {
      const persisted = localStorage.getItem(STORAGE_KEY);
      const transaction = await request('apply',{state,persisted,options:{ambiguousAction,dateOnlyGroupingConfirmed,keepExistingMeasurements}});
      if(!alive.current)return;
      if(liveImportState.current!==state || localStorage.getItem(STORAGE_KEY)!==persisted)throw new Error('ROOK data changed while preparing this import. Review it again; existing history was not overwritten.');
      try{localStorage.setItem(STORAGE_KEY,transaction.serialized);}catch{throw new Error('ROOK couldn’t save this import. Device storage may be full. Existing history is unchanged; export a smaller date range and retry.');}
      update(() => transaction.state, { planVersion: false, persistedState: transaction.state });
      setResult(transaction.result); setStep("success"); triggerHaptic("success");
    } catch (reason) { if(alive.current){setError(reason.message || "Nothing was imported. Existing history is unchanged."); setStep("review");} }
    finally{operation.current=false;}
  };
  const formatImportDate = (value) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone:'UTC' }).format(new Date(value));
  const formatCount = (value) => new Intl.NumberFormat("en").format(Number(value) || 0);
  const importableCount = preview ? preview.summary.workouts - preview.summary.exactDuplicates : 0;
  const dateRange = preview?.dateRange?.length ? `${formatImportDate(preview.dateRange[0])} – ${formatImportDate(preview.dateRange[1])}` : "—";
  if (step === "source") return (
    <main className="screen detail-screen history-import-screen">
      <SheetHeader title="Import workout history" onClose={close} />
      <Eyebrow>PRIVATE · ON DEVICE</Eyebrow><h1>Choose source</h1>
      <p>Your file stays on this device. ROOK will show a dry-run before anything is saved.</p>
      <div className="history-import-source-list">{Object.entries(HISTORICAL_IMPORT_SOURCES).map(([key, value]) => (
        <button className="choice-row" key={key} onClick={() => selectSource(key)}><span><strong>{value.label}</strong><small>{value.detail}</small></span></button>
      ))}</div>
    </main>
  );
  if (step === "parsing" || step === "importing") return (
    <main className="screen detail-screen history-import-screen history-import-loading">
      <SheetHeader title="Import workout history" onClose={close} /><span className="restriction-spinner" aria-hidden="true" />
      <Eyebrow>{step === "parsing" ? "READING FILE" : "SAVING HISTORY"}</Eyebrow>
      <h1>{step === "parsing" ? "Checking your workouts…" : "Importing workouts…"}</h1>
      <p role="status">{step === "parsing" ? importProgress : "Applying the reviewed import as one transaction."}</p>
      {step==='parsing'&&<Button variant="quiet" onClick={cancelImport}>CANCEL</Button>}
    </main>
  );
  if (step === "success") return (
    <main className="screen detail-screen history-import-screen history-import-success">
      <SheetHeader title="Import complete" onClose={close} /><div className="history-import-success-mark" aria-hidden="true">✓</div>
      <Eyebrow>SAVED TO HISTORY</Eyebrow><h1>{result.imported||!result.measurements?`${formatCount(result.imported)} ${result.imported === 1 ? 'workout' : 'workouts'} imported`:`${formatCount(result.measurements)} measurement ${result.measurements===1?'entry':'entries'} imported`}</h1>
      {result.imported>0&&<p>Imported workouts now contribute to exercise history, PRs, estimated 1RM and Progress where their data supports it.</p>}
      <dl className="history-import-result-grid"><div><dt>Sets</dt><dd>{formatCount(result.sets)}</dd></div><div><dt>Duplicates skipped</dt><dd>{formatCount(result.skippedDuplicates)}</dd></div><div><dt>Invalid rows skipped</dt><dd>{formatCount(result.skippedRows)}</dd></div><div><dt>Exercises ignored</dt><dd>{formatCount(result.ignoredExercises)}</dd></div></dl>
      {result.measurements>0&&<p>{formatCount(result.measurements)} measurement entries preserved · {formatCount(result.mappedWeights)} body-weight check-ins added. Other measurements are retained in source metadata and backups, not Progress calculations.</p>}
      {result.measurementDuplicates>0&&<p>{formatCount(result.measurementDuplicates)} duplicate measurements skipped.</p>}
      <Button onClick={close}>DONE</Button>
    </main>
  );
  if(step==='setup')return <main className="screen detail-screen history-import-screen">
    <SheetHeader title="Import workout history" onBack={()=>setStep('file')} onClose={close}/>
    <Eyebrow>FILE SETUP · NOTHING SAVED</Eyebrow><h1>Check columns & units</h1>
    {fileSetup.files.length>1&&<label className="history-import-load-choice">File to configure<select value={fileIndex} onChange={event=>setFileIndex(Number(event.target.value))}>{fileSetup.files.map((file,i)=><option key={i} value={i}>{file.name}</option>)}</select></label>}
    <HistoryImportSetup info={currentFile.info} options={fileOptions} onChange={setFileOptions} sheets={currentFile.sheets} sheetIndex={sheetIndex} sample={currentFile.sample}
      onSheet={async index=>{const job=clientRef.current;setFileSettings(current=>current.map((item,i)=>i===fileIndex?{sheetIndex:index,options:{source}}:item));setStep('parsing');try{const inspected=await request('inspect',{fileIndex,sheetIndex:index,options:{source}},job);if(alive.current&&clientRef.current===job)setFileSetup(current=>({...current,files:current.files.map((file,i)=>i===fileIndex?{...file,...inspected}:file)}));}catch(reason){if(reason.name!=='AbortError'&&alive.current&&clientRef.current===job)setError(reason.message);}finally{if(alive.current&&clientRef.current===job)setStep('setup');}}}/>
    {error&&<p className="backup-status is-error" role="alert">{error}</p>}
    <SheetActionFooter><Button onClick={parseSetup}>REVIEW IMPORT</Button></SheetActionFooter>
  </main>;
  if (mapping) return (
    <main ref={mappingScreenRef} className="screen detail-screen history-import-screen history-import-mapping">
      <SheetHeader title="Map exercise" onBack={() => { setMappingName(null); setQuery(""); }} onClose={close} />
      <Eyebrow>FROM {(mapping.source||preview.sourceLabel).toUpperCase()}</Eyebrow>
      <p role="status">Exercise {mappingQueue.indexOf(mappingName) + 1} of {mappingQueue.length}</p>
      <h1 tabIndex={-1}>{mapping.sourceName}</h1>
      <p>{mapping.match?.reason === 'Saved exercise is unavailable' ? 'Your saved exercise is no longer available. Choose a match again or keep it separate.' : 'Check the exercise and equipment. This mapping applies to matching imported history; logged results stay unchanged.'}</p>
      {busy&&<small role="status">Updating match…</small>}
      {error&&<p className="backup-status is-error" role="alert">{error}</p>}
      {!query && mapping.match?.tier === 'B' && <section className="history-import-suggestion" aria-label="Suggested match"><Eyebrow>SUGGESTED MATCH</Eyebrow><strong>{historicalExerciseLabel(state,mapping.match.suggestedExerciseId)}</strong><Button disabled={busy} variant="secondary" onClick={() => resolve({type:'match',exerciseId:mapping.match.suggestedExerciseId})}>USE MATCH</Button><Button variant="quiet" disabled={busy} onClick={() => mappingScreenRef.current?.querySelector('input[type="search"]')?.focus()}>CHOOSE ANOTHER</Button></section>}
      <Button disabled={busy} variant="quiet" onClick={() => resolve({type:'custom'})}>KEEP ORIGINAL</Button>
      <SearchInput onClear={() => setQuery("")} className="text-answer" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
      {!query && mapping.match?.tier === 'C' && mapping.match.candidates?.some(item=>item.score>=.4) && <div className="history-import-match-list"><Eyebrow>POSSIBLE MATCHES · CHECK VARIANT</Eyebrow>{mapping.match.candidates.filter(item=>item.score>=.4).map(item=><button disabled={busy} key={item.exerciseId} className="list-row" onClick={()=>resolve({type:'match',exerciseId:item.exerciseId})}><span><strong>{item.name}</strong><small>{item.conflicts.length?'Different variant · review carefully':'Confirm the source setup'}</small></span><span>›</span></button>)}</div>}
      <div className="history-import-match-list">{choices.map((item) => (
        <button disabled={busy} key={item.id} className="list-row" onClick={() => resolve({ type: "match", exerciseId: item.id })}><span><strong>{item.name}</strong>{item.custom && <small>Your custom exercise</small>}</span><span>›</span></button>
      ))}</div>
      {!query && <div className="history-import-special-actions"><button disabled={busy} className="choice-row" onClick={() => resolve({ type: "ignore" })}><span><strong>Ignore this exercise</strong><small>Its rows will not be imported.</small></span></button></div>}
    </main>
  );
  return (
    <main className="screen detail-screen history-import-screen">
      <SheetHeader title="Import workout history" onBack={() => { if(step==='file'){cancelImport();setStep('source');}else cancelImport(); }} onClose={close} />
      {step === "file" ? <>
        <Eyebrow>{HISTORICAL_IMPORT_SOURCES[source].label.toUpperCase()}</Eyebrow><h1>Choose history file</h1>
        <p>ROOK parses and validates the file locally. Selecting it does not change History.</p>
        {source === "strong" && <p>If the export does not state its units, ROOK will ask before reading results.</p>}
        {source === "generic" && <details className="history-import-format"><summary>Generic CSV format</summary><code>{GENERIC_HISTORY_CSV_HEADER}</code><small>One completed set per row. Use kg or lb in weight_unit.</small></details>}
        {source==='hevy'&&<p>Select Workouts, Measurements, or both. Every selected file is checked before a single save.</p>}
        <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={chooseFile} />
        {error && <p className="backup-status is-error" role="alert">{error}</p>}
        <Button onClick={() => fileRef.current?.click()}>CHOOSE FILE</Button>
        {fileSetup&&<Button variant="quiet" onClick={()=>setStep('setup')}>REVIEW FILE SETTINGS</Button>}
        <Button variant="quiet" onClick={() => { setSource(null); setFileSetup(null); setStep("source"); }}>CHANGE SOURCE</Button>
      </> : <>
        <Eyebrow>DRY RUN · NOTHING SAVED</Eyebrow><h1>Review import</h1><p>{preview.fileName} · {preview.sourceLabel}<br />{dateRange}</p>
        <p>{preview.fileInfo.weightUnits.length?`Source weight: ${preview.fileInfo.weightUnits.join(' / ')}`:'No source weight values'}{preview.fileInfo.distanceUnits.length?` · Distance: ${preview.fileInfo.distanceUnits.join(' / ')}`:''}</p>
        <Button variant="quiet" onClick={()=>{setError('');setStep('setup');}}>COLUMN / UNIT SETTINGS</Button>
        {preview.warnings.length>0&&<details className="history-import-format"><summary>Source compatibility notes ({preview.warnings.length})</summary><ul className="history-import-warnings">{preview.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
        <details className="history-import-format"><summary>Preview factual history (first 3 workouts)</summary>{preview.workouts.slice(0,3).map(workout=><section key={workout.id}><h3>{workout.name||'Untitled source workout'} · {workout.canonicalPlanDate}</h3>{workout.sessionNote&&<p>{workout.sessionNote}</p>}{workout.exercises.map(ex=><div key={ex.id}><strong>{ex.sourceSupersetId?`Group ${ex.sourceSupersetId} · `:''}{ex.sourceName}</strong>{ex.notes&&<p>{ex.notes}</p>}{ex.sets.slice(0,20).map(set=><small key={set.id}>{historySetDescriptor(ex,set)}{set.rawImport.weight!=null?` · ${set.rawImport.weight} ${set.rawImport.weightUnit}`:''}</small>)}</div>)}</section>)}</details>
        <dl className="history-import-summary-grid"><div><dt>Workouts</dt><dd>{formatCount(preview.summary.workouts)}</dd></div><div><dt>Sets</dt><dd>{formatCount(preview.summary.sets)}</dd></div><div><dt>Matched</dt><dd>{formatCount(preview.summary.matchedExercises-preview.summary.customExercises)}</dd></div><div><dt>Original names</dt><dd>{formatCount(preview.summary.customExercises)}</dd></div><div><dt>Exact duplicates</dt><dd>{formatCount(preview.summary.exactDuplicates)}</dd></div><div><dt>Invalid rows</dt><dd>{formatCount(preview.summary.invalidRows)}</dd></div></dl>
        {preview.summary.customExercises>0&&<><p>Some exercises keep their original names. Linking them to the ROOK library is optional.</p><Button variant="secondary" disabled={busy} onClick={reviewMatches}>Review exercise matches · Optional</Button>{busy&&<small role="status">{importProgress}</small>}</>}
        {preview.summary.reviewExercises>0&&<section className="history-import-review-section"><Eyebrow>SAVED MAPPING NEEDS ATTENTION</Eyebrow>{preview.exerciseMappings.filter(item=>!item.exerciseId&&!item.ignored&&item.match?.requiresReview).map(mappingRow)}</section>}
        <details className="history-import-format history-import-resolved"><summary>Matched ({formatCount(preview.summary.matchedExercises-preview.summary.customExercises)})</summary>{preview.exerciseMappings.filter(item=>item.exerciseId&&!item.exerciseId.startsWith('custom-')||item.ignored).map(mappingRow)}</details>
        {preview.summary.customExercises>0&&<details className="history-import-format history-import-custom"><summary>Original names ({formatCount(preview.summary.customExercises)})</summary><p>Original names and results are preserved. ROOK illustrations and catalog guidance may be unavailable.</p>{preview.exerciseMappings.filter(item=>item.exerciseId?.startsWith('custom-')&&!item.ignored).map(mappingRow)}</details>}
        {preview.exerciseMappings.some(item=>item.needsLoadKind)&&<p>Unconfirmed source loads are preserved and excluded from load/PR metrics. You can optionally clarify them below.</p>}
        {preview.measurements?.length>0&&<section className="history-import-review-section">
          <Eyebrow>MEASUREMENTS</Eyebrow>
          <p>{formatCount(preview.summary.measurements)} entries · {formatCount(preview.summary.measurementWeights)} recorded weights · {formatCount(preview.summary.measurementDuplicates)} exact duplicates</p>
          <p>Body weight uses existing ROOK check-ins. Body fat and circumference values are preserved as source data, not shown in Progress graphs. Backups and JSON history exports retain them.</p>
          {preview.preservedMeasurementFields.length>0&&<p>Source-only fields: {preview.preservedMeasurementFields.map(field=>field.replaceAll('_',' ')).join(', ')}</p>}
          <details><summary>Review measurement values (first 20)</summary>{preview.measurements.slice(0,20).map((record,i)=><p key={`${record.id}-${i}`}><strong>{record.localDate}</strong><small>{Object.entries(record.values).filter(([,v])=>v.value!=null).map(([field,v])=>`${field.replaceAll('_',' ')}: ${v.value} ${v.unit||''}`).join(' · ')}</small></p>)}</details>
          {preview.summary.measurementConflicts>0&&<label className="remember-import-match"><input type="checkbox" checked={keepExistingMeasurements} onChange={event=>setKeepExistingMeasurements(event.target.checked)}/><span><strong>Keep existing body-weight check-ins</strong><small>{preview.summary.measurementConflicts} conflicting source entries will be preserved separately as source data. Local check-ins will not change.</small></span></label>}
        </section>}
        <details className="history-import-format"><summary>Source load meanings (optional)</summary>{preview.exerciseMappings.filter(item=>item.needsLoadKind&&!item.ignored).map(item=><label className="history-import-load-choice" key={item.sourceKey}>Source load meaning · {item.sourceName}<select disabled={busy} value={item.loadKind||'unknown'} onChange={e=>resolve({type:'load',loadKind:e.target.value},item.sourceKey,false)}><option value="external">External load</option><option value="added">Added to bodyweight</option><option value="assisted">Assistance amount</option><option value="bodyweight">Recorded bodyweight (not added load)</option><option value="none">Source value is not an external training load</option><option value="unknown">Keep source value · exclude from load/PR metrics</option></select></label>)}</details>
        {(preview.summary.exactDuplicates > 0 || preview.summary.ambiguousDuplicates > 0) && <section className="history-import-review-section history-import-duplicates"><Eyebrow>DUPLICATES</Eyebrow>{preview.summary.exactDuplicates > 0 && <p><strong>{formatCount(preview.summary.exactDuplicates)} already in ROOK</strong><small>Exact duplicates will be skipped.</small></p>}{preview.summary.ambiguousDuplicates > 0 && <><p><strong>{formatCount(preview.summary.ambiguousDuplicates)} possible {preview.summary.ambiguousDuplicates === 1 ? "duplicate" : "duplicates"}</strong><small>Matching session identity, but different data. Existing history is never overwritten.</small></p><div role="radiogroup" aria-label="Possible duplicate action"><button className={ambiguousAction === "skip" ? "is-selected" : ""} onClick={() => setAmbiguousAction("skip")}>KEEP EXISTING</button><button className={ambiguousAction === "import" ? "is-selected" : ""} onClick={() => setAmbiguousAction("import")}>IMPORT THIS TOO</button></div></>}</section>}
        {preview.summary.invalidRows > 0 && <section className="history-import-review-section history-import-invalid"><button className="history-import-invalid-toggle" onClick={() => setShowInvalid((value) => !value)}><span><strong>{pluralize(preview.summary.invalidRows, "invalid row")}</strong><small>Import blocked. Correct these rows or column settings; no rows will be silently skipped.</small></span><b>{showInvalid ? "HIDE" : "VIEW"}</b></button>{showInvalid && preview.invalidRows.slice(0, 20).map((item,i) => <p key={`${item.line}-${i}`}>{item.reason}</p>)}</section>}
        {error && <p className="backup-status is-error" role="alert">{error}</p>}
        <small className="history-import-atomic-note">If saving fails, existing ROOK history stays unchanged.</small>
        {preview.summary.groupingDecisions>0&&<label className="remember-import-match"><input type="checkbox" checked={dateOnlyGroupingConfirmed} onChange={e=>setDateOnlyGroupingConfirmed(e.target.checked)}/><span><strong>Confirm date-only session grouping</strong><small>This file has no start time or workout ID for {preview.summary.groupingDecisions} session groups. I checked the preview: each date/name group is one workout. For separate same-day sessions, map a start time or workout ID first.</small></span></label>}
        {importMetrics&&<details className="history-import-format"><summary>Local processing time</summary><small>{Math.round(importMetrics.visiblePreviewMs)} ms to visible preview · {importMetrics.fileRead?.calls||0} file reads ({Math.round(importMetrics.fileRead?.milliseconds||0)} ms)</small>{Object.entries(importMetrics.stages||{}).map(([name,value])=><small key={name}>{name}: {Math.round(value.milliseconds)} ms · {value.inputs} inputs · {value.calls} calls</small>)}</details>}
        <SheetActionFooter><Button disabled={busy || preview.summary.invalidRows > 0 || preview.summary.loadDecisions > 0 || preview.summary.reviewExercises > 0 || (preview.summary.measurementConflicts>0&&!keepExistingMeasurements) || (preview.summary.groupingDecisions>0&&!dateOnlyGroupingConfirmed) || (preview.summary.ambiguousDuplicates > 0 && !ambiguousAction)} onClick={apply}>{preview.summary.measurements>0?'IMPORT DATA':`IMPORT ${formatCount(importableCount)} ${importableCount === 1 ? 'WORKOUT' : 'WORKOUTS'}`}</Button></SheetActionFooter>
      </>}
    </main>
  );
}

function CustomExercisesScreen({ state, update, close, createOnly = false, initialName = "", onCreated, createLabel = 'CREATE EXERCISE' }) {
  const creationSubmitted = useRef(false);
  const activeExercises = (state.customExercises || []).filter((item) => !item.deletedAt);
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState(createOnly ? "editor" : "list");
  const [deletePending, setDeletePending] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [draftAliases, setDraftAliases] = useState([]);
  const originalAliasIds = useRef([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const emptyForm = () => ({
    name: initialName,
    equipment: ["machines"],
    primaryMuscle: "",
    secondaryMuscles: [],
    pattern: "",
    loggingType: "weight_reps",
    loggingMode: "normal",
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);
  const editing = activeExercises.find((item) => item.id === editingId) || null;
  const aliases = draftAliases.filter(
    (item) => !item.deletedAt && item.exerciseId === editingId,
  );
  const beginCreate = () => {
    setSaveFailed(false);
    setEditingId(null);
    setForm(emptyForm());
    setAliasDraft("");
    setNotice("");
    setDeletePending(false);
    setView("editor");
  };
  const beginEdit = (exercise) => {
    setSaveFailed(false);
    setDraftAliases(clone(state.exerciseAliases || []));
    originalAliasIds.current = (state.exerciseAliases || []).filter(alias => !alias.deletedAt && alias.exerciseId === exercise.id).map(alias => alias.id);
    setEditingId(exercise.id);
    setForm({
      name: exercise.name,
      equipment: [...exercise.equipment],
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: [...exercise.secondaryMuscles],
      pattern: exercise.pattern || "",
      loggingType: exercise.loggingType,
      loggingMode: exercise.loggingMode || "normal",
      notes: exercise.notes || "",
    });
    setAliasDraft("");
    setNotice("");
    setDeletePending(false);
    setView("editor");
  };
  const save = () => {
    if (createOnly && creationSubmitted.current) return;
    const name = form.name.trim();
    if (!name || !form.primaryMuscle) {
      setNotice(!name ? "Add an exercise name." : "Choose the main target muscle.");
      return;
    }
    if (editingId) {
      const result = saveCustomExerciseDetails(state, editingId, form, {
        added: aliases.filter(alias => !originalAliasIds.current.includes(alias.id)).map(alias => alias.alias),
        removed: originalAliasIds.current.filter(id => !aliases.some(alias => alias.id === id)),
        builtInCatalog: exerciseCatalog, persist: saveState,
      });
      setSaveFailed(result.status === 'persistence-failed');
      if (result.status !== 'saved') {
        setNotice(result.status === 'persistence-failed' ? 'Couldn’t save these details and aliases. Your exercise, aliases and plan are unchanged. Try again.' : result.status === 'conflict' ? 'That alias now maps to another exercise. Review your aliases.' : result.status === 'duplicate' ? 'An exercise with this name already exists.' : 'Check the exercise details.');
        return;
      }
      update(() => result.state);
      setView('list');setEditingId(null);return;
    }
    let result;
    if (createOnly) creationSubmitted.current = true;
    try { update((current) => {
      result = createCustomExercise(current, form);
      return current;
    }); } catch {
      creationSubmitted.current = false;
      setNotice("Couldn’t save this exercise. Try again; your plan is unchanged.");
      return;
    }
    if (["duplicate", "invalid"].includes(result?.status)) {
      creationSubmitted.current = false;
      setNotice(result.status === "duplicate" ? "An exercise with this name already exists." : "Check the exercise details.");
      return;
    }
    if (createOnly && result?.exercise) { onCreated?.(result.exercise); return; }
    setView("list");
    setEditingId(null);
  };
  const addAlias = () => {
    if (!editingId || !aliasDraft.trim()) return;
    const draft = { ...clone(state), exerciseAliases: clone(draftAliases) };
    const result = rememberExerciseAlias(draft, aliasDraft, editingId, { builtInCatalog: exerciseCatalog });
    if (result?.status === "conflict") setNotice("That name already maps to another exercise.");
    else if (result?.status === "invalid") setNotice("Enter a distinct alias.");
    else {
      setAliasDraft("");
      setDraftAliases(draft.exerciseAliases);
      setNotice(result?.status === "unchanged" ? "That alias is already listed." : "Alias added to draft. Save details to keep it.");
    }
  };
  const confirmDelete = () => {
    update((current) => {
      deleteCustomExercise(current, editingId);
      return current;
    });
    setDeletePending(false);
    setEditingId(null);
    setView("list");
  };
  if (view === "list")
    return (
      <main className="screen detail-screen custom-exercises-screen">
        <SheetHeader title="Custom exercises" onClose={close} />
        <Eyebrow>YOUR LIBRARY</Eyebrow>
        <h1>Exercises that fit your gym.</h1>
        <p>Create equipment-specific movements once. They work in search, imports and compatible substitutions.</p>
        {activeExercises.length ? (
          <section className="custom-exercise-list">
            {activeExercises
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((exercise) => (
                <button className="custom-exercise-row" key={exercise.id} onClick={() => beginEdit(exercise)}>
                  <span>
                    <strong>{exercise.name}</strong>
                    <small>{exercise.equipment.map((value) => CUSTOM_EXERCISE_EQUIPMENT.find(([id]) => id === value)?.[1] || value).join(" · ")} · {CUSTOM_EXERCISE_LOGGING_TYPES.find(([id]) => id === exercise.loggingType)?.[1]}</small>
                  </span>
                  <i>›</i>
                </button>
              ))}
          </section>
        ) : (
          <div className="custom-exercise-empty">
            <strong>No custom exercises yet.</strong>
            <p>Add one for a gym-specific machine or movement that is not already in Rook.</p>
          </div>
        )}
        <Button onClick={beginCreate}>ADD CUSTOM EXERCISE</Button>
      </main>
    );
  return (
    <main className="screen detail-screen custom-exercise-editor">
      <SheetHeader title={editing ? "Edit exercise" : "New exercise"} onBack={createOnly ? close : () => setView("list")} />
      <Eyebrow>{editing ? "CUSTOM EXERCISE" : "ADD TO YOUR LIBRARY"}</Eyebrow>
      <h1>{editing ? editing.name : "Make it recognizable."}</h1>
      <p>Only the name, equipment and main target are needed. Add movement details only when you know them.</p>
      {createOnly && <p>Saved to your exercise library, even if you later cancel plan changes. {createLabel === 'CREATE & ADD' ? 'Added to this workout’s draft; save plan changes when you’re ready.' : 'Return to the chooser to add it to your draft.'} Saved training restrictions still apply.</p>}
      <div className="custom-exercise-form">
        <label>
          <span>EXERCISE NAME</span>
          <input aria-label="Exercise name" maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          <span>EQUIPMENT</span>
          <select aria-label="Exercise equipment" value={form.equipment[0]} onChange={(event) => setForm((current) => ({ ...current, equipment: [event.target.value] }))}>
            {CUSTOM_EXERCISE_EQUIPMENT.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>PRIMARY TARGET</span>
          <select aria-label="Primary target muscle" value={form.primaryMuscle} onChange={(event) => setForm((current) => ({ ...current, primaryMuscle: event.target.value, secondaryMuscles: current.secondaryMuscles.filter((value) => value !== event.target.value) }))}>
            {!form.primaryMuscle && <option value="">Choose main target</option>}
            {CUSTOM_EXERCISE_MUSCLES.map((muscle) => <option key={muscle} value={muscle}>{titleCase(muscle)}</option>)}
          </select>
        </label>
        <label>
          <span>LOGGING · DEFAULT</span>
          <select aria-label="Exercise logging type" value={form.loggingType} onChange={(event) => setForm((current) => ({ ...current, loggingType: event.target.value }))}>
            {CUSTOM_EXERCISE_LOGGING_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>SIDES · OPTIONAL</span>
          <select aria-label="Exercise side logging mode" value={form.loggingMode} onChange={(event) => setForm((current) => ({ ...current, loggingMode: event.target.value }))}>
            {CUSTOM_EXERCISE_LOGGING_MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <small>Per side adds left and right reps only when this exercise is logged.</small>
        </label>
        <label>
          <span>MOVEMENT · OPTIONAL</span>
          <select aria-label="Exercise movement" value={form.pattern} onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))}>
            {CUSTOM_EXERCISE_PATTERNS.map(([id, label]) => <option key={id || "none"} value={id}>{label}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>SECONDARY MUSCLES · OPTIONAL</legend>
          <div className="custom-muscle-chips">
            {CUSTOM_EXERCISE_MUSCLES.filter((muscle) => muscle !== form.primaryMuscle).map((muscle) => {
              const selected = form.secondaryMuscles.includes(muscle);
              return <button type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} key={muscle} onClick={() => setForm((current) => ({ ...current, secondaryMuscles: selected ? current.secondaryMuscles.filter((value) => value !== muscle) : [...current.secondaryMuscles, muscle] }))}>{titleCase(muscle)}</button>;
            })}
          </div>
        </fieldset>
        <label>
          <span>NOTES · OPTIONAL</span>
          <textarea aria-label="Exercise notes" maxLength="300" rows="3" placeholder="Setup cue or machine detail" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </div>
      {editing && (
        <section className="custom-alias-section">
          <Eyebrow>ALIASES</Eyebrow>
          <p>Other names that should resolve to this exercise during future imports. Alias changes are saved with SAVE DETAILS.</p>
          {aliases.map((alias) => (
            <div className="custom-alias-row" key={alias.id}>
              <span>{alias.alias}</span>
              <button type="button" aria-label={`Remove alias ${alias.alias}`} onClick={() => setDraftAliases(current => { const draft = { ...clone(state), exerciseAliases: clone(current) }; removeExerciseAlias(draft, alias.id); return draft.exerciseAliases; })}>REMOVE</button>
            </div>
          ))}
          <div className="custom-alias-add">
            <input aria-label="New exercise alias" placeholder="e.g. Prime Incline Press" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} />
            <button type="button" disabled={!aliasDraft.trim()} onClick={addAlias}>ADD</button>
          </div>
        </section>
      )}
      <SheetActionFooter enabled={!deletePending}>
      {notice && <p className="custom-exercise-notice" role={saveFailed ? 'alert' : 'status'}>{notice}</p>}
      <Button onClick={save}>{saveFailed ? 'TRY AGAIN' : editing ? "SAVE DETAILS" : createLabel}</Button>
      {editing && !deletePending && <Button variant="quiet" className="custom-exercise-delete" onClick={() => setDeletePending(true)}>Delete exercise</Button>}
      {deletePending && (
        <section className="custom-delete-confirm" role="alertdialog" aria-label="Delete custom exercise">
          <strong>Delete {editing.name}?</strong>
          <p>{customExerciseUsage(state, editing.id) ? "It stays readable in existing plans and workout history, but disappears from search and future matching." : "It will disappear from search and future matching."}</p>
          <div><button type="button" onClick={() => setDeletePending(false)}>CANCEL</button><button type="button" onClick={confirmDelete}>DELETE</button></div>
        </section>
      )}
      </SheetActionFooter>
    </main>
  );
}

function GymProfilesSheet({ state, update, close }) {
  const [view, setView] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replacementDefaultId, setReplacementDefaultId] = useState(null);
  const [error, setError] = useState("");
  const gyms = state.gymProfiles || [];
  const editing = gyms.find((gym) => gym.id === editingId) || null;
  const isDefault = Boolean(editing && editing.id === state.defaultGymProfileId);

  const openEditor = (gym = null) => {
    setEditingId(gym?.id || null);
    setName(gym?.name || "");
    setEquipment(gym ? [...gym.equipment] : []);
    setMakeDefault(gym ? gym.id === state.defaultGymProfileId : gyms.length === 0);
    setConfirmDelete(false);
    setReplacementDefaultId(
      gym?.id === state.defaultGymProfileId
        ? gyms.find((item) => item.id !== gym.id)?.id || null
        : null,
    );
    setError("");
    setView(gym ? "edit" : "create");
  };
  const back = () => {
    setView("list");
    setEditingId(null);
    setConfirmDelete(false);
    setError("");
  };
  const toggleEquipment = (value) => {
    setEquipment((current) => {
      if (value === "full gym")
        return current.length === 1 && current[0] === value ? [] : [value];
      const withoutFullGym = current.filter((item) => item !== "full gym");
      const next = withoutFullGym.includes(value)
        ? withoutFullGym.filter((item) => item !== value)
        : [...withoutFullGym, value];
      return normalizeGymEquipment(next);
    });
  };
  const save = () => {
    const cleanedName = name.trim().replace(/\s+/g, " ");
    const cleanedEquipment = normalizeGymEquipment(equipment);
    if (!cleanedName) return setError("Add a gym name.");
    if (!cleanedEquipment.length) return setError("Choose available equipment.");
    update((current) => {
      if (editingId)
        updateGymProfile(current, editingId, {
          name: cleanedName,
          equipment: cleanedEquipment,
        });
      else {
        createGymProfile(current, {
          name: cleanedName,
          equipment: cleanedEquipment,
          makeDefault,
        });
      }
      if (editingId && makeDefault) setDefaultGymProfile(current, editingId);
      return current;
    });
    back();
  };
  const remove = () => {
    update((current) => {
      deleteGymProfile(current, editingId, replacementDefaultId);
      return current;
    });
    back();
  };

  if (view === "plates" && editing)
    return (
      <PlateSetupScreen
        gym={editing}
        state={state}
        update={update}
        onBack={() => setView("edit")}
        close={close}
      />
    );

  if (view === "list")
    return (
      <main className="screen detail-screen gym-profiles-screen">
        <SheetHeader title="Gym profiles" onClose={close} />
        <Eyebrow>TRAINING</Eyebrow>
        <h1>Your training environments</h1>
        <p>Save the equipment available where you train. Your program and history stay separate.</p>
        <section className="gym-profile-list" aria-label="Saved gym profiles">
          {gyms.map((gym) => (
            <button className="gym-profile-row" key={gym.id} onClick={() => openEditor(gym)}>
              <span>
                <strong>{gym.name}</strong>
                <small>{gymEquipmentSummary(gym.equipment)}</small>
              </span>
              <span className="gym-profile-row-end">
                {gym.id === state.defaultGymProfileId && <small>DEFAULT</small>}
                <i aria-hidden="true">›</i>
              </span>
            </button>
          ))}
        </section>
        <Button variant="secondary" onClick={() => openEditor()}>ADD GYM</Button>
      </main>
    );

  const conflictCount = makeDefault
    ? knownProgramEquipmentConflicts(state, equipment)
    : 0;
  const otherGyms = gyms.filter((gym) => gym.id !== editingId);
  const valid = Boolean(name.trim() && normalizeGymEquipment(equipment).length);
  return (
    <main className="screen detail-screen gym-profile-editor">
      <SheetHeader
        title={view === "create" ? "Add gym" : "Edit gym"}
        onClose={close}
        onBack={back}
      />
      <Eyebrow>{view === "create" ? "NEW TRAINING ENVIRONMENT" : "GYM PROFILE"}</Eyebrow>
      <h1>{view === "create" ? "Add a gym" : editing?.name}</h1>
      <label className="gym-name-field">
        <span>Gym name</span>
        <input
          type="text"
          maxLength="50"
          value={name}
          placeholder="Home gym"
          onChange={(event) => { setName(event.target.value); setError(""); }}
        />
      </label>
      <section className="gym-equipment-picker">
        <div className="onboarding-group-heading">
          <strong>Equipment</strong>
          <small>Select all that apply</small>
        </div>
        <div className="adjust-check-list" role="group" aria-label="Gym equipment">
          {CANONICAL_GYM_EQUIPMENT.map((value) => {
            const selected = equipment.includes(value);
            return (
              <button key={value} aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => { toggleEquipment(value); setError(""); }}>
                <span>{EQUIPMENT_LABELS[value] || titleCase(value)}</span>
                <i aria-hidden="true">{selected ? "✓" : ""}</i>
              </button>
            );
          })}
        </div>
      </section>
      {view === "edit" && gymSupportsBarbell(editing?.equipment || equipment) && (
        <button className="gym-plate-setup-entry" onClick={() => setView("plates")}>
          <span>
            <strong>Plate calculator setup</strong>
            <small>{plateValue(selectedPlateBar(editing?.plateSetup).weight)} {editing?.plateSetup?.unit || state.profile.units} bar · {editing?.plateSetup?.plates?.length || 0} plate sizes</small>
          </span>
          <i aria-hidden="true">›</i>
        </button>
      )}
      {isDefault ? (
        <p className="gym-default-state">Default training environment</p>
      ) : (
        <button className={`gym-default-choice${makeDefault ? " is-selected" : ""}`} aria-pressed={makeDefault} onClick={() => setMakeDefault((value) => !value)}>
          <span><strong>Use as default gym</strong><small>Used by your normal program and future recommendations.</small></span>
          <i aria-hidden="true">{makeDefault ? "✓" : ""}</i>
        </button>
      )}
      {makeDefault && conflictCount > 0 && (
        <p className="gym-plan-warning" role="status">
          {pluralize(conflictCount, "exercise")} in your current program may not be available here. Your plan will not be changed.
        </p>
      )}
      {error && <p className="backup-status is-error" role="alert">{error}</p>}
      <SheetActionFooter enabled={!confirmDelete}>
      <Button disabled={!valid} onClick={save}>SAVE GYM</Button>
      {view === "edit" && !confirmDelete && (
        <Button variant="quiet" className="gym-delete-entry" onClick={() => setConfirmDelete(true)}>
          DELETE GYM
        </Button>
      )}
      {view === "edit" && confirmDelete && (
        <section className="gym-delete-confirm" role="alert">
          <strong>Delete {editing?.name}?</strong>
          {gyms.length === 1 ? (
            <small>Keep at least one gym profile.</small>
          ) : (
            <>
              <small>This does not delete workouts or change your plan.</small>
              {isDefault && (
                <div className="gym-replacement-default">
                  <span>Choose a new default</span>
                  {otherGyms.map((gym) => (
                    <button key={gym.id} aria-pressed={replacementDefaultId === gym.id} onClick={() => setReplacementDefaultId(gym.id)}>
                      <strong>{gym.name}</strong><i aria-hidden="true">{replacementDefaultId === gym.id ? "✓" : ""}</i>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="danger" className="gym-delete-action" disabled={isDefault && !replacementDefaultId} onClick={remove}>DELETE GYM</Button>
            </>
          )}
          <Button variant="quiet" onClick={() => setConfirmDelete(false)}>CANCEL</Button>
        </section>
      )}
      </SheetActionFooter>
    </main>
  );
}

const ADJUST_TODAY_OPTIONS = [
  [ADJUST_TODAY_MODES.lessTime, "Less time", "Shorten the session while protecting its main work."],
  [ADJUST_TODAY_MODES.equipment, "Different equipment", "Rebuild today around the equipment at this location."],
  [ADJUST_TODAY_MODES.lowEnergy, "Low energy", "Reduce fatigue without making the work more aggressive."],
  [ADJUST_TODAY_MODES.unavailable, "Specific exercise unavailable", "Replace one or more exercises before you start."],
];

const TODAY_EQUIPMENT_OPTIONS = [
  ["full gym", "Full gym"],
  ["dumbbells", "Dumbbells"],
  ["barbell/rack/bench", "Barbell / rack / bench"],
  ["cables", "Cables"],
  ["machines", "Machines"],
  ["pull-up bar", "Pull-up bar"],
  ["resistance bands", "Resistance bands"],
  ["bodyweight only", "Bodyweight only"],
];

function adjustmentModeLabel(mode) {
  return ADJUST_TODAY_OPTIONS.find(([value]) => value === mode)?.[1] || "TODAY ONLY";
}

function AdjustTodaySheet({ state, update, close, request = {} }) {
  const screenRef = useRef(null);
  const original = plannedWorkoutForDate(state, new Date());
  const existing = state.todayAdaptation?.date === isoDay() ? state.todayAdaptation : null;
  const [step, setStep] = useState(
    ["review", "restore"].includes(request.view) && existing ? "review" : "mode",
  );
  const [mode, setMode] = useState(null);
  const [minutes, setMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [equipment, setEquipment] = useState(() =>
    state.profile.equipment?.length ? [...state.profile.equipment] : ["full gym"],
  );
  const [selectedGymId, setSelectedGymId] = useState(null);
  const [customEquipment, setCustomEquipment] = useState(false);
  const [unavailableEntryIds, setUnavailableEntryIds] = useState([]);
  const [proposal, setProposal] = useState(existing ? clone(existing) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(request.view === "restore");
  const [persistenceError, setPersistenceError] = useState(false);
  const [manualEntryId, setManualEntryId] = useState(null);
  const [query, setQuery] = useState("");
  useExerciseSearchSheet(screenRef, Boolean(manualEntryId && proposal), { focusedSearch: true });
  const estimatedOriginal = estimateSessionMinutes(original?.exercises || []);
  const timePresets = [30, 45, 60].filter((value) => value < estimatedOriginal);
  const chosenMinutes = minutes === "custom" ? Number(customMinutes) : Number(minutes);
  const title = step === "mode" ? "Adjust today" : step === "review" ? "Review adjustment" : "Adjust today";

  const chooseMode = (next) => {
    setMode(next);
    setError("");
    setStep(next === ADJUST_TODAY_MODES.unavailable ? "unavailable" : next === ADJUST_TODAY_MODES.equipment ? "equipment" : next === ADJUST_TODAY_MODES.lessTime ? "time" : "energy");
  };
  const toggleEquipment = (value) => {
    setEquipment((current) => {
      if (["full gym", "bodyweight only"].includes(value))
        return current.length === 1 && current[0] === value ? [] : [value];
      const withoutExclusive = current.filter(
        (item) => !["full gym", "bodyweight only"].includes(item),
      );
      return withoutExclusive.includes(value)
        ? withoutExclusive.filter((item) => item !== value)
        : [...withoutExclusive, value];
    });
  };
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setPersistenceError(false);
    setError("");
    try {
      await afterVisibleFrame();
      await waitFor(180);
      const result = buildTodayAdjustment(state, {
        mode,
        minutes: chosenMinutes,
        equipment,
        gymProfileId: mode === ADJUST_TODAY_MODES.equipment && !customEquipment ? selectedGymId : null,
        gymProfileName:
          mode === ADJUST_TODAY_MODES.equipment && !customEquipment
            ? (state.gymProfiles || []).find((gym) => gym.id === selectedGymId)?.name || null
            : null,
        unavailableEntryIds,
      });
      if (result.status !== "ready") {
        setError(result.reason || "ROOK couldn’t create a useful adjustment.");
        return;
      }
      setProposal(result.proposal);
      setStep("review");
    } catch {
      setError("ROOK couldn’t create this adjustment. Your original workout is unchanged.");
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    setError("");
    setPersistenceError(false);
    const result = applyTodayAdjustment(state, proposal);
    if (result.status === "conflict") {
      setError("Today’s workout changed. Close this review and create the adjustment again.");
      return;
    }
    if (result.status !== "applied") {
      setError("This adjustment is incomplete. Resolve the highlighted exercise first.");
      return;
    }
    if (!saveState(result.state)) {
      setError("ROOK couldn’t save this adjustment. Your original workout is unchanged. Try again.");
      setPersistenceError(true);
      return;
    }
    update(() => result.state);
    triggerHaptic("tap");
    close();
  };
  const restore = () => {
    setPersistenceError(false);
    const result = restoreOriginalTodayWorkout(state);
    if (result.status !== "restored") {
      setError("This workout can no longer be restored from here.");
      return;
    }
    if (!saveState(result.state)) {
      setError("ROOK couldn’t save the change. The adjusted workout is still intact.");
      setPersistenceError(true);
      return;
    }
    update(() => result.state);
    triggerHaptic("tap");
    close();
  };
  const goBack = () => {
    setError("");
    setConfirmRestore(false);
    setManualEntryId(null);
    setQuery("");
    if (step === "review" && proposal && !existing) setStep(mode === ADJUST_TODAY_MODES.lessTime ? "time" : mode === ADJUST_TODAY_MODES.equipment ? "equipment" : mode === ADJUST_TODAY_MODES.unavailable ? "unavailable" : "energy");
    else setStep("mode");
  };
  const backFromManual = () => { setManualEntryId(null); setQuery(""); };
  const configurationStep = mode === ADJUST_TODAY_MODES.lessTime ? "time" : mode === ADJUST_TODAY_MODES.equipment ? "equipment" : mode === ADJUST_TODAY_MODES.unavailable ? "unavailable" : "energy";
  useSheetBack(screenRef, manualEntryId ? `manual:${manualEntryId}` : step,
    manualEntryId ? step : step === "mode" ? null : step === "review" && proposal && !existing ? configurationStep : "mode",
    manualEntryId ? backFromManual : goBack, !busy && !confirmRestore);

  if (manualEntryId && proposal) {
    const unresolved = proposal.unresolved.find((item) => item.entryId === manualEntryId);
    const choices = manualReplacementChoices(
      proposal,
      manualEntryId,
      state.profile,
      query,
      state.substitutionPreferences,
    );
    return (
      <main ref={screenRef} className="screen detail-screen adjust-today-sheet">
        <SheetHeader title="Choose replacement" onClose={close} onBack={backFromManual} />
        <SearchInput onClear={() => setQuery("")} className="exercise-search" type="search" aria-label="Search replacement exercises" placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="adjust-option-list" data-exercise-search-scroll>
          <Eyebrow>TODAY ONLY</Eyebrow>
          <h1>Replace {unresolved?.label || "exercise"}</h1>
          <p>Choose an available exercise manually. Your recurring plan stays unchanged.</p>
          {choices.map((choice) => (
            <button className="choice-row" key={choice.id} onClick={() => { setProposal((current) => resolveTodayAdjustment(current, manualEntryId, choice.id, state.profile, state.substitutionPreferences)); setManualEntryId(null); setQuery(""); }}>
              <strong>{choice.name}</strong>
              <small>{choice.pattern.replaceAll("-", " ")} · today only</small>
            </button>
          ))}
          {!choices.length && <p className="offline-banner">No available exercise matches that search.</p>}
        </div>
      </main>
    );
  }

  return (
    <main ref={screenRef} className={`screen detail-screen adjust-today-sheet is-${step}-step`} aria-busy={busy || undefined}>
      <SheetHeader title={title} onClose={close} onBack={step !== "mode" ? goBack : undefined} />
      {step === "mode" && (
        <>
          <Eyebrow>TODAY ONLY</Eyebrow>
          <h1>What changed today?</h1>
          <div className="adjust-option-list">
            {ADJUST_TODAY_OPTIONS.map(([value, label, detail]) => (
              <button className="choice-row" key={value} onClick={() => chooseMode(value)}>
                <strong>{label}</strong><small>{detail}</small>
              </button>
            ))}
          </div>
          <p className="adjust-today-note">Any change applies only to today’s workout. Your training plan stays intact.</p>
        </>
      )}
      {step === "time" && (
        <>
          <Eyebrow>LESS TIME</Eyebrow>
          <h1>Time available</h1>
          <p>The target is an estimate. ROOK keeps the most important work first.</p>
          <div className="adjust-chip-grid" role="group" aria-label="Time available">
            {timePresets.map((value) => <button key={value} aria-pressed={minutes === value} className={minutes === value ? "is-selected" : ""} onClick={() => setMinutes(value)}>{value} min</button>)}
            <button aria-pressed={minutes === "custom"} className={minutes === "custom" ? "is-selected" : ""} onClick={() => setMinutes("custom")}>Custom</button>
          </div>
          {minutes === "custom" && <label className="adjust-custom-time"><span>Minutes</span><input type="number" min="15" max="180" inputMode="numeric" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} /></label>}
          <Button aria-busy={busy || undefined} disabled={busy || !chosenMinutes || chosenMinutes < 15 || chosenMinutes >= estimatedOriginal} onClick={generate}>{busy ? "ADJUSTING…" : `REVIEW ${chosenMinutes || ""}-MINUTE WORKOUT`}</Button>
        </>
      )}
      {step === "equipment" && (
        <>
          <Eyebrow>DIFFERENT EQUIPMENT</Eyebrow>
          <h1>Where are you training?</h1>
          <p>This choice is for today only. It does not change your default gym.</p>
          <section className="adjust-gym-picker">
            <Eyebrow>USE SAVED GYM</Eyebrow>
            <div className="adjust-saved-gyms" role="group" aria-label="Saved gyms">
              {(state.gymProfiles || []).map((gym) => {
                const selected = !customEquipment && selectedGymId === gym.id;
                return <button key={gym.id} aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => { setSelectedGymId(gym.id); setEquipment([...gym.equipment]); setCustomEquipment(false); }}><span><strong>{gym.name}</strong><small>{gymEquipmentSummary(gym.equipment)}</small></span><i aria-hidden="true">{selected ? "✓" : ""}</i></button>;
              })}
            </div>
            <Eyebrow>CUSTOM FOR TODAY</Eyebrow>
            <button className={`adjust-custom-equipment${customEquipment ? " is-selected" : ""}`} aria-pressed={customEquipment} onClick={() => { setSelectedGymId(null); setCustomEquipment(true); }}>
              <span><strong>Choose equipment</strong><small>Make a one-off selection for this workout.</small></span><i aria-hidden="true">{customEquipment ? "✓" : ""}</i>
            </button>
          </section>
          {customEquipment && (
            <div className="adjust-check-list" role="group" aria-label="Equipment available today">
              {TODAY_EQUIPMENT_OPTIONS.map(([value, label]) => <button key={value} aria-pressed={equipment.includes(value)} className={equipment.includes(value) ? "is-selected" : ""} onClick={() => toggleEquipment(value)}><span>{label}</span><i aria-hidden="true">{equipment.includes(value) ? "✓" : ""}</i></button>)}
            </div>
          )}
          <Button aria-busy={busy || undefined} disabled={busy || (!customEquipment && !selectedGymId) || !equipment.length} onClick={generate}>{busy ? "ADJUSTING…" : "REVIEW CHANGES"}</Button>
        </>
      )}
      {step === "energy" && (
        <>
          <Eyebrow>LOW ENERGY</Eyebrow>
          <h1>Keep the intent. Reduce the fatigue.</h1>
          <p>ROOK will protect the main movements, trim lower-priority volume and keep effort conservative.</p>
          <div className="adjust-calm-note">This is a training-volume adjustment, not medical advice.</div>
          <Button aria-busy={busy || undefined} disabled={busy} onClick={generate}>{busy ? "ADJUSTING…" : "REVIEW LOWER-FATIGUE WORKOUT"}</Button>
        </>
      )}
      {step === "unavailable" && (
        <>
          <Eyebrow>SPECIFIC EXERCISE UNAVAILABLE</Eyebrow>
          <h1>Choose affected exercises</h1>
          <p>Select one or more. ROOK will look for compatible replacements.</p>
          <div className="adjust-check-list" role="group" aria-label="Unavailable exercises">
            {(original?.exercises || []).map((exercise) => { const selected = unavailableEntryIds.includes(exercise.id); return <button key={exercise.id} aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => setUnavailableEntryIds((current) => selected ? current.filter((id) => id !== exercise.id) : [...current, exercise.id])}><span>{exerciseName(exercise)}</span><i aria-hidden="true">{selected ? "✓" : ""}</i></button>; })}
          </div>
          <Button aria-busy={busy || undefined} disabled={busy || !unavailableEntryIds.length} onClick={generate}>{busy ? "ADJUSTING…" : "FIND REPLACEMENTS"}</Button>
        </>
      )}
      {busy && <div className="adjust-loading" role="status"><i aria-hidden="true" /><strong>Adjusting today’s workout…</strong><small>Checking training intent and workout structure.</small></div>}
      {step === "review" && proposal && !busy && (
        <>
          <Eyebrow>TODAY ONLY · {adjustmentModeLabel(proposal.mode)}</Eyebrow>
          <h1>{proposal.workout.name}</h1>
          <p>{proposal.workout.exercises.length} exercises · Estimated ~{roundedEstimate(proposal.originalWorkout.estimatedMinutes || estimateSessionMinutes(proposal.originalWorkout.exercises))} min → ~{roundedEstimate(proposal.workout.estimatedMinutes)} min</p>
          {proposal.gymProfileName && <p className="adjust-gym-context">Using {proposal.gymProfileName} equipment today</p>}
          <section className="adjust-review-section">
            <Eyebrow>KEEPING</Eyebrow>
            {proposal.workout.exercises.map((exercise) => <div className="adjust-keep-row" key={exercise.id}><strong>{exerciseName(exercise)}</strong><small>{pluralize(exercise.sets.length, "set")}{state.profile.rirEnabled && Number.isFinite(Number(exercise.targetRir)) ? ` · ${exercise.targetRir} RIR` : ""}</small></div>)}
          </section>
          <section className="adjust-review-section">
            <Eyebrow>CHANGES</Eyebrow>
            {proposal.changes.length ? proposal.changes.map((change, index) => <div className={`adjust-change-row is-${change.kind}`} key={`${change.entryId}-${change.kind}-${index}`}><strong>{change.kind === "replaced" ? `${change.label} → ${change.nextLabel}` : change.label}</strong><span>{change.kind === "sets" ? `${change.from} sets → ${change.to} sets` : change.kind === "removed" ? "Removed" : change.kind === "rir" ? `${change.from} RIR → ${change.to} RIR` : "Replaced"}</span><small>{change.reason}</small></div>) : <p className="adjust-calm-note">This workout is already conservative. No useful change was made.</p>}
            {proposal.unresolved.map((item) => <div className="adjust-unresolved" role="alert" key={item.entryId}><strong>{item.label} needs a replacement</strong><small>{item.reason}</small><button className="text-button" onClick={() => setManualEntryId(item.entryId)}>Choose replacement</button></div>)}
          </section>
          <p className="adjust-today-note">Future workouts remain based on your original plan.</p>
          <SheetActionFooter enabled={!existing && !confirmRestore}>
          {error && <p className="backup-status is-error" role="alert">{error}</p>}
          {confirmRestore ? <div className="adjust-restore-confirm" role="alert"><strong>Restore the original workout?</strong><small>The adjustment will be removed. Your plan will not change.</small><Button variant="secondary" onClick={restore}>{persistenceError ? "TRY AGAIN" : "RESTORE ORIGINAL"}</Button><Button variant="quiet" onClick={() => { setConfirmRestore(false); setError(""); setPersistenceError(false); }}>KEEP ADJUSTMENT</Button></div> : existing ? <><Button variant="secondary" onClick={() => setConfirmRestore(true)}>RESTORE ORIGINAL</Button><Button variant="quiet" onClick={close}>DONE</Button></> : <><Button variant={error && !persistenceError ? "secondary" : "primary"} disabled={Boolean(error && !persistenceError) || proposal.unresolved.length || !proposal.meaningful} onClick={apply}>{persistenceError ? "TRY AGAIN" : "USE THIS WORKOUT"}</Button><Button variant="quiet" onClick={close}>CANCEL</Button></>}
          </SheetActionFooter>
        </>
      )}
      {error && step !== "review" && <p className="backup-status is-error" role="alert">{error}</p>}
    </main>
  );
}

function Detail({
  detail,
  state,
  update,
  close,
  setPage,
  setDetail,
  onPlanAccepted,
  onPlanImported,
  onLogout,
}) {
  const panelRef = useRef(null);
  const detailArtwork = useAvailableImage(state.profile.showExerciseImages !== false ? exerciseArt(detail?.exercise) : null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [detail]);
  if (detail?.freestylePicker) return <FreestyleExercisePicker state={state} update={update} close={close} Header={SheetHeader} />;
  if (detail?.restTraining)
    return (
      <RestTrainingSheet
        date={detail.restTraining}
        state={state}
        update={update}
        close={close}
        setPage={setPage}
        setDetail={setDetail}
      />
    );
  if (detail === "week") {
    const schedule = new Map(
      currentWeekSchedule(state).map((item) => [
        item.scheduledDate,
        item.workout,
      ]),
    );
    return (
      <main ref={panelRef} className="screen detail-screen">
        <SheetHeader
          title="This week"
          onClose={close}
          closeLabel="Close this week"
        />
        <Eyebrow>WEEK PLAN</Eyebrow>
        <h1>{state.program.name}</h1>
        {WEEKDAYS.map((day) => {
          const date = weekDate(day);
          const workout = schedule.get(isoDay(date));
          return (
            <div className="week-row" key={day}>
              <small>{day.toUpperCase()}</small>
              <span>{workout ? workout.name : "Rest"}</span>
              {workout && (
                <button
                  onClick={() => {
                    update((current) => {
                      current.selectedDay = day;
                      current.selectedDate = isoDay(date);
                      return current;
                    });
                    close();
                  }}
                >
                  View ›
                </button>
              )}
            </div>
          );
        })}
      </main>
    );
  }
  if (detail === "import-plan")
    return (
      <ImportPlan
        state={state}
        update={update}
        close={close}
        onPlanAccepted={onPlanImported}
      />
    );
  if (detail === "edit-plan" || detail?.editPlan)
    return (
      <EditPlan
        state={state}
        update={update}
        close={close}
        reviewExerciseIds={detail?.editPlan?.reviewExerciseIds || []}
        fullscreen={detail?.editPlan?.fullscreen === true}
        onExpand={() => setDetail({ editPlan: { ...(detail?.editPlan || {}), fullscreen: true } })}
      />
    );
  if (detail === "training-priorities")
    return (
      <TrainingPriorities
        state={state}
        update={update}
        close={close}
        adjustPlan={() => {
          update((current) => {
            current.coachDraft = "I want to adjust my current training plan using my saved priorities.";
            return current;
          });
          close();
          setPage("coach");
        }}
      />
    );
  if (detail === "training-restrictions")
    return (
      <TrainingRestrictions
        state={state}
        update={update}
        close={close}
        reviewPlan={(reviewExerciseIds) =>
          setDetail({ editPlan: { reviewExerciseIds } })
        }
      />
    );
  if (detail === "profile-details")
    return <ProfileDetails state={state} update={update} close={close} />;
  if (detail?.profileTrainingSetting)
    return (
      <ProfileTrainingSetting
        state={state}
        update={update}
        close={close}
        setting={detail.profileTrainingSetting}
        focus={detail.focus}
      />
    );
  if (detail === "change-plan")
    return (
      <ChangePlanSheet
        state={state}
        update={update}
        close={close}
        setDetail={setDetail}
        onPlanAccepted={onPlanAccepted}
      />
    );
  if (detail === "logging")
    return <Logging state={state} update={update} close={close} />;
  if (detail === "appearance")
    return <Appearance state={state} update={update} close={close} />;
  if (detail === "custom-exercises")
    return <CustomExercisesScreen state={state} update={update} close={close} />;
  if (detail === "import-workout-history")
    return <HistoricalWorkoutImportScreen state={state} update={update} close={close} />;
  if (detail === "export-workout-history")
    return <WorkoutHistoryExport state={state} close={close} SheetHeader={SheetHeader} Button={Button} />;
  if (detail === "gym-profiles")
    return <GymProfilesSheet state={state} update={update} close={close} />;
  if (detail === "backup-rook")
    return <BackupSheet state={state} update={update} close={close} />;
  if (detail === "backup-before-logout")
    return (
      <BackupSheet
        state={state}
        update={update}
        close={() => setDetail("logout-confirm")}
        onBackupCreated={() => setDetail("logout-confirm")}
      />
    );
  if (detail === "restore-backup")
    return <RestoreBackupSheet state={state} update={update} close={close} />;
  if (detail?.adjustToday)
    return (
      <AdjustTodaySheet
        state={state}
        update={update}
        close={close}
        request={detail.adjustToday}
      />
    );
  if (detail?.todayActions) {
    const { date, hasWorkout } = detail.todayActions;
    // Use live, date-scoped history: deletion/reload must never leave a stale
    // "already trained" flag, and viewing the menu must not create a workout.
    const hasCompleted = completedWorkoutsForDate(state.workouts, date).length > 0;
    return <main className="screen detail-screen today-actions-sheet">
      <SheetHeader title="More options" onClose={close}/>
      <button className="list-row" onClick={()=>setDetail({flexibleWeek:{}})}>Adjust week</button>
      {(hasWorkout || hasCompleted) && date === isoDay() && !state.activeWorkout && !state.activeOptionalSession &&
        <button className="list-row" onClick={()=>setDetail({todayFreestyle:{date}})}>
          {!hasWorkout && hasCompleted ? 'Start another freestyle workout' : 'Start freestyle workout'}
        </button>}
    </main>;
  }
  if (detail?.todayFreestyle) return <main className="sheet today-actions-sheet">
    <SheetHeader title="Freestyle workout" onClose={close}/>
    <FreestyleEntry state={state} update={update} setPage={page=>{close();setPage(page);}} setDetail={setDetail} date={detail.todayFreestyle.date} hideHistory/>
  </main>;
  if (detail?.plateCalculator)
    return (
      <PlateCalculatorSheet
        request={detail.plateCalculator}
        state={state}
        update={update}
        close={close}
      />
    );
  if (detail?.flexibleWeek)
    return <FlexibleWeekSheet state={state} update={update} close={close} Header={SheetHeader} request={detail.flexibleWeek} />;
  if (detail === "training-block")
    return <TrainingBlockScreen state={state} update={update} close={close} />;
  if (detail === "block-review")
    return <BlockReviewSheet state={state} update={update} close={close} Header={SheetHeader}/>;
  if (detail === "plan-history")
    return <PlanHistoryScreen state={state} update={update} close={close} />;
  if (detail === "workout-photos")
    return (
      <WorkoutPhotoTimelineScreen
        state={state}
        update={update}
        close={close}
        setDetail={setDetail}
      />
    );
  if (detail === "logout-confirm")
    return (
      <LogoutConfirmSheet
        close={close}
        backUpFirst={() => setDetail("backup-before-logout")}
        logOut={onLogout}
      />
    );
  if (detail?.progressFocus)
    return <ProgressFocusSheet state={state} update={update} close={close} />;
  if (detail?.weightOptIn)
    return (
      <WeightOptInSheet
        update={update}
        setDetail={setDetail}
        close={close}
      />
    );
  if (detail?.weightEditor)
    return (
      <WeightEditor
        state={state}
        update={update}
        request={detail.weightEditor}
        setDetail={setDetail}
      />
    );
  if (detail?.loggedExercises)
    return <LoggedExercises state={state} setDetail={setDetail} close={close} initial={detail.loggedExercises}/>;
  if (detail?.weightHistory)
    return (
      <WeightHistory
        state={state}
        setDetail={setDetail}
        close={close}
        saved={detail.saved}
      />
    );
  if (detail?.export)
    return (
      <ExportSheet
        request={detail.export}
        state={state}
        close={close}
      />
    );
  if (detail?.completedWorkout)
    return (
      <CompletedWorkoutDetail
        workoutId={detail.completedWorkout}
        state={state}
        update={update}
        close={close}
        setPage={setPage}
      />
    );
  if (detail?.todayExerciseActions)
    return (
      <TodayExerciseActions
        request={detail.todayExerciseActions}
        state={state}
        update={update}
        close={close}
      />
    );
  if (detail?.visual)
    return (
      <ExerciseVisualViewer exercise={detail.visual} close={close} />
    );
  if (detail?.workoutOptions)
    return (
      <ActiveWorkoutOptions
        close={close}
        onRestart={detail.onRestart}
      />
    );
  if (detail?.exerciseNote)
    return (
      <ExerciseNoteEditor
        exercise={detail.exerciseNote}
        state={state}
        update={update}
        close={close}
      />
    );
  if (detail?.options)
    return (
      <ActiveExerciseOptions
        exercise={detail.options}
        state={state}
        update={update}
        close={close}
        setDetail={setDetail}
      />
    );
  if (detail?.superset)
    return (
      <ActiveSuperset
        exercise={detail.superset}
        state={state}
        update={update}
        close={close}
      />
    );
  if (detail?.replace)
    return (
      <Replace
        exercise={detail.replace}
        state={state}
        update={update}
        close={close}
      />
    );
  const exercise = detail?.exercise;
  if (!exercise) return null;
  const history = exerciseHistoryEntries(
    state.workouts,
    exercise.exerciseId,
  );
  const latestSet = latestLoggedWeightSet(history);
  const unit = weightUnit(state.profile.units);
  const timed = exerciseMeasure(exercise) === "seconds";
  const catalogExercise = exerciseCatalog[exercise.exerciseId];
  const importedHistoryOnly = exercise.sets?.some(set => set.rawImport?.version === 2);
  const sourceOnlyHistory = importedHistoryOnly && !catalogExercise;
  const bodyweight = Boolean(catalogExercise?.bodyweight);
  const loadRequirement = exerciseLoadRequirement(exercise);
  const supportsEstimatedOneRepMax =
    exerciseSupportsEstimatedOneRepMax(exercise);
  const performance = exercisePerformance(state.workouts, exercise.exerciseId, {
    e1rmEligible: supportsEstimatedOneRepMax,
  });
  const e1rmHistory = performance.sessions
    .filter((session) => session.estimatedOneRepMax !== null)
    .slice(-8);
  const loadContext = catalogExercise?.equipment?.includes("resistance bands")
    ? "Band"
    : bodyweight
      ? "Bodyweight"
      : "No load";
  const latestHold = timed
    ? Math.max(
        0,
        ...(history.at(-1)?.sets || [])
          .filter((set) => set.completed)
          .map((set) => Number(set.reps) || 0),
      )
    : null;
  const currentLoad =
    loadRequirement === "none"
      ? loadContext
      : latestSet
        ? `${bodyweight && loadRequirement === "optional" ? "+" : ""}${displayWeight(latestSet.weight, state.profile.units)}`
        : bodyweight
          ? "Bodyweight"
          : loadRequirement === "optional"
            ? "No added weight"
            : "Not set yet";
  const progression = sourceOnlyHistory ? null : progressionFor(exercise, state.workouts, state.profile);
  const detailIllustration = detailArtwork.source;
  return (
    <main ref={panelRef} className="screen detail-screen">
      <SheetHeader
        title={exerciseName(exercise)}
        onClose={close}
        onBack={detail.returnToLogged?()=>setDetail({loggedExercises:detail.returnToLogged}):undefined}
        closeLabel={`Close ${exerciseName(exercise)} details`}
      />
      <div className={`exercise-detail-overview${detailIllustration ? " has-illustration" : ""}`}>
        <div>
          {sourceOnlyHistory ? (
            <>
              <Eyebrow>TRAINING HISTORY</Eyebrow>
              <h1>{exerciseName(exercise)}</h1>
              <p>Original imported results. ROOK catalog guidance is unavailable until mapped.</p>
            </>
          ) : history.length ? (
            <>
              <Eyebrow>
                {timed
                  ? "CURRENT HOLD TIME"
                  : loadRequirement === "none"
                    ? "CURRENT SET TYPE"
                    : latestSet || loadRequirement === "optional"
                      ? "CURRENT WORKING WEIGHT"
                      : "TRAINING HISTORY"}
              </Eyebrow>
              <h1>
                {timed
                  ? latestHold
                  : currentLoad}{" "}
                <small>
                  {timed
                    ? "sec"
                    : latestSet && loadRequirement !== "none"
                      ? unit
                      : ""}
                </small>
              </h1>
              {!timed && loadRequirement === "required" && !latestSet && (
                <p>Log a weight on a completed working set to establish this.</p>
              )}
            </>
          ) : (
            <>
              <Eyebrow>FIRST SESSION</Eyebrow>
              <h1>No history yet.</h1>
              <p>
                {loadRequirement === "required"
                  ? "Choose a comfortable starting load when you begin your first set."
                  : "Choose a comfortable starting effort when you begin your first set."}
              </p>
            </>
          )}
          {!importedHistoryOnly && <p className="exercise-detail-target">
            {exercise.prescriptionSource === 'freestyle' ? 'Freestyle · ' : 'Target · '}{targetLabel(exercise, state.profile.rirEnabled)}
          </p>}
          {exerciseNote(exercise) && (
            <p className="exercise-detail-program-note">{exerciseNote(exercise)}</p>
          )}
          {exercisePersonalNote(exercise) && (
            <p className="exercise-detail-personal-note">
              <span>Your note</span> · {exercisePersonalNote(exercise)}
            </p>
          )}
        </div>
        {detailIllustration && <ExerciseDetailIllustration exercise={exercise} src={detailIllustration} onError={detailArtwork.onError} />}
      </div>
      {performance.setCount > 0 && (
        <section className="exercise-performance-insights">
          <Eyebrow>PERFORMANCE</Eyebrow>
          <dl className="exercise-performance-metrics">
            <div>
              <dt>Best weight</dt>
              <dd>
                {bodyweight && loadRequirement === "optional" ? "+" : ""}
                {displayWeight(performance.bestWeight, state.profile.units)} {unit}
              </dd>
            </div>
            <div><dt>Best reps</dt><dd>{performance.bestReps}</dd></div>
            <div>
              <dt>Estimated 1RM</dt>
              <dd>
                {performance.estimatedOneRepMax !== null
                  ? `${displayEstimatedOneRepMax(performance.estimatedOneRepMax, state.profile.units)} ${unit}`
                  : "—"}
              </dd>
            </div>
          </dl>
          {supportsEstimatedOneRepMax && <EstimatedOneRepMaxChart sessions={e1rmHistory} units={state.profile.units} />}
          {supportsEstimatedOneRepMax && (
            <p className="exercise-e1rm-note">
              Estimated, not measured. {E1RM_FORMULA}; logged sets of 1–12 reps only.
            </p>
          )}
        </section>
      )}
      {progression && (
        <section className={`exercise-progression progression-${progression.type}`}>
          <Eyebrow>PROGRESSION</Eyebrow>
          <strong>{progression.title}</strong>
          <p>
            {progression.type === "progress" && progression.weight
              ? `Next: ${displayWeight(progression.weight, state.profile.units)} ${unit}. ${progression.detail}`
              : progression.detail}
          </p>
        </section>
      )}
      <section className="exercise-performance-history">
        <Eyebrow>HISTORY</Eyebrow>
        {history.length ? (
          [...history].reverse().map((item, index) => {
            const completedSets = item.sets.filter((value) => value.completed);
            const mixedLoads = loadRequirement !== "none" &&
              new Set(completedSets.map(value => value.weight ?? null)).size > 1;
            const set =
              [...completedSets]
                .reverse()
                .find(
                  (value) =>
                    value.weight !== null &&
                    value.weight !== undefined &&
                    value.weight !== "" &&
                    Number.isFinite(Number(value.weight)) &&
                    Number(value.weight) > 0,
                ) || completedSets[0];
            return (
              <div className="list-row" key={index}>
                <span>
                  <strong>
                    {mixedLoads ? completedSets.map(value => (
                      `${exerciseHistoryWeightLabel({ timed, bodyweight, loadRequirement, loadContext, weight: value.weight, units: state.profile.units })} × ${exerciseHistoryPerformanceLabel(item, [value])}`
                    )).join(" / ") : exerciseHistoryWeightLabel({
                      timed,
                      bodyweight,
                      loadRequirement,
                      loadContext,
                      weight: set?.weight,
                      units: state.profile.units,
                    })}
                  </strong>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(item.date))}
                  </small>
                </span>
                <span>
                  {!mixedLoads && exerciseHistoryPerformanceLabel(exercise, item.sets)}
                </span>
              </div>
            );
          })
        ) : (
          <p className="muted">Complete this exercise to start its history.</p>
        )}
      </section>
    </main>
  );
}
function Logging({ state, update, close }) {
  const p = state.profile;
  const [notificationCapability, setNotificationCapability] = useState(() =>
    restNotificationCapability(window),
  );
  const [notificationNotice, setNotificationNotice] = useState("");
  useEffect(() => {
    const refresh = () => setNotificationCapability(restNotificationCapability(window));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const setFlag = (key, value) =>
    update((current) => {
      current.profile[key] = value;
      if (key === "restTimerEnabled" && !value && current.activeWorkout)
        current.activeWorkout.rest = null;
      if (key === "recommendedWarmupsEnabled" && current.program)
        current.program.includeRecommendedWarmups = value;
      if (["recommendedWarmupsEnabled", "rampUpSetsEnabled"].includes(key))
        refreshWorkoutWarmup(
          current.activeWorkout,
          current.profile,
          current.program,
        );
      return current;
    });
  const changeRestNotifications = async (value) => {
    setNotificationNotice("");
    if (!value) {
      setFlag("restTimerNotificationsEnabled", false);
      return;
    }
    const result = await requestRestNotificationPermission(window);
    setNotificationCapability(restNotificationCapability(window));
    if (result.outcome === "granted") setFlag("restTimerNotificationsEnabled", true);
    else {
      setFlag("restTimerNotificationsEnabled", false);
      setNotificationNotice(
        result.outcome === "denied"
          ? "Notifications are blocked in device settings."
          : result.outcome === "unsupported"
            ? "Notifications aren’t available on this device."
            : "Notification access wasn’t enabled.",
      );
    }
  };
  return (
    <main className="screen detail-screen logging-screen">
      <SheetHeader title="Logging" onClose={close} closeLabel="Close Logging" />
      <section className="logging-group">
        <Eyebrow>EFFORT</Eyebrow>
        <SettingSwitch
          label="Track reps in reserve (RIR)"
          accessory={
            <HelpPopover
              id="logging-rir-help"
              label="What is RIR?"
              title="Reps in reserve"
            >
              How many clean reps you could still perform when the set ends. 0 =
              none left; 1 = one left; up to 4.
            </HelpPopover>
          }
          checked={p.rirEnabled}
          onChange={(value) => setFlag("rirEnabled", value)}
        />
      </section>
      <section className="logging-group">
        <Eyebrow>WARM-UP</Eyebrow>
        <SettingSwitch
          label="Recommended warm-ups"
          checked={p.recommendedWarmupsEnabled !== false}
          onChange={(value) => setFlag("recommendedWarmupsEnabled", value)}
        />
        <SettingSwitch
          label="Ramp-up sets"
          checked={p.rampUpSetsEnabled !== false}
          onChange={(value) => setFlag("rampUpSetsEnabled", value)}
        />
        <p className="setting-help">
          Ramp-up sets prepare the first heavy exercises and never count as
          working volume.
        </p>
      </section>
      <section className="logging-group">
        <Eyebrow>REST TIMER</Eyebrow>
        <SettingSwitch
          label="Rest timer"
          checked={p.restTimerEnabled}
          onChange={(value) => setFlag("restTimerEnabled", value)}
        />
        <label
          className={`rest-duration-setting ${p.restTimerEnabled ? "" : "disabled"}`}
        >
          <span>Rest duration</span>
          <select
            aria-label="Rest duration"
            disabled={!p.restTimerEnabled}
            value={p.restTimerSeconds || ""}
            onChange={(event) =>
              update((current) => {
                current.profile.restTimerSeconds = event.target.value
                  ? Number(event.target.value)
                  : null;
                return current;
              })
            }
          >
            <option value="">By exercise</option>
            {[60, 90, 120, 180].map((seconds) => (
              <option key={seconds} value={seconds}>
                {formatDuration(seconds)}
              </option>
            ))}
          </select>
        </label>
        <SettingSwitch
          label="Auto-start after completed set"
          checked={p.restTimerAutoStart}
          disabled={!p.restTimerEnabled}
          onChange={(value) => setFlag("restTimerAutoStart", value)}
        />
        <div>
        <SettingSwitch
          label="Rest timer notifications"
          checked={
            p.restTimerNotificationsEnabled === true &&
            notificationCapability.permission === "granted"
          }
          disabled={
            !p.restTimerEnabled ||
            !notificationCapability.supported ||
            notificationCapability.permission === "denied"
          }
          onChange={changeRestNotifications}
        />
        <p className="setting-help rest-notification-help">
          {restNotificationSettingCopy(notificationCapability)}
        </p>
        {notificationNotice && (
          <p className="rest-notification-status" role="status">
            {notificationNotice}
          </p>
        )}
        </div>
      </section>
      <section className="logging-group increments-group">
        <Eyebrow>UNITS</Eyebrow>
        <div
          className="segmented unit-segmented"
          data-unit={p.units}
          aria-label="Weight units"
        >
          {["kg", "lb"].map((unit) => (
            <button
              key={unit}
              className={p.units === unit ? "active" : ""}
              aria-pressed={p.units === unit}
              onClick={() => {
                if (p.units === unit) return;
                update((current) => {
                  current.profile.units = unit;
                  return current;
                });
              }}
            >
              {unit}
            </button>
          ))}
        </div>
        <div
          key={p.units}
          className="unit-dependent-values"
        >
          <Eyebrow className="increments-heading">
            DEFAULT INCREMENTS · {weightUnit(p.units).toUpperCase()}
          </Eyebrow>
          {Object.entries(p.increments).map(([key, value]) => (
            <IncrementInput
              key={key}
              label={titleCase(key)}
              value={value}
              units={p.units}
              update={(shown) =>
                update((current) => {
                  current.profile.increments[key] = storedWeight(
                    shown,
                    current.profile.units,
                  );
                  return current;
                })
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}
function Appearance({ state, update, close }) {
  const showExerciseImages = state.profile.showExerciseImages !== false;
  const appearancePreference = ["system", "light", "dark"].includes(
    state.profile.appearancePreference,
  )
    ? state.profile.appearancePreference
    : state.profile.themePreference === "premium"
      ? "system"
      : ["system", "light", "dark"].includes(state.profile.themePreference)
        ? state.profile.themePreference
        : "light";
  const stylePreference = ["standard", "premium"].includes(
    state.profile.stylePreference,
  )
    ? state.profile.stylePreference
    : state.profile.themePreference === "premium"
      ? "premium"
      : "standard";
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);
  const themeHelp =
    appearancePreference === "system"
      ? `Follows your device appearance — ${systemDark ? "Dark" : "Light"} right now.`
      : appearancePreference === "dark"
        ? "Always use ROOK’s dark appearance."
        : "Always use ROOK’s light appearance.";
  const setAppearance = (value) =>
    update((current) => {
      current.profile.appearancePreference = value;
      current.profile.themePreference = legacyThemePreference(
        value,
        current.profile.stylePreference || stylePreference,
      );
      return current;
    });
  const setStyle = (value) =>
    update((current) => {
      current.profile.stylePreference = value;
      current.profile.themePreference = legacyThemePreference(
        current.profile.appearancePreference || appearancePreference,
        value,
      );
      return current;
    });
  return (
    <main className="screen detail-screen logging-screen appearance-screen">
      <SheetHeader
        title="Appearance"
        onClose={close}
        closeLabel="Close Appearance"
      />
      <section className="logging-group appearance-theme-group">
        <Eyebrow>THEME</Eyebrow>
        <div
          className="appearance-segmented"
          role="group"
          aria-label="Theme"
        >
          {[
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={appearancePreference === value}
              onClick={() => setAppearance(value)}
            >
              <i aria-hidden="true">✓</i>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
        <small className="appearance-theme-help" aria-live="polite">
          {themeHelp}
        </small>
      </section>
      <section className="logging-group appearance-style-group">
        <Eyebrow>STYLE</Eyebrow>
        <div className="appearance-style-choices">
          {[
            ["standard", "Standard", "ROOK green."],
            ["premium", "Premium", "Warm gold accents on the same surfaces."],
          ].map(([value, label, help]) => (
            <button
              type="button"
              className="appearance-style-choice"
              data-style-option={value}
              key={value}
              aria-pressed={stylePreference === value}
              onClick={() => setStyle(value)}
            >
              <span>
                <strong>{label}</strong>
                <small>{help}</small>
              </span>
              <i aria-hidden="true">✓</i>
            </button>
          ))}
        </div>
      </section>
      <section className="logging-group">
        <Eyebrow>EXERCISES</Eyebrow>
        <SettingSwitch
          label="Exercise illustrations"
          checked={showExerciseImages}
          onChange={(value) =>
            update((current) => {
              current.profile.showExerciseImages = value;
              return current;
            })
          }
        />
        <p className="setting-help">
          Show exercise images while training and in exercise details.
        </p>
      </section>
      <section className="appearance-credits">
        <Eyebrow>ILLUSTRATION CREDITS</Eyebrow>
        <p>
          Library illustrations by{" "}
          <a
            href="https://bryllim.github.io/workout-guide/"
            target="_blank"
            rel="noreferrer"
          >
            Bryl Lim / Everkinetic
          </a>
          , color-adapted for ROOK. Licensed under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 4.0
          </a>
          .
        </p>
        <p>Additional exercise illustrations created for ROOK with AI assistance.</p>
      </section>
    </main>
  );
}
function ExerciseDetailIllustration({ exercise, src, onError }) {
  const [open, setOpen] = useState(false);
  const background = useRef(null);
  const trigger = useRef(null);
  return <>
    <button ref={trigger} type="button" id={`detail-exercise-art-${exercise.id}`} className="exercise-detail-art-button"
      aria-label={`View ${exerciseName(exercise)} illustration`}
      onClick={event=>{background.current=event.currentTarget.closest('main');setOpen(true);}}>
      <img className="exercise-detail-art" onError={onError} src={src} alt="" aria-hidden="true" decoding="async" fetchpriority="high" />
    </button>
    {open && createPortal(<ModalLayer presentation="fullscreen" instantClose lockDocument={false} backgroundRef={background} returnFocusRef={trigger} close={()=>setOpen(false)}>
      <ExerciseVisualViewer exercise={exercise} />
    </ModalLayer>,document.body)}
  </>;
}
function ExerciseVisualViewer({ exercise, close }) {
  const artwork = exerciseArt(exercise);
  const availableArtwork = useAvailableImage(artwork);
  if (!artwork) return null;
  return (
    <main
      className="exercise-visual-viewer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-visual-viewer-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="exercise-visual-viewer-header">
        <span aria-hidden="true" />
        <h2 id="exercise-visual-viewer-title">{exerciseName(exercise)}</h2>
        <button
          type="button"
          className="exercise-visual-viewer-close"
          aria-label="Close visual viewer"
          onClick={close}
          autoFocus
        >
          ×
        </button>
      </header>
      <div className="exercise-visual-stage">
        {availableArtwork.source ? (
        <img
          src={availableArtwork.source}
          onError={availableArtwork.onError}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchpriority="high"
        />
        ) : <p role="status">Illustration unavailable. Reconnect to try again.</p>}
      </div>
    </main>
  );
}
function TodayExerciseActions({ request, state, update, close }) {
  const [confirming, setConfirming] = useState(null);
  const liveSourceWorkout = state.program?.days.find(
    (day) => day.id === request.workoutId,
  );
  const sourceSnapshot = useRef(
    liveSourceWorkout ? clone(liveSourceWorkout) : null,
  );
  const sourceWorkout = liveSourceWorkout || sourceSnapshot.current;
  const sourceEntry = sourceWorkout?.exercises.find(
    (entry) => entry.id === request.planEntryId,
  );
  const name = exerciseName(sourceEntry || request.exercise);
  const planDate = request.planDate;
  const occurrence = plannedWorkoutForDate(state, localDate(planDate));
  const occurrenceIsLast = (occurrence?.exercises.length || 0) <= 1;
  const recurringIsLast = (sourceWorkout?.exercises.length || 0) <= 1;
  const wouldEmptyProgram = recurringIsLast && state.program.days.length <= 1;
  const activeSource = state.activeWorkout?.programDayId === request.workoutId;
  const isToday = planDate === isoDay();
  const dateLabel = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(localDate(planDate));
  const previousOverride = clone(
    state.workoutOccurrenceOverrides?.[planDate]?.[request.workoutId] || null,
  );
  const weeklySnapshot = sourceWorkout
    ? {
        workout: clone(sourceWorkout),
        index: state.program.days.findIndex(
          (day) => day.id === request.workoutId,
        ),
        availableDays: clone(state.profile.availableDays || []),
        daysPerWeek: state.profile.daysPerWeek,
      }
    : null;
  const finishAction = (notice) => {
    triggerHaptic("success");
    close();
    request.onApplied?.(notice);
  };
  const removeOccurrence = () => {
    runRookViewTransition(() => {
      update((current) =>
        removeExerciseFromOccurrence(current, {
          planDate,
          workoutId: request.workoutId,
          planEntryId: request.planEntryId,
        }),
      );
      finishAction({
        message: occurrenceIsLast
          ? `${isToday ? "Today’s" : dateLabel} workout skipped`
          : `Removed from ${dateLabel}`,
        undo: () =>
          runRookViewTransition(() =>
            update((current) =>
              restoreOccurrenceOverride(current, {
                planDate,
                workoutId: request.workoutId,
                previousOverride,
              }),
            ),
          ),
      });
    });
  };
  const removeWeekly = () => {
    if (!weeklySnapshot || wouldEmptyProgram) return;
    runRookViewTransition(() => {
      update((current) =>
        removeExerciseFromWeeklyPlan(
          current,
          request.workoutId,
          request.planEntryId,
        ),
      );
      finishAction({
        message: recurringIsLast
          ? `${sourceWorkout.weekday} is now a rest day`
          : `Removed from future ${sourceWorkout.name} workouts`,
        undo: () =>
          runRookViewTransition(() =>
            update((current) =>
              restoreWeeklyPlanWorkout(current, weeklySnapshot),
            ),
          ),
      });
    });
  };
  const confirmOccurrence = confirming === "occurrence";
  const confirmWeekly = confirming === "weekly";
  const titleId = "today-exercise-actions-title";
  if (confirming)
    return (
      <main
        className="sheet today-exercise-actions-sheet confirming"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" aria-label="Close" onClick={close}>
          ×
        </button>
        <Eyebrow>{confirmOccurrence ? "SKIP WORKOUT" : "WEEKLY PLAN"}</Eyebrow>
        <h2 id={titleId}>
          {confirmOccurrence
            ? `Skip the ${dateLabel} workout?`
            : recurringIsLast
              ? `Make ${sourceWorkout.weekday} a rest day?`
              : `Remove ${name} from ${sourceWorkout.name}?`}
        </h2>
        <p>
          {confirmOccurrence
            ? `${name} is the only exercise left. Your weekly plan won’t change.`
            : recurringIsLast
              ? `${name} is the only exercise in ${sourceWorkout.name}. The current workout and past history won’t change.`
              : `It will be removed from future ${sourceWorkout.name} workouts. ${activeSource ? "Your current workout " : "Past workouts and history "}won’t change.`}
        </p>
        <div className="today-exercise-confirm-actions">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            CANCEL
          </Button>
          <Button
            variant="danger"
            className="today-exercise-danger"
            onClick={confirmOccurrence ? removeOccurrence : removeWeekly}
          >
            {confirmOccurrence
              ? "SKIP WORKOUT"
              : recurringIsLast
                ? "MAKE REST DAY"
                : activeSource
                  ? "REMOVE FROM FUTURE"
                  : "REMOVE FROM PLAN"}
          </Button>
        </div>
      </main>
    );
  return (
    <main
      className="sheet today-exercise-actions-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
      <h2 id={titleId}>{`Remove ${name}?`}</h2>
      <button
        type="button"
        className="choice-row today-exercise-remove-occurrence"
        onClick={() =>
          occurrenceIsLast ? setConfirming("occurrence") : removeOccurrence()
        }
      >
        <strong>{`Remove from ${dateLabel}`}</strong>
        <small>Only this scheduled workout.</small>
      </button>
      <button
        type="button"
        className="choice-row today-exercise-remove-weekly"
        disabled={wouldEmptyProgram}
        onClick={() => setConfirming("weekly")}
      >
        <strong>
          {activeSource
            ? `Remove from future ${sourceWorkout.name}`
            : `Remove from ${sourceWorkout.name}`}
        </strong>
        <small>
          {wouldEmptyProgram
            ? "Keep at least one workout in your plan."
            : activeSource
              ? "Your current workout stays unchanged."
              : `Also removes it from future ${sourceWorkout.name} workouts.`}
        </small>
      </button>
      <button type="button" className="today-exercise-cancel" onClick={close}>
        CANCEL
      </button>
    </main>
  );
}
function WorkoutOptionsSheet({ children, className, titleId, describedBy, close }) {
  const sheetRef = useRef(null);
  return <main ref={sheetRef} className={`sheet replace-sheet ${className}`} role="dialog" aria-modal="true"
    aria-labelledby={titleId} aria-describedby={describedBy} onClick={event=>event.stopPropagation()}>
    <header className="sheet-header-chrome">
      <SheetDragHandle sheetRef={sheetRef} close={close}/>
      <button className="sheet-close" aria-label="Close" onClick={close}>×</button>
    </header>
    <div className="sheet-scroll">{children}</div>
  </main>;
}
function ActiveWorkoutOptions({ close, onRestart }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <WorkoutOptionsSheet
      className={`active-workout-options-sheet${confirming ? " confirming-restart" : ""}`}
      titleId="active-workout-options-title"
      describedBy={confirming ? "restart-workout-detail" : undefined}
      close={close}
    >
      {confirming ? (
        <>
          <Eyebrow>RESTART SESSION</Eyebrow>
          <h2 id="active-workout-options-title">Restart workout?</h2>
          <p id="restart-workout-detail">
            This will clear all progress from this workout and start it again
            from the beginning. This can’t be undone.
          </p>
          <div className="workout-restart-confirm-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              CANCEL
            </Button>
            <Button variant="danger" className="workout-restart-danger" onClick={onRestart}>
              RESTART WORKOUT
            </Button>
          </div>
        </>
      ) : (
        <>
          <Eyebrow>WORKOUT</Eyebrow>
          <h2 id="active-workout-options-title">Workout options</h2>
          <p>Your progress is saved automatically.</p>
          <button
            type="button"
            className="choice-row workout-restart-option"
            onClick={() => setConfirming(true)}
          >
            <strong>Restart workout</strong>
            <small>Clear this session and begin again.</small>
          </button>
        </>
      )}
    </WorkoutOptionsSheet>
  );
}
function ExerciseNoteEditor({ exercise, state, update, close }) {
  const sheetRef = useRef(null);
  const saving = useRef(false);
  const active = state.activeWorkout;
  const current =
    active?.exercises?.find((item) => item.id === exercise.id) || exercise;
  const initialNote = exercisePersonalNote(current) || "";
  const {reference}=exerciseNotePresentation(current,state.program);
  const [draft, setDraft] = useState(initialNote);
  const templateDay = state.program?.days?.find(
    (day) => day.id === active?.programDayId,
  );
  const persistsToTemplate = Boolean(
    templateDay?.exercises?.some((item) => item.id === current.id),
  );
  const helperId = `exercise-note-helper-${current.id}`;
  const save = (value = draft) => {
    if (saving.current) return;
    saving.current = true;
    update((next) => {
      saveActiveExercisePersonalNote(next, current.id, value);
      return next;
    });
    close();
  };
  return (
    <main
      ref={sheetRef}
      className="sheet replace-sheet exercise-note-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-note-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="sheet-header-chrome">
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
      </header>
      <div className="sheet-scroll">
      <h2 id="exercise-note-title">Exercise notes</h2>
      <p className="exercise-note-exercise">{exerciseName(current)}</p>
      {reference&&<section className="exercise-source-reference" aria-label="Original import reference">
        <Eyebrow>ORIGINAL IMPORT · REFERENCE ONLY</Eyebrow>
        <p>Original wording may include unselected options. Follow the prescription under Target.</p>
        <blockquote>{reference}</blockquote>
      </section>}
      <Eyebrow>PERSONAL REMINDER</Eyebrow>
      <label className="exercise-note-field">
        <span className="visually-hidden">Exercise note</span>
        <textarea
          aria-describedby={helperId}
          maxLength={EXERCISE_PERSONAL_NOTE_MAX_LENGTH}
          placeholder="Add a personal reminder…"
          rows={3}
          value={draft}
          onChange={(event) =>
            setDraft(
              event.target.value.slice(0, EXERCISE_PERSONAL_NOTE_MAX_LENGTH),
            )
          }
        />
      </label>
      <div className="exercise-note-meta" id={helperId}>
        <small>
          {persistsToTemplate
            ? `Shown next time in ${templateDay.name || active?.name || "this workout"}.`
            : "Saved with this workout only."}
        </small>
        <small aria-live="polite">
          {draft.length} / {EXERCISE_PERSONAL_NOTE_MAX_LENGTH}
        </small>
      </div>
      </div>
      <SheetActionFooter separate gutter={22} containViewport>
      <button type="button" className="button primary exercise-note-save" onPointerDown={event=>{if(event.button===0)event.preventDefault();}} onClick={() => save()}>
        SAVE
      </button>
      {initialNote && (
        <button
          type="button"
          className="text-button exercise-note-remove"
          onClick={() => save("")}
        >
          Remove note
        </button>
      )}
      </SheetActionFooter>
    </main>
  );
}

function ActiveExerciseOptions({ exercise, state, update, close, setDetail }) {
  const active = state.activeWorkout;
  const exerciseIndex = active?.exercises.findIndex(
    (item) => item.id === exercise.id,
  );
  const current = active?.exercises[exerciseIndex] || exercise;
  const pair =
    active && exerciseIndex >= 0
      ? supersetMeta(active.exercises, exerciseIndex)
      : null;
  const locked = Boolean(
    pair
      ? pair.members.some(({ exercise: member }) =>
          member.sets.some((set) => set.completed),
        )
      : current?.sets.some((set) => set.completed),
  );
  const canCreateSuperset = Boolean(
    active &&
      exerciseIndex >= 0 &&
      !pair &&
      active.exercises.some(
        (candidate, index) =>
          index > exerciseIndex &&
          !candidate.supersetId &&
          candidate.sets.length === current?.sets.length &&
          !candidate.sets.some((set) => set.completed),
      ),
  );
  return (
    <WorkoutOptionsSheet
      className="active-exercise-options-sheet"
      titleId="active-exercise-options-title"
      close={close}
    >
      <Eyebrow>EXERCISE</Eyebrow>
      <h2 id="active-exercise-options-title">Exercise options</h2>
      <button className="list-row active-exercise-note-action" onClick={() => setDetail({ exerciseNote: current })}>
        <span>{!exercisePersonalNote(current) && <span aria-hidden="true">+ </span>}{exercisePersonalNote(current) ? "Edit note" : "Add note"}</span>
      </button>
      {active?.source === 'freestyle' && current && !current.sets.some(set => set.completed) && (
        <button className="choice-row" onClick={() => {
          update(state => removeFreestyleExercise(state, current.id));
          close();
        }}>Remove exercise</button>
      )}
      <button
        className="choice-row"
        onClick={() => setDetail({ exercise: current })}
      >
        <strong>View exercise details</strong>
        <small>See history and progression guidance.</small>
      </button>
      {(pair || canCreateSuperset) && (
        <button
          className="choice-row"
          disabled={locked}
          onClick={() => setDetail({ superset: current })}
        >
          <strong>{pair ? "Manage superset" : "Create superset"}</strong>
          <small>
            {locked
              ? "Locked because work has already been logged."
              : pair
                ? "Review or remove the current exercise pair."
                : "Pair this with an upcoming exercise."}
          </small>
        </button>
      )}
    </WorkoutOptionsSheet>
  );
}

function ActiveSuperset({ exercise, state, update, close }) {
  const active = state.activeWorkout;
  const exerciseIndex = active?.exercises.findIndex(
    (item) => item.id === exercise.id,
  );
  const current = active?.exercises[exerciseIndex] || null;
  const pair =
    active && exerciseIndex >= 0
      ? supersetMeta(active.exercises, exerciseIndex)
      : null;
  const locked = Boolean(
    pair
      ? pair.members.some(({ exercise: member }) =>
          member.sets.some((set) => set.completed),
        )
      : current?.sets.some((set) => set.completed),
  );
  const candidates = active
    ? active.exercises.filter(
        (candidate, index) =>
          index > exerciseIndex &&
          candidate.id !== current?.id &&
          !candidate.supersetId &&
          candidate.sets.length === current?.sets.length &&
          !candidate.sets.some((set) => set.completed),
      )
    : [];
  const createPair = (partnerId) => {
    update((state) => {
      const workout = state.activeWorkout;
      if (!workout) return state;
      const paired = pairActiveWorkoutExercises(
        workout.exercises,
        exercise.id,
        partnerId,
        `active-superset-${Date.now()}`,
      );
      if (!paired) return state;
      workout.exerciseIndex = workout.exercises.findIndex(
        (item) => item.id === exercise.id,
      );
      workout.rest = null;
      workout.updatedAt = Date.now();
      return state;
    });
    close();
  };
  const removePair = () => {
    update((state) => {
      const workout = state.activeWorkout;
      if (!workout || !pair) return state;
      if (!unpairActiveWorkoutExercises(workout.exercises, pair.id)) return state;
      workout.exerciseIndex = workout.exercises.findIndex(
        (item) => item.id === exercise.id,
      );
      workout.rest = null;
      workout.updatedAt = Date.now();
      return state;
    });
    close();
  };
  if (!pair && !locked && candidates.length) {
    return (
      <SupersetPartnerPicker
        exercise={current || exercise}
        candidates={candidates}
        profile={state.profile}
        className="active-superset-sheet"
        onClose={close}
        onConfirm={createPair}
      />
    );
  }
  return (
    <main
      className="sheet replace-sheet active-superset-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-superset-title"
      onClick={(event) => event.stopPropagation()}
    >
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
      <div className="sheet-scroll">
        <Eyebrow>{pair ? "WORKOUT SUPERSET" : "CREATE SUPERSET"}</Eyebrow>
        <h2 id="active-superset-title">
          {pair ? "Manage this pair" : `Pair ${exerciseName(current || exercise)}`}
        </h2>
        {pair ? (
          <>
            <p>
              {exerciseName(pair.members[0].exercise)} and {" "}
              {exerciseName(pair.members[1].exercise)} alternate one set each,
              then you rest.
            </p>
            <button
              className="choice-row active-superset-remove"
              disabled={locked}
              onClick={removePair}
            >
              <strong>Remove superset</strong>
              <small>
                {locked
                  ? "Locked because work has already been logged."
                  : "Keep both exercises and return them to normal order."}
              </small>
            </button>
          </>
        ) : (
          <>
            <p>
              Choose an upcoming exercise. Rook will alternate one set of each,
              then start your rest.
            </p>
            {locked ? (
              <p className="offline-banner">
                Superset changes are locked after work is logged.
              </p>
            ) : (
              <p className="offline-banner">
                No unstarted upcoming exercise is available to pair.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Replace({ exercise, state, update, close }) {
  const sheetRef = useRef(null);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [picker, setPicker] = useState(false);
  useExerciseSearchSheet(sheetRef, picker, { focusedSearch: true });
  useEffect(() => {
    let cancelled = false;
    afterVisibleFrame().then(() => {
      if (!cancelled) setSuggestionsReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  const gymContext = effectiveGymContext(state, state.activeWorkout);
  const replacementProfile = gymContext.profile;
  const replacementEquipmentKey = replacementProfile.equipment.join("|");
  const preferenceKey = (state.substitutionPreferences || [])
    .map((item) => `${item.sourceExerciseId}:${item.replacementExerciseId}:${item.gymProfileId || "*"}:${item.updatedAt}`)
    .join("|");
  const programIds = state.program.days.flatMap((day) =>
    day.exercises.map((item) => item.exerciseId),
  );
  const activeIds = (state.activeWorkout?.exercises || [])
    .filter((item) => item.id !== exercise.id)
    .map((item) => item.exerciseId);
  const customCandidates = availableCustomExerciseItems(state);
  const substitutionCatalog = [...Object.values(exerciseCatalog), ...customCandidates];
  const customCandidateKey = customCandidates.map((item) => `${item.id}:${item.name}:${item.pattern}:${item.muscles?.join(",")}:${item.equipment?.join(",")}`).join("|");
  const compatible = useMemo(
    () =>
      suggestionsReady ? compatibleReplacementCandidates(exercise, replacementProfile, programIds, {
        preferences: state.substitutionPreferences,
        gymProfileId: gymContext.id,
        candidates: substitutionCatalog,
      }).filter((item) => !activeIds.includes(item.id)) : [],
    [
      exercise.exerciseId,
      exercise.importedExercise?.pattern,
      replacementEquipmentKey,
      state.profile.avoid,
      state.profile.experience,
      gymContext.id,
      preferenceKey,
      programIds.join("|"),
      activeIds.join("|"),
      customCandidateKey,
      suggestionsReady,
    ],
  );
  const compatibleKey = compatible.map((item) => item.id).join("|");
  const allAllowed = useMemo(
    () =>
      picker ? userSelectableReplacementCandidates(
        exercise,
        replacementProfile,
        activeIds,
        {
          preferences: state.substitutionPreferences,
          gymProfileId: gymContext.id,
          candidates: substitutionCatalog,
        },
      ) : [],
    [
      exercise.exerciseId,
      replacementEquipmentKey,
      state.profile.avoid,
      gymContext.id,
      preferenceKey,
      activeIds.join("|"),
      customCandidateKey,
      picker,
    ],
  );
  const [choices, setChoices] = useState(() => compatible.slice(0, 3));
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(() => compatible.length <= 3);
  const [query, setQuery] = useState("");
  const [rememberPreference, setRememberPreference] = useState(false);
  useEffect(() => {
    // Keep local suggestions stable until their inputs change. More compatible options
    // reveals the next locally ranked candidates without a network request.
    setChoices(compatible.slice(0, 3));
    setLoadingMore(false);
    setNoMore(compatible.length <= 3);
    setPicker(false);
    setQuery("");
    setRememberPreference(false);
  }, [exercise.id, compatibleKey]);
  const more = async () => {
    if (loadingMore || noMore) return;
    setLoadingMore(true);
    const shown = new Set(choices.map((item) => item.id));
    try {
      await afterVisibleFrame();
      const next = compatible.filter((item) => !shown.has(item.id)).slice(0, 3);
      if (next.length) {
        setChoices((current) =>
          [...current, ...next].filter(
            (item, index, list) =>
              list.findIndex((value) => value.id === item.id) === index,
          ),
        );
        if (shown.size + next.length >= compatible.length) setNoMore(true);
      } else setNoMore(true);
    } finally {
      setLoadingMore(false);
    }
  };
  const replace = (choice, allowAnyAllowed = false) => {
    update((current) => {
      const active = current.activeWorkout;
      if (!active) return current;
      const index = active.exercises.findIndex(
        (item) => item.id === exercise.id,
      );
      const customRecord = (current.customExercises || []).find((item) => item.id === choice.id && !item.deletedAt);
      const catalog = exerciseCatalog[choice.id] || customExerciseCatalogItem(customRecord);
      const currentCandidates = [...Object.values(exerciseCatalog), ...availableCustomExerciseItems(current)];
      if (
        index < 0 ||
        active.exercises[index].sets.some((set) => set.completed) ||
        !catalog ||
        active.exercises.some(
          (item, candidateIndex) =>
            candidateIndex !== index && item.exerciseId === choice.id,
        ) ||
        !(allowAnyAllowed
          ? userSelectableReplacementCandidates(
              active.exercises[index],
              effectiveGymProfile(current, active),
              active.exercises
                .filter((_, candidateIndex) => candidateIndex !== index)
                .map((item) => item.exerciseId),
              {
                preferences: current.substitutionPreferences,
                gymProfileId: effectiveGymContext(current, active).id,
                candidates: currentCandidates,
              },
            )
          : compatibleReplacementCandidates(
              active.exercises[index],
              effectiveGymProfile(current, active),
              [],
              {
                preferences: current.substitutionPreferences,
                gymProfileId: effectiveGymContext(current, active).id,
                candidates: currentCandidates,
              },
            )
        ).some((item) => item.id === choice.id)
      )
        return current;
      const stored = clone(active.exercises[index]);
      delete stored.importedName;
      delete stored.originalImportedName;
      delete stored.importedExercise;
      delete stored.matchStatus;
      active.exercises[index] = {
        ...stored,
        exerciseId: choice.id,
        exerciseSource: customRecord ? "custom" : "catalog",
        ...(customRecord
          ? {
              importedName: customRecord.name,
              originalImportedName: customRecord.name,
              importedExercise: customExerciseSnapshot(customRecord),
              matchStatus: "confirmed-custom",
              measure: catalog.measure,
              loadRequirement: catalog.loadRequirement,
            }
          : {}),
        restSeconds: catalog.restSeconds,
        defaultIncrement: catalog.increment,
        sets: stored.sets.map((set) => ({
          ...set,
          weight: null,
          completed: false,
          rir: null,
          completedAt: undefined,
        })),
      };
      active.rest = null;
      if (rememberPreference)
        recordSubstitutionPreference(current, {
          sourceExerciseId: stored.exerciseId,
          replacementExerciseId: choice.id,
          gymProfileId: effectiveGymContext(current, active).id,
        });
      refreshWorkoutWarmup(active, current.profile, current.program);
      active.updatedAt = Date.now();
      return current;
    });
    close();
  };
  const pickerChoices = rankExerciseSearch(allAllowed.filter(
    (item) =>
      !query.trim() ||
      exerciseMatchesQuery(item, query),
  ), query);
  const choiceButton = (choice, allowAnyAllowed = false) => (
    <button
      className="choice-row"
      key={choice.id}
      onClick={() => replace(choice, allowAnyAllowed)}
    >
      <strong>{choice.name}</strong>
      <small>
        {substitutionReason(
          exerciseCatalog[exercise.exerciseId] || exercise.importedExercise,
          choice,
          (state.substitutionPreferences || []).some(
            (item) =>
              item.sourceExerciseId === exercise.exerciseId &&
              item.replacementExerciseId === choice.id &&
              (!item.gymProfileId || item.gymProfileId === gymContext.id),
          ),
        )}
      </small>
    </button>
  );
  return (
    <main
      ref={sheetRef}
      className="sheet replace-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="sheet-header-chrome">
        <SheetDragHandle sheetRef={sheetRef} close={close} />
        <button className="sheet-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>
      <div className={`sheet-scroll${picker ? " exercise-search-body" : ""}`}>
        {picker ? (
          <>
            <button
              className="sheet-back text-button"
              onClick={() => {
                setPicker(false);
                setQuery("");
              }}
            >
              ‹ Compatible options
            </button>
            <h2 id="replace-title">All available exercises</h2>
            <SearchInput onClear={() => setQuery("")}
              className="exercise-search"
              type="search"
              aria-label="Search all available exercises"
              placeholder="Search exercises"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div data-exercise-search-scroll>
            <Eyebrow>CHOOSE ANOTHER EXERCISE</Eyebrow>
            <p>
              Choose any exercise available with your equipment. Training
              restrictions still apply.
            </p>
            {pickerChoices.length ? (
              <div className="picker-results">
                {pickerChoices.map((choice) => choiceButton(choice, true))}
              </div>
            ) : (
              <p className="offline-banner">
                No available exercise matches that search.
              </p>
            )}
            </div>
          </>
        ) : (
          <>
            <Eyebrow>REPLACE EXERCISE</Eyebrow>
            <h2 id="replace-title">Replace {exerciseName(exercise)}</h2>
            <p>
              Candidates match the same movement purpose, target muscles, your
              equipment and restrictions.
            </p>
            <Eyebrow>RECOMMENDED</Eyebrow>
            {!suggestionsReady ? <p role="status" aria-live="polite">Finding suitable exercises…</p> : choices.length
              ? choices.map(choiceButton)
              : (
                  <p className="offline-banner">
                    There is not enough compatible exercise metadata for a safe
                    replacement.
                  </p>
                )}
            <button
              className={`substitution-preference-toggle${rememberPreference ? " is-selected" : ""}`}
              aria-pressed={rememberPreference}
              disabled={!suggestionsReady}
              onClick={() => setRememberPreference((value) => !value)}
            >
              <span>
                <strong>Prefer my choice</strong>
                <small>
                  {gymContext.id && gymContext.name
                    ? `Only when training at ${gymContext.name}.`
                    : "Use it in future replacement suggestions."}
                </small>
              </span>
              <i aria-hidden="true">{rememberPreference ? "✓" : ""}</i>
            </button>
            <div className="replacement-secondary">
              <button
                onClick={more}
                disabled={!suggestionsReady || loadingMore || noMore}
              >
                {loadingMore ? "Checking…" : "More compatible options"}
              </button>
              <button disabled={!suggestionsReady} onClick={() => setPicker(true)}>
                Search all exercises
              </button>
              {noMore && (
                <small>All compatible exercises are already shown.</small>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function App() {
  return <StartupBoundary load={loadInitialLiftState}>{startup=><HydratedApp startup={startup}/>}</StartupBoundary>;
}
function HydratedApp({startup}) {
  useSemanticSwipeBack();
  const [state, update, persistenceFailed] = useLiftState(startup);
  const liveCompletion = useRef(null);
  useResolvedTheme(
    state.profile.appearancePreference,
    state.profile.stylePreference,
  );
  const [page, setPage] = useState("today");
  const [detail, setDetail] = useState(null);
  const [detailClosing, setDetailClosing] = useState(false);
  useEffect(() => { setDetailClosing(false); }, [detail]);
  const [entryMode, setEntryMode] = useState(startup.status==='ready'&&!state.profile.onboardingComplete?'personalize':null);
  const [repairStage, setRepairStage] = useState("preparing");
  const [repairPreview, setRepairPreview] = useState(null);
  const [planReadyNotice, setPlanReadyNotice] = useState(null);
  const backgroundRef = useRef(null);
  useEffect(() => {
    trackFunnelEventOnce(
      "app_open",
      { path: state.profile.onboardingComplete ? "returning" : "new" },
      "session",
    );
  }, []);
  useEffect(() => {
    if (page !== "today") setPlanReadyNotice(null);
  }, [page]);
  const showToday = () => {
    setDetail(null);
    setPage("today");
  };
  const showGeneratedPlan = () => {
    showToday();
    setPlanReadyNotice({ id: Date.now() });
  };
  const closeDetail = () => {
    const returnFocusId = detail?.visual ? detail.returnFocusId : null;
    setDetail((current) =>
      current?.visual && current.returnTo ? current.returnTo : null,
    );
    if (returnFocusId)
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          focusNavigationTarget(document.getElementById(returnFocusId)),
        ),
      );
  };
  useEffect(() => {
    let active = true;
    (async () => {
      const status = await AIService.status();
      if (!active) return;
      update((current) => {
        current.ai = { ...current.ai, ...status };
        return current;
      });
    })();
    const poorAIPlan =
      state.program?.source === "ai" &&
      !validateProgram(state.program, state.profile, {
        requireProgramQuality: true,
      }).valid;
    const replaceablePlan =
      state.program?.source === "local-rules" || poorAIPlan;
    const canUpgrade =
      state.profile.onboardingComplete &&
      replaceablePlan &&
      !state.ai?.planUpgradeDismissed &&
      !state.activeWorkout &&
      state.workouts.length === 0 &&
      Object.keys(state.weekScheduleOverrides || {}).length === 0;
    if (canUpgrade)
      (async () => {
        setRepairStage("preparing");
        update((current) => {
          current.ai = { ...current.ai, repairingPlan: true };
          return current;
        });
        try {
          const result = await generatePersonalizedProgram(state.profile, {
            onStage: (stage) => {
              if (active) setRepairStage(stage);
            },
          });
          if (!active) return;
          setRepairPreview(result);
          update((current) => {
            current.ai = {
              ...current.ai,
              lastPlanError: null,
              repairingPlan: false,
            };
            return current;
          });
        } catch (error) {
          if (active)
            update((current) => {
              current.ai = {
                ...current.ai,
                lastPlanError:
                  error.message || "AI could not repair the stored plan.",
                repairingPlan: false,
              };
              return current;
            });
        }
      })();
    return () => {
      active = false;
    };
  }, []);
  const acceptRepairPreview = async (program) => {
    setRepairStage("saving");
    update((current) => {
      current.ai = { ...current.ai, repairingPlan: true };
      return current;
    });
    await afterVisibleFrame();
    update((current) => {
      current.program = program;
      current.selectedDay = weekday();
      current.selectedDate = isoDay();
      current.ai = {
        ...current.ai,
        lastPlanSource: repairPreview.source,
        repairingPlan: false,
        planUpgradeDismissed: false,
      };
      return current;
    }, { planVersion: { source: "ROOK plan update", reason: "Plan compatibility update" } });
    setRepairPreview(null);
    showGeneratedPlan();
  };
  const dismissRepairPreview = () => {
    setRepairPreview(null);
    update((current) => {
      current.ai = {
        ...current.ai,
        planUpgradeDismissed: true,
        repairingPlan: false,
      };
      return current;
    });
  };
  if (!state.profile.onboardingComplete) {
    if (entryMode === "personalize")
      return (
        <PersistenceHost failed={persistenceFailed}>
          <Onboarding
            initialUnits={state.profile.units}
            update={update}
            exit={() => setEntryMode(null)}
            onPlanAccepted={showGeneratedPlan}
          />
        </PersistenceHost>
      );
    if (entryMode === "import")
      return (
        <PersistenceHost failed={persistenceFailed}>
          <ImportPlan
            state={state}
            update={update}
            close={() => setEntryMode(null)}
            onPlanAccepted={showToday}
            initial
          />
        </PersistenceHost>
      );
    if (entryMode === "scratch")
      return (
        <PersistenceHost failed={persistenceFailed}>
          <ScratchPlan
            state={state}
            update={update}
            close={() => setEntryMode(null)}
            onPlanAccepted={showGeneratedPlan}
          />
        </PersistenceHost>
      );
    if (entryMode === "restore")
      return (
        <PersistenceHost failed={persistenceFailed}>
          <RestoreBackupSheet
            state={state}
            update={update}
            close={() => setEntryMode(null)}
            onRestored={() => {
              setEntryMode(null);
              setPage("today");
            }}
          />
        </PersistenceHost>
      );
    return (
      <PersistenceHost failed={persistenceFailed}>
        <EntryLanding
          personalize={() => {
            trackFunnelEvent("onboarding_started", { path: "personalized" });
            setEntryMode("personalize");
          }}
          importPlan={() => {
            trackFunnelEvent("onboarding_started", { path: "import" });
            setEntryMode("import");
          }}
          startFromScratch={() => {
            trackFunnelEvent("onboarding_started", { path: "scratch" });
            setEntryMode("scratch");
          }}
          restoreBackup={() => setEntryMode("restore")}
        />
      </PersistenceHost>
    );
  }
  const content =
    page === "today" ? (
      <Today
        state={state}
        update={update}
        setPage={setPage}
        setDetail={setDetail}
        planReady={planReadyNotice}
        dismissPlanReady={() => setPlanReadyNotice(null)}
      />
    ) : page === "optional-session" ? (
      <ActiveOptionalSession state={state} update={update} setPage={setPage} />
    ) : page === "workout" ? (
      <ActiveWorkout
        state={state}
        update={update}
        setPage={setPage}
        setDetail={setDetail}
        onLiveFinish={event=>{liveCompletion.current=event;}}
      />
    ) : page === "complete" ? (
      <Complete
        state={state}
        update={update}
        setPage={setPage}
        setDetail={setDetail}
        liveFinish={liveCompletion.current}
        persistenceFailed={persistenceFailed}
      />
    ) : page === "coach" ? (
      <Coach state={state} update={update} setPage={setPage} />
    ) : page === "progress" ? (
      <Progress state={state} update={update} setDetail={setDetail} setPage={setPage} />
    ) : (
      <Profile
        state={state}
        update={update}
        setDetail={setDetail}
        setPage={setPage}
        onLogout={() => setDetail("logout-confirm")}
      />
    );
  return (
    <PersistenceHost
      failed={persistenceFailed}
      onBackup={() => setDetail("backup-rook")}
    >
    <div className="app-shell">
      <div className="app-content" ref={backgroundRef}>
        {content}
        {(!detail || detailClosing) &&
          !repairPreview &&
          !["workout", "optional-session", "complete"].includes(page) && (
          <BottomNav page={page} setPage={setPage} />
        )}
      </div>
      {detail && (
        <ModalLayer
          key={detail?.visual ? "exercise-visual" : "detail"}
          close={closeDetail}
          onCloseStart={() => setDetailClosing(true)}
          backgroundRef={backgroundRef}
          presentation={detail?.visual ? "fullscreen" : detail?.editPlan?.fullscreen ? "editor-page" : "sheet"}
        >
          <Detail
            detail={detail}
            state={state}
            update={update}
            close={closeDetail}
            setPage={setPage}
            setDetail={setDetail}
            onPlanAccepted={showGeneratedPlan}
            onPlanImported={showToday}
            onLogout={() => {
              // Only reached after the existing destructive confirmation.
              localStorage.removeItem(STORAGE_KEY);
              setDetail(null);
              setEntryMode(null);
              setPage("today");
              update(() => blankState());
            }}
          />
        </ModalLayer>
      )}
      {repairPreview && (
        <ModalLayer close={dismissRepairPreview} backgroundRef={backgroundRef}>
          {(requestClose) => (
            <main className="screen detail-screen repair-plan-preview">
              <SheetHeader
                title="Plan preview"
                onClose={requestClose}
                closeLabel="Close plan preview"
              />
              <PlanEditor
                source={repairPreview.program}
                profile={state.profile}
                exerciseState={state}
                onSave={acceptRepairPreview}
                onCancel={requestClose}
                saving={state.ai.repairingPlan}
              />
            </main>
          )}
        </ModalLayer>
      )}
      {state.ai.repairingPlan && <BuildingOverlay stage={repairStage} />}
    </div>
    </PersistenceHost>
  );
}

export function RookRoot() {
  return (
    <RookErrorBoundary>
      <App />
    </RookErrorBoundary>
  );
}
import { resolvePartialPrescription } from './importPartialPrescription.js';
import { applyHybridDecision } from './hybridImportReview.js';
import { ImportInterpretationOffer } from './ImportInterpretationOffer.jsx';
import { useSemanticSwipeBack } from './useSemanticSwipeBack.js';
