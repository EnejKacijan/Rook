import { calendarDate, isoDay, weekKey } from './domain.js';

function addDays(date, count) {
  const value = calendarDate(date);
  value.setDate(value.getDate() + count);
  return isoDay(value);
}

const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const pending = item => ['planned', 'missed'].includes(item.status) && !item.optional && !item.workout?.optional;

// Translate the remaining workout dates by one calendar offset, inside this week.
export function missedWeekShift(state, source, sessions, today, { startDate, performedDate } = {}) {
  const fail = error => ({ status: 'conflict', error });
  if (!source || state.program?.trainingBlock?.completed)
    return fail('This workout is no longer available in the current plan.');
  if (state.activeWorkout || state.activeOptionalSession)
    return fail('Finish or cancel the active workout before shifting this week.');

  const weekStart = weekKey(today), weekEnd = addDays(weekStart, 6);
  const finished = source.status === 'completed' && performedDate >= weekStart &&
    performedDate <= today && source.originalDate < performedDate;
  if (!finished && !(source.status === 'missed' && source.scheduledDate >= weekStart && source.scheduledDate < today))
    return fail('Choose a missed workout from this week.');

  // After Train today, the original dates recover the spacing before the
  // calendar inserted the completed workout and displaced the scheduled one.
  const referenceDate = item => finished ? item.originalDate : item.scheduledDate;
  const sourceDate = referenceDate(source);
  const following = sessions.filter(item => item.logicalSessionId !== source.logicalSessionId &&
    pending(item) && item.scheduledDate >= weekStart && item.scheduledDate <= weekEnd &&
    referenceDate(item) > sourceDate && referenceDate(item) <= weekEnd)
    .sort((a, b) => referenceDate(a).localeCompare(referenceDate(b)));
  if (!following.length) return fail('No following workouts remain to shift this week.');
  if (finished && !following.some(item => item.originalDate === performedDate))
    return fail('No scheduled workout was displaced on the day you trained.');

  const queue = finished ? following : [source, ...following];
  const moving = new Set(queue.map(item => item.logicalSessionId));
  const occupied = new Set(sessions.filter(item => !moving.has(item.logicalSessionId) && item.status !== 'skipped')
    .map(item => item.scheduledDate));
  const firstStart = finished ? performedDate : source.originalDate > today ? source.originalDate : today;
  const lastStart = finished ? performedDate : weekEnd;
  const options = [];
  for (let date = firstStart; date <= lastStart; date = addDays(date, 1)) {
    const offset = daysBetween(sourceDate, date);
    const moves = queue.map(item => ({ item, toDate: addDays(referenceDate(item), offset) }));
    if (moves.some(({ item, toDate }) => {
      const period = item.workout?.temporaryPlanAdjustment;
      return toDate < today || toDate > weekEnd || occupied.has(toDate) ||
        item.status === 'missed' && toDate < item.originalDate ||
        period && (toDate < period.startDate || toDate > period.endDate);
    })) continue;
    if (new Set(moves.map(move => move.toDate)).size !== moves.length) continue;
    if (moves.some(({ item, toDate }) => item.scheduledDate !== toDate)) options.push({ date, offset, moves });
  }
  if (!options.length)
    return fail('These workouts cannot shift within this week while keeping their spacing. Move a workout individually or adjust the week.');

  const choice = startDate === undefined ? options[0] : options.find(option => option.date === startDate);
  if (!choice) return fail('Choose an available start day for this shift.');
  return {
    status: 'ready',
    moves: choice.moves.filter(({ item, toDate }) => item.scheduledDate !== toDate),
    details: {
      sourceId: source.logicalSessionId,
      sourceName: source.workout.name,
      sourceCompleted: finished,
      firstDate: choice.moves[0].toDate,
      startDate: choice.date,
      startDateOptions: options.map(option => option.date),
      dayOffset: choice.offset,
      availableDays: [...(state.profile.availableDays || [])].sort(),
      weekEnd,
      nextWeekDate: addDays(weekEnd, 1),
    },
  };
}
