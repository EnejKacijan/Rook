import { describe, expect, it } from 'vitest';
import { BASELINE_TEMPLATE_BY_FREQUENCY, PREFERRED_TEMPLATE_BY_SPLIT, TRAINING_STRUCTURES, onboardingSplitOptions, parseTrainingStylePreference, selectStructuralTemplate } from './splitPreferences.js';

const wording = {
  'upper-lower': 'I enjoy an upper / lower split.',
  'push-pull-legs': 'PPL works best for me.',
  'full-body': 'I prefer full body training.',
  arnold: 'I really like the Arnold split.',
  'push-pull': 'I prefer a two day Push / Pull split.',
  'torso-limbs': 'I prefer Torso / Limbs.',
  'body-part': 'I prefer a body-part split.',
  pplul: 'I prefer PPLUL.'
};

describe('weekly structural-template matrix', () => {
  it('offers only frequency-appropriate onboarding choices plus automatic and custom options', () => {
    expect(onboardingSplitOptions(2).map(option => option.label)).toEqual(['Choose for me', 'Full Body', 'Upper / Lower', 'Push / Pull', 'Other']);
    expect(onboardingSplitOptions(3).map(option => option.label)).toEqual(['Choose for me', 'Full Body', 'Push / Pull / Legs', 'Arnold Split', 'Other']);
    expect(onboardingSplitOptions(4).map(option => option.label)).toEqual(['Choose for me', 'Upper / Lower', 'Push / Pull', 'Torso / Limbs', 'Other']);
    expect(onboardingSplitOptions(5).map(option => option.label)).toEqual(['Choose for me', 'Push / Pull / Legs + Upper / Lower', 'Body-part Split', 'Arnold Split', 'Other']);
    expect(onboardingSplitOptions(6).map(option => option.label)).toEqual(['Choose for me', 'Push / Pull / Legs ×2', 'Arnold Split', 'Upper / Lower ×3', 'Other']);
  });

  it('defines one stable evidence-informed baseline for every supported frequency', () => {
    expect(BASELINE_TEMPLATE_BY_FREQUENCY).toEqual({ 2: 'T2-FB', 3: 'T3-FB', 4: 'T4-UL', 5: 'T5-PPLUL', 6: 'T6-PPL2' });
  });

  it('resolves every recognized split and 2–6 day combination explicitly', () => {
    for (const [split, frequencies] of Object.entries(PREFERRED_TEMPLATE_BY_SPLIT)) {
      expect(Object.keys(frequencies).map(Number)).toEqual([2, 3, 4, 5, 6]);
      for (let days = 2; days <= 6; days++) {
        const selection = selectStructuralTemplate(wording[split], days);
        const preferred = frequencies[days];
        expect(selection.templateId, `${split} / ${days} days`).toBe(preferred || BASELINE_TEMPLATE_BY_FREQUENCY[days]);
        expect(selection.preferenceHonored, `${split} / ${days} days`).toBe(Boolean(preferred));
        expect(selection.fallbackReason, `${split} / ${days} days`).toBe(preferred ? null : 'split-not-viable-at-frequency');
      }
    }
  });

  it('does not let vague comments replace the safe frequency baseline', () => {
    expect(selectStructuralTemplate('I want something fun and effective.', 4)).toMatchObject({ templateId: 'T4-UL', preference: null, preferenceHonored: false });
  });

  it('uses valid equipment-compatible fallbacks for bodyweight-only plans', () => {
    const bodyweight = { environment: 'Home gym', equipment: ['bodyweight only'], trainingPreferences: '' };
    expect(selectStructuralTemplate(bodyweight, 5)).toMatchObject({ templateId: 'T5-UL', preference: null, fallbackReason: 'split-needs-pull-equipment' });
    expect(selectStructuralTemplate({ ...bodyweight, trainingPreferences: 'PPL' }, 6)).toMatchObject({ templateId: 'T6-UL3', preferenceHonored: false, fallbackReason: 'split-needs-pull-equipment' });
    expect(selectStructuralTemplate({ ...bodyweight, trainingPreferences: 'Full Body' }, 5)).toMatchObject({ templateId: 'T5-UL', preferenceHonored: false, fallbackReason: 'bodyweight-high-frequency-volume' });
    expect(selectStructuralTemplate({ ...bodyweight, trainingPreferences: 'Upper / Lower' }, 6)).toMatchObject({ templateId: 'T6-UL3', preferenceHonored: true, fallbackReason: null });
  });

  it('uses ordered collision rules and keeps structure separate from programming style', () => {
    expect(parseTrainingStylePreference('I like the Arnold press.', 4).structure).toBeNull();
    expect(parseTrainingStylePreference('PPL with DUP', 6)).toMatchObject({ structure: { id: 'push-pull-legs' }, periodization: 'daily-undulating-periodization', fidelity: 'inspired' });
    expect(parseTrainingStylePreference('PPLUL with a powerbuilding emphasis', 5)).toMatchObject({ structure: { id: 'pplul' }, styleOverlays: ['powerbuilding'], fidelity: 'inspired' });
    expect(parseTrainingStylePreference('I do HIIT on rest days', 3)).toMatchObject({ structure: null, styleOverlays: [], reasonCodes: ['hiit-not-hit'] });
    expect(parseTrainingStylePreference('StrongLifts 5x5', 3)).toMatchObject({ structure: { id: 'full-body' }, progression: 'stronglifts-5x5', fidelity: 'inspired' });
  });

  it('exposes structure, sequence, frequency, flexibility and recovery as separate metadata', () => {
    expect(TRAINING_STRUCTURES['upper-lower']).toMatchObject({
      structureFamily: 'upper-lower',
      canonicalSessionSequence: ['upper', 'lower'],
      canonicalFrequencies: [2, 4],
      schedulingFlexibility: 'calendar-flexible'
    });
    expect(TRAINING_STRUCTURES['upper-lower'].recoveryRelationships.length).toBeGreaterThan(0);
  });

  it('maps aliases to one family and preserves an explicit hybrid order', () => {
    for (const value of ['PPL', 'Push Pull Legs', 'Push/Pull/Legs'])
      expect(parseTrainingStylePreference(value, 3).structure.structureFamily).toBe('push-pull-legs');
    for (const value of ['PPLUL', 'PPL + UL', 'PPL / Upper Lower'])
      expect(parseTrainingStylePreference(value, 5).structure.structureFamily).toBe('ppl-upper-lower-hybrid');
    expect(selectStructuralTemplate('Upper Lower Push Pull Legs', 5)).toMatchObject({
      templateId: 'T5-ULPPL',
      structuralFamily: 'ppl-upper-lower-hybrid',
      userRequestedSequence: ['upper', 'lower', 'push', 'pull', 'legs']
    });
    expect(selectStructuralTemplate('Push Pull Legs Upper Lower', 5)).toMatchObject({
      templateId: 'T5-PPLUL',
      userRequestedSequence: ['push', 'pull', 'legs', 'upper', 'lower']
    });
  });

  it('reports incompatible frequencies and keeps named-program claims inspired', () => {
    expect(selectStructuralTemplate('PPL', 2)).toMatchObject({
      fidelity: 'incompatible',
      fallbackReason: 'split-not-viable-at-frequency'
    });
    expect(parseTrainingStylePreference('StrongLifts 5x5', 3)).toMatchObject({
      fidelity: 'inspired',
      progression: 'stronglifts-5x5',
      reasonCodes: expect.arrayContaining(['method-layer-ai-guidance-only'])
    });
  });
});
