import {expect,it} from 'vitest';
import {blankState,buildProgram,exerciseCatalog,validateProgram,weeklyDirectVolume,serializeState,deserializeState} from './domain.js';
import {customWorkoutDraft,customWorkoutText,toggleCustomWorkoutFocus,CUSTOM_WORKOUT_MUSCLES} from './customWeeklyWorkouts.js';
import {generatedSessionTiming} from './durationPlanning.js';
import {generateWarmup} from './warmups.js';

function profile(frequency=3,minutes=60,overrides={}){
  const rows=customWorkoutDraft();
  for(const row of rows)for(const key of CUSTOM_WORKOUT_MUSCLES)row.focus=toggleCustomWorkoutFocus(row.focus,key);
  return {...blankState().profile,goal:'Build muscle',experience:'Intermediate',daysPerWeek:frequency,sessionMinutes:minutes,
    trainingSplitChoice:'other',trainingPreferences:customWorkoutText(rows,frequency),equipment:['full gym'],environment:'Commercial gym',
    availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],...overrides};
}
const rows=program=>program.days.flatMap(day=>day.exercises);
const patterns=program=>rows(program).map(e=>exerciseCatalog[e.exerciseId].pattern);
const sets=day=>day.exercises.reduce((sum,e)=>sum+e.sets.length,0);

it('identifies all explicitly single/one-arm or leg catalog entries and counts both sides plus a side change',()=>{
  for(const item of Object.values(exerciseCatalog).filter(item=>/(?:one|single)[- ](?:arm|leg)/i.test(`${item.id} ${item.name}`)))expect(item.unilateral,item.id).toBe(true);
  const timing=generatedSessionTiming([{exerciseId:'single-arm-cable-row',repMin:6,repMax:10,restSeconds:105,sets:[{},{}]}],
    {recommendedWarmupsEnabled:false,rampUpSetsEnabled:false},exerciseCatalog);
  expect(timing.workSeconds).toBe(210);expect(timing.restSeconds).toBe(105);
});
it('uses longer work estimates for higher rep targets while retaining prescribed rests',()=>{
  const make=(min,max)=>[{exerciseId:'machine-chest-press',repMin:min,repMax:max,restSeconds:120,sets:[{},{}]}];
  const settings={recommendedWarmupsEnabled:false,rampUpSetsEnabled:false};
  const normal=generatedSessionTiming(make(6,10),settings,exerciseCatalog),high=generatedSessionTiming(make(15,20),settings,exerciseCatalog);
  expect(high.workSeconds).toBeGreaterThan(normal.workSeconds);expect(high.restSeconds).toBe(normal.restSeconds);
});
it.each([2,3])('%i short full-body days allocate a real dose to both push and pull, with bilateral main movements',frequency=>{
  const p=profile(frequency,30,{experience:'Beginner'}),program=buildProgram(p),volume=weeklyDirectVolume(program);
  expect(volume.Back).toBeGreaterThanOrEqual(4);
  expect(volume.Back/volume.Chest).toBeGreaterThanOrEqual(.75);
  expect(patterns(program)).toEqual(expect.arrayContaining(['horizontal-pull','vertical-pull']));
  for(const day of program.days){expect(day.estimatedMinutes).toBeLessThanOrEqual(30);expect(sets(day)).toBeLessThanOrEqual(10);
    expect(day.exercises.filter(e=>e.fullBodyBase).every(e=>!exerciseCatalog[e.exerciseId].unilateral && e.sets.length>=2)).toBe(true);}
  expect(program.generationGuidance.some(note=>note.code==='compact-full-body')).toBe(true);
});
it('includes available vertical work and shoulder regions without making every posterior exposure a hinge',()=>{
  const program=buildProgram(profile()),all=patterns(program);
  expect(all).toEqual(expect.arrayContaining(['horizontal-pull','vertical-pull','vertical-push','shoulder-isolation','rear-delt','knee-flexion']));
  expect(program.days.filter(day=>day.exercises.some(e=>exerciseCatalog[e.exerciseId].pattern==='hinge')).length).toBeLessThan(program.days.length);
});
it.each([4,5,6])('%i days alternate posterior loading and keep lower-volume days smaller without changing effort',frequency=>{
  const p=profile(frequency,60),program=buildProgram(p),ordered=[...program.days].sort((a,b)=>p.availableDays.indexOf(a.weekday)-p.availableDays.indexOf(b.weekday));
  const hinge=day=>day.exercises.filter(e=>exerciseCatalog[e.exerciseId].pattern==='hinge');
  expect(hinge({exercises:rows(program)}).reduce((sum,e)=>sum+e.sets.length,0)).toBeLessThanOrEqual(6);
  for(const day of program.days.filter(day=>day.fullBodyLight)){
    expect(sets(day)).toBeLessThanOrEqual(12);expect(hinge(day)).toHaveLength(0);
    expect(day.exercises.every(e=>e.targetRir===null || e.targetRir===(exerciseCatalog[e.exerciseId].kind==='compound'?2:1))).toBe(true);
  }
  for(let i=0;i<ordered.length;i++){const next=ordered[(i+1)%ordered.length],gap=(p.availableDays.indexOf(next.weekday)-p.availableDays.indexOf(ordered[i].weekday)+7)%7;
    if(gap===1)expect(hinge(ordered[i]).length && hinge(next).length).toBeFalsy();}
});
it('limits long-session working volume rather than filling 120 minutes with 35+ sets',()=>{
  const p=profile(2,120),program=buildProgram(p);
  for(const day of program.days){expect(sets(day)).toBeLessThanOrEqual(24);expect(day.estimatedMinutes).toBeLessThan(96);}
  expect(program.generationGuidance.some(note=>note.code==='bounded-workload')).toBe(true);
});
it('uses an available dumbbell overhead press at home, without inventing a pull-up bar or bench',()=>{
  const p=profile(3,45,{environment:'Home gym',equipment:['dumbbells']}),program=buildProgram(p);
  expect(patterns(program)).toContain('vertical-push');
  expect(rows(program).every(e=>exerciseCatalog[e.exerciseId].equipment.every(key=>['bodyweight','dumbbells'].includes(key)))).toBe(true);
  expect(rows(program).some(e=>e.exerciseId==='feet-elevated-push-up')).toBe(false);
  expect(exerciseCatalog['feet-elevated-push-up'].equipment).toContain('bench');
});
it('counts heavy strength ramps, load changes and recovery before fitting the available time',()=>{
  const p=profile(3,60,{goal:'Get stronger'}),program=buildProgram(p);
  for(const day of program.days){
    const warmup=generateWarmup(day,p,exerciseCatalog);
    expect(warmup.rampUpSets.slice(0,2).map(group=>group.sets.length)).toEqual([3,2]);
    expect(warmup.estimatedMinutes).toBeGreaterThanOrEqual(12);
    expect(day.estimatedMinutes).toBeLessThanOrEqual(60);
    expect(day.exercises.filter(e=>e.programmingRole==='main').every(e=>e.restSeconds>=120)).toBe(true);
  }
});
it('explains workload constraints without suggesting that extra time automatically solves them',()=>{
  for(const p of [profile(2,120),profile(2,60,{experience:'Beginner'})]){
    const program=buildProgram(p);
    expect(Object.values(program.coverageConstrained).every(c=>c.reason==='workload-policy')).toBe(true);
    if(Object.keys(program.coverageConstrained).length)
      expect(program.generationGuidance.find(n=>n.code==='limited-muscle-dose').message).toContain('workload limits');
    else expect(program.generationGuidance.some(n=>n.code==='limited-muscle-dose')).toBe(false);
    expect(program.generationGuidance.some(n=>n.message.includes('Longer sessions can allow'))).toBe(false);
  }
  for(const frequency of [5,6]){
    const program=buildProgram(profile(frequency,30));
    expect(program.generationGuidance.find(n=>n.code==='alternating-workload').message).not.toContain('lower-volume');
  }
});
it('preserves fewer-hard-set effort and does not call unselected Core an unmet goal',()=>{
  const hard=buildProgram(profile(3,45,{effortStyle:'Fewer hard sets · 2 sets · 1 RIR'}));
  expect(rows(hard).every(e=>e.sets.length===2 && (e.targetRir===1 || e.targetRir===null))).toBe(true);
  const p=profile(3,60,{trainingPreferences:'Day 1: Chest & Back\nDay 2: Shoulders & Biceps & Triceps\nDay 3: Quads & Hamstrings & Glutes & Calves'}),program=buildProgram(p);
  expect(program.volumeTargets.Core).toBeUndefined();expect(program.coverageConstrained.Core).toBeUndefined();
  for(const day of program.days){const deadlift=day.exercises.findIndex(e=>e.exerciseId==='deadlift');
    if(deadlift>=0)expect(day.exercises.slice(0,deadlift).some(e=>exerciseCatalog[e.exerciseId].kind==='isolation')).toBe(false);}
  const legs=program.days[2].exercises.map(e=>e.exerciseId);
  expect(legs.indexOf('bulgarian-split-squat')).toBeLessThan(legs.indexOf('back-extension-45'));
  expect(validateProgram(program,p,{requireProgramQuality:true}).valid).toBe(true);
});
it('retains accepted prescriptions through serialization rather than regenerating them under the new policy',()=>{
  const state=blankState();state.profile=profile();state.program=buildProgram(state.profile);
  const prescriptions=program=>program.days.map(day=>day.exercises.map(e=>[e.exerciseId,e.sets.map(s=>[s.weight,s.reps]),e.targetRir,e.restSeconds]));
  const original=prescriptions(state.program),restored=deserializeState(serializeState(state));
  expect(prescriptions(restored.program)).toEqual(original);
});
