import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AIService,
  normalizeCoachText,
  preparePhysiquePhoto,
} from "./aiService.js";
import { trackFunnelEvent, trackFunnelEventOnce } from "./analytics.js";
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
  TRAINING_SAFETY_SCHEMA_VERSION,
  trainingSafetyBlocks,
} from "./trainingSafety.js";
import {
  detectSplitPreference,
  onboardingSplitOptions,
} from "./splitPreferences.js";
import {
  EQUIPMENT_BY_ENVIRONMENT,
  EXERCISE_THUMBNAIL_NORMALIZATION,
  PHYSIQUE_PRIORITY_OPTIONS,
  WEEKDAYS,
  adaptedTemplateForToday,
  activeWorkoutCanRestart,
  applyCoachAction,
  applyWeekScheduleChanges,
  blankState,
  buildProgram,
  buildReplacementProgram,
  coachActionConflict,
  combinedTrainingPriorities,
  completeWorkout,
  compatibleReplacementCandidates,
  consistencyForCurrentWeek,
  currentWeekSchedule,
  displayDate,
  displayWeight,
  estimateSessionMinutes,
  exerciseCatalog,
  exerciseMeasure,
  exerciseMatchesQuery,
  exerciseName,
  exerciseNote,
  exerciseValueLabel,
  firstScheduledDate,
  formatDuration,
  importedExerciseNameNeedsReview,
  isExerciseAllowed,
  isoDay,
  loadState,
  matchImportedExerciseName,
  nextScheduledWorkout,
  normalizeWorkoutName,
  normalizeSessionNote,
  optionalStrengthForDate,
  plannedWorkoutForDate,
  pluralize,
  previousExercise,
  progressionFor,
  recentExerciseProgress,
  refreshWorkoutWarmup,
  removeExerciseFromOccurrence,
  removeExerciseFromWeeklyPlan,
  restartActiveWorkout,
  restoreOccurrenceOverride,
  restoreWeeklyPlanWorkout,
  roundedEstimate,
  saveState,
  splitImportedExerciseLabel,
  startWorkout,
  storedWeight,
  SESSION_NOTE_MAX_LENGTH,
  targetLabel,
  templateForToday,
  validateProgram,
  validateWeekScheduleChanges,
  warmupForWorkout,
  weekDate,
  weekKey,
  weekday,
  weightUnit,
  workoutSetSummary,
  workoutPlanDate,
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
const MINIMUM_PLAN_TRANSITION_MS = 1600;
async function generatePersonalizedProgram(
  profile,
  { onStage, currentProgram = null, workouts = [] } = {},
) {
  const startedAt = performance.now();
  onStage?.("preparing");
  await afterVisibleFrame();
  await waitFor(260);
  onStage?.("building");
  await afterVisibleFrame();
  const program = currentProgram
    ? buildReplacementProgram(profile, currentProgram, workouts)
    : buildProgram(profile);
  await waitFor(620);
  onStage?.("checking");
  await afterVisibleFrame();
  const validation = validateProgram(program, profile, {
    requireProgramQuality: true,
  });
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const remaining = MINIMUM_PLAN_TRANSITION_MS - (performance.now() - startedAt);
  if (remaining > 0) await waitFor(remaining);
  return { program, source: "personalized-template" };
}
function useLiftState() {
  const [state, setState] = useState(() => {
    const initial = loadState();
    if (initial.profile.onboardingComplete) {
      const landingDate = initial.activeWorkout
        ? initial.selectedDate || initial.activeWorkout.workoutDateKey || isoDay()
        : isoDay();
      initial.selectedDay = weekday(`${landingDate}T12:00:00`);
      initial.selectedDate = landingDate;
    }
    return initial;
  });
  useLayoutEffect(() => saveState(state), [state]);
  return [state, (fn) => setState((previous) => fn(clone(previous)))];
}
export function resolvedTheme(preference, systemDark = false) {
  if (preference === "premium") return "premium";
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}
function useResolvedTheme(preference = "system") {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = resolvedTheme(preference, media.matches);
      const premiumScheme = media.matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      if (theme === "premium")
        document.documentElement.dataset.premiumScheme = premiumScheme;
      else delete document.documentElement.dataset.premiumScheme;
      document.documentElement.style.colorScheme =
        theme === "premium" ? premiumScheme : theme === "light" ? "light" : "dark";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          theme === "premium"
            ? premiumScheme === "dark" ? "#11110f" : "#f7f5f0"
            : theme === "dark"
              ? "#111413"
              : "#f6f5f2",
        );
    };
    apply();
    if (!['system', 'premium'].includes(preference)) return undefined;
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, [preference]);
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
          <button type="button" onClick={() => setLimitsInputOpen(false)}>BACK</button>
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
  onClick,
}) {
  return (
    <button
      type="button"
      className={`onboarding-option ${selected ? "selected-option" : ""}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerUp={(event) => event.currentTarget.blur()}
      onClick={onClick}
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
  chooseSplit,
  specificSplitOpen,
  setSpecificSplitOpen,
  splitOptions,
  safety,
  safetyAnalysisStatus,
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
  const [slowCheck, setSlowCheck] = useState(false);
  useEffect(() => {
    setSlowCheck(false);
    if (safetyAnalysisStatus !== "checking") return undefined;
    const timeout = setTimeout(() => setSlowCheck(true), 8000);
    return () => clearTimeout(timeout);
  }, [safetyAnalysisStatus]);
  const specificOptions = splitOptions.filter(
    (option) => option.id !== "recommended",
  );
  const selectedSpecific = specificOptions.find(
    (option) => option.id === splitChoice,
  );
  return (
    <div className="preference-fields">
      <section className="onboarding-question-group split-preference">
        <div className="option-list split-recommendation">
          <OnboardingOptionCard
            label="CHOOSE FOR ME"
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
            <strong>I have a specific split</strong>
            {selectedSpecific && <small>{selectedSpecific.label}</small>}
          </span>
          <i className="disclosure-chevron" aria-hidden="true" />
        </button>
        {specificSplitOpen && (
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
        )}
        {specificSplitOpen && splitChoice === "other" && (
          <textarea
            aria-label="Other preferred split"
            className="text-answer split-other-answer"
            maxLength={160}
            value={answers.trainingPreferences}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                trainingPreferences: event.target.value,
              }))
            }
            placeholder="Describe your preferred split"
          />
        )}
      </section>
      <section className="onboarding-question-group">
        <div className="onboarding-group-heading">
          <strong>TRAINING RESTRICTIONS · OPTIONAL</strong>
        </div>
        <textarea
          ref={restrictionInputRef}
          aria-label="Restrictions or clinician limits"
          className="text-answer compact-answer"
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
          placeholder="Pain, recent surgery, or movements you've been told to avoid..."
        />
        <small className="restriction-helper">
          Write it naturally. Rook will adapt the plan where possible and ask if
          anything needs clarification.
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
            <Eyebrow>CHECK UNAVAILABLE</Eyebrow>
            <strong>Rook couldn’t verify these restrictions.</strong>
            <p>Try again before building your plan.</p>
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
            restrictionInputRef.current?.focus();
            restrictionInputRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }}
        />
      </section>
      <section className="onboarding-question-group">
        <div className="onboarding-group-heading">
          <strong>EXERCISE PREFERENCE</strong>
        </div>
        <div className="option-list compact-options">
          {["Prefer free weights", "Prefer machines", "No preference"].map(
            (option) => (
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
function BottomNav({ page, setPage }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {navItems.map(([id, label]) => (
        <button
          key={id}
          aria-label={label}
          aria-current={page === id ? "page" : undefined}
          className={page === id ? "nav-active" : ""}
          onClick={() => setPage(id)}
        >
          <span>{label}</span>
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
    touch = {
      startY: y,
      lastY: y,
      lastAt: performance.now(),
      velocity: 0,
      distance: 0,
      dragging: false,
      canDrag: scroller.scrollTop <= 0,
    };
  };
  const move = (event) => {
    if (!touch || disabled() || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    const now = performance.now();
    const step = y - touch.lastY;
    const elapsed = Math.max(1, now - touch.lastAt);
    if (!touch.dragging) {
      if (!touch.canDrag) {
        if (scroller.scrollTop <= 0 && step > 0) {
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
  const [visible, setVisible] = useState(false);
  const drag = useRef(null);
  const closeTimer = useRef(null);
  useEffect(() => {
    setVisible(
      Boolean(
        layerRef.current?.firstElementChild?.classList.contains("screen"),
      ),
    );
  });
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const panel = () => layerRef.current?.firstElementChild;
  const handle = () => layerRef.current?.querySelector(".modal-drag-handle");
  const applyDistance = (distance) => {
    const target = panel();
    const control = handle();
    if (!target || !control) return;
    target.style.transform = `translateY(${distance}px)`;
    control.style.transform = `translateY(${distance}px)`;
    const progress = Math.min(
      1,
      distance / Math.max(1, target.getBoundingClientRect().height * 0.65),
    );
    layerRef.current.style.backgroundColor = `rgba(27, 26, 25, ${(0.35 * (1 - progress)).toFixed(3)})`;
  };
  const settle = (dismiss) => {
    const target = panel();
    const control = handle();
    if (!target || !control) return;
    target.style.transition = "transform 180ms ease-out";
    control.style.transition = "transform 180ms ease-out";
    if (dismiss) {
      const distance = target.getBoundingClientRect().height + 24;
      applyDistance(distance);
      layerRef.current.style.backgroundColor = "rgba(27, 26, 25, 0)";
      closeTimer.current = setTimeout(finishClose, 180);
    } else {
      target.style.transform = "";
      control.style.transform = "";
      layerRef.current.style.backgroundColor = "";
      closeTimer.current = setTimeout(() => {
        target.style.transition = "";
        control.style.transition = "";
      }, 180);
    }
  };
  const start = (event) => {
    if (event.pointerType === "touch") return;
    clearTimeout(closeTimer.current);
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: performance.now(),
    };
    const target = panel();
    if (target) target.style.transition = "";
    event.currentTarget.style.transition = "";
  };
  const move = (event) => {
    if (!drag.current) return;
    event.stopPropagation();
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
    if (!visible) return undefined;
    const surface = panel();
    return bindScrollableSheetTouch({
      surface,
      scroller: surface,
      setPosition: applyDistance,
      onDragStart: () => {
        surface.style.transition = "none";
        const control = handle();
        if (control) control.style.transition = "none";
      },
      onDismiss: () => settle(true),
      onReset: () => settle(false),
    });
  }, [visible]);
  if (!visible) return null;
  return (
    <div
      className="modal-drag-handle"
      aria-label="Drag down to close"
      role="button"
      tabIndex="0"
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
        drag.current = null;
        settle(false);
      }}
    >
      <i />
    </div>
  );
}
function ModalLayer({ children, close, backgroundRef }) {
  const layerRef = useRef(null);
  const closing = useRef(false);
  const closeTimer = useRef(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const panel = layer?.firstElementChild;
    if (!panel) return undefined;
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
    const mutationObserver = new MutationObserver(() =>
      requestAnimationFrame(updateHeader),
    );
    mutationObserver.observe(panel, {
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
  }, [children]);
  const requestClose = () => {
    if (closing.current) return;
    const layer = layerRef.current;
    const panel = layer?.firstElementChild;
    const handle = layer?.querySelector(".modal-drag-handle");
    if (!layer || !panel) {
      close();
      return;
    }
    closing.current = true;
    panel.style.transition = "transform 180ms ease-out";
    panel.style.transform = `translateY(${panel.getBoundingClientRect().height + 24}px)`;
    if (handle) {
      handle.style.transition = "transform 180ms ease-out";
      handle.style.transform = `translateY(${panel.getBoundingClientRect().height + 24}px)`;
    }
    layer.style.backgroundColor = "rgba(27, 26, 25, 0)";
    closeTimer.current = setTimeout(close, 180);
  };
  useEffect(() => {
    const scrollY = window.scrollY;
    const previousFocus = document.activeElement;
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
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    const keydown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    addEventListener("keydown", keydown);
    const frame = requestAnimationFrame(() => {
      const panel = layerRef.current?.firstElementChild;
      const scroller = panel?.querySelector(".sheet-scroll") || panel;
      scroller?.scrollTo?.({ top: 0, left: 0 });
      layerRef.current
        ?.querySelector("[autofocus], .sheet-close, button, input")
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("keydown", keydown);
      Object.assign(body.style, prior);
      if (backgroundRef.current) {
        backgroundRef.current.inert = false;
        backgroundRef.current.removeAttribute("aria-hidden");
      }
      window.scrollTo(0, scrollY);
      requestAnimationFrame(() => previousFocus?.focus?.());
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
      className="modal-layer"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {content}
      <ModalDragHandle
        layerRef={layerRef}
        close={requestClose}
        finishClose={close}
      />
    </div>
  );
}
function BuildingOverlay({ stage = "building", kind = "program", onCancel }) {
  const [waitLevel, setWaitLevel] = useState(0);
  const [visible, setVisible] = useState(kind === "import");
  const [showCancel, setShowCancel] = useState(kind === "import");
  const overlayRef = useRef(null);
  const cancellable = Boolean(onCancel);
  useEffect(() => {
    setWaitLevel(0);
    setVisible(kind === "import");
    setShowCancel(kind === "import" && cancellable);
    const reveal =
      kind === "program" ? setTimeout(() => setVisible(true), 250) : null;
    const revealCancel =
      kind === "program" && cancellable
        ? setTimeout(() => setShowCancel(true), 3000)
        : null;
    const long = setTimeout(() => setWaitLevel(1), 5000);
    return () => {
      if (reveal) clearTimeout(reveal);
      if (revealCancel) clearTimeout(revealCancel);
      if (long) clearTimeout(long);
    };
  }, [kind, cancellable]);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const focus = () =>
      overlay
        .querySelector("button:not([disabled])")
        ?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(focus);
    const keydown = (event) => {
      if (event.key === "Escape" && showCancel && onCancel) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...overlay.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ),
      ];
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
    };
  }, [onCancel, showCancel, visible]);
  if (!visible) return null;
  if (kind === "import")
    return (
      <div
        ref={overlayRef}
        className="building-overlay"
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby="building-title"
        aria-describedby="building-detail"
      >
        <div className="building-card" role="status" aria-live="polite">
          <Eyebrow>IMPORTING YOUR PLAN</Eyebrow>
          <h2 id="building-title">
            {waitLevel ? "Still structuring your plan…" : "Structuring your plan…"}
          </h2>
          <p id="building-detail">
            {waitLevel
              ? "This is taking a little longer than usual. Your notes are still safe."
              : "Matching exercises and checking your notes for review."}
          </p>
          <div className="building-spinner" aria-hidden="true" />
          {showCancel && onCancel ? (
            <button
              type="button"
              className="building-cancel"
              onClick={onCancel}
            >
              CANCEL
            </button>
          ) : null}
        </div>
      </div>
    );
  const saving = stage === "saving";
  const title = saving ? "Saving your program…" : "Building your training week…";
  const detail = saving
    ? "Keeping your new program ready for the first workout."
    : waitLevel
      ? "This is taking a little longer than usual."
      : "Applying your preferences and checking the plan.";
  return (
    <div
      ref={overlayRef}
      className="building-overlay"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="building-title"
      aria-describedby="building-detail"
    >
      <div
        className="building-card"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Eyebrow>BUILDING YOUR PROGRAM</Eyebrow>
        <h2 id="building-title">{title}</h2>
        <p id="building-detail">{detail}</p>
        <div className="building-spinner" aria-hidden="true" />
        {showCancel && onCancel ? (
          <button type="button" className="building-cancel" onClick={onCancel}>
            CANCEL
          </button>
        ) : null}
      </div>
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
      "Strength work to help maintain muscle, plus recoverable conditioning that fits your week.",
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
  "barbell/rack/bench": "Barbell / rack / bench",
  dumbbells: "Dumbbells",
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
      (answers.environment === "Commercial gym" ||
        (answers.equipment || []).some((item) => item !== "full gym")),
  );
}
const PRIORITIES = [
  "Balanced",
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Quads",
  "Hamstrings / glutes",
  "Calves",
];
const EFFORT_STYLES = [
  "Balanced workload · usually 3 sets · 1–2 RIR",
  "Fewer hard sets · 2 sets · 0–1 RIR",
  "More moderate sets · 3–4 sets · 2–3 RIR",
];
const EFFORT_GUIDANCE = {
  Beginner: {
    question: "How much work per exercise feels manageable?",
    hint: "Choose a starting point. ROOK will manage effort targets for you.",
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
    hint: "Reps in reserve (RIR) means how many clean reps you could still do when a set ends.",
    options: [
      {
        label: "Balanced workload",
        description: "Usually 3 sets · finish with 1–2 reps left",
      },
      {
        label: "Fewer hard sets",
        description: "2 sets · finish with 0–1 reps left",
      },
      {
        label: "More moderate sets",
        description: "3–4 sets · finish with 2–3 reps left",
      },
    ],
  },
  Advanced: {
    question: "How much work per exercise feels manageable?",
    hint: "RIR means reps in reserve: clean reps you could still perform when a set ends.",
    options: [
      { label: "Balanced workload", description: "Usually 3 sets · 1–2 RIR" },
      { label: "Fewer hard sets", description: "2 sets · 0–1 RIR" },
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
        <div className="photo-inputs">
          {["front", "back", "side"].map((angle) => (
            <label key={angle} className={photos[angle] ? "ready" : ""}>
              <input
                type="file"
                accept="image/*"
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
        <small className="photo-privacy">
          Photos are resized for analysis, are not saved to your Rook profile,
          and are discarded after this request.
        </small>
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
function EntryLanding({ personalize, importPlan, startFromScratch }) {
  const [previewDays, setPreviewDays] = useState(4);
  const [previewChanged, setPreviewChanged] = useState(false);
  const [previewEquipment, setPreviewEquipment] = useState("Full gym");
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
          Tell Rook when you can train, your equipment, and your experience.
          Get a week built around you — then adjusted as you log.
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
          <div className="entry-demo-control">
            <span id="entry-days-label">DAYS I CAN TRAIN</span>
            <div className="entry-days" role="group" aria-labelledby="entry-days-label">
              {[3, 4, 5].map((days) => (
                <button
                  type="button"
                  key={days}
                  aria-pressed={previewDays === days}
                  onClick={() => {
                    if (previewDays === days) return;
                    setPreviewChanged(true);
                    setPreviewDays(days);
                  }}
                >
                  {days}
                </button>
              ))}
            </div>
          </div>
          <div className="entry-demo-control">
            <span id="entry-equipment-label">EQUIPMENT</span>
            <div
              className="entry-equipment"
              role="group"
              aria-labelledby="entry-equipment-label"
            >
              {["Full gym", "Dumbbells", "Bodyweight"].map((equipment) => (
                <button
                  type="button"
                  key={equipment}
                  aria-pressed={previewEquipment === equipment}
                  onClick={() => setPreviewEquipment(equipment)}
                >
                  {equipment}
                </button>
              ))}
            </div>
          </div>
          <div className="entry-week-result" aria-live="polite">
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
            <p>Example only · Rook adapts exercise selection to your equipment.</p>
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
      </div>
    </main>
  );
}
function Onboarding({ update, exit, onPlanAccepted }) {
  const [step, setStep] = useState(0);
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
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [answers, setAnswers] = useState(() => blankState().profile);
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
  const [followUps, setFollowUps] = useState([]);
  const [followIndex, setFollowIndex] = useState(0);
  const [followText, setFollowText] = useState("");
  const effortGuidance = effortGuidanceFor(answers.experience);
  const ageRangeOptions = ["Under 18", "18–29", "30–39", "40–49", "50–59", "60+"];
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
      question: "What would you like this plan to improve?",
      helper:
        "Choose the outcome that matters most to you. You can change this later.",
      options: GOALS,
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
        "Optional. Choose one or more areas to emphasize, or keep the plan balanced.",
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
      label: "TRAINING SPLIT",
      question: "How should Rook structure your week?",
      helper: "Let Rook choose, or add a preference if you already have one.",
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
  const goalPlanPreview =
    GOAL_PLAN_PREVIEWS[answers.goal] || DEFAULT_GOAL_PLAN_PREVIEW;
  const splitOptions = onboardingSplitOptions(answers.daysPerWeek);
  const choose = (option) => {
    if (stage.multi)
      setAnswers((current) => {
        const selected =
          stage.key === "priorities"
            ? current.prioritySources?.manual || []
            : current[stage.key] || [];
        let next = selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option];
        if (stage.key === "priorities" && option === "Balanced")
          next = ["Balanced"];
        else if (stage.key === "priorities")
          next = next.filter((item) => item !== "Balanced");
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
  const chooseAvailableDay = (option) =>
    setAnswers((current) => ({
      ...current,
      availableDays: current.availableDays.includes(option)
        ? current.availableDays.filter((item) => item !== option)
        : [...current.availableDays, option],
    }));
  const chooseFrequency = (option) => {
    setSplitChoice("recommended");
    setSpecificSplitOpen(false);
    setAnswers((current) => ({
      ...current,
      daysPerWeek: option,
      trainingPreferences: "",
    }));
  };
  const chooseSplit = (option) => {
    setSplitChoice(option.id);
    if (option.id === "recommended") setSpecificSplitOpen(false);
    else setSpecificSplitOpen(true);
    setAnswers((current) => ({
      ...current,
      trainingPreferences: option.value ?? "",
    }));
  };
  const chooseEnvironment = (option) =>
    setAnswers((current) => ({
      ...current,
      environment: option,
      equipment:
        option === "Commercial gym" || option === "Both" ? ["full gym"] : [],
    }));
  const chooseEquipment = (option) =>
    setAnswers((current) => {
      const implicit = current.environment === "Both" ? ["full gym"] : [];
      const selected = current.equipment.filter((item) => item !== "full gym");
      let next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      if (option === "bodyweight only") next = ["bodyweight only"];
      else next = next.filter((item) => item !== "bodyweight only");
      return { ...current, equipment: [...implicit, ...next] };
    });
  const scheduleValid = Boolean(
    answers.daysPerWeek &&
    answers.sessionMinutes &&
    answers.availableDays.length >= answers.daysPerWeek,
  );
  const setupValid = setupSelectionValid(answers);
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
  const valid =
    !safetyBlocked &&
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
    let effectiveProfile = profile;
    const sourceText = String(profile?.avoid || "");
    let cached = profile?.trainingSafetyAnalysis;
    if (
      cached?.sourceText !== sourceText ||
      cached?.analysis?.schemaVersion !== TRAINING_SAFETY_SCHEMA_VERSION
    )
      cached = null;
    if (sourceText.trim() && !cached?.analysis) {
      safetyRequestRef.current = true;
      setSafetyAnalysis({ sourceText, analysis: null, status: "checking" });
      setNotice("");
      try {
        const analysis = await AIService.analyzeTrainingSafety(sourceText);
        if (restrictionTextRef.current !== sourceText) return;
        effectiveProfile = {
          ...profile,
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
          setSafetyAnalysis({ sourceText, analysis: null, status: "error" });
          setNotice("");
        }
        return;
      } finally {
        safetyRequestRef.current = false;
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
    } catch {
      if (run !== generationRun.current) return;
      trackFunnelEvent("plan_generation_failed", {
        path: "personalized",
        source: "local",
        durationMs: Math.round(performance.now() - startedAt),
        reason: "validation",
      });
      setNotice(
        "We couldn't build a valid plan from these answers. Review your schedule, equipment and restrictions, then try again.",
      );
      setBuildFailed(true);
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
    });
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
    setStep((index) => index + 1);
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
      <main className="screen detail-screen generated-plan-preview initial-import-screen">
        <header className="detail-header">
          <button
            aria-label="Back to onboarding"
            disabled={busy}
            onClick={() => setGeneratedPreview(null)}
          >
            ‹
          </button>
          <strong>Plan preview</strong>
          <span />
        </header>
        <PlanEditor
          source={generatedPreview.program}
          profile={generatedPreview.profile}
          onSave={acceptGenerated}
          onCancel={() => setGeneratedPreview(null)}
          saving={busy}
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
    <main className={`onboarding onboarding-${stage.key}`}>
      <div className="brand">ROOK</div>
      <div className="progress-line">
        <span style={{ width: `${((step + 1) / stages.length) * 100}%` }} />
      </div>
      <span className="step-count">
        STEP {step + 1}/{stages.length}
      </span>
      <div className="onboarding-content" key={stage.key}>
        <Eyebrow>{stage.label}</Eyebrow>
        <h1>{stage.question}</h1>
        {!stage.hideHelper && (
          <p>
            {stage.personal
              ? "Age helps Rook choose a more appropriate starting workload and recovery pattern. Your first name is optional."
              : stage.helper ||
                stage.optionalHint ||
                (stage.optional
                  ? "Optional. Choose only what matters to you."
                  : "Choose the answer that best fits your routine.")}
          </p>
        )}
        {stage.personal ? (
          <div className="personal-fields">
            <label>
              <span>Age range</span>
              <div className="age-range-picker" ref={agePickerRef}>
                <button
                  ref={ageTriggerRef}
                  type="button"
                  className="age-range-trigger"
                  role="combobox"
                  aria-label="Age range"
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
            </label>
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
            <section className="onboarding-question-group schedule-days">
              <div className="onboarding-group-heading">
                <strong>Days you can train</strong>
                <label className="select-all-check">
                  <input
                    type="checkbox"
                    aria-label="Make any day available"
                    checked={answers.availableDays.length === WEEKDAYS.length}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        availableDays:
                          current.availableDays.length === WEEKDAYS.length
                            ? []
                            : [...WEEKDAYS],
                      }))
                    }
                  />
                  <span>Any day</span>
                </label>
              </div>
              <div className="option-list day-options">
                {WEEKDAYS.map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={localizedWeekdayLabel(option, "short")}
                    ariaLabel={localizedWeekdayLabel(option, "long")}
                    selected={answers.availableDays.includes(option)}
                    onClick={() => chooseAvailableDay(option)}
                  />
                ))}
              </div>
              <small className="schedule-selection-count" aria-live="polite">
                {answers.availableDays.length}{" "}
                {answers.availableDays.length === 1 ? "day" : "days"} selected
              </small>
              {answers.daysPerWeek &&
                answers.availableDays.length < answers.daysPerWeek && (
                  <small className="schedule-hint">
                    Choose at least {answers.daysPerWeek} possible days.
                  </small>
                )}
            </section>
            <section className="onboarding-question-group schedule-duration">
              <div className="onboarding-group-heading">
                <strong>Time per workout</strong>
              </div>
              <div className="option-list">
                {[30, 45, 60, 75, 90].map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={`${option} min`}
                    selected={answers.sessionMinutes === option}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        sessionMinutes: option,
                      }))
                    }
                  />
                ))}
              </div>
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
            {answers.environment === "Commercial gym" && (
              <div className="setup-confirmation">
                <strong>Full gym access</strong>
                <small>
                  Your plan can use standard commercial-gym equipment.
                </small>
              </div>
            )}
            {answers.environment &&
              answers.environment !== "Commercial gym" && (
                <section className="onboarding-question-group setup-equipment">
                  <div className="onboarding-group-heading">
                    <strong>
                      {answers.environment === "Both"
                        ? "Equipment available at home"
                        : "Available equipment"}
                    </strong>
                    <small>Select all that apply</small>
                  </div>
                  <div className="option-list option-grid">
                    {(EQUIPMENT_BY_ENVIRONMENT[answers.environment] || []).map(
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
                  onClick={() => choose(option)}
                />
              );
            })}
          </div>
        )}
        {stage.key === "preferences" && (
          <TrainingPreferencesStep
            answers={answers}
            setAnswers={setAnswers}
            splitChoice={splitChoice}
            chooseSplit={chooseSplit}
            specificSplitOpen={specificSplitOpen}
            setSpecificSplitOpen={setSpecificSplitOpen}
            splitOptions={splitOptions}
            safety={analyzedSafety}
            safetyAnalysisStatus={safetyAnalysis.status}
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
        <Button
          disabled={!valid || busy || safetyAnalysis.status === "checking"}
          onClick={() =>
            step === stages.length - 1
              ? buildFailed
                ? finalize(lastBuildProfile.current)
                : structuredDone()
              : advance()
          }
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
                ? "TRY AGAIN"
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
        </Button>
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
          ) : (
            <Button
              variant="quiet"
              className="bottom-back"
              aria-label="Back"
              onClick={exit}
            >
              <BackLabel />
            </Button>
          ))}
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
function WeekNavigation({ date, canGoBack, canGoForward, move }) {
  return (
    <div className="week-navigation" aria-label="Change week">
      <button
        aria-label="Previous week"
        disabled={!canGoBack}
        onClick={() => move(-1)}
      >
        ‹
      </button>
      <span>{weekLabel(date)}</span>
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
            className={`${isSelected ? "selected-day" : isToday ? "today-date" : ""} ${workoutState}`}
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
function TodayExerciseRow({ exercise, detail, profile, setDetail, actions }) {
  const holdTimer = useRef(null);
  const holdOrigin = useRef(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef(null);
  const keyboardContext = useRef(false);
  const keyboardContextTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      clearTimeout(suppressTimer.current);
      clearTimeout(keyboardContextTimer.current);
    },
    [],
  );
  const clearHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdOrigin.current = null;
  };
  const openActions = () => {
    if (!actions) return;
    setDetail({ todayExerciseActions: { ...actions, exercise } });
  };
  const startHold = (event) => {
    if (!actions || event.button !== 0 || event.pointerType === "mouse") return;
    clearHold();
    holdOrigin.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    holdTimer.current = setTimeout(() => {
      suppressClick.current = true;
      suppressTimer.current = setTimeout(
        () => (suppressClick.current = false),
        800,
      );
      triggerHaptic("tap");
      openActions();
      clearHold();
    }, 500);
  };
  const moveHold = (event) => {
    const origin = holdOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10)
      clearHold();
  };
  const openContextActions = (event) => {
    if (!actions) return;
    event.preventDefault();
    clearHold();
    if (keyboardContext.current) {
      keyboardContext.current = false;
      clearTimeout(keyboardContextTimer.current);
      return;
    }
    openActions();
  };
  return (
    <div
      className={`exercise-list-item${detail ? " has-secondary" : ""}`}
      onContextMenu={openContextActions}
    >
      <button
        onClick={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
            return;
          }
          setDetail({ exercise });
        }}
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
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
        aria-describedby={actions ? "today-exercise-actions-help" : undefined}
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
  const progress = `${summary.completed} / ${pluralize(summary.total, "set")} · ${formatActiveWorkoutDuration(elapsed)}`;
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
function Today({
  state,
  update,
  setPage,
  setDetail,
  planReady,
  dismissPlanReady,
}) {
  const active = state.activeWorkout;
  const startLock = useRef(false);
  const undoTimer = useRef(null);
  const weekGesture = useRef(null);
  const weekMotionTimer = useRef(null);
  const weekMotionFrame = useRef(null);
  const suppressWeekClickUntil = useRef(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [undoNotice, setUndoNotice] = useState(null);
  const [weekMotion, setWeekMotion] = useState("");
  const selectedDate = state.selectedDate
    ? localDate(state.selectedDate)
    : weekDate(state.selectedDay || weekday());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id]);
  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(weekMotionTimer.current);
      cancelAnimationFrame(weekMotionFrame.current);
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
  const activeDateKey = active
    ? active.workoutDateKey || isoDay(active.startedAt || new Date())
    : null;
  const selectedActiveWorkout = Boolean(active && selectedIso === activeDateKey);
  const recurringTemplate = plannedWorkoutForDate(state, selectedDate);
  const adaptedTemplate = recurringTemplate
    ? adaptedTemplateForToday(state, selectedDate)
    : null;
  const template =
    adaptedTemplate || optionalStrengthForDate(state, selectedDate);
  const trainingSafety = trainingSafetyFor(state.profile);
  const restrictedTemplateExercise = trainingSafetyBlocks(trainingSafety.status)
    ? null
    : (template?.exercises || []).find((exercise) => {
        const item = exerciseCatalog[exercise.exerciseId];
        return item && !exerciseAllowedByTrainingSafety(item, trainingSafety);
      });
  const trainingPaused =
    trainingSafetyBlocks(trainingSafety.status) ||
    Boolean(restrictedTemplateExercise);
  const todaySafety = restrictedTemplateExercise
    ? {
        ...trainingSafety,
        status: "needs_clarification",
        message: `${exerciseName(restrictedTemplateExercise)} conflicts with the current restriction. Update the restriction or replace the exercise before starting.`,
      }
    : trainingSafety;
  const selectedMonday = weekDate("Mon", selectedDate);
  const currentMonday = weekDate("Mon");
  const datedWorkouts = state.workouts.filter(
    (workout) => workout.completedAt && workoutPlanDate(workout),
  );
  const earliestDate = datedWorkouts.length
    ? new Date(
        Math.min(
          ...datedWorkouts.map((workout) =>
            localDate(workoutPlanDate(workout)).getTime(),
          ),
        ),
      )
    : localDate(isoDay(state.program.createdAt));
  const canGoBack = selectedMonday > weekDate("Mon", earliestDate);
  const canGoForward = selectedMonday < currentMonday;
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
      <div
        className={`week-selector${weekMotion ? ` week-transition-${weekMotion}` : ""}`}
        onClickCapture={suppressWeekClick}
        onPointerDown={beginWeekGesture}
        onPointerMove={trackWeekGesture}
        onPointerUp={endWeekGesture}
        onPointerCancel={cancelWeekGesture}
      >
        <div className="screen-top">
          <Eyebrow>WEEKLY WORKOUT PLAN</Eyebrow>
          <WeekNavigation
            date={selectedDate}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            move={moveWeek}
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
  if (selectedActiveWorkout) {
    const sets = active.exercises.flatMap((exercise) => exercise.sets);
    const completedSets = sets.filter((set) => set.completed).length;
    const elapsed = Math.max(0, now - Number(active.startedAt || now)) / 1000;
    return (
      <main className="screen today-screen">
        {calendar}
        <section className="today-hero active-workout-hero">
          <Eyebrow>{displayDate(selectedDate)}</Eyebrow>
          <WorkoutTitle workout={active} day={selectedDay} />
          <p>
            {completedSets} / {pluralize(sets.length, "set")} ·{" "}
            {formatActiveWorkoutDuration(elapsed)}
          </p>
          <Button onClick={() => setPage("workout")}>
            RESUME WORKOUT
          </Button>
        </section>
        <section className="exercise-preview">
          <Eyebrow>WORKOUT EXERCISES</Eyebrow>
          {active.exercises.map((exercise, index) => {
            const done = exercise.sets.filter((set) => set.completed).length;
            const current = index === active.exerciseIndex;
            const detail =
              done > 0 || current
                ? `${done} of ${pluralize(exercise.sets.length, "set")}${current ? " · current" : ""}`
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
        {undoBanner}
      </main>
    );
  }
  const completed = datedWorkouts.find(
    (workout) =>
      workoutPlanDate(workout) === selectedIso &&
      (!template ||
        workout.programDayId === template.id ||
        (!workout.programDayId && workout.templateId === template.weekday)),
  );
  const isHistoricalWeek = selectedMonday < currentMonday;
  if (!template && !completed) {
    const upcoming = nextScheduledWorkout(state, selectedDate);
    const upcomingTitle = upcoming
      ? workoutDisplayParts(upcoming.workout, upcoming.workout.weekday)
      : null;
    const optional = (state.optionalSessions || []).find(
      (item) => item.date === selectedIso,
    );
    const isToday = selectedIso === isoDay();
    return (
      <main className={`screen today-screen${active ? " viewing-other-workout" : ""}`}>
        {calendar}
        {activeNotice}
        <section className="rest-day-state">
          <Eyebrow>REST DAY</Eyebrow>
          <h1>Rest day</h1>
          <p>
            {isHistoricalWeek
              ? "No workout was planned or logged on this date."
              : "This is a planned recovery day."}
          </p>
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
          {isToday && !active && (
            <button
              className="text-button train-anyway"
              onClick={() => setDetail({ restTraining: selectedIso })}
            >
              Train today instead
            </button>
          )}
          {optional && (
            <small className="optional-session-note">
              Optional {optional.kind.toLowerCase()} · {optional.duration} min
            </small>
          )}
        </section>
        {undoBanner}
      </main>
    );
  }
  const session = completed || template;
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
      setDetail("training-restrictions");
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
      update((current) => {
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
    <main className={`screen today-screen${active ? " viewing-other-workout" : ""}`}>
      {calendar}
      {activeNotice}
      <section className="today-hero">
        <Eyebrow>{displayDate(selectedDate)}</Eyebrow>
        <WorkoutTitle workout={session} day={selectedDay} />
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
        ) : active ? (
          <p className="active-workout-start-lock">
            Finish the active workout before starting this one.
          </p>
        ) : trainingPaused ? (
          <Button
            variant="secondary"
            onClick={() => setDetail("training-restrictions")}
          >
            REVIEW RESTRICTIONS
          </Button>
        ) : (
          <>
            <Button
              className="today-start-button"
              onClick={start}
              disabled={starting}
              aria-busy={starting}
            >
              <span aria-live="polite">
                {starting ? "STARTING…" : "START WORKOUT"}
              </span>
            </Button>
            {startError && (
              <p className="today-start-error" role="alert">
                {startError}
              </p>
            )}
          </>
        )}
      </section>
      <section className="exercise-preview">
        <Eyebrow>
          {completed ? "LOGGED EXERCISES" : "TODAY'S EXERCISES"}
        </Eyebrow>
        <span id="today-exercise-actions-help" className="visually-hidden">
          Opens exercise details. Use the context menu for exercise actions.
        </span>
        {session.exercises.map((exercise) => {
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
              actions={
                !completed &&
                !isHistoricalWeek &&
                recurringTemplate?.exercises.some(
                  (entry) => entry.id === exercise.id,
                )
                  ? {
                      planDate: selectedIso,
                      workoutId: recurringTemplate.id,
                      planEntryId: exercise.id,
                      onApplied: showUndo,
                    }
                  : null
              }
            />
          );
        })}
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
function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  disabled,
  emptyLabel,
  integer = false,
  alignToStep = false,
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
        aria-valuetext={empty ? undefined : String(shownValue)}
        placeholder={emptyLabel}
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
      <button
        aria-label={`Increase ${label}`}
        disabled={disabled || empty}
        onClick={() =>
          onChange(
            alignToStep
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
function WorkoutConfirmation({ confirmation, cancel, continueAction }) {
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
        <SheetDragHandle sheetRef={sheetRef} close={cancel} dragAnywhere />
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
function ActiveWorkout({ state, update, setPage, setDetail }) {
  const active = state.activeWorkout;
  const [now, setNow] = useState(Date.now());
  const [confirmation, setConfirmation] = useState(null);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [dismissingWarmup, setDismissingWarmup] = useState(null);
  const [recentlyCompletedSetId, setRecentlyCompletedSetId] = useState(null);
  const [restCompleteVisible, setRestCompleteVisible] = useState(false);
  const screenRef = useRef(null);
  const completionFeedbackTimerRef = useRef(null);
  const restCompleteTimerRef = useRef(null);
  const warmupDismissTimerRef = useRef(null);
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
  const previousRestLeftRef = useRef(restLeft);
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
    const previous = previousRestLeftRef.current;
    if (restLeft > 0) setRestCompleteVisible(false);
    if (previous > 0 && restLeft === 0 && active?.rest?.endsAt) {
      setRestCompleteVisible(true);
      triggerHaptic("complete");
      clearTimeout(restCompleteTimerRef.current);
      restCompleteTimerRef.current = setTimeout(
        () => setRestCompleteVisible(false),
        1400,
      );
    }
    previousRestLeftRef.current = restLeft;
  }, [restLeft, active?.rest?.endsAt]);
  useEffect(
    () => () => {
      clearTimeout(completionFeedbackTimerRef.current);
      clearTimeout(restCompleteTimerRef.current);
      clearTimeout(warmupDismissTimerRef.current);
    },
    [],
  );
  useEffect(
    () => {
      setWarmupOpen(false);
      setDismissingWarmup(null);
      clearTimeout(warmupDismissTimerRef.current);
    },
    [active?.id, active?.exerciseIndex],
  );
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
  const exercise = active.exercises[active.exerciseIndex];
  const exerciseIllustration =
    state.profile.showExerciseImages !== false ? exerciseArt(exercise) : null;
  const superset = supersetMeta(active.exercises, active.exerciseIndex);
  const canonicalSupersetStep = superset
    ? nextSupersetStep(active.exercises, superset.id)
    : null;
  const prior = previousExercise(state.workouts, exercise.exerciseId);
  const elapsed = Math.floor((now - active.startedAt) / 1000);
  const item = exerciseCatalog[exercise.exerciseId];
  const increment =
    state.profile.increments[item?.equipment?.[0]] ?? exercise.defaultIncrement;
  const recommendation = progressionFor(
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
      let previousOldWeight = target.weight;
      target.weight = value;
      target.touched = true;
      target.weightEntryMode = "manual";
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
        if (!set.completed && (empty(oldWeight) || linked || legacyLinked)) {
          set.weight = previous.weight;
          set.weightEntryMode = "auto";
          set.weightSourceSetId = previous.id;
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
    mutate((workout) => {
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
      delete sets.at(-1).completedAt;
    });
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
    mutate((workout) => {
      workout.exercises[workout.exerciseIndex].sets.splice(index, 1);
      workout.rest = null;
    });
  };
  const moveToExercise = (index) => {
    mutate((workout) => {
      workout.exerciseIndex = index;
      workout.rest = null;
    });
    setConfirmation(null);
    requestAnimationFrame(() =>
      screenRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
    );
  };
  const finishWorkout = () => {
    if (state.workouts.length === 0)
      trackFunnelEventOnce("first_workout_completed", {
        setCount: summary.completed,
        endedEarly: summary.completed < summary.total,
      });
    update(completeWorkout);
    setConfirmation(null);
    setPage("complete");
  };
  const requestNext = () => {
    if (incompleteCurrent)
      setConfirmation({ type: "next", incomplete: incompleteCurrent });
    else moveToExercise(nextIndex);
  };
  const requestFinish = () => {
    if (summary.completed < summary.total)
      setConfirmation({
        type: "finish",
        completed: summary.completed,
        planned: summary.total,
      });
    else finishWorkout();
  };
  const confirmAction = () =>
    confirmation?.type === "next" ? moveToExercise(nextIndex) : finishWorkout();
  const canRestartWorkout = activeWorkoutCanRestart(active);
  const restartWorkout = () => {
    const restartedAt = Date.now();
    update((current) => restartActiveWorkout(current, restartedAt));
    setNow(restartedAt);
    setConfirmation(null);
    setWarmupOpen(false);
    setDismissingWarmup(null);
    setRecentlyCompletedSetId(null);
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
  const addedBodyweightLoad = Boolean(item?.bodyweight && !timed);
  const timerVisible =
    !confirmation && (restReady || restLeft > 0 || restCompleteVisible);
  const currentWarmup = (active.warmup?.stages || []).find(
    (stage) =>
      stage.exerciseIndex === active.exerciseIndex &&
      stage.exerciseId === exercise.exerciseId &&
      !stage.skipped &&
      !stage.completed,
  );
  const warmup = currentWarmup || dismissingWarmup;
  const warmupDismissing = Boolean(!currentWarmup && dismissingWarmup);
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
  const dismissCurrentWarmup = (field) => {
    if (!currentWarmup) return;
    const snapshot = clone(currentWarmup);
    if (document.activeElement?.closest?.(".workout-warmup"))
      document.activeElement.blur();
    setWarmupOpen(false);
    setDismissingWarmup(snapshot);
    mutate((workout) => {
      const stage = workout.warmup?.stages?.find(
        (item) => item.id === currentWarmup.id,
      );
      if (stage) stage[field] = true;
    });
    clearTimeout(warmupDismissTimerRef.current);
    warmupDismissTimerRef.current = setTimeout(
      () => setDismissingWarmup(null),
      200,
    );
  };
  const completeWarmup = () => dismissCurrentWarmup("completed");
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
    return weight !== null && weight !== undefined
      ? `${displayWeight(weight, state.profile.units)} ${unit} × ${set.reps}`
      : `${set.loadPercent}% of working load × ${set.reps}`;
  };
  return (
    <main
      ref={screenRef}
      className={`screen workout-screen ${timerVisible ? "rest-timer-visible" : ""}`}
    >
      <header className="workout-header">
        <button aria-label="Back to Today" onClick={() => setPage("today")}>
          ‹
        </button>
        <div className="workout-header-center">
          <strong>{active.name}</strong>
          <small aria-live="polite">
            {summary.completed} / {pluralize(totalSets, "set")} ·{" "}
            {formatWorkoutElapsedDuration(elapsed)}
          </small>
        </div>
        <span className="workout-header-actions">
          <button className="text-button" onClick={requestFinish}>
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
      {warmup && (
        <section
          className={`workout-warmup ${warmupOpen ? "open" : ""}${warmupDismissing ? " dismissing" : ""}`}
          aria-hidden={warmupDismissing || undefined}
        >
          <div className="workout-warmup-content">
              <div className="workout-warmup-bar">
                <button
                  className="workout-warmup-toggle"
                  aria-expanded={warmupOpen}
                  onClick={() => setWarmupOpen((value) => !value)}
                >
                  <span>
                    <strong>Warm-up · ~{warmup.estimatedMinutes} min</strong>
                    <small>
                      {warmupOpen
                        ? "Hide recommendations"
                        : `For ${warmup.exerciseName}`}
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
              {active.warmup?.safetyMessage && (
                <p className="warmup-safety" role="status">
                  {active.warmup.safetyMessage}
                </p>
              )}
              {warmupOpen && (
                <div className="warmup-details">
                  {warmup.general.map((item) => (
                    <div className="warmup-layer" key={item.id}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>General · {item.minutes} min</small>
                      </span>
                    </div>
                  ))}
                  {warmup.movementPreparation.map((item) => (
                    <div className="warmup-layer" key={item.id}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          Movement preparation · {item.minutes} min
                        </small>
                      </span>
                    </div>
                  ))}
                  {warmup.rampUpSets.map((entry) => (
                    <div className="warmup-ramp" key={entry.exerciseId}>
                      <strong>{entry.exerciseName}</strong>
                      <small>
                        Ramp-up sets · not counted as working volume
                      </small>
                      {entry.sets.map((set) => (
                        <button
                          className={set.completed ? "completed" : ""}
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
                  <button
                    type="button"
                    className="warmup-finish"
                    onClick={completeWarmup}
                  >
                    {initialWarmup ? "FINISH WARM-UP" : "FINISH RAMP-UP"}
                  </button>
                </div>
              )}
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
            className="exercise-heading-art-button"
            aria-label={`View ${exerciseName(exercise)} illustration`}
            onClick={() => setDetail({ visual: exercise })}
          >
            <img
              className="exercise-heading-art"
              src={exerciseIllustration}
              alt=""
              aria-hidden="true"
            />
          </button>
        )}
        <div className="exercise-heading-content">
          <div className="exercise-heading-topline">
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
                title="Exercise options"
                onClick={() => setDetail({ options: exercise })}
              >
                <span aria-hidden="true">•••</span>
              </button>
            </div>
          </div>
          <h1>{exerciseName(exercise)}</h1>
          <p className="exercise-meta">
            Target {targetLabel(exercise, state.profile.rirEnabled)}
          </p>
          <small className="exercise-history-meta">
            {prior
              ? `Last ${prior.sets
                .filter((set) => set.completed)
                .map((set) => exerciseValueLabel(exercise, set.reps))
                .join(" / ")}`
              : "First session"}
          </small>
          {exerciseNote(exercise) && (
            <small className="exercise-user-note">{exerciseNote(exercise)}</small>
          )}
          {superset && (
            <small className="superset-next-step">{supersetNextLabel}</small>
          )}
        </div>
      </section>
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
                  : `Use ${displayWeight(recommendation.weight, state.profile.units)} ${unit} for today’s remaining sets.`
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
          className={`set-labels ${state.profile.rirEnabled && !timed ? "with-rir" : ""}`}
        >
          <span />
          <span>
            {addedBodyweightLoad ? "+ " : ""}
            {unit.toUpperCase()}
          </span>
          <span>{timed ? "SEC" : "REPS"}</span>
          {state.profile.rirEnabled && !timed && <span>RIR</span>}
          <span />
        </div>
        {exercise.sets.map((set, index) => {
          const activeSet = index === activeSetIndex;
          const future = !set.completed && !activeSet;
          const canComplete = workingSetCanComplete(exercise, set);
          const ready = activeSet && canComplete;
          const edited = activeSet && Boolean(set.touched);
          const checkDisabled = !set.completed && (!activeSet || !canComplete);
          return (
            <div
              key={set.id}
              className={`set-row ${state.profile.rirEnabled && !timed ? "with-rir" : ""} ${set.completed ? "set-done" : ""} ${activeSet ? "set-active" : ""} ${ready ? "set-ready" : ""} ${edited ? "set-edited" : ""} ${future ? "set-future" : ""} ${set.added ? "set-extra" : ""}${recentlyCompletedSetId === set.id ? " set-completing" : ""}`}
              data-set-state={set.completed ? "completed" : ready ? "ready" : activeSet ? "current" : "untouched"}
              aria-current={activeSet ? "step" : undefined}
            >
              {set.added ? (
                <button
                  className="extra-set-label"
                  aria-label={`Remove extra set ${index + 1}`}
                  onClick={() => removeExtraSet(index)}
                >
                  <b>{index + 1}</b>
                  <small>EXTRA</small>
                </button>
              ) : (
                <span className="set-index-label">
                  <b>{index + 1}</b>
                </span>
              )}
              <Stepper
                label={`${addedBodyweightLoad ? "Added load" : "Weight"} in ${unit} for set ${index + 1}`}
                value={displayWeight(set.weight, state.profile.units)}
                step={displayWeight(increment, state.profile.units)}
                alignToStep
                emptyLabel={addedBodyweightLoad ? "Bodyweight" : "Enter weight"}
                onChange={(value) =>
                  updateWeight(index, storedWeight(value, state.profile.units))
                }
              />
              <Stepper
                label={`${timed ? "Seconds" : "Reps"} for set ${index + 1}`}
                value={set.reps}
                step={timed ? 5 : 1}
                min={1}
                integer
                onChange={(value) => updateReps(index, value)}
              />
              {state.profile.rirEnabled && !timed && (
                <select
                  aria-label={`RIR for set ${index + 1}`}
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
              )}
              <button
                className="check"
                data-check-state={set.completed ? "completed" : ready ? "ready" : activeSet ? "current" : "disabled"}
                disabled={checkDisabled}
                aria-pressed={set.completed}
                aria-label={`${set.completed ? "Reopen" : "Complete"} set ${index + 1}`}
                onClick={() => toggleSet(index)}
              >
                {set.completed || ready ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span className="check-pending" aria-hidden="true" />
                )}
              </button>
            </div>
          );
        })}
        <Button
          variant="secondary"
          disabled={exercise.sets.length >= 6}
          onClick={addSet}
        >
          + ADD SET
        </Button>
        <div className="workout-primary-action">
          {hasPreviousExercise && (
            <Button
              variant="quiet"
              className="workout-previous"
              onClick={() => moveToExercise(previousIndex)}
            >
              ← PREVIOUS EXERCISE
            </Button>
          )}
          {canonicalSupersetStep ? (
            <Button variant="secondary" disabled>
              LOG NEXT SET TO CONTINUE
            </Button>
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
                    : "workout-next-ready"
                  : ""
              }
              onClick={nextExercise ? requestNext : requestFinish}
            >
              {nextExercise ? "NEXT EXERCISE →" : "FINISH WORKOUT"}
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
              onClick={() => moveToExercise(block.index)}
            >
              <span className="up-next-main">
                <strong className="up-next-title">
                  {block.entries.length === 2
                    ? `SUPERSET · A1 ${exerciseName(block.entries[0])} · A2 ${exerciseName(block.entries[1])}`
                    : exerciseName(block.entries[0])}
                </strong>
                {block.entries.length === 1 && exerciseNote(block.entries[0]) && (
                  <small className="up-next-note">
                    {exerciseNote(block.entries[0])}
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
                  : targetLabel(
                      block.entries[0],
                      state.profile.rirEnabled,
                    )}
              </small>
            </button>
          ))}
        </section>
      )}
      <WorkoutConfirmation
        confirmation={confirmation}
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

function CompletedWorkoutDetail({ workoutId, state, update, close, setDetail }) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  if (!workout) return null;
  const summary = workoutSetSummary(workout);
  const date = workoutPlanDate(workout);
  return (
    <main className="screen detail-screen completed-workout-detail">
      <header className="detail-header">
        <button aria-label="Back" onClick={close}>‹</button>
        <strong>Workout details</strong>
        <span />
      </header>
      <Eyebrow>{date ? displayDate(localDate(date)) : "COMPLETED WORKOUT"}</Eyebrow>
      <h1>{workout.name}</h1>
      <div className="completed-workout-summary">
        <span>
          <strong>{formatDuration(workout.durationSeconds)}</strong>
          <small>DURATION</small>
        </span>
        <span>
          <strong>{summary.completed} / {summary.total}</strong>
          <small>SETS</small>
        </span>
      </div>
      <SessionNoteEditor workout={workout} update={update} />
      <section className="completed-workout-log">
        <Eyebrow>SESSION LOG</Eyebrow>
        {workout.exercises.map((exercise) => {
          const logged = exercise.sets.filter((set) => set.completed).length;
          return (
            <button
              className="list-row"
              key={exercise.id}
              onClick={() => setDetail({ exercise })}
            >
              <strong>{exerciseName(exercise)}</strong>
              <span>{logged} / {exercise.sets.length} sets</span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function Complete({ state, update, setPage, setDetail }) {
  const session = state.workouts.at(-1);
  if (!session) return null;
  const completedExercises = session.exercises.filter((item) =>
    item.sets.some((set) => set.completed),
  );
  const summary = workoutSetSummary(session);
  const endedEarly =
    session.status === "ended-early" ||
    summary.completed < summary.total;
  const setResult = endedEarly
    ? `${summary.completed} of ${pluralize(summary.total, "set")}`
    : pluralize(summary.completed, "set");
  const visibleExercises = endedEarly ? session.exercises : completedExercises;
  return (
    <main
      className={`screen complete-screen ${endedEarly ? "ended-early" : ""}`}
    >
      {!endedEarly && <div className="complete-mark">✓</div>}
      <h1>{endedEarly ? "Workout ended early" : "Workout complete"}</h1>
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
      <SessionNoteEditor workout={session} update={update} />
      <section>
        <Eyebrow>{endedEarly ? "SESSION LOG" : "LOGGED"}</Eyebrow>
        {visibleExercises.length ? (
          visibleExercises.map((item) => {
            const planned = item.sets.length;
            const logged = item.sets.filter((set) => set.completed).length;
            return (
              <button
                key={item.id}
                className="list-row"
                onClick={() => setDetail({ exercise: item })}
              >
                <strong>{exerciseName(item)}</strong>
                <span>
                  {logged} of {pluralize(planned, "set")} logged
                </span>
              </button>
            );
          })
        ) : (
          <p className="muted">No completed sets were recorded.</p>
        )}
      </section>
      <section className="coach-note">
        <Eyebrow>{endedEarly ? "SAVED" : "NEXT SESSION"}</Eyebrow>
        <p>
          {endedEarly
            ? "Completed sets were saved. Incomplete sets were left unlogged."
            : "Completed values are saved. They will appear as real previous-session data the next time this exercise is programmed."}
        </p>
      </section>
      <Button
        variant="dark"
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
  onViewToday,
}) {
  const workoutName = (id) =>
    state.program?.days.find((day) => day.id === id)?.name || "Workout";
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
      </div>
    );
  return (
    <div className="action-card program-action-card">
      <h3>Review program changes</h3>
      <p>{action.explanation}</p>
      {action.changes.map((change) => (
        <div className="program-change" key={change.workoutId}>
          <Eyebrow>{workoutName(change.workoutId)}</Eyebrow>
          {change.addExerciseIds.map((id) => (
            <span className="program-change-add" key={`add-${id}`}>
              <i>+</i>
              <strong>{exerciseCatalog[id]?.name || "Exercise"}</strong>
            </span>
          ))}
          {change.removeExerciseIds.map((id) => (
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
  return props.action.type === "week-schedule-change" ? (
    <ScheduleActionCard {...props} />
  ) : props.action.type === "program-exercise-change" ? (
    <ProgramExerciseActionCard {...props} />
  ) : props.action.type === "add-today-workout" ? (
    <OptionalWorkoutActionCard {...props} />
  ) : (
    <AdaptActionCard {...props} />
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
        <div className="thinking-dots" aria-label="Coach is thinking">
          <i />
          <i />
          <i />
        </div>
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
        (set) => set.completed && Number.isFinite(Number(set.weight)),
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
    secondary: `${loggedWorkouts.length} ${loggedWorkouts.length === 1 ? "workout" : "workouts"} logged${hasWorkingWeights ? " · recent working weights available" : " · completed training history available"}`,
  };
}
export function contextualCoachPrompts(state) {
  const today = state.activeWorkout || adaptedTemplateForToday(state);
  const hasHistory = state.workouts.some(
    (workout) => workoutSetSummary(workout).completed > 0,
  );
  if (!today) {
    return [
      "Should I train today anyway?",
      "How am I recovering this week?",
      hasHistory
        ? "Am I progressing on this program?"
        : "Explain how this program fits my goals.",
    ];
  }
  if (hasHistory) {
    return [
      "Why did my working weight change?",
      "Adjust today based on my last workout.",
      "Am I progressing on this program?",
    ];
  }
  return [
    "Adapt today to 35 minutes.",
    "How should I approach my first workout?",
    "Explain how this program fits my goals.",
  ];
}
function Coach({ state, update, setPage }) {
  const [message, setMessage] = useState(state.coachDraft || "");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const coachAvailable = online && state.ai.available !== false;
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef(null);
  const historyScrollRef = useRef(null);
  const historyScrollTop = useRef(0);
  const composerRef = useRef(null);
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
      if (event.key === "Escape") setMenuOpen(false);
    };
    addEventListener("keydown", closeOnEscape);
    return () => removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousFocus = document.activeElement;
    const background = [
      scrollRef.current,
      composerRef.current?.closest(".coach-input"),
    ].filter(Boolean);
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
      focusable()[0]?.focus({ preventScroll: true });
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
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current)
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    currentMessages.length,
    latestMessage?.reply,
    latestMessage?.actionResult?.status,
    sending,
    activeId,
  ]);
  const send = async (value) => {
    const text = value.trim();
    if (!text || sending || !coachAvailable) return;
    const conversationId = activeId || `thread-${Date.now()}`;
    const entryId = `msg-${Date.now()}`;
    setSending(true);
    setMessage("");
    update((current) => {
      current.coachDraft = "";
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
    const reply = await AIService.coach(
      { ...state, activeCoachConversationId: conversationId },
      text,
    );
    update((current) => {
      const entry = current.conversations.find((item) => item.id === entryId);
      if (entry) entry.reply = reply;
      return current;
    });
    setSending(false);
  };
  const applyEntryAction = (entry, reviewedAction) =>
    update((current) => {
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
      if (acceptedAction.type === "week-schedule-change") {
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
          const ids =
            current.program?.days
              .find((day) => day.id === change.workoutId)
              ?.exercises.map((exercise) => exercise.exerciseId) || [];
          return (
            change.addExerciseIds.every((id) => ids.includes(id)) &&
            change.removeExerciseIds.every((id) => !ids.includes(id))
          );
        });
        if (applied)
          stored.actionResult = {
            status: "applied",
            appliedAt: Date.now(),
            scope: "recurring-program",
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
    });
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
        activeWorkout: current.activeWorkout,
        todayAdaptation: current.todayAdaptation,
      };
      if (JSON.stringify(currentSnapshot) !== JSON.stringify(result.appliedSnapshot)) {
        stored.actionResult = {
          ...result,
          status: "undo-conflict",
          reason: "workout-changed",
        };
        return current;
      }
      current.activeWorkout = structuredClone(result.undoSnapshot.activeWorkout);
      current.todayAdaptation = structuredClone(result.undoSnapshot.todayAdaptation);
      stored.actionResult = { ...result, status: "undone", undoneAt: Date.now() };
      return current;
    });
  const hasConversation = currentMessages.length > 0;
  const prompts = contextualCoachPrompts(state);
  const contextSummary = coachContextSummary(state);
  const choosePrompt = (prompt) => {
    setMessage(prompt);
    requestAnimationFrame(() => {
      const composer = composerRef.current;
      composer?.focus({ preventScroll: true });
      composer?.setSelectionRange(prompt.length, prompt.length);
    });
  };
  const newConversation = () => {
    update((current) => {
      current.activeCoachConversationId = null;
      return current;
    });
    setMenuOpen(false);
  };
  const openConversation = (id) => {
    update((current) => {
      current.activeCoachConversationId = id;
      return current;
    });
    setMenuOpen(false);
  };
  return (
    <main
      className={`screen coach-screen ${hasConversation ? "coach-active" : "coach-home"} ${menuOpen ? "coach-menu-open" : ""}`}
    >
      <div className="coach-scroll" ref={scrollRef}>
        <header className="coach-header">
          <div>
            <Eyebrow>COACH</Eyebrow>
            {hasConversation && <strong>Conversation</strong>}
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
        {!hasConversation && (
          <header className="coach-intro">
            <h1>Your plan and real training data, in context.</h1>
          </header>
        )}
        {!coachAvailable && (
          <div className="offline-banner">
            AI Coach is unavailable. Logging and data-based progression still
            work locally.
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
                  {entry.reply.action && (
                    <ActionCard
                      action={entry.reply.action}
                      result={entry.actionResult}
                      state={state}
                      onAccept={(accepted) => applyEntryAction(entry, accepted)}
                      onUndo={() => undoEntryAction(entry)}
                      onViewToday={() => setPage("today")}
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
        className="coach-input"
        onSubmit={(event) => {
          event.preventDefault();
          send(message);
        }}
      >
        <textarea
          ref={composerRef}
          rows="1"
          aria-label="Ask Coach"
          disabled={sending}
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
          placeholder={coachAvailable ? "Ask anything…" : "Coach unavailable"}
        />
        <Button
          className={`coach-send ${sending ? "is-sending" : message.trim() ? "is-ready" : "is-empty"}`}
          disabled={sending || !coachAvailable || !message.trim()}
          aria-label={sending ? "Sending message" : "Send message"}
          aria-busy={sending}
        >
          <span aria-hidden="true">{sending ? "…" : "↑"}</span>
        </Button>
      </form>
      {menuOpen && (
        <section
          className="coach-history-surface"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-history-title"
        >
          <header className="coach-history-header">
            <button
              type="button"
              aria-label="Back to Coach"
              onClick={() => setMenuOpen(false)}
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
function Progress({ state, setDetail }) {
  const completedWorkouts = state.workouts.filter(
    (workout) =>
      workout.completedAt && workoutSetSummary(workout).completed > 0,
  );
  const consistency = consistencyForCurrentWeek(state);
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
  const workingExercises = latest.length ? latest : earlyExercises.slice(0, 3);
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
  const progressionRows = progressionExercises
    .map((exercise) => ({
      exercise,
      result: progressionFor(exercise, state.workouts, state.profile),
    }))
    .filter((item) => item.result)
    .sort(
      (left, right) =>
        progressionPriority(left.result) - progressionPriority(right.result),
    )
    .slice(0, 4);
  const improvements = recentExerciseProgress(completedWorkouts);
  const title =
    completedWorkouts.length === 0
      ? "Your progress starts here."
      : completedWorkouts.length === 1
        ? "Your baseline is set."
        : progressionRows.length
          ? "Know where your training stands."
          : "Your training is building a baseline.";
  const intro =
    completedWorkouts.length === 0
      ? "Complete your first workout to start building training history."
      : completedWorkouts.length === 1
        ? "Your first logged session gives you a real starting point."
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
  return (
    <main className="screen progress-screen">
      <Eyebrow>PROGRESS</Eyebrow>
      <h1>{title}</h1>
      <p className="progress-lede">{intro}</p>
      <section className="progression-overview">
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
            More comparable sessions are needed before there is a progression
            call.
          </p>
        )}
      </section>
      <section>
        <Eyebrow>THIS WEEK</Eyebrow>
        {consistency.planned > 0 ? (
          <>
            <div
              className="consistency"
              aria-label={`${consistency.completed} of ${consistency.planned} planned sessions completed this week`}
            >
              <strong>
                {consistency.completed} / {consistency.planned}
              </strong>
              <span>planned sessions completed</span>
            </div>
            <div className="consistency-bars">
              {Array.from({ length: consistency.planned }, (_, index) => (
                <i
                  className={index < consistency.completed ? "filled" : ""}
                  key={index}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="progression-empty">No sessions planned this week.</p>
        )}
      </section>
      {improvements.length > 0 ? (
        <section className="progress-lower">
          <Eyebrow>RECENT IMPROVEMENTS</Eyebrow>
          {improvements.slice(0, 3).map((item) => (
            <button
              key={item.exerciseId}
              className="list-row"
              onClick={() => setDetail({ exercise: item.exercise })}
            >
              <span>
                <strong>{exerciseName(item.exercise)}</strong>
                <small>
                  {item.type === "weight"
                    ? `+${displayWeight(item.deltaWeight, state.profile.units)} ${unit} since last session`
                    : `+${item.deltaReps} ${item.deltaReps === 1 ? "rep" : "reps"}${item.weight !== null ? ` at ${displayWeight(item.weight, state.profile.units)} ${unit}` : ""}`}
                </small>
              </span>
              <span className="navigation-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
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
                </button>
              );
            })}
        </section>
      ) : null}
      {workingExercises.length > 0 && (
        <section className="working-weights-section">
          <Eyebrow>WORKING WEIGHTS</Eyebrow>
          {workingExercises.slice(0, 6).map((item) => {
            const completed = item.sets.filter((set) => set.completed);
            const weighted = completed.filter(
              (set) => set.weight !== null && set.weight !== undefined,
            );
            const set = weighted.length
              ? weighted.reduce((best, value) =>
                  Number(value.weight) >= Number(best.weight) ? value : best,
                )
              : null;
            const isBodyweight = Boolean(
              exerciseCatalog[item.exerciseId]?.bodyweight,
            );
            return (
              <button
                key={item.exerciseId}
                className="list-row working-weight-row"
                onClick={() => setDetail({ exercise: item })}
              >
                <strong>{exerciseName(item)}</strong>
                <span>
                  <b>
                    {set
                      ? `${displayWeight(set.weight, state.profile.units)} ${unit}`
                      : isBodyweight && completed.length
                        ? "Bodyweight"
                        : completed.length
                          ? "No weight logged"
                          : "Not enough data"}
                  </b>
                  <i aria-hidden="true">›</i>
                </span>
              </button>
            );
          })}
        </section>
      )}
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
export function exerciseHistoryWeightLabel({
  timed = false,
  bodyweight = false,
  weight,
  units = "kg",
} = {}) {
  if (timed) return "Timed hold";
  if (bodyweight) return "Bodyweight";
  if (
    weight === null ||
    weight === undefined ||
    weight === "" ||
    !Number.isFinite(Number(weight))
  )
    return "Weight not logged";
  return `${displayWeight(Number(weight), units)} ${weightUnit(units)}`;
}
export function exerciseHistoryPerformanceLabel(exercise, sets = []) {
  const completed = sets
    .filter((set) => set.completed && Number.isFinite(Number(set.reps)))
  const values = completed.map((set) => Number(set.reps));
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
    ["Schedule", formatScheduleDays(profile?.availableDays)],
    [
      "Session length",
      Number.isFinite(Number(profile?.sessionMinutes)) &&
      Number(profile.sessionMinutes) > 0
        ? `${Number(profile.sessionMinutes)} min`
        : null,
    ],
    ["Environment", profile?.environment],
    ["Equipment", equipment],
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
  const splitPreference = detectSplitPreference(profile);
  const items = [
    ["GOAL", `${profile.goal} · ${profile.experience}`],
    [
      "WEEK",
      `${pluralize(program.days.length, "session")} · ${program.days.map((day) => day.weekday).join(", ")}`,
    ],
    ["SESSION", `Up to ${profile.sessionMinutes} min`],
    ["EQUIPMENT", equipment || profile.environment],
  ];
  if (splitPreference) items.push(["STYLE", splitPreference.label]);
  if (focus.length) items.push(["FOCUS", focus.join(", ")]);
  else items.push(["FOCUS", "Balanced"]);
  if (String(profile.avoid || "").trim())
    items.push(["RESTRICTIONS", "Protected in exercise selection"]);
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
  const p = state.profile;
  const profileSafety = trainingSafetyFor(p);
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
  const training = profileTrainingRows(p);
  const trainingSettingDetails = {
    Schedule: { profileTrainingSetting: "schedule" },
    Environment: { profileTrainingSetting: "setup", focus: "environment" },
    Equipment: { profileTrainingSetting: "setup", focus: "equipment" },
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
  const adjust = () => {
    update((current) => {
      current.coachDraft = "I want to adjust my current training plan.";
      return current;
    });
    setPage("coach");
  };
  const logOut = () => {
    if (
      !confirm(
        "Log out and delete this local profile, plan, workout history, and Coach conversations?",
      )
    )
      return;
    setDetail(null);
    onLogout();
    update(() => blankState());
  };
  return (
    <main className="screen profile-screen">
      <header className="profile-program">
        <Eyebrow>PROFILE</Eyebrow>
        <h1>Training setup</h1>
        <div className="profile-current-program">
          <Eyebrow>CURRENT PROGRAM</Eyebrow>
          <h2>{programTitle}</h2>
          <p>
            {frequency}
            {!imported && goalContext ? ` · ${goalContext}` : ""}
          </p>
        </div>
      </header>
      {personal.length > 0 && (
        <section>
          <Eyebrow>ABOUT YOU</Eyebrow>
          {personal.map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </section>
      )}
      {personalIncomplete && (
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
      {training.length > 0 && (
        <section>
          <Eyebrow>TRAINING</Eyebrow>
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
        </section>
      )}
      {state.program.conditioning && (
        <section>
          <Eyebrow>CARDIO</Eyebrow>
          <ConditioningCard conditioning={state.program.conditioning} />
        </section>
      )}
      <section>
        <Eyebrow>
          {preferencesOnly ? "COACHING PREFERENCES" : "TRAINING PRIORITIES"}
        </Eyebrow>
        {manualPriorities.length > 0 && (
          <InfoRow
            label={
              preferencesOnly
                ? manualPriorities.length === 1
                  ? "Priority area"
                  : "Priority areas"
                : manualPriorities.length === 1
                  ? "Selected area"
                  : "Selected areas"
            }
            value={manualPriorities.join(", ")}
          />
        )}
        {confirmedPriorities.map((item) => (
          <InfoRow key={item.label} label={item.label} value={item.level} />
        ))}
        {!hasPriorities && (
          <p className="muted profile-priority-empty">
            {preferencesOnly
              ? "No priority areas selected."
              : "Balanced across muscle groups."}
          </p>
        )}
        <button
          className="list-row"
          onClick={() => setDetail("training-priorities")}
        >
          <span>
            <strong>
              {preferencesOnly ? "Edit priorities" : "Review priorities"}
            </strong>
            <small>
              {preferencesOnly
                ? "Used by Coach and future generated plans. Changes don’t update this plan."
                : "Used to build your plan and guide Coach. Changes apply when you adjust or rebuild it."}
            </small>
          </span>
          <span>›</span>
        </button>
      </section>
      <section className="program-actions">
        <Eyebrow>PROGRAM</Eyebrow>
        <button
          className="list-row"
          disabled={Boolean(state.activeWorkout)}
          onClick={() => setDetail("edit-plan")}
        >
          <span>
            <strong>Edit plan</strong>
            <small>
              {state.activeWorkout
                ? "Finish your active workout first."
                : "Names, exercises, sets, reps and weights"}
            </small>
          </span>
          {!state.activeWorkout && <span>›</span>}
        </button>
        <button className="list-row" onClick={adjust}>
          <span>
            <strong>Ask Coach to adjust</strong>
            <small>Make a reviewed AI change</small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("change-plan")}>
          <span>
            <strong>Replace plan</strong>
            <small>Build or import a different program</small>
          </span>
          <span>›</span>
        </button>
      </section>
      <section>
        <Eyebrow>SETTINGS</Eyebrow>
        <button
          className="list-row"
          onClick={() => setDetail("training-restrictions")}
        >
          <span>
            <strong>Training restrictions</strong>
            <small>
              {trainingSafetyBlocks(profileSafety.status)
                ? "Needs review before training"
                : profileSafety.status === "constraints_active"
                  ? "Explicit restrictions applied"
                  : profileSafety.pastResolved
                    ? "Past issue noted"
                    : "None added"}
            </small>
          </span>
          <span>›</span>
        </button>
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
              {titleCase(p.themePreference || "light")} theme · Illustrations{" "}
              {p.showExerciseImages === false ? "off" : "on"}
            </small>
          </span>
          <span>›</span>
        </button>
      </section>
      <Button variant="quiet" className="logout-button" onClick={logOut}>
        Log out
      </Button>
    </main>
  );
}

function TrainingRestrictions({ state, update, close }) {
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
  const commit = (semanticAnalysis) => {
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
    close();
  };
  const save = async () => {
    const candidateText = sourceText.trim();
    if (!candidateText) return commit(null);
    if (analysis && analysisStatus === "ready") return commit(analysis);
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
      )
        commit(result);
    } catch {
      setAnalysisStatus("error");
    }
  };
  return (
    <main className="screen detail-screen training-restrictions-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>‹</button>
        <strong>Training restrictions</strong>
        <span />
      </header>
      <Eyebrow>TRAINING RESTRICTIONS</Eyebrow>
      <h1>Apply only clear limits.</h1>
      <p>
        Add current pain, recent surgery, movements you avoid, or limits a
        clinician gave you. Rook does not diagnose or create rehabilitation
        plans.
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
      <Button
        onClick={save}
        disabled={
          analysisStatus === "checking" ||
          (analysisStatus === "ready" &&
            ["needs_confirmation", "needs_clearance_confirmation", "needs_limits_confirmation", "needs_trigger_confirmation"].includes(
              safety.status,
            ))
        }
      >
        {analysisStatus === "checking" ? "CHECKING…" : "SAVE RESTRICTIONS"}
      </Button>
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
function TrainingPriorities({ state, update, close }) {
  const preferencesOnly = ["ai-import", "manual"].includes(
    state.program.source,
  );
  const [sources, setSources] = useState(() =>
    clone(
      state.profile.prioritySources || {
        manual: state.profile.priorities || [],
        physiqueSuggested: [],
        physiqueConfirmed: [],
      },
    ),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const manual = sources.manual || [];
  const confirmed = sources.physiqueConfirmed || [];
  const toggleManual = (option) =>
    setSources((current) => {
      let next = current.manual || [];
      next = next.includes(option)
        ? next.filter((value) => value !== option)
        : [...next, option];
      if (option === "Balanced") next = ["Balanced"];
      else next = next.filter((value) => value !== "Balanced");
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
    close();
  };
  return (
    <main className="screen detail-screen priority-settings">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>
          {preferencesOnly ? "Coaching preferences" : "Training priorities"}
        </strong>
        <span />
      </header>
      <Eyebrow>
        {preferencesOnly ? "COACHING PREFERENCES" : "TRAINING PRIORITIES"}
      </Eyebrow>
      <h1>
        {preferencesOnly
          ? "What should Coach keep in mind?"
          : "What would you like to emphasize?"}
      </h1>
      <p>
        {preferencesOnly
          ? "These choices guide Coach and future generated plans. They don’t update this plan unless you explicitly ask Coach to adjust it."
          : "Edit your choices at any time. They guide Coach and future program generation; changes apply when you adjust or rebuild your plan."}
      </p>
      <div className="option-list option-grid">
        {PRIORITIES.map((option) => (
          <OnboardingOptionCard
            key={option}
            label={option}
            selected={manual.includes(option)}
            onClick={() => toggleManual(option)}
          />
        ))}
      </div>
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
      <button
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
      </button>
      <Button onClick={save}>
        {preferencesOnly ? "SAVE PREFERENCES" : "SAVE PRIORITIES"}
      </Button>
    </main>
  );
}
function ScratchPlan({ state, update, close, onPlanAccepted }) {
  const [name, setName] = useState("My training plan");
  const [days, setDays] = useState([]);
  const [draft, setDraft] = useState(null);
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
  const begin = () =>
    setDraft({
      id: `manual-program-${Date.now()}`,
      name: name.trim(),
      source: "manual",
      userEdited: true,
      version: 1,
      createdAt: new Date().toISOString(),
      days: days.map((day) => ({
        id: `manual-day-${day}-${Date.now()}`,
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
    update((current) => {
      current.profile = { ...validationProfile, onboardingComplete: true };
      current.program = {
        ...program,
        profileSnapshot: clone(validationProfile),
      };
      current.selectedDay = weekday();
      current.selectedDate = isoDay();
      current.ai = { ...current.ai, lastPlanSource: "manual" };
      return current;
    });
    onPlanAccepted?.();
  };
  if (draft)
    return (
      <main className="screen detail-screen initial-import-screen scratch-editor-screen">
        <header className="detail-header">
          <button
            aria-label="Back to plan setup"
            onClick={() => setDraft(null)}
          >
            ‹
          </button>
          <strong>Manual plan</strong>
          <span />
        </header>
        <PlanEditor
          source={draft}
          profile={profile}
          mode="scratch"
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      </main>
    );
  return (
    <main className="screen detail-screen initial-import-screen scratch-plan-screen">
      <header className="detail-header">
        <button aria-label="Back to start" onClick={close}>
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
        onClick={close}
      >
        <BackLabel />
      </Button>
    </main>
  );
}
export function planEditorAllowsSupersets(mode = "review") {
  return mode === "edit";
}

function PlanEditor({
  source,
  profile,
  mode = "review",
  onSave,
  onCancel,
  saving = false,
}) {
  const withWarmupPreference = (value) => ({
    ...clone(value),
    includeRecommendedWarmups:
      value.includeRecommendedWarmups ??
      profile.recommendedWarmupsEnabled !== false,
  });
  const [program, setProgram] = useState(() => withWarmupPreference(source));
  const [dirty, setDirty] = useState(false);
  const firstUnresolvedExercise = (value) =>
    value.days
      .flatMap((day) => day.exercises)
      .find((exercise) =>
        ["unresolved", "needs-name-review"].includes(exercise.matchStatus),
      )?.id ?? null;
  const [expandedExerciseId, setExpandedExerciseId] = useState(() =>
    firstUnresolvedExercise(source),
  );
  const [exercisePickerId, setExercisePickerId] = useState(null);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [prescriptionEditorId, setPrescriptionEditorId] = useState(null);
  const [weightEditorId, setWeightEditorId] = useState(null);
  const [addingToDayId, setAddingToDayId] = useState(null);
  const [copyingDayId, setCopyingDayId] = useState(null);
  const [pairingExerciseId, setPairingExerciseId] = useState(null);
  const [collapsedDayIds, setCollapsedDayIds] = useState([]);
  const reorderRootRef = useRef(null);
  const reorderGestureRef = useRef(null);
  const reorderPreviewRef = useRef(null);
  const reorderFrameRef = useRef(null);
  const programRef = useRef(program);
  const commitReorderRef = useRef(null);
  const suppressReorderClickUntil = useRef(0);
  const [reorderView, setReorderView] = useState(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  programRef.current = program;
  useLayoutEffect(() => {
    const gesture = reorderGestureRef.current;
    if (!reorderView || !gesture?.active || !reorderPreviewRef.current) return;
    reorderPreviewRef.current.style.setProperty(
      "--reorder-drag-y",
      `${gesture.clientY - gesture.startY}px`,
    );
  }, [reorderView]);
  useEffect(() => {
    const next = withWarmupPreference(source);
    setProgram(next);
    setDirty(false);
    setExpandedExerciseId(firstUnresolvedExercise(next));
    setExercisePickerId(null);
    setExerciseQuery("");
    setPrescriptionEditorId(null);
    setWeightEditorId(null);
    setAddingToDayId(null);
    setCopyingDayId(null);
    setPairingExerciseId(null);
    setCollapsedDayIds([]);
  }, [source.id]);
  const imported = program.source === "ai-import";
  const scratch = mode === "scratch";
  const preview = ["review", "import", "expert"].includes(mode);
  const importReview = imported && mode === "import";
  const allowSupersets = planEditorAllowsSupersets(mode);
  const allowReorder = mode === "edit";
  const orderedProgramDays = useMemo(
    () => chronologicalProgramDays(program.days),
    [program.days],
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
  const keepableUnresolved = program.days
    .flatMap((day) => day.exercises)
    .filter((exercise) =>
      ["unresolved", "needs-name-review"].includes(exercise.matchStatus),
    ).length;
  const catalog = Object.values(exerciseCatalog)
    .filter((item) => isExerciseAllowed(item, profile))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      targetDay.estimatedMinutes = estimateSessionMinutes(targetDay.exercises);
      setProgram(next);
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
    setProgram({ ...current, days: moved });
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
    });
  };

  useEffect(() => {
    if (!allowReorder) return undefined;
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
        }),
      );
    };
    const clearCandidate = () => {
      const gesture = reorderGestureRef.current;
      if (gesture?.holdTimer) clearTimeout(gesture.holdTimer);
      resetDisplacement(gesture);
      reorderGestureRef.current = null;
      clearFrame();
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
          (unit.index > gesture.sourceIndex ? gesture.sourceSpan : 0),
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
      const targetChanged = gesture.lastTargetIndex !== targetIndex;
      gesture.lastTargetIndex = targetIndex;
      gesture.targetIndex = targetIndex;
      applyDisplacement(gesture, targetIndex);
      if (!gesture.viewPublished || targetChanged) {
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
      reorderPreviewRef.current?.style.setProperty(
        "--reorder-drag-y",
        `${gesture.clientY - gesture.startY}px`,
      );
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
        const distance = direction * (180 + 720 * Math.min(1, depth)) * elapsed / 1000;
        const before = scroller.scrollTop;
        scroller.scrollTop += distance;
        if (scroller.scrollTop !== before) publish(gesture);
      }
      reorderFrameRef.current = requestAnimationFrame(autoScroll);
    };
    const activate = (gesture) => {
      if (!gesture || reorderGestureRef.current !== gesture) return;
      gesture.active = true;
      gesture.holdTimer = null;
      gesture.scroller = scrollContainerFor(gesture.activator);
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
      setExpandedExerciseId(null);
      setExercisePickerId(null);
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
      if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
      if (gesture.active) {
        suppressReorderClickUntil.current = performance.now() + 500;
        if (commit && commitReorderRef.current?.(gesture)) triggerHaptic("tap");
      }
      clearCandidate();
    };
    const touchStart = (event) => {
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
      gesture.holdTimer = setTimeout(() => activate(gesture), 350);
      reorderGestureRef.current = gesture;
    };
    const touchMove = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture || gesture.pointerType !== "touch") return;
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === gesture.touchId,
      );
      if (!touch) return;
      if (!gesture.active) {
        const distance = Math.hypot(
          touch.clientX - gesture.startX,
          touch.clientY - gesture.startY,
        );
        if (distance > 8) clearCandidate();
        return;
      }
      event.preventDefault();
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
      const activator = activatorFor(event.target);
      if (!activator) return;
      const gesture = buildCandidate(activator, event.clientY, event.pointerType);
      gesture.pointerId = event.pointerId;
      gesture.startX = event.clientX;
      if (event.pointerType === "pen")
        gesture.holdTimer = setTimeout(() => activate(gesture), 250);
      reorderGestureRef.current = gesture;
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
        gesture.activator.setPointerCapture?.(event.pointerId);
      }
      if (!gesture.active) return;
      event.preventDefault();
      gesture.clientY = event.clientY;
      publish(gesture);
    };
    const pointerEnd = (event) => {
      const gesture = reorderGestureRef.current;
      if (!gesture || gesture.pointerType === "touch" || gesture.pointerId !== event.pointerId)
        return;
      finish(event.type === "pointerup");
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
    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("touchmove", touchMove, { passive: false });
    root.addEventListener("touchend", touchEnd);
    root.addEventListener("touchcancel", touchCancel);
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("pointermove", pointerMove);
    root.addEventListener("pointerup", pointerEnd);
    root.addEventListener("pointercancel", pointerEnd);
    root.addEventListener("click", clickCapture, true);
    window.addEventListener("keydown", cancelOnEscape);
    window.addEventListener("blur", clearCandidate);
    document.addEventListener("visibilitychange", clearCandidate);
    return () => {
      clearCandidate();
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("touchmove", touchMove);
      root.removeEventListener("touchend", touchEnd);
      root.removeEventListener("touchcancel", touchCancel);
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("pointermove", pointerMove);
      root.removeEventListener("pointerup", pointerEnd);
      root.removeEventListener("pointercancel", pointerEnd);
      root.removeEventListener("click", clickCapture, true);
      window.removeEventListener("keydown", cancelOnEscape);
      window.removeEventListener("blur", clearCandidate);
      document.removeEventListener("visibilitychange", clearCandidate);
    };
  }, [allowReorder]);
  const mutateExercise = (dayId, exerciseId, mutate) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      const exercise = day?.exercises.find((item) => item.id === exerciseId);
      if (!exercise) return current;
      mutate(exercise);
      day.estimatedMinutes = estimateSessionMinutes(day.exercises);
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
    setExpandedExerciseId(null);
    setExercisePickerId(null);
    setExerciseQuery("");
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((item) => item.id === dayId);
      if (!day || (!scratch && day.exercises.length <= 1)) return current;
      const removed = day.exercises.find((item) => item.id === exerciseId);
      if (
        removed?.supersetId &&
        !confirm(
          `Remove ${exerciseName(removed)}? Its partner will stay in the day and the superset pairing will be removed.`,
        )
      )
        return current;
      day.exercises = day.exercises.filter((item) => item.id !== exerciseId);
      day.exercises.forEach((item) => {
        if (item.supersetId === removed?.supersetId) delete item.supersetId;
      });
      day.estimatedMinutes = estimateSessionMinutes(day.exercises);
      return next;
    });
  };
  const addExercise = (dayId, catalogId) => {
    const item = exerciseCatalog[catalogId];
    if (!item) return;
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
        exerciseSource: "catalog",
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
      day.estimatedMinutes = estimateSessionMinutes(day.exercises);
      return next;
    });
    setAddingToDayId(null);
    setExerciseQuery("");
  };
  const addCustomExercise = (dayId, rawName) => {
    const name = String(rawName || "")
      .trim()
      .slice(0, 80);
    if (!name) return;
    const exerciseId = `manual-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const customId = `imported-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const day = next.days.find((value) => value.id === dayId);
      if (!day || day.exercises.length >= 8) return current;
      day.exercises.push({
        id: exerciseId,
        exerciseId: customId,
        exerciseSource: "imported-custom",
        importedName: name,
        originalImportedName: name,
        importedExercise: {
          id: customId,
          name,
          source: "manual",
          pattern: null,
          muscles: null,
          equipment: null,
        },
        matchStatus: "confirmed-custom",
        programmingRole: "accessory",
        sets: Array.from({ length: 3 }, (_, index) => ({
          id: `${exerciseId}-set-${index}`,
          weight: null,
          reps: 8,
          completed: false,
        })),
        repMin: 8,
        repMax: 12,
        targetRir: null,
        restSeconds: 90,
        defaultIncrement: 1,
      });
      day.estimatedMinutes = estimateSessionMinutes(day.exercises);
      return next;
    });
    setAddingToDayId(null);
    setExerciseQuery("");
    setExpandedExerciseId(exerciseId);
  };
  const replaceExercise = (dayId, exerciseId, catalogId) => {
    mutateExercise(dayId, exerciseId, (exercise) => {
      const item = exerciseCatalog[catalogId];
      if (!item) return;
      if (importReview)
        exercise.importedSourceName ??=
          exercise.originalImportedName || exercise.importedName || null;
      exercise.exerciseId = item.id;
      exercise.defaultIncrement = item.increment;
      exercise.restSeconds = item.restSeconds;
      exercise.importedName = item.name;
      exercise.originalImportedName = item.name;
      exercise.matchStatus = "confirmed-match";
      delete exercise.importedExercise;
      if (!importReview)
        exercise.sets.forEach((set) => {
          set.weight = null;
        });
    });
    setExercisePickerId(null);
    setExerciseQuery("");
    if (importReview) {
      setExpandedExerciseId(null);
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
      exercise.restSeconds ??= item.restSeconds;
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
    mutateExercise(dayId, exerciseId, confirmImportedName);
    setExpandedExerciseId(null);
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
      day.estimatedMinutes = estimateSessionMinutes(day.exercises);
      return next;
    });
  };
  const setRep = (dayId, exerciseId, key, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      const numeric = Math.max(1, Math.min(100, Number(value) || 1));
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
    });
  const setStartingWeight = (dayId, exerciseId, value) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      const weight =
        value === ""
          ? null
          : Math.max(0, storedWeight(value, profile.units));
      exercise.sets.forEach((set) => {
        set.weight = weight;
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
    setProgram((current) => ({ ...current, includeRecommendedWarmups: value }));
  };
  const copyDayExercises = (sourceDayId, targetDayId) => {
    setDirty(true);
    setProgram((current) => {
      const next = clone(current);
      const sourceDay = next.days.find((day) => day.id === sourceDayId);
      const targetDay = next.days.find((day) => day.id === targetDayId);
      if (!sourceDay?.exercises.length || !targetDay || targetDay.exercises.length)
        return current;
      targetDay.exercises = remapCopiedSupersetIds(
        sourceDay.exercises.map((exercise, exerciseIndex) => {
          const exerciseId = `manual-exercise-${Date.now()}-${exerciseIndex}-${Math.random().toString(36).slice(2, 7)}`;
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
      targetDay.estimatedMinutes = estimateSessionMinutes(targetDay.exercises);
      return next;
    });
    setCopyingDayId(null);
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
    const timed = exerciseMeasure(exercise) === "seconds";
    const value = exercise.failureTarget
      ? "failure"
      : exercise.repMin === exercise.repMax
        ? exercise.repMin
        : `${exercise.repMin}\u2013${exercise.repMax}`;
    const reps = `${value}${exercise.failureTarget ? "" : timed ? " sec" : " reps"}`;
    const weights = exercise.sets
      .map((set) => set.weight)
      .filter(
      (set) =>
        set !== null && set !== undefined && set !== "",
      );
    const weightSummary = weights.length
      ? ` \u00b7 ${weights.map((weight) => Number(weight)).join(" / ")} kg`
      : "";
    return `${pluralize(exercise.sets.length, "set")} \u00b7 ${reps}${imported ? weightSummary : ""}`;
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
            title: "Build every workout.",
            body: "Add at least one exercise to each training day, then adjust sets and rep targets.",
            action: "USE THIS PLAN",
          }
        : mode === "import"
          ? {
              eyebrow: "IMPORT PLAN",
              title: "Review your plan",
              body: "Rook matched the exercises it could. Review only the highlighted items, then use your plan.",
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
  const saveProgram = () =>
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
      userEdited: Boolean(program.userEdited || dirty),
      version: Number(program.version || 1) + (mode === "edit" ? 1 : 0),
      updatedAt: new Date().toISOString(),
    });
  return (
    <>
      <Eyebrow>{copy.eyebrow}</Eyebrow>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {mode === "review" && (
        <PersonalizationSummary profile={profile} program={program} />
      )}
      <div className="plan-warmup-preference">
        <SettingSwitch
          label="Include recommended warm-ups"
          checked={program.includeRecommendedWarmups !== false}
          onChange={setWarmups}
        />
        <small>
          Short warm-ups matched to each workout. Ramp-up sets are controlled
          separately.
        </small>
      </div>
      <section
        ref={reorderRootRef}
        className={`import-preview plan-editor${importReview ? " is-import-review" : ""}${reorderView ? " is-reordering" : ""}`}
      >
        <div className="import-plan-meta">
          {mode === "edit" || scratch ? (
            <label className="plan-name-field">
              <span>WEEKLY PLAN NAME</span>
              <input
                aria-label="Weekly plan name"
                type="text"
                maxLength={60}
                value={program.name || ""}
                onChange={(event) => setProgramName(event.target.value)}
              />
            </label>
          ) : (
            <h2>
              {imported
                ? displayImportedPlanName(program.name)
                : displayProgramName(program)}
            </h2>
          )}
          <small>
            {scratch
              ? `${program.days.filter((day) => day.exercises.length >= 1 && String(day.name || "").trim()).length} of ${program.days.length} days ready`
              : `${pluralize(program.days.length, "day")}/week`}
          </small>
        </div>
        {allowReorder && (
          <p className="plan-reorder-help" id="plan-reorder-help">
            Press and hold a workout or exercise to reorder.
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
                  ? `${pluralize(unresolved, "exercise")} ${unresolved === 1 ? "needs" : "need"} review`
                  : "All exercises ready"}
              </strong>
              <small>
                {unresolved
                  ? "Choose an exercise or keep the imported name as custom."
                  : `${readyExercises} of ${totalExercises} matched or kept as custom`}
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
          const exercisesNeeded = Math.max(0, 1 - exerciseCount);
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
          const collapsed = scratch && collapsedDayIds.includes(day.id);
          const emptyCopyTargets = scratch
            ? program.days.filter(
                (target) => target.id !== day.id && target.exercises.length === 0,
              )
            : [];
          const exerciseBlocks = buildExerciseReorderBlocks(day.exercises);
          const workoutRemainingIndexes = orderedProgramDays
            .map((_, index) => index)
            .filter((index) => index !== reorderView?.sourceIndex);
          const workoutDropBefore =
            reorderView?.kind === "workout" &&
            workoutRemainingIndexes[reorderView.targetIndex] === dayIndex;
          const workoutDropAfter =
            reorderView?.kind === "workout" &&
            reorderView.targetIndex === workoutRemainingIndexes.length &&
            workoutRemainingIndexes.at(-1) === dayIndex;
          return (
          <div
            className={`import-day${scratch ? " scratch-workout-day" : ""}${ready ? " is-ready" : " is-incomplete"}${collapsed ? " is-collapsed" : ""}${reorderView?.kind === "workout" && reorderView.dayId === day.id ? " reorder-placeholder" : ""}${workoutDropBefore ? " reorder-drop-before" : ""}${workoutDropAfter ? " reorder-drop-after" : ""}`}
            key={day.id}
            data-day-id={day.id}
            data-reorder-workout-section={allowReorder ? "true" : undefined}
            data-reorder-index={allowReorder ? dayIndex : undefined}
          >
            {allowReorder && (
              <div className="plan-workout-reorder-bar">
                <div
                  className="plan-workout-drag-surface"
                  role="button"
                  tabIndex="0"
                  aria-describedby="plan-reorder-help"
                  aria-label={`Hold and drag ${dayTitleParts.primary} to another training day`}
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
                  <span>{day.weekday.toUpperCase()} WORKOUT</span>
                  <small>HOLD TO MOVE</small>
                </div>
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
            {mode === "edit" || scratch ? (
              <div className="workout-name-fields">
                <label className="workout-name-field">
                  <span>{allowReorder ? "WORKOUT NAME" : `${day.weekday.toUpperCase()} WORKOUT NAME`}</span>
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
                      placeholder="e.g. Chest focus, Moč or Hypertrophy"
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
            {scratch && (
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
                  {!dayNameValid
                    ? `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"} · Workout name required`
                    : exercisesNeeded
                      ? `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"} · ${exercisesNeeded} more needed`
                      : `${pluralize(exerciseCount, "exercise")} · Ready`}
                </small>
              </div>
            )}
            {!collapsed && <div className="plan-editor-cards">
              {day.exercises.map((exercise, exerciseIndex) => {
                const expanded = expandedExerciseId === exercise.id;
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
                const catalogExercise = exerciseCatalog[exercise.exerciseId];
                const acceptsStartingWeight =
                  scratch && !timed && !catalogExercise?.bodyweight;
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
                  Boolean(
                    catalogExercise && !catalogExercise.bodyweight && !timed,
                  );
                const pair = exercise.supersetId
                  ? supersetMeta(day.exercises, exerciseIndex)
                  : null;
                const reorderBlockIndex = exerciseBlocks.findIndex((block) =>
                  block.exercises.some((item) => item.id === exercise.id),
                );
                const reorderBlock = exerciseBlocks[reorderBlockIndex];
                const firstInReorderBlock =
                  reorderBlock?.exercises[0]?.id === exercise.id;
                const lastInReorderBlock =
                  reorderBlock?.exercises.at(-1)?.id === exercise.id;
                const exerciseRemainingIndexes = exerciseBlocks
                  .map((_, index) => index)
                  .filter((index) => index !== reorderView?.sourceIndex);
                const exerciseDropBefore =
                  reorderView?.kind === "exercise" &&
                  reorderView.dayId === day.id &&
                  exerciseRemainingIndexes[reorderView.targetIndex] === reorderBlockIndex &&
                  firstInReorderBlock;
                const exerciseDropAfter =
                  reorderView?.kind === "exercise" &&
                  reorderView.dayId === day.id &&
                  reorderView.targetIndex === exerciseRemainingIndexes.length &&
                  exerciseRemainingIndexes.at(-1) === reorderBlockIndex &&
                  lastInReorderBlock;
                const pairRole = pair?.role || null;
                const eligiblePartners = day.exercises.filter(
                  (candidate) =>
                    candidate.id !== exercise.id &&
                    !candidate.supersetId &&
                    candidate.sets.length === exercise.sets.length,
                );
                const availableExercises = catalog.filter(
                  (item) =>
                    !day.exercises.some(
                      (other) =>
                        other.id !== exercise.id &&
                        other.exerciseId === item.id,
                    ) &&
                    exerciseMatchesQuery(item, exerciseQuery),
                );
                const likelyMatches = needsReview
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
                const similarExercises = compatibleReplacementCandidates(
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
                );
                const pickerExercises = preview
                  ? similarExercises
                  : availableExercises;
                return (
                  <article
                    id={`import-exercise-${exercise.id}`}
                    className={`import-exercise plan-editor-exercise${expanded ? " is-expanded" : ""}${needsReview ? " needs-review" : ""}${pairRole ? ` is-superset superset-${pairRole.toLowerCase()}` : ""}${reorderView?.kind === "exercise" && reorderView.dayId === day.id && reorderView.sourceIndex === reorderBlockIndex ? " reorder-placeholder" : ""}${exerciseDropBefore ? " reorder-drop-before" : ""}${exerciseDropAfter ? " reorder-drop-after" : ""}`}
                    key={exercise.id}
                    data-reorder-block-index={allowReorder ? reorderBlockIndex : undefined}
                  >
                    <button
                      type="button"
                      className="plan-editor-summary"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : needsReview ? "Review" : "Edit"} ${exerciseName(exercise)}`}
                      aria-describedby={allowReorder ? "plan-reorder-help" : undefined}
                      aria-keyshortcuts={allowReorder ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                      data-reorder-kind={allowReorder && !reorderBlock?.locked ? "exercise" : undefined}
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
                        setExpandedExerciseId(expanded ? null : exercise.id);
                        setExercisePickerId(null);
                        setExerciseQuery("");
                      }}
                    >
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
                      <span className="plan-editor-summary-action">
                        <b>
                          {expanded
                            ? "CLOSE"
                            : needsReview
                              ? "NEEDS REVIEW"
                              : "EDIT"}
                        </b>
                        <i aria-hidden="true" />
                      </span>
                    </button>
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
                    {expanded && (
                      <div className="plan-editor-fields">
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
                            {pickerOpen && (
                              <div
                                className="plan-editor-picker import-review-picker"
                                id={`exercise-picker-${exercise.id}`}
                              >
                                <input
                                  autoFocus
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
                                        aria-selected="false"
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
                                      aria-selected="false"
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
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
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
                            {pickerOpen && (
                              <div
                                className="plan-editor-picker"
                                id={`exercise-picker-${exercise.id}`}
                              >
                                <input
                                  autoFocus
                                  type="search"
                                  aria-label={`Search replacement for ${exerciseName(exercise)}`}
                                  placeholder="Search exercises"
                                  value={exerciseQuery}
                                  onChange={(event) =>
                                    setExerciseQuery(event.target.value)
                                  }
                                />
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
                            )}
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
                            <span>Sets</span>
                            <input
                              aria-label={`Sets for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={imported ? "20" : "6"}
                              value={exercise.sets.length}
                              onChange={(event) =>
                                setCount(
                                  day.id,
                                  exercise.id,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>{timed ? "Min sec" : "Min reps"}</span>
                            <input
                              aria-label={`Minimum ${timed ? "seconds" : "reps"} for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={timed ? 600 : 100}
                              value={exercise.repMin}
                              onChange={(event) =>
                                setRep(
                                  day.id,
                                  exercise.id,
                                  "repMin",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>{timed ? "Max sec" : "Max reps"}</span>
                            <input
                              aria-label={`Maximum ${timed ? "seconds" : "reps"} for ${exerciseName(exercise)}`}
                              type="number"
                              min="1"
                              max={timed ? 600 : 100}
                              value={exercise.repMax}
                              onChange={(event) =>
                                setRep(
                                  day.id,
                                  exercise.id,
                                  "repMax",
                                  event.target.value,
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
                        {allowSupersets &&
                          !pair &&
                          pairingExerciseId === exercise.id && (
                            <div className="superset-picker">
                              <strong>Create superset</strong>
                              <small>
                                Choose the exercise to perform immediately after
                                this one. Complete one set of each, then rest.
                              </small>
                              <div>
                                {eligiblePartners.map((candidate) => (
                                  <button
                                    type="button"
                                    key={candidate.id}
                                    onClick={() =>
                                      createSuperset(
                                        day.id,
                                        exercise.id,
                                        candidate.id,
                                      )
                                    }
                                  >
                                    {exerciseName(candidate)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>}
            {scratch && (
              <div className="scratch-add-exercise">
                {!collapsed && addingToDayId === day.id ? (
                  <>
                    <div className="scratch-exercise-search">
                      <input
                        autoFocus
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
                    <div
                      className="scratch-exercise-results"
                      role="listbox"
                      aria-label={`Exercises for ${day.weekday}`}
                    >
                      {catalog
                        .filter(
                          (item) =>
                            !day.exercises.some(
                              (exercise) => exercise.exerciseId === item.id,
                            ) &&
                            exerciseMatchesQuery(item, exerciseQuery),
                        )
                        .map((item) => (
                          <button
                            type="button"
                            role="option"
                            key={item.id}
                            onClick={() => addExercise(day.id, item.id)}
                          >
                            {item.name}
                          </button>
                        ))}
                      {exerciseQuery.trim() &&
                        !catalog.some((item) =>
                          exerciseMatchesQuery(item, exerciseQuery),
                        ) && (
                          <button
                            type="button"
                            role="option"
                            className="scratch-custom-exercise"
                            onClick={() =>
                              addCustomExercise(day.id, exerciseQuery)
                            }
                          >
                            <strong>
                              Add “{exerciseQuery.trim().slice(0, 80)}”
                            </strong>
                            <small>Custom exercise</small>
                          </button>
                        )}
                    </div>
                  </>
                ) : exerciseCount === 0 ? (
                  <button
                    type="button"
                    disabled={day.exercises.length >= 8}
                    onClick={() => {
                      setAddingToDayId(day.id);
                      setExerciseQuery("");
                    }}
                  >
                    + ADD FIRST EXERCISE
                  </button>
                ) : (
                  <>
                    <div className="scratch-day-tools">
                      {!collapsed && (
                        <button
                          type="button"
                          disabled={day.exercises.length >= 8}
                          onClick={() => {
                            setAddingToDayId(day.id);
                            setCopyingDayId(null);
                            setExerciseQuery("");
                          }}
                        >
                          + ADD EXERCISE
                        </button>
                      )}
                      {emptyCopyTargets.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={copyingDayId === day.id}
                          onClick={() =>
                            setCopyingDayId(
                              copyingDayId === day.id ? null : day.id,
                            )
                          }
                        >
                          COPY TO DAY
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleDayDetails(day.id)}
                      >
                        {collapsed ? "EDIT DAY" : "COLLAPSE"}
                      </button>
                    </div>
                    {copyingDayId === day.id && emptyCopyTargets.length > 0 && (
                      <div className="scratch-copy-targets">
                        <small>Copy exercises to</small>
                        <div>
                          {emptyCopyTargets.map((target) => (
                            <button
                              type="button"
                              key={target.id}
                              onClick={() =>
                                copyDayExercises(day.id, target.id)
                              }
                            >
                              {target.weekday}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
              <Eyebrow>REVIEW ALL</Eyebrow>
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
                <strong>REVIEW COMPLETE</strong>
                <small>All imported exercises are ready.</small>
              </span>
            </div>
          )}
        </section>
      )}
      <Button
        disabled={saving || unresolved > 0 || !namesValid}
        onClick={saveProgram}
      >
        {saving ? "SAVING…" : copy.action}
      </Button>
      <Button
        variant="quiet"
        className={mode === "import" ? "" : "bottom-back"}
        aria-label={mode === "import" ? undefined : "Back"}
        disabled={saving}
        onClick={onCancel}
      >
        {mode === "import" ? "EDIT NOTES" : <BackLabel />}
      </Button>
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
  const importTextRef = useRef(null);
  useEffect(() => {
    if (initial && preview)
      trackFunnelEventOnce("first_plan_viewed", {
        path: "import",
        planType: "imported",
      });
  }, [initial, preview]);
  const generate = async () => {
    const run = ++importRun.current;
    const startedAt = performance.now();
    setBusy(true);
    trackFunnelEvent("plan_generation_started", {
      path: "import",
      source: "notes",
    });
    setError("");
    try {
      const result = await AIService.importTrainingPlan(
        state.profile,
        text.trim(),
      );
      const remainingTransition =
        MINIMUM_PLAN_TRANSITION_MS - (performance.now() - startedAt);
      if (remainingTransition > 0) await waitFor(remainingTransition);
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
        setPreview(result);
      }
    } catch (reason) {
      if (run === importRun.current) {
        trackFunnelEvent("plan_generation_failed", {
          path: "import",
          source: "notes",
          durationMs: Math.round(performance.now() - startedAt),
          reason: "parse_or_provider",
        });
        setError(reason.message || "The plan could not be imported.");
      }
    } finally {
      if (run === importRun.current) setBusy(false);
    }
  };
  const cancelImport = () => {
    importRun.current++;
    setBusy(false);
    setError("Import cancelled. Your notes are still here.");
  };
  const pasteFromClipboard = async () => {
    if (busy || !navigator.clipboard?.readText) return;
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) return;
      const input = importTextRef.current;
      const start = input?.selectionStart ?? text.length;
      const end = input?.selectionEnd ?? start;
      const nextText = `${text.slice(0, start)}${clipboardText}${text.slice(end)}`;
      setText(nextText);
      setError("");
      requestAnimationFrame(() => {
        input?.focus();
        const cursor = start + clipboardText.length;
        input?.setSelectionRange(cursor, cursor);
      });
    } catch {
      // Clipboard access can be unavailable; native paste remains available.
    }
  };
  const apply = (program) => {
    if (
      !initial &&
      !confirm(
        "Replace the current program with this imported plan? Workout history will remain.",
      )
    )
      return;
    if (initial)
      trackFunnelEvent("onboarding_completed", {
        path: "import",
        source: "ai-import",
        daysPerWeek: program.days.length,
      });
    update((current) => {
      current.profile = { ...preview.profile, onboardingComplete: true };
      current.program = program;
      current.selectedDay = weekday();
      current.selectedDate = isoDay();
      current.activeWorkout = null;
      current.ai = { ...current.ai, lastPlanSource: "ai-import" };
      return current;
    });
    close();
    onPlanAccepted?.();
  };
  return (
    <main
      className={`screen detail-screen import-plan-screen ${!preview ? "is-compose" : ""} ${initial ? "initial-import-screen" : ""}`}
    >
      <header className="detail-header">
        <button
          aria-label={initial ? "Back to start" : "Close"}
          onClick={close}
        >
          ‹
        </button>
        <strong>Import plan</strong>
        <span />
      </header>
      {!preview ? (
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
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your workout notes here..."
            />
            <button
              type="button"
              className="import-plan-paste"
              disabled={busy}
              onClick={pasteFromClipboard}
              aria-label="Paste workout notes from clipboard"
            >
              PASTE
            </button>
          </div>
          <small className="import-plan-helper">
            Plain-text workout notes work best. You’ll review anything Rook can’t
            match.
          </small>
          {error && <p className="offline-banner">{error}</p>}
          <Button disabled={busy || text.trim().length === 0} onClick={generate}>
            CREATE PREVIEW
          </Button>
        </div>
      ) : (
        <PlanEditor
          source={preview.program}
          profile={preview.profile}
          mode="import"
          onSave={apply}
          onCancel={() => setPreview(null)}
        />
      )}
      {busy && <BuildingOverlay kind="import" onCancel={cancelImport} />}
    </main>
  );
}

function RestTrainingSheet({ date, state, update, close, setPage }) {
  const [mode, setMode] = useState("menu");
  const [move, setMove] = useState(null);
  const [cardioType, setCardioType] = useState("Walking");
  const [duration, setDuration] = useState(20);
  const [intensity, setIntensity] = useState("Easy");
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
    update((current) => {
      current.optionalSessions ||= [];
      current.optionalSessions = current.optionalSessions.filter(
        (item) => !(item.date === date && item.status === "started"),
      );
      current.optionalSessions.push({
        id: `optional-${Date.now()}`,
        date,
        kind,
        activity: kind === "Cardio" ? cardioType : "Mobility / recovery",
        duration,
        intensity: kind === "Cardio" ? intensity : "Easy",
        status: "started",
        startedAt: Date.now(),
      });
      return current;
    });
    close();
  };
  const applyMove = () => {
    if (!move) return;
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
      <SheetDragHandle sheetRef={sheetRef} close={close} />
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
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
          <h2 id="rest-training-title">Train today anyway</h2>
          <p>
            Today was planned for recovery. Choose a deliberate optional path.
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
          <Button onClick={() => startOptional("Cardio")}>START</Button>
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
          <Button onClick={() => startOptional("Mobility")}>START</Button>
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
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>Profile details</strong>
        <span />
      </header>
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
        <label>
          <span>
            Sex <small>optional</small>
          </span>
          <select
            value={details.sex}
            onChange={(event) =>
              setDetails((current) => ({ ...current, sex: event.target.value }))
            }
          >
            <option value="">Not set</option>
            {["Female", "Male", "Intersex", "Prefer not to say"].map(
              (option) => (
                <option key={option}>{option}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <Button onClick={save}>SAVE DETAILS</Button>
    </main>
  );
}
function ProfileTrainingSetting({ state, update, close, setting, focus }) {
  const profile = state.profile;
  const scheduledDays = new Set(
    (state.program.days || []).map((day) => day.weekday).filter(Boolean),
  );
  const minimumDays = Math.max(
    1,
    Number(profile.daysPerWeek) || state.program.days?.length || 1,
  );
  const [availableDays, setAvailableDays] = useState(() =>
    WEEKDAYS.filter(
      (day) =>
        (profile.availableDays || []).includes(day) || scheduledDays.has(day),
    ),
  );
  const [environment, setEnvironment] = useState(
    profile.environment || "Commercial gym",
  );
  const [equipment, setEquipment] = useState(() => [
    ...(profile.equipment || []),
  ]);
  const toggleDay = (day) =>
    !scheduledDays.has(day) &&
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
  const setupProgramCompatible = setupValid
    ? validateProgram(
        state.program,
        { ...profile, environment, equipment },
        { preserveSchedule: true },
      ).valid
    : false;
  const scheduleValid = availableDays.length >= minimumDays;
  const save = () => {
    update((current) => {
      if (setting === "schedule")
        current.profile.availableDays = WEEKDAYS.filter((day) =>
          availableDays.includes(day),
        );
      else {
        current.profile.environment = environment;
        current.profile.equipment = equipment;
      }
      return current;
    });
    close();
  };
  const setupTitle = focus === "equipment" ? "Equipment" : "Training environment";
  return (
    <main className="screen detail-screen profile-training-setting-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>‹</button>
        <strong>{setting === "schedule" ? "Schedule" : setupTitle}</strong>
        <span />
      </header>
      <div className="profile-setting-scroll">
      {setting === "schedule" ? (
        <>
          <Eyebrow>TRAINING AVAILABILITY</Eyebrow>
          <h1>When can you train?</h1>
          <p>
            Choose at least {minimumDays} available {minimumDays === 1 ? "day" : "days"}.
            Current workout days stay selected so your program is not changed.
          </p>
          <section className="profile-setting-options schedule-days">
            <div className="option-list day-options">
              {WEEKDAYS.map((day) => (
                <OnboardingOptionCard
                  key={day}
                  label={localizedWeekdayLabel(day, "short")}
                  ariaLabel={`${localizedWeekdayLabel(day, "long")}${scheduledDays.has(day) ? ", current program day" : ""}`}
                  selected={availableDays.includes(day)}
                  disabled={scheduledDays.has(day)}
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
            Used for Coach recommendations and future plan changes. Your current
            program stays unchanged.
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
              {setupValid && !setupProgramCompatible && (
                <small className="profile-setting-error">
                  Your current program uses equipment outside this setup. Adjust
                  or replace the plan before saving it.
                </small>
              )}
            </section>
          )}
        </>
      )}
      </div>
      <div className="profile-setting-footer">
        <Button
          disabled={setting === "schedule" ? !scheduleValid : !setupValid || !setupProgramCompatible}
          onClick={save}
        >
          {setting === "schedule" ? "SAVE SCHEDULE" : "SAVE SETUP"}
        </Button>
      </div>
    </main>
  );
}
function EditPlan({ state, update, close }) {
  const save = (program) => {
    update((current) => {
      current.program = program;
      current.ai = { ...current.ai, lastPlanSource: "manual-edit" };
      return current;
    });
    close();
  };
  return (
    <main className="screen detail-screen edit-plan-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>Edit plan</strong>
        <span />
      </header>
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
          onSave={save}
          onCancel={close}
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
      aria-label="Drag down to close"
      role="button"
      tabIndex={disabled ? -1 : 0}
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
  const blocked = Boolean(state.activeWorkout);
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
    setBusy(true);
    setGenerationStage("saving");
    await afterVisibleFrame();
    update((current) => {
      current.program = program;
      current.selectedDay = weekday();
      current.selectedDate = isoDay();
      current.ai = { ...current.ai, lastPlanSource: preview.source };
      return current;
    });
    close();
    onPlanAccepted?.();
  };
  if (preview)
    return (
      <main
        ref={sheetRef}
        className="sheet change-plan-sheet plan-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-plan-title"
      >
        <SheetDragHandle sheetRef={sheetRef} close={close} disabled={busy} />
        <header className="long-form-sheet-header">
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
        <PlanEditor
          source={preview.program}
          profile={state.profile}
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
      <SheetDragHandle sheetRef={sheetRef} close={close} disabled={busy} />
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
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
function SettingSwitch({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`setting-switch ${disabled ? "disabled" : ""}`}>
      <span>{label}</span>
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
function Detail({
  detail,
  state,
  update,
  close,
  setPage,
  setDetail,
  onPlanAccepted,
  onPlanImported,
}) {
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [detail]);
  if (detail?.restTraining)
    return (
      <RestTrainingSheet
        date={detail.restTraining}
        state={state}
        update={update}
        close={close}
        setPage={setPage}
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
        <header className="detail-header">
          <button aria-label="Close" onClick={close}>
            ‹
          </button>
          <strong>This week</strong>
          <span />
        </header>
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
  if (detail === "edit-plan")
    return <EditPlan state={state} update={update} close={close} />;
  if (detail === "training-priorities")
    return <TrainingPriorities state={state} update={update} close={close} />;
  if (detail === "training-restrictions")
    return <TrainingRestrictions state={state} update={update} close={close} />;
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
  if (detail?.completedWorkout)
    return (
      <CompletedWorkoutDetail
        workoutId={detail.completedWorkout}
        state={state}
        update={update}
        close={close}
        setDetail={setDetail}
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
  if (detail?.options)
    return (
      <ActiveExerciseOptions
        exercise={detail.options}
        state={state}
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
  const bodyweight = Boolean(exerciseCatalog[exercise.exerciseId]?.bodyweight);
  const latestHold = timed
    ? Math.max(
        0,
        ...(history.at(-1)?.sets || [])
          .filter((set) => set.completed)
          .map((set) => Number(set.reps) || 0),
      )
    : null;
  const progression = progressionFor(exercise, state.workouts, state.profile);
  const detailIllustration =
    state.profile.showExerciseImages !== false ? exerciseArt(exercise) : null;
  return (
    <main ref={panelRef} className="screen detail-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>{exerciseName(exercise)}</strong>
        <span />
      </header>
      <div className={`exercise-detail-overview${detailIllustration ? " has-illustration" : ""}`}>
        <div>
          {history.length ? (
            <>
              <Eyebrow>
                {timed
                  ? "CURRENT HOLD TIME"
                  : bodyweight
                    ? "CURRENT LOAD"
                    : latestSet
                      ? "CURRENT WORKING WEIGHT"
                      : "TRAINING HISTORY"}
              </Eyebrow>
              <h1>
                {timed
                  ? latestHold
                  : bodyweight
                    ? "Bodyweight"
                    : latestSet
                      ? displayWeight(latestSet.weight, state.profile.units)
                      : "Not set yet"}{" "}
                <small>{timed ? "sec" : latestSet ? unit : ""}</small>
              </h1>
              {!timed && !bodyweight && !latestSet && (
                <p>Log a weight on a completed working set to establish this.</p>
              )}
            </>
          ) : (
            <>
              <Eyebrow>FIRST SESSION</Eyebrow>
              <h1>No history yet.</h1>
              <p>Choose a comfortable starting load when you begin your first set.</p>
            </>
          )}
          <p className="exercise-detail-target">
            Target · {targetLabel(exercise, state.profile.rirEnabled)}
          </p>
        </div>
        {detailIllustration && (
          <img
            className="exercise-detail-art"
            src={detailIllustration}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>
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
      <section>
        <Eyebrow>HISTORY</Eyebrow>
        {history.length ? (
          [...history].reverse().map((item, index) => {
            const completedSets = item.sets.filter((value) => value.completed);
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
                    {exerciseHistoryWeightLabel({
                      timed,
                      bodyweight,
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
                  {exerciseHistoryPerformanceLabel(exercise, item.sets)}
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
  return (
    <main className="screen detail-screen logging-screen">
      <header className="detail-header">
        <span />
        <strong>Logging</strong>
        <button className="logging-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>
      <section className="logging-group">
        <Eyebrow>EFFORT</Eyebrow>
        <SettingSwitch
          label="Track reps in reserve (RIR)"
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
      </section>
      <section className="logging-group increments-group">
        <Eyebrow>UNITS</Eyebrow>
        <div className="segmented" aria-label="Weight units">
          {["kg", "lb"].map((unit) => (
            <button
              key={unit}
              className={p.units === unit ? "active" : ""}
              aria-pressed={p.units === unit}
              onClick={() =>
                update((current) => {
                  current.profile.units = unit;
                  return current;
                })
              }
            >
              {unit}
            </button>
          ))}
        </div>
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
      </section>
    </main>
  );
}
function Appearance({ state, update, close }) {
  const showExerciseImages = state.profile.showExerciseImages !== false;
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const themePreference = ["system", "light", "dark", "premium"].includes(
    state.profile.themePreference,
  )
    ? state.profile.themePreference
    : "light";
  return (
    <main className="screen detail-screen logging-screen appearance-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>Appearance</strong>
        <span />
      </header>
      <section className="logging-group appearance-theme-group">
        <Eyebrow>THEME</Eyebrow>
        <button
          type="button"
          className="appearance-theme-row"
          onClick={() => setThemePickerOpen(true)}
        >
          <span>
            <strong>Theme</strong>
            <small>{titleCase(themePreference)}</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
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
          Exercise illustrations by{" "}
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
      </section>
      {themePickerOpen && (
        <div
          className="theme-choice-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setThemePickerOpen(false);
          }}
        >
          <section
            className="theme-choice-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-choice-title"
          >
            <div className="sheet-grab-zone" aria-hidden="true">
              <span />
            </div>
            <header>
              <h2 id="theme-choice-title">Theme</h2>
              <button
                type="button"
                aria-label="Close theme choices"
                onClick={() => setThemePickerOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="theme-choice-list">
              {[
                ["system", "System", "Follows your device appearance."],
                ["light", "Light", "Always use ROOK’s light appearance."],
                ["dark", "Dark", "Always use ROOK’s dark appearance."],
                [
                  "premium",
                  "Premium",
                  "Warm gold accents adapted to your device appearance.",
                ],
              ].map(([value, label, help]) => (
                <button
                  type="button"
                  key={value}
                  className={themePreference === value ? "selected" : ""}
                  aria-pressed={themePreference === value}
                  onClick={() => {
                    update((current) => {
                      current.profile.themePreference = value;
                      return current;
                    });
                    setThemePickerOpen(false);
                  }}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{help}</small>
                  </span>
                  {themePreference === value && <i aria-hidden="true">✓</i>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function ExerciseVisualViewer({ exercise, close }) {
  const artwork = exerciseArt(exercise);
  if (!artwork) return null;
  return (
    <main
      className="sheet exercise-visual-viewer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-visual-viewer-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="exercise-visual-viewer-header">
        <h2 id="exercise-visual-viewer-title">{exerciseName(exercise)}</h2>
        <button
          type="button"
          className="exercise-visual-viewer-close"
          aria-label="Close visual viewer"
          onClick={close}
        >
          ×
        </button>
      </header>
      <div className="exercise-visual-stage">
        <img src={artwork} alt="" aria-hidden="true" />
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
  const dateLabel = isToday
    ? "today"
    : new Intl.DateTimeFormat("en", {
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
        update((current) =>
          restoreOccurrenceOverride(current, {
            planDate,
            workoutId: request.workoutId,
            previousOverride,
          }),
        ),
    });
  };
  const removeWeekly = () => {
    if (!weeklySnapshot || wouldEmptyProgram) return;
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
        : "Removed from weekly plan",
      undo: () =>
        update((current) =>
          restoreWeeklyPlanWorkout(current, weeklySnapshot),
        ),
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
            ? `Skip ${isToday ? "today’s" : `${dateLabel}’s`} workout?`
            : recurringIsLast
              ? `Make ${sourceWorkout.weekday} a rest day?`
              : `Remove ${name} from ${activeSource ? "future workouts" : "weekly plan"}?`}
        </h2>
        <p>
          {confirmOccurrence
            ? `${name} is the only exercise left. Your weekly plan won’t change.`
            : recurringIsLast
              ? `${name} is the only exercise in ${sourceWorkout.name}. The current workout and past history won’t change.`
              : `It will be removed from ${sourceWorkout.name} going forward. ${activeSource ? "Your current workout " : "Past workouts and history "}won’t change.`}
        </p>
        <div className="today-exercise-confirm-actions">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            CANCEL
          </Button>
          <Button
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
      <Eyebrow>EXERCISE</Eyebrow>
      <h2 id={titleId}>{name}</h2>
      <button
        type="button"
        className="choice-row today-exercise-remove-occurrence"
        onClick={() =>
          occurrenceIsLast ? setConfirming("occurrence") : removeOccurrence()
        }
      >
        <strong>{`Remove from ${dateLabel}`}</strong>
        <small>Keeps it in your weekly plan.</small>
      </button>
      <button
        type="button"
        className="choice-row today-exercise-remove-weekly"
        disabled={wouldEmptyProgram}
        onClick={() => setConfirming("weekly")}
      >
        <strong>
          {activeSource
            ? "Remove from future weekly plan"
            : "Remove from weekly plan"}
        </strong>
        <small>
          {wouldEmptyProgram
            ? "Keep at least one workout in your plan."
            : activeSource
              ? "Your current workout stays unchanged."
              : `Removes this entry from ${sourceWorkout?.name || "this workout"} going forward.`}
        </small>
      </button>
    </main>
  );
}
function ActiveWorkoutOptions({ close, onRestart }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <main
      className={`sheet active-workout-options-sheet${confirming ? " confirming-restart" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-workout-options-title"
      aria-describedby={confirming ? "restart-workout-detail" : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
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
            <Button className="workout-restart-danger" onClick={onRestart}>
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
    </main>
  );
}
function ActiveExerciseOptions({ exercise, state, close, setDetail }) {
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
    <main
      className="sheet active-exercise-options-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-exercise-options-title"
      onClick={(event) => event.stopPropagation()}
    >
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
      <Eyebrow>EXERCISE</Eyebrow>
      <h2 id="active-exercise-options-title">Exercise options</h2>
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
    </main>
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
            ) : candidates.length ? (
              candidates.map((candidate) => (
                <button
                  className="choice-row"
                  key={candidate.id}
                  onClick={() => createPair(candidate.id)}
                >
                  <strong>{exerciseName(candidate)}</strong>
                  <small>{targetLabel(candidate, state.profile.rirEnabled)}</small>
                </button>
              ))
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
  const programIds = state.program.days.flatMap((day) =>
    day.exercises.map((item) => item.exerciseId),
  );
  const activeIds = (state.activeWorkout?.exercises || [])
    .filter((item) => item.id !== exercise.id)
    .map((item) => item.exerciseId);
  const compatible = useMemo(
    () =>
      compatibleReplacementCandidates(exercise, state.profile, programIds).filter(
        (item) => !activeIds.includes(item.id),
      ),
    [
      exercise.exerciseId,
      exercise.importedExercise?.pattern,
      state.profile,
      programIds.join("|"),
      activeIds.join("|"),
    ],
  );
  const compatibleKey = compatible.map((item) => item.id).join("|");
  const [choices, setChoices] = useState(() => compatible.slice(0, 3));
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(() => compatible.length <= 3);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    // Keep the first suggestions stable. Previously these local choices were
    // replaced when the asynchronous AI ranking arrived, which made options
    // move underneath the user. AI ranking is now reserved for the explicit
    // "More suggestions" action below.
    setChoices(compatible.slice(0, 3));
    setLoadingMore(false);
    setNoMore(compatible.length <= 3);
    setPicker(false);
    setQuery("");
  }, [exercise.id, compatibleKey]);
  const more = async () => {
    if (loadingMore || noMore) return;
    setLoadingMore(true);
    const shown = new Set(choices.map((item) => item.id));
    try {
      const result = await AIService.suggestExerciseReplacements(
        state,
        exercise,
        { excludeIds: [...shown] },
      );
      const ranked = result.exerciseIds
        .map((id) => exerciseCatalog[id])
        .filter(
          (item) =>
            item && !shown.has(item.id) && !activeIds.includes(item.id),
        );
      const remaining = compatible.filter((item) => !shown.has(item.id));
      const next = [...ranked, ...remaining]
        .filter(
          (item, index, list) =>
            list.findIndex((value) => value.id === item.id) === index,
        )
        .slice(0, 3);
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
  const replace = (choice) => {
    update((current) => {
      const active = current.activeWorkout;
      if (!active) return current;
      const index = active.exercises.findIndex(
        (item) => item.id === exercise.id,
      );
      const catalog = exerciseCatalog[choice.id];
      if (
        index < 0 ||
        active.exercises[index].sets.some((set) => set.completed) ||
        !catalog ||
        active.exercises.some(
          (item, candidateIndex) =>
            candidateIndex !== index && item.exerciseId === choice.id,
        ) ||
        !compatibleReplacementCandidates(
          active.exercises[index],
          current.profile,
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
        exerciseSource: "catalog",
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
      refreshWorkoutWarmup(active, current.profile, current.program);
      active.updatedAt = Date.now();
      return current;
    });
    close();
  };
  const pickerChoices = compatible.filter(
    (item) =>
      !query.trim() ||
      `${item.name} ${(item.aliases || []).join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const choiceButton = (choice) => (
    <button
      className="choice-row"
      key={choice.id}
      onClick={() => replace(choice)}
    >
      <strong>{choice.name}</strong>
      <small>{choice.pattern.replaceAll("-", " ")} · today only</small>
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
      <SheetDragHandle sheetRef={sheetRef} close={close} />
      <button className="sheet-close" aria-label="Close" onClick={close}>
        ×
      </button>
      <div className="sheet-scroll">
        {picker ? (
          <>
            <button
              className="sheet-back text-button"
              onClick={() => {
                setPicker(false);
                setQuery("");
              }}
            >
              ‹ Suggestions
            </button>
            <Eyebrow>CHOOSE ANOTHER EXERCISE</Eyebrow>
            <h2 id="replace-title">Compatible exercises</h2>
            <p>
              Results preserve the movement purpose, target muscles, equipment
              and restrictions.
            </p>
            <input
              autoFocus
              className="exercise-search"
              type="search"
              aria-label="Search compatible exercises"
              placeholder="Search exercises"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {pickerChoices.length ? (
              <div className="picker-results">
                {pickerChoices.map(choiceButton)}
              </div>
            ) : (
              <p className="offline-banner">
                No compatible exercise matches that search.
              </p>
            )}
          </>
        ) : (
          <>
            <Eyebrow>REPLACE EXERCISE</Eyebrow>
            <h2 id="replace-title">Replace {exerciseName(exercise)}</h2>
            <p>
              Candidates match the same movement purpose, target muscles, your
              equipment and restrictions.
            </p>
            {choices.length
              ? choices.map(choiceButton)
              : (
                  <p className="offline-banner">
                    There is not enough compatible exercise metadata for a safe
                    replacement.
                  </p>
                )}
            <div className="replacement-secondary">
              <button
                onClick={more}
                disabled={loadingMore || noMore}
              >
                {loadingMore ? "Checking…" : "More suggestions"}
              </button>
              <button onClick={() => setPicker(true)}>
                Choose another exercise
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
  const [state, update] = useLiftState();
  useResolvedTheme(state.profile.themePreference);
  const [page, setPage] = useState("today");
  const [detail, setDetail] = useState(null);
  const [entryMode, setEntryMode] = useState(null);
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
    });
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
        <Onboarding
          update={update}
          exit={() => setEntryMode(null)}
          onPlanAccepted={showGeneratedPlan}
        />
      );
    if (entryMode === "import")
      return (
        <ImportPlan
          state={state}
          update={update}
          close={() => setEntryMode(null)}
          onPlanAccepted={showToday}
          initial
        />
      );
    if (entryMode === "scratch")
      return (
        <ScratchPlan
          state={state}
          update={update}
          close={() => setEntryMode(null)}
          onPlanAccepted={showGeneratedPlan}
        />
      );
    return (
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
      />
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
    ) : page === "workout" ? (
      <ActiveWorkout
        state={state}
        update={update}
        setPage={setPage}
        setDetail={setDetail}
      />
    ) : page === "complete" ? (
      <Complete
        state={state}
        update={update}
        setPage={setPage}
        setDetail={setDetail}
      />
    ) : page === "coach" ? (
      <Coach state={state} update={update} setPage={setPage} />
    ) : page === "progress" ? (
      <Progress state={state} setDetail={setDetail} />
    ) : (
      <Profile
        state={state}
        update={update}
        setDetail={setDetail}
        setPage={setPage}
        onLogout={() => setEntryMode(null)}
      />
    );
  return (
    <div className="app-shell">
      <div className="app-content" ref={backgroundRef}>
        {content}
        {!["workout", "complete"].includes(page) && (
          <BottomNav page={page} setPage={setPage} />
        )}
      </div>
      {detail && (
        <ModalLayer close={() => setDetail(null)} backgroundRef={backgroundRef}>
          <Detail
            detail={detail}
            state={state}
            update={update}
            close={() => setDetail(null)}
            setPage={setPage}
            setDetail={setDetail}
            onPlanAccepted={showGeneratedPlan}
            onPlanImported={showToday}
          />
        </ModalLayer>
      )}
      {repairPreview && (
        <ModalLayer close={dismissRepairPreview} backgroundRef={backgroundRef}>
          {(requestClose) => (
            <main className="screen detail-screen repair-plan-preview">
              <header className="detail-header">
                <button aria-label="Keep current plan" onClick={requestClose}>
                  ‹
                </button>
                <strong>Plan preview</strong>
                <span />
              </header>
              <PlanEditor
                source={repairPreview.program}
                profile={state.profile}
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
  );
}
