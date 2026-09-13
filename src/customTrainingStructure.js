import { priorityProgrammingGroupsForProfile, STIMULUS_PROFILE_BY_PATTERN } from './trainingVolume.js';

// These are the existing priority/stimulus taxonomy labels, not exercise lists
// or named weekly splits. A group needs one direct exposure in its session.
const muscle = label => priorityProgrammingGroupsForProfile({ priorities: [label] })[0].muscles;
const focus = (label, ...groups) => ({ label, groups: groups.map(muscle) });
const movement = (label, ...patterns) => ({ label, patterns,
  groups: [...new Set(patterns.flatMap(pattern => Object.entries(STIMULUS_PROFILE_BY_PATTERN[pattern])
    .filter(([, credit]) => credit === 1).map(([name]) => name)))].map(name => [name]),
});
export const CUSTOM_FOCUSES = Object.freeze({
  push: { label: 'Push', groups: [muscle('Chest'), muscle('Shoulders').filter(name => name !== 'RearDelts'), muscle('Triceps')] },
  pull: focus('Pull', 'Back', 'Biceps'),
  legs: focus('Legs', 'Quads', 'Hamstrings', 'Glutes', 'Calves'),
  lower: focus('Lower', 'Quads', 'Hamstrings', 'Glutes', 'Calves'),
  upper: focus('Upper', 'Chest', 'Back', 'Shoulders', 'Arms'),
  'full-body': focus('Full Body', 'Chest', 'Back', 'Quads', 'Hamstrings'),
  torso: focus('Torso', 'Chest', 'Back', 'Shoulders'),
  limbs: focus('Limbs', 'Quads', 'Hamstrings', 'Biceps', 'Triceps'),
  chest: focus('Chest', 'Chest'), back: focus('Back', 'Back'),
  shoulders: focus('Shoulders', 'Shoulders'), arms: focus('Arms', 'Biceps', 'Triceps'),
  biceps: focus('Biceps', 'Biceps'), triceps: focus('Triceps', 'Triceps'),
  glutes: focus('Glutes', 'Glutes'), hamstrings: focus('Hamstrings', 'Hamstrings'),
  quads: focus('Quads', 'Quads'), core: focus('Core', 'Core'), calves: focus('Calves', 'Calves'),
  'front-delts': focus('Front Delts', 'AnteriorDelts'),
  'side-delts': focus('Side Delts', 'LateralDelts'),
  'rear-delts': focus('Rear Delts', 'RearDelts'),
  'horizontal-push': movement('Horizontal Push', 'horizontal-push'),
  'vertical-push': movement('Vertical Push', 'vertical-push'),
  'horizontal-pull': movement('Horizontal Pull', 'horizontal-pull', 'upper-back-pull'),
  'vertical-pull': movement('Vertical Pull', 'vertical-pull'),
  squat: movement('Squat', 'squat'), hinge: movement('Hip Hinge', 'hinge'),
});
const normalizeFocus = text => String(text).toLowerCase().replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim();
// Lexical aliases only; muscles/patterns remain in the programming tables.
// Longest matches keep e.g. rear delts specific, never generic shoulders.
export const CUSTOM_FOCUS_ALIASES = Object.freeze({
  'full-body': ['whole body', 'total body', 'fullbody', 'wholebody', 'totalbody'],
  upper: ['upper body'], lower: ['lower body'], legs: ['leg'],
  chest: ['pec', 'pecs', 'pectoral', 'pectorals'], shoulders: ['shoulder', 'delt', 'delts', 'deltoid', 'deltoids'],
  arms: ['arm'], limbs: ['limb'], biceps: ['bicep'], triceps: ['tricep'],
  glutes: ['glute', 'gluteal', 'gluteals'], hamstrings: ['hamstring'], quads: ['quad', 'quadriceps'],
  core: ['abs', 'abdominal', 'abdominals'], calves: ['calf'],
  'front-delts': ['front delt', 'anterior delt', 'anterior delts', 'front deltoid', 'front deltoids', 'anterior deltoid', 'anterior deltoids'],
  'side-delts': ['side delt', 'lateral delt', 'lateral delts', 'medial delt', 'medial delts', 'side deltoid', 'side deltoids', 'lateral deltoid', 'lateral deltoids', 'medial deltoid', 'medial deltoids'],
  'rear-delts': ['rear delt', 'posterior delt', 'posterior delts', 'rear deltoid', 'rear deltoids', 'posterior deltoid', 'posterior deltoids'],
  'horizontal-push': ['horizontal press', 'horizontal pressing', 'horizontal pushing'],
  'vertical-push': ['vertical press', 'vertical pressing', 'vertical pushing'],
  'horizontal-pull': ['horizontal pulling'], 'vertical-pull': ['vertical pulling'],
  squat: ['squats', 'squat pattern'], hinge: ['hip hinges', 'hip hinge pattern', 'hinges'],
});
const aliases = new Map(Object.entries(CUSTOM_FOCUSES).flatMap(([key, value]) =>
  [key, value.label, ...(CUSTOM_FOCUS_ALIASES[key] || [])].map(alias => [normalizeFocus(alias), key])));
const words = new RegExp(`^(${[...aliases.keys()].sort((a,b) => b.length-a.length)
  .map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`);
const movementFamilies = new Set(['push', 'pull', 'legs', 'lower', 'upper', 'full-body', 'torso', 'limbs']);
const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekday = token => dayNames.find(name => name === token || name.slice(0, 3) === token)?.slice(0, 3).replace(/^./, c => c.toUpperCase());
const labelPattern = '(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|day\\s+\\d+)';

function parseFocus(text, allowRepeated = false) {
  let remaining = normalizeFocus(text).replace(/\.$/, '').trim();
  // Anatomical regions are NOT compounds of Upper/Lower + Back/Chest.
  if (/\b(?:upper|lower|middle) (?:back|chest)\b/.test(remaining)) return null;
  const concepts = [];
  while (remaining) {
    const match = remaining.match(words);
    if (!match) return null; // Qualifiers/methods cannot be silently discarded.
    const key = aliases.get(match[1]);
    if (!CUSTOM_FOCUSES[key] || (!allowRepeated && concepts.includes(key))) return null;
    concepts.push(key);
    remaining = remaining.slice(match[0].length).trim();
    if (/^(?:[+&]|and\b)/.test(remaining)) {
      remaining = remaining.replace(/^(?:[+&]|and\b)\s*/, '');
      if (!remaining) return null;
    }
  }
  return concepts.length ? concepts : null;
}

export function parseCustomWeeklyStructure(raw, frequency = null) {
  // Segment before concept recognition. '+' / '&' / 'and' never create days.
  const text = String(raw || '').trim();
  if (!text) return null;
  const labeled = text.replace(new RegExp(`(^|[\\s,;/])(${labelPattern}\\s*:)`, 'gi'), '$1\n$2');
  let parts = labeled.split(/[\/\n,;]/).map(part => part.trim());
  // Blank lines are formatting; empty comma/slash slots are ambiguous.
  if (/[/,;]\s*(?:[/,;]|$)|^\s*[/,;]/.test(text)) return null;
  parts = parts.filter(Boolean);
  // Retain the already-supported whitespace-only movement sequence, where
  // every token is independently a day focus. Muscle runs remain compounds.
  if (parts.length === 1 && !/[+&:]|\band\b/i.test(text)) {
    const tokens = parseFocus(parts[0], true);
    if (tokens?.length > 1 && tokens.every(key => movementFamilies.has(key))) parts = tokens;
  }
  const sessions = parts.map(part => {
    let expression = part.replace(/^(?:[-*•]\s+|\d+[.)]\s*)/, '').trim();
    const label = expression.match(new RegExp(`^(${labelPattern})\\s*:\\s*`, 'i'));
    const day = label ? weekday(label[1].toLowerCase()) : null;
    if (label) expression = expression.slice(label[0].length);
    const concepts = parseFocus(expression);
    return concepts ? { concepts, key: concepts.join('-'), name: concepts.map(key => CUSTOM_FOCUSES[key].label).join(' & '), weekday: day || null } : null;
  });
  if (sessions.some(session => !session) || (frequency != null && sessions.length !== frequency)) return null;
  const dated = sessions.filter(session => session.weekday);
  if (dated.length && (dated.length !== sessions.length || new Set(dated.map(s => s.weekday)).size !== sessions.length)) return null;
  return sessions;
}

export function customFocusGroups(concepts) {
  const groups = (concepts || []).flatMap(key => CUSTOM_FOCUSES[key]?.groups || []);
  return groups.filter((group, index) => groups.findIndex(other => other.join('|') === group.join('|')) === index);
}
export function customFocusPatterns(concepts) {
  const allowed = new Set((concepts || []).flatMap(key => {
    const definition = CUSTOM_FOCUSES[key];
    if (definition?.patterns) return definition.patterns;
    const muscles = new Set(definition?.groups.flat() || []);
    return Object.keys(STIMULUS_PROFILE_BY_PATTERN).filter(pattern =>
      Object.entries(STIMULUS_PROFILE_BY_PATTERN[pattern]).some(([name, credit]) => credit === 1 && muscles.has(name)));
  }));
  return Object.keys(STIMULUS_PROFILE_BY_PATTERN).filter(pattern => allowed.has(pattern));
}
const focusRequirements = concepts => (concepts || []).flatMap(key =>
  (CUSTOM_FOCUSES[key]?.groups || []).map(group => ({ group, patterns: customFocusPatterns([key])
    .filter(pattern => group.some(name => STIMULUS_PROFILE_BY_PATTERN[pattern][name] === 1)) })));
export function customFocusSatisfied(concepts, items) {
  const allowed = new Set(customFocusPatterns(concepts));
  return items.length > 0 && items.every(item => item && allowed.has(item.pattern)) &&
    focusRequirements(concepts).every(({ patterns }) => items.some(item => patterns.includes(item?.pattern)));
}

export function customSessionDefinition(session) {
  const groups = customFocusGroups(session.concepts);
  const all = customFocusPatterns(session.concepts);
  const requirements = focusRequirements(session.concepts).filter((item,index,items) =>
    items.findIndex(other => other.patterns.join('|') === item.patterns.join('|')) === index);
  const slots = requirements.map(({ patterns }, index) => ({
    patterns,
    essential: true, role: index < 2 ? 'main' : 'accessory',
  }));
  // Extra variety uses the same eligible patterns, never a whole-week template.
  // Required groups go first, so duration fitting cannot erase a named focus.
  for (const pattern of all) {
    if (slots.length >= Math.max(groups.length, 5)) break;
    slots.push({ patterns: [pattern], essential: false, role: 'accessory' });
  }
  return { name: session.name, structureKey: session.key, customFocus: session.concepts, weekday: session.weekday, slots };
}
