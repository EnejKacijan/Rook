import {isoDay,saveState} from './domain.js';
import {addCalendarDays,proposeFlexibleWeek,applyFlexibleWeek,flexibleWeekConflict} from './flexibleWeek.js';
import {combineSources,combineFingerprint,buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
import {persistCombinedState} from './combinedWorkoutLifecycle.js';

const changed='Your workouts changed. Review the combination again.';
export function missedCombineSources(state,today=isoDay()) {
  if(!state.program||state.program.trainingBlock?.completed)return [];
  return combineSources(state,today).sort((a,b)=>Number(b.status==='missed')-Number(a.status==='missed') ||
    a.scheduledDate.localeCompare(b.scheduledDate) || a.logicalSessionId.localeCompare(b.logicalSessionId));
}

// Review the third workout's move and the combination as one transaction.
// Only Apply writes anything; choosing a date never modifies the user's plan.
export function reviewMissedWorkoutCombine(state,request,today=isoDay()) {
  const fail=error=>({status:'conflict',error});
  if(today!==isoDay())return fail(changed);
  if(state.activeWorkout||state.activeOptionalSession)return fail('Finish or cancel your active workout first.');
  if(state.todayAdaptation)return fail('Finish or cancel your current workout adjustment first.');
  if(state.program?.trainingBlock?.completed)return fail('This training block has ended. Review your current plan first.');
  if(flexibleWeekConflict(state,today))return {...fail('Review the outdated schedule change before combining workouts.'),scheduleReviewRequired:true};
  const eligible=missedCombineSources(state,today),ids=request.sourceIds;
  if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2)return fail('Choose two workouts.');
  if(ids.some(id=>!eligible.some(source=>source.logicalSessionId===id)))return fail(changed);
  const displaced=eligible.filter(source=>source.scheduledDate===today&&!ids.includes(source.logicalSessionId));
  if(displaced.length>1)return fail('Review today’s schedule before combining these workouts.');
  let staged=state,move=null;
  if(displaced.length){
    const source=displaced[0];
    const moveTo=date=>proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:date},today);
    if(!request.displacedToDate){
      const dates=Array.from({length:13},(_,index)=>addCalendarDays(today,index+1)).filter(date=>moveTo(date).status==='ready');
      return dates.length?{status:'choose-date',fingerprint:combineFingerprint(state),today,displaced:source,dates}:
        fail(`No dates are free for ${source.workout.name}. Include it in the combination, or adjust your week first.`);
    }
    if(request.displacedToDate<=today)return fail('Choose a future date for today’s workout.');
    const proposal=moveTo(request.displacedToDate);
    if(proposal.status!=='ready')return proposal;
    const result=applyFlexibleWeek(state,proposal);
    if(result.status!=='applied')return result;
    staged=result.state;move=proposal.changes[0];
  }else if(request.displacedToDate)return fail(changed);
  const result=buildCombinedProposal(staged,{sourceIds:ids,minutes:request.minutes,date:today});
  if(result.status!=='ready')return result;
  return {status:'ready',today,fingerprint:combineFingerprint(state),request:structuredClone(request),
    stagedState:staged,move,proposal:result.proposal};
}

export function applyMissedWorkoutCombine(state,review,proposal=review?.proposal,{persist=saveState}={}) {
  if(review?.status!=='ready'||review.today!==isoDay()||review.fingerprint!==combineFingerprint(state))throw Error(changed);
  const checked=reviewMissedWorkoutCombine(state,review.request,review.today);
  if(checked.status!=='ready')throw Error(checked.error||changed);
  if(proposal?.date!==review.today||proposal.requestedMinutes!==review.request.minutes||
    JSON.stringify(proposal.sourceSessions?.map(source=>source.logicalSessionId))!==JSON.stringify(review.request.sourceIds))throw Error(changed);
  // Rebase only the staged move timestamp. The canonical apply revalidates the
  // selected exercises and prescriptions against those exact two live sources.
  const next=applyCombinedProposal(checked.stagedState,{...proposal,fingerprint:combineFingerprint(checked.stagedState)},()=>true);
  return persistCombinedState(state,next,persist);
}
