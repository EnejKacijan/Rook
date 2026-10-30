import {isoDay,weekKey} from './domain.js';
import {flexibleSessions,addCalendarDays} from './flexibleWeek.js';
import {combineSources} from './combineWorkouts.js';
import {normalizeCoachMessage} from './coachIntent.js';

const contains=(text,label)=>Boolean(label&&(` ${text.replace(/[^\p{L}\p{N}]+/gu,' ')} `).includes(` ${normalizeCoachMessage(label).replace(/[^\p{L}\p{N}]+/gu,' ').trim()} `));
const names=source=>[source.workout.name,source.workout.workoutName,source.workout.name?.split(/\s*[—–(]/u)[0]].filter(Boolean);
export function resolveCoachCombineSources(state,message,{sourceIds,previousSourceIds=[],anchorSessionId,today=isoDay(),ignoreRelative=false}={}) {
  const text=normalizeCoachMessage(message),all=flexibleSessions(state,today),eligible=combineSources(state,today);
  const available=new Map(eligible.map(source=>[source.logicalSessionId,source]));
  const defaultChoices=[...eligible].sort((a,b)=>Number(b.status==='missed')-Number(a.status==='missed')||a.scheduledDate.localeCompare(b.scheduledDate));
  const result=(ids,extra={})=>({sourceIds:ids.length===2?ids:[],knownSourceIds:ids,choices:defaultChoices,mentioned:false,...extra});
  const checked=(ids,extra={})=>{
    if(ids.some(id=>!available.has(id)))return result([],{...extra,error:'unavailable'});
    if(anchorSessionId&&!available.has(anchorSessionId))return result([],{...extra,error:'anchor'});
    if(anchorSessionId&&!ids.includes(anchorSessionId)){
      if(ids.length===1)ids=[anchorSessionId,...ids];
      else if(ids.length===2)return result([anchorSessionId],{...extra,error:'anchor'});
    }
    return result(ids,extra);
  };
  if(Array.isArray(sourceIds))return checked([...new Set(sourceIds)],{mentioned:true});
  const explicitDates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match=>match[0]);
  const monthNames='january february march april may june july august september october november december'.split(' ');
  for(const match of text.matchAll(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/g))explicitDates.push(`${match[3]}-${String(monthNames.indexOf(match[2])+1).padStart(2,'0')}-${match[1].padStart(2,'0')}`);
  const dayForms=[['Mon',/\b(?:mon(?:day)?|pon(?:edeljek|edeljkov|edelkov)?)\b/],['Tue',/\b(?:tue(?:sday)?|tor(?:ek|kov)?)\b/],['Wed',/\b(?:wed(?:nesday)?|sre(?:da|do|din)?)\b/],['Thu',/\b(?:thu(?:rsday)?|cet(?:rtek|rtkov)?)\b/],['Fri',/\b(?:fri(?:day)?|pet(?:ek|kov)?)\b/],['Sat',/\b(?:sat(?:urday)?|sob(?:ota|oto|otni)?)\b/],['Sun',/\b(?:sun(?:day)?|ned(?:elja|eljo|eljski)?)\b/]];
  const days=dayForms.filter(([,pattern])=>pattern.test(text)).map(([day])=>day);
  const named=all.filter(source=>names(source).some(name=>contains(text,name))&&(explicitDates.length?explicitDates.includes(source.scheduledDate):weekKey(source.scheduledDate)===weekKey(today)));
  const sourceText=text.replace(/\b(?:for|za)\s+(?:today|danes|dans)\b/g,'');
  const relatives=[[/\b(?:today|danes|dans|danasnj\w*)\b/,today],[/\b(?:tomorrow|jutri|jutrisnj\w*)\b/,addCalendarDays(today,1)],[/\b(?:yesterday|vceraj|vcerajsnj\w*)\b/,addCalendarDays(today,-1)]];
  const relativeDates=ignoreRelative?[]:relatives.filter(([pattern])=>pattern.test(sourceText)).map(([,date])=>date);
  const missed=/\b(?:missed|missal\w*|missan\w*|zamujen\w*|izpust\w*)\b/.test(text);
  const tokens=` ${text.replace(/[^\p{L}\p{N}]+/gu,' ')} `;
  const excluded=eligible.filter(source=>names(source).some(name=>['not','ne','brez','except','razen','nocem','ne zelim','dont want','don t want'].some(negative=>tokens.includes(` ${negative} ${normalizeCoachMessage(name).replace(/[^\p{L}\p{N}]+/gu,' ').trim()} `))));
  if(excluded.length){
    const blocked=new Set(excluded.map(source=>source.logicalSessionId)),kept=previousSourceIds.filter(id=>!blocked.has(id));
    const added=named.filter(source=>!blocked.has(source.logicalSessionId)).map(source=>source.logicalSessionId);
    return checked([...new Set([...kept,...added])],{mentioned:true});
  }
  if(named.length>1&&!explicitDates.length&&!missed&&!/\b(?:both|oba|obe|this week|ta teden|tega tedna|ta tedn)\b/.test(text)){
    const repeated=named.some(source=>names(source).some(name=>contains(text,name)&&named.filter(other=>names(other).some(otherName=>normalizeCoachMessage(otherName)===normalizeCoachMessage(name))).length>1));
    if(repeated)return result(anchorSessionId?[anchorSessionId]:[],{mentioned:true,choices:named});
  }
  let mentioned=named;
  if(!named.length)mentioned=explicitDates.length?all.filter(source=>explicitDates.includes(source.scheduledDate)):
    days.length?all.filter(source=>weekKey(source.scheduledDate)===weekKey(today)&&days.includes(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(`${source.scheduledDate}T12:00:00`).getDay()])):
    missed?eligible.filter(source=>source.status==='missed'):all.filter(source=>relativeDates.includes(source.scheduledDate));
  else if(named.length===1&&/\b(?:today's|yesterday's|tomorrow's|danasnj\w*|vcerajsnj\w*|jutrisnj\w*)\b/.test(sourceText))mentioned=[...new Map([...named,...all.filter(source=>relativeDates.includes(source.scheduledDate))].map(source=>[source.logicalSessionId,source])).values()];
  if(missed&&/last two|zadnj\w* (?:dva|dve)/.test(text))mentioned=mentioned.sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).slice(0,2);
  const replacement=text.split(/\b(?:instead of|rather than|namesto)\b/);
  if(replacement.length===2&&previousSourceIds.length===2){
    const from=previousSourceIds.filter(id=>names(available.get(id)||{workout:{}}).some(name=>contains(replacement[1],name)));
    const to=eligible.filter(source=>weekKey(source.scheduledDate)===weekKey(today)&&names(source).some(name=>contains(replacement[0],name)));
    if(from.length===1&&to.length===1)return checked(previousSourceIds.map(id=>id===from[0]?to[0].logicalSessionId:id),{mentioned:true});
  }
  if(mentioned.length){
    const ids=mentioned.map(source=>source.logicalSessionId);
    if(mentioned.some(source=>!available.has(source.logicalSessionId)))return result([],{mentioned:true,error:'unavailable'});
    return checked(ids,{mentioned:true,...(ids.length>2?{choices:mentioned}:{}),...(ids.length>2?{sourceIds:[],knownSourceIds:anchorSessionId?[anchorSessionId]:[]}: {})});
  }
  if(explicitDates.length||days.length||missed)return result(anchorSessionId?[anchorSessionId]:[],{mentioned:true,error:'not-found'});
  if(/\b(?:last two|zadnj\w* (?:dva|dve))\b/.test(text))return result(anchorSessionId?[anchorSessionId]:[],{mentioned:true});
  if(previousSourceIds.length)return checked(previousSourceIds);
  if(anchorSessionId)return checked([anchorSessionId]);
  return result([],{needsInterpret:true});
}
