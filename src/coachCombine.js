import {pendingCoachWorkflows} from './coachConversations.js';
import {isoDay,weekKey,optionalStrengthForDate} from './domain.js';
import {flexibleSessions,addCalendarDays} from './flexibleWeek.js';
import {buildCombinedProposal,buildCombinedRevision,combineSources,combineFingerprint} from './combineWorkouts.js';
import {combinedAdjustment,combinedStateToken} from './combinedWorkoutLifecycle.js';
import {isCombineIntent,isCombineTopic,isCombineDeclined,isCoachReadOnly,isCoachScheduleRequest,combineFailureText,isWorkoutTimeAnswer} from './coachIntent.js';
import {reviewMissedWorkoutCombine} from './missedWorkoutCombine.js';
import {resolveCoachCombineSources} from './coachCombineSources.js';
export {isCombineIntent} from './coachIntent.js';

const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function combineTime(text){
  const value=normalize(text);
  if(/no strict limit|no time limit|brez (casovne )?omejitve|nimam (casovne )?omejitve/.test(value))return null;
  const compactHours=value.match(/\b(\d+)h(\d{1,2})(?:m(?:in)?)?\b/);if(compactHours)return Number(compactHours[1])*60+Number(compactHours[2]);
  if(/\b(?:half an hour|half hour|pol ure)\b/.test(value))return 30;
  const words=value.match(/\b(eno|ena|one|an|dve|two)\s+(?:uro|ura|uri|hours?)\b/);
  if(words)return (/dve|two/.test(words[1])?120:60)+(/\b(?:in pol|and a half)\b/.test(value)?30:0);
  const hours=value.match(/\b(\d+(?:[.,]\d+)?)\s*(?:hours?|h|ur[aoie]?)\b(?:\s*(?:(?:and|in)\s*)?(\d+)\s*(?:min\w*|m)\b)?/);
  if(hours)return Number(hours[1].replace(',','.'))*60+(Number(hours[2])||(/\b(?:in pol|and a half)\b/.test(value)?30:0));
  const minutes=value.match(/\b(\d+)\s*(?:min(?:ute[sz]?|ut[a-z]*)?|m)\b/);
  if(minutes)return Number(minutes[1]);
  return undefined;
}
export function combineRecoveryForEntry(state,messages){
  const entry=messages.at(-1);
  if(entry?.reply?.combineReviewRequired)return entry.reply.combineReviewRequired;
  // Existing saved conversations predate structured blockers. Recover only
  // this exact old domain error, with proven live source IDs and explicit time.
  if(!/^Review .+ against your current equipment, restrictions or unresolved prescription first\. No workout was changed\.$/.test(entry?.reply?.text||''))return null;
  const previousEntry=messages.slice(0,-1).findLast(e=>e.reply?.combineRequest);
  if(previousEntry?.coachWorkflowStatus==='cancelled'||previousEntry?.combineReviewCancelled)return null;
  const previous=previousEntry?.reply.combineRequest;
  const sourceIds=previous?.sourceIds,minutes=combineTime(entry.user);
  if(!Array.isArray(sourceIds)||sourceIds.length!==2||new Set(sourceIds).size!==2||minutes===undefined||!sourceIds.every(id=>combineSources(state).some(s=>s.logicalSessionId===id)))return null;
  return {profileId:state.profile.id,planId:state.program.id,sourceIds,minutes};
}
const sourceLabel=s=>`${s.workout.name} · ${s.scheduledDate}`;
const conversation=state=>(state.conversations||[]).filter(e=>e.conversationId===state.activeCoachConversationId);
export function combineRevisionTargets(state){
  const byId=new Map(),owner=combinedAdjustment(state);
  for(const entry of conversation(state)){
    if(entry.combineReviewCancelled || entry.coachWorkflowStatus === 'cancelled')continue;
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
export async function coachCombineReply(state,message,{selection,interpret,interpretedMinutes,revisionIntent,language,anchorSessionId}={}){
  const pendingReply=pendingCoachWorkflows(state).filter(entry=>entry.reply?.combineRequest||entry.reply?.combineReviewRequired).at(-1)?.reply;
  const previous=pendingReply?.combineRequest||pendingReply?.combineReviewRequired;
  const enteredTime=combineTime(message),text=normalize(message);
  const sl=language==='Slovenian'||language!=='English'&&(previous?.language==='Slovenian'||/\b(zdruz\w*|podaljs\w*|skrajs\w*|imam|zdaj|cas\w*)\b/.test(text));
  let supersededEntryIds=[];
  const say=(text,extra={})=>({text,action:null,source:'combine-domain',final:true,...(supersededEntryIds.length?{supersededEntryIds}:{}),...extra});
  if(isCombineDeclined(message))return say(sl?'Združevanja ne bom nadaljeval. Treningov nisem spreminjal.':'I won’t continue combining. Your workouts are unchanged.',{supersededEntryIds:pendingCoachWorkflows(state).filter(entry=>entry.reply?.combineRequest||entry.reply?.combineReviewRequired||entry.reply?.action?.type==='combine-workouts').map(entry=>entry.id)});
  if(isCoachReadOnly(message)||isCoachScheduleRequest(message))return null;
  if(isCombineTopic(message)&&/\b(?:superset|exercises?|vaji|vaje)\b/.test(text)&&!/\b(?:workouts?|trening\w*|sessions?)\b/.test(text))return say(sl?'Želiš povezati vaje v superset? To lahko urediš med aktivnim treningom v možnostih vaje. Združevanje treningov pa pripravi eno vadbo iz dveh terminov.':'To pair exercises as a superset, use Exercise options in your active workout. Combining workouts instead prepares one session from two scheduled workouts.');
  const targets=combineRevisionTargets(state);
  const timeAnswer=isWorkoutTimeAnswer(message);
  const sourceResolution=resolveCoachCombineSources(state,message,{sourceIds:selection?.sourceIds,previousSourceIds:/\b(?:different|other two|druga dva|drugi dve|druga treninga)\b/.test(text)?[]:previous?.sourceIds||[],anchorSessionId,ignoreRelative:timeAnswer&&previous?.sourceIds?.length>0});
  const revisionFollowup=previous?.kind==='revision'&&(selection?.targetId||timeAnswer&&(enteredTime!==undefined||/^\s*\d+\s*$/.test(text)));
  const initialFollowup=previous&&!previous.kind&&(selection||timeAnswer&&(enteredTime!==undefined||/^\s*\d+\s*$/.test(text))||sourceResolution.mentioned);
  const recent=conversation(state).filter(entry=>entry.reply&&!entry.coachActionsArchived&&entry.coachWorkflowStatus!=='cancelled').at(-1);
  const recentCombination=recent?.reply?.source==='combine-domain'||recent?.reply?.action?.type==='combine-workouts';
  const numericFollowup=!initialFollowup&&targets.length>0&&(recentCombination||!recent&&combinedAdjustment(state))&&timeAnswer&&!isCombineIntent(message)&&(enteredTime!==undefined||/^\s*\d+\s*$/.test(text));
  const revisionTopic=isCombineTimeIntent(message)&&(targets.length>0?(combinedAdjustment(state)||recentCombination||/\b(?:combined|zdruzen\w*)\b/.test(text)):!isCombineIntent(message))&&!selection?.sourceIds&&!sourceResolution.mentioned;
  if(revisionIntent||!initialFollowup&&revisionTopic||revisionFollowup||numericFollowup){
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
    if(result.status!=='ready')return say(combineFailureText(result.error,sl),{combineReviewRequired:result.combineReviewRequired});
    const p=result.proposal,d=p.revisionSummary,changed=d.added.length||d.removed.length||d.sets.length;
    const reply=changed?(sl?`Pripravil sem posodobljen predlog: ocena je približno ${Math.round(p.estimatedMinutes)} minut. Preglej spremembe pred uporabo; trenutni trening še ni spremenjen.`:`An updated proposal is ready, estimated at about ${Math.round(p.estimatedMinutes)} minutes. Review it before applying; the current workout is unchanged.`):
      (sl?`Časovni cilj lahko spremenim, vendar dodatno delo v trenutnih omejitvah ni smiselno. Vsebina ostaja enaka, ocena približno ${Math.round(p.estimatedMinutes)} minut. Preglej pred uporabo.`:`The time target can change, but no additional work is useful within the current limits. The content stays the same, estimated at about ${Math.round(p.estimatedMinutes)} minutes. Review before applying.`);
    return say(reply,{action:{type:'combine-workouts',proposal:p}});
  }
  const followup=initialFollowup;
  if(!isCombineIntent(message)&&!followup&&!selection?.sourceIds)return null;
  if(isCombineIntent(message))supersededEntryIds=pendingCoachWorkflows(state).filter(entry=>entry.reply).map(entry=>entry.id);
  if(state.activeWorkout||state.activeOptionalSession)return say(sl?'Najprej dokončaj ali prekliči trening, ki že poteka.':'Finish or cancel your active workout before combining two planned sessions.');
  if(state.todayAdaptation)return say(sl?'Najprej dokončaj ali prekliči trenutno pripravljen trening.':'Finish or cancel your current adjustment before combining another pair.');
  if(/\b(?:for|za)\s+(?:tomorrow|jutri)\b/.test(text))return say(sl?'Združen trening lahko trenutno pripravim za danes. Želiš izbrana treninga opraviti danes?':'I can currently prepare a combined workout for today. Do you want to train those sessions today?');
  const eligible=combineSources(state),all=flexibleSessions(state),today=isoDay();
  let sourceIds=sourceResolution.sourceIds,minutes=enteredTime;
  if(minutes===undefined&&Object.hasOwn(selection||{},'minutes'))minutes=selection.minutes;
  if(minutes===undefined&&Number.isFinite(interpretedMinutes))minutes=interpretedMinutes;
  if(followup&&minutes===undefined)minutes=/^\s*\d+\s*$/.test(text)?Number(text):previous.minutes;
  const choices=()=>say(sourceResolution.error==='unavailable'?(sl?'Eden od teh treningov ni več na voljo. Izberi dva še neopravljena treninga.':'One referenced workout is no longer available. Choose two uncompleted workouts.'):
    sourceResolution.error==='anchor'?(sl?'Vključi izbrani trening ali odstrani kontekst dneva, če želiš združiti druga dva.':'Include the selected workout, or remove the day context to combine a different pair.'):
    sourceResolution.knownSourceIds.length===1?(sl?'Kateri trening želiš združiti z izbranim?':'Which other workout should I combine with the selected one?'):
    (sl?'Katera dva treninga želiš združiti za danes?':'Which two workouts should I combine for today?'),{combineRequest:{step:'sources',sourceIds:selection?.step==='sources'?(anchorSessionId?[anchorSessionId]:[]):sourceResolution.knownSourceIds.filter(id=>eligible.some(source=>source.logicalSessionId===id)).slice(0,1),language:sl?'Slovenian':'English',...(anchorSessionId?{requiredSourceId:anchorSessionId}:{}),...(minutes!==undefined?{minutes}:{}),choices:sourceResolution.choices.map(s=>({id:s.logicalSessionId,label:sourceLabel(s)}))}});
  if(eligible.length<2)return say(sl?'Za združevanje potrebujem dva še neopravljena treninga. Opravljenih treningov ne bom ponavljal.':'There aren’t two available planned sessions to combine. Completed workouts will not be repeated.');
  if(selection?.step==='sources')return choices();
  if(/\b(?:three|four|3|4|tri|stiri)\b.*\b(?:workouts?|sessions?|trening\w*)/.test(text))return choices();
  if(sourceResolution.error)return choices();
  if(!sourceIds.length&&sourceResolution.needsInterpret&&interpret){
    try{
      const intent=await interpret({message,today,sessions:all.map(s=>({id:s.logicalSessionId,name:s.workout.name,date:s.scheduledDate,status:s.status})),knownMinutes:minutes??null});
      if(intent.unambiguous===true&&intent.sourceIds?.length===2&&new Set(intent.sourceIds).size===2&&intent.sourceIds.every(id=>eligible.some(s=>s.logicalSessionId===id))&&(!anchorSessionId||intent.sourceIds.includes(anchorSessionId)))sourceIds=intent.sourceIds;
      if(minutes===undefined&&intent.minutes!=null&&Number.isFinite(intent.minutes))minutes=intent.minutes;
    }catch{ /* Unclear references stay an explicit source choice. */ }
  }
  if(sourceIds?.length!==2||new Set(sourceIds).size!==2)return choices();
  if(/(?:^|\s)[+-]\s*\d+/.test(text)&&!followup)minutes=undefined;
  if(minutes===undefined)return say(sl?'Koliko časa imaš danes za celoten trening?':'How much time do you have today for the whole workout?',{combineRequest:{step:'time',sourceIds,language:sl?'Slovenian':'English'}});
  const result=buildCombinedProposal(state,{sourceIds,minutes});
  if(result.status!=='ready'){
    const recovery=reviewMissedWorkoutCombine(state,{sourceIds,minutes});
    if(recovery.status==='choose-date'){
      const pair=sourceIds.map(id=>eligible.find(source=>source.logicalSessionId===id)).map(source=>`${source.workout.name} (${new Intl.DateTimeFormat(sl?'sl':'en',{day:'numeric',month:'short'}).format(new Date(`${source.scheduledDate}T12:00:00`))})`).join(sl?' in ':' and ');
      const time=minutes==null?(sl?'brez stroge časovne omejitve':'without a strict time limit'):(sl?`s ciljem ${minutes} minut`:`with a ${minutes}-minute target`);
      return say(sl?`Za danes lahko združim ${pair}, ${time}. Danes imaš še ${recovery.displaced.workout.name}; v pregledu izberi njegov nov termin.`:`I can combine ${pair} for today, ${time}. Today also has ${recovery.displaced.workout.name}; choose its new date in the review.`,{combineRequest:{step:'review',sourceIds,minutes,language:sl?'Slovenian':'English',profileId:state.profile.id,planId:state.program.id,fingerprint:combineFingerprint(state)}});
    }
    return say(combineFailureText(result.error,sl),{combineReviewRequired:result.combineReviewRequired});
  }
  return say(sl?`Pripravil sem združen trening za približno ${Math.round(result.proposal.estimatedMinutes)} minut. Preglej ga pred potrditvijo; nič še ni shranjeno.`:`A combined workout of about ${Math.round(result.proposal.estimatedMinutes)} minutes is ready. Review it before applying; nothing has been changed.`,{action:{type:'combine-workouts',proposal:result.proposal}});
}
