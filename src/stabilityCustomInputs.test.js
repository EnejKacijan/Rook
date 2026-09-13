import {describe,it,expect} from 'vitest';
import {blankState,buildProgram,sessionStructureKey,serializeState,deserializeState,exerciseCatalog} from './domain.js';
import {localTrainingSafetyResolution} from './trainingSafety.js';
import {customSplitSequence,onboardingSplitOptions,selectStructuralTemplate} from './splitPreferences.js';

const profile=(text,days=5,avoid='')=>({...blankState().profile,goal:'Build muscle',experience:'Intermediate',trainingPreferences:text,daysPerWeek:days,availableDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],equipment:['full gym'],environment:'Commercial gym',sessionMinutes:60,avoid});
describe('stability custom split and restrictions',()=>{
  it.each([
    ['Push / Pull / Legs / Upper / Lower',5,['push','pull','legs','upper','lower']],
    ['Upper / Lower / Full Body',3,['upper','lower','full-body']],
  ])('preserves %s through generation and storage',(text,days,sequence)=>{
    const state=blankState();state.profile=profile(text,days);state.program=buildProgram(state.profile);
    expect(state.program.days.map(sessionStructureKey)).toEqual(sequence);
    expect(state.program.trainingStructure.userRequestedSequence).toEqual(sequence);
    expect(deserializeState(serializeState(state)).program.days.map(sessionStructureKey)).toEqual(sequence);
  });
  it.each([['Push / Pull / Legs / Push / Pull',5],['Push / Pull / Legs / Upper / Lower',4]])('blocks unrepresentable complete week %s',(text,days)=>{
    expect(()=>buildProgram(profile(text,days))).toThrow(/cannot be preserved/);
  });
  it.each(['Avoid overhead press','No jumping','Avoid Leg Press'])('keeps the known restriction %s with a custom split',avoid=>{
    const p=profile('Upper / Lower / Full Body',3,avoid),safety=localTrainingSafetyResolution(avoid,Object.values(exerciseCatalog));
    expect(safety.status).toBe('resolved');
    const plan=buildProgram(p);
    for(const day of plan.days)for(const entry of day.exercises){
      expect(safety.safety.constraints.avoidExerciseIds).not.toContain(entry.exerciseId);
      expect(safety.safety.constraints.avoidPatterns).not.toContain(exerciseCatalog[entry.exerciseId].pattern);
    }
    expect(plan.profileSnapshot.avoid).toBe(avoid);
  });
  it.each(['No barbell squats','Avoid deep knee flexion','Avoid made-up exercise'])('does not silently accept unresolved restriction %s',text=>{
    expect(localTrainingSafetyResolution(text,Object.values(exerciseCatalog)).status).toBe('needs_semantic_review');
  });
});

describe('owner Other split: never generate a default from partial/failed parsing',()=>{
  const custom=(text,days=5,avoid='')=>({...profile(text,days,avoid),trainingSplitChoice:'other'});
  it.each([
    ['push pull legs upper lower',5,['push','pull','legs','upper','lower']],
    ['Push / Pull / Legs / Upper / Lower',5,['push','pull','legs','upper','lower']],
    ['PPLUL',5,['push','pull','legs','upper','lower']],
    ['upper lower full body',3,['upper','lower','full-body']],
    ['chest back / shoulders arms / legs',3,['chest-back','shoulders-arms','legs']],
    ['upper / lower / upper / lower',4,['upper','lower','upper','lower']],
    ['push pull legs push pull',5,['push','pull','legs','push','pull']],
  ])('fully preserves %s and the Other intent across storage',(text,days,sequence)=>{
    const p=custom(text,days),state=blankState();state.profile=p;state.program=buildProgram(p);
    expect(state.program.days.map(sessionStructureKey)).toEqual(sequence);
    const restored=deserializeState(serializeState(state));
    expect(restored.profile.trainingPreferences).toBe(text);
    expect(restored.profile.trainingSplitChoice).toBe('other');
    expect(buildProgram(restored.profile).days.map(sessionStructureKey)).toEqual(sequence);
  });
  it.each([
    ['push pull legs + arnold split',5],['PPL + Arnold',5],
    ['bodybuilding split I used with my coach',5],
    ['upper / lower / upper / lower',5],['upper lower full body',5],
    ['Push Pull Legs plus something else',5],['',5],
    ['chest / back / shoulders / arms / legs',3],
  ])('blocks %s without manufacturing PPLUL or changing raw intent',(text,days)=>{
    const p=custom(text,days),before=structuredClone(p);
    for(let attempt=0;attempt<2;attempt++){
      let generated;
      try{generated=buildProgram(p);}catch(error){expect(error.code).toBe('custom-split-conflict');}
      expect(generated).toBeUndefined();expect(p).toEqual(before);
    }
  });
  it('guards the selection boundary before an unknown custom request gets a fallback template',()=>{
    for(const text of ['PPL + Arnold','bodybuilding split I used with my coach'])
      expect(()=>selectStructuralTemplate(custom(text),5)).toThrow(/couldn't map/);
    expect(customSplitSequence('push pull legs + arnold split')).toBeNull();
  });
  it('does not merge separately delimited body-part days',()=>{
    expect(customSplitSequence('chest / back / shoulders / arms / legs')).toEqual(['chest','back','shoulders','arms','legs']);
  });
  it('preserves an actual Choose for me and every predefined frequency option',()=>{
    for(const days of [2,3,4,5,6])for(const option of onboardingSplitOptions(days).filter(o=>o.id!=='other')){
      const p={...profile(option.value,days),trainingSplitChoice:option.id};
      expect(buildProgram(p).days.map(sessionStructureKey)).toEqual(buildProgram(profile(option.value,days)).days.map(sessionStructureKey));
    }
  });
  it('does not bypass exercise restrictions or equipment by honoring a custom order',()=>{
    const p=custom('upper lower full body',3,'No jumping');
    expect(buildProgram(p).days.map(sessionStructureKey)).toEqual(['upper','lower','full-body']);
    for(const day of buildProgram(p).days)for(const ex of day.exercises)expect(exerciseCatalog[ex.exerciseId].pattern).not.toBe('power-lower');
    expect(()=>buildProgram({...custom('push pull legs',3),equipment:['bodyweight only'],environment:'Home gym'})).toThrow(/cannot be preserved/);
  });
});
