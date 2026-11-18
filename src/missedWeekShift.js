import {baseWeekSchedule,calendarDate,isoDay,weekKey,weekday} from './domain.js';

const addDays=(date,count)=>{const value=calendarDate(date);value.setDate(value.getDate()+count);return isoDay(value);};
const ordered=(a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)||a.originalDate.localeCompare(b.originalDate)||a.logicalSessionId.localeCompare(b.logicalSessionId);
const pending=item=>['planned','missed'].includes(item.status)&&!item.optional&&!item.workout?.optional;

// Recover one occurrence, preserving this week's current order and next week's
// existing dates. This is a finite insertion, never a permanent plan rotation.
export function missedWeekShift(state,source,sessions,today,{extraDates:requestedExtras,performedDate}={}){
  const fail=error=>({status:'conflict',error});
  if(!source||state.program?.trainingBlock?.completed)return fail('This workout is no longer available in the current plan.');
  if(state.activeWorkout||state.activeOptionalSession)return fail('Finish or cancel the active workout before shifting this week.');
  const start=weekKey(today),end=addDays(start,6);
  const finished=source.status==='completed'&&performedDate>=start&&performedDate<=today&&source.originalDate<performedDate;
  if(!finished&&!(source.status==='missed'&&source.scheduledDate>=start&&source.scheduledDate<today))
    return fail('Choose a missed workout from this week.');
  const following=sessions.filter(item=>item.logicalSessionId!==source.logicalSessionId&&pending(item)&&
    item.scheduledDate>=start&&item.scheduledDate<=end&&
    (finished?item.originalDate>=performedDate&&item.originalDate<=end:item.scheduledDate>source.scheduledDate))
    .sort(finished?(a,b)=>a.originalDate.localeCompare(b.originalDate)||ordered(a,b):ordered);
  if(!following.length)return fail('No following workouts remain to shift this week.');
  const ids=new Set(following.map(item=>item.logicalSessionId));ids.add(source.logicalSessionId);
  const occupied=date=>sessions.some(item=>!ids.has(item.logicalSessionId)&&item.scheduledDate===date&&item.status!=='skipped');
  let dates;
  if(finished){
    const regularDates=[...new Set(baseWeekSchedule(state,today,{includeDuration:false}).map(item=>item.scheduledDate))]
      .filter(date=>date>performedDate&&date>=today&&date<=end&&!occupied(date)).sort();
    const displaced=following.find(item=>item.originalDate===performedDate);
    const inOrder=following.every((item,index)=>!index||following[index-1].scheduledDate<item.scheduledDate);
    if(!displaced||!regularDates.length||displaced.scheduledDate===regularDates[0]&&inOrder)return fail('The following workouts are already in order, or no training slot remains this week.');
    // Keep deliberate later exceptions, but not the arbitrary free date used
    // to displace the workout that originally occupied the performed day.
    dates=[...new Set([...regularDates,...following.filter(item=>item!==displaced&&item.scheduledDate>=regularDates[0]).map(item=>item.scheduledDate)])].sort();
    dates=dates.slice(0,following.length);
  }else dates=following.filter(item=>item.scheduledDate>=today).map(item=>item.scheduledDate);
  if(!dates.length)return fail('No upcoming planned slot remains this week. Move a missed workout to a free day instead.');
  const queue=finished?following:[source,...following];
  const missing=queue.length-dates.length;
  const first=dates[0],freeDates=[];
  for(let date=addDays(first,1);date<=end;date=addDays(date,1))if(!dates.includes(date)&&!occupied(date))freeDates.push(date);
  let extraDateOptions=[];
  let chosenExtras=[];
  if(missing){
    if(freeDates.length<missing)return fail('There are not enough free days this week. Move a workout individually or adjust the week.');
    const valid=[],preferred=[...dates];
    const search=(index,chosen)=>{
      if(chosen.length===missing){
        const placed=[...dates,...chosen].sort();
        if(queue.some((item,i)=>item!==source&&placed[i]<(finished?item.originalDate:item.scheduledDate)))return;
        // Prefer the existing training slots. A free gap can close the queue
        // before Sunday when the final planned workout cannot move any later.
        const score=chosen.reduce((sum,date)=>sum+(state.profile.availableDays?.includes(weekday(calendarDate(date)))?0:4),0)+
          placed.reduce((sum,date,i)=>sum+(i&&date===addDays(placed[i-1],1)?3:0)+(!finished&&preferred[i]&&date<preferred[i]?20:0),0);
        valid.push({chosen,score});return;
      }
      for(let i=index;i<=freeDates.length-(missing-chosen.length);i++)search(i+1,[...chosen,freeDates[i]]);
    };
    search(0,[]);
    if(!valid.length)return fail('These workouts cannot stay in order within this week. Choose individual dates instead.');
    extraDateOptions=[...new Set(valid.flatMap(item=>item.chosen))].sort();
    if(requestedExtras!==undefined){
      if(!Array.isArray(requestedExtras)||requestedExtras.length!==missing||new Set(requestedExtras).size!==missing||!valid.some(item=>JSON.stringify(item.chosen)===JSON.stringify([...requestedExtras].sort())))return fail('Choose the required free extra days within this week.');
      chosenExtras=[...requestedExtras].sort();
    }else chosenExtras=valid.sort((a,b)=>a.score-b.score)[0].chosen;
    dates=[...dates,...chosenExtras].sort();
  }else if(requestedExtras?.length)return fail('This shift does not need an extra day.');
  const moves=queue.map((item,index)=>({item,toDate:dates[index]}));
  if(moves.some(({item,toDate})=>!toDate||toDate<today||toDate>end||item!==source&&toDate<(finished?item.originalDate:item.scheduledDate)||occupied(toDate)))
    return fail('These workouts cannot shift forward within this week. Choose individual dates instead.');
  for(const {item,toDate} of moves){
    const period=item.workout.temporaryPlanAdjustment;
    if(period&&(toDate<period.startDate||toDate>period.endDate))return fail('This shift leaves the temporary plan period. Move this workout individually.');
  }
  if(!moves.some(({item,toDate})=>item.scheduledDate!==toDate))return fail('These workouts are already scheduled in order.');
  return {status:'ready',moves:moves.filter(({item,toDate})=>item.scheduledDate!==toDate),
    details:{sourceId:source.logicalSessionId,sourceName:source.workout.name,sourceCompleted:finished,
      firstDate:dates[0],extraDates:chosenExtras,extraDateOptions:missing?extraDateOptions:[],availableDays:[...(state.profile.availableDays||[])].sort(),weekEnd:end,nextWeekDate:addDays(end,1)}};
}
