import {uid,exerciseCatalog,exerciseName} from './domain.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {effectiveGymContext} from './gymProfiles.js';
import {compileProfileTrainingSafety,trainingSafetyBlocks} from './trainingSafety.js';
import {planEditorExerciseAllowed} from './exerciseEligibility.js';
import {customExerciseSnapshot} from './customExercises.js';
import {assertWorkoutTemplates,reusableWorkoutStructure,reusableExerciseDefinition} from './workoutTemplateSchema.js';

export {reusableWorkoutStructure} from './workoutTemplateSchema.js';
export function templateDraft(workout,state) {
  const draft=reusableWorkoutStructure(workout);
  draft.exercises=draft.exercises.map(e=>{
    const custom=state.customExercises?.find(item=>item.id===e.exerciseId);
    return {...e,...(!e.importedExercise&&custom?{importedExercise:customExerciseSnapshot(custom),exerciseSource:'custom'}:{})};
  });return draft;
}
export function saveWorkoutTemplate(state,draft,{id=uid('workout-template'),revision=null}={}) {
  const templates=state.savedWorkoutTemplates||[],existing=templates.find(t=>t.id===id);
  if(revision===null&&existing)return state; // same create request delivered twice
  if(revision!==null&&(!existing||existing.revision!==revision))throw Error('This saved workout changed. Reopen it before saving.');
  const now=new Date().toISOString();
  const template={schemaVersion:1,id,name:String(draft.name||'').trim(),revision:(existing?.revision||0)+1,createdAt:existing?.createdAt||now,updatedAt:now,
    exercises:draft.exercises.map((e,index)=>({...reusableExerciseDefinition(e,{prescribed:true}),id:e.id||`definition-${index}`}))};
  assertWorkoutTemplates([template]);
  return {...state,savedWorkoutTemplates:existing?templates.map(t=>t.id===id?template:t):[...templates,template]};
}
export function deleteWorkoutTemplate(state,id,revision) {
  const existing=state.savedWorkoutTemplates?.find(t=>t.id===id);if(!existing)return state;
  if(existing.revision!==revision)throw Error('This saved workout changed. Reopen it before deleting.');
  return {...state,savedWorkoutTemplates:state.savedWorkoutTemplates.filter(t=>t.id!==id)};
}
export function templateUseIssues(state,template) {
  const profile=effectiveGymContext(state,state.activeWorkout||{}).profile,safety=compileProfileTrainingSafety(profile,Object.values(exerciseCatalog));
  if(trainingSafetyBlocks(safety.status))return [safety.message||'Review your training restrictions first.'];
  return template.exercises.flatMap(e=>{
    const item=e.importedExercise?.source==='custom'||e.exerciseSource==='custom'?e.importedExercise:exerciseCatalog[e.exerciseId]||e.importedExercise;
    if(!item||item.trackingSupport==='history-only')return [`${exerciseName(e)} is unavailable. Edit the template to select a supported exercise.`];
    if(item.exerciseType==='distance_duration'||e.distanceTarget!=null||e.sets.some(s=>s.distance!=null))return [`${exerciseName(e)} has a distance prescription that the current active logger cannot record. Edit the template before using it; its saved targets are preserved.`];
    if(!planEditorExerciseAllowed(item,profile,safety))return [`${exerciseName(e)} is incompatible with your current equipment or restrictions.`];
    const min=safety.constraints.minRirByExerciseId?.[e.exerciseId];
    if(Number.isFinite(min)&&(e.targetRir!=null&&e.targetRir<min||e.sets.some(s=>s.rir!=null&&s.rir<min)))return [`${exerciseName(e)} requires at least ${min} RIR.`];
    return [];
  });
}
export function templateOverlaps(state,template){const ids=new Set(state.activeWorkout?.exercises.map(e=>e.exerciseId)||[]);return template.exercises.filter(e=>ids.has(e.exerciseId));}
export function instantiateTemplate(template,requestId) {
  const groups=new Map();
  const newSet=s=>({...structuredClone(s),id:uid('set'),completed:false,planned:true,added:false,...(s.segments?{segments:s.segments.map(newSet)}:{})});
  return template.exercises.map(e=>{
    if(e.supersetId&&!groups.has(e.supersetId))groups.set(e.supersetId,uid('superset'));
    return {...structuredClone(e),id:uid('freestyle-exercise'),prescriptionSource:'saved-template',templatePrescription:structuredClone(e),queueAdditionId:requestId,
      ...(e.supersetId?{supersetId:groups.get(e.supersetId)}:{}),sets:e.sets.map(newSet)};
  });
}
export function useSavedWorkout(state,{templateId,revision,sessionId=null,requestId,confirmDuplicates=false}) {
  if(!requestId)throw Error('Missing workout action identity.');
  if(state.activeWorkout?.queueCommandIds?.includes(requestId))return state;
  if(sessionId&&state.activeWorkout?.id!==sessionId)throw Error('This workout has ended or changed.');
  if(!sessionId&&state.activeWorkout)throw Error('A workout is already in progress.');
  const template=state.savedWorkoutTemplates?.find(t=>t.id===templateId);
  if(!template||template.revision!==revision)throw Error('This saved workout changed. Open its preview again.');
  const issues=templateUseIssues(state,template);if(issues.length)throw Error(issues.join(' '));
  if(templateOverlaps(state,template).length&&!confirmDuplicates)throw Error('Confirm the overlapping exercises before adding this workout.');
  const next=state.activeWorkout?state:startFreestyleWorkout(state),active=next.activeWorkout,entries=instantiateTemplate(template,requestId);
  return {...next,activeWorkout:{...active,...(!sessionId?{name:template.name,workoutName:template.name,savedWorkoutTemplateId:template.id}:{}),
    exercises:[...active.exercises,...entries],queueCommandIds:[...(active.queueCommandIds||[]),requestId],updatedAt:Date.now()}};
}
