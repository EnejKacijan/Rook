import { exerciseCatalog, exerciseLoadRequirement } from './domain.js';
import { normalizeExerciseAlias, resolveRememberedExercise } from './customExercises.js';
import { matchImportCatalogName } from './importExerciseMatching.js';
export { importNameFeatures as historicalNameFeatures } from './importExerciseMatching.js';
export const HISTORICAL_MATCH_VERSION = 3;
export function matchHistoricalExercise(name,state={},catalog=exerciseCatalog,sourceProvider='generic', {advanced=false}={}) {
  const identity=normalizeExerciseAlias(name);
  const saved=(state.exerciseAliases||[]).filter(a=>a.scope==='historical-import'&&(!a.source||a.source===sourceProvider)&&!a.deletedAt&&a.normalizedAlias===identity).sort((a,b)=>Number(Boolean(b.source))-Number(Boolean(a.source))||String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  const base={version:HISTORICAL_MATCH_VERSION,sourceIdentity:identity,sourceName:name};
  if(saved){
    const valid=catalog[saved.exerciseId]||(state.customExercises||[]).find(e=>e.id===saved.exerciseId&&!e.deletedAt);
    return {...base,exerciseId:valid?saved.exerciseId:null,status:valid?'remembered-alias':'unresolved',tier:valid?'A':'C',requiresReview:false,reason:valid?'Your saved match':'Saved exercise is unavailable',aliasId:saved.id,candidates:[]};
  }
  const imported=(state.customExercises||[]).find(e=>e.historicalIdentity?.source===sourceProvider&&normalizeExerciseAlias(e.historicalIdentity.sourceName)===identity&&!e.deletedAt);
  const remembered=imported?{exerciseId:imported.id,status:'custom'}:resolveRememberedExercise({...state,customExercises:(state.customExercises||[]).filter(e=>!e.historicalIdentity)},name,catalog);
  if(remembered)return {...base,...remembered,tier:'A',reason:remembered.status==='custom'?'Your custom exercise':'Your saved match',candidates:[]};
  const stale=(state.exerciseAliases||[]).some(a=>(!a.source||a.source===sourceProvider)&&!a.deletedAt&&a.normalizedAlias===identity);
  if(stale)return {...base,exerciseId:null,status:'unresolved',tier:'C',requiresReview:false,reason:'Saved exercise is unavailable',candidates:[]};
  return {...base,...matchImportCatalogName(name,catalog,{advanced,loadRequirement:exerciseLoadRequirement})};
}
