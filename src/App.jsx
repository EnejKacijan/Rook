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
  remapCopiedSupersetIds,
  supersetMeta,
  supersetRoundKey,
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
  PHYSIQUE_PRIORITY_OPTIONS,
  WEEKDAYS,
  adaptedTemplateForToday,
  applyCoachAction,
  applyWeekScheduleChanges,
  blankState,
  buildProgram,
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
  exerciseValueLabel,
  firstScheduledDate,
  formatDuration,
  hasBalancedPullEquipment,
  isExerciseAllowed,
  isoDay,
  loadState,
  matchImportedExerciseName,
  nextScheduledWorkout,
  normalizeWorkoutName,
  optionalStrengthForDate,
  plannedWorkoutForDate,
  pluralize,
  previousExercise,
  progressionFor,
  recentExerciseProgress,
  refreshWorkoutWarmup,
  roundedEstimate,
  saveState,
  startWorkout,
  storedWeight,
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
} from "./domain.js";
import { EXPERT_ISSUES } from "./expertFeedback.js";
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
async function generatePersonalizedProgram(profile, { onStage } = {}) {
  onStage?.("preparing");
  onStage?.("building");
  await afterVisibleFrame();
  const program = buildProgram(profile);
  onStage?.("checking");
  await afterVisibleFrame();
  const validation = validateProgram(program, profile, {
    requireProgramQuality: true,
  });
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return { program, source: "personalized-template" };
}
function useLiftState() {
  const [state, setState] = useState(() => {
    const initial = loadState();
    if (initial.profile.onboardingComplete) {
      initial.selectedDay = weekday();
      initial.selectedDate = isoDay();
    }
    return initial;
  });
  useLayoutEffect(() => saveState(state), [state]);
  return [state, (fn) => setState((previous) => fn(clone(previous)))];
}
function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
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
function OnboardingOptionCard({ label, description, selected, onClick }) {
  return (
    <button
      type="button"
      className={`onboarding-option ${selected ? "selected-option" : ""}`}
      aria-pressed={selected}
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
          <i aria-hidden="true">{specificSplitOpen ? "⌄" : "›"}</i>
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
          placeholder="Current pain, recent surgery, movements to avoid, or clinician limits"
        />
        <small className="restriction-helper">
          Write it naturally. Rook checks injuries, pain, recovery, movements
          to avoid, and clinician limits before building your plan.
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
          <strong>Exercise style</strong>
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
function Eyebrow({ children }) {
  return <div className="eyebrow">{children}</div>;
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
  const title = normalizeWorkoutName(name, day);
  let primary = title;
  let detail = "";
  const separated = title.match(/^(.+?)\s+(?:[—–·|:]|-)\s+(.+)$/u);
  if (separated) [, primary, detail] = separated;
  else {
    const simple = title.match(
      /^(Full Body|Upper|Lower|Push|Pull|Legs?|Chest|Back|Shoulders?|Arms?)(?:\s+[ABC])?$/iu,
    );
    const structured =
      !simple &&
      title.match(
        /^(Full Body|Upper|Lower|Push|Pull|Legs?|Chest|Back|Shoulders?|Arms?)(\s+[ABC])?\s+(.+)$/iu,
      );
    if (simple) primary = title;
    else if (structured) {
      primary = `${structured[1]}${structured[2] || ""}`;
      detail = structured[3];
    }
  }
  const contextMatch = detail.match(/^(.*?)\s*\((.+)\)\s*$/u);
  return {
    primary: primary.trim(),
    detail: (contextMatch ? contextMatch[1] : detail).trim(),
    context: contextMatch ? contextMatch[2].trim() : "",
  };
}
function WorkoutTitle({ name, day }) {
  const parts = workoutTitleParts(name, day);
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
const GENERATION_STAGES = {
  preparing: {
    step: 1,
    title: "Preparing your profile…",
    detail: "Organizing your goals, schedule, equipment, and preferences.",
  },
  building: {
    step: 2,
    title: "Building your program…",
    detail: "Creating a program around your training profile.",
  },
  refining: {
    step: 2,
    title: "Refining your program…",
    detail: "Improving the plan before checking it again.",
  },
  checking: {
    step: 3,
    title: "Checking your plan…",
    detail: "Making sure the schedule and training details fit together.",
  },
  saving: {
    step: 4,
    title: "Saving your program…",
    detail: "Keeping your new program ready for the first workout.",
  },
};
function BuildingOverlay({ stage = "building", kind = "program", onCancel }) {
  const [waitLevel, setWaitLevel] = useState(0);
  const overlayRef = useRef(null);
  const current = GENERATION_STAGES[stage] || GENERATION_STAGES.building;
  const waiting = stage === "building" || stage === "refining";
  useEffect(() => {
    setWaitLevel(0);
    if (!waiting) return undefined;
    const reassuring = setTimeout(() => setWaitLevel(1), 6000);
    const long = setTimeout(() => setWaitLevel(2), 15000);
    return () => {
      clearTimeout(reassuring);
      clearTimeout(long);
    };
  }, [stage, waiting]);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const focus = () =>
      overlay
        .querySelector("button:not([disabled])")
        ?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(focus);
    const keydown = (event) => {
      if (event.key === "Escape" && onCancel) {
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
  }, [onCancel]);
  if (kind === "import")
    return (
      <div
        ref={overlayRef}
        className="building-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="building-title"
        aria-describedby="building-detail"
      >
        <div className="building-card" role="status" aria-live="polite">
          <div className="building-spinner" aria-hidden="true" />
          <Eyebrow>IMPORTING YOUR PLAN</Eyebrow>
          <h2 id="building-title">Reading your notes…</h2>
          <p id="building-detail">
            Structuring the plan for review without changing your exercises.
          </p>
          {onCancel ? (
            <button
              type="button"
              className="building-cancel"
              onClick={onCancel}
            >
              CANCEL
            </button>
          ) : (
            <small>Please keep this page open.</small>
          )}
        </div>
      </div>
    );
  const detail =
    waiting && waitLevel === 1
      ? "Personalized plans can take a few more seconds."
      : waiting && waitLevel === 2
        ? "Still working — larger programs can take up to two minutes."
        : current.detail;
  return (
    <div
      ref={overlayRef}
      className="building-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-title"
      aria-describedby="building-detail"
    >
      <div
        className="building-card"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="building-spinner" aria-hidden="true" />
        <Eyebrow>BUILDING YOUR PROGRAM</Eyebrow>
        <h2 id="building-title">{current.title}</h2>
        <small className="building-step">Step {current.step} of 4</small>
        <p id="building-detail">{detail}</p>
        {onCancel ? (
          <button type="button" className="building-cancel" onClick={onCancel}>
            CANCEL
          </button>
        ) : (
          <small>Please keep this page open.</small>
        )}
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
    question: "How much training volume feels manageable?",
    hint: "Choose a simple starting point. Rook will manage the effort targets for you, and you can adjust this later.",
    options: [
      {
        label: "Balanced starting point",
        description: "Usually 3 sets per exercise",
      },
      {
        label: "Shorter, focused sessions",
        description: "Usually 2 challenging sets per exercise",
      },
      {
        label: "More practice and volume",
        description: "Usually 3–4 moderate sets per exercise",
      },
    ],
  },
  Intermediate: {
    question: "How do you prefer to balance sets and effort?",
    hint: "“Reps left” means how many clean reps you could still do when a set ends. This is also called reps in reserve (RIR).",
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
    question: "How do you prefer to distribute your training effort?",
    hint: "RIR means reps in reserve: the number of clean reps you could still perform when a set ends.",
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
  return (
    <main className="onboarding entry-screen">
      <div className="brand">ROOK</div>
      <div className="entry-content">
        <Eyebrow>TRAINING, BUILT AROUND YOU</Eyebrow>
        <h1>A plan that fits—and keeps up.</h1>
        <p>
          Build a weekly program around your schedule, equipment and experience.
          As you log workouts, Rook uses your real training history to guide
          what comes next.
        </p>
        <div className="entry-actions">
          <Button onClick={personalize}>BUILD MY PLAN</Button>
          <button className="existing-plan-action" onClick={importPlan}>
            <strong>I ALREADY HAVE A PLAN</strong>
            <small>Bring your current routine into Rook</small>
            <span>›</span>
          </button>
          <button className="scratch-plan-action" onClick={startFromScratch}>
            <strong>START FROM SCRATCH</strong>
            <small>Create your workouts manually</small>
            <span>›</span>
          </button>
        </div>
      </div>
    </main>
  );
}
function Onboarding({ update, exit, onPlanAccepted }) {
  const [step, setStep] = useState(0);
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
  useEffect(() => {
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
      question: "How familiar are you with structured training?",
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
      question: "Where and how will you train?",
      helper:
        "We’ll only use exercises that fit the equipment you can rely on.",
    },
    {
      key: "priorities",
      label: "TRAINING PRIORITIES",
      question: "What would you like to emphasize?",
      helper:
        "Optional. Choose specific areas, or keep your training balanced.",
      options: PRIORITIES,
      multi: true,
      optional: true,
    },
    {
      key: "effortStyle",
      label: "SETS & EFFORT",
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
  const bodyweightOnlyPullGap =
    answers.environment === "Home gym" && !hasBalancedPullEquipment(answers);
  const setupValid = Boolean(
    answers.environment &&
    (answers.environment === "Commercial gym" ||
      answers.equipment.some((item) => item !== "full gym")) &&
    !bodyweightOnlyPullGap,
  );
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
      <div className="onboarding-content">
        <Eyebrow>{stage.label}</Eyebrow>
        <h1>{stage.question}</h1>
        <p>
          {stage.personal
            ? "Age helps Rook choose a more appropriate starting workload and recovery pattern. Your first name is optional."
            : stage.helper ||
              stage.optionalHint ||
              (stage.optional
                ? "Optional. Choose only what matters to you."
                : "Choose the answer that best fits your routine.")}
        </p>
        {stage.personal ? (
          <div className="personal-fields">
            <label>
              <span>Age range</span>
              <select
                aria-label="Age range"
                value={answers.ageRange || ""}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    ageRange: event.target.value,
                  }))
                }
              >
                <option value="" disabled>
                  Select age range
                </option>
                {["Under 18", "18–29", "30–39", "40–49", "50–59", "60+"].map(
                  (option) => (
                    <option key={option}>{option}</option>
                  ),
                )}
              </select>
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
                <strong>Days that could work</strong>
                <label className="select-all-check">
                  <input
                    type="checkbox"
                    aria-label="Select all days"
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
                  <span>All</span>
                </label>
              </div>
              <div className="option-list day-options">
                {WEEKDAYS.map((option) => (
                  <OnboardingOptionCard
                    key={option}
                    label={option}
                    selected={answers.availableDays.includes(option)}
                    onClick={() => chooseAvailableDay(option)}
                  />
                ))}
              </div>
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
                  {bodyweightOnlyPullGap && (
                    <small className="schedule-hint" role="alert">
                      Add resistance bands, dumbbells, a pull-up bar, or a
                      barbell setup so Rook can include progressively loadable
                      back training.
                    </small>
                  )}
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
                placeholder="Current pain, recent surgery, movements to avoid, or clinician limits"
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
        {stage.key === "priorities" && (
          <button
            className="physique-review-entry"
            onClick={() => setPhysiqueOpen(true)}
          >
            <span>
              <strong>Not sure what to prioritize?</strong>
              <small>Get an optional physique review</small>
            </span>
            <i>›</i>
          </button>
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
              onClick={() => setStep((index) => index - 1)}
            >
              Back
            </Button>
          ) : (
            <Button variant="quiet" onClick={exit}>
              Back
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
        const complete = workouts.some(
          (workout) => isoDay(workout.completedAt) === isoDay(date),
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
        return (
          <button
            key={day}
            aria-label={`${day} ${date.getDate()}${isToday ? ", today" : ""}${statusLabel}`}
            aria-current={isToday ? "date" : undefined}
            aria-pressed={isSelected}
            className={`${isSelected ? "selected-day" : isToday ? "today-date" : ""} ${workoutState}`}
            onClick={() => selectDate(day, date)}
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
function Today({
  state,
  update,
  setPage,
  setDetail,
  planReady,
  dismissPlanReady,
}) {
  const active = state.activeWorkout;
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
  const selectedIso = isoDay(selectedDate);
  const selectedDay = weekday(selectedDate);
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
    (workout) =>
      workout.completedAt &&
      !Number.isNaN(new Date(workout.completedAt).getTime()),
  );
  const earliestDate = datedWorkouts.length
    ? new Date(
        Math.min(
          ...datedWorkouts.map((workout) =>
            new Date(workout.completedAt).getTime(),
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
    const target = new Date(selectedDate);
    target.setDate(target.getDate() + direction * 7);
    selectDate(weekday(target), target);
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
      {planReady && (
        <PlanReadyNotice
          workoutToday={workoutToday}
          nextWorkout={noticeSchedule[0]}
          dismiss={dismissPlanReady}
        />
      )}
    </>
  );
  if (active) {
    const sets = active.exercises.flatMap((exercise) => exercise.sets);
    const completedSets = sets.filter((set) => set.completed).length;
    const elapsed = Math.max(0, now - Number(active.startedAt || now)) / 1000;
    return (
      <main className="screen today-screen">
        {calendar}
        <section className="today-hero active-workout-hero">
          <Eyebrow>ACTIVE WORKOUT</Eyebrow>
          <WorkoutTitle name={active.name} day={active.templateId} />
          <p>
            {completedSets} of {pluralize(sets.length, "set")} ·{" "}
            {formatActiveWorkoutDuration(elapsed)}
          </p>
          <Button onClick={() => setPage("workout")}>RESUME WORKOUT</Button>
        </section>
        <section className="exercise-preview">
          <Eyebrow>WORKOUT EXERCISES</Eyebrow>
          {active.exercises.map((exercise, index) => {
            const done = exercise.sets.filter((set) => set.completed).length;
            const current = index === active.exerciseIndex;
            return (
              <button
                key={exercise.id}
                onClick={() => setDetail({ exercise })}
                className="list-row"
              >
                <span>
                  <strong>{exerciseName(exercise)}</strong>
                  {(done > 0 || current) && (
                    <small>
                      {done} of {pluralize(exercise.sets.length, "set")}
                      {current ? " · current" : ""}
                    </small>
                  )}
                </span>
                <span className="navigation-row-end">
                  <span>{targetLabel(exercise, state.profile.rirEnabled)}</span>
                  <span className="navigation-chevron" aria-hidden="true">
                    ›
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      </main>
    );
  }
  const completed = datedWorkouts.find(
    (workout) => isoDay(workout.completedAt) === selectedIso,
  );
  const isHistoricalWeek = selectedMonday < currentMonday;
  if (!template && !completed) {
    const upcoming = nextScheduledWorkout(state, selectedDate);
    const optional = (state.optionalSessions || []).find(
      (item) => item.date === selectedIso,
    );
    const isToday = selectedIso === isoDay();
    return (
      <main className="screen today-screen">
        {calendar}
        <section className="rest-day-state">
          <Eyebrow>REST DAY</Eyebrow>
          <h1>Rest day</h1>
          <p>
            {isHistoricalWeek
              ? "No workout was planned or logged on this date."
              : isToday
                ? "Use today to recover."
                : "This is a planned recovery day."}
          </p>
          {upcoming && (
            <div className="rest-up-next">
              <Eyebrow>UP NEXT</Eyebrow>
              <time dateTime={upcoming.scheduledDate}>
                {displayDate(localDate(upcoming.scheduledDate))}
              </time>
              <h2>
                {normalizeWorkoutName(
                  upcoming.workout.name,
                  upcoming.workout.weekday,
                )}
              </h2>
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
          {isToday && (
            <button
              className="text-button train-anyway"
              onClick={() => setDetail({ restTraining: selectedIso })}
            >
              Train today anyway
            </button>
          )}
          {optional && (
            <small className="optional-session-note">
              Optional {optional.kind.toLowerCase()} · {optional.duration} min
            </small>
          )}
        </section>
      </main>
    );
  }
  const session = completed || template;
  const prior = template
    ? [...datedWorkouts]
        .reverse()
        .find(
          (workout) =>
            new Date(workout.completedAt) < selectedDate &&
            (workout.programDayId === template.id ||
              workout.templateId === template.weekday),
        )
    : null;
  const historyBeforeSelectedDate = datedWorkouts.filter(
    (workout) => new Date(workout.completedAt) < selectedDate,
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
  };
  const duration = completed?.durationSeconds
    ? `${Math.max(1, Math.round(completed.durationSeconds / 60))} min logged`
    : `~${roundedEstimate(template.estimatedMinutes)} min`;
  return (
    <main className="screen today-screen">
      {calendar}
      <section className="today-hero">
        <Eyebrow>{displayDate(selectedDate)}</Eyebrow>
        <WorkoutTitle name={session.name} day={selectedDay} />
        <p>
          {session.exercises.length} exercises · {duration}
          {completed
            ? " · completed"
            : isHistoricalWeek
              ? " · not logged"
              : prior
                ? ` · last done ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(prior.completedAt))}`
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
            onClick={() => setDetail({ exercise: completed.exercises[0] })}
          >
            WORKOUT COMPLETE · VIEW HISTORY
          </Button>
        ) : isHistoricalWeek ? (
          <Button variant="secondary" disabled>
            WORKOUT NOT LOGGED
          </Button>
        ) : trainingPaused ? (
          <Button
            variant="secondary"
            onClick={() => setDetail("training-restrictions")}
          >
            REVIEW RESTRICTIONS
          </Button>
        ) : (
          <Button onClick={start}>START WORKOUT</Button>
        )}
      </section>
      <section className="exercise-preview">
        <Eyebrow>
          {completed ? "LOGGED EXERCISES" : "TODAY'S EXERCISES"}
        </Eyebrow>
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
            <button
              key={exercise.id}
              onClick={() => setDetail({ exercise })}
              className="list-row"
            >
              <span>
                <strong>{exerciseName(exercise)}</strong>
                {detail && <small>{detail}</small>}
              </span>
              <span className="navigation-row-end">
                <span>{targetLabel(exercise, state.profile.rirEnabled)}</span>
                <span className="navigation-chevron" aria-hidden="true">
                  ›
                </span>
              </span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

export function normalizeStepperValue(raw, { min = 0, integer = false } = {}) {
  if (raw === "") return null;
  const numeric = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, integer ? Math.trunc(numeric) : numeric);
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
}) {
  const numeric = Number(value || 0);
  const empty = value === "" || value === null;
  return (
    <div className={`stepper ${empty ? "unset" : ""}`}>
      <button
        aria-label={`Decrease ${label}`}
        disabled={disabled || empty}
        onClick={() =>
          onChange(Math.max(min, Number((numeric - step).toFixed(2))))
        }
      >
        −
      </button>
      <input
        aria-label={label}
        placeholder={emptyLabel}
        inputMode={integer ? "numeric" : "decimal"}
        type="number"
        step={step}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const next = normalizeStepperValue(event.target.value, {
            min,
            integer,
          });
          if (next !== undefined) onChange(next);
        }}
      />
      <button
        aria-label={`Increase ${label}`}
        disabled={disabled || empty}
        onClick={() => onChange(Number((numeric + step).toFixed(2)))}
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
            : `${confirmation.completed} of ${pluralize(confirmation.planned, "set")} completed.`}
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
  const screenRef = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setWarmupOpen(false), [active?.id]);
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
  const superset = supersetMeta(active.exercises, active.exerciseIndex);
  const canonicalSupersetStep = superset
    ? nextSupersetStep(active.exercises, superset.id)
    : null;
  const prior = previousExercise(state.workouts, exercise.exerciseId);
  const elapsed = Math.floor((now - active.startedAt) / 1000);
  const restLeft =
    state.profile.restTimerEnabled && Number.isFinite(active.rest?.endsAt)
      ? Math.max(0, Math.ceil((active.rest.endsAt - now) / 1000))
      : 0;
  const restReady =
    state.profile.restTimerEnabled && active.rest?.pending === true;
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
  const incompleteCurrent = exercise.sets.filter(
    (set) => set.planned !== false && !set.added && !set.completed,
  ).length;
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
      ? `Next: A2 · ${exerciseName(superset.partner.exercise)}`
      : `Next: Rest · ${formatDuration(superset.restSeconds)}`
    : null;
  const mutate = (fn) =>
    update((current) => {
      fn(current.activeWorkout);
      current.activeWorkout.updatedAt = Date.now();
      return current;
    });
  const updateSet = (index, field, value) =>
    mutate((workout) => {
      workout.exercises[workout.exerciseIndex].sets[index][field] = value;
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
        rir: null,
        weight: previous?.weight ?? null,
        weightEntryMode: "auto",
        weightSourceSetId: previous?.id || null,
        repsEntryMode: "auto",
        repsSourceSetId: previous?.id || null,
      });
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
        endedEarly: summary.completedPlanned < summary.planned,
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
    if (summary.completedPlanned < summary.planned)
      setConfirmation({
        type: "finish",
        completed: summary.completedPlanned,
        planned: summary.planned,
      });
    else finishWorkout();
  };
  const confirmAction = () =>
    confirmation?.type === "next" ? moveToExercise(nextIndex) : finishWorkout();
  const timed = exerciseMeasure(exercise) === "seconds";
  const addedBodyweightLoad = Boolean(item?.bodyweight && !timed);
  const timerVisible = !confirmation && (restReady || restLeft > 0);
  const warmup =
    active.exerciseIndex === 0 && !active.warmup?.skipped
      ? active.warmup
      : null;
  const warmupCompleted = Boolean(warmup?.completed);
  const upNextBlocks = [];
  const seenUpNextSupersets = new Set();
  active.exercises.forEach((entry, index) => {
    if (index <= active.exerciseIndex) return;
    if (entry.supersetId === superset?.id) return;
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
  const completeWarmup = () => {
    mutate((workout) => {
      if (workout.warmup) workout.warmup.completed = true;
    });
    setWarmupOpen(false);
  };
  const toggleRampSet = (exerciseId, setId) =>
    mutate((workout) => {
      const set = workout.warmup?.rampUpSets
        .find((entry) => entry.exerciseId === exerciseId)
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
        <div>
          <strong>{active.name}</strong>
          <small>
            {formatDuration(elapsed)} · {summary.completed} of{" "}
            {pluralize(totalSets, "set")}
          </small>
        </div>
        <button className="text-button" onClick={requestFinish}>
          Finish
        </button>
      </header>
      {warmup && (
        <section
          className={`workout-warmup ${warmupOpen ? "open" : ""}${warmupCompleted ? " completed" : ""}`}
        >
          {warmupCompleted ? (
            <div className="warmup-complete-status" role="status">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Warm-up complete</strong>
                <small>Ready for your working sets</small>
              </div>
            </div>
          ) : (
            <>
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
                        : "View recommendations"}
                    </small>
                  </span>
                  <i className="disclosure-chevron" aria-hidden="true" />
                </button>
                <button
                  className="text-button warmup-skip"
                  onClick={() =>
                    mutate((workout) => {
                      workout.warmup.skipped = true;
                    })
                  }
                >
                  Skip
                </button>
              </div>
              {warmup.safetyMessage && (
                <p className="warmup-safety" role="status">
                  {warmup.safetyMessage}
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
                            toggleRampSet(entry.exerciseId, set.id)
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
                    FINISH WARM-UP
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      <section className="exercise-heading">
        <div>
          <Eyebrow>
            {superset
              ? `SUPERSET · ${superset.role} · ROUND ${supersetRoundIndex + 1} OF ${superset.roundCount}`
              : `EXERCISE ${active.exerciseIndex + 1} OF ${active.exercises.length}`}
          </Eyebrow>
          <h1>{exerciseName(exercise)}</h1>
          {superset && (
            <small className="superset-next-step">{supersetNextLabel}</small>
          )}
          <p>
            Target {targetLabel(exercise, state.profile.rirEnabled)}{" "}
            <span>│</span>{" "}
            {prior
              ? `Last ${prior.sets
                  .filter((set) => set.completed)
                  .map((set) => exerciseValueLabel(exercise, set.reps))
                  .join(" / ")}`
              : "First session"}
          </p>
        </div>
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
          Replace ›
        </button>
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
      <section className="sets">
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
          return (
            <div
              key={set.id}
              className={`set-row ${state.profile.rirEnabled && !timed ? "with-rir" : ""} ${set.completed ? "set-done" : ""} ${activeSet ? "set-active" : ""} ${future ? "set-future" : ""} ${set.added ? "set-extra" : ""}`}
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
                <span>{index + 1}</span>
              )}
              <Stepper
                label={`${addedBodyweightLoad ? "Added load" : "Weight"} in ${unit} for set ${index + 1}`}
                value={displayWeight(set.weight, state.profile.units)}
                step={displayWeight(increment, state.profile.units)}
                emptyLabel={addedBodyweightLoad ? "Bodyweight" : "Tap to enter"}
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
                disabled={future}
                aria-label={`${set.completed ? "Reopen" : "Complete"} set ${index + 1}`}
                onClick={() => toggleSet(index)}
              >
                ✓
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
              <span>
                <i />
                {block.entries.length === 2
                  ? `SUPERSET · A1 ${exerciseName(block.entries[0])} · A2 ${exerciseName(block.entries[1])}`
                  : exerciseName(block.entries[0])}
              </span>
              <small>
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
    </main>
  );
}

function Complete({ state, setPage, setDetail }) {
  const session = state.workouts.at(-1);
  if (!session) return null;
  const completedExercises = session.exercises.filter((item) =>
    item.sets.some((set) => set.completed),
  );
  const summary = workoutSetSummary(session);
  const endedEarly =
    session.status === "ended-early" ||
    summary.completedPlanned < summary.planned;
  const setResult = endedEarly
    ? `${summary.completedPlanned} of ${pluralize(summary.planned, "set")}`
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
      <section>
        <Eyebrow>{endedEarly ? "SESSION LOG" : "LOGGED"}</Eyebrow>
        {visibleExercises.length ? (
          visibleExercises.map((item) => {
            const planned = item.sets.filter(
              (set) => set.planned !== false && !set.added,
            ).length;
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
      <Button variant="dark" onClick={() => setPage("today")}>
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
function AdaptActionCard({ action, result, state, onAccept, onViewToday }) {
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
          {(action.skippedExerciseIds || []).length > 0 && (
            <p className="adapt-skip-summary">
              Skip {action.skippedExerciseIds.length}{" "}
              {action.skippedExerciseIds.length === 1
                ? "exercise"
                : "exercises"}{" "}
              today
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
function contextualCoachPrompts(state) {
  const prompts = [];
  const today = state.activeWorkout || adaptedTemplateForToday(state);
  const hasHistory = state.workouts.some((workout) =>
    workout.exercises.some((exercise) =>
      exercise.sets.some((set) => set.completed),
    ),
  );
  if (today) prompts.push("Adapt today to 35 minutes.");
  if (hasHistory)
    prompts.push(
      "Am I ready to increase a lift?",
      "Help me understand my recent progress.",
    );
  else {
    if (today) prompts.push("How should I approach my first workout?");
    prompts.push("Explain how this program fits my goals.");
  }
  return prompts.slice(0, 3);
}
function Coach({ state, update, setPage }) {
  const [message, setMessage] = useState(state.coachDraft || "");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
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
    if (!text || sending) return;
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
  const hasConversation = currentMessages.length > 0;
  const prompts = contextualCoachPrompts(state);
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
        {(!online || state.ai.available === false) && (
          <div className="offline-banner">
            AI Coach is unavailable. Logging and data-based progression still
            work locally.
          </div>
        )}
        {!hasConversation && (
          <>
            <aside className="coach-empty" role="note">
              <Eyebrow>WHAT COACH KNOWS</Eyebrow>
              <p>
                Your plan, today’s workout, and completed lifts are already in
                context.
              </p>
            </aside>
            <section className="prompt-list">
              <Eyebrow>SHORTCUTS</Eyebrow>
              <div>
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    disabled={sending}
                    onClick={() => send(prompt)}
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
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!sending && message.trim()) send(message);
            }
          }}
          placeholder="Ask anything…"
        />
        <Button disabled={sending || !message.trim()} aria-label="Send message">
          {sending ? "…" : "↑"}
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
                <h3>No conversations yet.</h3>
                <p>
                  Your Coach conversations will appear here after you send a
                  message.
                </p>
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
    const date = new Date(value);
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
        <Eyebrow>TRAINING CONSISTENCY</Eyebrow>
        {consistency.planned > 0 ? (
          <>
            <div className="consistency">
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
                <div className="list-row recent-session-row" key={workout.id}>
                  <span>
                    <strong>{workout.name}</strong>
                    <small>
                      {dateLabel(workout.completedAt)} ·{" "}
                      {pluralize(sets, "set")}
                    </small>
                  </span>
                </div>
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
  return sets
    .filter((set) => set.completed && Number.isFinite(Number(set.reps)))
    .map((set) =>
      exerciseMeasure(exercise) === "seconds"
        ? `${Number(set.reps)} sec`
        : `${Number(set.reps)} reps`,
    )
    .join(" / ");
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
    ["Schedule", (profile?.availableDays || []).filter(present).join(", ")],
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
function InfoRow({ label, value }) {
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
  const imported = state.program.source === "ai-import";
  const personal = [
    ["Name", p.name],
    ["Age", p.ageRange],
    ["Sex", p.sex],
  ].filter(([, value]) => present(value));
  const personalIncomplete = !p.ageRange;
  const training = profileTrainingRows(p);
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
            <InfoRow key={label} label={label} value={value} />
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
        <Eyebrow>TRAINING PRIORITIES</Eyebrow>
        {manualPriorities.length > 0 && (
          <InfoRow
            label={
              manualPriorities.length === 1 ? "Selected area" : "Selected areas"
            }
            value={manualPriorities.join(", ")}
          />
        )}
        {confirmedPriorities.map((item) => (
          <InfoRow key={item.label} label={item.label} value={item.level} />
        ))}
        {!hasPriorities && (
          <p className="muted profile-priority-empty">
            Balanced across muscle groups.
          </p>
        )}
        <button
          className="list-row"
          onClick={() => setDetail("training-priorities")}
        >
          <span>
            <strong>Review priorities</strong>
            <small>
              Edit them manually or run an optional physique review.
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
            <strong>EDIT PLAN</strong>
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
            <strong>ASK COACH TO ADJUST</strong>
            <small>Make a reviewed AI change</small>
          </span>
          <span>›</span>
        </button>
        <button className="list-row" onClick={() => setDetail("change-plan")}>
          <span>
            <strong>REPLACE PLAN</strong>
            <small>Build or import a different program</small>
          </span>
          <span>›</span>
        </button>
      </section>
      <section>
        <Eyebrow>PREFERENCES</Eyebrow>
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
      </section>
      <Button variant="quiet" className="logout-button" onClick={logOut}>
        LOG OUT
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
  const meaningful = withoutSchedule;
  return meaningful || "Imported plan";
}
function TrainingPriorities({ state, update, close }) {
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
        <strong>Training priorities</strong>
        <span />
      </header>
      <Eyebrow>TRAINING PRIORITIES</Eyebrow>
      <h1>What would you like to emphasize?</h1>
      <p>
        Edit your choices at any time. They guide Coach and future program
        generation; they do not silently rewrite your current plan.
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
      <Button onClick={save}>SAVE PRIORITIES</Button>
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
      <Button variant="quiet" onClick={close}>
        BACK
      </Button>
    </main>
  );
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
      .find((exercise) => exercise.matchStatus === "unresolved")?.id ?? null;
  const [expandedExerciseId, setExpandedExerciseId] = useState(() =>
    firstUnresolvedExercise(source),
  );
  const [exercisePickerId, setExercisePickerId] = useState(null);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [addingToDayId, setAddingToDayId] = useState(null);
  const [copyingDayId, setCopyingDayId] = useState(null);
  const [pairingExerciseId, setPairingExerciseId] = useState(null);
  const [collapsedDayIds, setCollapsedDayIds] = useState([]);
  useEffect(() => {
    const next = withWarmupPreference(source);
    setProgram(next);
    setDirty(false);
    setExpandedExerciseId(firstUnresolvedExercise(next));
    setExercisePickerId(null);
    setExerciseQuery("");
    setAddingToDayId(null);
    setCopyingDayId(null);
    setPairingExerciseId(null);
    setCollapsedDayIds([]);
  }, [source.id]);
  const imported = program.source === "ai-import";
  const scratch = mode === "scratch";
  const unresolved = program.days
    .flatMap((day) => day.exercises)
    .filter((exercise) => exercise.matchStatus === "unresolved").length;
  const catalog = Object.values(exerciseCatalog)
    .filter((item) => isExerciseAllowed(item, profile))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      exercise.exerciseId = item.id;
      exercise.defaultIncrement = item.increment;
      exercise.restSeconds = item.restSeconds;
      exercise.importedName = item.name;
      exercise.originalImportedName = item.name;
      exercise.matchStatus = "confirmed-match";
      delete exercise.importedExercise;
      exercise.sets.forEach((set) => {
        set.weight = null;
      });
    });
    setExercisePickerId(null);
    setExerciseQuery("");
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
  };
  const confirmAllCustom = () => {
    setDirty(true);
    setExpandedExerciseId(null);
    setProgram((current) => {
      const next = clone(current);
      next.days.forEach((day) =>
        day.exercises
          .filter((exercise) => exercise.matchStatus === "unresolved")
          .forEach(confirmImportedName),
      );
      return next;
    });
  };
  const setCount = (dayId, exerciseId, count) =>
    mutateExercise(dayId, exerciseId, (exercise) => {
      const total = Math.max(
        1,
        Math.min(imported ? 20 : 6, Number(count) || 1),
      );
      if (total < exercise.sets.length)
        exercise.sets = exercise.sets.slice(0, total);
      else
        while (exercise.sets.length < total)
          exercise.sets.push({
            id: `edited-set-${Date.now()}-${exercise.sets.length}`,
            weight: scratch ? (exercise.sets[0]?.weight ?? null) : null,
            reps: exercise.repMin,
            completed: false,
          });
    });
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
      days: current.days.map((day) =>
        day.id === dayId ? { ...day, name: value, nameEdited: true } : day,
      ),
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
    const weights = exercise.sets.filter(
      (set) =>
        set.weight !== null && set.weight !== undefined && set.weight !== "",
    ).length;
    return `${pluralize(exercise.sets.length, "set")} \u00b7 ${reps}${imported && weights ? ` \u00b7 ${weights === exercise.sets.length ? "Weights added" : `${weights}/${exercise.sets.length} weights`}` : ""}`;
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
            body: "Add at least two exercises to each day, then adjust sets and rep targets.",
            action: "USE THIS PLAN",
          }
        : mode === "import"
          ? {
              eyebrow: "IMPORT PLAN",
              title: "Review your plan",
              body: "Check the exercises, sets, days and imported weights before saving.",
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
                body: "See how your answers shaped the plan, then review any workout before you start.",
                action: "USE THIS PLAN",
              };
  const namesValid =
    String(program.name || "").trim() &&
    program.days.every(
      (day) =>
        String(day.name || "").trim() &&
        (!scratch || day.exercises.length >= 2),
    );
  const saveProgram = () =>
    onSave({
      ...program,
      name: String(program.name).trim(),
      days: program.days.map((day) => ({
        ...day,
        name: String(day.name).trim(),
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
      <section className="import-preview plan-editor">
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
              ? `${program.days.filter((day) => day.exercises.length >= 2 && String(day.name || "").trim()).length} of ${program.days.length} days ready`
              : `${pluralize(program.days.length, "day")}/week`}
          </small>
        </div>
        {program.conditioning && (
          <ConditioningCard conditioning={program.conditioning} />
        )}
        {program.days.map((day) => {
          const exerciseCount = day.exercises.length;
          const exercisesNeeded = Math.max(0, 2 - exerciseCount);
          const ready = exerciseCount >= 2 && String(day.name || "").trim();
          const collapsed = scratch && collapsedDayIds.includes(day.id);
          const emptyCopyTargets = scratch
            ? program.days.filter(
                (target) => target.id !== day.id && target.exercises.length === 0,
              )
            : [];
          return (
          <div
            className={`import-day${scratch ? " scratch-workout-day" : ""}${ready ? " is-ready" : " is-incomplete"}${collapsed ? " is-collapsed" : ""}`}
            key={day.id}
          >
            {mode === "edit" || scratch ? (
              <label className="workout-name-field">
                <span>{day.weekday.toUpperCase()} WORKOUT NAME</span>
                <input
                  aria-label={`${day.weekday} workout name`}
                  type="text"
                  maxLength={60}
                  value={day.name || ""}
                  placeholder="e.g. Upper, Lower or Push"
                  onChange={(event) =>
                    setWorkoutName(day.id, event.target.value)
                  }
                />
              </label>
            ) : (
              <strong>
                {day.weekday} · {normalizeWorkoutName(day.name, day.weekday)}
              </strong>
            )}
            {scratch && (
              <div className="scratch-day-status">
                <small
                  className={
                    ready
                      ? "ready"
                      : !String(day.name || "").trim()
                        ? "validation-error"
                        : ""
                  }
                >
                  {!String(day.name || "").trim()
                    ? `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"} · Workout name required`
                    : exercisesNeeded
                      ? `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"} · ${exercisesNeeded} more needed`
                      : `${exerciseCount} exercises · Ready`}
                </small>
              </div>
            )}
            {!collapsed && <div className="plan-editor-cards">
              {day.exercises.map((exercise, exerciseIndex) => {
                const expanded = expandedExerciseId === exercise.id;
                const needsReview = exercise.matchStatus === "unresolved";
                const pickerOpen = exercisePickerId === exercise.id;
                const timed = exerciseMeasure(exercise) === "seconds";
                const catalogExercise = exerciseCatalog[exercise.exerciseId];
                const acceptsStartingWeight =
                  scratch && !timed && !catalogExercise?.bodyweight;
                const startingWeight = exercise.sets.length
                  ? exercise.sets[0].weight
                  : null;
                const pair = exercise.supersetId
                  ? supersetMeta(day.exercises, exerciseIndex)
                  : null;
                const pairRole = pair?.role || null;
                const eligiblePartners = day.exercises.filter(
                  (candidate) =>
                    candidate.id !== exercise.id && !candidate.supersetId,
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
                return (
                  <article
                    className={`import-exercise plan-editor-exercise${expanded ? " is-expanded" : ""}${needsReview ? " needs-review" : ""}${pairRole ? ` is-superset superset-${pairRole.toLowerCase()}` : ""}`}
                    key={exercise.id}
                  >
                    <button
                      type="button"
                      className="plan-editor-summary"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : needsReview ? "Review" : "Edit"} ${exerciseName(exercise)}`}
                      onClick={() => {
                        setExpandedExerciseId(expanded ? null : exercise.id);
                        setExercisePickerId(null);
                        setExerciseQuery("");
                      }}
                    >
                      <span className="plan-editor-heading">
                        <strong>
                          {pairRole && (
                            <i className="superset-role">{pairRole}</i>
                          )}
                          {exerciseName(exercise)}
                        </strong>
                        <small>{exerciseSummary(exercise)}</small>
                        {pairRole === "A2" && (
                          <small className="superset-round-rest">
                            Rest after round · {pair.restSeconds} sec
                          </small>
                        )}
                      </span>
                      <span className="plan-editor-summary-action">
                        <b>
                          {needsReview ? "REVIEW" : expanded ? "CLOSE" : "EDIT"}
                        </b>
                        <i aria-hidden="true" />
                      </span>
                    </button>
                    {expanded && (
                      <div className="plan-editor-fields">
                        {needsReview ? (
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
                              Type the correct name. Known Rook exercises match
                              automatically; any other name is kept as your
                              custom exercise.
                            </small>
                          </label>
                        ) : (
                          <div className="plan-editor-select">
                            <span>Exercise</span>
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
                              <i aria-hidden="true">⌄</i>
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
                                  {availableExercises.length ? (
                                    availableExercises.map((item) => (
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
                                      No exercises match your search.
                                    </small>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
                        {imported && (
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
                        {exercise.notes && (
                          <small className="imported-note">
                            {exercise.notes}
                          </small>
                        )}
                        {needsReview && (
                          <div className="match-review">
                            <small>Check exercise name</small>
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
                                KEEP THIS NAME
                              </button>
                              <span>You can edit it above first.</span>
                            </div>
                          </div>
                        )}
                        <div className="plan-editor-actions">
                          <button
                            type="button"
                            disabled={!scratch && day.exercises.length <= 1}
                            onClick={() => removeExercise(day.id, exercise.id)}
                          >
                            REMOVE
                          </button>
                          {scratch && pair && (
                            <button
                              type="button"
                              onClick={() =>
                                removeSuperset(day.id, pair.id)
                              }
                            >
                              REMOVE SUPERSET
                            </button>
                          )}
                          {scratch && !pair && eligiblePartners.length > 0 && (
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
                        {scratch &&
                          !pair &&
                          pairingExerciseId === exercise.id && (
                            <div className="superset-picker">
                              <strong>Create superset</strong>
                              <small>
                                Choose A2. It will move directly after this
                                exercise. Sets alternate A1 → A2, then rest.
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
      </section>
      {unresolved > 0 && (
        <section className="bulk-match-review">
          <Eyebrow>REVIEW ALL</Eyebrow>
          <button type="button" onClick={confirmAllCustom}>
            <i aria-hidden="true">✓</i>
            <span>
              <strong>KEEP ALL {unresolved} AS WRITTEN</strong>
              <small>Accept every remaining name as a custom exercise.</small>
            </span>
          </button>
        </section>
      )}
      <Button
        disabled={saving || unresolved > 0 || !namesValid}
        onClick={saveProgram}
      >
        {saving ? "SAVING…" : copy.action}
      </Button>
      <Button variant="quiet" disabled={saving} onClick={onCancel}>
        {mode === "import" ? "EDIT NOTES" : "BACK"}
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

function ImportPlan({ state, update, close, initial = false }) {
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
            Any format works — Rook will structure it for you.
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
          weekKey(workout.completedAt) === weekKey(date),
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
    sheetRef.current?.closest(".modal-layer, .workout-confirm-layer");
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
        <button
          className="sheet-close"
          aria-label="Close"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
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
    return <ImportPlan state={state} update={update} close={close} />;
  if (detail === "edit-plan")
    return <EditPlan state={state} update={update} close={close} />;
  if (detail === "training-priorities")
    return <TrainingPriorities state={state} update={update} close={close} />;
  if (detail === "training-restrictions")
    return <TrainingRestrictions state={state} update={update} close={close} />;
  if (detail === "profile-details")
    return <ProfileDetails state={state} update={update} close={close} />;
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
  const history = state.workouts
    .flatMap((workout) =>
      workout.exercises
        .filter(
          (item) =>
            item.exerciseId === exercise.exerciseId &&
            item.sets.some((set) => set.completed),
        )
        .map((item) => ({ ...item, date: workout.completedAt })),
    )
    .slice(-8);
  const latestSet = history
    .at(-1)
    ?.sets.find((set) => set.completed && set.weight !== null);
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
  return (
    <main ref={panelRef} className="screen detail-screen">
      <header className="detail-header">
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>{exerciseName(exercise)}</strong>
        <span />
      </header>
      {history.length ? (
        <>
          <Eyebrow>
            {timed ? "CURRENT HOLD TIME" : "CURRENT WORKING WEIGHT"}
          </Eyebrow>
          <h1
            className={
              !timed && !bodyweight && !latestSet ? "history-weight-empty" : ""
            }
          >
            {timed
              ? latestHold
              : bodyweight
                ? "Bodyweight"
                : latestSet
                  ? displayWeight(latestSet.weight, state.profile.units)
                  : "Not set yet"}{" "}
            <small>{timed ? "sec" : latestSet ? unit : ""}</small>
          </h1>
          <p>{targetLabel(exercise, state.profile.rirEnabled)}</p>
        </>
      ) : (
        <>
          <Eyebrow>FIRST SESSION</Eyebrow>
          <h1>No history yet.</h1>
          <p>
            {timed
              ? "Log the number of seconds held for each set."
              : bodyweight
                ? "Log the repetitions you complete with controlled form."
                : "Choose a comfortable starting load when you begin the first set."}
          </p>
        </>
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
      <section>
        <Eyebrow>HISTORY</Eyebrow>
        {history.length ? (
          [...history].reverse().map((item, index) => {
            const set = item.sets.find((value) => value.completed);
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
        <button aria-label="Close" onClick={close}>
          ‹
        </button>
        <strong>Logging</strong>
        <span />
      </header>
      <section className="logging-group">
        <Eyebrow>UNITS</Eyebrow>
        <div className="segmented">
          {["kg", "lb"].map((unit) => (
            <button
              key={unit}
              className={p.units === unit ? "active" : ""}
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
        <Eyebrow>
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
function Replace({ exercise, state, update, close }) {
  const sheetRef = useRef(null);
  const programIds = state.program.days.flatMap((day) =>
    day.exercises.map((item) => item.exerciseId),
  );
  const compatible = useMemo(
    () => compatibleReplacementCandidates(exercise, state.profile, programIds),
    [
      exercise.exerciseId,
      exercise.importedExercise?.pattern,
      state.profile,
      programIds.join("|"),
    ],
  );
  const [choices, setChoices] = useState(() => compatible.slice(0, 3));
  const [loading, setLoading] = useState(() => compatible.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let mounted = true;
    setChoices(compatible.slice(0, 3));
    setLoading(compatible.length === 0);
    setNoMore(false);
    setPicker(false);
    setQuery("");
    AIService.suggestExerciseReplacements(state, exercise).then((result) => {
      if (!mounted) return;
      const ranked = result.exerciseIds
        .map((id) => exerciseCatalog[id])
        .filter(Boolean);
      const merged = [...ranked, ...compatible].filter(
        (item, index, list) =>
          list.findIndex((value) => value.id === item.id) === index,
      );
      setChoices(merged.slice(0, 3));
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [exercise.id]);
  const more = async () => {
    if (loading || loadingMore) return;
    setLoadingMore(true);
    const shown = new Set(choices.map((item) => item.id));
    const result = await AIService.suggestExerciseReplacements(
      state,
      exercise,
      { excludeIds: [...shown] },
    );
    const ranked = result.exerciseIds
      .map((id) => exerciseCatalog[id])
      .filter((item) => item && !shown.has(item.id));
    const remaining = compatible.filter((item) => !shown.has(item.id));
    const next = [...ranked, ...remaining]
      .filter(
        (item, index, list) =>
          list.findIndex((value) => value.id === item.id) === index,
      )
      .slice(0, 3);
    if (next.length)
      setChoices((current) =>
        [...current, ...next].filter(
          (item, index, list) =>
            list.findIndex((value) => value.id === item.id) === index,
        ),
      );
    else setNoMore(true);
    setLoadingMore(false);
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
            {loading && (
              <p className="muted replacement-loading">
                Checking compatible options…
              </p>
            )}
            {choices.length
              ? choices.map(choiceButton)
              : !loading && (
                  <p className="offline-banner">
                    There is not enough compatible exercise metadata for a safe
                    replacement.
                  </p>
                )}
            <div className="replacement-secondary">
              <button
                onClick={more}
                disabled={loading || loadingMore || noMore}
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
  const showGeneratedPlan = () => {
    setDetail(null);
    setPage("today");
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
      <Complete state={state} setPage={setPage} setDetail={setDetail} />
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
