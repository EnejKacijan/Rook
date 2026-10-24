import {expect,it} from 'vitest';
import {customWorkoutFidelityErrors} from './customWorkoutFidelity.js';
import {parseCustomWeeklyStructure} from './customTrainingStructure.js';
import {customWorkoutDraft,customWorkoutText,toggleCustomWorkoutFocus} from './customWeeklyWorkouts.js';
import {blankState,buildProgram,buildReplacementProgram,exerciseCatalog,isExerciseAutoGeneratable,validateProgram,serializeState,deserializeState} from './domain.js';

// Independent expectations for each visible muscle button. Do not use the
// generator's eligibility helper as the oracle for the generated exercises.
const expectedPatterns={
  chest:['horizontal-push','incline-push','chest-isolation'],
  back:['horizontal-pull','vertical-pull','upper-back-pull'],
  shoulders:['vertical-push','shoulder-isolation','rear-delt'],
  biceps:['elbow-flexion'],triceps:['elbow-extension'],
  quads:['squat','single-leg','knee-extension'],hamstrings:['hinge','knee-flexion'],
  glutes:['hip-extension'],calves:['calf'],core:['core'],
};
const weeks=[
  [['chest','back','shoulders','biceps','triceps'],['quads','hamstrings','glutes','calves','core']],
  [['chest','back'],['shoulders','biceps','triceps'],['quads','hamstrings','glutes','calves']],
  [['chest','triceps'],['back','biceps'],['quads','hamstrings','glutes','calves'],['shoulders','core']],
  [['chest','triceps'],['back','biceps'],['quads','calves'],['shoulders','core'],['hamstrings','glutes']],
  [['chest'],['back'],['quads'],['shoulders'],['biceps','triceps'],['hamstrings','glutes','calves','core']],
];
const fixedDays={2:['Tue','Sat'],3:['Mon','Wed','Fri'],4:['Mon','Tue','Thu','Sat'],5:['Mon','Tue','Thu','Fri','Sat'],6:['Mon','Tue','Wed','Thu','Fri','Sat']};
function profileFor(blocks,overrides={}){
  const rows=customWorkoutDraft();
  for(const [index,keys]of blocks.entries())for(const key of keys)rows[index].focus=toggleCustomWorkoutFocus(rows[index].focus,key);
  return {...blankState().profile,goal:'Build muscle',experience:'Intermediate',
    trainingSplitChoice:'other',trainingPreferences:customWorkoutText(rows,blocks.length),
    daysPerWeek:blocks.length,availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    equipment:['full gym'],environment:'Commercial gym',sessionMinutes:60,...overrides};
}
function assertGeneratedMuscles(program,blocks,profile){
  expect(program.days).toHaveLength(blocks.length);
  expect(program.profileSnapshot.trainingPreferences).toBe(profile.trainingPreferences);
  for(const [index,day]of program.days.entries()){
    expect(day.customFocus,`block ${index+1} retains its own choices`).toEqual(blocks[index]);
    const patterns=day.exercises.map(exercise=>exerciseCatalog[exercise.exerciseId].pattern);
    const allowed=new Set(blocks[index].flatMap(key=>expectedPatterns[key]));
    expect(patterns.every(pattern=>allowed.has(pattern)),`block ${index+1}: unrelated exercise patterns ${patterns}`).toBe(true);
    for(const key of blocks[index])expect(patterns.some(pattern=>expectedPatterns[key].includes(pattern)),`block ${index+1}: missing ${key}`).toBe(true);
    expect(day.exercises.every(exercise=>isExerciseAutoGeneratable(exerciseCatalog[exercise.exerciseId],profile))).toBe(true);
  }
  expect(validateProgram(program,profile,{requireProgramQuality:true})).toEqual({valid:true,errors:[]});
}
const configurations=[
  ['baseline',{}],['short beginner',{experience:'Beginner',sessionMinutes:30}],
  ['strength',{goal:'Get stronger',experience:'Advanced',sessionMinutes:45}],
  ['athletic',{goal:'Athletic performance'}],
  ['machines',{exercisePreference:'Prefer machines'}],['free weights',{exercisePreference:'Prefer free weights'}],
  ['home dumbbells',{environment:'Home gym',equipment:['dumbbells','bench']}],
  ['bodyweight only',{environment:'Home gym',equipment:['bodyweight only'],sessionMinutes:45}],
  ['other weekly priorities',{priorities:['Calves','Abs / core'],prioritySources:{manual:['Calves','Abs / core'],physiqueConfirmed:[]}}],
  ['exercise restriction',{avoid:'Avoid Leg Press',sessionMinutes:45}],
  ['fixed calendar',{}],['fewer sets',{effortStyle:'Fewer hard sets · 2 sets · 1 RIR'}],
];
const matrix=weeks.flatMap(blocks=>configurations.map(([name,overrides])=>({
  label:`${blocks.length} workouts / ${name}`,blocks,name,
  profile:profileFor(blocks,name==='fixed calendar'?{...overrides,availableDays:fixedDays[blocks.length]}:overrides),
})));
it.each(matrix)('$label preserves every selected group without adding unrelated exercises',({blocks,name,profile})=>{
  let program;
  try{program=buildProgram(profile);}catch(error){
    if(name==='baseline')throw error;
    expect(error.code).toBe('custom-split-conflict');
    expect(error.clarification?.reason).not.toBe('focus-mismatch');
    // An impossible selection must stop, never return a different split.
    return;
  }
  assertGeneratedMuscles(program,blocks,profile);
  if(name==='baseline'){
    const state=blankState();state.profile=profile;state.program=program;
    assertGeneratedMuscles(deserializeState(serializeState(state)).program,blocks,profile);
  }
});
it('keeps the requested block order and muscles when replacing an existing plan with workout history',()=>{
  const blocks=weeks[1],profile=profileFor(blocks);
  const previous=buildProgram({...profile,trainingSplitChoice:'recommended',trainingPreferences:''});
  const history=[{exercises:previous.days.flatMap(day=>day.exercises).map(exercise=>({exerciseId:exercise.exerciseId,sets:[{completed:true}]}))}];
  const replacement=buildReplacementProgram(profile,previous,history);
  expect(replacement.source).toBe('personalized-replacement');
  assertGeneratedMuscles(replacement,blocks,profile);
});
it('can build two custom full-body workouts without an artificial muscle-count cap',()=>{
  const blocks=Array.from({length:2},()=>['chest','back','quads','hamstrings','core']);
  const profile=profileFor(blocks,{sessionMinutes:60,experience:'Beginner'});
  assertGeneratedMuscles(buildProgram(profile),blocks,profile);
});

const requested=parseCustomWeeklyStructure('Mon: Chest & Back\nThu: Quads & Calves',2);
const valid=()=>({days:[
  {weekday:'Mon',customFocus:['chest','back'],exercises:[{exerciseId:'machine-chest-press'},{exerciseId:'chest-supported-row'}]},
  {weekday:'Thu',customFocus:['quads','calves'],exercises:[{exerciseId:'leg-press'},{exerciseId:'seated-calf-raise'}]},
]});
const check=program=>customWorkoutFidelityErrors(program,requested,id=>exerciseCatalog[id]);
it('allows normal assistance from secondary muscles in a selected compound exercise',()=>{
  expect(exerciseCatalog['machine-chest-press'].muscles).toContain('Arms');
  expect(check(valid())).toEqual([]);
});
it('rejects an unrelated exercise appended after normal generation or volume balancing',()=>{
  const program=valid();program.days[0].exercises.push({exerciseId:'cable-triceps-pressdown'});
  expect(check(program).some(error=>error.includes('Workout 1')&&error.includes('outside'))).toBe(true);
});
it('rejects a missing selected group even when the remaining exercises are relevant',()=>{
  const program=valid();program.days[1].exercises.pop();
  expect(check(program).some(error=>error.includes('Workout 2')&&error.includes('missing'))).toBe(true);
});
it('uses original selections to reject swapped exercises even if generated labels were also changed',()=>{
  const program=valid();[program.days[0].exercises,program.days[1].exercises]=[program.days[1].exercises,program.days[0].exercises];
  [program.days[0].customFocus,program.days[1].customFocus]=[program.days[1].customFocus,program.days[0].customFocus];
  expect(check(program).filter(error=>error.includes('outside'))).toHaveLength(2);
});
it('rejects losing a block or its selection metadata',()=>{
  const program=valid();program.days.pop();expect(check(program)).toHaveLength(1);
  const missing=valid();delete missing.days[0].customFocus;expect(check(missing)[0]).toContain('Workout 1');
});
it('retains explicit weekdays rather than silently moving a selected block',()=>{
  const program=valid();program.days[0].weekday='Wed';expect(check(program)).toContain('Workout 1 (Chest & Back) does not preserve its selected weekday.');
});
it('rejects an unresolved exercise identity in the final result',()=>{
  const program=valid();program.days[0].exercises.push({exerciseId:'missing-id'});expect(check(program).length).toBeGreaterThan(0);
});
