import { describe, it, expect, vi } from 'vitest';
import { parseCustomWeeklyStructure, customFocusSatisfied, customFocusGroups } from './customTrainingStructure.js';
import { customSplitSequence, resolveOtherWeeklyStructure } from './splitPreferences.js';
import { localTrainingSafetyResolution, trainingSafetyBlocks } from './trainingSafety.js';
import { blankState, buildProgram, customSplitIsValid, exerciseCatalog, sessionStructureKey, serializeState, deserializeState, validateProgram } from './domain.js';

const profile = (text, days) => ({ ...blankState().profile, goal: 'Build muscle', experience: 'Beginner', trainingSplitChoice: 'other', trainingPreferences: text,
  daysPerWeek: days, availableDays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], equipment: ['full gym'], environment: 'Commercial gym', sessionMinutes: 60 });
const corpus = [
  ['Push / Pull / Legs / Upper / Lower', ['push','pull','legs','upper','lower']],
  ['Push / Pull / Legs / Chest Back / Shoulders Arms', ['push','pull','legs','chest-back','shoulders-arms']],
  ['Chest + triceps / Back + biceps / Legs / Shoulders / Full body', ['chest-triceps','back-biceps','legs','shoulders','full-body']],
  ['Back+biceps, Chest+triceps, Legs, Upper, Full body', ['back-biceps','chest-triceps','legs','upper','full-body']],
  ['Chest Back / Shoulders Arms / Legs', ['chest-back','shoulders-arms','legs']],
  ['  cHeSt & bAcK , SHOULDERS and ARMS , LeGs  ', ['chest-back','shoulders-arms','legs']],
  ['Quads + Hamstrings / Chest & Core / Back and biceps', ['quads-hamstrings','chest-core','back-biceps']],
  ['Glutes + Hamstrings\nChest + triceps\nBack + biceps\nQuads + abs', ['glutes-hamstrings','chest-triceps','back-biceps','quads-core']],
  ['1. Upper\n2. Lower\n3. Upper\n4. Lower', ['upper','lower','upper','lower']],
  ['• Chest and back\n• Shoulders + arms\n• Legs', ['chest-back','shoulders-arms','legs']],
  ['Day 1: Push\nDay 2: Pull\nDay 3: Legs', ['push','pull','legs']],
  ['Thursday: Upper, Monday: Lower', ['upper','lower']],
  ['Mon: Push Wed: Pull Fri: Legs', ['push','pull','legs']],
  ['Chest / Back / Legs / Shoulders / Arms / Core', ['chest','back','legs','shoulders','arms','core']],
  ['Push / Pull / Legs / Push / Pull / Legs', ['push','pull','legs','push','pull','legs']],
  ['push pull legs push pull', ['push','pull','legs','push','pull']],
  ['upper lower full body', ['upper','lower','full-body']],
  ['Back + core / Chest + biceps / Quads + hamstrings / Shoulders + triceps', ['back-core','chest-biceps','quads-hamstrings','shoulders-triceps']],
];

describe('generic Other structure: complete consumption, boundaries and generator fidelity', () => {
  it.each(corpus)('%s', (text, sequence) => {
    const p = profile(text, sequence.length), before = structuredClone(p);
    const parsed = parseCustomWeeklyStructure(text, sequence.length);
    expect(parsed?.map(day => day.key)).toEqual(sequence);
    expect(customSplitSequence(text)).toEqual(sequence);
    expect(customSplitIsValid(p)).toBe(true);
    const state = blankState(); state.profile = p; state.program = buildProgram(p);
    expect(validateProgram(state.program, p, { requireProgramQuality: true })).toEqual({ valid: true, errors: [] });
    for (const program of [state.program, deserializeState(serializeState(state)).program]) {
      const named = resolveOtherWeeklyStructure(text, sequence.length)?.kind === 'preset';
      expect(program.source).toBe(named ? 'fixed-template' : 'custom-structure');
      expect(program.days.map(sessionStructureKey)).toEqual(sequence);
      expect(program.trainingStructure.scheduledSessionSequence).toEqual(sequence);
      for (const [i, day] of program.days.entries()) {
        if (!named) {
          expect(day.customFocus).toEqual(parsed[i].concepts);
          expect(customFocusSatisfied(parsed[i].concepts, day.exercises.map(e => exerciseCatalog[e.exerciseId]))).toBe(true);
        }
      }
    }
    expect(deserializeState(serializeState(state)).profile.trainingPreferences).toBe(text);
    expect(p).toEqual(before);
  });
  it.each([
    ['Push / Pull / Legs + Arnold split',5], ['Arnold press',3], ['PPL + Arnold',5],
    ['Upper strength / Lower strength / Upper hypertrophy / Lower hypertrophy',4],
    ['Upper / Lower / Upper / Lower',5], ['Push / Pull / Legs / Push / Pull / Legs',5],
    ['Chest Back Shoulders Arms Legs',5], ['Chest / / Back',3], ['Chest / Back /',2],
    ['Chest + / Back / Legs',3], ['Chest? / Back / Legs',3], ['Chest or back / Legs / Upper',3],
    ['Workout A: Chest / Back / Legs',3], ['Mon: Chest / Back / Legs',3], ['Mon: Chest / Mon: Back / Fri: Legs',3],
    ['Shoulders + unicorn / Back / Legs',3], ['',3], ['Push + Pull + Legs',3],
  ])('clarifies %s instead of substituting a default', (text, days) => {
    const p = profile(text, days), before = structuredClone(p);
    expect(customSplitIsValid(p)).toBe(false);
    expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
    expect(p).toEqual(before);
  });
  it('keeps explicit day labels and their source order, not just stripped focus text', () => {
    const p = profile('Thursday: Upper, Monday: Lower',2);
    expect(buildProgram(p).days.map(d => d.weekday)).toEqual(['Thu','Mon']);
    expect(customSplitIsValid({ ...p, availableDays: ['Tue','Fri'] })).toBe(false);
  });
  it('derives compound requirements from the same existing muscle taxonomy', () => {
    expect(customFocusGroups(['quads','hamstrings'])).toEqual([['Quads'],['Hamstrings']]);
    expect(customFocusGroups(['shoulders','arms'])).toEqual([['AnteriorDelts','LateralDelts','RearDelts'],['Biceps'],['Triceps']]);
  });
  it.each(['No jumping','Avoid Leg Press'])('preserves %s and does not replace the focus', avoid => {
    const p = { ...profile('Quads + hamstrings / Chest + core / Back + biceps',3), avoid };
    expect(customSplitIsValid(p)).toBe(true);
    for (const day of buildProgram(p).days) for (const exercise of day.exercises) {
      expect(exerciseCatalog[exercise.exerciseId].pattern).not.toBe('power-lower');
      if (avoid === 'Avoid Leg Press') expect(exercise.exerciseId).not.toBe('leg-press');
    }
  });
  it('rejects a focus that equipment cannot support before generation', () => {
    const p = { ...profile('Push / Pull / Legs',3), equipment: ['bodyweight only'], environment: 'Home gym' };
    expect(customSplitIsValid(p)).toBe(false);
    expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
  });
  it('keeps unresolved restrictions in their own clarification workflow, not a false split error', () => {
    for (const avoid of ['Avoid deep knee flexion','No barbell squats']) {
      const p = { ...profile('Upper / Lower / Full Body',3), avoid };
      const resolution = localTrainingSafetyResolution(avoid,Object.values(exerciseCatalog));
      expect(resolution.status).toBe('needs_semantic_review');
      expect(customSplitIsValid(p)).toBe(true);
      // The UI's semantic-review gateway also blocks unresolved non-medical
      // text; the generator independently blocks compiled blocked statuses.
      if (trainingSafetyBlocks(resolution.safety.status)) expect(() => buildProgram(p)).toThrow();
      expect(customSplitIsValid({ ...p, trainingPreferences:'Upper / Lower / Upper / Lower' })).toBe(false);
    }
  });
  it.each(corpus.filter((_,i) => [1,2,6,8,13].includes(i)))('keeps %s faithful across goal, experience and time budgets', (text, sequence) => {
      for (const experience of ['Beginner','Intermediate','Advanced'])
        for (const goal of ['Build muscle','Get stronger','Athletic performance'])
          for (const sessionMinutes of [30,45,60]) {
            const p = { ...profile(text,sequence.length), experience, goal, sessionMinutes };
            if (!customSplitIsValid(p)) {
              expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
              continue;
            }
            const program = buildProgram(p);
            expect(validateProgram(program,p,{requireProgramQuality:true}).valid).toBe(true);
            expect(program.days.map(sessionStructureKey)).toEqual(sequence);
            for (const day of program.days) expect(customFocusSatisfied(day.customFocus,day.exercises.map(e=>exerciseCatalog[e.exerciseId]))).toBe(true);
          }
  });
  it('does not accept structurally clear but non-executable weeks past the existing volume/quality gate', () => {
    for (const focus of ['Pull','Biceps','Chest + Back']) {
      const p = { ...profile(Array(6).fill(focus).join(' / '),6), experience: 'Intermediate' };
      expect(parseCustomWeeklyStructure(p.trainingPreferences,6)).toHaveLength(6);
      expect(customSplitIsValid(p)).toBe(false);
      expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
    }
  });
  it('reuses only the capability result for equivalent text and invalidates it for changed constraints', () => {
    const p = profile('Chest & triceps / Back + biceps / Legs',3);
    const random = vi.spyOn(Math,'random');
    try {
      expect(customSplitIsValid(p)).toBe(true);
      const calls = random.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      expect(customSplitIsValid({ ...p, trainingPreferences: 'chest and triceps, BACK BICEPS, legs' })).toBe(true);
      expect(random.mock.calls.length).toBe(calls); // no second plan generation
      expect(customSplitIsValid({ ...p, daysPerWeek:4 })).toBe(false);
      expect(customSplitIsValid({ ...p, equipment:['bodyweight only'], environment:'Home gym' })).toBe(false);
      expect(customSplitIsValid({ ...p, sessionMinutes:5 })).toBe(false);
      const program = buildProgram(p);
      expect(program.profileSnapshot.trainingPreferences).toBe(p.trainingPreferences);
    } finally { random.mockRestore(); }
  });
});
