export const EXPERT_ISSUES = [
  ['redundant_exercises', 'Redundant exercises'],
  ['volume', 'Volume'],
  ['frequency', 'Frequency'],
  ['recovery', 'Recovery'],
  ['exercise_order', 'Exercise order'],
  ['exercise_selection', 'Exercise selection'],
  ['prescription', 'Sets, reps or RIR'],
  ['session_focus', 'Session focus'],
  ['naming', 'Naming'],
  ['other', 'Other']
];

const issueIds = new Set(EXPERT_ISSUES.map(([id]) => id));
const text = (value, maximum) => String(value || '').trim().slice(0, maximum);
const cleanIds = values => [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 120)).filter(Boolean))].slice(0, 8);

export function expertProfileSnapshot(profile = {}) {
  return {
    ageRange: profile.ageRange || null,
    sex: profile.sex || null,
    goal: profile.goal || null,
    experience: profile.experience || null,
    daysPerWeek: Number(profile.daysPerWeek) || null,
    availableDays: cleanIds(profile.availableDays),
    sessionMinutes: Number(profile.sessionMinutes) || null,
    environment: profile.environment || null,
    equipment: cleanIds(profile.equipment),
    priorities: cleanIds(profile.priorities),
    avoid: text(profile.avoid, 600),
    trainingPreferences: text(profile.trainingPreferences, 1000),
    exercisePreference: text(profile.exercisePreference, 200),
    effortStyle: text(profile.effortStyle, 200),
    followUpAnswers: (Array.isArray(profile.followUpAnswers) ? profile.followUpAnswers : []).slice(0, 8).map(item => ({ question: text(item?.question, 160), answer: text(item?.answer, 600) })).filter(item => item.question || item.answer)
  };
}

function validProgram(program) {
  return Boolean(program && typeof program === 'object' && Array.isArray(program.days) && program.days.length >= 1 && program.days.length <= 7 && program.days.every(day => Array.isArray(day.exercises) && day.exercises.length >= 1 && day.exercises.length <= 8));
}
function cleanProgram(program) {
  return {
    id: text(program.id, 120), name: text(program.name, 200), goal: text(program.goal, 120), source: text(program.source, 80),
    days: program.days.map(day => ({ id: text(day.id, 120), weekday: text(day.weekday, 20), location: text(day.location, 80), name: text(day.name, 200), estimatedMinutes: Number(day.estimatedMinutes) || null, exercises: day.exercises.map(exercise => ({ id: text(exercise.id, 120), exerciseId: text(exercise.exerciseId, 160), sets: Array.isArray(exercise.sets) ? exercise.sets.length : Number(exercise.sets) || null, repMin: Number(exercise.repMin ?? exercise.repRange?.[0]) || null, repMax: Number(exercise.repMax ?? exercise.repRange?.[1]) || null, targetRir: Number.isFinite(Number(exercise.targetRir)) ? Number(exercise.targetRir) : null, restSeconds: Number(exercise.restSeconds) || null })) }))
  };
}

export function normalizeExpertFeedback(input, metadata = {}) {
  if (!input || !['good', 'needs_improvement'].includes(input.verdict)) throw new Error('Choose whether the plan is good or needs improvement.');
  if (!validProgram(input.candidateProgram)) throw new Error('The candidate plan is missing or invalid.');
  const issue = input.verdict === 'needs_improvement' ? text(input.issue, 80) : null;
  if (input.verdict === 'needs_improvement' && !issueIds.has(issue)) throw new Error('Choose an improvement category.');
  const explanation = text(input.explanation, 1600);
  if (issue === 'other' && explanation.length < 3) throw new Error('Explain what should be improved.');
  if (input.correctedProgram && !validProgram(input.correctedProgram)) throw new Error('The corrected plan is invalid.');
  return {
    schemaVersion: 1,
    id: text(metadata.id, 120),
    createdAt: text(metadata.createdAt, 80),
    status: 'pending',
    verdict: input.verdict,
    issue,
    selectedDayId: input.verdict === 'needs_improvement' ? text(input.selectedDayId, 120) || null : null,
    selectedExerciseIds: input.verdict === 'needs_improvement' ? cleanIds(input.selectedExerciseIds) : [],
    explanation: input.verdict === 'needs_improvement' ? explanation : '',
    profile: expertProfileSnapshot(input.profile),
    candidateProgram: cleanProgram(input.candidateProgram),
    correctedProgram: input.correctedProgram ? cleanProgram(input.correctedProgram) : null
  };
}

const exerciseOutline = exercise => ({ exerciseId: exercise.exerciseId, sets: Array.isArray(exercise.sets) ? exercise.sets.length : exercise.sets, repMin: exercise.repMin, repMax: exercise.repMax, targetRir: exercise.targetRir, restSeconds: exercise.restSeconds });
const programOutline = program => ({ name: text(program?.name, 160), days: (program?.days || []).map(day => ({ weekday: day.weekday, name: text(day.name, 160), exercises: (day.exercises || []).map(exerciseOutline) })) });
const normalizedText = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const entryScore = (entry, profile) => Number(entry.profile?.goal === profile.goal) * 4 + Number(entry.profile?.experience === profile.experience) * 2 + Number(Number(entry.profile?.daysPerWeek) === Number(profile.daysPerWeek)) * 3 + Number(entry.profile?.environment === profile.environment);
const rankedEntries = (entries, profile = {}) => (Array.isArray(entries) ? entries : []).filter(entry => entry?.candidateProgram && ['good', 'needs_improvement'].includes(entry.verdict)).map((entry, index) => ({ entry, index, score: entryScore(entry, profile) })).sort((a, b) => b.score - a.score || b.index - a.index);
const candidateSignature = program => (program?.days || []).map(day => `${day.name}:${(day.exercises || []).map(exercise => exercise.exerciseId).join(',')}`).join('|');

export function expertPolicyForProfile(entries, profile = {}, catalog = []) {
  const relevant = rankedEntries(entries, profile).slice(0, 12).map(item => item.entry).filter(entry => entry.verdict === 'needs_improvement' && entry.explanation);
  const instructions = [...new Set(relevant.map(entry => text(entry.explanation, 1600)).filter(Boolean))]; const combined = normalizedText(instructions.join(' '));
  const forbiddenExerciseIds = [];
  for (const item of catalog || []) {
    const names = [item.name, ...(item.aliases || [])].map(normalizedText).filter(Boolean);
    if (names.some(name => { const index = combined.indexOf(name); const nearby = index < 0 ? '' : combined.slice(Math.max(0, index - 55), index + name.length); return [`never include ${name}`, `never use ${name}`, `do not include ${name}`, `dont include ${name}`, `instead of ${name}`].some(phrase => combined.includes(phrase)) || /never include|never use|do not include|dont include/.test(nearby); })) forbiddenExerciseIds.push(item.id);
  }
  const setMatches = [...combined.matchAll(/(?:more than|max(?:imum)?(?: of)?|over)\s*(\d+)\s*sets?/g)].map(match => Number(match[1])).filter(value => value >= 1 && value <= 6);
  const repMatches = [...combined.matchAll(/(\d+)\s+(?:to\s+)?(\d+)\s*rep(?:s| range)?/g)].map(match => ({ min: Number(match[1]), max: Number(match[2]), context: combined.slice(Math.max(0, match.index - 45), match.index + match[0].length + 70), nearby: combined.slice(Math.max(0, match.index - 35), match.index + match[0].length + 20) }));
  const generalRep = repMatches.find(match => /every exercise|each exercise|keep.*mind|remember/.test(match.context)) || null;
  const calfDirect = combined.match(/(?:calf|calves).{0,55}?(\d+)\s+(?:to\s+)?(\d+)/); const calfRep = calfDirect ? { min: Number(calfDirect[1]), max: Number(calfDirect[2]) } : repMatches.find(match => /calf|calves/.test(match.nearby)) || null;
  const preferredCoreIds = (catalog || []).filter(item => item.pattern === 'core' && ((/hanging leg raise/.test(combined) && /hanging leg raise/.test(normalizedText(item.name))) || (/crunch/.test(combined) && /crunch/.test(normalizedText(item.name))))).map(item => item.id);
  return {
    instructions,
    forbiddenExerciseIds: [...new Set(forbiddenExerciseIds)],
    maxSetsPerExercise: setMatches.length ? Math.min(...setMatches) : null,
    defaultRepRange: generalRep ? [generalRep.min, generalRep.max] : null,
    repRangeExceptions: calfRep ? { calf: [calfRep.min, calfRep.max] } : {},
    requireCompleteUpperInUpperLower: /upper lower/.test(combined) && /every upper|each upper/.test(combined) && /every(?: upper body)? muscle|all(?: upper body)? muscle/.test(combined),
    avoidConsecutiveMuscleGroups: /never back to back|never include two consecutive|no consecutive/.test(combined),
    consecutiveBackAllowed: /except(?: for)?(?: maybe)? back/.test(combined),
    coreAtEndOfLower: /abs.*lower|core.*lower/.test(combined) && /end/.test(combined),
    maxCoreExercisesPerWeek: /(?:only|at most)\s*(?:two|2)\s*(?:exercises?)?.*(?:week).*abs|(?:abs).*(?:only|at most)\s*(?:two|2)\s*(?:exercises?)?.*(?:week)/.test(combined) ? 2 : null,
    preferredCoreIds,
    requirePreferredCore: /use exercises i told you for abs|instead of plank/.test(combined)
  };
}

export function recentExpertCandidateSignatures(entries, limit = 8) {
  return [...(Array.isArray(entries) ? entries : [])].reverse().map(entry => candidateSignature(entry?.candidateProgram)).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).slice(0, limit);
}

function stableHash(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function allowedEquipment(item, profile = {}, location = null) {
  if (location === 'Commercial gym' || profile.environment === 'Commercial gym') return true;
  const available = new Set(['bodyweight']); const selected = new Set(profile.equipment || []);
  if (selected.has('barbell/rack/bench')) ['barbell', 'rack', 'bench'].forEach(value => available.add(value));
  for (const value of ['dumbbells', 'cables', 'machines', 'pull-up bar', 'resistance bands']) if (selected.has(value)) available.add(value);
  return (item.equipment || []).every(value => available.has(value));
}
function muscleGroup(item) {
  if (['horizontal-push', 'incline-push'].includes(item?.pattern)) return 'chest'; if (['vertical-push', 'shoulder-isolation'].includes(item?.pattern)) return 'shoulders';
  if (['horizontal-pull', 'vertical-pull'].includes(item?.pattern)) return 'back'; if (item?.pattern === 'elbow-flexion') return 'biceps'; if (item?.pattern === 'elbow-extension') return 'triceps';
  if (['squat', 'single-leg'].includes(item?.pattern)) return 'quads'; if (['hinge', 'knee-flexion'].includes(item?.pattern)) return 'hamstrings'; if (item?.pattern === 'hip-extension') return 'glutes'; return item?.pattern || null;
}
function rawExercise(item, policy) {
  const timed = item.measure === 'seconds'; const exception = policy.repRangeExceptions?.[item.pattern]; const range = timed ? item.durationRange : exception || policy.defaultRepRange || [8, 10];
  return { exerciseId: item.id, sets: Math.min(policy.maxSetsPerExercise || 3, 3), repMin: range[0], repMax: range[1], targetRir: timed ? 0 : 2, restSeconds: Number(item.restSeconds) || (item.kind === 'compound' ? 120 : 60) };
}
function rawSessionMinutes(day, byId) {
  const exercises = day.exercises || []; const exerciseMinutes = exercises.reduce((sum, exercise) => { const sets = Number(exercise.sets) || 1; const work = sets * 45; const rest = Math.max(0, sets - 1) * (Number(exercise.restSeconds) || 90); return sum + Math.max(3, Math.ceil((work + rest) / 60 + (byId.get(exercise.exerciseId)?.kind === 'compound' ? 3 : 1))); }, 0);
  return exercises.length ? 5 + Math.max(0, exercises.length - 1) * 2 + exerciseMinutes : 0;
}
function fitRawDayToDuration(day, byId, minutes, preserveUpperCoverage, preserveCore) {
  const limit = Number(minutes) + 5; if (!Number.isFinite(limit)) return;
  while (rawSessionMinutes(day, byId) > limit) { const reducible = [...day.exercises].reverse().find(exercise => Number(exercise.sets) > 2); if (!reducible) break; reducible.sets -= 1; }
  while (rawSessionMinutes(day, byId) > limit && day.exercises.length > 2) {
    const counts = day.exercises.reduce((map, exercise) => { const group = muscleGroup(byId.get(exercise.exerciseId)); map.set(group, (map.get(group) || 0) + 1); return map; }, new Map());
    let index = -1; for (let cursor = day.exercises.length - 1; cursor >= 0; cursor--) { const group = muscleGroup(byId.get(day.exercises[cursor].exerciseId)); const requiredUpper = preserveUpperCoverage && ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(group) && counts.get(group) <= 1; const requiredCore = preserveCore && group === 'core' && counts.get(group) <= 1; if (!requiredUpper && !requiredCore) { index = cursor; break; } }
    if (index < 0) break; day.exercises.splice(index, 1);
  }
  while (rawSessionMinutes(day, byId) > limit) { const reducible = [...day.exercises].reverse().find(exercise => Number(exercise.sets) > 1); if (!reducible) break; reducible.sets -= 1; }
  day.estimatedMinutes = rawSessionMinutes(day, byId);
}
export function applyExpertPolicyToPlan(raw, policy = {}, catalog = [], profile = {}, variationSeed = '') {
  const plan = structuredClone(raw); const byId = new Map((catalog || []).map(item => [item.id, item])); const forbidden = new Set(policy.forbiddenExerciseIds || []);
  const candidates = (patterns, day, salt) => (catalog || []).filter(item => patterns.includes(item.pattern) && !forbidden.has(item.id) && allowedEquipment(item, profile, day.location) && !day.exercises.some(exercise => exercise.exerciseId === item.id)).sort((a, b) => stableHash(`${variationSeed}:${day.weekday}:${salt}:${a.id}`) - stableHash(`${variationSeed}:${day.weekday}:${salt}:${b.id}`));
  for (const day of plan.days || []) {
    day.exercises = (day.exercises || []).filter(exercise => byId.has(exercise.exerciseId) && !forbidden.has(exercise.exerciseId));
    for (const exercise of day.exercises) {
      const item = byId.get(exercise.exerciseId); const timed = item.measure === 'seconds'; const range = timed ? item.durationRange : policy.repRangeExceptions?.[item.pattern] || policy.defaultRepRange;
      if (policy.maxSetsPerExercise) exercise.sets = Math.min(Number(exercise.sets) || 1, policy.maxSetsPerExercise);
      if (range) { exercise.repMin = range[0]; exercise.repMax = range[1]; }
      if (timed) exercise.targetRir = 0;
    }
  }
  if (variationSeed) for (const day of plan.days || []) {
    for (let index = 0; index < day.exercises.length; index++) {
      const current = day.exercises[index]; const source = byId.get(current.exerciseId); if (!source || stableHash(`${variationSeed}:${day.weekday}:${index}`) % 100 >= 45) continue;
      let options = candidates([source.pattern], day, `variation-${index}`).filter(item => item.kind === source.kind && Boolean(item.bodyweight) === Boolean(source.bodyweight)); if (source.pattern === 'core' && policy.preferredCoreIds?.length) options = options.filter(item => policy.preferredCoreIds.includes(item.id)); const replacement = options[0]; if (!replacement) continue;
      day.exercises[index] = { ...current, ...rawExercise(replacement, policy), sets: Math.min(Number(current.sets) || 1, policy.maxSetsPerExercise || 6) };
    }
  }
  const upperDays = (plan.days || []).filter(day => /\bupper\b/i.test(day.name)); const lowerDays = (plan.days || []).filter(day => /\blower\b|\blegs?\b/i.test(day.name)); const upperLower = upperDays.length && lowerDays.length;
  if (upperLower && policy.requireCompleteUpperInUpperLower) {
    const requirements = [['chest', ['horizontal-push', 'incline-push']], ['back', ['horizontal-pull', 'vertical-pull']], ['shoulders', ['vertical-push', 'shoulder-isolation']], ['biceps', ['elbow-flexion']], ['triceps', ['elbow-extension']]];
    for (const day of upperDays) for (const [group, patterns] of requirements) if (!day.exercises.some(exercise => muscleGroup(byId.get(exercise.exerciseId)) === group) && day.exercises.length < 8) { const item = candidates(patterns, day, group)[0]; if (item) day.exercises.push(rawExercise(item, policy)); }
  }
  if (upperLower && policy.coreAtEndOfLower && lowerDays.length) {
    for (const day of plan.days) day.exercises = day.exercises.filter(exercise => byId.get(exercise.exerciseId)?.pattern !== 'core');
    const target = Math.min(policy.maxCoreExercisesPerWeek || lowerDays.length, lowerDays.length); const preferred = policy.preferredCoreIds?.length ? new Set(policy.preferredCoreIds) : null;
    const usedCore = new Set();
    for (let index = 0; index < target; index++) { const day = lowerDays[index % lowerDays.length]; const options = candidates(['core'], day, `core-${index}`).filter(item => (!preferred || preferred.has(item.id)) && !usedCore.has(item.id)); const item = options[0] || (!policy.requirePreferredCore ? candidates(['core'], day, `core-any-${index}`).find(value => !usedCore.has(value.id)) : null); if (item && day.exercises.length < 8) { day.exercises.push(rawExercise(item, policy)); usedCore.add(item.id); } }
  }
  for (const day of plan.days || []) fitRawDayToDuration(day, byId, profile.sessionMinutes, upperLower && policy.requireCompleteUpperInUpperLower && upperDays.includes(day), upperLower && policy.coreAtEndOfLower && lowerDays.includes(day));
  if (policy.avoidConsecutiveMuscleGroups) for (const day of plan.days || []) {
    const remaining = [...day.exercises]; const ordered = [];
    while (remaining.length) { const previous = muscleGroup(byId.get(ordered.at(-1)?.exerciseId)); let index = remaining.findIndex(exercise => { const group = muscleGroup(byId.get(exercise.exerciseId)); return !previous || group !== previous || group === 'back' && policy.consecutiveBackAllowed; }); if (index < 0) index = 0; ordered.push(remaining.splice(index, 1)[0]); }
    day.exercises = ordered;
  }
  return plan;
}

export function expertExamplesForProfile(entries, profile = {}, limit = 6) {
  return rankedEntries(entries, profile).slice(0, Math.max(0, limit)).map(({ entry }) => {
    const selectedDay = entry.candidateProgram.days.find(day => day.id === entry.selectedDayId);
    const selected = selectedDay ? { weekday: selectedDay.weekday, name: selectedDay.name, exercises: selectedDay.exercises.filter(exercise => !entry.selectedExerciseIds?.length || entry.selectedExerciseIds.includes(exercise.id)).map(exerciseOutline) } : null;
    return { verdict: entry.verdict, issue: entry.issue, expertInstruction: entry.explanation || null, reviewScope: selected ? 'selected_part' : 'whole_program', reviewedSelection: selected, candidate: entry.verdict === 'good' ? programOutline(entry.candidateProgram) : null, defectiveCandidateSignature: entry.verdict === 'needs_improvement' ? candidateSignature(entry.candidateProgram) : null, correctionExample: entry.correctedProgram && !entry.explanation ? programOutline(entry.correctedProgram) : null };
  });
}
