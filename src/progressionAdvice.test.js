import { describe, it, expect } from 'vitest';
import { progressionFor } from './domain.js';

const exercise = { exerciseId: 'barbell-bench-press', repMin: 8, repMax: 8, targetRir: 1, defaultIncrement: 1 };
const session = (reps, options = {}) => ({
  completedAt: options.date || '2026-09-07T12:00:00Z',
  exercises: [{ ...exercise, ...options.exercise, sets: reps.map((reps, i) => ({
    reps, weight: 40, rir: 1, planned: true, completed: true, ...options.set,
    ...(options.rirs ? { rir: options.rirs[i] } : {}),
  })) }],
});
const advice = (reps, options = {}, target = exercise) => progressionFor(target, [session(reps, options), session(reps, options)]);

describe('conservative progression next steps', () => {
  it.each([[8,7],[7,7]])('builds short sets, not load reduction: %j', (...reps) => {
    const result = advice(reps);
    expect(result).toMatchObject({type:'hold',title:'Build reps first'});
    expect(result.detail).toContain('one more rep on a set below 8');
    expect(result).not.toHaveProperty('weight');
  });
  it('reviews a repeated broad miss', () => expect(advice([6,6]).title).toBe('Review the load'));
  it.each([[8,6],[10,6]])('does not confuse totals or half the sets with broad failure: %j', (...reps) => expect(advice(reps).title).toBe('Repeat this load'));
  it('requires a strict majority of substantially missed sets', () => {
    expect(advice([8,6,6]).title).toBe('Review the load');
    expect(advice([8,8,6]).title).toBe('Repeat this load');
  });
  it('does not recommend reduction from one poor session', () => expect(progressionFor(exercise,[session([6,6])]).title).toBe('Repeat this load'));
  it('confirms a first success', () => expect(progressionFor(exercise,[session([8,8])])).toMatchObject({type:'hold',title:'Repeat to confirm'}));
  it('confirms improvement without an early load increase', () => expect(progressionFor(exercise,[session([8,7]),session([8,8])]).title).toBe('Repeat to confirm'));
  it('retains the two-session increase and exact increment', () => expect(advice([8,8])).toMatchObject({type:'progress',weight:41,evidenceExposures:2}));
  it('holds when latest reported effort exceeds target, including zero', () => expect(advice([8,8],{rirs:[null,0]}).title).toBe('Hold the load'));
  it('does not attribute an older low RIR to the latest session', () => expect(progressionFor(exercise,[session([8,8],{rirs:[0,1]}),session([8,8])]).title).toBe('Repeat to confirm'));
  it.each([null,undefined,'',NaN])('missing/invalid RIR remains optional and explicitly unconfirmed (%s)', rir => {
    const result=advice([8,8],{set:{rir}});
    expect(result).toMatchObject({type:'progress',weight:41,title:'Consider a small increase'});
    expect(result.detail).toContain("Effort wasn't fully logged");
  });
  it('does not invent an effort target', () => expect(advice([8,8],{set:{rir:null}}, {...exercise,targetRir:null}).detail).not.toMatch(/effort|reserve/));
  it('withholds advice after the most recent incomplete exposure', () => {
    expect(progressionFor(exercise,[session([8,8]),session([8,8],{set:{completed:false}})])).toBeNull();
    const partial=session([8,8]);partial.exercises[0].sets[1].completed=false;
    expect(progressionFor(exercise,[session([8,8]),partial])).toBeNull();
  });
  it.each(['amrap','drop','rest_pause'])('does not use advanced %s sets', setType => expect(advice([8,8],{set:{setType}})).toBeNull());
  it('does not use added sets as evidence', () => expect(advice([8,8],{set:{added:true}})).toBeNull());
  it('does not confirm a changed load or set count', () => {
    expect(progressionFor(exercise,[session([8,8]),session([8,8],{set:{weight:45}})]).title).toBe('Repeat to confirm');
    expect(progressionFor(exercise,[session([8]),session([8,8])]).title).toBe('Repeat to confirm');
  });
  it('keeps the missing-load and increment-cap safeguards', () => {
    expect(advice([8,8],{set:{weight:null}}).title).toBe('Log a working load first');
    expect(advice([8,8],{}, {...exercise,defaultIncrement:10}).title).toBe('Use a smaller increment');
  });
  it('uses variation language for unweighted exercises', () => {
    const target={...exercise,exerciseId:'pull-up'};
    expect(advice([8,7],{exercise:target,set:{weight:null}},target).detail).toContain('same variation');
    expect(advice([8,8],{exercise:target,set:{weight:null}},target).title).toBe('Ready for a harder variation');
    expect(advice([6,6],{exercise:target,set:{weight:null}},target).title).toBe('Review the variation');
  });
  it('keeps timed exercises on the existing seconds path', () => {
    const target={...exercise,exerciseId:'custom-hold',measure:'seconds',loadRequirement:'none',repMin:20,repMax:30};
    expect(advice([30,30],{exercise:target,set:{weight:null}},target).detail).toContain('30 seconds');
    expect(advice([19,19],{exercise:target,set:{weight:null}},target).title).toBe('Reduce the hold target slightly');
  });
  it('keeps the existing plateau branch reachable before generic advice', () => {
    const target={...exercise,repMin:6,repMax:10};
    const history=[1,8,15,22].map(day=>session([8,7],{date:`2026-08-${String(day).padStart(2,'0')}T12:00:00Z`}));
    expect(progressionFor(target,history).type).toBe('stalled');
  });
  it('does not write into prescription or history', () => {
    const history=[session([8,7]),session([8,7])],original=structuredClone({exercise,history});
    progressionFor(exercise,history);
    expect({exercise,history}).toEqual(original);
  });
  it('requires a valid target and history', () => {
    expect(progressionFor(exercise,[])).toBeNull();
    expect(progressionFor({...exercise,repMax:undefined},[session([8,8])])).toBeNull();
  });
});
