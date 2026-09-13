import { exerciseCatalog, exerciseLoadRequirement, exerciseMeasure, importedCustomId, isExerciseAllowed } from './domain.js';
import { normalizeExerciseAlias, resolveRememberedExercise, customExerciseCatalogItem } from './customExercises.js';
import { compileProfileTrainingSafety, exerciseAllowedByTrainingSafety, trainingSafetyBlocks } from './trainingSafety.js';

export const planImportSourceName=exercise=>exercise.importMatchSource?.name||exercise.originalImportedName||exercise.importedName||exercise.importedExercise?.name||'';
export function capturePlanImportIdentity(exercise){
  exercise.importMatchSource ||= {name:planImportSourceName(exercise),measure:exercise.measure??null,loadRequirement:exercise.loadRequirement??null};
}
export function keepPlanImportOriginal(exercise){
  capturePlanImportIdentity(exercise);
  const source=exercise.importMatchSource,id=importedCustomId(source.name);
  Object.assign(exercise,{exerciseId:id,exerciseSource:'imported-custom',matchStatus:'original',importedName:source.name,originalImportedName:source.name,
    importedExercise:{id,name:source.name,source:'imported',pattern:null,muscles:null,equipment:null,measure:source.measure},
    measure:source.measure,loadRequirement:source.loadRequirement,importMappingDecision:'original'});
}
export function applySavedPlanImportMatch(exercise,state){
  capturePlanImportIdentity(exercise);
  if(exercise.hybridSource?.choice||exercise.hybridSource?.unresolved||exercise.matchStatus==='needs-name-review')return;
  const name=planImportSourceName(exercise),key=normalizeExerciseAlias(name);
  const saved=(state?.exerciseAliases||[]).filter(a=>a.scope==='plan-import'&&!a.deletedAt&&a.normalizedAlias===key).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if(saved?.keepOriginal){keepPlanImportOriginal(exercise);return;}
  const remembered=saved||resolveRememberedExercise({...state,customExercises:(state?.customExercises||[]).filter(e=>!e.historicalIdentity)},name,exerciseCatalog);
  const item=remembered&&(exerciseCatalog[remembered.exerciseId]||customExerciseCatalogItem((state?.customExercises||[]).find(e=>e.id===remembered.exerciseId&&!e.deletedAt)));
  if(!item)return;
  // A name mapping cannot reinterpret seconds as reps (or vice versa).
  if(exerciseMeasure(exercise)!==(item.measure||'reps'))return;
  Object.assign(exercise,{exerciseId:item.id,exerciseSource:item.custom?'custom':'catalog',matchStatus:'remembered-alias',importedName:item.name,originalImportedName:item.name});
  if(item.custom)exercise.importedExercise=item;else delete exercise.importedExercise;
}
export function persistPlanImportMatches(state,program,now=new Date().toISOString()){
  state.exerciseAliases ||= [];
  for(const day of program.days)for(const exercise of day.exercises){
    if(!exercise.importMappingDecision)continue;
    const alias=planImportSourceName(exercise),normalizedAlias=normalizeExerciseAlias(alias);
    const previous=state.exerciseAliases.find(a=>a.scope==='plan-import'&&a.normalizedAlias===normalizedAlias);
    const value={id:previous?.id||`plan-import-alias-${encodeURIComponent(normalizedAlias)}`,scope:'plan-import',alias,normalizedAlias,
      exerciseId:exercise.exerciseId,keepOriginal:exercise.importMappingDecision==='original',createdAt:previous?.createdAt||now,updatedAt:now,deletedAt:null};
    if(previous)Object.assign(previous,value);else state.exerciseAliases.push(value);
  }
}
// Original identities may be executable without catalogue metadata. They do not
// establish compatibility with an explicit movement restriction, however.
export function planImportSafetyIssues(program,profile){
  const safety=compileProfileTrainingSafety(profile||{},Object.values(exerciseCatalog));
  if(trainingSafetyBlocks(safety.status))return [safety.message||'Clarify your training restrictions before applying this plan.'];
  const constraints=safety.constraints||{};
  const restricted=Boolean(profile?.avoid?.trim()||constraints.avoidExerciseIds?.length||constraints.avoidPatterns?.length||constraints.allowedBodyRegions?.length||constraints.avoidNameTokens?.length);
  const issues=[];
  for(const day of program.days||[])for(const exercise of day.exercises||[]){
    const item=exerciseCatalog[exercise.exerciseId]||exercise.importedExercise;
    const known=exerciseCatalog[exercise.exerciseId]||item?.pattern&&item?.muscles?.length;
    if(restricted&&!known){issues.push(`Cannot verify ${planImportSourceName(exercise)} against your training restrictions. Clarify its movement or choose a compatible exercise.`);continue;}
    if(item&&!exerciseAllowedByTrainingSafety(item,safety))issues.push(`${planImportSourceName(exercise)} conflicts with your training restrictions.`);
    const min=constraints.minRirByExerciseId?.[exercise.exerciseId];
    if(Number.isFinite(min)&&(exercise.targetRir==null||exercise.targetRir<min))issues.push(`${planImportSourceName(exercise)} needs an explicit target of at least RIR ${min} for your saved restriction.`);
    if(profile?.environment&&exerciseCatalog[exercise.exerciseId]&&!isExerciseAllowed(item,{...profile,ignoreTrainingSafety:true}))issues.push(`${item.name} needs equipment that is not available in your saved setup.`);
  }
  return [...new Set(issues)];
}
