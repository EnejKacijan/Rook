import {expect,it} from 'vitest';
import {blankState,buildProgram,exerciseCatalog,isExerciseAllowed,isExerciseAutoGeneratable,weeklyDirectVolume,validateProgram,serializeState,deserializeState} from './domain.js';
import {customWorkoutDraft,customWorkoutText,toggleCustomWorkoutFocus,CUSTOM_WORKOUT_MUSCLES} from './customWeeklyWorkouts.js';
import {normalizeGymEquipment} from './gymProfiles.js';
import {generateWarmup} from './warmups.js';
import {generatedSessionTiming} from './durationPlanning.js';

function profile(frequency=3,minutes=60,overrides={}) {
  const rows=customWorkoutDraft();
  for(const row of rows)for(const key of CUSTOM_WORKOUT_MUSCLES)row.focus=toggleCustomWorkoutFocus(row.focus,key);
  return {...blankState().profile,goal:'Build muscle',experience:'Intermediate',daysPerWeek:frequency,sessionMinutes:minutes,
    trainingSplitChoice:'other',trainingPreferences:customWorkoutText(rows,frequency),equipment:['full gym'],environment:'Commercial gym',
    availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],...overrides};
}
const exercises=program=>program.days.flatMap(day=>day.exercises);
function check(program,p) {
  expect(validateProgram(program,p,{requireProgramQuality:true})).toEqual({valid:true,errors:[]});
  for(const day of program.days) {
    expect(day.estimatedMinutes).toBeLessThanOrEqual(p.sessionMinutes);
    expect(day.estimatedMinutes).toBe(generatedSessionTiming(day.exercises,p,exerciseCatalog).minutes);
    expect(day.exercises.every(e=>isExerciseAllowed(exerciseCatalog[e.exerciseId],p))).toBe(true);
  }
}
it('fits moderate effort without conflicting with its protected three-set minimum',()=>{
  const p=profile(4,60,{effortStyle:'More moderate sets · 3–4 sets · 2–3 RIR'}),program=buildProgram(p);check(program,p);
  expect(exercises(program).every(e=>e.sets.length>=3 && e.sets.length<=4)).toBe(true);
  for(const day of program.days.filter(day=>day.fullBodyLight))expect(day.exercises.reduce((n,e)=>n+e.sets.length,0)).toBeLessThanOrEqual(18);
});
it.each([
  [6,{effortStyle:'Fewer hard sets · 2 sets · 1 RIR'}],
  [2,{environment:'Home gym',equipment:['dumbbells']}],
])('tries compatible compact alternatives before rejecting %i short sessions', (frequency,overrides)=>{
  const p=profile(frequency,30,overrides),before=structuredClone(p),program=buildProgram(p);check(program,p);expect(p).toEqual(before);
  if(frequency===6)expect(exercises(program).some(e=>exerciseCatalog[e.exerciseId].equipment.includes('resistance bands'))).toBe(false);
  expect(program.days).toHaveLength(frequency);
  for(const day of program.days)expect(day.exercises).toHaveLength(5);
  if(frequency===6)expect(exercises(program).every(e=>e.sets.length===2 && (e.targetRir===1 || e.targetRir===null))).toBe(true);
  const prescription=program=>program.days.map(day=>day.exercises.map(e=>[e.exerciseId,e.sets.length,e.repMin,e.repMax,e.restSeconds,e.targetRir]));
  expect(prescription(buildProgram(p))).toEqual(prescription(program));
});
it('does not require lateral machines or invent a preacher station for a barbell home gym',()=>{
  const p=profile(3,60,{goal:'Get stronger',environment:'Home gym',equipment:['barbell/rack/bench']}),program=buildProgram(p);check(program,p);
  expect(exercises(program).some(e=>exerciseCatalog[e.exerciseId].pattern==='vertical-push')).toBe(true);
  expect(exercises(program).some(e=>e.exerciseId==='preacher-curl')).toBe(false);
  expect(isExerciseAutoGeneratable(exerciseCatalog['preacher-curl'],p)).toBe(false);
  for(const day of program.days)for(const e of day.exercises.filter(e=>exerciseCatalog[e.exerciseId].pattern==='vertical-push'))
    expect(generateWarmup(day,p,exerciseCatalog).rampUpSets.some(group=>group.exerciseId===e.exerciseId)).toBe(true);
});
it.each(['band-chest-press','band-fly','band-row','band-lat-pulldown','band-leg-curl','band-triceps-pressdown'])('requires the declared anchor for %s',id=>{
  const p=profile(3,45,{environment:'Home gym',equipment:['dumbbells','resistance bands']});
  expect(isExerciseAllowed(exerciseCatalog[id],p)).toBe(false);
  expect(isExerciseAllowed(exerciseCatalog[id],{...p,equipment:[...p.equipment,'secure band anchor']})).toBe(true);
});
it('retains anchor selection and uses self-supported band movements without it',()=>{
  expect(normalizeGymEquipment(['resistance bands','secure band anchor'])).toEqual(['resistance bands','secure band anchor']);
  const p=profile(3,45,{environment:'Home gym',equipment:['dumbbells','resistance bands']}),program=buildProgram(p);check(program,p);
  expect(isExerciseAllowed(exerciseCatalog['band-curl'],p)).toBe(true);
  expect(isExerciseAllowed(exerciseCatalog['band-overhead-press'],p)).toBe(true);
  expect(exercises(program).some(e=>exerciseCatalog[e.exerciseId].equipment.includes('secure band anchor'))).toBe(false);
});
it('preserves an explicitly selected home anchor and accepted prescriptions through reload',()=>{
  const state=blankState();state.profile=profile(3,45,{environment:'Home gym',equipment:['resistance bands','secure band anchor']});
  state.program=buildProgram(state.profile);
  const restored=deserializeState(serializeState(state));
  expect(restored.profile.equipment).toContain('secure band anchor');
  const prescription=p=>p.days.map(day=>day.exercises.map(e=>[e.exerciseId,e.sets.length,e.repMin,e.repMax,e.targetRir,e.restSeconds]));
  expect(prescription(restored.program)).toEqual(prescription(state.program));
});
it('honors machine alternatives for posterior slots when the profile prefers them',()=>{
  const p=profile(3,45,{exercisePreference:'Prefer machines'}),program=buildProgram(p);check(program,p);
  for(const e of exercises(program).filter(e=>e.fullBodyBase && ['hinge','knee-flexion','hip-extension'].includes(exerciseCatalog[e.exerciseId].pattern)))
    expect(exerciseCatalog[e.exerciseId].equipment.some(key=>['machines','cables'].includes(key))).toBe(true);
  expect(exercises(program).filter(e=>exerciseCatalog[e.exerciseId].pattern==='knee-flexion').length).toBeGreaterThanOrEqual(2);
});
it('prepares later demanding hinges and counts those ramps in the session clock',()=>{
  const p=profile(3,45,{exercisePreference:'Prefer free weights'}),program=buildProgram(p);check(program,p);
  for(const day of program.days)for(const e of day.exercises.filter(e=>exerciseCatalog[e.exerciseId].pattern==='hinge' && exerciseCatalog[e.exerciseId].fatigueCost==='high'))
    expect(generateWarmup(day,p,exerciseCatalog).rampUpSets.some(group=>group.exerciseId===e.exerciseId)).toBe(true);
  expect(exerciseCatalog['step-up'].unilateral).toBe(true);
});
it('places supported athletic power first, preserves quality effort, and warms up the loaded main lifts too',()=>{
  const p=profile(3,60,{goal:'Athletic performance'}),program=buildProgram(p);check(program,p);
  for(const day of program.days){
    const power=day.exercises[0];expect(exerciseCatalog[power.exerciseId].kind).toBe('power');
    expect(power.targetRir).toBeNull();expect(power.effortMode).toBe('velocity-quality');expect(power.restSeconds).toBeGreaterThanOrEqual(120);
    const main=day.exercises.find(e=>e.programmingRole==='main');
    expect(generateWarmup(day,p,exerciseCatalog).rampUpSets.some(group=>group.exerciseId===main.exerciseId)).toBe(true);
    const preparation=generateWarmup(day,p,exerciseCatalog).rampUpSets.find(group=>group.exerciseId===power.exerciseId).sets;
    expect(preparation).toHaveLength(1);expect(preparation[0].reps).toBe(3);
    expect(preparation[0].loadPercent).toBeNull();expect(preparation[0].weight).toBeNull();
    expect(preparation[0].loadInstruction).toContain('controlled landings');
  }
  const compact=buildProgram(profile(3,45,{goal:'Athletic performance'}));
  expect(exercises(compact).some(e=>exerciseCatalog[e.exerciseId].kind==='power')).toBe(false);
  expect(compact.generationGuidance.find(note=>note.code==='athletic-scope').message).toContain('strength foundation');
});
it.each([2,4,6])('keeps optional overhead work from falsely rejecting %i moderate-effort 45-minute days',frequency=>{
  const p=profile(frequency,45,{effortStyle:'More moderate sets · 3–4 sets · 2–3 RIR'}),program=buildProgram(p);check(program,p);
  expect(exercises(program).every(e=>e.sets.length>=3)).toBe(true);
});
it('reallocates discretionary work to real manual priorities while preserving coverage and time',()=>{
  const neutral=buildProgram(profile(2,60));
  const p=profile(2,60,{priorities:['Chest','Back'],prioritySources:{manual:['Chest','Back'],physiqueConfirmed:[]}}),program=buildProgram(p);check(program,p);
  const baseline=weeklyDirectVolume(neutral),volume=weeklyDirectVolume(program);
  expect(volume.Chest).toBeGreaterThanOrEqual(baseline.Chest+2);expect(volume.Back).toBeGreaterThanOrEqual(baseline.Back+2);
  expect(program.priorityConstrained?.Chest).toBeUndefined();expect(program.priorityConstrained?.Back).toBeUndefined();
  expect(exercises(program).some(e=>exerciseCatalog[e.exerciseId].pattern==='shoulder-isolation')).toBe(true);
  expect(volume.Core).toBeGreaterThan(0);expect(volume.Calves).toBeGreaterThan(0);
  const tight=buildProgram(profile(2,30,{priorities:['Chest','Back'],prioritySources:{manual:['Chest','Back'],physiqueConfirmed:[]}}));
  expect(tight.priorityConstrained.Back.reason).toBe('time-recovery-or-volume');
  expect(tight.generationGuidance.find(note=>note.code==='limited-priority-dose').message).toContain('Chest and Back');
});
it('adds useful quad work in a partial legs split by reallocating posterior sets',()=>{
  const p=profile(3,45,{trainingPreferences:'Day 1: Push\nDay 2: Pull\nDay 3: Legs'}),program=buildProgram(p);check(program,p);
  const legs=program.days[2];expect(legs.exercises.some(e=>exerciseCatalog[e.exerciseId].pattern==='knee-extension')).toBe(true);
  const quads=legs.exercises.filter(e=>['squat','knee-extension','single-leg'].includes(exerciseCatalog[e.exerciseId].pattern)).reduce((n,e)=>n+e.sets.length,0);
  expect(quads).toBeGreaterThanOrEqual(6);expect(legs.exercises.reduce((n,e)=>n+e.sets.length,0)).toBeLessThanOrEqual(16);
});
it('finishes a PPL session sooner rather than padding non-priority accessories to five sets',()=>{
  const p=profile(6,60,{trainingSplitChoice:'predefined',trainingPreferences:'Push / Pull / Legs'}),program=buildProgram(p);check(program,p);
  for(const e of exercises(program))expect(e.sets.length).toBeLessThanOrEqual(exerciseCatalog[e.exerciseId].kind==='isolation'?3:4);
  expect(program.days.some(day=>day.durationFidelity.status==='short-justified')).toBe(true);
  expect(exerciseCatalog['straight-arm-cable-pulldown'].movementPattern).toBe('lat-isolation');
});
it.each([[6,60,'Push / Pull / Legs'],[4,45,'Upper / Lower split']])('avoids stacking two unilateral lower blocks in a default %i-day split', (frequency,minutes,split)=>{
  const p=profile(frequency,minutes,{trainingSplitChoice:'predefined',trainingPreferences:split}),program=buildProgram(p);check(program,p);
  for(const day of program.days)expect(day.exercises.filter(e=>exerciseCatalog[e.exerciseId].unilateral &&
    ['hinge','squat','single-leg'].includes(exerciseCatalog[e.exerciseId].pattern)).length).toBeLessThanOrEqual(1);
});
it('uses compound vertical pulling in a partial chest/back day when it can fit without losing selected muscles',()=>{
  const p=profile(3,45,{trainingPreferences:'Day 1: Chest & Back\nDay 2: Shoulders & Biceps & Triceps\nDay 3: Quads & Hamstrings & Glutes & Calves'}),program=buildProgram(p);check(program,p);
  expect(program.days[0].exercises.some(e=>exerciseCatalog[e.exerciseId].pattern==='vertical-pull' && exerciseCatalog[e.exerciseId].kind==='compound')).toBe(true);
  expect(weeklyDirectVolume(program).Back).toBeGreaterThanOrEqual(6);
});
it('explains difficulty calibration when a compact home plan uses bodyweight work',()=>{
  const program=buildProgram(profile(2,30,{environment:'Home gym',equipment:['dumbbells']}));
  expect(program.generationGuidance.find(note=>note.code==='bodyweight-effort').message).toContain('harder variation');
});
it.each([
  [3,60,'other'],[4,60,'other'],[3,60,'recommended'],
])('keeps manual priority reallocations inside moderate-effort set limits for %i days', (frequency,minutes,choice)=>{
  const p=profile(frequency,minutes,{trainingSplitChoice:choice,effortStyle:'More moderate sets · 3–4 sets · 2–3 RIR',
    priorities:['Chest','Back'],prioritySources:{manual:['Chest','Back'],physiqueConfirmed:[]}});
  const program=buildProgram(p);check(program,p);
  expect(exercises(program).every(e=>e.sets.length>=3 && e.sets.length<=4)).toBe(true);
});
it('still explains impossible time/equipment requests rather than silently changing the split',()=>{
  for(const p of [profile(3,5),profile(3,30,{environment:'Home gym',equipment:['bodyweight only']})]){
    try{buildProgram(p);throw Error('Expected conflict');}catch(error){expect(error.code).toBe('custom-split-conflict');expect(error.generationDiagnostics.budget).toBe(p.sessionMinutes);}
  }
});
