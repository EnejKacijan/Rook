import {refreshWorkoutWarmup} from './domain.js';
import {flexibleOccurrencesForDate} from './flexibleWeek.js';
import {planWorkoutChoices,resolvePlanWorkout} from './planWorkoutTemplates.js';
import {templateDraft,templateUseIssues,instantiateTemplate} from './savedWorkouts.js';
import {reusableExerciseDefinition} from './workoutTemplateSchema.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {isCombineTopic,isCoachReadOnly,isCoachScheduleRequest} from './coachIntent.js';

const normalize=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const contains=(text,name)=>Boolean(name&&(` ${normalize(text)} `).includes(` ${normalize(name)} `));
const title=day=>day.workoutName||day.name||'Workout';
const snapshot=draft=>JSON.stringify(draft);
const fromPrescription=(workout,state)=>templateDraft({reusableStructure:{name:title(workout),exercises:workout.exercises.map(e=>reusableExerciseDefinition(e,{prescribed:true}))}},state);
export function coachReusableWorkouts(state,requestContext){
  const choices=planWorkoutChoices(state).map(choice=>({name:choice.name,label:`${choice.name} · ${choice.contextLabel} · Plan`,reference:{kind:'plan',...choice.reference}}));
  for(const template of state.savedWorkoutTemplates||[])choices.push({name:template.name,label:`${template.name} · Saved workout`,reference:{kind:'saved',profileId:state.profile.id,templateId:template.id,revision:template.revision}});
  if(requestContext?.occurrenceId&&requestContext.profileId===state.profile.id){
    const item=flexibleOccurrencesForDate(state,requestContext.date).find(item=>item.logicalSessionId===requestContext.occurrenceId);
    if(item){const draft=fromPrescription(item.workout,state);choices.unshift({name:draft.name,label:`${draft.name} · ${requestContext.date} · Scheduled`,reference:{kind:'occurrence',profileId:state.profile.id,date:requestContext.date,occurrenceId:item.logicalSessionId,prescription:snapshot(draft)}});}
  }
  return choices;
}
export function coachWorkoutReuseReply(state,message,{requestContext,proposedAction,language='English'}={}){
  if(isCombineTopic(message)||isCoachReadOnly(message)||isCoachScheduleRequest(message))return null;
  const choices=coachReusableWorkouts(state,requestContext),text=normalize(message);
  if(!proposedAction&&/\b(resume|continue|undo|reopen|accident\p{L}*|pomot\p{L}*|nadalju\p{L}*|odpri|zakljuc\p{L}*)\b/u.test(text))return null;
  const matched=choices.filter(choice=>contains(message,choice.name)||contains(message,choice.name.split(/\s*[—–(]/u)[0]));
  const own=/\b(same|my|saved|repeat|reuse|exact|isti|isto|enak|enaki|moj|moja|moje|ponov\p{L}*)\b/u.test(text)||matched.length>0&&/\b(start|do|train|run|give|naredi|zacni|sestavi|dodaj)\b/.test(text);
  const modifies=/\b(reduce|shorten|change|fewer|more sets|less sets|skrajs\p{L}*|spremeni|manj setov|vec setov)\b/u.test(text);
  const providerReuse=proposedAction?.type==='reuse-existing-workout';
  const providerNamed=proposedAction?.type==='add-today-workout'&&choices.some(choice=>contains(proposedAction.name,choice.name)||contains(proposedAction.name,choice.name.split(/\s*[—–(]/u)[0]));
  if(!providerReuse&&!providerNamed&&(!own||modifies||!matched.length&&!/\b(workout|trening|plan|predlog\p{L}*)\b/u.test(text)))return null;
  let selected=matched;
  // Provider references can narrow a review, but cannot supply a prescription.
  if(providerReuse&&!matched.length){const ref=proposedAction.sourceReference;selected=choices.filter(choice=>ref&&choice.reference.kind===ref.kind&&(['dayId','templateId','occurrenceId'].some(key=>ref[key]&&ref[key]===choice.reference[key])));}
  if(!selected.length&&providerNamed)selected=choices.filter(choice=>contains(proposedAction.name,choice.name)||contains(proposedAction.name,choice.name.split(/\s*[—–(]/u)[0]));
  if(!selected.length)selected=choices;
  if(!selected.length)return {text:language==='Slovenian'?'Nimam tvoje shranjene predloge za ta trening. Odpri svoj plan ali shranjeni trening; ne bom si izmislil kopije.':'I couldn’t find your saved prescription. Open your plan or saved workout so I can reuse the original.',action:null,source:'deterministic'};
  return {text:language==='Slovenian'?(selected.length===1?'Vaje, seti in cilji ostanejo taki, kot si jih nastavil.':'Kateri trening želiš ponoviti? Izberi izvirnik za pregled.'):(selected.length===1?'Uses your workout’s existing exercises, sets and targets.':'Which workout do you mean? Choose the original to review.'),action:{type:'reuse-existing-workout',choices:selected},source:'deterministic',final:true};
}
export function resolveCoachWorkoutReuse(state,reference){
  if(reference?.profileId!==state.profile.id)throw Error('This workout belongs to another profile. Ask Coach again.');
  if(reference.kind==='plan')return resolvePlanWorkout(state,reference).draft;
  if(reference.kind==='saved'){const template=state.savedWorkoutTemplates?.find(t=>t.id===reference.templateId&&t.revision===reference.revision);if(template)return structuredClone(template);}
  if(reference.kind==='occurrence'){
    const item=flexibleOccurrencesForDate(state,reference.date).find(item=>item.logicalSessionId===reference.occurrenceId);
    if(item){const draft=fromPrescription(item.workout,state);if(snapshot(draft)===reference.prescription)return draft;}
  }
  throw Error('This workout changed. Close this preview and choose the original again.');
}
export function startCoachWorkoutReuse(state,{reference,requestId,reviewedPrescription}){
  if(!requestId)throw Error('Missing workout action identity.');
  if(state.activeWorkout?.queueCommandIds?.includes(requestId))return state;
  const draft=resolveCoachWorkoutReuse(state,reference);
  if(snapshot(draft)!==reviewedPrescription)throw Error('This workout changed. Review its latest targets before starting.');
  const issues=templateUseIssues(state,draft);if(issues.length)throw Error(issues.join(' '));
  const next=startFreestyleWorkout(state),active={...next.activeWorkout,name:draft.name,workoutName:draft.name,
    reusedWorkoutOrigin:Object.fromEntries(Object.entries(reference).filter(([key])=>!['signature','prescription'].includes(key))),exercises:instantiateTemplate(draft,requestId),queueCommandIds:[requestId]};
  const source=reference.kind==='plan'?state.program.days.find(day=>day.id===reference.dayId):reference.kind==='occurrence'?flexibleOccurrencesForDate(state,reference.date).find(item=>item.logicalSessionId===reference.occurrenceId)?.workout:null;
  if(source){active.planWorkoutOrigin={programId:state.program.id,dayId:source.id,requestId};active.warmupPlan=structuredClone(source.warmupPlan||{mode:'auto'});}
  refreshWorkoutWarmup(active,state.profile,state.program);
  return {...next,activeWorkout:active};
}
