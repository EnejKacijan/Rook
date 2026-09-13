import {exerciseCatalog,exerciseName,isExerciseAllowed,isExerciseAutoGeneratable,isoDay,weekday,uid,validateProgram,priorityStimulusMusclesForProfile,makeProgramExercise,candidateScore} from './domain.js';
import {flexibleSessions,flexibleWeekConflict} from './flexibleWeek.js';
import {effectiveGymContext} from './gymProfiles.js';
import {generatedSessionTiming} from './durationPlanning.js';
import {compileProfileTrainingSafety,trainingSafetyBlocks} from './trainingSafety.js';
import {validateSupersetExercises} from './supersets.js';
import {combinedAdjustment,combinedPlanIdentity,combinedStateToken,persistCombinedState} from './combinedWorkoutLifecycle.js';
import {accumulateStimulus,stimulusProfileForItem} from './trainingVolume.js';

const clone=value=>structuredClone(value);
export const combineFingerprint=state=>combinedStateToken([state.program,state.profile,state.gymProfiles,state.defaultGymProfileId,
  state.flexibleWeek,state.weekScheduleOverrides,state.workoutOccurrenceOverrides,state.workouts,state.optionalSessions,
  state.todayAdaptation,state.activeWorkout,state.activeOptionalSession]);
export const combineSources=(state,today=isoDay())=>flexibleSessions(state,today).filter(s=>['missed','planned'].includes(s.status)&&!s.workout.optional);
const purpose=item=>{
  const p=item.pattern||'';
  if(['horizontal-push','incline-push'].includes(p))return 'press';
  if(p==='vertical-push')return 'shoulder-press';
  if(p==='horizontal-pull')return 'row';
  if(p==='vertical-pull')return 'vertical-pull';
  if(['squat','single-leg','power-lower'].includes(p))return 'knee';
  if(['hinge','hip-extension','knee-flexion'].includes(p))return 'posterior';
  return p||null;
};
const keyFor=e=>purpose(exerciseCatalog[e.exerciseId])||`${exerciseCatalog[e.exerciseId]?.pattern}:${exerciseCatalog[e.exerciseId]?.muscles?.[0]}`;
const primary=e=>e.requiredRole||e.programmingRole==='main'||exerciseCatalog[e.exerciseId]?.kind==='compound'||exerciseCatalog[e.exerciseId]?.kind==='power';
export function combinedMinutes(exercises,profile){return generatedSessionTiming(exercises,profile,exerciseCatalog).minutes;}
function groups(exercises){
  const seen=new Set();return exercises.flatMap(e=>{
    if(e.supersetId){if(seen.has(e.supersetId))return [];seen.add(e.supersetId);return [exercises.filter(row=>row.supersetId===e.supersetId)];}
    return [[e]];
  });
}
function coverage(exercises){return new Set(exercises.filter(primary).map(e=>purpose(exerciseCatalog[e.exerciseId])).filter(Boolean));}
function useful(exercises,required,sources){
  const actual=coverage(exercises),origin=new Set(exercises.flatMap(e=>e.combinedSourceIds));
  return [...required].every(p=>actual.has(p))&&sources.every(id=>origin.has(id));
}
// The private assembler can see an ownership-validated projection for revision;
// no reservations are released in storage to build or review a candidate.
export function buildCombinedProposal(state,request={}) { return assembleCombinedProposal(state,request); }
function assembleCombinedProposal(state,{sourceIds,minutes,date=isoDay()}={},base=null) {
  const fail=error=>({status:'conflict',error});
  if(!state.program||date!==isoDay())return fail('Choose two sessions to combine for today.');
  if(state.activeWorkout||state.activeOptionalSession)return fail('Finish or cancel the active workout before combining sessions.');
  if(state.todayAdaptation||combinedAdjustment(state))return fail('Finish or cancel the current adjustment before combining sessions.');
  if(flexibleWeekConflict(state))return fail('Review the existing temporary schedule before combining sessions.');
  if(!Array.isArray(sourceIds)||sourceIds.length!==2||new Set(sourceIds).size!==2)return fail('Choose exactly two source workouts.');
  if(minutes!==null&&(!Number.isFinite(minutes)||minutes<10||minutes>180))return fail('Choose 10–180 minutes, or No strict limit.');
  const eligible=combineSources(state),sources=sourceIds.map(id=>eligible.find(s=>s.logicalSessionId===id));
  if(sources.some(s=>!s))return fail('A source workout is completed, reserved, or no longer available. Choose two unresolved sessions.');
  if(eligible.some(s=>s.scheduledDate===date&&!sourceIds.includes(s.logicalSessionId)) || state.optionalSessions?.some(s=>s.date===date&&s.status==='planned'))
    return fail('Today already has another workout. Include today’s planned workout or resolve it before combining these two.');
  const profile=effectiveGymContext(state,{}).profile;
  const safety=compileProfileTrainingSafety(profile,Object.values(exerciseCatalog));
  if(trainingSafetyBlocks(safety.status))return fail(safety.message||'Review your training restrictions first.');
  const sourceExercises=sources.flatMap(source=>source.workout.exercises.map(e=>({...clone(e),id:`${source.logicalSessionId}:${e.id}`,
    sets:e.sets.map(s=>({...clone(s),id:`${source.logicalSessionId}:${e.id}:${s.id}`})),
    ...(e.supersetId?{supersetId:`${source.logicalSessionId}:${e.supersetId}`}:{ }),combinedSourceIds:[source.logicalSessionId]})));
  const edits=base?combinedUserEdits(base):{excludedExerciseIds:[],overrides:{},order:[]};
  const excluded=new Set(edits.excludedExerciseIds),locked=new Set(Object.keys(edits.overrides));
  const all=sourceExercises.filter(e=>!excluded.has(e.exerciseId)).map(e=>clone(edits.overrides[e.id]||e));
  for(const e of Object.values(edits.overrides))if(!all.some(row=>row.id===e.id)&&!excluded.has(e.exerciseId))all.push(clone(e));
  const blocked=all.filter(e=>!exerciseCatalog[e.exerciseId]||!isExerciseAllowed(exerciseCatalog[e.exerciseId],profile)||e.partialPrescription||
    Number.isFinite(safety.constraints.minRirByExerciseId?.[e.exerciseId]) && (e.targetRir==null||e.targetRir<safety.constraints.minRirByExerciseId[e.exerciseId]));
  if(blocked.length)return fail(`Review ${[...new Set(blocked.map(exerciseName))].join(', ')} against your current equipment, restrictions or unresolved prescription first. No workout was changed.`);
  if(sources.some(s=>s.workout.warmupPlan?.mode==='custom') || validateSupersetExercises(all).length)
    return fail('This source has a custom warm-up or unsupported group structure. Review it individually before combining; it will not be silently flattened.');
  const emphasis=new Set(priorityStimulusMusclesForProfile(profile));
  const score=e=> (primary(e)?100:0)+(e.programmingRole==='main'?30:0)+
    (Object.keys(stimulusProfileForItem(exerciseCatalog[e.exerciseId])).some(m=>emphasis.has(m))?45:0)+
    (profile.goal==='Get stronger'&&exerciseCatalog[e.exerciseId].equipment?.includes('barbell')?15:0)+
    (profile.goal==='Athletic performance'&&exerciseCatalog[e.exerciseId].kind==='power'?20:0);
  const ranked=groups(all).map((rows,index)=>({rows,index,value:Math.max(...rows.map(score))})).sort((a,b)=>b.value-a.value||a.index-b.index);
  const used=new Set(),buckets=new Set(),chosen=[];
  for(const group of ranked){
    if(group.rows.some(e=>used.has(e.exerciseId))) {
      for(const e of group.rows){const existing=chosen.find(row=>row.exerciseId===e.exerciseId);if(existing)existing.combinedSourceIds=[...new Set([...existing.combinedSourceIds,...e.combinedSourceIds])];}
      continue;
    }
    // Overlapping isolation/press/row alternatives do not become catch-up debt.
    if(group.rows.length===1&&buckets.has(keyFor(group.rows[0]))&&!locked.has(group.rows[0].id))continue;
    for(const e of group.rows){used.add(e.exerciseId);buckets.add(keyFor(e));chosen.push({...e,sets:locked.has(e.id)?e.sets:e.sets.slice(0,profile.experience==='Beginner'?2:3)});}
  }
  const required=coverage(sourceExercises),target=minutes??Math.min(90,Math.max(Number(profile.sessionMinutes)||60,...sources.map(s=>combinedMinutes(s.workout.exercises,profile))));
  let exercises=chosen;
  // The same eight-stimulus-set session ceiling used by safe programme additions.
  const tooMuch=(rows=exercises)=>combinedMinutes(rows,profile)>target||rows.length>8||rows.reduce((n,e)=>n+e.sets.length,0)>24||
    Object.values(accumulateStimulus(rows,id=>exerciseCatalog[id])).some(value=>value>8);
  while(tooMuch()){
    const candidates=groups(exercises).sort((a,b)=>Math.max(...a.map(score))-Math.max(...b.map(score)));
    let changed=false;
    for(const group of candidates){
      if(group.some(e=>locked.has(e.id)))continue;
      const minimum=group.some(primary)?2:1;
      if(group.every(e=>e.sets.length>minimum)) {group.forEach(e=>{e.sets=e.sets.slice(0,-1);});changed=true;break;}
    }
    if(changed)continue;
    for(const group of candidates){if(group.some(e=>locked.has(e.id)))continue;const removed=new Set(group.map(e=>e.id)),next=exercises.filter(e=>!removed.has(e.id));
      if(next.length&&useful(next,required,sourceIds)){exercises=next;changed=true;break;}}
    if(!changed)return fail('The important work from both sessions cannot fit that time safely. Choose more time or prioritize one workout.');
  }
  if(!useful(exercises,required,sourceIds))return fail('The two sessions cannot be condensed while retaining their main movement coverage. Choose another pair.');
  // Source work always gets first use of the budget. A longer target is not
  // fatigue debt: at most one missing, explicitly prioritized accessory is added.
  // Its prescription comes from the same domain factory as normal Coach adds.
  if(base && (minutes===null||minutes>base.timeLimit||base.workout.exercises.some(e=>e.combinedOrigin==='coach-added'))) {
    const sourceMuscles=new Set(Object.keys(accumulateStimulus(sourceExercises,id=>exerciseCatalog[id])));
    const direct=new Set(exercises.filter(e=>exerciseCatalog[e.exerciseId]?.kind==='isolation').flatMap(e=>Object.keys(stimulusProfileForItem(exerciseCatalog[e.exerciseId]))));
    const patterns=new Set(exercises.map(e=>exerciseCatalog[e.exerciseId]?.pattern));
    const pool=Object.values(exerciseCatalog).filter(item=>item.kind==='isolation'&&isExerciseAutoGeneratable(item,profile)&&
      !excluded.has(item.id)&&!exercises.some(e=>e.exerciseId===item.id)&&!patterns.has(item.pattern)&&
      Object.keys(stimulusProfileForItem(item)).some(m=>emphasis.has(m)&&sourceMuscles.has(m)&&!direct.has(m)))
      .sort((a,b)=>candidateScore(b,profile)-candidateScore(a,profile)||a.id.localeCompare(b.id));
    for(const item of pool){
      const added=makeProgramExercise(item,profile,{role:'accessory',requiredRole:false});
      if(Number.isFinite(safety.constraints.minRirByExerciseId?.[item.id])&&(added.targetRir==null||added.targetRir<safety.constraints.minRirByExerciseId[item.id]))continue;
      added.id=`coach-combine:${item.id}`;added.sets=added.sets.slice(0,2).map((s,i)=>({...s,id:`${added.id}:${i}`}));
      added.combinedSourceIds=[];added.combinedOrigin='coach-added';
      if(!tooMuch([...exercises,added])){exercises.push(added);break;}
    }
  }
  if(edits.order.length)exercises.sort((a,b)=>(edits.order.indexOf(a.id)<0?999:edits.order.indexOf(a.id))-(edits.order.indexOf(b.id)<0?999:edits.order.indexOf(b.id)));
  const id=base?.id||uid('combined-workout'),estimatedMinutes=combinedMinutes(exercises,profile);
  const workout={id,name:'Combined workout',weekday:weekday(date),location:profile.environment==='Home gym'?'Home':'Commercial gym',
    exercises,estimatedMinutes,durationPlanningVersion:1,warmupPlan:{mode:'auto'}};
  // Validate one executable occurrence, not a replacement weekly programme.
  // Source-specific open targets remain valid; eligibility was checked above.
  const validation=validateProgram({name:'Temporary combined workout',days:[workout]}, {...profile,daysPerWeek:1,availableDays:[weekday(date)],sessionMinutes:target},{preserveSchedule:true,allowImportedExercises:true});
  if(!validation.valid)return fail(`Review these source prescriptions before combining: ${validation.errors.join(' ')}`);
  const sourceSessions=sources.map(s=>({programId:state.program.id,workoutId:s.workoutId,logicalSessionId:s.logicalSessionId,
    originalDate:s.originalDate,scheduledDate:s.scheduledDate,name:s.workout.name,reservedBy:id}));
  return {status:'ready',proposal:{schemaVersion:1,mode:'combine',id,date,sourceSessions,workout,requestedMinutes:minutes,
    revision:base?(base.revision||0)+1:0,userEdits:edits,generatedExercises:clone(exercises),
    timeLimit:target,estimatedMinutes,planIdentity:combinedPlanIdentity(state),fingerprint:combineFingerprint(state),
    requiredCoverage:[...required],originalSetCount:sourceExercises.reduce((n,e)=>n+e.sets.length,0),
    explanation:'Main movement coverage is retained. Overlapping exercises and lower-priority sets are reduced; missed volume is not added as a debt.'}};
}
export function reviewCombinedSelection(proposal,ids,profile){
  const selected=new Set(ids),exercises=proposal.workout.exercises.filter(e=>selected.has(e.id));
  if(validateSupersetExercises(exercises).length||!useful(exercises,new Set(proposal.requiredCoverage),proposal.sourceSessions.map(s=>s.logicalSessionId)))return null;
  const estimatedMinutes=combinedMinutes(exercises,profile);
  const reviewed={...clone(proposal),estimatedMinutes,workout:{...clone(proposal.workout),exercises:clone(exercises),estimatedMinutes}};
  reviewed.userEdits=combinedUserEdits(reviewed);
  if(proposal.revisionSummary)reviewed.revisionSummary=combinedRevisionSummary(proposal.revisionSummary.before,reviewed.workout);
  return reviewed;
}
export function applyCombinedProposal(state,proposal,persist){
  if(proposal.revisionOf)return applyCombinedRevision(state,proposal,persist);
  if(savedCombineRevision(state,proposal.id)>(proposal.revision||0))throw new Error('A newer version of this proposal is available. Review that version instead.');
  if(proposal.date!==isoDay()||proposal.fingerprint!==combineFingerprint(state))throw new Error('The plan or sessions changed. Ask Coach to prepare the combined workout again.');
  const rebuilt=proposal.draftBase?buildCombinedRevision(state,{base:proposal.draftBase,minutes:proposal.requestedMinutes}):buildCombinedProposal(state,{sourceIds:proposal.sourceSessions.map(s=>s.logicalSessionId),minutes:proposal.requestedMinutes,date:proposal.date});
  if(rebuilt.status!=='ready')throw new Error(rebuilt.error);
  const selected=reviewCombinedSelection(rebuilt.proposal,proposal.workout.exercises.map(e=>e.id),effectiveGymContext(state,{}).profile);
  if(!selected||JSON.stringify(selected.workout.exercises)!==JSON.stringify(proposal.workout.exercises))throw new Error('The reviewed prescription changed. Prepare the workout again.');
  const next=clone(state);
  next.todayAdaptation={...selected,id:proposal.id,sourceSessions:selected.sourceSessions.map(s=>({...s,reservedBy:proposal.id})),
    revision:proposal.revision||0,workout:{...selected.workout,id:proposal.id},appliedAt:Date.now()};
  delete next.todayAdaptation.draftBase;
  next.selectedDate=proposal.date;next.selectedDay=weekday(proposal.date);
  return persistCombinedState(state,next,persist);
}

export function combinedUserEdits(base){
  const edits=clone(base.userEdits||{excludedExerciseIds:[],overrides:{},order:[]});
  const generated=base.generatedExercises;
  // Older candidates require their saved original review to recover provenance;
  // a source plan alone cannot distinguish a manual removal from time trimming.
  if(!generated)return {...edits,legacy:true};
  for(const prior of generated){
    const current=base.workout.exercises.find(e=>e.id===prior.id);
    if(!current)edits.excludedExerciseIds.push(prior.exerciseId);
    else if(JSON.stringify(current)!==JSON.stringify(prior))edits.overrides[current.id]=clone(current);
  }
  for(const current of base.workout.exercises)if(!generated.some(e=>e.id===current.id))edits.overrides[current.id]=clone(current);
  const present=new Set(base.workout.exercises.map(e=>e.exerciseId));
  edits.excludedExerciseIds=[...new Set(edits.excludedExerciseIds)].filter(id=>!present.has(id));
  const currentOrder=base.workout.exercises.map(e=>e.id),generatedOrder=generated.filter(e=>currentOrder.includes(e.id)).map(e=>e.id);
  if(JSON.stringify(currentOrder)!==JSON.stringify(generatedOrder))edits.order=currentOrder;
  return edits;
}
export function combinedRevisionSummary(before,after){
  const previous=before.exercises||[],next=after.exercises;
  return {before:clone(before),previousMinutes:before.estimatedMinutes,nextMinutes:after.estimatedMinutes,
    added:next.filter(e=>!previous.some(p=>p.id===e.id)).map(e=>({id:e.id,name:exerciseName(e),origin:e.combinedOrigin==='coach-added'?'coach-added':'restored-source'})),
    removed:previous.filter(e=>!next.some(n=>n.id===e.id)).map(e=>({id:e.id,name:exerciseName(e)})),
    sets:next.flatMap(e=>{const p=previous.find(p=>p.id===e.id);return p&&p.sets.length!==e.sets.length?[{id:e.id,name:exerciseName(e),before:p.sets.length,after:e.sets.length}]:[]})};
}
export const savedCombineRevision=(state,id)=>Math.max(-1,...(state.conversations||[]).flatMap(e=>[e.combineReview,e.reply?.action?.proposal]).filter(p=>p?.id===id).map(p=>p.revision||0));
export function combinedRevisionConflict(state,base){
  if(state.activeWorkout||state.activeOptionalSession)return 'This workout is already in progress. I cannot replace it with a new combined workout; your logged sets are unchanged.';
  if(state.workouts?.some(w=>w.adjustment?.id===base?.id))return 'This workout has finished. Its logged history cannot be replaced by a new prescription.';
  if(!base||base.date!==isoDay()||base.planIdentity!==combinedPlanIdentity(state))return 'The source plan or date changed. Review the two source workouts again.';
  if(base.appliedAt||base.revisionOf){
    if(!state.todayAdaptation||state.todayAdaptation.id!==base.id)return 'That temporary workout is no longer current. No other workout was changed.';
    const expected=base.revisionOf?.token||combinedStateToken(base);
    if(combinedStateToken(state.todayAdaptation)!==expected)return 'The workout changed after this review. Ask for an updated proposal.';
    if(base.sourceSessions?.length!==2||base.sourceSessions.some(s=>s.reservedBy!==base.id))return 'The two source reservations no longer belong to this workout. Review the sources again.';
  } else {
    if(state.todayAdaptation)return 'Another temporary workout is already on Today. Its source sessions cannot be reused.';
    if(base.fingerprint!==combineFingerprint(state))return 'The plan or sessions changed. Ask for an updated proposal.';
  }
  return null;
}
export function buildCombinedRevision(state,{base,minutes}={}){
  const error=combinedRevisionConflict(state,base);if(error)return {status:'conflict',error};
  let assemblyBase=base;
  if(combinedUserEdits(base).legacy){
    const original=(state.conversations||[]).map(e=>e.reply?.action?.proposal).find(p=>p?.mode==='combine'&&p.id===base.id&&p.planIdentity===base.planIdentity&&
      JSON.stringify(p.sourceSessions)===JSON.stringify(base.sourceSessions));
    if(!original)return {status:'conflict',error:'This older workout has no saved original review to distinguish manual removals from time reductions. Review its two source sessions explicitly before creating a new proposal; nothing was changed.'};
    assemblyBase={...base,generatedExercises:clone(original.generatedExercises||original.workout.exercises)};
  }
  const view={...state,todayAdaptation:null};
  // Validate the owner's exact occurrence links in the normal unreserved view.
  const sources=combineSources(view),ids=base.sourceSessions.map(s=>s.logicalSessionId);
  if(base.sourceSessions.some(s=>!sources.some(row=>row.logicalSessionId===s.logicalSessionId&&row.workoutId===s.workoutId&&row.originalDate===s.originalDate&&row.scheduledDate===s.scheduledDate)))
    return {status:'conflict',error:'A source session changed or is already used elsewhere. Review the sources again.'};
  const result=assembleCombinedProposal(view,{sourceIds:ids,minutes,date:base.date},assemblyBase);
  if(result.status!=='ready')return result;
  const p=result.proposal;p.fingerprint=combineFingerprint(state);p.sourceSessions=clone(base.sourceSessions);
  p.revision=Math.max(base.revision||0,savedCombineRevision(state,base.id))+1;
  p.revisionSummary=combinedRevisionSummary(base.workout,p.workout);
  if(base.revisionOf)p.revisionOf=clone(base.revisionOf);
  else if(base.appliedAt)p.revisionOf={id:base.id,revision:base.revision||0,token:combinedStateToken(base)};
  p.draftBase=clone(base);delete p.draftBase.draftBase;delete p.draftBase.revisionSummary;
  return result;
}
function applyCombinedRevision(state,proposal,persist){
  const base=state.todayAdaptation,ref=proposal.revisionOf;
  if(state.activeWorkout||state.activeOptionalSession)throw new Error('This workout has started. The reviewed revision cannot replace it.');
  if(!base||base.id!==ref.id||(base.revision||0)!==ref.revision||combinedStateToken(base)!==ref.token||proposal.fingerprint!==combineFingerprint(state))
    throw new Error('The workout or its sources changed after review. Ask for an updated proposal.');
  if(savedCombineRevision(state,proposal.id)>(proposal.revision||0))throw new Error('A newer version of this proposal is available. Review that version instead.');
  const rebuilt=buildCombinedRevision(state,{base:proposal.draftBase||base,minutes:proposal.requestedMinutes});
  if(rebuilt.status!=='ready')throw new Error(rebuilt.error);
  const selected=reviewCombinedSelection(rebuilt.proposal,proposal.workout.exercises.map(e=>e.id),effectiveGymContext(state,{}).profile);
  if(!selected||JSON.stringify(selected.workout.exercises)!==JSON.stringify(proposal.workout.exercises))throw new Error('The reviewed prescription changed. Prepare the workout again.');
  const next=clone(state);next.todayAdaptation={...selected,revision:proposal.revision,sourceSessions:clone(base.sourceSessions),appliedAt:base.appliedAt,updatedAt:Date.now()};
  delete next.todayAdaptation.revisionOf;delete next.todayAdaptation.revisionSummary;delete next.todayAdaptation.draftBase;
  return persistCombinedState(state,next,persist);
}
