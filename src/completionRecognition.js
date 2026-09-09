import {activeExercisePr} from './performanceInsights.js';
import {loggingModeOf} from './advancedLogging.js';
import {workoutSetSummary,workoutPlanDate} from './domain.js';

const milestones=new Set([10,25,50,100,250,500,1000]);
// Presentation only: reuse the existing PR comparator, never award/store badges.
export function completionRecognition(session,history=[],{eligible=()=>false}={}){
 const summary=workoutSetSummary(session);
 if(!session?.completedAt||session.historicalImport||session.endedEarly||session.status==='ended-early'||!summary.completed||summary.completed<summary.total)return null;
 const prior=[...new Map(history.filter(w=>w.id!==session.id&&w.completedAt&&new Date(w.completedAt)<=new Date(session.completedAt)&&workoutPlanDate(w)<=workoutPlanDate(session)).map(w=>[w.id,w])).values()];
 // Do not compare per-side and normal logs, assistance, optional load, or timed work.
 // The caller supplies the same catalog/load eligibility used by Progress.
 const safe=e=>eligible(e)&&loggingModeOf(e)==='normal';
 const comparable=prior.map(w=>({...w,exercises:(w.exercises||[]).filter(safe)}));
 for(const exercise of session.exercises||[]){
  if(!safe(exercise))continue;
  const record=activeExercisePr(comparable,exercise,{e1rmEligible:true});
  if(!record)continue;
  return {type:'pr',exercise,record,label:record.repPr?'New rep PR':record.weightPr?'New weight PR':'New estimated 1RM PR'};
 }
 const count=prior.filter(w=>workoutSetSummary(w).completed>0).length+1;
 return milestones.has(count)?{type:'milestone',count,label:`${count} workouts logged`}:null;
}
