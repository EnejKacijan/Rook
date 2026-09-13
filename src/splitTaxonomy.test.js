import { describe, it, expect, vi } from 'vitest';
import { CUSTOM_FOCUSES, CUSTOM_FOCUS_ALIASES, parseCustomWeeklyStructure, customFocusPatterns, customFocusSatisfied } from './customTrainingStructure.js';
import { TRAINING_STRUCTURES, PREFERRED_TEMPLATE_BY_SPLIT, onboardingSplitOptions, namedTrainingStructure, resolveOtherWeeklyStructure } from './splitPreferences.js';
import { blankState, buildProgram, customSplitValidation, customSplitIsValid, exerciseCatalog, serializeState, deserializeState, validateProgram } from './domain.js';
import { localTrainingSafetyResolution } from './trainingSafety.js';

const profile = (text, days, extra={}) => ({...blankState().profile,goal:'Build muscle',experience:'Beginner',trainingSplitChoice:'other',trainingPreferences:text,
  daysPerWeek:days,sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],...extra});
const aliases = Object.entries(CUSTOM_FOCUSES).flatMap(([key,definition]) =>
  [key,definition.label,...(CUSTOM_FOCUS_ALIASES[key]||[])].map(text=>({key,text})));
const custom = [
  ['Pecs + triceps / Back + bicep / Quadriceps + calf / Deltoids + arms / Total body', ['chest-triceps','back-biceps','quads-calves','shoulders-arms','full-body']],
  ['Horizontal push + horizontal pull / Squat + hip hinge / Vertical push + vertical pull', ['horizontal-push-horizontal-pull','squat-hinge','vertical-push-vertical-pull']],
  ['Chest + front delts / Back + rear delts / Legs / Side delts + arms', ['chest-front-delts','back-rear-delts','legs','side-delts-arms']],
  ['Chest + back / Front delts + side delts + rear delts + arms / Legs', ['chest-back','front-delts-side-delts-rear-delts-arms','legs']],
  ['Quads + hamstrings / Pectorals + abdominals / Back + biceps', ['quads-hamstrings','chest-core','back-biceps']],
  ['Upper body / Lower body / Total-body', ['upper','lower','full-body']],
  ['Chest + back / Legs', ['chest-back','legs']],
  ['Chest / Back / Legs / Deltoids / Arms / Core', ['chest','back','legs','shoulders','arms','core']],
  ['Gluteals + hamstring / Pecs + tricep / Back + bicep / Quad + abs', ['glutes-hamstrings','chest-triceps','back-biceps','quads-core']],
  ['Thursday: Upper body, Monday: Lower body', ['upper','lower']],
];
const blocked = [
  ['Anterior / Posterior',2,'ambiguous-family'], ['Anterior chain / Posterior chain',2,'ambiguous-family'],
  ['Front / Back',2,'ambiguous-family'], ['Upper Strength / Lower Strength',2,'qualifier'],
  ['Upper A / Lower B',2,'qualifier'], ['Power / Light',2,'qualifier'],
  ['Upper hypertrophy / Lower heavy',2,'qualifier'],
  ['Lower back / Chest',2,'unsupported-focus'], ['Upper back / Legs',2,'unsupported-focus'],
  ['Upper chest / Back',2,'unsupported-focus'], ['Forearms / Lats',2,'unsupported-focus'],
  ['Carry / Rotation',2,'unsupported-focus'], ['Lunges / Chest',2,'unsupported-focus'],
  ['PPLUL',4,'frequency'], ['Upper / Lower ×3',4,'frequency'], ['Push / Pull / Legs ×2',5,'frequency'],
  ['Chest / Back / Legs',4,'frequency'], ['Push / Pull / Legs + Arnold Split',5,'composition'],
  ['Full Body + Chest + Back + Full Body',3,'composition'],
  ['Chest // Back',2,'unknown-focus'], ['Chest + / Back',2,'unknown-focus'],
  ['Chest or back / Legs',2,'unknown-focus'], ['Chest / Back /',2,'unknown-focus'],
  ['Mon: Chest / Mon: Back',2,'unknown-focus'], ['Mon: Chest / Back',2,'unknown-focus'],
  ['Quantum split',3,'unknown-focus'], ['Peculiar / Bicep',2,'unknown-focus'],
];

describe('research-derived split vocabulary, exact semantics rather than booleans',()=>{
  it.each(aliases)('primitive alias $text → $key',({text,key})=>{
    for(const value of [text,text.toUpperCase(),`  ${text.replace(/ /g,'   ')}  `,text.replace(/-/g,'\u2011')])
      expect(parseCustomWeeklyStructure(value,1)?.[0].concepts).toEqual([key]);
  });
  it.each(custom)('explicit corpus: %s',(text,keys)=>{
    const variants=[text,text.toUpperCase(),text.replace(/\s*\/\s*/g,'; '),text.replace(/\s*\/\s*/g,'\n'),text.replace(/\+/g,'and'),text.replace(/\+/g,'&')];
    for(const value of variants)expect(parseCustomWeeklyStructure(value,keys.length)?.map(s=>s.key)).toEqual(keys);
    const p=profile(text,keys.length),before=structuredClone(p),validation=customSplitValidation(p);
    expect(validation).toEqual({valid:true});
    const program=buildProgram(p),state={...blankState(),profile:p,program};
    for(const saved of [state,deserializeState(serializeState(state))]){
      expect(saved.profile.trainingPreferences).toBe(text);
      expect(saved.program.days.map(d=>d.customFocus.join('-'))).toEqual(keys);
      expect(validateProgram(saved.program,p,{requireProgramQuality:true}).valid).toBe(true);
      for(const day of saved.program.days)expect(customFocusSatisfied(day.customFocus,day.exercises.map(e=>exerciseCatalog[e.exerciseId]))).toBe(true);
    }
    expect(p).toEqual(before);
  });
  it.each(blocked)('honest clarification: %s',(text,days,reason)=>{
    const p=profile(text,days),before=structuredClone(p);
    expect(resolveOtherWeeklyStructure(text,days)).toBeNull();
    expect(customSplitValidation(p)).toMatchObject({valid:false,reason});
    expect(()=>buildProgram(p)).toThrowError(expect.objectContaining({code:'custom-split-conflict'}));
    expect(p).toEqual(before);
  });
  it.each([2,3,4,5,6])('%i-day visible presets and canonical aliases cannot drift',days=>{
    for(const option of onboardingSplitOptions(days).filter(o=>TRAINING_STRUCTURES[o.id]))
      for(const text of [option.label,option.value])expect(resolveOtherWeeklyStructure(text,days)).toEqual({kind:'preset',id:option.id});
    for(const [id,definition] of Object.entries(TRAINING_STRUCTURES))for(const alias of definition.aliases){
      expect(namedTrainingStructure(alias)?.id).toBe(id);
      expect(resolveOtherWeeklyStructure(alias,days)).toEqual(PREFERRED_TEMPLATE_BY_SPLIT[id][days]?{kind:'preset',id}:null);
    }
  });
  it('only documented repetition labels normalize x/×, never arbitrary repeats',()=>{
    expect(resolveOtherWeeklyStructure('Upper / Lower x3',6)).toEqual({kind:'preset',id:'upper-lower'});
    expect(resolveOtherWeeklyStructure('Push / Pull / Legs x2',6)).toEqual({kind:'preset',id:'push-pull-legs'});
    expect(resolveOtherWeeklyStructure('Arnold x2',6)).toBeNull();
    expect(resolveOtherWeeklyStructure('Full body x5',5)).toBeNull();
  });
  it('composition uses canonical cycles, never leftover-day truncation',()=>{
    expect(resolveOtherWeeklyStructure('PPL + Upper body / Lower body',5)?.sessions.map(s=>s.key)).toEqual(['push','pull','legs','upper','lower']);
    expect(resolveOtherWeeklyStructure('Push / Pull / Legs + Arnold Split',6)?.sessions.map(s=>s.key)).toEqual(['push','pull','legs','chest-back','shoulders-arms','legs']);
    expect(resolveOtherWeeklyStructure('Chest + Back / Legs',2)?.sessions[0].concepts).toEqual(['chest','back']);
  });
  it('motion targets are required even when combined with a broader muscle focus',()=>{
    expect(customFocusPatterns(['horizontal-push'])).toEqual(['horizontal-push']);
    expect(customFocusSatisfied(['horizontal-push','chest'],[{pattern:'chest-isolation'}])).toBe(false);
    expect(customFocusSatisfied(['horizontal-push','chest'],[{pattern:'horizontal-push'},{pattern:'chest-isolation'}])).toBe(true);
    expect(customFocusSatisfied(['rear-delts'],[{pattern:'vertical-push'}])).toBe(false);
    expect(customFocusSatisfied(['rear-delts'],[{pattern:'rear-delt'}])).toBe(true);
  });
  it.each(custom.slice(1,4))('new primitives remain exact or block across constraints: %s',(text,keys)=>{
    for(const goal of ['Build muscle','Get stronger','Stay fit'])for(const sessionMinutes of [30,45,60]){
      const p=profile(text,keys.length,{goal,sessionMinutes});
      if(customSplitIsValid(p))for(const day of buildProgram(p).days)
        expect(customFocusSatisfied(day.customFocus,day.exercises.map(e=>exerciseCatalog[e.exerciseId]))).toBe(true);
      else expect(()=>buildProgram(p)).toThrowError(expect.objectContaining({code:'custom-split-conflict'}));
    }
  });
  it('capability, schedule and safety remain separate from syntax',()=>{
    const text=custom[1][0];
    expect(customSplitValidation(profile(text,3,{environment:'Home gym',equipment:['bodyweight only']}))).toMatchObject({valid:false,reason:'capability'});
    expect(customSplitValidation(profile('PPL',3,{environment:'Home gym',equipment:['bodyweight only']}))).toMatchObject({valid:false,reason:'equipment'});
    expect(customSplitValidation(profile('Monday: Chest + Back / Thursday: Legs',2,{availableDays:['Tue','Fri']}))).toMatchObject({valid:false,reason:'available-days'});
    const p=profile(text,3,{avoid:'Avoid deep knee flexion'}), safety=localTrainingSafetyResolution(p.avoid,Object.values(exerciseCatalog));
    expect(safety.status).toBe('needs_semantic_review');
    expect(customSplitIsValid(p)).toBe(true); // existing separate restriction decision owns this
    expect(customSplitIsValid(profile(text,3,{sessionMinutes:5}))).toBe(false);
    const restricted=profile(text,3,{avoid:'Avoid Bench Press'});
    if(customSplitIsValid(restricted))expect(buildProgram(restricted).days.flatMap(d=>d.exercises).some(e=>e.exerciseId==='bench-press')).toBe(false);
  });
  it('equivalent aliases reuse the bounded capability result, constraints invalidate it',()=>{
    const first=profile(custom[2][0],4,{age:37}),random=vi.spyOn(Math,'random');
    try{
      expect(customSplitIsValid(first)).toBe(true);const count=random.mock.calls.length;
      expect(count).toBeGreaterThan(0);
      expect(customSplitIsValid({...first,trainingPreferences:'Pecs + anterior deltoids; Back + posterior delts; Leg; Lateral delts + arm'})).toBe(true);
      expect(random.mock.calls.length).toBe(count);
      expect(customSplitIsValid({...first,environment:'Home gym',equipment:['bodyweight only']})).toBe(false);
    }finally{random.mockRestore();}
  });
});
