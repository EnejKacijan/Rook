import { CUSTOM_FOCUSES, parseCustomWeeklyStructure } from './customTrainingStructure.js';
import { resolveOtherWeeklyStructure, PREFERRED_TEMPLATE_BY_SPLIT } from './splitPreferences.js';
import { PROGRAM_TEMPLATES } from './domain.js';

export const CUSTOM_WORKOUT_MUSCLES = Object.freeze([
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core',
]);

export function customWorkoutConcepts(value) {
  if (!String(value || '').trim()) return [];
  const sessions = parseCustomWeeklyStructure(value, 1);
  return sessions && !sessions[0].weekday && !/:/.test(value) ? sessions[0].concepts : null;
}

export function toggleCustomWorkoutFocus(value, key) {
  if (!CUSTOM_WORKOUT_MUSCLES.includes(key)) return value;
  const selected = customWorkoutMuscles(value);
  if (selected === null) return value; // Saved broader focuses need explicit replacement.
  return (selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key])
    .sort((a, b) => CUSTOM_WORKOUT_MUSCLES.indexOf(a) - CUSTOM_WORKOUT_MUSCLES.indexOf(b))
    .map(item => CUSTOM_FOCUSES[item].label).join(' & ');
}

export function customWorkoutMuscles(value) {
  const concepts = customWorkoutConcepts(value);
  if (concepts === null || concepts.some(key => !CUSTOM_WORKOUT_MUSCLES.includes(key))) return null;
  return CUSTOM_WORKOUT_MUSCLES.filter(key => concepts.includes(key));
}

// This is a deliberate draft edit, never a migration of stored plans. Keep
// explicit muscles; do not guess/expand Push, movement patterns or subregions.
export function replaceSavedWorkoutFocus(value) {
  const concepts = customWorkoutConcepts(value) || [];
  return CUSTOM_WORKOUT_MUSCLES.filter(key => concepts.includes(key))
    .map(key => CUSTOM_FOCUSES[key].label).join(' & ');
}

// These rows belong to the questionnaire draft, not the saved profile. Keep
// unused rows so changing the weekly frequency and going back is reversible.
export function customWorkoutDraft(value = '', frequency = 3) {
  const text = String(value || '').trim();
  const resolved = text ? resolveOtherWeeklyStructure(text, frequency) : null;
  let sessions = parseCustomWeeklyStructure(text);
  if (resolved?.kind === 'custom') sessions = resolved.sessions;
  if (resolved?.kind === 'preset') {
    sessions = PROGRAM_TEMPLATES[PREFERRED_TEMPLATE_BY_SPLIT[resolved.id]?.[frequency]]?.sessions;
  }
  let rows = sessions?.map(session => ({
    focus: session.name.replace(/\s+[A-F](?=\s*(?:·|$))/, ''),
    weekday: session.weekday || null,
  }));
  if (!rows) {
    // Preserve incomplete/unsupported legacy text for correction as well.
    rows = text ? text.split(/\n|\s*[/,;]\s*/).map(part => {
      const label = part.match(/^\s*(Day\s+\d+|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\s*:\s*/i);
      return { focus: label ? part.slice(label[0].length) : part, weekday: label && !/^day/i.test(label[1]) ? label[1].slice(0, 3) : null };
    }) : [];
    if (rows.length > 6) rows = [{ focus: text, weekday: null }];
  }
  return Array.from({ length: 6 }, (_, index) => rows[index] || { focus: '', weekday: null });
}

export function customWorkoutText(rows, frequency) {
  const visible = rows.slice(0, frequency);
  // A labelled empty row must stay present: generation must never interpret a
  // half-filled week as a shorter, complete structure.
  return visible.map((row, index) => `${row.weekday || `Day ${index + 1}`}: ${row.focus.trim()}`).join('\n');
}

export function customWorkoutFocusError(value) {
  if (!value.trim()) return null;
  const sessions = parseCustomWeeklyStructure(value, 1);
  return sessions && !sessions[0].weekday && !/:/.test(value)
    ? null : 'Enter one focus, such as Push, Legs or Chest & Back.';
}

export function customWorkoutsComplete(rows, frequency) {
  return rows.slice(0, frequency).length === frequency && rows.slice(0, frequency)
    .every(row => row.focus.trim() && !customWorkoutFocusError(row.focus));
}
