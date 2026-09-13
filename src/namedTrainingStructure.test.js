import { describe, it, expect } from 'vitest';
import { TRAINING_STRUCTURES, PREFERRED_TEMPLATE_BY_SPLIT, onboardingSplitOptions, namedTrainingStructure,
  resolveOtherWeeklyStructure, selectStructuralTemplate } from './splitPreferences.js';
import { blankState, buildProgram, customSplitIsValid, sessionStructureKey, serializeState, deserializeState, exerciseCatalog } from './domain.js';
import { compileTrainingSafety } from './trainingSafety.js';

const profile = (trainingPreferences, daysPerWeek) => ({ ...blankState().profile,
  trainingPreferences, trainingSplitChoice: 'other', daysPerWeek,
  goal: 'Build muscle', experience: 'Beginner', sessionMinutes: 60,
  environment: 'Commercial gym', equipment: ['full gym'], availableDays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] });
const visible = [2,3,4,5,6].flatMap(days => onboardingSplitOptions(days)
  .filter(option => TRAINING_STRUCTURES[option.id]).map(option => ({ ...option, days })));
const semantics = program => program.days.map(day => ({ name: day.name, key: sessionStructureKey(day),
  exercises: day.exercises.map(exercise => ({ id: exercise.exerciseId, sets: exercise.sets.map(set => ({
    reps: set.reps, repMin: set.repMin, repMax: set.repMax, targetRir: set.targetRir, weight: set.weight,
  })) })) }));

describe('one canonical weekly-structure registry for presets and Other', () => {
  it.each(visible)('$days days: $label uses the exact preset, including curated exercises', ({ label, value, id, days }) => {
    const expected = selectStructuralTemplate({ ...profile(value, days), trainingSplitChoice: 'predefined' }, days);
    const preset = buildProgram({ ...profile(value, days), trainingSplitChoice: 'predefined' });
    for (const text of new Set([label, value])) {
      const p = profile(text, days), before = structuredClone(p);
      expect(namedTrainingStructure(text)?.id).toBe(id);
      expect(resolveOtherWeeklyStructure(text, days)).toEqual({ kind: 'preset', id });
      const selected = selectStructuralTemplate(p, days);
      for (const key of ['templateId','preference','fidelity','preferenceHonored','canonicalSessionSequence'])
        expect(selected[key]).toEqual(expected[key]);
      expect(customSplitIsValid(p)).toBe(true);
      const state = blankState(); state.profile = p; state.program = buildProgram(p);
      expect(semantics(state.program)).toEqual(semantics(preset));
      const restored = deserializeState(serializeState(state));
      expect(semantics(restored.program)).toEqual(semantics(preset));
      expect(restored.profile.trainingPreferences).toBe(text);
      expect(p).toEqual(before);
    }
  });
  it('resolves every registered alias through the same preset mapping, without default substitution', () => {
    for (const [id, definition] of Object.entries(TRAINING_STRUCTURES)) {
      for (const alias of [definition.label, definition.presetValue, ...definition.aliases]) for (const days of [2,3,4,5,6]) {
        const p = profile(`  ${alias.toUpperCase()}  `, days);
        expect(namedTrainingStructure(p.trainingPreferences)?.id).toBe(id);
        const template = PREFERRED_TEMPLATE_BY_SPLIT[id][days];
        if (template) expect(selectStructuralTemplate(p, days)).toMatchObject({ templateId: template, preference: { id }, fallbackReason: null });
        else expect(() => selectStructuralTemplate(p, days)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
      }
    }
  });
  it('keeps explicit multiplier labels tied to their actual day count', () => {
    for (const text of ['Upper / Lower ×3', 'Push / Pull / Legs ×2']) {
      expect(resolveOtherWeeklyStructure(text, 6)?.kind).toBe('preset');
      expect(resolveOtherWeeklyStructure(text, 4)).toBeNull();
    }
  });
  it('documents the existing five-day Arnold hybrid, not a newly invented PPL blend', () => {
    expect(buildProgram(profile('Arnold Split',5)).days.map(day => day.name)).toEqual([
      'Chest & Back A', 'Legs', 'Shoulders & Arms', 'Chest & Back B', 'Full Body',
    ]);
    expect(TRAINING_STRUCTURES.arnold.canonicalSessionSequence).toEqual(['chest-back','shoulders-arms','legs']);
    const text = 'Push / Pull / Legs + Arnold Split';
    expect(resolveOtherWeeklyStructure(text,5)).toBeNull();
    expect(customSplitIsValid(profile(text,5))).toBe(false);
    expect(resolveOtherWeeklyStructure(text,6)?.sessions.map(s => s.key)).toEqual([
      'push','pull','legs','chest-back','shoulders-arms','legs',
    ]);
  });
  it.each([
    ['Chest + Back + Upper / Lower',3,['chest-back','upper','lower']],
    ['Upper / Lower + Chest + Back',3,['upper','lower','chest-back']],
    ['Push / Pull / Legs + Arnold Split',6,['push','pull','legs','chest-back','shoulders-arms','legs']],
    ['PPL + Upper / Lower',5,['push','pull','legs','upper','lower']],
    ['Arnold + Full body',4,['chest-back','shoulders-arms','legs','full-body']],
  ])('composes complete components in source order only: %s', (text, days, sequence) => {
    expect(resolveOtherWeeklyStructure(text,days)?.sessions.map(s => s.key)).toEqual(sequence);
    // Syntax and executability remain separate: existing safety/volume limits
    // may legitimately block a structurally clear week, never substitute one.
    const p = profile(text,days);
    if (customSplitIsValid(p)) expect(buildProgram(p).days.map(sessionStructureKey)).toEqual(sequence);
    else expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
  });
  it.each([
    ['Full Body + Chest + Back + Full Body',3], // multiple three-day parses
    ['Arnold Split + mystery',4], ['Push + Pull + Legs',3],
    ['PPL + Arnold',5], ['Arnold press',3], ['Upper / Lower ×3',4],
    ['Chest / Back / Legs / Shoulders',5], ['PPL +',3], ['PPL + DUP',3],
  ])('clarifies %s without partial keyword acceptance or a default', (text, days) => {
    expect(resolveOtherWeeklyStructure(text,days)).toBeNull();
    expect(customSplitIsValid(profile(text,days))).toBe(false);
    expect(() => buildProgram(profile(text,days))).toThrowError(expect.objectContaining({ code: 'custom-split-conflict' }));
  });
  it('does not replace an explicit named split with an equipment fallback', () => {
    expect(() => selectStructuralTemplate({ ...profile('Arnold Split',5), environment:'Home gym', equipment:['bodyweight only'] },5))
      .toThrowError(expect.objectContaining({ code:'custom-split-conflict' }));
  });
  it('keys live capability validation by named template as well as explicit sessions', () => {
    const p = { ...profile('Full Body',5), environment:'Home gym', equipment:['bodyweight only'] };
    expect(customSplitIsValid(p)).toBe(false);
    expect(customSplitIsValid({ ...p, trainingPreferences:'Upper / Lower' })).toBe(true);
    expect(customSplitIsValid({ ...p, trainingPreferences:'Arnold Split' })).toBe(false);
  });
  it('does not silently replace a named Other week with a clinician-scoped fallback', () => {
    const avoid = 'Post-op knee; surgeon cleared upper-body strength training only';
    const safety = compileTrainingSafety(avoid,Object.values(exerciseCatalog));
    const p = { ...profile('Arnold Split',4), avoid, trainingSafetyConfirmedHash:safety.constraintHash };
    expect(customSplitIsValid(p)).toBe(false);
    expect(() => buildProgram(p)).toThrowError(expect.objectContaining({ code:'custom-split-conflict' }));
  });
  it('preserves long explicit compound sequences without invoking compositional search', () => {
    const text = Array(6).fill('Chest + Back + Shoulders + Arms').join(' / ');
    const resolution = resolveOtherWeeklyStructure(text,6);
    expect(resolution.sessions).toHaveLength(6);
    expect(resolution.sessions.every(s=>s.key==='chest-back-shoulders-arms')).toBe(true);
  });
});
