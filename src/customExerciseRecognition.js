import {normalizeExerciseAlias, CUSTOM_EXERCISE_EQUIPMENT, CUSTOM_EXERCISE_MUSCLES, CUSTOM_EXERCISE_PATTERNS} from './customExercises.js';

const equipmentIds = new Set(CUSTOM_EXERCISE_EQUIPMENT.map(([id])=>id));
const muscles = new Set(CUSTOM_EXERCISE_MUSCLES);
const patterns = new Set(CUSTOM_EXERCISE_PATTERNS.map(([id])=>id));
const generic = new Set(['press','row','leg','curl','raise','hop','push','pull','exercise']);
const equipmentWords = [
  ['dumbbells', /\b(?:dumbbells?|db)\b/], ['barbell', /\b(?:barbells?|bb)\b/],
  ['kettlebells', /\b(?:kettlebells?|kb)\b/], ['cables', /\bcables?\b/],
  ['machines', /\b(?:machine|smith)\b/], ['resistance bands', /\b(?:banded|bands?)\b/],
  ['bodyweight', /\b(?:bodyweight|body weight)\b/],
];
const autoFields = ['equipment','primaryMuscle','secondaryMuscles','pattern','loggingType'];
export const emptyCustomExerciseForm = (name='') => ({name,equipment:[''],primaryMuscle:'',secondaryMuscles:[],pattern:'',loggingType:'',loggingMode:'normal',notes:''});

function equipmentFor(item) {
  const values=[...new Set((item.equipment||[]).map(value=>value==='pull-up bar'?'bodyweight':value).filter(value=>equipmentIds.has(value)))];
  return values.length===1?values[0]:null;
}
function fieldsFor(item) {
  const fields={}, equipment=equipmentFor(item);
  if(equipment)fields.equipment=[equipment];
  // Catalog contract: import-workout-guide.mjs emits primary first, then secondary.
  // Custom catalog items use that same ordered role representation.
  const primary=item.primaryMuscle||item.muscles?.[0];
  if(muscles.has(primary))fields.primaryMuscle=primary;
  fields.secondaryMuscles=[...new Set(item.secondaryMuscles||item.muscles?.slice(1)||[])].filter(value=>muscles.has(value)&&value!==primary);
  if(patterns.has(item.pattern))fields.pattern=item.pattern;
  if(item.exerciseType==='distance_duration')fields.loggingType='distance_duration';
  else if(item.measure==='seconds')fields.loggingType='duration';
  else if(item.loadRequirement==='none'||item.exerciseType==='bodyweight_reps'&&item.loadRequirement!=='required')fields.loggingType='reps';
  else if(item.loadRequirement==='required'||item.exerciseType==='weight_reps')fields.loggingType='weight_reps';
  return fields;
}
function oneEdit(left,right) {
  if(right.length<5||left.length<4||Math.abs(left.length-right.length)>1)return false;
  if(left.length===right.length){
    const different=[...left].flatMap((letter,index)=>letter!==right[index]?[index]:[]);
    return different.length===1||different.length===2&&different[1]===different[0]+1&&left[different[0]]===right[different[1]]&&left[different[1]]===right[different[0]];
  }
  const shorter=left.length<right.length?left:right,longer=left.length<right.length?right:left;
  let index=0;while(index<shorter.length&&shorter[index]===longer[index])index++;
  return shorter.slice(index)===longer.slice(index+1);
}
function typoMatch(query,name) {
  const left=query.split(' '),right=name.split(' ');if(left.length!==right.length)return false;
  const different=left.flatMap((word,index)=>word!==right[index]?[index]:[]);
  return different.length===1&&oneEdit(left[different[0]],right[different[0]]);
}
function familyNames(item,names) {
  // Reviewed family-only qualifier. Never strip unilateral/weighted modifiers globally.
  return item.id==='wg-skater-hop'||item.sourceSlug==='skater-hop'
    ? names.map(name=>`single leg ${name}`):[];
}

/** Stricter than search: complete unique names, a reviewed family, or one word edit.
 * The resolver never writes records, combines candidates, or copies catalog identity. */
export function createCustomExerciseRecognizer(catalog) {
  const unique=new Map(Object.values(catalog).filter(item=>item&&!item.deleted&&!item.deletedAt&&!item.historicalIdentity).map(item=>[item.id,item]));
  const entries=[...unique.values()].map(item=>{
    const names=[...new Set([item.name,...(item.aliases||[])].filter(Boolean).map(normalizeExerciseAlias))];
    return {item,names,family:familyNames(item,names),fields:fieldsFor(item),equipment:equipmentFor(item)};
  });
  return (name,{manualEquipment}={})=>{
    const query=normalizeExerciseAlias(name).slice(0,120),fields={};
    if(!query||generic.has(query))return {fields};
    const negated=/\b(?:without|no|not|brez)\b/.test(query);
    const explicit=negated?[]:equipmentWords.filter(([,pattern])=>pattern.test(query)).map(([id])=>id);
    if(explicit.length===1)fields.equipment=[explicit[0]];
    const conflict=negated||explicit.length>1||manualEquipment&&explicit.length===1&&manualEquipment!==explicit[0];
    if(conflict)return {fields:negated||explicit.length>1?{}:fields};
    const equipment=manualEquipment||explicit[0];
    const compatible=entries.filter(entry=>!equipment||entry.equipment===equipment);
    const exact=compatible.filter(entry=>entry.names.includes(query));
    const family=exact.length?[]:compatible.filter(entry=>entry.family.includes(query));
    const typo=exact.length||family.length||query.length>96?[]:compatible.filter(entry=>entry.names.some(name=>typoMatch(query,name)));
    const matches=exact.length?exact:family.length?family:typo;
    if(matches.length!==1)return {fields};
    const match=matches[0];
    return {fields:{...match.fields,...fields},source:{id:match.item.id,name:match.item.name,kind:exact.length?'exact':family.length?'family':'typo',fields:match.fields}};
  };
}

export function recognizeCustomExerciseDraft(draft,recognize) {
  if(!draft.enabled)return draft;
  const manual=new Set(draft.manual),result=recognize(draft.form.name,{manualEquipment:manual.has('equipment')?draft.form.equipment[0]:undefined});
  const form={...draft.form},empty=emptyCustomExerciseForm();
  for(const field of autoFields)if(!manual.has(field))form[field]=result.fields[field]??empty[field];
  if(!manual.has('primaryMuscle')&&manual.has('secondaryMuscles')&&form.secondaryMuscles.includes(form.primaryMuscle))form.primaryMuscle='';
  if(!manual.has('secondaryMuscles'))form.secondaryMuscles=form.secondaryMuscles.filter(value=>value!==form.primaryMuscle);
  const automatic=autoFields.filter(field=>!manual.has(field)&&result.fields[field]!==undefined&&(Array.isArray(form[field])?form[field].length>0:Boolean(form[field]))&&JSON.stringify(form[field])===JSON.stringify(result.fields[field]));
  const source=result.source&&automatic.some(field=>result.source.fields[field]!==undefined)?result.source:null;
  return {...draft,form,source,automatic};
}
export function createCustomExerciseDraft(form,recognize,enabled=true) {
  return recognizeCustomExerciseDraft({form,enabled,manual:[],automatic:[],source:null},recognize);
}
export function changeCustomExerciseDraft(draft,field,value,recognize) {
  const form={...draft.form,[field]:value};
  const manual=field==='name'?draft.manual:[...new Set([...draft.manual,field])];
  return recognizeCustomExerciseDraft({...draft,form,manual},recognize);
}
