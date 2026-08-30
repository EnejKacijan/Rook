import { selectStructuralTemplate } from './splitPreferences.js';
import { compileProfileTrainingSafety, exerciseAllowedByTrainingSafety, trainingSafetyBlocks } from './trainingSafety.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const UPPER_PATTERNS = new Set(['horizontal-push', 'incline-push', 'horizontal-pull', 'vertical-push', 'vertical-pull', 'shoulder-isolation', 'elbow-flexion', 'elbow-extension', 'power-upper']);
const LOWER_PATTERNS = new Set(['squat', 'hinge', 'single-leg', 'knee-flexion', 'hip-extension', 'calf', 'power-lower']);
const INTERCHANGEABLE_COMPOUND_PATTERNS = new Set(['horizontal-push', 'horizontal-pull', 'vertical-push', 'vertical-pull']);
const TEMPLATE_SESSION_NAMES = { 'T2-FB': ['Full Body A', 'Full Body B'], 'T3-FB': ['Full Body A', 'Full Body B', 'Full Body C'], 'T4-UL': ['Upper A', 'Lower A', 'Upper B', 'Lower B'], 'T5-ULPPL': ['Upper', 'Lower', 'Push', 'Pull', 'Legs'], 'T6-PPL2': ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'] };

const unique = values => [...new Set((values || []).filter(Boolean))];
const boundedNumber = (value, fallback, min, max) => Math.max(min, Math.min(max, Number(value) || fallback));
const normalized = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function equipmentFor(profile = {}, location = null) {
  if (location === 'Commercial gym' || profile.environment === 'Commercial gym') return ['barbell', 'rack', 'bench', 'dumbbells', 'cables', 'machines', 'pull-up bar', 'resistance bands', 'bodyweight'];
  const selected = new Set(profile.equipment || []); const result = new Set(['bodyweight']);
  if (selected.has('barbell/rack/bench')) ['barbell', 'rack', 'bench'].forEach(value => result.add(value));
  for (const value of ['dumbbells', 'cables', 'machines', 'pull-up bar', 'resistance bands']) if (selected.has(value)) result.add(value);
  return [...result];
}

function catalogRestrictions(profile = {}, catalog = []) {
  const avoidance = normalized(profile.avoid); if (!avoidance) return [];
  return catalog.filter(item => [item.name, item.id, ...(item.aliases || [])].some(name => {
    const token = normalized(name); return token.length > 3 && (avoidance.includes(token) || token.split(' ').some(word => word.length > 4 && (avoidance.includes(word) || avoidance.includes(`${word}s`))));
  }) || [item.pattern].some(pattern => { const token = normalized(pattern); return token.length > 3 && avoidance.includes(token); })).map(item => item.id);
}

function effortPolicyFor(profile = {}) {
  const selected = String(profile.effortStyle || ''); const olderAdult = profile.ageRange === '60+';
  const mode = selected.startsWith('Fewer hard') ? 'fewer-hard' : selected.startsWith('More moderate') ? 'more-moderate' : selected.startsWith('Balanced workload') ? 'balanced' : 'automatic';
  const setRange = mode === 'fewer-hard' ? [2, 2] : mode === 'more-moderate' ? [3, 4] : mode === 'balanced' ? [2, 4] : profile.experience === 'Beginner' ? [2, 3] : [2, 4];
  const rirRange = mode === 'fewer-hard' ? [1, olderAdult ? 2 : 1] : mode === 'more-moderate' ? [2, 3] : mode === 'balanced' ? [1, 3] : [1, 3];
  return { mode, setRange, rirRange, compoundMinimumRir: olderAdult ? 3 : rirRange[0], isolationMinimumRir: olderAdult ? 2 : rirRange[0], olderAdultConservativeStart: olderAdult, neverRequiresFailure: true };
}

export function buildProgrammingContext(profile = {}, catalog = [], historySummary = null) {
  const trainingSafety = profile.compiledTrainingSafety ||
    compileProfileTrainingSafety(profile, catalog);
  const daysPerWeek = boundedNumber(profile.daysPerWeek, 3, 2, 6);
  const sessionMinutes = boundedNumber(profile.sessionMinutes, 60, 20, 180);
  const priorities = unique([...(profile.priorities || []), ...((profile.confirmedPhysiquePriorities || profile.prioritySources?.physiqueConfirmed || []).map(item => item.trainingPriority || item.label))]).filter(value => value !== 'Balanced');
  const experience = profile.experience || 'Unknown';
  const workload = experience === 'Beginner'
    ? { exercisesPerSession: [Math.max(2, Math.floor(sessionMinutes / 18)), Math.min(6, Math.max(3, Math.ceil(sessionMinutes / 12)))], workingSetsPerSession: [5, Math.min(18, Math.max(8, Math.floor(sessionMinutes / 4)))] }
    : { exercisesPerSession: [Math.max(2, Math.floor(sessionMinutes / 15)), Math.min(8, Math.max(4, Math.ceil(sessionMinutes / 10)))], workingSetsPerSession: [6, Math.min(24, Math.max(10, Math.floor(sessionMinutes / 3)))] };
  const desiredExposure = profile.goal === 'Build muscle' || profile.goal === 'Get stronger'
    ? { defaultPerMusclePerWeek: daysPerWeek >= 4 ? [2, 3] : [1, 2], priorityPerMusclePerWeek: daysPerWeek >= 3 ? [2, 3] : [1, 2] }
    : { defaultPerMusclePerWeek: [1, Math.min(3, daysPerWeek)], priorityPerMusclePerWeek: [2, Math.min(3, daysPerWeek)] };
  const locations = profile.environment === 'Both' ? ['Commercial gym', 'Home'] : [profile.environment === 'Home gym' ? 'Home' : 'Commercial gym'];
  const recentFrequency = historySummary?.recentWeeklyFrequency?.averageCompleted;
  const structuralSelection = selectStructuralTemplate(profile, daysPerWeek);
  const safetyScopedRegion = trainingSafety.constraints.allowedBodyRegions?.length === 1
    ? trainingSafety.constraints.allowedBodyRegions[0]
    : null;
  const preferredSplit = structuralSelection.preference;
  const preferenceCanChangeStructure = structuralSelection.preferenceHonored;
  const volumeCeiling = profile.goal === 'General fitness' ? 8 : profile.goal === 'Build muscle' ? experience === 'Beginner' ? 14 : experience === 'Advanced' ? 20 : 18 : profile.goal === 'Lose fat' ? experience === 'Beginner' ? 10 : 14 : profile.goal === 'Athletic performance' ? 14 : 16;
  return {
    schemaVersion: 1,
    goal: profile.goal || null,
    experience: profile.experience || null,
    ageContext: profile.ageRange || null,
    requestedFrequency: daysPerWeek,
    availableDays: unique(profile.availableDays).filter(day => WEEKDAYS.includes(day)),
    usableLocations: locations,
    equipmentByLocation: Object.fromEntries(locations.map(location => [location, equipmentFor(profile, location)])),
    sessionMinutes,
    workloadCapacity: workload,
    effortPreference: profile.effortStyle || null,
    effortPolicy: effortPolicyFor(profile),
    confirmedPriorities: priorities,
    exerciseSelectionPolicy: profile.goal === 'Build muscle' ? { hypertrophyModalities: 'Machines and free weights are both valid; rank by target fit, stability, comfort, progression and preference.', chestPriority: priorities.includes('Chest') ? 'Start at least one chest-focused session with a stable incline press when compatible equipment is available, then use a complementary horizontal press across the week. Do not default to barbell bench press unless strength or free-weight preference justifies it.' : null } : null,
    exercisePreference: profile.exercisePreference || null,
    freeTextPreferences: profile.trainingPreferences || null,
    restrictedExerciseIds: unique([
      ...catalogRestrictions(profile, catalog),
      ...catalog.filter(item => !trainingSafetyBlocks(trainingSafety.status) && !exerciseAllowedByTrainingSafety(item, trainingSafety)).map(item => item.id)
    ]),
    restrictionText: profile.avoid || null,
    trainingSafety,
    desiredExposure,
    structuralTemplate: { templateId: safetyScopedRegion ? `SAFETY-${safetyScopedRegion === 'upper_body' ? 'UPPER' : 'LOWER'}` : structuralSelection.templateId, role: safetyScopedRegion ? 'literal confirmed clinician scope' : preferenceCanChangeStructure ? 'preference-shaped evidence-informed baseline' : 'evidence-informed baseline', lockedByFrequency: safetyScopedRegion ? false : !preferenceCanChangeStructure, fidelity: safetyScopedRegion ? 'required' : structuralSelection.fidelity },
    preferredSplit: preferredSplit ? { ...preferredSplit, exactFrequencyMatch: structuralSelection.exactFrequencyMatch, fidelity: structuralSelection.fidelity, requiresMaterialAdaptation: preferenceCanChangeStructure } : null,
    trainingStyle: structuralSelection.parsedPreference,
    volumePolicy: { counting: 'primary=1.0, secondary=0.5, incomplete=0', initialPerMuscleCeiling: volumeCeiling, hardPerMuscleCeiling: 20 },
    progressionPolicy: { comparableTopRangeExposuresBeforeLoadIncrease: 2, upperLoadJumpLimit: .075, lowerLoadJumpLimit: .10, incompleteSetsCanTriggerIncrease: false, missingLoadCanTriggerIncrease: false, plateauMinimumExposures: 4, plateauMinimumDays: 14 },
    recoveryContext: {
      avoidRepeatedFocusOnAdjacentDays: true,
      repeatingWeekBoundary: 'Sun->Mon',
      adherenceEvidence: Number.isFinite(recentFrequency) ? { requestedDays: daysPerWeek, recentAverageCompletedDays: recentFrequency } : null
    }
  };
}

function completedSets(exercise) { return (exercise?.sets || []).filter(set => set?.completed); }
function weekKey(value) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return null;
  const day = (date.getDay() + 6) % 7; date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function summarizeTrainingHistory(workouts = [], program = null, { now = new Date(), maxSessions = 24, catalog = [] } = {}) {
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 84);
  const recent = (Array.isArray(workouts) ? workouts : []).filter(workout => {
    const date = new Date(workout?.completedAt || workout?.endedAt || 0); return Number.isFinite(date.getTime()) && date >= cutoff && date <= now;
  }).sort((a, b) => new Date(a.completedAt || a.endedAt) - new Date(b.completedAt || b.endedAt)).slice(-maxSessions);
  if (!recent.length) return null;
  const weekly = new Map(); const exercises = new Map(); const volumeByWeek = new Map(); const substitutions = new Map(); const byId = new Map(catalog.map(item => [item.id, item])); const programDays = new Map((program?.days || []).map(day => [day.id, day])); let completedSessions = 0; let endedEarly = 0;
  for (const workout of recent) {
    const key = weekKey(workout.completedAt || workout.endedAt); if (key) weekly.set(key, (weekly.get(key) || 0) + 1);
    const allSets = (workout.exercises || []).flatMap(exercise => exercise.sets || []); const hasWork = allSets.some(set => set.completed);
    if (hasWork) completedSessions++; if (workout.endedEarly || workout.status === 'ended-early') endedEarly++;
    for (const exercise of workout.exercises || []) {
      const sets = completedSets(exercise); const entry = exercises.get(exercise.exerciseId) || { exerciseId: exercise.exerciseId, appearances: 0, completedAppearances: 0, skippedAppearances: 0, recentLoadsKg: [], recentTopReps: [], recentRir: [] };
      entry.appearances++; if (sets.length) entry.completedAppearances++; else entry.skippedAppearances++;
      const loads = sets.map(set => Number(set.weight)).filter(Number.isFinite); const reps = sets.map(set => Number(set.reps)).filter(Number.isFinite); const rir = sets.map(set => Number(set.rir)).filter(Number.isFinite);
      if (loads.length) entry.recentLoadsKg.push(Math.max(...loads)); if (reps.length) entry.recentTopReps.push(Math.max(...reps)); if (rir.length) entry.recentRir.push(Number((rir.reduce((sum, value) => sum + value, 0) / rir.length).toFixed(1)));
      if (key && sets.length) { const weekVolume = volumeByWeek.get(key) || {}; for (const muscle of byId.get(exercise.exerciseId)?.muscles || []) weekVolume[muscle] = (weekVolume[muscle] || 0) + sets.length; volumeByWeek.set(key, weekVolume); }
      exercises.set(exercise.exerciseId, entry);
    }
    const template = programDays.get(workout.programDayId); if (template) {
      const plannedIds = new Set((template.exercises || []).map(exercise => exercise.exerciseId)); const actualIds = new Set((workout.exercises || []).map(exercise => exercise.exerciseId));
      const removed = [...plannedIds].filter(id => !actualIds.has(id)); const added = [...actualIds].filter(id => !plannedIds.has(id));
      if (removed.length === 1 && added.length === 1) { const pair = `${removed[0]}->${added[0]}`; substitutions.set(pair, (substitutions.get(pair) || 0) + 1); }
    }
  }
  const durations = recent.map(workout => Number(workout.durationSeconds) / 60).filter(value => Number.isFinite(value) && value > 0);
  const requested = Number(program?.days?.length) || null; const weekCounts = [...weekly.values()];
  const exerciseEvidence = [...exercises.values()].map(entry => {
    const loads = entry.recentLoadsKg.slice(-4); const trend = loads.length >= 2 ? loads.at(-1) > loads[0] ? 'increasing' : loads.at(-1) < loads[0] ? 'decreasing' : 'stable' : 'insufficient-data';
    return { ...entry, recentLoadsKg: loads, recentTopReps: entry.recentTopReps.slice(-4), recentRir: entry.recentRir.slice(-4), progressionTrend: trend };
  }).sort((a, b) => b.appearances - a.appearances).slice(0, 12);
  return {
    schemaVersion: 1,
    observationWindowDays: 84,
    observedSessions: recent.length,
    completedSessions,
    endedEarlySessions: endedEarly,
    sessionCompletionRate: Number((completedSessions / recent.length).toFixed(2)),
    recentWeeklyFrequency: { weeksObserved: weekCounts.length, averageCompleted: Number((weekCounts.reduce((sum, value) => sum + value, 0) / Math.max(1, weekCounts.length)).toFixed(1)), requested },
    typicalSessionMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    recentWeeklyVolumeExposure: [...volumeByWeek.entries()].slice(-4).map(([week, completedSetsByMuscle]) => ({ week, completedSetsByMuscle })),
    relevantSubstitutions: [...substitutions.entries()].map(([pair, count]) => { const [fromExerciseId, toExerciseId] = pair.split('->'); return { fromExerciseId, toExerciseId, count }; }).sort((a, b) => b.count - a.count).slice(0, 6),
    regularlyCompletedExerciseIds: exerciseEvidence.filter(item => item.completedAppearances >= 2 && item.completedAppearances / item.appearances >= .75).map(item => item.exerciseId),
    repeatedlySkippedExerciseIds: exerciseEvidence.filter(item => item.skippedAppearances >= 2 && item.skippedAppearances / item.appearances >= .5).map(item => item.exerciseId),
    exerciseEvidence
  };
}

function estimatedMinutes(exercises, byId) {
  if (!exercises?.length) return 0;
  return 5 + Math.max(0, exercises.length - 1) * 2 + exercises.reduce((sum, exercise) => {
    const sets = Number(exercise.sets) || 0; const workSeconds = sets * 45; const rests = Math.max(0, sets - 1) * (Number(exercise.restSeconds) || 90); const setup = byId.get(exercise.exerciseId)?.kind === 'compound' ? 3 : 1;
    return sum + Math.max(3, Math.ceil((workSeconds + rests) / 60 + setup));
  }, 0);
}
function dayFocus(day, byId) {
  const patterns = (day.exercises || []).map(exercise => byId.get(exercise.exerciseId)?.pattern).filter(Boolean);
  const upper = patterns.filter(pattern => UPPER_PATTERNS.has(pattern)).length; const lower = patterns.filter(pattern => LOWER_PATTERNS.has(pattern)).length;
  if (upper && lower) return 'full'; if (lower >= 2) return 'lower';
  const push = patterns.filter(pattern => ['horizontal-push', 'incline-push', 'vertical-push', 'shoulder-isolation', 'elbow-extension', 'power-upper'].includes(pattern)).length;
  const pull = patterns.filter(pattern => ['horizontal-pull', 'vertical-pull', 'elbow-flexion'].includes(pattern)).length;
  if (push >= 2 && push > pull * 1.5) return 'push'; if (pull >= 2 && pull > push * 1.5) return 'pull'; if (upper) return 'upper';
  return patterns[0] || 'unknown';
}
function contradiction(day, focus) {
  const name = normalized(day.name); if (!name) return false;
  if (/full body/.test(name)) return focus !== 'full';
  if (/\blower\b|\blegs?\b/.test(name)) return focus !== 'lower';
  if (/\bupper\b/.test(name)) return focus !== 'upper';
  if (/\bpush\b/.test(name)) return !['push', 'upper'].includes(focus);
  if (/\bpull\b/.test(name)) return !['pull', 'upper'].includes(focus);
  return false;
}

function matchesPreferredSplit(plan, preference, byId = new Map()) {
  if (!preference?.requiresMaterialAdaptation) return true;
  const names = (plan.days || []).map(day => normalized(day.name));
  if (preference.id === 'arnold') return names.some(name => /chest/.test(name) && /back/.test(name)) && names.some(name => /shoulder/.test(name) && /arms?/.test(name)) && names.some(name => /legs?|lower|full body/.test(name));
  if (preference.id === 'upper-lower') return names.some(name => /upper/.test(name)) && names.some(name => /lower/.test(name));
  if (preference.id === 'push-pull-legs') return names.some(name => /push/.test(name)) && names.some(name => /pull/.test(name)) && names.some(name => /legs?|lower/.test(name));
  if (preference.id === 'full-body') return names.every(name => /full body/.test(name));
  if (preference.id === 'push-pull') {
    const structurallyComplete = (plan.days || []).every(day => {
      const name = normalized(day.name); const patterns = (day.exercises || []).map(exercise => byId.get(exercise.exerciseId)?.pattern);
      if (/push/.test(name)) return patterns.some(pattern => ['squat', 'single-leg'].includes(pattern)) && patterns.some(pattern => ['horizontal-push', 'incline-push', 'vertical-push'].includes(pattern));
      if (/pull/.test(name)) return patterns.some(pattern => ['hinge', 'hip-extension', 'knee-flexion'].includes(pattern)) && patterns.some(pattern => ['horizontal-pull', 'vertical-pull'].includes(pattern));
      return false;
    });
    return structurallyComplete && names.some(name => /push/.test(name)) && names.some(name => /pull/.test(name));
  }
  if (preference.id === 'torso-limbs') {
    const torsoDays = (plan.days || []).filter(day => /torso/.test(normalized(day.name))); const limbDays = (plan.days || []).filter(day => /limbs?/.test(normalized(day.name)));
    const directArms = day => (day.exercises || []).filter(exercise => ['elbow-flexion', 'elbow-extension'].includes(byId.get(exercise.exerciseId)?.pattern)).length;
    const lowerWork = day => (day.exercises || []).some(exercise => LOWER_PATTERNS.has(byId.get(exercise.exerciseId)?.pattern));
    return torsoDays.length > 0 && limbDays.length > 0 && torsoDays.every(day => directArms(day) === 0) && limbDays.every(day => directArms(day) > 0 && lowerWork(day));
  }
  if (preference.id === 'body-part') return new Set(names.flatMap(name => ['chest', 'back', 'legs', 'shoulders', 'arms'].filter(part => name.includes(part)))).size >= Math.min(3, names.length);
  if (preference.id === 'pplul') return ['push', 'pull', 'legs', 'upper', 'lower'].every(part => names.some(name => name.includes(part)));
  return true;
}

export function validateRawPlan(plan, profile = {}, catalog = [], programmingContext = null) {
  const issues = []; const add = (code, message, day = null, exerciseId = null) => issues.push({ code, severity: 'hard', day, exerciseId, message });
  if (!plan || !Array.isArray(plan.days)) return { valid: false, issues: [{ code: 'missing_days', severity: 'hard', day: null, exerciseId: null, message: 'Program is missing days.' }] };
  const byId = new Map(catalog.map(item => [item.id, item])); const requested = Number(profile.daysPerWeek); const allowedDays = new Set(profile.availableDays?.length ? profile.availableDays : WEEKDAYS); const restricted = new Set(programmingContext?.restrictedExerciseIds || []); const weeklyVolume = {};
  if (trainingSafetyBlocks(programmingContext?.trainingSafety?.status)) add('training_safety', programmingContext.trainingSafety.message || 'Training restrictions need review.');
  if (!Number.isInteger(requested) || requested < 2 || requested > 6) add('invalid_frequency', 'Training frequency must be between 2 and 6 days per week.');
  if (Number.isFinite(requested) && plan.days.length !== requested) add('day_count', `Plan has ${plan.days.length} days instead of ${requested}.`);
  const expectedSessions = programmingContext?.structuralTemplate?.lockedByFrequency ? TEMPLATE_SESSION_NAMES[programmingContext.structuralTemplate.templateId] : null;
  if (expectedSessions && (plan.days.length !== expectedSessions.length || expectedSessions.some(expected => !plan.days.some(day => normalized(day.name).startsWith(normalized(expected)))))) add('structural_template', `Plan does not preserve the required ${programmingContext.structuralTemplate.templateId} session structure.`);
  if (!matchesPreferredSplit(plan, programmingContext?.preferredSplit, byId)) add('split_preference', `Plan does not materially reflect the explicit ${programmingContext.preferredSplit.label} preference.`);
  const seenDays = new Set(); const signatures = [];
  for (const day of plan.days) {
    if (!WEEKDAYS.includes(day.weekday) || !allowedDays.has(day.weekday) || seenDays.has(day.weekday)) add('invalid_weekday', `Invalid, unavailable, or duplicate weekday ${day.weekday}.`, day.weekday); seenDays.add(day.weekday);
    if (!Array.isArray(day.exercises) || day.exercises.length < 2 || day.exercises.length > 8) add('invalid_session_size', `Invalid exercise count on ${day.weekday}.`, day.weekday);
    const validLocation = ['Commercial gym', 'Home'].includes(day.location) && !(profile.environment === 'Commercial gym' && day.location !== 'Commercial gym') && !(profile.environment === 'Home gym' && day.location !== 'Home');
    if (!validLocation) add('invalid_location', `Location is incompatible on ${day.weekday}.`, day.weekday);
    const availableEquipment = new Set(equipmentFor(profile, day.location)); const seen = new Set(); const patternCounts = new Map();
    for (const exercise of day.exercises || []) {
      const item = byId.get(exercise.exerciseId);
      if (!item) add('unknown_exercise', `Unknown exercise ID ${exercise.exerciseId}.`, day.weekday, exercise.exerciseId);
      else {
        if ((item.equipment || []).some(value => !availableEquipment.has(value))) add('equipment', `${item.name} is unavailable at ${day.location}.`, day.weekday, item.id);
        if (restricted.has(item.id)) add('restriction', `${item.name} conflicts with an explicit restriction.`, day.weekday, item.id);
        const loadableAlternative = item.bodyweight && item.kind !== 'power' && catalog.some(candidate => candidate.id !== item.id && candidate.pattern === item.pattern && candidate.primaryMuscles?.[0] === item.primaryMuscles?.[0] && !candidate.bodyweight && candidate.progressionQuality === 'load-and-repetition' && !restricted.has(candidate.id) && (candidate.equipment || []).every(value => availableEquipment.has(value)));
        if (loadableAlternative) add('avoidable_bodyweight', `${item.name} is harder to progress consistently than an available externally loaded alternative.`, day.weekday, item.id);
        if (item.kind === 'compound' && INTERCHANGEABLE_COMPOUND_PATTERNS.has(item.pattern)) patternCounts.set(item.pattern, (patternCounts.get(item.pattern) || 0) + 1);
        (item.muscles || []).forEach((muscle, index) => { weeklyVolume[muscle] = (weeklyVolume[muscle] || 0) + Number(exercise.sets || 0) * (index === 0 ? 1 : .5); });
      }
      if (seen.has(exercise.exerciseId)) add('duplicate_exercise', `Duplicate exercise ${exercise.exerciseId}.`, day.weekday, exercise.exerciseId); seen.add(exercise.exerciseId);
      const maxRep = item?.measure === 'seconds' ? 600 : 100;
      if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 6 || !Number.isInteger(exercise.repMin) || !Number.isInteger(exercise.repMax) || exercise.repMin < 1 || exercise.repMax < exercise.repMin || exercise.repMax > maxRep || !Number.isInteger(exercise.targetRir) || exercise.targetRir < 0 || exercise.targetRir > 4 || !Number.isInteger(exercise.restSeconds) || exercise.restSeconds < 30 || exercise.restSeconds > 300) add('invalid_prescription', `Invalid prescription for ${exercise.exerciseId}.`, day.weekday, exercise.exerciseId);
      const effortPolicy = programmingContext?.effortPolicy; const compoundLike = item?.kind === 'compound' || item?.kind === 'power';
      if (effortPolicy?.mode === 'fewer-hard' && exercise.sets !== 2) add('effort_set_count', `${exercise.exerciseId} does not use the selected two-set approach.`, day.weekday, exercise.exerciseId);
      if (effortPolicy?.mode === 'more-moderate' && (exercise.sets < 3 || exercise.sets > 4)) add('effort_set_count', `${exercise.exerciseId} does not use the selected three-to-four-set approach.`, day.weekday, exercise.exerciseId);
      const minimumRir = compoundLike ? effortPolicy?.compoundMinimumRir : effortPolicy?.isolationMinimumRir;
      if (Number.isFinite(minimumRir) && exercise.targetRir < minimumRir) add('effort_intensity', `${exercise.exerciseId} is harder than the selected effort policy.`, day.weekday, exercise.exerciseId);
      const restrictionMinimumRir = programmingContext?.trainingSafety?.constraints?.minRirByExerciseId?.[exercise.exerciseId];
      if (Number.isFinite(restrictionMinimumRir) && exercise.targetRir < restrictionMinimumRir) add('restriction_effort', `${exercise.exerciseId} is harder than the explicit training restriction.`, day.weekday, exercise.exerciseId);
      if (effortPolicy?.mode === 'fewer-hard' && !effortPolicy.olderAdultConservativeStart && exercise.targetRir > 1) add('effort_intensity', `${exercise.exerciseId} is not consistent with the selected hard-set approach.`, day.weekday, exercise.exerciseId);
      if (effortPolicy?.mode === 'more-moderate' && exercise.targetRir > 3) add('effort_intensity', `${exercise.exerciseId} is easier than the selected moderate-set range.`, day.weekday, exercise.exerciseId);
    }
    for (const [pattern, count] of patternCounts) if (count > 1) add('interchangeable_redundancy', `Multiple interchangeable ${pattern} compounds occur in one session.`, day.weekday);
    const calculated = estimatedMinutes(day.exercises || [], byId); const available = Number(profile.sessionMinutes || day.estimatedMinutes); const durationLimit = Math.max(available + 5, Math.ceil(available * 1.15)); if (!Number.isFinite(Number(day.estimatedMinutes)) || Math.abs(Number(day.estimatedMinutes) - calculated) > 5 || calculated > durationLimit) add('duration', `Estimated duration is unrealistic on ${day.weekday}.`, day.weekday);
    const focus = dayFocus(day, byId); if (contradiction(day, focus)) add('name_content_conflict', `Session name and exercise content conflict on ${day.weekday}.`, day.weekday);
    signatures.push({ weekday: day.weekday, ids: new Set((day.exercises || []).map(exercise => exercise.exerciseId)), focus });
  }
  for (const [muscle, sets] of Object.entries(weeklyVolume)) if (sets > 20) add('weekly_volume_cap', `${muscle} exceeds the hard limit of 20 fractional sets per week.`);
  const chronological = [...signatures].sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday));
  for (let index = 0; index < chronological.length; index++) {
    const current = chronological[index]; const next = chronological[(index + 1) % chronological.length]; const gap = (WEEKDAYS.indexOf(next.weekday) - WEEKDAYS.indexOf(current.weekday) + 7) % 7;
    if (gap === 1 && current.focus === next.focus && ['upper', 'lower', 'push', 'pull'].includes(current.focus)) add('recovery_conflict', `Consecutive ${current.focus} sessions conflict across ${current.weekday}->${next.weekday}.`, next.weekday);
  }
  return { valid: issues.length === 0, issues };
}

export function plannerCatalog(catalog = []) {
  return catalog.map(item => ({
    id: item.id, name: item.name, movementPattern: item.pattern, pattern: item.pattern,
    primaryMuscles: item.muscles?.slice(0, 1) || [], secondaryMuscles: item.muscles?.slice(1) || [], muscles: item.muscles || [],
    equipment: item.equipment || [], role: item.kind, kind: item.kind, unilateral: Boolean(item.unilateral), technicalDifficulty: item.technicalDifficulty || 1, stability: item.stability || 'moderate', fatigueCost: item.fatigueCost || 'moderate', progressionQuality: item.progressionQuality || null, trackingSupport: item.trackingSupport || 'reps-and-load',
    similarityGroup: item.kind === 'compound' && INTERCHANGEABLE_COMPOUND_PATTERNS.has(item.pattern) ? item.pattern : null,
    setupCost: item.kind === 'compound' ? 'moderate' : 'low', bodyweight: Boolean(item.bodyweight), measure: item.measure || 'reps', durationRange: item.durationRange || null
  }));
}
