import {sha256} from '@noble/hashes/sha2.js';
import {isoDay,weekKey} from './domain.js';
import {addCalendarDays,flexibleSessions,flexiblePlanFingerprint,flexibleWeekConflict} from './flexibleWeek.js';
import {advanceTrainingBlockAfterWorkout,trainingRestForDate} from './trainingBlocks.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import {progressionHistory} from './progressionHistory.js';
import {scheduleTransactionId} from './scheduleTransactions.js';

const clone=structuredClone;
// Cached estimates and equivalent defaults added on reload are not a training
// change. Dates, prescriptions, execution and occurrence ownership remain guards.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined&&key!=='estimatedMinutes'&&key!=='planFingerprint'&&
    !(key==='loggingMode'&&value[key]==='normal')&&!(key==='weightProvenance'&&value[key]===null)).map(key=>[key,canonical(value[key])])):value;
export function deloadChoiceFingerprint(state){
  const {profile,program,activeWorkout,activeOptionalSession,workouts,optionalSessions,flexibleWeek,weekScheduleOverrides,workoutOccurrenceOverrides,todayAdaptation,completedTrainingBlocks}=state;
  const scope={profileId:profile.id,program,activeWorkout,activeOptionalSession,workouts,optionalSessions,flexibleWeek,weekScheduleOverrides,workoutOccurrenceOverrides,todayAdaptation,completedTrainingBlocks};
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(canonical(scope)))),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function deloadWeekContext(state){
  const block=state.program?.trainingBlock;
  const week=block?.weeks?.find(item=>item.weekNumber===block.currentWeek);
  return week?.phase==='deload'?{block,week,choice:block.deloadChoices?.[week.weekNumber]||null}:null;
}
export function needsDeloadChoice(state,workout){
  const context=deloadWeekContext(state);
  return Boolean(context&&!context.block.completed&&!context.choice&&workout?.trainingBlock?.blockId===context.block.id&&
    workout.trainingBlock.blockWeekNumber===context.week.weekNumber&&!workout.optionalSessionId&&!workout.todayOnlyAdjustment);
}
const previousReceipt=(receipt,depth=9)=>receipt&&depth?{...receipt,previous:previousReceipt(receipt.previous,depth-1)}:null;
export function canUndoDeloadChoice(state){
  const receipt=state.deloadWeekUndo;
  return Boolean(receipt?.schemaVersion===1&&receipt.profileId===state.profile.id&&receipt.blockId===state.program?.trainingBlock?.id&&
    receipt.fingerprint===deloadChoiceFingerprint(state));
}
export function undoDeloadChoice(state){
  if(!canUndoDeloadChoice(state))throw Error('Training or the schedule changed. Your logged workouts are kept; this choice can no longer be undone.');
  const receipt=state.deloadWeekUndo,next={...state,program:{...state.program,trainingBlock:clone(receipt.beforeBlock)},deloadWeekUndo:receipt.previous||null};
  for(const [key,value] of Object.entries(receipt.beforeSlices||{}))next[key]=clone(value);
  if(receipt.archiveChanged){
    next.completedTrainingBlocks=clone(receipt.beforeArchives);
  }
  return next;
}

// One durable action owns the week choice and all of its schedule changes.
// Actual workouts are never edited or inserted to resolve a rest week.
export function chooseDeloadWeek(original,{blockId,weekNumber,mode,fingerprint},now=Date.now()){
  if(!['deload','normal','rest'].includes(mode))throw Error('Choose deload training, normal training or a rest week.');
  if(fingerprint&&fingerprint!==deloadChoiceFingerprint(original))throw Error('Your plan or training changed. Reopen the week choices.');
  let state=original,context=deloadWeekContext(state);
  const oldChoice=state.program?.trainingBlock?.deloadChoices?.[weekNumber];
  if(state.program?.trainingBlock?.id!==blockId)throw Error('This training block changed. Reopen the week choices.');
  if(oldChoice?.mode===mode)return state;
  if(oldChoice?.mode==='rest'){
    if(!canUndoDeloadChoice(state))throw Error('The rest week has already been followed by other training changes. Your logged workouts are kept.');
    state=undoDeloadChoice(state);context=deloadWeekContext(state);
  }
  if(!context||context.block.completed||context.week.weekNumber!==weekNumber)throw Error('This deload week is no longer current.');
  if(state.activeWorkout||state.activeOptionalSession)throw Error('Finish or discard the active session before changing this week.');
  if(mode==='rest'&&(combinedAdjustment(state)||state.todayAdaptation?.mode==='repeat'))throw Error('Finish or cancel the temporary workout before taking a rest week.');
  if(mode==='rest'&&flexibleWeekConflict(state,isoDay(now)))throw Error('Resolve the changed schedule before taking a rest week.');
  const timestamp=new Date(now).toISOString(),today=isoDay(now),through=addCalendarDays(today,6);
  const sources=mode==='rest'?flexibleSessions(state,today,{includeDuration:false}).filter(item=>
    ['planned','missed','optional'].includes(item.status)&&(
      item.scheduledDate>=today&&item.scheduledDate<=through||
      state.flexibleWeek?.sessions?.[item.logicalSessionId]?.blockId===blockId&&state.flexibleWeek.sessions[item.logicalSessionId].blockWeekNumber===weekNumber&&item.scheduledDate>=weekKey(today)||
      item.scheduledDate>=weekKey(today)&&item.scheduledDate<today&&item.workout.trainingBlock?.blockId===blockId&&item.workout.trainingBlock.blockWeekNumber===weekNumber)) : [];
  const next={...state,program:{...state.program,trainingBlock:clone(context.block)}};
  const block=next.program.trainingBlock,id=scheduleTransactionId();
  (block.deloadChoices||={})[weekNumber]={id,weekNumber,mode,selectedAt:timestamp,...(mode==='rest'?{restFrom:today,restThrough:through}: {})};
  if(mode==='rest'){
    next.flexibleWeek=clone(state.flexibleWeek)||{schemaVersion:1,revision:0,sessions:{}};
    const planFingerprint=flexiblePlanFingerprint(state);
    for(const item of sources){
      next.flexibleWeek.sessions[item.logicalSessionId]={id:item.logicalSessionId,workoutId:item.workoutId,programId:state.program.id,
        name:item.workout.name,originalDate:item.originalDate,scheduledDate:item.scheduledDate,skipped:true,blockId,
        blockWeekNumber:item.workout.trainingBlock?.blockWeekNumber||weekNumber,planFingerprint,updatedAt:timestamp,deloadRestChoiceId:id};
    }
    next.flexibleWeek.revision++;next.flexibleWeek.generation=id;
    if(state.todayAdaptation?.date>=today&&state.todayAdaptation.date<=through)next.todayAdaptation=null;
    const done=new Set(progressionHistory(state.workouts).filter(workout=>!workout.optionalSessionId&&workout.trainingBlock?.blockId===blockId&&workout.trainingBlock.blockWeekId===context.week.id)
      .map(workout=>workout.trainingBlock.blockWorkoutId));
    block.resolvedSkips||=[];
    for(const ref of context.week.workouts){
      if(done.has(ref.id)||block.resolvedSkips.some(skip=>skip.blockWorkoutId===ref.id))continue;
      const source=sources.find(item=>item.workoutId===ref.programDayId);
      block.resolvedSkips.push({blockWorkoutId:ref.id,blockWeekId:context.week.id,blockWeekNumber:weekNumber,
        ...(source?{logicalSessionId:source.logicalSessionId}:{}),date:source?.scheduledDate||today,skippedAt:timestamp,reason:'planned-rest',deloadRestChoiceId:id});
    }
    // Finishing can append an archive; keep the input history array detached.
    next.completedTrainingBlocks=[...(state.completedTrainingBlocks||[])];
    advanceTrainingBlockAfterWorkout(next,{trainingBlock:{blockId,blockWeekNumber:weekNumber},completedAt:timestamp});
    if(block.completed)next.completedTrainingBlocks=next.completedTrainingBlocks.map(archive=>archive.id===blockId
      ?{...clone(block),program:clone(next.program)}:archive);
  }
  const beforeSlices={};
  for(const key of ['flexibleWeek','todayAdaptation'])if(JSON.stringify(original[key])!==JSON.stringify(next[key]))beforeSlices[key]=clone(original[key]??null);
  const archiveChanged=JSON.stringify(original.completedTrainingBlocks)!==JSON.stringify(next.completedTrainingBlocks);
  next.deloadWeekUndo={schemaVersion:1,profileId:state.profile.id,blockId,weekNumber,choiceId:id,
    beforeBlock:clone(original.program.trainingBlock),beforeSlices,
    archiveChanged,...(archiveChanged?{beforeArchives:clone(original.completedTrainingBlocks||[])}:{}),
    previous:previousReceipt(original.deloadWeekUndo),fingerprint:deloadChoiceFingerprint(next)};
  return next;
}

export function visibleDeloadWeek(state,today=isoDay()){
  const rest=trainingRestForDate(state,today),context=deloadWeekContext(state);
  if(rest)return {mode:'rest',rest,changeable:rest.blockId===state.program?.trainingBlock?.id&&canUndoDeloadChoice(state)};
  if(context&&!context.block.completed)return {mode:context.choice?.mode||'pending',...context,changeable:!state.activeWorkout&&!state.activeOptionalSession};
  return null;
}
