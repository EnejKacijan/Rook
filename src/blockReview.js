import { exerciseCatalog, exerciseName, exerciseMeasure, exerciseLoadRequirement, progressionFor, compatibleReplacementCandidates, isExerciseAllowed, isoDay } from './domain.js';
import { effectiveSetReps, progressionComparableSet, loggingModeOf } from './advancedLogging.js';
import { summarizeSessionFeedback } from './sessionFeedback.js';
import { exercisePerformance, prEventsForWorkouts } from './performanceInsights.js';
import { defaultGymProfile, equipmentProfile } from './gymProfiles.js';
import { availableCustomExerciseItems, customExerciseSnapshot } from './customExercises.js';
import { createTrainingBlock } from './trainingBlocks.js';
import { addPlanVersion, planFingerprint } from './planHistory.js';
import { calculatePlateLoad, normalizePlateSetup, selectedPlateBar, plateLoadingRelation, kgToPlateUnit } from './plateCalculator.js';

const clone = value => structuredClone(value);
const dateOf = workout => String(workout.completedAt || '').slice(0, 10);
const working = exercise => (exercise.sets || []).filter(set => set.planned !== false && !set.added);
const completeSets = exercise => working(exercise).filter(set => set.completed);
const eligible = exercise => exerciseMeasure(exercise) === 'reps' && exerciseLoadRequirement(exercise) !== 'none';
const shape = exercise => JSON.stringify([exercise.repMin, exercise.repMax, exercise.targetRir, loggingModeOf(exercise), working(exercise).length]);
const chronological = workouts => [...workouts].sort((a,b) => String(a.completedAt).localeCompare(String(b.completedAt)));
export function authoritativeBlockWorkouts(state, blockId) {
  const superseded = new Set((state.workouts || []).map(workout => workout.supersedesCompletionId).filter(Boolean));
  const bySlot = new Map();
  for (const workout of chronological(state.workouts || [])) {
    if (!workout.completedAt || workout.trainingBlock?.blockId !== blockId || superseded.has(workout.id)) continue;
    const key = workout.optionalSessionId ? `optional:${workout.optionalSessionId}` : workout.trainingBlock.blockWorkoutId;
    if (key) bySlot.set(key, workout);
  }
  return [...bySlot.values()];
}
export function nextBlockFingerprint(state) {
  // Review is ephemeral; all inputs affecting evidence, permission or proposals
  // participate. No AI reasoning or derived analytics are stored here.
  return JSON.stringify([planFingerprint(state.program), state.program?.trainingBlock, state.workouts, state.workoutCorrections, state.activeWorkout, state.activeOptionalSession, state.flexibleWeek, state.workoutOccurrenceOverrides, state.weekScheduleOverrides, state.todayAdaptation, state.profile, state.gymProfiles, state.defaultGymProfileId, state.customExercises, state.substitutionPreferences, state.planVersions?.map(v=>[v.id,v.timestamp])]);
}
function baseGym(state) {
  const gym=defaultGymProfile(state);
  return { gym, profile:gym?equipmentProfile(state.profile,gym.equipment,gym.environment):state.profile };
}
export function nextBlockReplacementChoices(state, exercise) {
  const {gym,profile}=baseGym(state);
  const options={preferences:state.substitutionPreferences,gymProfileId:gym?.id};
  // The shared built-in shortlist prefers catalog progression metadata. Custom
  // records do not claim that metadata; validate them through the same strict
  // intent/equipment gate separately so sufficient user metadata stays usable.
  return [...compatibleReplacementCandidates(exercise,profile,[],{...options,candidates:Object.values(exerciseCatalog)}),
    ...compatibleReplacementCandidates(exercise,profile,[],{...options,candidates:availableCustomExerciseItems(state)})];
}
function exerciseOutcome(state, block, day, exercise, workouts) {
  const appearances=workouts.filter(w=>!w.optionalSessionId && w.programDayId===day.id);
  const comparable=appearances.filter(w=>!w.trainingBlock?.plannedDeload && !w.adjustment).flatMap(w=>{
    const item=w.exercises?.find(e=>e.id===exercise.id && e.exerciseId===exercise.exerciseId);
    const sets=item?working(item):[];
    if(!sets.length || !sets.every(s=>s.completed && progressionComparableSet(s) && effectiveSetReps(item,s)!=null))return [];
    return [{...w,exercises:[item]}];
  });
  const latest=comparable.at(-1)?.exercises[0];
  const cohort=latest?comparable.filter(w=>shape(w.exercises[0])===shape(latest)):[];
  const decision=cohort.length>=2?progressionFor(latest,cohort,baseGym(state).profile):null;
  let status=cohort.length<2?'insufficient':'held',reason=cohort.length<2?'Not enough comparable sessions to recommend a change.':'Keep the exercise and continue the current progression.';
  if(decision?.type==='progress'){status='progressed';reason=decision.detail;}
  else if(decision?.type==='stalled' || decision?.title==='Review the load' || decision?.title==='Review the variation' || decision?.title==='Reduce the hold target slightly'){status='review';reason=decision.detail;}
  const first=cohort[0]?.exercises[0],firstSets=first?working(first):[],lastSets=latest?working(latest):[];
  const allLoads=sets=>sets.length && sets.every(s=>s.weight!=null && Number.isFinite(Number(s.weight)));
  const fromWeight=allLoads(firstSets)?Math.min(...firstSets.map(s=>Number(s.weight))):null;
  const currentWeight=allLoads(lastSets)?Math.min(...lastSets.map(s=>Number(s.weight))):null;
  const effortOK=latest && lastSets.every(s=>s.rir==null || latest.targetRir==null || Number(s.rir)>=Number(latest.targetRir));
  const repsOK=latest && lastSets.every(s=>effectiveSetReps(latest,s)>=latest.repMin);
  const sameLoads=fromWeight!=null && currentWeight===fromWeight;
  const repGain=first && latest ? Math.min(...lastSets.map(s=>effectiveSetReps(latest,s)))-Math.min(...firstSets.map(s=>effectiveSetReps(first,s))) : 0;
  if(cohort.length>=2 && effortOK && repsOK && (currentWeight>fromWeight && fromWeight!=null || sameLoads && repGain>0)){status='progressed';reason=currentWeight>fromWeight?'Higher working load with the prescribed repetitions and effort.':'More repetitions at the same working load.';}
  const substitutions=appearances.filter(w=>!w.adjustment && !w.trainingBlock?.plannedDeload).map(w=>w.exercises?.find(e=>e.id===exercise.id)).filter(Boolean);
  const frequency=new Map();for(const item of substitutions)if(item.exerciseId!==exercise.exerciseId)frequency.set(item.exerciseId,(frequency.get(item.exerciseId)||0)+1);
  // An old permanent plan edit is not evidence of a temporary replacement.
  const permanentChange=(state.planVersions||[]).some(v=>v.timestamp?.slice(0,10)>=block.startDate && v.program?.trainingBlock?.id===block.id && v.program.days?.some(d=>d.id===day.id && d.exercises?.some(e=>e.id===exercise.id && e.exerciseId!==exercise.exerciseId)));
  const candidates=!permanentChange && substitutions.length>=4 && [...frequency.values()].some(count=>count>=3) ? nextBlockReplacementChoices(state,exercise) : [];
  const replacement=!permanentChange && substitutions.length>=4 ? candidates.find(c=>(frequency.get(c.id)||0)>=3 && frequency.get(c.id)/substitutions.length>=.6) : null;
  const {gym}=baseGym(state);
  const preference=replacement && state.substitutionPreferences?.find?.(p=>p.sourceExerciseId===exercise.exerciseId && p.replacementExerciseId===replacement.id && p.gymProfileId===gym?.id);
  // Frequency alone permits a review suggestion, never an automatic replacement.
  const replacementReason=replacement?`${exerciseName(exercise)} was replaced with ${replacement.name} in ${frequency.get(replacement.id)} of ${substitutions.length} recorded non-deload sessions. Suitable for ${gym?.name||'your base equipment'}.`:null;
  if(replacement){status='review';reason=replacementReason;}
  const performance=exercisePerformance(comparable,exercise.exerciseId,{e1rmEligible:eligible(exercise)});
  return {id:exercise.id,dayId:day.id,name:exerciseName(exercise),exerciseId:exercise.exerciseId,status,reason,comparableSessions:cohort.length,fromWeight,currentWeight,repGain,decision,estimatedOneRepMax:performance.estimatedOneRepMax,replacement:replacement?{id:replacement.id,name:replacement.name,reason:replacementReason,preferred:Boolean(preference)}:null};
}
export function reviewTrainingBlock(state, block=state.program?.trainingBlock) {
  if(!block)return null;
  const archived=(state.completedTrainingBlocks||[]).find(item=>item.id===block.id);
  const sessionFeedback=summarizeSessionFeedback(authoritativeBlockWorkouts(state,block.id));
  if(archived?.reviewSummary && block.id!==state.program?.trainingBlock?.id)return {...clone(archived.reviewSummary),sessionFeedback};
  const program=block.id===state.program?.trainingBlock?.id ? state.program : archived?.program;
  const workouts=authoritativeBlockWorkouts(state,block.id),planned=workouts.filter(w=>!w.optionalSessionId);
  const logged=w=>(w.exercises||[]).reduce((sum,e)=>sum+completeSets(e).length,0);
  const rows=(program?.days||[]).flatMap(day=>(day.exercises||[]).map(e=>exerciseOutcome(state,block,day,e,planned)));
  const blockIds=new Set(workouts.map(w=>w.id));
  const superseded=new Set((state.workouts||[]).map(w=>w.supersedesCompletionId).filter(Boolean));
  const prEvents=prEventsForWorkouts((state.workouts||[]).filter(w=>!superseded.has(w.id)),{e1rmEligible:eligible}).filter(event=>blockIds.has(event.workoutId));
  return {blockId:block.id,name:block.name,totalWeeks:block.totalWeeks,startDate:block.startDate,completedAt:block.completedAt,completed:Boolean(block.completed),sessionFeedback,
    plannedSessions:block.weeks.reduce((sum,week)=>sum+week.workouts.filter(ref=>!program?.days.find(d=>d.id===ref.programDayId)?.optional).length,0),
    completedSessions:planned.filter(w=>logged(w)>0).length,endedEarly:planned.filter(w=>w.endedEarly).length,
    skipped:new Set((block.resolvedSkips||[]).map(item=>item.blockWorkoutId).filter(id=>!planned.some(w=>w.trainingBlock.blockWorkoutId===id))).size,
    optionalCompleted:workouts.filter(w=>w.optionalSessionId && logged(w)>0).length,
    moved:planned.filter(w=>w.flexibleWeekMoved).length,adjusted:planned.filter(w=>w.adjustment).length,
    loggedSets:planned.reduce((sum,w)=>sum+logged(w),0),prescribedSets:planned.reduce((sum,w)=>sum+(w.exercises||[]).reduce((n,e)=>n+working(e).length,0),0),
    progressed:rows.filter(r=>r.status==='progressed').length,held:rows.filter(r=>r.status==='held').length,review:rows.filter(r=>r.status==='review').length,
    prs:new Set(prEvents.map(event=>`${event.workoutId}:${event.exerciseId}`)).size,
    deloadCompleted:planned.some(w=>w.trainingBlock?.plannedDeload && logged(w)>0),rows};
}
function nextStartDate(state, now) {
  const date=new Date(now);date.setHours(12,0,0,0);
  const today=isoDay(date),alreadyTrained=(state.workouts||[]).some(w=>w.completedAt && (w.canonicalPlanDate||dateOf(w))===today);
  if(alreadyTrained)date.setDate(date.getDate()+1);
  for(let i=0;i<7;i++){
    const weekday=new Intl.DateTimeFormat('en',{weekday:'short'}).format(date);
    if(state.program.days.some(day=>day.weekday===weekday))return isoDay(date);
    date.setDate(date.getDate()+1);
  }
  return today;
}
export function proposeNextBlock(state,{repeat=false,now=Date.now()}={}) {
  const block=state.program?.trainingBlock;
  if(!block?.completed)return {status:'unavailable',error:'Finish the remaining block sessions before reviewing the next block.'};
  const review=reviewTrainingBlock(state),changes=[];
  if(!repeat)for(const row of review.rows){
    if(row.replacement)changes.push({id:row.id,dayId:row.dayId,kind:'replacement',name:row.name,from:row.exerciseId,to:row.replacement.id,toName:row.replacement.name,reason:row.replacement.reason});
    else if(row.decision?.type==='progress' && Number.isFinite(row.decision.weight) && row.currentWeight!=null && row.decision.weight>row.currentWeight){
      let plateOptions=null;const gym=defaultGymProfile(state);
      if(gym && plateLoadingRelation(row.exerciseId)) {const setup=normalizePlateSetup(gym.plateSetup,state.profile.units),bar=selectedPlateBar(setup);const result=calculatePlateLoad({target:kgToPlateUnit(row.decision.weight,setup.unit),barWeight:bar.weight,plates:setup.plates});if(!result.exact)plateOptions={unit:setup.unit,lower:result.lower?.total??null,upper:result.upper?.total??null};}
      changes.push({id:row.id,dayId:row.dayId,kind:'load',name:row.name,from:row.currentWeight,to:row.decision.weight,reason:row.decision.detail,plateOptions});
    }
  }
  return {status:'ready',fingerprint:nextBlockFingerprint(state),sourceBlockId:block.id,repeat,startDate:nextStartDate(state,now),totalWeeks:block.totalWeeks,plannedDeloadWeek:block.plannedDeloadWeek,changes,review};
}
export function applyNextBlock(state, proposal, choices={}, {now=Date.now(),persist=null}={}) {
  if(!proposal || proposal.status!=='ready' || proposal.fingerprint!==nextBlockFingerprint(state) || proposal.sourceBlockId!==state.program?.trainingBlock?.id)return {status:'stale',state,error:'Your plan or training history changed. Review the next block again.'};
  if(state.activeWorkout || state.activeOptionalSession)return {status:'active',state,error:'Finish the active workout before starting the next block.'};
  const checked=proposeNextBlock(state,{repeat:proposal.repeat,now});
  if(checked.status!=='ready' || JSON.stringify(checked.changes)!==JSON.stringify(proposal.changes) || checked.startDate!==proposal.startDate)return {status:'stale',state,error:'The next block changed. Review it again.'};
  const next=clone(state),previousProgram=clone(state.program),block=state.program.trainingBlock;
  const nextId=`${block.id}:next`;
  for(const change of checked.changes){
    const choice=choices[change.id]??'keep';
    if(choice==='keep')continue;
    const exercise=next.program.days.find(d=>d.id===change.dayId)?.exercises.find(e=>e.id===change.id);
    if(!exercise)return {status:'stale',state,error:'An exercise changed. Review the next block again.'};
    if(change.kind==='load'){
      if(choice!=='recommendation')return {status:'invalid',state,error:'Review the working-load choice.'};
      exercise.nextBlockStartingLoad={blockId:nextId,weight:change.to};
      exercise.sets=exercise.sets.map(set=>({...set,weight:change.to,completed:false,rir:null}));
    }else{
      const id=choice==='recommendation'?change.to:choice;
      const candidate=nextBlockReplacementChoices(state,exercise).find(c=>c.id===id);
      if(!candidate || !isExerciseAllowed(candidate,baseGym(state).profile))return {status:'invalid',state,error:'This replacement no longer fits your base equipment or restrictions.'};
      delete exercise.importedExercise;delete exercise.importedName;delete exercise.originalImportedName;delete exercise.nextBlockStartingLoad;delete exercise.matchStatus;
      Object.assign(exercise,{exerciseId:id,exerciseSource:candidate.custom?'custom':'catalog',restSeconds:candidate.restSeconds,defaultIncrement:candidate.increment,measure:candidate.measure,loadRequirement:candidate.loadRequirement});
      if(candidate.custom){const record=state.customExercises.find(item=>item.id===id);exercise.importedExercise=customExerciseSnapshot(record);exercise.importedName=record.name;exercise.matchStatus='confirmed-custom';}
      exercise.sets=exercise.sets.map(set=>({...set,weight:null,completed:false,rir:null,sides:undefined,segments:undefined}));
    }
  }
  let archived=next.completedTrainingBlocks.find(item=>item.id===block.id);
  if(!archived){archived={...clone(block),program:previousProgram};next.completedTrainingBlocks.push(archived);}
  archived.reviewSummary=clone(checked.review);
  // Preserve the established week progression/deload definitions, but give all
  // logical workout obligations new identities. No completed sessions copied.
  const weeks=block.weeks.map(week=>({...clone(week),id:`${nextId}:week:${week.weekNumber}`,workouts:week.workouts.map(ref=>({...ref,id:`${nextId}:week:${week.weekNumber}:workout:${ref.programDayId}`}))}));
  next.program.trainingBlock=createTrainingBlock(next.program,{id:nextId,name:block.name,startDate:checked.startDate,totalWeeks:block.totalWeeks,includeDeload:block.plannedDeloadWeek!=null,plannedDeloadWeek:block.plannedDeloadWeek,weeks});
  next.program.version=Number(next.program.version||1)+1;next.program.updatedAt=new Date(now).toISOString();
  next.todayAdaptation=null;next.flexibleWeek=null;next.weekScheduleOverrides={};next.workoutOccurrenceOverrides={};
  next.selectedDate=checked.startDate;next.selectedDay=new Intl.DateTimeFormat('en',{weekday:'short'}).format(new Date(`${checked.startDate}T12:00:00`));
  addPlanVersion(next,{source:'Next block',reason:checked.repeat?'Repeated completed block after review':'Started next block after evidence review',summary:checked.repeat?`Repeated ${block.name}`:`Started next ${block.name}`,previousProgram,timestamp:now});
  if(persist){
    let saved=false;
    try { saved=Boolean(persist(next)); } catch { /* Storage adapters may throw on quota or access failure. */ }
    if(!saved)return {status:'persistence-failed',state,error:'ROOK couldn’t save the next block. Your completed block and plan are unchanged. Try again.'};
  }
  return {status:'applied',state:next};
}
