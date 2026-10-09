import {describe, expect, it} from 'vitest';
import {progressionFor, serializeState, deserializeState, startWorkout, completeWorkout} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';

const target = {exerciseId:'barbell-bench-press', repMin:8, repMax:12, targetRir:2, defaultIncrement:1};
const session = (reps, options = {}) => ({
  id:options.id || 'exposure', completedAt:'2026-10-01T12:00:00Z',
  ...options.workout,
  exercises:[{...target, ...options.exercise, sets:reps.map((reps, index) => ({
    reps, weight:70, rir:2, planned:true, completed:true, ...options.set,
    ...(options.rirs ? {rir:options.rirs[index]} : {}),
  }))}],
});
const result = (history, exercise = target) => progressionFor(exercise, history);
const dip = () => session([6,6,6]);

describe('like-for-like next-session progression evidence', () => {
  it.each([9,8])('normal 10 -> %i within 8–12 keeps existing rep-building guidance', reps => {
    const current=session([reps,reps,reps]);
    expect(result([session([10,10,10]),current])).toEqual(result([current]));
    expect(result([session([10,10,10]),current]).detail).not.toMatch(/below your recent|declin|regress|lighter/i);
  });
  it('a substantial in-range variation is still not a dip warning', () => {
    expect(result([session([12,12,12]),session([8,8,8])]).title).toBe('Build reps first');
  });
  it('a meaningful first dip uses the existing hold state with neutral context', () => {
    expect(result([session([10,9,8]),dip()])).toEqual({
      type:'hold',title:'Repeat this load',
      detail:'Last session was below your recent performance. Repeat the load before increasing.',
    });
  });
  it('a single below-floor session never proposes a lighter load', () => {
    expect(result([dip()])).toMatchObject({type:'hold',title:'Repeat this load'});
    expect(result([dip()]).detail).not.toMatch(/lighter|declin|failed|weaker/);
  });
  it('two consecutive broad misses reuse the canonical load-review state without applying a reduction', () => {
    const history=[session([10,10,10]),dip(),dip()],before=structuredClone(history);
    expect(result(history)).toMatchObject({type:'hold',title:'Review the load'});
    expect(result(history).detail).toContain('Most sets were at least two reps below 8 in both sessions');
    expect(result(history)).not.toHaveProperty('weight');expect(history).toEqual(before);
  });
  it.each([[8,6,8],[6,8,8],[6,8]])('does not escalate a minority or half of missed sets: %j', (...reps) => {
    expect(result([session(reps),session(reps)]).title).toBe('Repeat this load');
  });
  it('one rep below the floor stays on the existing build-reps path', () => {
    expect(result([session([7,7,7]),session([7,7,7])]).title).toBe('Build reps first');
  });
  it('higher load and fewer reps do not create a decline claim', () => {
    const current=session([6,6,6],{set:{weight:75}});
    expect(result([session([10,10,10]),current])).toEqual(result([current]));
    expect(result([session([10,10,10]),session([8,8,8],{set:{weight:75}})]).title).toBe('Build reps first');
  });
  it('does not connect old matching loads across an intervening changed load', () => {
    expect(result([dip(),session([10,10,10],{set:{weight:75}}),dip()]).title).toBe('Repeat this load');
  });
  it('a recovered session resets repeated underperformance evidence', () => {
    expect(result([dip(),session([10,10,10]),dip()]).title).toBe('Repeat this load');
  });
  it.each([[3,1],[3,2],[null,2]])('changed/unknown RIR %s -> %s is not a like-for-like dip', (prior,current) => {
    const latest=dip();latest.exercises[0].sets.forEach(set=>set.rir=current);
    const previous=session([10,10,10],{set:{rir:prior}});
    expect(result([previous,latest])).toEqual(result([latest]));
  });
  it('two below-target sessions at changed RIR do not automatically escalate', () => {
    expect(result([session([6,6,6],{set:{rir:3}}),dip()]).title).toBe('Repeat this load');
  });
  it('higher effort than prescribed retains the canonical effort guidance', () => {
    const hard=session([6,6,6],{set:{rir:0}});
    expect(result([hard,hard]).title).toBe('Hold the load');
  });
  it('legacy missing RIR still supports repeated factual below-floor evidence without invented effort', () => {
    const unknown=session([6,6,6],{set:{rir:null}});
    expect(result([unknown,unknown]).title).toBe('Review the load');
  });
  it.each([
    {loggingMode:'per_side'}, {repMin:6,repMax:10}, {targetRir:3},
    {supersetId:'pair'}, {importRole:'backoff'},
  ])('known context changes do not combine repeated evidence: %j', exercise => {
    const previous=session([6,6,6],{exercise});
    if(exercise.loggingMode==='per_side')previous.exercises[0].sets.forEach(set=>set.sides={left:{reps:6},right:{reps:6}});
    expect(result([previous,dip()]).title).toBe('Repeat this load');
  });
  it('different exercise/variation ID cannot confirm a dip', () => {
    expect(result([session([6,6,6],{exercise:{exerciseId:'incline-barbell-bench-press'}}),dip()]).title).toBe('Repeat this load');
    expect(result([dip()],{...target,exerciseId:'incline-barbell-bench-press'})).toBeNull();
  });
  it('changed current prescription does not reframe old results as underperformance', () => {
    expect(result([dip(),dip()],{...target,repMin:10})).toBeNull();
  });
  it('a known slot replacement interrupts evidence even if the original variation returns', () => {
    const exercise={...target,id:'template-slot'};
    const original=session([6,6,6],{exercise});
    const replacement=session([6,6,6],{exercise:{...exercise,exerciseId:'incline-barbell-bench-press'}});
    expect(result([original,replacement,original],exercise).title).toBe('Repeat this load');
    expect(result([original,replacement],exercise)).toBeNull();
  });
  it('requires equal working-set count and matching positions', () => {
    expect(result([session([6,6]),dip()]).title).toBe('Repeat this load');
    const previous=dip();previous.exercises[0].sets.unshift({reps:5,weight:20,completed:true,setType:'amrap'});
    expect(result([previous,dip()]).title).toBe('Repeat this load');
  });
  it.each([null,0,-1,1.5])('invalid/missing reps (%s) cannot be treated as completed zero-rep evidence', reps => {
    expect(result([dip(),session([reps,reps,reps])])).toBeNull();
  });
  it('partial or invalid intervening exposures break repeated evidence', () => {
    expect(result([dip(),session([null,null,null]),dip()]).title).toBe('Repeat this load');
    expect(result([dip(),session([6,6,6],{set:{completed:false}}),dip()]).title).toBe('Repeat this load');
  });
  it.each(['amrap','drop','rest_pause'])('advanced %s sets never supply working-set dip evidence', setType => {
    expect(result([session([6,6,6],{set:{setType}}),dip()]).title).toBe('Repeat this load');
  });
  it('added sets and imported warm-ups cannot create a broad miss', () => {
    const current=session([10,10,10]);current.exercises[0].sets.push({reps:2,weight:70,planned:false,added:true,completed:true});
    current.exercises[0].sets.push({reps:2,weight:70,completed:true,rawImport:{version:2,loadKind:'external'},importSetType:'warmup'});
    expect(result([current,current]).title).toBe('Build reps first');
  });
  it('unilateral results retain the weaker side instead of averaging', () => {
    const exercise={...target,exerciseId:'single-leg-romanian-deadlift',loggingMode:'per_side'};
    const appearance=left=>session([10,10,10],{exercise,set:{sides:{left:{reps:left},right:{reps:12}},weight:20}});
    expect(result([appearance(10),appearance(6)],exercise).title).toBe('Repeat this load');
    expect(result([appearance(6),appearance(6)],exercise).title).toBe('Review the load');
    const invalid=appearance(6);invalid.exercises[0].sets[0].sides.right.reps=null;
    expect(result([appearance(6),invalid],exercise)).toBeNull();
  });
  it('bodyweight zero/no added load normalize without mixing in weighted sessions', () => {
    const exercise={...target,exerciseId:'pull-up'};
    const appearance=weight=>session([6,6,6],{exercise,set:{weight}});
    expect(result([appearance(null),appearance(0)],exercise).title).toBe('Review the variation');
    expect(result([appearance(10),appearance(0)],exercise).title).toBe('Repeat this variation');
    expect(result([appearance(10),appearance(10)],exercise).title).toBe('Review the load');
  });
  it('different per-set loads and known imported load meanings are not comparable', () => {
    const previous=dip();previous.exercises[0].sets[1].weight=65;
    expect(result([previous,dip()]).title).toBe('Repeat this load');
    const imported=session([6,6,6],{set:{rawImport:{version:2,loadKind:'added'},importSetType:'normal'}});
    expect(result([imported,dip()]).title).toBe('Repeat this load');
  });
  it('mixed added-load/BW sets never masquerade as a complete unweighted variation', () => {
    const exercise={...target,exerciseId:'pull-up'};
    const mixed=session([6,6,6],{exercise,set:{weight:null}});mixed.exercises[0].sets[1].weight=10;
    const bw=session([6,6,6],{exercise,set:{weight:0}});
    expect(result([mixed,mixed],exercise)).toBeNull();
    expect(result([mixed,bw],exercise).title).toBe('Repeat this variation');
  });
  it('queue/current set logging cannot change guidance before completing the workout', () => {
    const history=[session([10,10,10]),dip()];
    expect(nextWorkoutAdvice({...target,sets:[{completed:true,weight:75,reps:5}]},history)).toEqual(result(history));
  });
  it('real completion + strict reload deterministically retains notes, history and guidance', () => {
    let state=createReturningUserFixture(0);
    const exercise=state.program.days[0].exercises[0];Object.assign(exercise,{repMin:8,repMax:12,targetRir:2,personalNote:'Seat 4',notes:'Controlled pace'});
    for(const reps of [10,6,6]) {
      state.activeWorkout=startWorkout(state,state.program.days[0]);
      state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{reps,weight:70,rir:2,completed:true}));
      state=completeWorkout(state);
    }
    const before=structuredClone(state),expected=nextWorkoutAdvice(exercise,state.workouts,state.profile);
    const restored=deserializeState(serializeState(state),{strict:true});
    expect(nextWorkoutAdvice(restored.program.days[0].exercises[0],restored.workouts,restored.profile)).toEqual(expected);
    expect(expected.title).toBe('Review the load');expect(state).toEqual(before);
    expect(restored.workouts.map(w=>w.id)).toEqual(state.workouts.map(w=>w.id));
    expect(restored.program.days[0].exercises[0].personalNote).toBe('Seat 4');
  });
});
