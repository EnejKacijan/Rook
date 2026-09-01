export const TRAINING_SAFETY_PARSER_VERSION = 3;
export const TRAINING_SAFETY_POLICY_VERSION = 3;
export const TRAINING_SAFETY_SCHEMA_VERSION = 2;

export const TRAINING_SAFETY_FINDING_KINDS = [
  "recent_procedure",
  "current_unresolved_pain",
  "not_medically_cleared",
  "historical_resolved_issue",
  "explicit_avoidance",
  "symptom_trigger",
  "exercise_effort_limit",
  "clinician_allowed_scope",
  "unsupported_explicit_limit",
  "no_specific_limits_reported",
  "limits_unknown",
];
const TRAINING_SAFETY_UNRESOLVED_REASONS = [
  "ambiguous_medical_status",
  "ambiguous_avoidance_target",
  "ambiguous_clinician_limit",
  "other_safety_language",
];

const UPPER_PATTERNS = new Set([
  "horizontal-push",
  "incline-push",
  "chest-isolation",
  "horizontal-pull",
  "vertical-pull",
  "upper-back-pull",
  "vertical-push",
  "shoulder-isolation",
  "rear-delt",
  "elbow-flexion",
  "elbow-extension",
  "shrug",
  "power-upper",
]);
const LOWER_PATTERNS = new Set([
  "squat",
  "hinge",
  "single-leg",
  "knee-extension",
  "knee-flexion",
  "hip-extension",
  "calf",
  "power-lower",
]);

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hash = (value) => {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return `ts-${(result >>> 0).toString(36)}`;
};

export function verifyTrainingSafetyAnalysis(sourceText, value) {
  const source = String(sourceText || "");
  if (!value || ![1, TRAINING_SAFETY_SCHEMA_VERSION].includes(value.schemaVersion))
    throw new Error("Training-safety analysis has an unsupported schema.");
  if (!Array.isArray(value.findings) || !Array.isArray(value.unresolved))
    throw new Error("Training-safety analysis is incomplete.");
  if (value.findings.length > 16 || value.unresolved.length > 8)
    throw new Error("Training-safety analysis is too large.");
  const evidence = (item) => {
    if (!item || !Number.isInteger(item.start) || !Number.isInteger(item.end))
      throw new Error("Training-safety evidence is invalid.");
    if (item.start < 0 || item.end <= item.start || item.end > source.length)
      throw new Error("Training-safety evidence is outside the source text.");
    if (source.slice(item.start, item.end) !== item.quote)
      throw new Error("Training-safety evidence does not match the source text.");
    return { start: item.start, end: item.end, quote: item.quote };
  };
  const findings = value.findings.map((item) => {
    if (!TRAINING_SAFETY_FINDING_KINDS.includes(item?.kind))
      throw new Error("Training-safety finding is invalid.");
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)
      throw new Error("Training-safety confidence is invalid.");
    if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 4)
      throw new Error("Training-safety finding needs exact evidence.");
    const targetText = item.targetText == null ? null : String(item.targetText).trim();
    const minimumRir = item.minimumRir == null ? null : Number(item.minimumRir);
    const allowedBodyRegion = item.allowedBodyRegion == null ? null : item.allowedBodyRegion;
    if (["explicit_avoidance", "symptom_trigger", "exercise_effort_limit"].includes(item.kind) ? !targetText : targetText !== null)
      throw new Error("Training-safety avoidance target is invalid.");
    if (
      item.kind === "exercise_effort_limit"
        ? !Number.isInteger(minimumRir) || minimumRir < 1 || minimumRir > 4
        : minimumRir !== null
    )
      throw new Error("Training-safety effort limit is invalid.");
    if (
      item.kind === "clinician_allowed_scope"
        ? !["upper_body", "lower_body", "full_body"].includes(allowedBodyRegion)
        : allowedBodyRegion !== null
    )
      throw new Error("Training-safety clinician scope is invalid.");
    return {
      kind: item.kind,
      confidence: item.confidence,
      evidence: item.evidence.map(evidence),
      targetText,
      minimumRir,
      allowedBodyRegion,
    };
  });
  const unresolved = value.unresolved.map((item) => {
    if (!TRAINING_SAFETY_UNRESOLVED_REASONS.includes(item?.reason))
      throw new Error("Training-safety unresolved reason is invalid.");
    return { evidence: evidence(item.evidence), reason: item.reason };
  });
  return { schemaVersion: value.schemaVersion, findings, unresolved };
}

const hasClinician = (text) =>
  /\b(?:doctor|physician|surgeon|physio|physiotherapist|physical therapist|clinician|pt)\b/.test(
    text,
  );
const hasPermission = (text) =>
  /\b(?:cleared|approved|allowed|told me i can|said i can|may do|can do)\b/.test(
    text,
  );

function clinicianScope(text) {
  if (!hasClinician(text) || !hasPermission(text)) return null;
  if (/\bupper body(?: strength)? training only\b|\bupper body only\b/.test(text))
    return { allowedBodyRegions: ["upper_body"], label: "Upper-body strength training only" };
  if (/\blower body(?: strength)? training only\b|\blower body only\b/.test(text))
    return { allowedBodyRegions: ["lower_body"], label: "Lower-body strength training only" };
  if (/\b(?:normal|full|unrestricted) (?:strength )?training\b/.test(text))
    return { allowedBodyRegions: ["upper_body", "lower_body", "core"], label: "Normal strength training" };
  return null;
}

function explicitAvoidance(text, catalog) {
  text = text
    .replace(/\b(?:pocep|pocepi|pocepov|pocepe)\b/g, "squats")
    .replace(/\b(?:izpadni korak|izpadni koraki|izpadnih korakov)\b/g, "lunges")
    .replace(/\b(?:mrtvi dvig|mrtve dvige|mrtvih dvigov)\b/g, "deadlifts")
    .replace(/\b(?:potisk nad glavo|potiske nad glavo)\b/g, "overhead pressing")
    .replace(/\b(?:skok|skoki|skokov)\b/g, "jumps");
  const operatorText = text.replace(
    /\b(?:no|without)\b.{0,24}\bpain\b|\bnot in pain\b|\bpain free\b/g,
    " ",
  );
  const operator = /\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)\b/;
  if (!operator.test(operatorText))
    return { exerciseIds: [], patterns: [], nameTokens: [], labels: [], hasOperator: false };
  const exerciseIds = [];
  const labels = [];
  const genericMovementNames = new Set([
    "squat", "squats", "lunge", "lunges", "deadlift", "deadlifts", "bench press",
  ]);
  for (const item of catalog || []) {
    const names = [item.name, ...(item.aliases || [])]
      .map(normalize)
      .filter((name) => name.length > 3);
    if (
      names.some((name) => text.includes(name)) &&
      !names.some((name) => genericMovementNames.has(name))
    ) {
      exerciseIds.push(item.id);
      labels.push(item.name);
    }
  }
  const patterns = [];
  const nameTokens = [];
  if (
    /\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? squats?\b/.test(
      operatorText,
    )
  ) {
    patterns.push("squat");
    labels.push("Squat movements");
  }
  if (/\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? lunges?\b/.test(operatorText)) {
    nameTokens.push("lunge");
    labels.push("Lunge movements");
  }
  if (/\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? deadlifts?\b/.test(operatorText)) {
    nameTokens.push("deadlift");
    labels.push("Deadlifts");
  }
  if (/\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? bench press(?:es)?\b/.test(operatorText)) {
    nameTokens.push("bench press");
    labels.push("Bench presses");
  }
  if (/\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? overhead press(?:ing|es)?\b/.test(operatorText)) {
    patterns.push("vertical-push");
    labels.push("Overhead pressing");
  }
  if (/\b(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do)(?: any| all)? (?:jump|jumps|jumping|plyometrics?)\b/.test(operatorText)) {
    patterns.push("power-lower");
    labels.push("Jumping and lower-body power exercises");
  }
  return {
    exerciseIds: [...new Set(exerciseIds)],
    patterns: [...new Set(patterns)],
    nameTokens: [...new Set(nameTokens)],
    labels: [...new Set(labels)],
    hasOperator: operator.test(operatorText),
  };
}

export function compileTrainingSafety(
  sourceText,
  catalog = [],
  {
    confirmedScopeHash = null,
    semanticAnalysis = null,
    clearanceAttestation = null,
    clearanceDeclinedHash = null,
    clearanceResponse = null,
    limitsResponse = null,
  } = {},
) {
  const source = String(sourceText || "").trim();
  const text = normalize(source);
  const empty = !text;
  const resolvedCue =
    /\b(?:no current pain|no pain now|not in pain|pain free|fully recovered|completely recovered)\b/.test(
      text,
    );
  const historicalCue =
    /\b(?:old|previous|past|history of|years? ago|fully recovered|completely recovered)\b/.test(
      text,
    );
  const pastResolved = historicalCue && resolvedCue;
  const recentProcedure =
    !pastResolved &&
    (/(?:\brecent\b|\brecently\b|\bjust\b).{0,35}\b(?:surgery|operation|procedure)\b/.test(
      text,
    ) ||
      /\b(?:surgery|operation|procedure)\b.{0,35}(?:\brecent\b|\brecently\b)/.test(
        text,
      ) ||
      /\bpost ?(?:op|operative)\b|\brecovering from (?:surgery|an operation|a procedure)\b|\bstill recovering\b|\b\d+\s+(?:days?|weeks?|months?)\s+(?:after|post)\s+(?:surgery|operation)\b/.test(
        text,
      ) ||
      /\b(?:surgery|operation|procedure)\b.{0,35}\b\d+\s+(?:days?|weeks?|months?)\s+ago\b/.test(
        text,
      ) ||
      /\b\d+\s+(?:days?|weeks?|months?)\s+ago\b.{0,35}\b(?:surgery|operation|procedure)\b/.test(
        text,
      ));
  const painNegated =
    /\b(?:no|without)\b.{0,24}\bpain\b|\bnot in pain\b|\bpain free\b/.test(
      text,
    );
  const currentPain =
    !painNegated &&
    /\b(?:current|ongoing|unresolved|still|now)?\s*(?:pain|painful|hurts?|aching)\b|\bstill injured\b|\bnot healed\b/.test(
      text,
    );
  const notCleared =
    /\b(?:not|havent|hasnt|wasnt)\s+(?:medically\s+)?cleared\b|\bwaiting for (?:medical |doctor |clinician )?clearance\b|\bnot allowed to (?:train|lift|exercise)\b|\bno (?:training|lifting|exercise) until\b/.test(
      text,
    );
  let scope = clinicianScope(text);
  const avoidance = explicitAvoidance(text, catalog);
  const vagueClinicianLimit =
    hasClinician(text) &&
    /\b(?:keep it easy|take it easy|dont stress|do not stress|nothing that aggravates|use pain as|exercise is okay|exercise is ok)\b/.test(
      text,
    );
  const vagueAvoidance =
    avoidance.hasOperator &&
    !avoidance.exerciseIds.length &&
    !avoidance.patterns.length &&
    !avoidance.nameTokens.length &&
    /\b(?:knee|shoulder|back|hip|spine|joint|injury|pain|stress|aggravate|bother)\b/.test(
      text,
    );
  let semantic = null;
  if (semanticAnalysis) semantic = verifyTrainingSafetyAnalysis(source, semanticAnalysis);
  const semanticFindings = semantic?.findings || [];
  const lowConfidence = semanticFindings.some((item) => item.confidence < 0.9);
  const semanticBlocked = semanticFindings.some((item) =>
    ["recent_procedure", "current_unresolved_pain", "not_medically_cleared"].includes(item.kind),
  );
  const semanticCurrentPain = semanticFindings.some(
    (item) => item.kind === "current_unresolved_pain",
  );
  const semanticRecentProcedure = semanticFindings.some(
    (item) => item.kind === "recent_procedure",
  );
  const semanticHistorical = semanticFindings.some(
    (item) => item.kind === "historical_resolved_issue",
  );
  const semanticUnsupported = semanticFindings.filter(
    (item) => item.kind === "unsupported_explicit_limit",
  );
  const deterministicUnsupportedMatch = source.match(
    /\b(?:under|below|past|beyond|up to|only to|no more than|maximum|max)\s*\d+(?:[.,]\d+)?\s*(?:kg|kilograms?|lb|lbs|pounds?|degrees?)\b|\b\d+(?:[.,]\d+)?\s*°/iu,
  );
  const unsupportedLimits = [
    ...semanticUnsupported.map((item) => item.evidence[0]?.quote).filter(Boolean),
    deterministicUnsupportedMatch ? source : null,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const semanticNoSpecificLimits = semanticFindings.some(
    (item) => item.kind === "no_specific_limits_reported",
  );
  const semanticLimitsUnknown = semanticFindings.some(
    (item) => item.kind === "limits_unknown",
  );
  const semanticScope = semanticFindings.find(
    (item) => item.kind === "clinician_allowed_scope",
  );
  if (semanticScope) {
    const regions =
      semanticScope.allowedBodyRegion === "full_body"
        ? ["upper_body", "lower_body", "core"]
        : [semanticScope.allowedBodyRegion];
    scope = {
      allowedBodyRegions: regions,
      label:
        semanticScope.allowedBodyRegion === "upper_body"
          ? "Upper-body strength training only"
          : semanticScope.allowedBodyRegion === "lower_body"
            ? "Lower-body strength training only"
            : "Normal strength training",
    };
  }
  const semanticAvoidanceTargets = semanticFindings
    .filter((item) => ["explicit_avoidance", "symptom_trigger"].includes(item.kind))
    .map((item) =>
      normalize(item.targetText).replace(
        /^(?:avoid|avoiding|no|cannot|cant|dont do|do not do|skip|exclude|never do|brez)\s+/,
        "",
      ),
    );
  const semanticAvoidance = semanticAvoidanceTargets.length
    ? explicitAvoidance(
        semanticAvoidanceTargets.map((target) => `avoid ${target}`).join("; "),
        catalog,
      )
    : null;
  const resolvedAvoidance = semanticAvoidance || avoidance;
  const effortLimits = {};
  const effortLabels = [];
  let unresolvedEffortLimit = false;
  for (const finding of semanticFindings.filter(
    (item) => item.kind === "exercise_effort_limit",
  )) {
    const target = normalize(finding.targetText);
    const matches = (catalog || []).filter((item) =>
      [item.name, ...(item.aliases || [])].some(
        (name) => normalize(name) === target,
      ),
    );
    if (matches.length !== 1) {
      unresolvedEffortLimit = true;
      continue;
    }
    effortLimits[matches[0].id] = Math.max(
      effortLimits[matches[0].id] || 0,
      finding.minimumRir,
    );
    effortLabels.push(`${matches[0].name}: at least ${finding.minimumRir} RIR`);
  }
  const unresolvedSemanticAvoidance = Boolean(
    semanticAvoidanceTargets.length &&
      !resolvedAvoidance.exerciseIds.length &&
      !resolvedAvoidance.patterns.length &&
      !resolvedAvoidance.nameTokens.length,
  );
  const constraintHash = hash(
    JSON.stringify({
      sourceText: source,
      scope,
      semantic,
      exerciseIds: resolvedAvoidance.exerciseIds,
      patterns: resolvedAvoidance.patterns,
      nameTokens: resolvedAvoidance.nameTokens,
      minRirByExerciseId: effortLimits,
    }),
  );
  const scopeConfirmed = Boolean(scope && confirmedScopeHash === constraintHash);
  const clearanceConfirmed = Boolean(
    clearanceAttestation?.kind === "user_reported_clinician_clearance" &&
      clearanceAttestation?.scope === "strength_training_with_compiled_limits" &&
      clearanceAttestation?.constraintHash === constraintHash &&
      clearanceAttestation?.parserVersion === TRAINING_SAFETY_PARSER_VERSION &&
      clearanceAttestation?.policyVersion === TRAINING_SAFETY_POLICY_VERSION &&
      clearanceAttestation?.questionVersion === 1,
  );
  const clearanceDeclined = clearanceDeclinedHash === constraintHash;
  const clearanceResponseStatus =
    clearanceResponse?.constraintHash === constraintHash &&
    clearanceResponse?.parserVersion === TRAINING_SAFETY_PARSER_VERSION &&
    clearanceResponse?.policyVersion === TRAINING_SAFETY_POLICY_VERSION &&
    clearanceResponse?.questionVersion === 1 &&
    ["clinician_not_cleared", "not_asked", "unknown"].includes(
      clearanceResponse?.status,
    )
      ? clearanceResponse.status
      : null;
  const storedLimitsResponseStatus =
    limitsResponse?.constraintHash === constraintHash &&
    limitsResponse?.parserVersion === TRAINING_SAFETY_PARSER_VERSION &&
    limitsResponse?.policyVersion === TRAINING_SAFETY_POLICY_VERSION &&
    limitsResponse?.questionVersion === 1 &&
    [
      "no_specific_limits_reported",
      "no_specific_triggers_reported",
      "unknown",
      "trigger_unknown",
    ].includes(limitsResponse?.status)
      ? limitsResponse.status
      : null;
  const limitsResponseStatus = semanticLimitsUnknown
    ? "unknown"
    : semanticNoSpecificLimits
      ? "no_specific_limits_reported"
      : storedLimitsResponseStatus;
  const triggerResponseStatus = [
    "no_specific_triggers_reported",
    "trigger_unknown",
  ].includes(storedLimitsResponseStatus)
    ? storedLimitsResponseStatus
    : null;
  const hasProcedureOrClinicianContext =
    recentProcedure || semanticRecentProcedure || hasClinician(text);
  const currentSymptomOnly =
    (currentPain || semanticCurrentPain) && !hasProcedureOrClinicianContext;
  const semanticNotCleared = semanticFindings.some(
    (item) => item.kind === "not_medically_cleared",
  );
  const signals = [
    recentProcedure && { kind: "recent_procedure" },
    currentPain && { kind: "current_pain" },
    notCleared && { kind: "not_cleared" },
    pastResolved && { kind: "past_issue" },
    (avoidance.hasOperator || semanticAvoidanceTargets.length) && { kind: "explicit_avoidance" },
    scope && { kind: "clinician_instruction" },
  ].filter(Boolean);
  let status = "normal";
  let message = null;
  if (semanticNotCleared || notCleared || clearanceDeclined || clearanceResponseStatus) {
    status =
      semanticNotCleared || notCleared || clearanceResponseStatus === "clinician_not_cleared"
        ? "blocked_not_cleared"
        : clearanceDeclined
          ? "blocked_unresolved"
        : clearanceResponseStatus === "not_asked"
          ? "blocked_clearance_not_asked"
          : clearanceResponseStatus === "unknown"
            ? "blocked_clearance_unknown"
            : "blocked_not_cleared";
    message =
      status === "blocked_not_cleared"
        ? "You reported that a clinician has not cleared you to resume strength training."
        : status === "blocked_unresolved"
          ? "Rook won't build a plan while your current training status is unresolved."
        : status === "blocked_clearance_unknown"
          ? "Rook won't treat your training status as cleared when you're unsure."
          : "Rook can't build this plan until you can confirm whether a clinician cleared strength training with these limits.";
  } else if (semantic && (lowConfidence || semantic.unresolved.length)) {
    status = "needs_clarification";
    message = "Rook found safety-related wording that needs a clearer, specific training limit before it can build your plan.";
  } else if (vagueClinicianLimit) {
    status = "needs_clarification";
    message = "This restriction needs a specific exercise, movement, range, load, or effort limit before Rook can apply it.";
  } else if (unsupportedLimits.length) {
    status = "unsupported_limit";
    message = "Rook understood a specific training limit, but cannot reliably enforce it during plan building and workouts yet.";
  } else if (semantic && (unresolvedSemanticAvoidance || unresolvedEffortLimit)) {
    status = "needs_clarification";
    message = "Rook found safety-related wording that needs a clearer, specific training limit before it can build your plan.";
  } else if (scope && !scopeConfirmed) {
    status = "needs_confirmation";
    message = "Confirm that the detected limit matches what you entered.";
  } else if ((semanticBlocked || recentProcedure || currentPain || notCleared) && !scopeConfirmed) {
    if (
      semantic &&
      !scope &&
      !resolvedAvoidance.exerciseIds.length &&
      !resolvedAvoidance.patterns.length &&
      !resolvedAvoidance.nameTokens.length &&
      !Object.keys(effortLimits).length &&
      limitsResponseStatus !== "no_specific_limits_reported" &&
      triggerResponseStatus !== "no_specific_triggers_reported"
    ) {
      status = currentSymptomOnly
        ? triggerResponseStatus === "trigger_unknown"
          ? "blocked_trigger_unknown"
          : "needs_trigger_confirmation"
        : limitsResponseStatus === "unknown"
          ? "blocked_limits_unknown"
          : "needs_limits_confirmation";
      message =
        status === "blocked_trigger_unknown"
          ? "You're not sure which movements or exercises worsen the current symptom. Rook won't guess what to exclude."
          : status === "needs_trigger_confirmation"
            ? "Tell Rook only about movements or exercises you know make the current symptom worse."
        : status === "blocked_limits_unknown"
          ? "Rook won't assume there are no training limits when you're unsure."
          : "Confirm whether a clinician gave you any specific training limits.";
    } else if (clearanceConfirmed) {
      status = "constraints_active";
    } else if (semantic) {
      status = "needs_clearance_confirmation";
      message = "Confirm whether a clinician cleared you to resume strength training with the limits shown.";
    } else {
      status = "blocked_unresolved";
      message =
        "Your note mentions a recent injury or procedure, current symptoms, or missing medical clearance. The app cannot determine an appropriate strength-training plan from that information.";
    }
  } else if (vagueClinicianLimit || vagueAvoidance) {
    status = "needs_clarification";
    message =
      "This restriction could not be turned into a rule the app can enforce. Add specific movements to avoid or an explicit clinician-provided training limit.";
  } else if (
    scopeConfirmed ||
    resolvedAvoidance.exerciseIds.length ||
    resolvedAvoidance.patterns.length ||
    resolvedAvoidance.nameTokens.length ||
    Object.keys(effortLimits).length
  ) {
    status = "constraints_active";
  }
  return {
    sourceText: source,
    parserVersion: TRAINING_SAFETY_PARSER_VERSION,
    policyVersion: TRAINING_SAFETY_POLICY_VERSION,
    status: empty ? "normal" : status,
    signals,
    pastResolved: semantic ? semanticHistorical : pastResolved,
    message,
    constraintHash,
    clinicianScope: scope,
    clinicianScopeConfirmed: scopeConfirmed,
    constraints: {
      avoidExerciseIds: resolvedAvoidance.exerciseIds,
      avoidPatterns: resolvedAvoidance.patterns,
      avoidNameTokens: resolvedAvoidance.nameTokens,
      minRirByExerciseId: effortLimits,
      allowedBodyRegions: scopeConfirmed ? scope.allowedBodyRegions : null,
    },
    appliedLabels: [...resolvedAvoidance.labels, ...effortLabels],
    unsupportedLimits,
    semanticAnalysis: semantic,
    clearanceConfirmed,
    clearanceDeclined,
    clearanceResponseStatus,
    limitsResponseStatus,
    triggerResponseStatus,
  };
}

export function createTrainingClearanceAttestation(safety) {
  return {
    kind: "user_reported_clinician_clearance",
    scope: "strength_training_with_compiled_limits",
    constraintHash: safety.constraintHash,
    parserVersion: TRAINING_SAFETY_PARSER_VERSION,
    policyVersion: TRAINING_SAFETY_POLICY_VERSION,
    questionVersion: 1,
    attestedAt: new Date().toISOString(),
  };
}

export function createTrainingClearanceResponse(safety, status) {
  if (!["clinician_not_cleared", "not_asked", "unknown"].includes(status))
    throw new Error("Unknown training-clearance response.");
  return {
    status,
    constraintHash: safety.constraintHash,
    parserVersion: TRAINING_SAFETY_PARSER_VERSION,
    policyVersion: TRAINING_SAFETY_POLICY_VERSION,
    questionVersion: 1,
    answeredAt: new Date().toISOString(),
  };
}

export function createTrainingLimitsResponse(safety, status) {
  if (![
    "no_specific_limits_reported",
    "no_specific_triggers_reported",
    "unknown",
    "trigger_unknown",
  ].includes(status))
    throw new Error("Unknown training-limits response.");
  return {
    status,
    constraintHash: safety.constraintHash,
    parserVersion: TRAINING_SAFETY_PARSER_VERSION,
    policyVersion: TRAINING_SAFETY_POLICY_VERSION,
    questionVersion: 1,
    answeredAt: new Date().toISOString(),
  };
}

export function trainingSafetyInputForProfile(profile = {}) {
  const sourceText = String(profile.avoid || "");
  const base =
    profile.trainingSafetyAnalysis?.sourceText === sourceText &&
    profile.trainingSafetyAnalysis?.analysis?.schemaVersion ===
      TRAINING_SAFETY_SCHEMA_VERSION
      ? profile.trainingSafetyAnalysis.analysis
      : null;
  const supplemental = profile.trainingSafetySupplementalLimits;
  if (
    !base ||
    !supplemental?.text ||
    supplemental.analysis?.schemaVersion !== TRAINING_SAFETY_SCHEMA_VERSION
  )
    return { sourceText, semanticAnalysis: base };
  const offset = sourceText.length + 1;
  const supplementalCanResolveClarification =
    supplemental.resolvesUnresolved === true &&
    supplemental.analysis.findings.some((finding) =>
      [
        "explicit_avoidance",
        "symptom_trigger",
        "exercise_effort_limit",
        "clinician_allowed_scope",
        "unsupported_explicit_limit",
      ].includes(finding.kind),
    );
  const shiftEvidence = (evidence) => ({
    ...evidence,
    start: evidence.start + offset,
    end: evidence.end + offset,
  });
  return {
    sourceText: `${sourceText}\n${supplemental.text}`,
    semanticAnalysis: {
      schemaVersion: TRAINING_SAFETY_SCHEMA_VERSION,
      findings: [
        ...base.findings,
        ...supplemental.analysis.findings.map((finding) => ({
          ...finding,
          evidence: finding.evidence.map(shiftEvidence),
        })),
      ],
      unresolved: [
        ...(supplementalCanResolveClarification ? [] : base.unresolved),
        ...supplemental.analysis.unresolved.map((item) => ({
          ...item,
          evidence: shiftEvidence(item.evidence),
        })),
      ],
    },
  };
}

export function compileProfileTrainingSafety(profile, catalog = []) {
  const input = trainingSafetyInputForProfile(profile);
  return compileTrainingSafety(input.sourceText, catalog, {
    confirmedScopeHash: profile?.trainingSafetyConfirmedHash,
    semanticAnalysis: input.semanticAnalysis,
    clearanceAttestation: profile?.trainingSafetyClearanceAttestation,
    clearanceDeclinedHash: profile?.trainingSafetyClearanceDeclinedHash,
    clearanceResponse: profile?.trainingSafetyClearanceResponse,
    limitsResponse: profile?.trainingSafetyLimitsResponse,
  });
}

export function trainingSafetyBlocks(status) {
  return [
    "blocked_unresolved",
    "needs_clarification",
    "needs_confirmation",
    "needs_clearance_confirmation",
    "blocked_not_cleared",
    "blocked_clearance_not_asked",
    "blocked_clearance_unknown",
    "needs_limits_confirmation",
    "blocked_limits_unknown",
    "needs_trigger_confirmation",
    "blocked_trigger_unknown",
    "unsupported_limit",
  ].includes(status);
}

export function exerciseAllowedByTrainingSafety(item, safety) {
  if (!item || trainingSafetyBlocks(safety?.status)) return false;
  const constraints = safety?.constraints || {};
  if ((constraints.avoidExerciseIds || []).includes(item.id)) return false;
  if ((constraints.avoidPatterns || []).includes(item.pattern)) return false;
  const itemName = normalize(item.name);
  if (
    (constraints.avoidNameTokens || []).some((token) => itemName.includes(token))
  )
    return false;
  const allowed = constraints.allowedBodyRegions;
  if (!allowed?.length) return true;
  const region = UPPER_PATTERNS.has(item.pattern)
    ? "upper_body"
    : LOWER_PATTERNS.has(item.pattern)
      ? "lower_body"
      : item.pattern === "core"
        ? "core"
        : null;
  return Boolean(region && allowed.includes(region));
}
