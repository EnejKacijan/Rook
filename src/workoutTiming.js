export const WORKOUT_IDLE_MS=2*60*60*1000;
const millis=value=>typeof value==='number'?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
const validTime=(value,start,now)=>Number.isFinite(value)&&value>=start&&value<=now;
export function lastWorkoutActivity(workout,now=Date.now()){
  if(!workout)return null;
  const start=Number(workout.startedAt),times=[];
  if(Object.hasOwn(workout,'unreviewedIdleSince'))return validTime(workout.unreviewedIdleSince,start,now)?workout.unreviewedIdleSince:null;
  const add=value=>{const time=millis(value);if(validTime(time,start,now))times.push(time);};
  add(workout.lastMeaningfulWorkoutActivityAt);
  const visit=set=>{add(set.completedAt);Object.values(set.sides||{}).forEach(visit);(set.segments||[]).forEach(visit);};
  for(const exercise of workout.exercises||[])for(const set of exercise.sets||[])visit(set);
  return times.length?Math.max(...times):null;
}
export const workoutElapsedSeconds=(workout,now=Date.now(),round=Math.floor)=>Math.max(0,round((Number(now)-Number(workout?.startedAt??now)-Math.max(0,Number(workout?.excludedIdleMs)||0))/1000));
export function workoutNeedsRecovery(workout,now=Date.now()){
  const start=Number(workout?.startedAt);if(!workout||!Number.isFinite(start)||start>now)return false;
  return Object.hasOwn(workout,'unreviewedIdleSince')||now-(lastWorkoutActivity(workout,now)??start)>=WORKOUT_IDLE_MS;
}
const activityShape=workout=>JSON.stringify([workout.exercises,workout.exerciseIndex,workout.warmup,workout.warmupPlan]);
// Attach timing evidence to existing user-change transactions. Clock ticks,
// notifications, page visits and profile-only edits never count as training.
export function markWorkoutActivity(before,next,now=Date.now()){
  const old=before.activeWorkout,active=next.activeWorkout;
  if(!old||!active||old.id!==active.id||old.startedAt!==active.startedAt||activityShape(old)===activityShape(active))return next;
  if(workoutNeedsRecovery(old,now))return {...next,activeWorkout:{...active,unreviewedIdleSince:lastWorkoutActivity(old,now)}};
  if(Number.isFinite(active.lastMeaningfulWorkoutActivityAt)&&active.lastMeaningfulWorkoutActivityAt!==old.lastMeaningfulWorkoutActivityAt)return next;
  return {...next,activeWorkout:{...active,lastMeaningfulWorkoutActivityAt:now}};
}
const reviewKey=workout=>JSON.stringify([workout.id,workout.startedAt,workout.lastMeaningfulWorkoutActivityAt,workout.unreviewedIdleSince,workout.excludedIdleMs,activityShape(workout)]);
export function reviewWorkoutTiming(state,now=Date.now()){
  const active=state.activeWorkout;if(!workoutNeedsRecovery(active,now))return null;
  const lastActivityAt=lastWorkoutActivity(active,now);
  return {profileId:state.profile.id,sessionId:active.id,key:reviewKey(active),lastActivityAt,
    suggestedDurationSeconds:lastActivityAt===null?null:workoutElapsedSeconds(active,lastActivityAt),openedAt:now};
}
function checkReview(state,review){
  const active=state.activeWorkout;
  if(!active||state.profile.id!==review?.profileId||active.id!==review.sessionId||reviewKey(active)!==review.key)throw Error('This workout changed. Close this review and open it again.');
  return active;
}
export function continueIdleWorkout(state,review,{requestId,excludeGap=true,elapsedMinutes=null,now=Date.now()}={}){
  if(state.activeWorkout?.timingRecoveryIds?.includes(requestId))return state;
  if(!requestId)throw Error('Missing recovery action identity.');
  const active=checkReview(state,review),wall=Number(now)-Number(active.startedAt);
  let excluded=Math.max(0,Number(active.excludedIdleMs)||0);
  if(excludeGap){
    if(review.lastActivityAt!==null)excluded+=Math.max(0,now-review.lastActivityAt);
    else {const minutes=String(elapsedMinutes??'').trim()?Number(elapsedMinutes):NaN;if(!Number.isFinite(minutes)||minutes<0||minutes*60000>wall)throw Error('Enter the time you already trained.');excluded=wall-minutes*60000;}
  }
  const {unreviewedIdleSince,...continued}=active;
  return {...state,activeWorkout:{...continued,excludedIdleMs:excluded,lastMeaningfulWorkoutActivityAt:now,
    timingRecoveryIds:[...(active.timingRecoveryIds||[]),requestId].slice(-20),
    ...(active.rest&&!active.rest.pending&&active.rest.endsAt<=now?{rest:null}:{})}};
}
export function reviewedWorkoutFinish(state,review,{endedAt,durationMinutes,now=Date.now()}={}){
  const active=checkReview(state,review),end=Number(endedAt),minutes=String(durationMinutes??'').trim()?Number(durationMinutes):NaN;
  if(!validTime(end,Number(active.startedAt),now))throw Error('Choose an end time between the workout start and now.');
  const timestamps=[];for(const e of active.exercises||[])for(const s of e.sets||[]){const t=millis(s.completedAt);if(validTime(t,Number(active.startedAt),now))timestamps.push(t);}
  if(timestamps.length&&end<Math.max(...timestamps))throw Error('The end time cannot be before your last logged set.');
  if(!Number.isFinite(minutes)||minutes<=0||minutes*60000>end-Number(active.startedAt)+1000)throw Error('Enter a duration that fits between the workout start and end.');
  return {endedAt:end,durationSeconds:Math.max(1,Math.round(minutes*60)),timingReviewedAt:now};
}

// The ordinary Finish action uses saved activity evidence. An optional single
// duration override moves the end forward when needed; there is no second
// timestamp field for the user to keep in sync with that duration.
export function finishIdleWorkout(state,review,{durationMinutes,now=Date.now()}={}){
  const active=checkReview(state,review),start=Number(active.startedAt);
  const manual=durationMinutes!==undefined;
  const minutes=manual&&String(durationMinutes??'').trim()?Number(durationMinutes):NaN;
  if(manual&&(!Number.isFinite(minutes)||minutes<=0))throw Error('Enter how many minutes you trained.');
  if(!manual&&review.lastActivityAt===null)throw Error('Enter how many minutes you trained.');
  const seconds=manual?Math.max(1,Math.round(minutes*60)):Math.max(1,review.suggestedDurationSeconds);
  // Prior excluded gaps are already reflected in the estimate. Extend from
  // the last activity by only the additional training time, never count those
  // gaps again. A shorter manual estimate leaves the evidenced end intact.
  const end=!manual?review.lastActivityAt:review.lastActivityAt===null
    ?start+seconds*1000+Math.max(0,Number(active.excludedIdleMs)||0)
    :review.lastActivityAt+Math.max(0,seconds-review.suggestedDurationSeconds)*1000;
  if(end>now)throw Error('The duration cannot be longer than the time available since this workout started.');
  return reviewedWorkoutFinish(state,review,{endedAt:end,durationMinutes:seconds/60,now});
}
