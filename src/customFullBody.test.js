import {expect,it} from 'vitest';
import {blankState,buildProgram,buildReplacementProgram,exerciseCatalog,validateProgram,weeklyStimulusVolume,
  hypertrophyVolumeTargets,serializeState,deserializeState,customSplitValidation,estimateWorkoutMinutes} from './domain.js';
import {customWorkoutDraft,customWorkoutText,toggleCustomWorkoutFocus,CUSTOM_WORKOUT_MUSCLES} from './customWeeklyWorkouts.js';
import {customWorkoutFidelityErrors} from './customWorkoutFidelity.js';
import {parseCustomWeeklyStructure} from './customTrainingStructure.js';

// An independent oracle: primary movements per workout, assistance from real
// compounds for arms/shoulders/glutes, and calves/core across the actual week.
const cap={30:5,45:6,60:7,75:8,90:8,120:8};
const families=[['horizontal-push','incline-push'],['horizontal-pull','vertical-pull','upper-back-pull'],
  ['squat','single-leg','knee-extension'],['hinge','knee-flexion','hip-extension']];
function profileFor(frequency,minutes,experience='Intermediate',overrides={}){
  const rows=customWorkoutDraft();
  for(const row of rows)for(const key of CUSTOM_WORKOUT_MUSCLES)row.focus=toggleCustomWorkoutFocus(row.focus,key);
  return {...blankState().profile,goal:'Build muscle',experience,daysPerWeek:frequency,sessionMinutes:minutes,
    trainingSplitChoice:'other',trainingPreferences:customWorkoutText(rows,frequency),
    equipment:['full gym'],environment:'Commercial gym',availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],...overrides};
}
function verify(program,profile){
  expect(program.days).toHaveLength(profile.daysPerWeek);
  expect(program.profileSnapshot.trainingPreferences).toBe(profile.trainingPreferences);
  expect(validateProgram(program,profile,{requireProgramQuality:true})).toEqual({valid:true,errors:[]});
  const weekly=weeklyStimulusVolume(program),policy=hypertrophyVolumeTargets(profile);
  for(const muscle of ['Chest','Back','AnteriorDelts','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core']){
    expect(weekly[muscle],`missing ${muscle}`).toBeGreaterThan(0);
    expect(weekly[muscle],`weekly ${muscle} overload`).toBeLessThanOrEqual(policy[muscle].hardCap);
  }
  for(const [i,day]of program.days.entries()){
    expect(day.name).toBe(`Full Body ${String.fromCharCode(65+i)}`);
    expect(day.customFocus).toEqual(CUSTOM_WORKOUT_MUSCLES);
    expect(day.exercises.length).toBeGreaterThanOrEqual(5);
    expect(day.exercises.length).toBeLessThanOrEqual(cap[profile.sessionMinutes]);
    expect(new Set(day.exercises.map(e=>e.exerciseId)).size).toBe(day.exercises.length);
    const items=day.exercises.map(e=>exerciseCatalog[e.exerciseId]),patterns=items.map(item=>item.pattern);
    for(const [index,family]of families.entries())expect(items.some(item=>(index===3||item.kind==='compound') && family.includes(item.pattern))).toBe(true);
    expect(patterns.some(pattern=>['calf','core','shoulder-isolation'].includes(pattern))).toBe(true);
    expect(estimateWorkoutMinutes(day,profile,program)).toBe(day.estimatedMinutes);
    expect(day.estimatedMinutes).toBeLessThanOrEqual(profile.sessionMinutes);
    expect(day.durationFidelity.status).not.toMatch(/too-/);
  }
}
const matrix=['Beginner','Intermediate','Advanced'].flatMap(experience=>[2,3,4,5,6]
  .flatMap(frequency=>[30,45,60,75,90,120].map(minutes=>({experience,frequency,minutes}))));
it.each(matrix)('$experience / $frequency workouts / $minutes min builds bounded full-body sessions',({experience,frequency,minutes})=>{
  const profile=profileFor(frequency,minutes,experience),before=structuredClone(profile);
  verify(buildProgram(profile),profile);
  expect(profile).toEqual(before);
});
it('uses shorter doses at higher frequency and does not fill long availability with needless work',()=>{
  const low=buildProgram(profileFor(2,120)),high=buildProgram(profileFor(6,120));
  const average=program=>program.days.reduce((sum,day)=>sum+day.exercises.reduce((s,e)=>s+e.sets.length,0),0)/program.days.length;
  expect(average(high)).toBeLessThan(average(low));
  expect(high.days.every(day=>day.estimatedMinutes<90)).toBe(true);
  expect(high.days.every(day=>day.durationFidelity.status==='short-justified' && day.durationFidelity.reasons.length>0)).toBe(true);
});
it('preserves full-body choices through backup and plan replacement',()=>{
  const profile=profileFor(3,45),program=buildProgram(profile),state=blankState();
  state.profile=profile;state.program=program;
  verify(deserializeState(serializeState(state)).program,profile);
  verify(buildReplacementProgram(profile,program,[]),profile);
});
it('keeps explicit weekdays and uses the same live feasibility check',()=>{
  const profile=profileFor(3,30);
  profile.trainingPreferences=profile.trainingPreferences.replace('Day 1:','Tue:').replace('Day 2:','Thu:').replace('Day 3:','Sun:');
  expect(customSplitValidation(profile).valid).toBe(true);
  const program=buildProgram(profile);verify(program,profile);
  expect(program.days.map(day=>day.weekday)).toEqual(['Tue','Thu','Sun']);
});
it('stops impossible time and equipment requests instead of overflowing or silently changing the selection',()=>{
  for(const profile of [profileFor(3,5),profileFor(3,30,'Intermediate',{environment:'Home gym',equipment:['bodyweight only']})]){
    expect(customSplitValidation(profile).valid).toBe(false);
    expect(()=>buildProgram(profile)).toThrow(expect.objectContaining({code:'custom-split-conflict'}));
  }
});
it('checks weekly accessory coverage even when every day still has the four full-body movements',()=>{
  const profile=profileFor(3,30),program=buildProgram(profile);
  const requested=parseCustomWeeklyStructure(profile.trainingPreferences,3);
  expect(customWorkoutFidelityErrors(program,requested,id=>exerciseCatalog[id],profile)).toEqual([]);
  for(const day of program.days)day.exercises=day.exercises.filter(e=>exerciseCatalog[e.exerciseId].pattern!=='calf');
  expect(customWorkoutFidelityErrors(program,requested,id=>exerciseCatalog[id],profile))
    .toContain('Full-body workouts do not cover all selected muscle groups across the week.');
});
it('keeps a mixed week faithful while a single full-body block includes its own calves and core',()=>{
  const profile=profileFor(3,60);
  const first=profile.trainingPreferences.split('\n')[0];
  profile.trainingPreferences=`${first}\nDay 2: Chest & Back\nDay 3: Quads & Hamstrings`;
  const program=buildProgram(profile),patterns=program.days[0].exercises.map(e=>exerciseCatalog[e.exerciseId].pattern);
  expect(patterns).toEqual(expect.arrayContaining(['calf','core']));
  expect(program.days[1].customFocus).toEqual(['chest','back']);
  expect(program.days[2].customFocus).toEqual(['quads','hamstrings']);
});
