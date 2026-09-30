import { describe, it, expect } from 'vitest';
import { blankState, buildProgram, deserializeState, serializeState } from './domain.js';
import { createPlanBuilderDraft, missingPlanBuilderStep, activatePlanBuilder, PLAN_BUILDER_STEPS, PLAN_EFFORT_STYLES } from './planBuilder.js';

export const completeProfile = () => ({ ...blankState().profile, ageRange:'30–39', goal:'Build muscle', experience:'Intermediate',
  daysPerWeek:3, availableDays:['Mon','Wed','Fri'], sessionMinutes:60, environment:'Commercial gym', equipment:['full gym'],
  trainingSplitChoice:'recommended', trainingPreferences:'', exercisePreference:'No preference' });

describe('canonical reviewed plan inputs', () => {
  it('prefills valid stored preferences without mutating the profile', () => {
    const profile=completeProfile(), before=structuredClone(profile), draft=createPlanBuilderDraft(profile);
    expect(missingPlanBuilderStep(draft)).toBeNull();
    for(const field of ['goal','experience','daysPerWeek','availableDays','sessionMinutes','equipment','exercisePreference','trainingSplitChoice']) expect(draft[field]).toEqual(profile[field]);
    draft.availableDays.push('Sat'); expect(profile).toEqual(before);
  });
  it.each(['ageRange','goal','experience','daysPerWeek','availableDays','sessionMinutes','environment','equipment','exercisePreference','trainingSplitChoice','effortStyle','priorities'])('asks for missing %s instead of inheriting a default', field => {
    const profile=completeProfile();profile[field]=null;
    if(field==='priorities')profile.prioritySources=null;
    const draft=createPlanBuilderDraft(profile);expect(missingPlanBuilderStep(draft)).not.toBeNull();
  });
  it('distinguishes missing/null from explicitly choosing No preference or ROOK chooses', () => {
    for(const value of [null,undefined]){
      const draft=createPlanBuilderDraft({...completeProfile(),exercisePreference:value,trainingSplitChoice:value});
      expect(draft.exercisePreference).toBeNull();expect(draft.trainingSplitChoice).toBeNull();
      expect(missingPlanBuilderStep(draft)).toBe('preferences');
      Object.assign(draft,{exercisePreference:'No preference',trainingSplitChoice:'recommended'});
      expect(missingPlanBuilderStep(draft)).toBeNull();
    }
  });
  it('requires every prefilled step to be reviewed before generation', () => {
    const draft=createPlanBuilderDraft(completeProfile()),reviewed=new Set();
    for(const step of PLAN_BUILDER_STEPS){expect(missingPlanBuilderStep(draft,reviewed)).toBe(step);reviewed.add(step);}
    expect(missingPlanBuilderStep(draft,reviewed)).toBeNull();
  });
  it('retains explicit Both and custom structure, equipment, restrictions and priorities', () => {
    const draft=createPlanBuilderDraft({...completeProfile(),environment:'Home gym',trainingEnvironmentChoice:'Both',primaryTrainingEnvironment:'Home gym',equipment:['dumbbells'],trainingSplitChoice:'other',trainingPreferences:'Push / Pull / Legs',avoid:'Avoid dips',priorities:['Arms'],prioritySources:{manual:['Arms'],physiqueConfirmed:[]}});
    expect(draft).toMatchObject({environment:'Both',primaryTrainingEnvironment:'Home gym',equipment:['dumbbells'],avoid:'Avoid dips',trainingSplitChoice:'other',priorities:['Arms']});
  });
  it('rejects malformed legacy answers and requires an explicit equipment choice', () => {
    const draft=createPlanBuilderDraft({...completeProfile(),goal:'old goal',daysPerWeek:9,equipment:['unknown'],sessionMinutes:0});
    expect(draft).toMatchObject({goal:null,daysPerWeek:null,equipment:[],sessionMinutes:null});
  });
});

it('activates only after durable saving, merges confirmed fields and preserves unrelated current data', () => {
  const state=blankState();state.profile={...completeProfile(),onboardingComplete:true,preferredTrainingStyle:'freestyle',noPlanReceipt:{kind:'first-run'},name:'Owner'};
  state.gymProfiles=[{id:'gym',name:'Home',environment:'Home gym',equipment:['dumbbells']}];state.defaultGymProfileId='gym';
  const answers=createPlanBuilderDraft(state.profile);answers.units='lb';
  const program=buildProgram(answers),before=structuredClone(state);
  state.profile.restTimerSeconds=150;state.profile.stylePreference='premium';state.profile.showExerciseImages=false;
  state.workouts=[{id:'later-history',exercises:[]}];
  let persisted;
  const next=activatePlanBuilder(state,program,answers,'personalized-template',value=>{persisted=value;return true;});
  expect(next).toBe(persisted);expect(next.profile).toMatchObject({id:state.profile.id,units:'lb',restTimerSeconds:150,stylePreference:'premium',showExerciseImages:false,preferredTrainingStyle:'plan',noPlanReceipt:null});
  expect(next.gymProfiles[0]).toMatchObject({id:'gym',name:'Home',equipment:['full gym'],environment:'Commercial gym'});
  expect(next.workouts).toEqual(state.workouts);expect(state.program).toBeNull();expect(state.gymProfiles).toEqual(before.gymProfiles);
  const restored=deserializeState(serializeState(next),{strict:true});expect(restored.program.id).toBe(program.id);expect(restored.profile.equipment).toEqual(['full gym']);
  expect(()=>activatePlanBuilder(state,program,answers,'personalized-template',()=>false)).toThrow(/couldn’t save/);
  expect(state.program).toBeNull();expect(state.profile.effortStyle).toBe(PLAN_EFFORT_STYLES[0]);
});
