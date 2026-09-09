import { displayWeight } from './domain.js';
import { SET_TYPES, setTypeOf } from './advancedLogging.js';

// Presentation only: describe changed fields without repeating unchanged logs.
export function historyCorrectionDelta(before, after, { units = 'kg', measure = 'reps' } = {}) {
  const lines = [];
  const plain = value => value == null ? '—' : String(value);
  const load = value => value == null ? '—' : `${displayWeight(value, units)} ${units}`;
  const logged = value => value ? 'Logged' : 'Not logged';
  const add = (label, a, b, format = plain) => {
    if ((a ?? null) !== (b ?? null)) lines.push(`${label}: ${format(a)} → ${format(b)}`);
  };
  add('Status', Boolean(before.completed), Boolean(after.completed), logged);
  add('Weight', before.weight, after.weight, load);
  if (!before.sides && !after.sides) add(measure === 'seconds' ? 'Seconds' : 'Reps', before.reps, after.reps);
  add('RIR', before.rir, after.rir);
  add('Set type', setTypeOf(before), setTypeOf(after), value => SET_TYPES[value]?.label || value);
  for (const side of ['left', 'right']) add(`${side === 'left' ? 'Left' : 'Right'} reps`, before.sides?.[side]?.reps, after.sides?.[side]?.reps);
  const previous = before.segments || [], next = after.segments || [];
  const describeSegment = segment => [load(segment.weight), `${plain(segment.reps)} reps`, segment.rir == null ? null : `${segment.rir} RIR`, logged(segment.completed)].filter(Boolean).join(' · ');
  for (const [index, segment] of next.entries()) {
    const old = previous.find(item => item.id === segment.id);
    const label = `Segment ${index + 1}`;
    if (!old) { lines.push(`${label} added: ${describeSegment(segment)}`); continue; }
    add(`${label} weight`, old.weight, segment.weight, load);
    add(`${label} reps`, old.reps, segment.reps);
    add(`${label} RIR`, old.rir, segment.rir);
    add(`${label} status`, Boolean(old.completed), Boolean(segment.completed), logged);
  }
  for (const [index, segment] of previous.entries()) {
    if (!next.some(item => item.id === segment.id)) lines.push(`Segment ${index + 1} removed: ${describeSegment(segment)}`);
  }
  return lines;
}
