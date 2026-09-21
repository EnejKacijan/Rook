import {validateSupersetExercises} from './supersets.js';

export const WORKOUT_TEMPLATE_VERSION=1;
const fields=['exerciseId','exerciseSource','importedName','originalImportedName','importedExercise','matchStatus','measure','loggingMode','loadRequirement','repMin','repMax','repTarget','failureTarget','targetRir','restSeconds','defaultIncrement','supersetId','importRole','importedRoundPrescription','distanceTarget','distanceUnit'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
const targets=['weight','reps','rir','distance','durationSeconds'];
const cleanSet=(set={},id)=>({...pick(set,targets),id,
  ...(set.setType?{setType:set.setType}:{}),
  ...(set.sides?{sides:Object.fromEntries(Object.entries(set.sides).map(([side,value])=>[side,pick(value,targets)]))}:{}),
  ...(set.segments?{segments:set.segments.map((value,index)=>cleanSet(value,`${id}-segment-${index}`))}:{}),
});

/** Execution measurements are never used as targets. Captured prescriptions
 * supply per-set targets; old sessions can supply only declared exercise targets. */
export function reusableExerciseDefinition(exercise,{prescribed=false,historical=false}={}) {
  const source=exercise.templatePrescription||exercise;
  const result={...pick(source,fields),id:exercise.id};
  if(exercise.supersetId)result.supersetId=exercise.supersetId;else delete result.supersetId;
  if(historical&&!exercise.templatePrescription){result.repMin=null;result.repMax=null;result.targetRir=null;delete result.distanceTarget;}
  if(result.repMin==null&&result.repMax==null&&!result.failureTarget)result.repTarget='unspecified';
  result.sets=exercise.sets.map((set,index)=>{
    const target=exercise.templatePrescription?.sets?.[index]||(prescribed?set:null);
    return cleanSet(target||{weight:null,reps:result.repMin??null,rir:result.targetRir??null,setType:set.setType,
      ...(result.loggingMode==='per_side'?{sides:{left:{reps:result.repMin??null},right:{reps:result.repMin??null}}}:{}),
      ...(set.segments?{segments:set.segments.map(()=>({weight:null,reps:null,rir:null}))}:{})},`prescription-${index}`);
  });
  return result;
}
export function reusableWorkoutStructure(workout) {
  if(workout.reusableStructure)return structuredClone(workout.reusableStructure);
  return {name:workout.name||'Saved workout',exercises:(workout.exercises||[]).map(e=>reusableExerciseDefinition(e,{historical:Boolean(workout.historicalImport)}))};
}

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function assertWorkoutTemplates(templates) {
  if(templates===undefined)return;
  const bad=()=>{throw Error('Saved workout templates could not be safely loaded.');};
  if(!Array.isArray(templates))bad();
  const ids=new Set();
  for(const template of templates){
    if(!object(template)||template.schemaVersion!==1||typeof template.id!=='string'||!template.id||ids.has(template.id)||typeof template.name!=='string'||!template.name.trim()||template.name.length>100||!Number.isSafeInteger(template.revision)||template.revision<1||!Number.isFinite(Date.parse(template.createdAt))||!Number.isFinite(Date.parse(template.updatedAt))||!Array.isArray(template.exercises)||!template.exercises.length)bad();
    if(Object.keys(template).some(k=>!['schemaVersion','id','name','revision','createdAt','updatedAt','exercises'].includes(k)))bad();
    ids.add(template.id);const exerciseIds=new Set();
    for(const e of template.exercises){
      if(!object(e)||typeof e.id!=='string'||!e.id||exerciseIds.has(e.id)||typeof e.exerciseId!=='string'||!e.exerciseId||!Array.isArray(e.sets)||!e.sets.length||e.sets.length>100||Object.keys(e).some(k=>!fields.includes(k)&&!['id','sets'].includes(k)))bad();
      exerciseIds.add(e.id);
      if(e.loggingMode!=null&&!['normal','per_side'].includes(e.loggingMode))bad();
      for(const key of ['repMin','repMax','targetRir','restSeconds','defaultIncrement','distanceTarget'])if(e[key]!=null&&(!Number.isFinite(e[key])||e[key]<0))bad();
      if(e.repMin!=null&&e.repMax!=null&&e.repMin>e.repMax||e.targetRir>10)bad();
      if(e.importedExercise&&(!object(e.importedExercise)||e.importedExercise.id!==e.exerciseId||!e.importedExercise.name))bad();
      const setIds=new Set();
      const checkSet=(s,depth=0)=>{
        if(!object(s)||depth>2||typeof s.id!=='string'||setIds.has(s.id)||Object.keys(s).some(k=>!['id',...targets,'setType','segments','sides'].includes(k)))bad();setIds.add(s.id);
        for(const key of targets)if(s[key]!=null&&(!Number.isFinite(s[key])||s[key]<0))bad();
        if(s.rir>10||s.setType&&!['standard','amrap','drop','rest_pause'].includes(s.setType))bad();
        if(s.sides){if(!object(s.sides)||Object.keys(s.sides).some(k=>!['left','right'].includes(k)))bad();for(const side of Object.values(s.sides)){if(!object(side)||Object.keys(side).some(k=>!targets.includes(k)))bad();for(const value of Object.values(side))if(value!=null&&(!Number.isFinite(value)||value<0))bad();}}
        if(s.segments){if(!Array.isArray(s.segments))bad();s.segments.forEach(v=>checkSet(v,depth+1));}
      };e.sets.forEach(s=>checkSet(s));
    }
    if(validateSupersetExercises(template.exercises).length)bad();
  }
}
