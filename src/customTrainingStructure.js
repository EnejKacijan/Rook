import { priorityProgrammingGroupsForProfile, STIMULUS_PROFILE_BY_PATTERN, stimulusProfileForItem } from './trainingVolume.js';

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
  const patterns=Object.keys(STIMULUS_PROFILE_BY_PATTERN).filter(pattern => allowed.has(pattern));
  return allMuscleFullBody(concepts) ? [...patterns,'power-lower','power-upper'] : patterns;
}
const focusRequirements = concepts => (concepts || []).flatMap(key =>
  (CUSTOM_FOCUSES[key]?.groups || []).map(group => ({ group, patterns: customFocusPatterns([key])
    .filter(pattern => group.some(name => STIMULUS_PROFILE_BY_PATTERN[pattern][name] === 1)) })));

// Selecting every primary muscle is a full-body intent, not separate mandatory
// isolation patterns in every session. Partial selections retain exact direct
// focus semantics, including saved Push/Pull and specific shoulder regions.
const FULL_BODY_MUSCLES = ['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core'];
export const allMuscleFullBody = concepts => concepts?.length === FULL_BODY_MUSCLES.length &&
  FULL_BODY_MUSCLES.every(key => concepts.includes(key));
export function customFullBodyExerciseLimit(profile = {}) {
  const minutes = Number(profile.sessionMinutes) || 45;
  return minutes <= 30 ? 5 : minutes <= 45 ? 6 : minutes <= 60 ? 7 : 8;
}
export function customFullBodyWorkingSetLimit(profile = {}, light = false) {
  const minutes = Number(profile.sessionMinutes) || 45, frequency = Number(profile.daysPerWeek) || 3;
  const baseline = profile.experience === 'Beginner' ? 18 : profile.experience === 'Advanced' ? 28 : 24;
  // Conservative generator defaults, not a universal physiological threshold.
  // Availability is a ceiling; a long clock target must not force junk volume.
  return Math.min(baseline, minutes <= 30 ? 10 : minutes <= 45 ? 18 : Infinity,
    frequency >= 5 ? 18 : frequency === 4 ? 20 : Infinity,
    light ? String(profile.effortStyle || '').startsWith('More moderate') ? 18 : 12 : Infinity);
}
export function customFullBodyMaxSets(profile = {}, light = false) {
  if (String(profile.effortStyle || '').startsWith('Fewer hard')) return 2;
  return light ? String(profile.effortStyle || '').startsWith('More moderate') ? 3 : 2
    : profile.experience === 'Beginner' ? 3 : 4;
}
export function customFullBodyHingeSetLimit(profile = {}) {
  if(String(profile.effortStyle||'').startsWith('More moderate'))return 3;
  return profile.experience==='Beginner' || Number(profile.daysPerWeek)>=4 ? 2 : 3;
}
export function fullBodyRequiredAccessories(count, index, availablePatterns = null) {
  const preferred=count === 1 ? ['core','calf'] : [['core'],['calf'],['shoulder-isolation']][index % Math.min(3,count || 2)];
  // A rotating isolation is not a reason to reject an otherwise faithful week
  // when that modality is unavailable. Weekly selected-muscle checks still apply.
  return [...new Set(preferred.map(pattern=>!availablePatterns || availablePatterns.has(pattern)?pattern
    : ['core','calf','shoulder-isolation'].find(candidate=>availablePatterns.has(candidate)) || pattern))];
}
export function fullBodyMuscleCoverage(concepts, items) {
  return (concepts || []).every(key => CUSTOM_FOCUSES[key]?.groups.flat()
    .some(muscle => items.some(item => (stimulusProfileForItem(item)[muscle] || 0) > 0)));
}
export function customFocusSatisfied(concepts, items, fullBodyAccessories = []) {
  const allowed = new Set(customFocusPatterns(concepts));
  if (allMuscleFullBody(concepts)) {
    const patterns = new Set(items.filter(Boolean).map(item => item.pattern));
    return items.length > 0 && items.every(item => item && allowed.has(item.pattern)) &&
      [['horizontal-push','incline-push'],['horizontal-pull','vertical-pull','upper-back-pull'],
        ['squat','single-leg','knee-extension'],['hinge','knee-flexion','hip-extension']]
        .every(group => group.some(pattern => patterns.has(pattern))) &&
      ['core','calf','shoulder-isolation'].some(pattern => patterns.has(pattern)) &&
      fullBodyAccessories.every(pattern => patterns.has(pattern));
  }
  return items.length > 0 && items.every(item => item && allowed.has(item.pattern)) &&
    focusRequirements(concepts).every(({ patterns }) => items.some(item => patterns.includes(item?.pattern)));
}

export function customSessionDefinition(session, context = {}) {
  if (allMuscleFullBody(session.concepts)) {
    const index = context.fullBodyIndex || 0;
    const other = index % 2 === 1;
    const light = context.fullBodyCount >= 4 && other;
    const requiredAccessories = fullBodyRequiredAccessories(context.fullBodyCount || 2,index,context.availablePatterns);
    const minutes=Number(context.profile?.sessionMinutes)||45;
    const roomForProtectedPress=minutes>=60 || !String(context.profile?.effortStyle||'').startsWith('More moderate');
    if(index%3===1 && minutes>=45 && roomForProtectedPress && context.availablePatterns?.has('vertical-push'))requiredAccessories.push('vertical-push');
    const base = [['squat','single-leg'],['horizontal-push','incline-push'],
      other ? ['knee-flexion','hip-extension','hinge'] : ['hinge','knee-flexion','hip-extension'],
      ['horizontal-pull','vertical-pull','upper-back-pull']];
    const extras = index % 3 === 1 ? ['vertical-push','rear-delt','core','shoulder-isolation']
      : index % 3 === 2 ? ['core','calf','elbow-extension','vertical-push']
        : ['shoulder-isolation','elbow-flexion','calf','rear-delt'];
    const accessories = [...requiredAccessories,...extras.filter(pattern=>!requiredAccessories.includes(pattern))];
    const limit = customFullBodyExerciseLimit(context.profile);
    const slots = base.map((patterns, i) => ({patterns,essential:true,fullBodyBase:true,
      fullBodyCompound:i!==2 || (!other && context.profile?.exercisePreference!=='Prefer machines'),role:i<2?'main':'accessory',
      preferredPatterns:i===2 ? (other || context.profile?.exercisePreference==='Prefer machines' && index%3===2) ? ['knee-flexion']
        : context.profile?.exercisePreference==='Prefer machines'?['hinge','hip-extension']:['hinge']
        :i===3 ? other?['vertical-pull']:['horizontal-pull','upper-back-pull']:null}));
    if(context.profile?.goal==='Athletic performance' && Number(context.profile.sessionMinutes)>=60 &&
       context.availablePatterns?.has('power-lower') && slots.length+requiredAccessories.length<limit)
      slots.unshift({patterns:['power-lower'],essential:false,role:'power'});
    for (const [i, pattern] of accessories.slice(0, limit - slots.length).entries())
      slots.push({patterns:[pattern],essential:i<requiredAccessories.length,role:'accessory'});
    return {name:`Full Body ${String.fromCharCode(65 + index)}`,structureKey:session.key,
      customFocus:session.concepts,customFullBodyAccessories:requiredAccessories,
      fullBodyProgramming:true,fullBodyLight:light,weekday:session.weekday,slots};
  }
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
