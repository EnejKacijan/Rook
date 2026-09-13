import {isoDay,weekKey,optionalStrengthForDate} from './domain.js';
import {flexibleSessions,addCalendarDays} from './flexibleWeek.js';
import {buildCombinedProposal,buildCombinedRevision,combineSources,combineFingerprint} from './combineWorkouts.js';
import {combinedAdjustment,combinedStateToken} from './combinedWorkoutLifecycle.js';

const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const isCombineIntent=text=>/\b(combin\w*|condens\w*|merg\w*|zdruz\w*|skombinir\w*)\b/.test(normalize(text));
export function combineTime(text){
  const value=normalize(text);
  if(/no strict limit|no time limit|brez (casovne )?omejitve|nimam (casovne )?omejitve/.test(value))return null;
  const minutes=value.match(/\b(\d+)\s*(?:min(?:ute[sz]?|ut[a-z]*)?)\b/);
  if(minutes)return Number(minutes[1]);
  const hours=value.match(/\b(\d+(?:[.,]\d+)?)\s*(?:hours?|ur[aoie]?)\b/);
  return hours?Number(hours[1].replace(',','.'))*60:undefined;
}
const sourceLabel=s=>`${s.workout.name} · ${s.scheduledDate}`;
const conversation=state=>(state.conversations||[]).filter(e=>e.conversationId===state.activeCoachConversationId);
export function combineRevisionTargets(state){
  const byId=new Map(),owner=combinedAdjustment(state);
  for(const entry of conversation(state)){
    if(entry.combineReviewCancelled)continue;
    const proposal=entry.combineReview||entry.reply?.action?.proposal;
    if(proposal?.mode!=='combine')continue;
    if(owner?.id===proposal.id){byId.set(owner.id,entry.actionResult?.status==='applied'?owner:proposal);continue;}
    const history=state.workouts?.find(w=>w.adjustment?.id===proposal.id);
    if(history){byId.set(proposal.id,history.adjustment);continue;}
    if(!entry.actionResult&&proposal.fingerprint===combineFingerprint(state))byId.set(proposal.id,proposal);
  }
  if(owner&&!byId.has(owner.id))byId.set(owner.id,owner);
  return [...byId.values()];
}
export function combineRevisionContext(state){return combineRevisionTargets(state).map(p=>({id:p.id,date:p.date,requestedMinutes:p.requestedMinutes,
  status:state.activeWorkout?.adjustment?.id===p.id?'active':state.workouts?.some(w=>w.adjustment?.id===p.id)?'completed':state.todayAdaptation?.id===p.id?'applied-not-started':'proposal'}));}
export const isCombineTimeIntent=text=>/\b(podaljs\w*|skrajs\w*|daljs\w*|krajs\w*|longer|shorter|extend\w*|lengthen\w*|shorten\w*)\b|\b(more|less|vec|manj)\s+(time|casa)\b|\b(now|zdaj|sedaj)\b.*\b(min\w*|ur\w*|hours?)\b|^\s*[+-]\s*\d+/.test(normalize(text));
function revisionTime(message,base,interpreted){
  const text=normalize(message),delta=text.match(/(?:^|\s)([+-])\s*(\d+)\s*(?:min\w*)?/);
  const relative=/\b(?:by|za)\s+\d+\s*min/.test(text)&&isCombineTimeIntent(message);
  const value=combineTime(message);
  if(delta||relative){
    const amount=delta?Number(delta[2])*(delta[1]==='-'?-1:1):Number(value)*(/short|skrajs|less|manj/.test(text)?-1:1);
    return Number.isFinite(base.requestedMinutes)?base.requestedMinutes+amount:undefined;
  }
  if(value!==undefined)return value;
  if(/^\s*\d+\s*$/.test(text))return Number(text);
  if(interpreted?.timeMode==='no-limit')return null;
  if(interpreted?.timeMode==='total'&&Number.isFinite(interpreted.minutes))return interpreted.minutes;
  if(interpreted?.timeMode==='delta'&&Number.isFinite(interpreted.minutes)&&Number.isFinite(base.requestedMinutes))return base.requestedMinutes+interpreted.minutes;
  return undefined;
}
export async function coachCombineReply(state,message,{selection,interpret,interpretedMinutes,revisionIntent,language}={}){
  const previous=(state.conversations||[]).filter(e=>e.conversationId===state.activeCoachConversationId).at(-1)?.reply?.combineRequest;
  const enteredTime=combineTime(message),text=normalize(message);
  const sl=language==='Slovenian'||previous?.language==='Slovenian'||/\b(zdruz\w*|podaljs\w*|skrajs\w*|imam|zdaj|cas\w*)\b/.test(text);
  const say=(text,extra={})=>({text,action:null,source:'combine-domain',final:true,...extra});
  const targets=combineRevisionTargets(state);
  const revisionFollowup=previous?.kind==='revision'&&(selection?.targetId||enteredTime!==undefined||/^\s*\d+\s*$/.test(text));
  const initialFollowup=previous&&!previous.kind&&(selection||enteredTime!==undefined||/^\s*\d+\s*$/.test(text));
  const numericFollowup=!initialFollowup&&targets.length>0&&!isCombineIntent(message)&&(enteredTime!==undefined||/^\s*\d+\s*$/.test(text));
  if(revisionIntent||!initialFollowup&&isCombineTimeIntent(message)&&!isCombineIntent(message)||revisionFollowup||numericFollowup){
    const targetId=selection?.targetId||revisionIntent?.targetWorkoutId||(revisionFollowup?previous.targetId:null);
    if(!targets.length){
      const generic=optionalStrengthForDate(state)&&conversation(state).some(e=>e.actionResult?.status==='applied'&&e.reply?.action?.type==='add-today-workout'&&(e.actionResult.targetDate||e.reply.action.targetDate)===isoDay());
      if(generic)return say(sl?'Ta trening je bil dodan kot samostojen trening, brez povezav na dve izvorni seji. Najprej izrecno odstrani ta še nezačeti dodatni trening, nato izberi obe izvorni seji za nov združen predlog. Obstoječega treninga nisem spremenil.':'This was added as a standalone workout, without two source-session links. Explicitly remove that unstarted additional workout first, then choose the two sources for a new combined review. The existing workout is unchanged.');
      if(!revisionIntent&&!revisionFollowup)return null;
      return say(sl?'Ni aktualnega združenega predloga za to spremembo. Izberi oba izvora za nov pregled.':'There is no current combined proposal for that change. Choose both sources for a new review.');
    }
    if(!targetId&&targets.length>1)return say(sl?'Kateri združeni trening želiš prilagoditi?':'Which combined workout do you want to adjust?',{combineRequest:{kind:'revision',step:'target',language:sl?'Slovenian':'English',choices:targets.map(p=>({id:p.id,label:p.sourceSessions.map(s=>s.name).join(' + ')+` · ${p.date}`})),...(enteredTime!==undefined?{minutes:enteredTime}:{})}});
    const base=targets.find(p=>p.id===targetId)||(!targetId&&targets.length===1?targets[0]:null);
    if(!base)return say(sl?'Izbrani predlog ni več aktualen. Odpri trenutni trening in poskusi znova.':'That proposal is no longer current. Open the current workout and try again.');
    if(state.activeWorkout?.adjustment?.id===base.id)return say(sl?'Ta trening že poteka. Celotnega treninga ne bom zamenjal; opravljeni seti ostanejo nespremenjeni.':'This workout is already in progress. I cannot replace the whole workout; completed sets stay unchanged.');
    if(state.workouts?.some(w=>w.adjustment?.id===base.id))return say(sl?'Ta trening je že zaključen. Sprememba časovnega cilja ne bo spreminjala njegove zgodovine.':'This workout has finished. A new time target cannot rewrite its history.');
    if(revisionFollowup&&previous.baseToken&&previous.baseToken!==combinedStateToken(base))return say(sl?'Trening se je od vprašanja spremenil. Zahtevaj nov pregled spremembe časa.':'The workout changed since that question. Ask for a fresh time review.');
    let minutes=revisionTime(message,base,revisionIntent);
    if(minutes===undefined&&selection?.targetId&&Object.hasOwn(previous||{},'minutes'))minutes=previous.minutes;
    if(minutes===undefined)return say(sl?'Koliko časa imaš danes za celoten trening?':'How much time do you have today for the whole workout?',{combineRequest:{kind:'revision',step:'time',targetId:base.id,baseToken:combinedStateToken(base),language:sl?'Slovenian':'English'}});
    const result=buildCombinedRevision(state,{base,minutes});
    if(result.status!=='ready')return say(result.error);
    const p=result.proposal,d=p.revisionSummary,changed=d.added.length||d.removed.length||d.sets.length;
    const reply=changed?(sl?`Pripravil sem posodobljen predlog: ocena je približno ${Math.round(p.estimatedMinutes)} minut. Preglej spremembe pred uporabo; trenutni trening še ni spremenjen.`:`An updated proposal is ready, estimated at about ${Math.round(p.estimatedMinutes)} minutes. Review it before applying; the current workout is unchanged.`):
      (sl?`Časovni cilj lahko spremenim, vendar dodatno delo v trenutnih omejitvah ni smiselno. Vsebina ostaja enaka, ocena približno ${Math.round(p.estimatedMinutes)} minut. Preglej pred uporabo.`:`The time target can change, but no additional work is useful within the current limits. The content stays the same, estimated at about ${Math.round(p.estimatedMinutes)} minutes. Review before applying.`);
    return say(reply,{action:{type:'combine-workouts',proposal:p}});
  }
  const followup=previous&&(selection||enteredTime!==undefined||/^\s*\d+\s*$/.test(text));
  if(!isCombineIntent(message)&&!followup&&!selection?.sourceIds)return null;
  if(state.activeWorkout||state.activeOptionalSession)return say('Finish or cancel your active workout before combining two planned sessions.');
  if(state.todayAdaptation)return say('Finish or cancel your current adjustment before combining another pair.');
  const eligible=combineSources(state),all=flexibleSessions(state),today=isoDay();
  let sourceIds=selection?.sourceIds || (followup?previous.sourceIds:null),minutes=enteredTime;
  if(minutes===undefined&&Number.isFinite(interpretedMinutes))minutes=interpretedMinutes;
  if(followup&&minutes===undefined)minutes=/^\s*\d+\s*$/.test(text)?Number(text):previous.minutes;
  const choices=()=>say('Which two workouts should I combine for today?',{combineRequest:{step:'sources',sourceIds:[],...(minutes!==undefined?{minutes}:{}),choices:eligible.map(s=>({id:s.logicalSessionId,label:sourceLabel(s)}))}});
  if(eligible.length<2)return say('There aren’t two available planned sessions to combine. Completed workouts will not be repeated.');
  if(!sourceIds?.length){
    if(/\b(three|four|3|4|tri|stiri)\b.*\b(workouts?|sessions?|trening\w*)/.test(text))return choices();
    if(/(?:last two|zadnj\w* dva|zadnj\w* dve)/.test(text)&&/missed|zamujen|izpust/.test(text)){
      sourceIds=eligible.filter(s=>s.status==='missed').sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).slice(0,2).map(s=>s.logicalSessionId);
    }else{
      const references=[[/\b(today|danes|danasnj\w*)\b/,today],[/\b(tomorrow|jutri|jutrisnj\w*)\b/,addCalendarDays(today,1)],[/\b(yesterday|vceraj|vcerajsnj\w*)\b/,addCalendarDays(today,-1)]];
      const mentionedDates=references.filter(([pattern])=>pattern.test(text)).map(([,date])=>date);
      // A time phrase such as "60 minutes today" is not an extra source.
      const names=[...new Set(all.map(s=>s.workout.name))].filter(name=>name&&new RegExp(`(?:^|[^a-z0-9])${normalize(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9])`).test(text));
      const explicitDates=message.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[];
      const dayForms=[['Mon',/\b(mon(?:day)?|pon(?:edeljek|edeljkov)?)\b/],['Tue',/\b(tue(?:sday)?|tor(?:ek|kov)?)\b/],['Wed',/\b(wed(?:nesday)?|sre(?:da|din)?)\b/],['Thu',/\b(thu(?:rsday)?|cet(?:rtek|rtkov)?)\b/],['Fri',/\b(fri(?:day)?|pet(?:ek|kov)?)\b/],['Sat',/\b(sat(?:urday)?|sob(?:ota|otni)?)\b/],['Sun',/\b(sun(?:day)?|ned(?:elja|eljski)?)\b/]];
      const mentionedDays=dayForms.filter(([,pattern])=>pattern.test(text)).map(([day])=>day);
      const mentioned=names.length?all.filter(s=>names.includes(s.workout.name)&&
        (explicitDates.length?explicitDates.includes(s.scheduledDate):weekKey(s.scheduledDate)===weekKey(today))):
        mentionedDays.length?all.filter(s=>mentionedDays.includes(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(`${s.scheduledDate}T12:00:00`).getDay()])&&weekKey(s.scheduledDate)===weekKey(today)):
        /missed|izpust|zamujen/.test(text)&&/\bboth\b|\boba\b/.test(text)?eligible.filter(s=>s.status==='missed'):
        all.filter(s=>[...mentionedDates,...explicitDates].includes(s.scheduledDate));
      if(mentioned.some(s=>!['planned','missed'].includes(s.status)))return say('One referenced session is already completed, active or reserved. Choose two unresolved workouts.',{combineRequest:{step:'sources',choices:eligible.map(s=>({id:s.logicalSessionId,label:sourceLabel(s)})),...(minutes!==undefined?{minutes}:{})}});
      if(mentioned.length===2)sourceIds=mentioned.map(s=>s.logicalSessionId);
      else if(mentioned.length>2||/last two|zadnj\w* dva/.test(text))return choices();
      else if(interpret){
        try{
          const intent=await interpret({message,today,sessions:all.map(s=>({id:s.logicalSessionId,name:s.workout.name,date:s.scheduledDate,status:s.status})),knownMinutes:minutes??null});
          if(intent.unambiguous===true&&intent.sourceIds?.length===2&&new Set(intent.sourceIds).size===2&&intent.sourceIds.every(id=>eligible.some(s=>s.logicalSessionId===id)))sourceIds=intent.sourceIds;
          if(minutes===undefined&&intent.minutes!=null&&Number.isFinite(intent.minutes))minutes=intent.minutes;
        }catch{ /* A provider failure leads to the same bounded choice, never guessed sources. */ }
      }
    }
  }
  if(sourceIds?.length!==2||new Set(sourceIds).size!==2)return choices();
  if(/(?:^|\s)[+-]\s*\d+/.test(text)&&!followup)minutes=undefined;
  if(minutes===undefined)return say(sl?'Koliko časa imaš danes za celoten trening?':'How much time do you have today for the whole workout?',{combineRequest:{step:'time',sourceIds,language:sl?'Slovenian':'English'}});
  const result=buildCombinedProposal(state,{sourceIds,minutes});
  if(result.status!=='ready')return say(result.error);
  return say(`I prepared a combined workout of about ${Math.round(result.proposal.estimatedMinutes)} minutes. Main movement coverage is retained and overlapping work reduced. Review it before applying; your weekly plan stays unchanged.`,{action:{type:'combine-workouts',proposal:result.proposal}});
}
