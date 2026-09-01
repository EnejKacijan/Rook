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
}) => Object.freeze({
  structureFamily: family,
  label,
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
  'full-body': structureDefinition({ family: 'full-body', label: 'Full Body', canonicalSessionSequence: ['full-body'], canonicalFrequencies: [2, 3], compatibility: { 2: 'exact', 3: 'exact', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['space repeated full-body exposures when availability permits'] }),
  'upper-lower': structureDefinition({ family: 'upper-lower', label: 'Upper / Lower', canonicalSessionSequence: ['upper', 'lower'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate upper and lower exposures'] }),
  'push-pull-legs': structureDefinition({ family: 'push-pull-legs', label: 'Push / Pull / Legs', canonicalSessionSequence: ['push', 'pull', 'legs'], canonicalFrequencies: [3, 6], compatibility: { 2: 'incompatible', 3: 'exact', 4: 'adapted', 5: 'adapted', 6: 'exact' }, recoveryRelationships: ['preserve push-pull-legs cycle', 'avoid upper overlap when adapted'] }),
  arnold: structureDefinition({ family: 'arnold', label: 'Arnold Split', canonicalSessionSequence: ['chest-back', 'shoulders-arms', 'legs'], canonicalFrequencies: [3, 6], compatibility: { 2: 'inspired', 3: 'exact', 4: 'adapted', 5: 'adapted', 6: 'exact' }, schedulingFlexibility: 'identity-preserving', recoveryRelationships: ['account for shoulder and arm carry-over after chest and back'] }),
  'push-pull': structureDefinition({ family: 'push-pull', label: 'Push / Pull', canonicalSessionSequence: ['push', 'pull'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate push and pull exposures'] }),
  'torso-limbs': structureDefinition({ family: 'torso-limbs', label: 'Torso / Limbs', canonicalSessionSequence: ['torso', 'limbs'], canonicalFrequencies: [2, 4], compatibility: { 2: 'exact', 3: 'adapted', 4: 'exact', 5: 'adapted', 6: 'adapted' }, recoveryRelationships: ['alternate torso and limb exposures'] }),
  'body-part': structureDefinition({ family: 'body-part', label: 'Body-part Split', canonicalSessionSequence: ['chest', 'back', 'legs', 'shoulders', 'arms'], canonicalFrequencies: [4, 5, 6], compatibility: { 2: 'inspired', 3: 'adapted', 4: 'exact', 5: 'exact', 6: 'exact' }, schedulingFlexibility: 'identity-preserving', recoveryRelationships: ['account for chest-to-shoulder and back-to-arm carry-over'] }),
  pplul: structureDefinition({ family: 'ppl-upper-lower-hybrid', label: 'Push / Pull / Legs / Upper / Lower', canonicalSessionSequence: ['push', 'pull', 'legs', 'upper', 'lower'], canonicalFrequencies: [5], compatibility: { 2: 'incompatible', 3: 'incompatible', 4: 'incompatible', 5: 'exact', 6: 'incompatible' }, schedulingFlexibility: 'sequence-flexible', recoveryRelationships: ['avoid push or pull immediately before upper where possible', 'avoid legs immediately before lower where possible'] })
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

const ONBOARDING_SPLITS_BY_FREQUENCY = Object.freeze({
  2: Object.freeze([
    { id: 'full-body', label: 'Full Body', value: 'Full Body' },
    { id: 'upper-lower', label: 'Upper / Lower', value: 'Upper / Lower split' },
    { id: 'push-pull', label: 'Push / Pull', value: 'Push / Pull split' }
  ]),
  3: Object.freeze([
    { id: 'full-body', label: 'Full Body', value: 'Full Body' },
    { id: 'push-pull-legs', label: 'Push / Pull / Legs', value: 'Push / Pull / Legs' },
    { id: 'arnold', label: 'Arnold Split', value: 'Arnold split' }
  ]),
  4: Object.freeze([
    { id: 'upper-lower', label: 'Upper / Lower', value: 'Upper / Lower split' },
    { id: 'push-pull', label: 'Push / Pull', value: 'Push / Pull split' },
    { id: 'torso-limbs', label: 'Torso / Limbs', value: 'Torso / Limbs split' }
  ]),
  5: Object.freeze([
    { id: 'pplul', label: 'Push / Pull / Legs + Upper / Lower', value: 'Push / Pull / Legs / Upper / Lower' },
    { id: 'body-part', label: 'Body-part Split', value: 'Body-part split' },
    { id: 'arnold', label: 'Arnold Split', value: 'Arnold split' }
  ]),
  6: Object.freeze([
    { id: 'push-pull-legs', label: 'Push / Pull / Legs ×2', value: 'Push / Pull / Legs' },
    { id: 'arnold', label: 'Arnold Split', value: 'Arnold split' },
    { id: 'upper-lower', label: 'Upper / Lower ×3', value: 'Upper / Lower split' }
  ])
});

export function onboardingSplitOptions(frequency) {
  const days = Math.max(2, Math.min(6, Number(frequency) || 3));
  return [
    { id: 'recommended', label: 'Choose for me', value: '' },
    ...ONBOARDING_SPLITS_BY_FREQUENCY[days],
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

export function parseTrainingStylePreference(profileOrText, frequency = null) {
  const raw = typeof profileOrText === 'string' ? profileOrText : profileOrText?.trainingPreferences;
  const text = normalize(raw); const days = frequency == null ? null : Math.max(2, Math.min(6, Number(frequency) || 3));
  if (!text) return { raw: raw || '', structure: null, userRequestedSequence: null, styleOverlays: [], progression: null, periodization: null, namedProgram: null, fidelity: null, confidence: 0, reasonCodes: [] };
  let structureId = null; const reasons = [];
  const sequenceTokens = sessionSequenceTokens(text);
  const hybridTokens = new Set(sequenceTokens);
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
  const userRequestedSequence = structureId
    ? requestedSequenceFor(structureId, sequenceTokens)
    : null;
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
  return { raw: raw || '', structure: selectedStructure, userRequestedSequence, styleOverlays, progression, periodization, namedProgram, fidelity, confidence: selectedStructure || namedProgram || progression || styleOverlays.length ? (reasons.includes('ambiguous-abbreviation') ? 0.45 : 0.95) : 0, reasonCodes: reasons };
}

export function detectSplitPreference(profileOrText) { return parseTrainingStylePreference(profileOrText).structure; }

export function selectStructuralTemplate(profileOrText, frequency) {
  const daysPerWeek = Math.max(2, Math.min(6, Number(frequency) || 3)); const parsed = parseTrainingStylePreference(profileOrText, daysPerWeek); const preference = parsed.structure;
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
