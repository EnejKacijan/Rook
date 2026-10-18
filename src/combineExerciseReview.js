import {exerciseCatalog,exerciseName,exerciseMeasure,exerciseLoadRequirement,matchImportedExerciseName,isExerciseAllowed,isExerciseGloballyBlocked} from './domain.js';
import {planEditorExerciseAllowed} from './exerciseEligibility.js';
import {planImportSourceName,applyPlanImportIdentityMatch} from './planImportMatching.js';

// A library match is optional for an imported plan. Combination still needs
// known movement/equipment metadata; a complete custom snapshot supplies it too.
// Never let a snapshot override an authoritative library identity.
export const combinedExerciseDefinition = exercise => exerciseCatalog[exercise.exerciseId] ||
  (exercise.importedExercise?.id === exercise.exerciseId ? exercise.importedExercise : null);

export function combinedExerciseIssues(exercises,profile,safety){
  return exercises.flatMap(exercise=>{
    const item=combinedExerciseDefinition(exercise);
    let reason,message;
    if(!item || !item.pattern || !Array.isArray(item.equipment) || !Array.isArray(item.muscles) || !item.muscles.length){
      reason='definition';message='Choose a library match or complete this custom exercise’s movement and equipment details to combine it. Matching remains optional for using your original plan.';
    }else if(isExerciseGloballyBlocked(item)){
      reason='unavailable';message='Replace this exercise with an available exercise before combining.';
    }else if(!isExerciseAllowed(item,{...profile,ignoreTrainingSafety:true,avoid:''})){
      reason='equipment';message='This exercise needs equipment that is not available in your current gym. Choose a compatible exercise or update your training setup.';
    }else if(!planEditorExerciseAllowed(item,profile,safety)){
      reason='restriction';message='This exercise conflicts with your current training restrictions, or its custom details cannot establish compatibility. Review or replace this exercise.';
    }else if(exercise.partialPrescription){
      reason='prescription';message=`Complete the missing ${exercise.partialPrescription.missing.join(' and ')} for this exercise before combining. Source values stay preserved.`;
    }else{
      const minimum=safety.constraints.minRirByExerciseId?.[exercise.exerciseId];
      if(Number.isFinite(minimum)&&(exercise.targetRir==null||exercise.targetRir<minimum)){
        reason='effort';message=`Set a target of at least ${minimum} RIR to respect your current training restrictions.`;
      }
    }
    return reason?[{exerciseId:exercise.exerciseId,exerciseEntryId:exercise.id,name:exerciseName(exercise),reason,message}]:[];
  });
}

export function suggestedCombinedExerciseMatch(exercise,profile,safety){
  if(exercise.hybridSource?.choice||exercise.hybridSource?.unresolved||exercise.matchStatus==='needs-name-review')return null;
  const match=matchImportedExerciseName(planImportSourceName(exercise));
  const item=['matched','alias'].includes(match.status)&&exerciseCatalog[match.exerciseId];
  const sourceMeasure=exercise.measure||exercise.importedExercise?.measure||exerciseMeasure(exercise);
  if(!item||item.id===exercise.exerciseId||sourceMeasure!==(item.measure||'reps'))return null;
  const sourceLoad=exercise.loadRequirement??exercise.importedExercise?.loadRequirement;
  const matchedLoad=exerciseLoadRequirement(item);
  if(sourceLoad&&sourceLoad!=='unknown'&&sourceLoad!==matchedLoad)return null;
  if(matchedLoad==='none'&&exercise.sets.some(set=>Number(set.weight)>0||set.sides&&Object.values(set.sides).some(side=>Number(side?.weight)>0)))return null;
  const candidate=structuredClone(exercise);
  applyPlanImportIdentityMatch(candidate,item);
  if(combinedExerciseIssues([candidate],profile,safety).length)return null;
  return {exerciseId:item.id,name:item.name};
}

// Reuse the existing source-prescription editor, only for specifically linked
// missing prescriptions. Informational import notes/name matching stay optional.
export function combinedPrescriptionReview(program,exerciseIds){
  const selected=new Set(exerciseIds);
  const issues=(program?.days||[]).flatMap(day=>day.exercises.flatMap(exercise=>
    selected.has(exercise.id)&&exercise.partialPrescription?[{
      id:`combine-prescription-${exercise.id}`,field:'prescription',category:'decision',
      dayId:day.id,exerciseId:exercise.id,requiresReps:true,
      source:exercise.sourceSpan?.text||exerciseName(exercise),
      message:'Complete only the missing prescription for this exercise. Values already supplied by your plan stay preserved.',
      partialPrescription:structuredClone(exercise.partialPrescription),
    }]:[]));
  return issues.length?{version:1,issues}:null;
}
