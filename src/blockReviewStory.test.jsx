import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; });
function render(ui) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(ui)); return { container: host }; }
const textNodes = text => [...host.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3) && (text instanceof RegExp ? text.test(el.textContent) : el.textContent === text));
const screen = {
  getAllByText: text => textNodes(text),
  getByText: text => { const found = textNodes(text); if (!found.length) throw Error(`No text ${text}`); return found[0]; },
  getByRole: (role, { name }) => { const el = [...host.querySelectorAll('h1,h2,h3')].find(h => name instanceof RegExp ? name.test(h.textContent) : h.textContent === name); if (!el) throw Error(`No heading ${name}`); return el; },
  getByLabelText: label => host.querySelector(`[aria-label="${label}"]`),
};
import { blockHighlights, blockHeadline, improvementOf } from './blockReviewStory.js';
import { reviewTrainingBlock } from './blockReview.js';
import { blankState, buildProgram, isoDay } from './domain.js';
import { prescribeTrainingBlockWorkout, advanceTrainingBlockAfterWorkout } from './trainingBlocks.js';
import { normalizePlanHistoryState } from './planHistory.js';
import { normalizeGymProfilesState } from './gymProfiles.js';
import { BlockReviewSummary } from './BlockReviewSummary.jsx';
import { CompletionRecords, completionRecordItems, primaryRecord } from './CompletionRecords.jsx';

// Same synthetic block as blockReview.test.js.
function completedBlockFixture({lowData=false}={}) {
 const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true});
 s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-07-27';normalizeGymProfilesState(s);normalizePlanHistoryState(s,'2026-07-27T08:00:00Z');
 const b=s.program.trainingBlock;
 for(const week of b.weeks){b.currentWeek=week.weekNumber;for(const [index,day] of s.program.days.entries()){
  const w=prescribeTrainingBlockWorkout(s,day),date=new Date('2026-07-27T12:00:00Z');date.setUTCDate(date.getUTCDate()+(week.weekNumber-1)*7+index*2);
  s.workouts.push({...w,id:`history-${week.weekNumber}-${index}`,programDayId:day.id,completedAt:date.toISOString(),canonicalPlanDate:date.toISOString().slice(0,10),sourcePlanSlotId:w.trainingBlock.blockWorkoutId,exercises:w.exercises.map(e=>({...e,sets:e.sets.map(set=>({...set,weight:60,reps:e.repMax,rir:e.targetRir,planned:true,completed:!lowData || week.weekNumber===1}))})),endedEarly:lowData&&week.weekNumber!==1});
 }}
 advanceTrainingBlockAfterWorkout(s,s.workouts.at(-1));s.selectedDate=isoDay();return s;
}
const row = (id, exerciseId, extra) => ({ id, exerciseId, name: id, status: 'progressed', reason: 'r', comparableSessions: 2, fromWeight: 50, currentWeight: 50, fromReps: 8, currentReps: 8, repGain: 0, ...extra });
const base = { name: 'Block', totalWeeks: 6, startDate: '2026-10-05', completedAt: '2026-11-13T17:00:00Z', completedSessions: 18, plannedSessions: 18, loggedSets: 10, prescribedSets: 10, progressed: 0, held: 0, review: 0, prs: 0, rows: [] };

describe('block review story', () => {
  it('shows at most three measured improvements, one per exercise, load first', () => {
    const review = { ...base, rows: [
      row('a', 'squat', { currentWeight: 55, currentReps: 10, repGain: 2 }),
      row('b', 'squat', { currentWeight: 60 }),
      row('c', 'press', { currentReps: 11, repGain: 3 }),
      row('d', 'row', { currentWeight: 52.5 }),
      row('e', 'curl', { currentWeight: 51 }),
      row('f', 'held', { status: 'held' }),
    ] };
    const items = blockHighlights(review);
    expect(items.map(item => item.id)).toEqual(['b', 'd', 'e']);
    expect(new Set(items.map(item => item.exerciseId)).size).toBe(3);
  });
  it('a decision-only or lower-load row is not an improvement', () => {
    expect(improvementOf(row('a', 'x'))).toBeNull();
    expect(improvementOf(row('a', 'x', { currentWeight: 45, repGain: 2 }))).toBeNull();
    expect(improvementOf(row('a', 'x', { status: 'held', currentWeight: 60 }))).toBeNull();
  });
  it('fills with records that have no comparable pair, without repeating an exercise', () => {
    const review = { ...base, rows: [row('a', 'squat', { currentWeight: 55 }), row('b', 'press', { status: 'held' })],
      prBests: [{ exerciseId: 'squat', weight: 55, reps: 8, types: ['weight'] }, { exerciseId: 'press', weight: 40, reps: 12, types: ['reps'] }] };
    const items = blockHighlights(review);
    expect(items.map(item => [item.exerciseId, item.kind])).toEqual([['squat', 'load'], ['press', 'record']]);
    expect(items[0].pr).toBeTruthy();
  });
  it('chooses a calm lead when nothing improved', () => {
    expect(blockHeadline({ ...base, held: 4, rows: [row('a', 'x', { status: 'held' })] }).kind).toBe('steady');
    expect(blockHeadline({ ...base, rows: [row('a', 'x', { status: 'insufficient' })] }).kind).toBe('start');
    expect(blockHeadline({ ...base, completedSessions: 0 }).kind).toBe('empty');
    expect(blockHeadline({ ...base, completedSessions: 0, plannedRestSessions: 3 }).kind).toBe('rest-only');
    expect(blockHeadline({ ...base, prExercises: 2 }).kind).toBe('records');
  });
  it('renders the pair once and keeps the next-block decision separate', () => {
    const review = { ...base, rows: [row('a', 'barbell-bench-press', { name: 'Bench', currentWeight: 55, currentReps: 10, repGain: 2 })], progressed: 1 };
    render(<BlockReviewSummary review={review} units="kg" onOutcomes={() => {}} next={<section aria-label="next">next</section>} />);
    expect(screen.getByRole('heading', { name: '1 exercise improved' })).toBeTruthy();
    expect(screen.getAllByText('55 kg × 10')).toHaveLength(1);
    expect(screen.getByText('50 kg × 8')).toBeTruthy();
    expect(screen.getByText('+5 kg · +2 reps')).toBeTruthy();
    expect(screen.getByLabelText('next')).toBeTruthy();
  });
});

describe('block review evidence for the story', () => {
  it('records weeks, lowest working-set reps and one record per exercise', () => {
    const review = reviewTrainingBlock(completedBlockFixture());
    expect(review.weeks).toHaveLength(6);
    expect(review.weeks.every(week => week.completed === week.planned)).toBe(true);
    expect(review.weeks.at(-1).phase).toBe('deload');
    expect(review.rows.every(item => item.currentReps == null || Number.isInteger(item.currentReps))).toBe(true);
    expect(new Set(review.prBests.map(best => best.exerciseId)).size).toBe(review.prBests.length);
    expect(review.prExercises).toBe(review.prBests.length);
    expect(review.plannedRest).toBeNull();
  });
});

describe('completion records', () => {
  it('prefers the weight record over the estimate from the same set', () => {
    const bests = [{ weight: 60, reps: 8, estimate: { current: 76, previous: 70 } }, { weight: 55, reps: 12, previousReps: 10 }, { weight: 60, reps: 8, previousHeaviest: { weight: 55, reps: 8 } }];
    expect(primaryRecord(bests)).toBe(bests[2]);
  });
  it('shows a before/after pair and labels estimated 1RM as an estimate', () => {
    const map = new Map([
      [{ id: 'a', exerciseId: 'barbell-bench-press' }, [{ weight: 60, reps: 10, previousHeaviest: { weight: 55, reps: 8 } }]],
      [{ id: 'b', exerciseId: 'lat-pulldown' }, [{ weight: 40, reps: 10, estimate: { current: 53.33, previous: 50 } }]],
    ]);
    render(<CompletionRecords personalBests={map} units="kg" />);
    expect(screen.getByRole('heading', { name: /2 new personal records/ })).toBeTruthy();
    expect(screen.getByText('55 kg × 8')).toBeTruthy();
    expect(screen.getByText('Heaviest set yet · +5 kg · +2 reps')).toBeTruthy();
    expect(screen.getByText(/an estimate$/)).toBeTruthy();
  });
  const records = count => new Map(Array.from({ length: count }, (_, i) => [
    { id: `e${i}`, exerciseId: 'barbell-bench-press', name: `Lift ${i}` },
    [i % 2 ? { weight: 40, reps: 10, estimate: { current: 53, previous: 50 } } : { weight: 60, reps: 8, previousHeaviest: { weight: 55, reps: 8 } }],
  ]));
  it('ranks weight records before estimates and keeps workout order within a kind', () => {
    expect(completionRecordItems(records(4)).map(item => item.exercise.id)).toEqual(['e0', 'e2', 'e1', 'e3']);
  });
  it('shows up to four records in full with no toggle', () => {
    render(<CompletionRecords personalBests={records(4)} units="kg" />);
    expect(host.querySelectorAll('.completion-records li')).toHaveLength(4);
    expect(host.querySelector('.completion-records-toggle')).toBeNull();
  });
  it('opens with three of five or more and reveals the rest in place', () => {
    render(<CompletionRecords personalBests={records(6)} units="kg" />);
    expect(screen.getByRole('heading', { name: /6 new personal records/ })).toBeTruthy();
    const toggle = host.querySelector('.completion-records-toggle');
    expect(host.querySelectorAll('.completion-records li')).toHaveLength(3);
    expect(toggle.textContent).toBe('Show 3 more records');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(host.querySelector('.completion-records ol').id);
    act(() => toggle.click());
    expect(host.querySelectorAll('.completion-records li')).toHaveLength(6);
    expect(host.querySelectorAll('.completion-records li.is-revealed')).toHaveLength(3);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Show fewer');
    act(() => toggle.click());
    expect(host.querySelectorAll('.completion-records li')).toHaveLength(3);
  });
  it('renders nothing without records', () => {
    const { container } = render(<CompletionRecords personalBests={new Map()} units="kg" />);
    expect(container.innerHTML).toBe('');
  });
});
