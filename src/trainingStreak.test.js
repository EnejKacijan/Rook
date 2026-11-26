import {describe, expect, it} from 'vitest';
import {
  claimStreakGain, completedActivityStreakGain, completedWorkoutStreakGain, weeklyTrainingStreak,
} from './trainingStreak.js';

const now = new Date('2026-12-02T18:00:00+01:00');
const log = (day, extra = {}) => ({
  id: day,
  startedAt: Date.parse(day + 'T09:00:00+01:00'),
  utcOffsetMinutesAtStart: -60,
  completedAt: day + 'T09:45:00+01:00',
  exercises: [{sets: [{completed: true, reps: 8}]}],
  ...extra,
});
const prior = [log('2026-11-17'), log('2026-11-24')];
const state = workouts => ({workouts, optionalSessions: []});

describe('weekly streak gain', () => {
  it('credits the real week of the first moved workout and never credits the schedule edit itself', () => {
    const moved = log('2026-12-02', {
      originalScheduledDate: '2026-11-29',
      canonicalPlanDate: '2026-11-29',
      workoutDateKey: '2026-11-29',
    });
    expect(weeklyTrainingStreak({...state(prior), selectedDate: '2026-11-29'}, now)).toMatchObject({
      current: 2, earnedThisWeek: false,
    });
    expect(completedWorkoutStreakGain(state([...prior, moved]), moved, prior, now)).toEqual({
      previous: 2, current: 3, week: '2026-11-30',
    });
    const next = log('2026-12-02', {id: 'second'});
    expect(completedWorkoutStreakGain(state([...prior, moved, next]), next, [...prior, moved], now)).toBeNull();
  });

  it('keeps a workout started on Sunday in that week when it finishes on Monday', () => {
    const sunday = log('2026-11-29', {completedAt: '2026-11-30T00:05:00+01:00', canonicalPlanDate: '2026-11-30'});
    const fresh = state([prior[0], sunday]);
    expect(weeklyTrainingStreak(fresh, now)).toMatchObject({current: 2, earnedThisWeek: false});
    expect(completedWorkoutStreakGain(fresh, sunday, [prior[0]], now)).toBeNull();
  });

  it('ignores cancelled and empty workouts and credits a real partially logged or freestyle workout', () => {
    const cancelled = log('2026-12-01', {status: 'cancelled'});
    const empty = log('2026-12-02', {id: 'empty', exercises: [{sets: [{completed: false}]}]});
    const saved = log('2026-12-02', {id: 'freestyle', source: 'freestyle', status: 'ended-early'});
    const before = [...prior, cancelled, empty];
    expect(weeklyTrainingStreak(state(before), now)).toMatchObject({earnedThisWeek: false});
    expect(completedWorkoutStreakGain(state([...before, saved]), saved, before, now)?.current).toBe(3);
  });

  it('credits standalone conditioning once and leaves the next strength finish quiet that week', () => {
    const activity = log('2026-12-02', {id: 'cardio', kind: 'Conditioning', intent: 'conditioning', elapsedSeconds: 100, status: 'completed'});
    const after = {...state(prior), optionalSessions: [activity]};
    expect(completedActivityStreakGain(after, activity, [], now)?.current).toBe(3);
    const strength = log('2026-12-02');
    expect(completedWorkoutStreakGain({...after, workouts: [...prior, strength]}, strength, prior, now)).toBeNull();
  });

  it('allows one celebration per profile and week independently of the counter', () => {
    const map = new Map();
    const store = {getItem: key => map.get(key), setItem: (key, value) => map.set(key, value)};
    expect(claimStreakGain('profile-a', '2026-11-30', store)).toBe(true);
    expect(claimStreakGain('profile-a', '2026-11-30', store)).toBe(false);
    expect(claimStreakGain('profile-b', '2026-11-30', store)).toBe(true);
    expect(claimStreakGain('profile-a', '2026-12-07', store)).toBe(true);
  });
});
