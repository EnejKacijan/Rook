import { parseCustomWeeklyStructure } from './customTrainingStructure.js';
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const BASELINE_TEMPLATE_BY_FREQUENCY = Object.freeze({ 2: 'T2-FB', 3: 'T3-FB', 4: 'T4-UL', 5: 'T5-PPLUL', 6: 'T6-PPL2' });
const BODYWEIGHT_FALLBACK_BY_FREQUENCY = Object.freeze({ 2: 'T2-FB', 3: 'T3-FB', 4: 'T4-UL', 5: 'T5-UL', 6: 'T6-UL3' });
const DEDICATED_PULL_TEMPLATE = /(?:PPL|(?:^|-)PP(?:$|-)|ARNOLD|(?:^|-)BP(?:$|-))/;

function bodyweightFallbackReason(profileOrText, templateId) {
  if (!profileOrText || typeof profileOrText === 'string' || profileOrText.environment !== 'Home gym') return null;
  const equipment = new Set(profileOrText.equipment || []);
  const hasPullEquipment = ['full gym', 'barbell/rack/bench', 'dumbbells', 'pull-up bar', 'resistance bands'].some(item => equipment.has(item));
  if (!equipment.has('bodyweight only') || hasPullEquipment) return null;
  if (DEDICATED_PULL_TEMPLATE.test(templateId)) return 'split-needs-pull-equipment';
  if (['T5-FB', 'T6-FB'].includes(templateId)) return 'bodyweight-high-frequency-volume';
  return null;
}

const structureDefinition = ({
  family,
  label,
  canonicalSessionSequence,
  canonicalFrequencies,
  compatibility,
  schedulingFlexibility = 'calendar-flexible',
  recoveryRelationships = [],
  presetValue = label,
  presetLabels = {},
  aliases = [],
}) => Object.freeze({
  structureFamily: family,
  label,
  presetValue,
  presetLabels: Object.freeze(presetLabels),
  aliases: Object.freeze(aliases),
  canonicalSessionSequence: Object.freeze(canonicalSessionSequence),
  canonicalFrequencies: Object.freeze(canonicalFrequencies),
  canonicalFrequencyRange: Object.freeze([
    Math.min(...canonicalFrequencies),
    Math.max(...canonicalFrequencies),
  ]),
  compatibility: Object.freeze(compatibility),
  schedulingFlexibility,
  recoveryRelationships: Object.freeze(recoveryRelationships),
});

export const TRAINING_STRUCTURES = Object.freeze({
  'full-body': structureDefinition({ aliases: ['Full body split', 'Whole body', 'Whole body split', 'Total body', 'Total body split', 'Fullbody', 'Fullbody split', 'Wholebody', 'Totalbody'], family: 'full-body', label: 'Full Body', canonicalSessionSequence: ['full-body'], canonicalFrequencies: [2, 3], compatibility: { 2: 'exact', 3: 'exact', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['space repeated full-body exposures when availability permits'] }),
  'upper-lower': structureDefinition({ presetValue: 'Upper / Lower split', presetLabels: { 6: 'Upper / Lower ×3' }, aliases: ['UL', 'UL split', 'Upper Lower', 'Upper Lower split', 'Upper body / Lower body', 'Upper body / Lower body split', 'Upper body Lower body'], family: 'upper-lower', label: 'Upper / Lower', canonicalSessionSequence: ['upper', 'lower'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate upper and lower exposures'] }),
  'push-pull-legs': structureDefinition({ presetLabels: { 6: 'Push / Pull / Legs ×2' }, aliases: ['PPL', 'PPL split', 'Push Pull Legs', 'Push / Pull / Legs split'], family: 'push-pull-legs', label: 'Push / Pull / Legs', canonicalSessionSequence: ['push', 'pull', 'legs'], canonicalFrequencies: [3, 6], compatibility: { 2: 'incompatible', 3: 'exact', 4: 'adapted', 5: 'adapted', 6: 'exact' }, recoveryRelationships: ['preserve push-pull-legs cycle', 'avoid upper overlap when adapted'] }),
  arnold: structureDefinition({ presetValue: 'Arnold split', aliases: ['Arnold', 'Arnold style split', 'Arnold style'], family: 'arnold', label: 'Arnold Split', canonicalSessionSequence: ['chest-back', 'shoulders-arms', 'legs'], canonicalFrequencies: [3, 6], compatibility: { 2: 'inspired', 3: 'exact', 4: 'adapted', 5: 'adapted', 6: 'exact' }, schedulingFlexibility: 'identity-preserving', recoveryRelationships: ['account for shoulder and arm carry-over after chest and back'] }),
  'push-pull': structureDefinition({ presetValue: 'Push / Pull split', aliases: ['Push Pull', 'Push Pull split', 'Push Pull routine', 'Two day Push Pull'], family: 'push-pull', label: 'Push / Pull', canonicalSessionSequence: ['push', 'pull'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate push and pull exposures'] }),
  'torso-limbs': structureDefinition({ presetValue: 'Torso / Limbs split', aliases: ['Torso Limbs', 'Torso Limbs split', 'Torso / Limb', 'Torso Limb', 'Torso Limb split'], family: 'torso-limbs', label: 'Torso / Limbs', canonicalSessionSequence: ['torso', 'limbs'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate torso and limb exposures'] }),
  'body-part': structureDefinition({ presetValue: 'Body-part split', aliases: ['Body part split', 'Bodypart split', 'Bro split', 'One muscle per day', 'Body part', 'Bodypart', 'Bro style split'], family: 'body-part', label: 'Body-part Split', canonicalSessionSequence: ['chest', 'back', 'legs', 'shoulders', 'arms'], canonicalFrequencies: [4, 5, 6], compatibility: { 2: 'inspired', 3: 'adapted', 4: 'exact', 5: 'exact', 6: 'exact' }, schedulingFlexibility: 'identity-preserving', recoveryRelationships: ['account for chest-to-shoulder and back-to-arm carry-over'] }),
  pplul: structureDefinition({ presetLabels: { 5: 'Push / Pull / Legs + Upper / Lower' }, aliases: ['PPLUL', 'PPL + UL', 'PPL UL', 'PPL Upper Lower', 'PPL / Upper Lower', 'Push Pull Legs Upper Lower'], family: 'ppl-upper-lower-hybrid', label: 'Push / Pull / Legs / Upper / Lower', canonicalSessionSequence: ['push', 'pull', 'legs', 'upper', 'lower'], canonicalFrequencies: [5], compatibility: { 2: 'incompatible', 3: 'incompatible', 4: 'incompatible', 5: 'exact', 6: 'incompatible' }, schedulingFlexibility: 'sequence-flexible', recoveryRelationships: ['avoid push or pull immediately before upper where possible', 'avoid legs immediately before lower where possible'] })
});

export const PREFERRED_TEMPLATE_BY_SPLIT = Object.freeze({
  'upper-lower': Object.freeze({ 2: 'T2-UL', 3: 'T3-UL', 4: 'T4-UL', 5: 'T5-UL', 6: 'T6-UL3' }),
  'push-pull-legs': Object.freeze({ 2: null, 3: 'T3-PPL', 4: 'T4-PPL', 5: 'T5-PPLUL', 6: 'T6-PPL2' }),
  'full-body': Object.freeze({ 2: 'T2-FB', 3: 'T3-FB', 4: 'T4-FB', 5: 'T5-FB', 6: 'T6-FB' }),
  arnold: Object.freeze({ 2: 'T2-ARNOLD', 3: 'T3-ARNOLD', 4: 'T4-ARNOLD', 5: 'T5-ARNOLD', 6: 'T6-ARNOLD' }),
  'push-pull': Object.freeze({ 2: 'T2-PP', 3: 'T3-PP', 4: 'T4-PP', 5: 'T5-PP', 6: 'T6-PP' }),
  'torso-limbs': Object.freeze({ 2: 'T2-TL', 3: 'T3-TL', 4: 'T4-TL', 5: 'T5-TL', 6: 'T6-TL' }),
  'body-part': Object.freeze({ 2: 'T2-BP', 3: 'T3-BP', 4: 'T4-BP', 5: 'T5-BP', 6: 'T6-BP' }),
  pplul: Object.freeze({ 2: null, 3: null, 4: null, 5: 'T5-PPLUL', 6: null })
});

// UI availability is only an ordered list of registry IDs. Labels, values and
// aliases belong to the definition used by both preset and Other resolution.
const ONBOARDING_SPLITS_BY_FREQUENCY = Object.freeze({
  2: ['full-body', 'upper-lower', 'push-pull'],
  3: ['full-body', 'push-pull-legs', 'arnold'],
  4: ['upper-lower', 'push-pull', 'torso-limbs'],
  5: ['pplul', 'body-part', 'arnold'],
  6: ['push-pull-legs', 'arnold', 'upper-lower'],
});

export function onboardingSplitOptions(frequency) {
  const days = Math.max(2, Math.min(6, Number(frequency) || 3));
  return [
    { id: 'recommended', label: 'Choose for me', value: '' },
    ...ONBOARDING_SPLITS_BY_FREQUENCY[days].map(id => ({ id,
      label: TRAINING_STRUCTURES[id].presetLabels[days] || TRAINING_STRUCTURES[id].label,
      value: TRAINING_STRUCTURES[id].presetValue,
    })),
    { id: 'other', label: 'Other', value: null }
  ];
}

const STYLE_OVERLAYS = [
  ['powerbuilding', /\bpowerbuilding\b/],
  ['german-volume-training', /\b(?:german volume training|gvt)\b/],
  ['high-intensity-training', /\b(?:high intensity training|hit)\b/]
];
const PROGRESSIONS = [
  ['5-3-1', /\b(?:5\s*3\s*1|531|wendler)\b/], ['starting-strength', /\bstarting strength\b/],
  ['stronglifts-5x5', /\bstronglifts(?:\s*5\s*x\s*5)?\b/], ['gzclp', /\bgzclp\b/], ['gzcl', /\bgzcl\b/],
  ['nsuns', /\bn\s*suns\b/], ['linear-progression', /\blinear progression\b/], ['generic-5x5', /\b5\s*x\s*5\b/]
];
const PERIODIZATION = [
  ['daily-undulating-periodization', /\b(?:daily undulating periodization|dup)\b/],
  ['conjugate', /\b(?:conjugate|westside method)\b/], ['heavy-light-medium', /\b(?:heavy light medium|hlm)\b/]
];
const NAMED_PROGRAMS = [
  ['westside-for-skinny-bastards', /\bwestside for skinny bastards\b/], ['phat', /\bphat\b/], ['phul', /\bphul\b/],
  ['texas-method', /\btexas method\b/], ['madcow', /\bmadcow\b/], ['greyskull-lp', /\bgreyskull(?:\s*lp)?\b/],
  ['ice-cream-fitness', /\bice cream fitness\b/], ['lvysaur-4-4-8', /\blvysaur(?:\s*4\s*4\s*8)?\b/],
  ['greek-god-program', /\bgreek god program\b/], ['kinobody-movie-star', /\bkinobody movie star\b/],
  ['jeff-nippard-essentials', /\bjeff nippard(?: fundamentals| essentials)?\b/],
  ['rp-male-physique', /\b(?:rp|renaissance periodization) male physique\b/]
];

function matchFirst(rules, text) { return rules.find(([, pattern]) => pattern.test(text))?.[0] || null; }
function structure(id) {
  const item = TRAINING_STRUCTURES[id];
  return item ? {
    id,
    structureFamily: item.structureFamily,
    label: item.label,
    canonicalSessionSequence: item.canonicalSessionSequence,
    canonicalFrequencies: item.canonicalFrequencies,
    canonicalFrequencyRange: item.canonicalFrequencyRange,
    schedulingFlexibility: item.schedulingFlexibility,
    recoveryRelationships: item.recoveryRelationships,
  } : null;
}
const sequenceToken = value => value === 'leg' ? 'legs' : value.replace(/\s+/g, '-');
function sessionSequenceTokens(text) {
  return [...text.matchAll(/\b(chest\s+back|shoulders?\s+arms?|full\s+body|upper|lower|push|pull|legs?|torso|limbs?|chest|back|shoulders?|arms?)\b/g)]
    .map(match => sequenceToken(match[1]))
    .map(value => ({ shoulder: 'shoulders', arm: 'arms', limb: 'limbs' })[value] || value);
}
function requestedSequenceFor(structureId, tokens) {
  const canonical = TRAINING_STRUCTURES[structureId]?.canonicalSessionSequence || [];
  if (!canonical.length) return null;
  const relevant = tokens.filter(token => canonical.includes(token));
  return canonical.every(token => relevant.includes(token)) ? relevant : null;
}

// A slash-separated list of session names can describe a complete week, not
// merely a split family. Keep every member (including hybrid Full Body days).
export function explicitSessionSequence(value) {
  const parts = String(value || '').split('/').map(normalize);
  const supported = new Set(Object.values(TRAINING_STRUCTURES).flatMap(item => item.canonicalSessionSequence));
  const sequence = parts.map(sequenceToken);
  return parts.length > 1 && sequence.every(item => supported.has(item)) ? sequence : null;
}

const aliasKey = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().trim().replace(/[\u2010-\u2015-]/g, ' ').replace(/\bx\s*(\d+)$/g, '×$1')
  .replace(/\s*([/+×])\s*/g, '$1').replace(/\s+/g, ' ');

export function namedTrainingStructure(value) {
  const key = aliasKey(value);
  if (!key) return null;
  for (const [id, definition] of Object.entries(TRAINING_STRUCTURES)) {
    if ([definition.label, definition.presetValue, ...definition.aliases].some(alias => aliasKey(alias) === key))
      return { id, definition, frequency: null, repetitions: 1 };
    for (const [frequency, label] of Object.entries(definition.presetLabels)) {
      if (aliasKey(label) === key) return { id, definition,
        frequency: Number(frequency), repetitions: Number(label.match(/×(\d+)$/)?.[1] || 1) };
    }
  }
  return null;
}

function canonicalComponent(named) {
  const sequence = Array.from({ length: named.repetitions }, () => named.definition.canonicalSessionSequence).flat();
  return parseCustomWeeklyStructure(sequence.map(key => key.replace(/-/g, ' ')).join(' / '));
}

// A named WHOLE week selects the existing frequency-specific preset. Inside a
// composition a name denotes its complete canonical cycle (or explicit ×N),
// never a truncated/adapted cycle chosen to fill leftover days. '+' can still
// join muscles in a day, so enumerate those parses and accept only one meaning.
export function resolveOtherWeeklyStructure(value, frequency) {
  const named = namedTrainingStructure(value);
  if (named) return (!named.frequency || named.frequency === frequency) && PREFERRED_TEMPLATE_BY_SPLIT[named.id]?.[frequency]
    ? { kind: 'preset', id: named.id } : null;
  // Preserve the existing complete, explicitly delimited focus grammar. A
  // composition would add day boundaries, so cannot produce this same count.
  const explicit = parseCustomWeeklyStructure(value, frequency);
  if (explicit) return { kind: 'custom', sessions: explicit };
  const parts = String(value || '').split('+').map(part => part.trim());
  // More components than a supported week can express need clarification, not
  // an unbounded combinatorial search on every keystroke.
  if (parts.length > 12 || parts.some(part => !part)) return null;
  const memo = new Map();
  const candidates = (start, end) => {
    const cacheKey = `${start}:${end}`;
    if (memo.has(cacheKey)) return memo.get(cacheKey);
    const text = parts.slice(start, end).join(' + '), matches = new Map();
    const add = (sessions, hasNamed) => {
      if (!sessions?.length || sessions.length > frequency) return;
      const dated = sessions.filter(session => session.weekday);
      if (dated.length && (dated.length !== sessions.length || new Set(dated.map(s => s.weekday)).size !== sessions.length)) return;
      const key = JSON.stringify([sessions.map(s => [s.key, s.weekday]), hasNamed]);
      matches.set(key, { sessions, hasNamed });
    };
    const component = namedTrainingStructure(text);
    if (component) add(canonicalComponent(component), true);
    else add(parseCustomWeeklyStructure(text), false);
    for (let split = start + 1; split < end; split++) {
      for (const left of candidates(start, split)) for (const right of candidates(split, end)) {
        // Ordinary plus-separated focuses are still one session, not days.
        if (left.hasNamed || right.hasNamed) add([...left.sessions, ...right.sessions], true);
      }
    }
    const result = [...matches.values()]; memo.set(cacheKey, result); return result;
  };
  const meanings = new Map(candidates(0, parts.length).filter(c => c.sessions.length === frequency)
    .map(c => [JSON.stringify(c.sessions.map(s => [s.key, s.weekday])), c.sessions]));
  return meanings.size === 1 ? { kind: 'custom', sessions: [...meanings.values()][0] } : null;
}

// Sequence inspection without a frequency uses complete canonical cycles;
// production selection below always requires an exact selected frequency.
export function customSplitSequence(value) {
  const named = namedTrainingStructure(value);
  return (named ? canonicalComponent(named) : parseCustomWeeklyStructure(value))?.map(session => session.key) || null;
}

// Diagnostics never supply an alternative structure. Selection/build remain
// authoritative; this only explains why the retained text needs clarification.
export function otherStructureClarification(value, frequency) {
  const text = String(value || '').trim();
  const named = namedTrainingStructure(text);
  if (named) return { reason: 'frequency', message: `This split has no supported ${frequency}-day version. Enter all ${frequency} workout focuses in order, separated by /.` };
  const explicit = parseCustomWeeklyStructure(text);
  if (explicit && explicit.length !== frequency && !text.includes('+'))
    return { reason: 'frequency', message: `You entered ${explicit.length} workout ${explicit.length === 1 ? 'focus' : 'focuses'} for ${frequency} days. Enter all ${frequency} focuses in order, separated by /.` };
  if (/\b(?:strength|hypertrophy|power|heavy|light)\b|\b(?:upper|lower|body|push|pull|legs)\s+[ab]\b/i.test(text))
    return { reason: 'qualifier', message: 'Per-workout intensity or A/B variants need more detail. Enter the muscle or movement focuses; your overall goal stays separate.' };
  if (/\b(?:anterior|posterior)(?:[ -]+chain)?\b(?!\s+(?:delts?|deltoids?)\b)|\bfront\s*[/&+]\s*back\b/i.test(text))
    return { reason: 'ambiguous-family', message: 'Anterior/posterior splits vary in which muscles they include. Name the muscles or movements for each workout, separated by /.' };
  if (/\b(?:upper|lower|middle)[ -]+(?:back|chest)\b|\b(?:lats?|traps?|trapezius|erectors?|forearms?|carry|carries|rotation|lunges?)\b/i.test(text))
    return { reason: 'unsupported-focus', message: 'This specific focus is not supported by the plan builder yet. Enter supported muscle groups or movement focuses instead.' };
  if (text.includes('+') && text.split('+').some(part => namedTrainingStructure(part)))
    return { reason: 'composition', message: `This combination does not define one clear ${frequency}-day week. Enter all ${frequency} workout focuses explicitly, separated by /.` };
  return { reason: 'unknown-focus', message: `Couldn't recognize every focus or day boundary. Enter ${frequency} muscle or movement focuses in order, separated by /.` };
}

export function parseTrainingStylePreference(profileOrText, frequency = null) {
  const raw = typeof profileOrText === 'string' ? profileOrText : profileOrText?.trainingPreferences;
  const text = normalize(raw); const days = frequency == null ? null : Math.max(2, Math.min(6, Number(frequency) || 3));
  if (!text) return { raw: raw || '', structure: null, userRequestedSequence: null, styleOverlays: [], progression: null, periodization: null, namedProgram: null, fidelity: null, confidence: 0, reasonCodes: [] };
  let structureId = namedTrainingStructure(raw)?.id || null; const reasons = [];
  const sequenceTokens = sessionSequenceTokens(text);
  const hybridTokens = new Set(sequenceTokens);
  if (!structureId) {
  if (
    /\b(?:pplul|ppl ul|ppl upper lower)\b/.test(text) ||
    ['push', 'pull', 'legs', 'upper', 'lower'].every(token => hybridTokens.has(token))
  ) structureId = 'pplul';
  else if (/\b(?:push pull legs?|ppl)\b/.test(text)) structureId = 'push-pull-legs';
  else if (/\b(?:torso limbs?|torso limb split)\b/.test(text)) structureId = 'torso-limbs';
  else if (/\b(?:upper lower|ul split)\b/.test(text)) structureId = 'upper-lower';
  else if (/\barnold split\b|\bchest(?: and| &) back\b.*\bshoulders?(?: and| &) arms?\b/.test(text) || /\barnold\b/.test(text) && !/\barnold press\b/.test(text)) structureId = 'arnold';
  else if (/\b(?:full body|whole body)\b/.test(text)) structureId = 'full-body';
  else if (/\b(?:push pull|push pull split|push pull routine|two day push pull)\b/.test(text)) structureId = 'push-pull';
  else if (/\b(?:bro split|body part split|bodypart split|one muscle per day)\b/.test(text)) structureId = 'body-part';
  }
  const namedProgram = matchFirst(NAMED_PROGRAMS, text);
  const progression = matchFirst(PROGRESSIONS, text);
  const namedStructures = { phul: 'upper-lower', phat: 'body-part', 'westside-for-skinny-bastards': 'upper-lower', 'starting-strength': 'full-body', 'stronglifts-5x5': 'full-body', 'texas-method': 'full-body', madcow: 'full-body', 'greyskull-lp': 'full-body', 'ice-cream-fitness': 'full-body', 'lvysaur-4-4-8': 'full-body' };
  if (!structureId) structureId = namedStructures[namedProgram || progression] || null;
  const styleOverlays = STYLE_OVERLAYS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id).filter(id => id !== 'high-intensity-training' || !/\bhiit\b/.test(text));
  let periodization = matchFirst(PERIODIZATION, text);
  if (namedProgram === 'texas-method') periodization = 'heavy-light-medium';
  if (namedProgram === 'westside-for-skinny-bastards' && periodization === 'conjugate') { periodization = null; reasons.push('ws4sb-not-conjugate'); }
  if (/\b(?:ss|lp)\b/.test(text) && !progression && !namedProgram) reasons.push('ambiguous-abbreviation');
  if (/\bhiit\b/.test(text) && !styleOverlays.length) reasons.push('hiit-not-hit');
  const selectedStructure = structure(structureId);
  const explicitSequence = explicitSessionSequence(raw);
  const userRequestedSequence = explicitSequence || (structureId
    ? requestedSequenceFor(structureId, sequenceTokens)
    : null);
  let fidelity = selectedStructure && days ? TRAINING_STRUCTURES[structureId].compatibility[days] : selectedStructure ? 'adapted' : null;
  const requestedMethodLayer = Boolean(namedProgram || progression || periodization || styleOverlays.length);
  if (requestedMethodLayer && (!fidelity || fidelity === 'exact')) fidelity = 'inspired';
  if (selectedStructure) reasons.push(`structure:${structureId}`);
  if (namedProgram) reasons.push(`named-program:${namedProgram}`, 'named-program-progression-not-implemented');
  if (progression) reasons.push(`progression:${progression}`);
  if (periodization) reasons.push(`periodization:${periodization}`);
  styleOverlays.forEach(id => reasons.push(`overlay:${id}`));
  if (requestedMethodLayer) reasons.push('method-layer-ai-guidance-only');
  if (userRequestedSequence) reasons.push('explicit-session-order');
  return { raw: raw || '', structure: selectedStructure, userRequestedSequence, explicitSequence, styleOverlays, progression, periodization, namedProgram, fidelity, confidence: selectedStructure || namedProgram || progression || styleOverlays.length ? (reasons.includes('ambiguous-abbreviation') ? 0.45 : 0.95) : 0, reasonCodes: reasons };
}

export function detectSplitPreference(profileOrText) { return parseTrainingStylePreference(profileOrText).structure; }

export function selectStructuralTemplate(profileOrText, frequency) {
  const daysPerWeek = Math.max(2, Math.min(6, Number(frequency) || 3));
  if (profileOrText?.trainingSplitChoice === 'other') {
    const resolution = resolveOtherWeeklyStructure(profileOrText.trainingPreferences, daysPerWeek);
    const conflict = (message = `We couldn't map that split to ${daysPerWeek} workout days. List all ${daysPerWeek} focuses in order (for example, separated by /).`, clarification = null) => {
      const error = new Error(message);
      error.code = 'custom-split-conflict';
      error.clarification = clarification;
      throw error;
    };
    if (!resolution) conflict();
    if (resolution.kind === 'preset') {
      const selection = selectStructuralTemplate({ ...profileOrText, trainingSplitChoice: 'predefined',
        trainingPreferences: TRAINING_STRUCTURES[resolution.id].presetValue }, daysPerWeek);
      // Other must never silently use the legacy equipment/default fallback.
      if (!selection.preferenceHonored || selection.fallbackReason)
        conflict('Your requested split cannot be preserved with this equipment. Clarify the weekly structure before building.',
          { reason: 'equipment', message: 'This split needs equipment outside your current selection. Adjust your equipment or enter different workout focuses.' });
      return { ...selection, parsedPreference: { ...selection.parsedPreference,
        raw: profileOrText.trainingPreferences, explicitSequence: null } };
    }
    const sessions = resolution.sessions;
    const sequence = sessions.map(session => session.key);
    const preference = { id: 'custom', label: 'Custom weekly structure', structureFamily: 'custom', canonicalSessionSequence: sequence };
    return {
      templateId: 'CUSTOM', customSessions: sessions, preference, preferenceHonored: true,
      exactFrequencyMatch: true, fidelity: 'exact', structuralFamily: 'custom',
      canonicalSessionSequence: sequence, userRequestedSequence: sequence,
      schedulingFlexibility: 'identity-preserving', recoveryRelationships: [], fallbackReason: null,
      parsedPreference: { raw: profileOrText.trainingPreferences, structure: preference, userRequestedSequence: sequence, explicitSequence: sequence,
        styleOverlays: [], progression: null, periodization: null, namedProgram: null, fidelity: 'exact', confidence: 1, reasonCodes: ['explicit-custom-sessions'] },
    };
  }
  const parsed = parseTrainingStylePreference(profileOrText, daysPerWeek);
  const preference = parsed.structure;
  const explicitHybridOrder =
    preference?.id === 'pplul' &&
    daysPerWeek === 5 &&
    parsed.userRequestedSequence?.join('|') === 'upper|lower|push|pull|legs';
  const preferredTemplateId = explicitHybridOrder
    ? 'T5-ULPPL'
    : preference ? PREFERRED_TEMPLATE_BY_SPLIT[preference.id]?.[daysPerWeek] : null;
  const requestedTemplateId = preferredTemplateId || BASELINE_TEMPLATE_BY_FREQUENCY[daysPerWeek];
  const equipmentFallbackReason = bodyweightFallbackReason(profileOrText, requestedTemplateId);
  const equipmentFallback = Boolean(equipmentFallbackReason);
  return {
    templateId: equipmentFallback ? BODYWEIGHT_FALLBACK_BY_FREQUENCY[daysPerWeek] : requestedTemplateId, preference,
    preferenceHonored: Boolean(preferredTemplateId) && !equipmentFallback, exactFrequencyMatch: Boolean(preference && !equipmentFallback && TRAINING_STRUCTURES[preference.id].compatibility[daysPerWeek] === 'exact'),
    fidelity: equipmentFallback && preference ? 'adapted' : preferredTemplateId ? parsed.fidelity : preference ? 'incompatible' : null, parsedPreference: parsed,
    structuralFamily: preference?.structureFamily || null,
    canonicalSessionSequence: preference?.canonicalSessionSequence || null,
    userRequestedSequence: parsed.userRequestedSequence,
    schedulingFlexibility: preference?.schedulingFlexibility || 'calendar-flexible',
    recoveryRelationships: preference?.recoveryRelationships || [],
    fallbackReason: equipmentFallbackReason || (preference && !preferredTemplateId ? 'split-not-viable-at-frequency' : null)
  };
}
