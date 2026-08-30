import { describe, expect, it } from 'vitest';
import { applyExpertPolicyToPlan, expertExamplesForProfile, expertPolicyForProfile, expertProfileSnapshot, normalizeExpertFeedback, recentExpertCandidateSignatures } from './expertFeedback.js';
import { exerciseCatalog } from './domain.js';

const program = (id = 'plan-1') => ({ id, name: 'Upper / Lower', profileSnapshot: { name: 'Private name' }, days: [{ id: 'day-1', weekday: 'Mon', name: 'Upper', exercises: [{ id: 'exercise-1', exerciseId: 'barbell-bench-press', sets: [{}, {}], repMin: 6, repMax: 8, targetRir: 1, restSeconds: 150 }, { id: 'exercise-2', exerciseId: 'barbell-row', sets: [{}, {}], repMin: 8, repMax: 10, targetRir: 2, restSeconds: 120 }] }] });
const profile = { id: 'private-id', name: 'Private name', goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Chest'], followUpAnswers: [{ question: 'Preferred split?', answer: 'Upper lower' }] };

describe('expert feedback dataset', () => {
  it('stores programming context without user identity or workout history', () => {
    const snapshot = expertProfileSnapshot({ ...profile, workouts: [{ secret: true }] });
    expect(snapshot).toMatchObject({ goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4 });
    expect(snapshot).not.toHaveProperty('id'); expect(snapshot).not.toHaveProperty('name'); expect(snapshot).not.toHaveProperty('workouts');
  });

  it('normalizes a precise negative review and keeps an optional correction', () => {
    const feedback = normalizeExpertFeedback({ verdict: 'needs_improvement', issue: 'redundant_exercises', selectedDayId: 'day-1', selectedExerciseIds: ['exercise-1', 'exercise-2', 'exercise-1'], explanation: 'Two interchangeable presses.', profile, candidateProgram: program(), correctedProgram: program('corrected') }, { id: 'expert-1', createdAt: '2026-08-23T12:00:00.000Z' });
    expect(feedback).toMatchObject({ id: 'expert-1', status: 'pending', verdict: 'needs_improvement', issue: 'redundant_exercises', selectedDayId: 'day-1', selectedExerciseIds: ['exercise-1', 'exercise-2'] });
    expect(feedback.correctedProgram.id).toBe('corrected');
    expect(JSON.stringify(feedback)).not.toContain('Private name'); expect(feedback.candidateProgram.days[0].exercises[0].sets).toBe(2);
  });

  it('rejects incomplete custom feedback and turns matching reviews into compact AI examples', () => {
    expect(() => normalizeExpertFeedback({ verdict: 'needs_improvement', issue: 'other', explanation: '', profile, candidateProgram: program() })).toThrow(/Explain/i);
    const entry = normalizeExpertFeedback({ verdict: 'needs_improvement', issue: 'exercise_selection', selectedDayId: 'day-1', selectedExerciseIds: ['exercise-1'], explanation: 'Use a different purpose here.', profile, candidateProgram: program() }, { id: 'expert-1', createdAt: 'now' });
    const examples = expertExamplesForProfile([entry], profile);
    expect(examples[0]).toMatchObject({ verdict: 'needs_improvement', issue: 'exercise_selection', expertInstruction: 'Use a different purpose here.', reviewScope: 'selected_part', reviewedSelection: { weekday: 'Mon', exercises: [{ exerciseId: 'barbell-bench-press', sets: 2 }] } });
    expect(JSON.stringify(examples[0])).not.toContain('Private name');
  });

  it('treats a plan-wide written explanation as the primary instruction and a correction as an example', () => {
    const entry = normalizeExpertFeedback({ verdict: 'needs_improvement', issue: 'volume', explanation: 'Never use more than four sets per exercise.', profile, candidateProgram: program(), correctedProgram: program('corrected') }, { id: 'expert-2', createdAt: 'now' });
    const [example] = expertExamplesForProfile([entry], profile);
    expect(example).toMatchObject({ expertInstruction: 'Never use more than four sets per exercise.', reviewScope: 'whole_program', correctionExample: null });
    expect(example).not.toHaveProperty('preferredCorrection');
  });

  it('distills explicit natural-language rules and enforces them on a generated plan', () => {
    const explanation = 'Never include Dead Bug or Prone W Raise. Never use more than 4 sets. Use 6-10 reps for every exercise, except calves 10-15. In an upper/lower split every upper should include every upper-body muscle group. Abs should be at the end of lower days; use hanging leg raises or crunches, at most two per week. Never include two consecutive exercises for the same muscle except back.';
    const entry = normalizeExpertFeedback({ verdict: 'needs_improvement', issue: 'other', explanation, profile, candidateProgram: program() }, { id: 'expert-policy', createdAt: 'now' });
    const catalog = Object.values(exerciseCatalog); const policy = expertPolicyForProfile([entry], profile, catalog);
    expect(policy).toMatchObject({ maxSetsPerExercise: 4, defaultRepRange: [6, 10], requireCompleteUpperInUpperLower: true, avoidConsecutiveMuscleGroups: true, coreAtEndOfLower: true, maxCoreExercisesPerWeek: 2 });
    expect(policy.forbiddenExerciseIds).toEqual(expect.arrayContaining(['dead-bug', 'prone-w-raise'])); expect(policy.preferredCoreIds).toEqual(expect.arrayContaining(['hanging-leg-raise', 'cable-crunch']));
    const prescription = (exerciseId, sets = 5, repMin = 12, repMax = 15) => ({ exerciseId, sets, repMin, repMax, targetRir: 2, restSeconds: 60 });
    const raw = { name: 'Candidate', days: [{ weekday: 'Mon', name: 'Upper A', exercises: [prescription('barbell-bench-press'), prescription('incline-dumbbell-press'), prescription('dead-bug')] }, { weekday: 'Tue', name: 'Lower A', exercises: [prescription('back-squat'), prescription('leg-curl'), prescription('plank')] }] };
    const fixed = applyExpertPolicyToPlan(raw, policy, catalog, profile, 'variety-a'); const upper = fixed.days[0]; const lower = fixed.days[1]; const all = fixed.days.flatMap(day => day.exercises);
    expect(all.some(exercise => ['dead-bug', 'prone-w-raise', 'plank'].includes(exercise.exerciseId))).toBe(false); expect(all.every(exercise => exercise.sets <= 4)).toBe(true);
    expect(['horizontal-push', 'horizontal-pull', 'vertical-push', 'elbow-flexion', 'elbow-extension'].every(pattern => upper.exercises.some(exercise => exerciseCatalog[exercise.exerciseId].pattern === pattern || pattern === 'vertical-push' && exerciseCatalog[exercise.exerciseId].pattern === 'shoulder-isolation'))).toBe(true);
    expect(exerciseCatalog[lower.exercises.at(-1).exerciseId].pattern).toBe('core'); expect([6, 10]).toEqual([lower.exercises.at(-1).repMin, lower.exercises.at(-1).repMax]); expect(recentExpertCandidateSignatures([entry])).toHaveLength(1);
  });
});
