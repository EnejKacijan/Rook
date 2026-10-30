export function progressionScenario(state,scenario){
  if(!scenario)return;
  const exercise=state.program.days[0].exercises[0],timed=scenario.startsWith('timed');
  Object.assign(exercise,{exerciseId:timed?'plank':'barbell-bench-press',repMin:timed?20:6,repMax:timed?30:10,targetRir:timed?null:2,defaultIncrement:1,loggingMode:timed?'timed':'normal'});
  delete exercise.loadRequirement;delete exercise.importedExercise;delete exercise.measure;
  exercise.sets=exercise.sets.slice(0,3);
  state.profile.increments.barbell=scenario==='smaller'?5:1;state.profile.rirEnabled=!timed;
  let rows=[[8,7,7],[8,8,7]];
  if(['ready','harder','unknown-effort','mixed','smaller'].includes(scenario))rows=[[10,10,10],[10,10,10]];
  if(scenario==='confirm')rows=[[10,10,10]];
  if(scenario==='review')rows=[[4,4,6],[4,4,6]];
  if(scenario==='improving')rows=[[8,6,5],[8,7,6],[8,8,7],[8,8,8]];
  if(scenario==='stalled')rows=Array.from({length:4},()=>[8,7,7]);
  if(scenario==='timed-build')rows=[[20,25,30]];
  if(scenario==='timed-confirm')rows=[[30,30,30]];
  if(scenario==='timed-ready')rows=[[30,30,30],[30,30,30]];
  state.workouts=rows.map((reps,index)=>{
    const date=new Date();date.setDate(date.getDate()-1-(rows.length-1-index)*7);
    return {id:`progression-sample-${index}`,name:'Upper A',completedAt:date.toISOString(),startedAt:new Date(date-1800000).toISOString(),
      ...(scenario==='harder'&&index===rows.length-1?{sessionFeedback:'harder'}:{}),
      exercises:[{...structuredClone(exercise),sets:exercise.sets.map((set,i)=>({...set,planned:true,completed:true,reps:reps[i],weight:timed?null:scenario==='mixed'?[40,35,30][i]:40,rir:scenario==='unknown-effort'||timed?null:2}))}]};
  });
}
