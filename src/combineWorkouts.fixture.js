import {blankState,buildProgram,deserializeState,exerciseCatalog,validateProgram,estimateWorkoutMinutes} from './domain.js';
// Synthetic source prescriptions; no owner history or physical-device data.
export function combineExample(){
 const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:['Mon','Wed'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
 s.program=buildProgram(s.profile);s.program.trainingBlock=null;
 const row=(id,count)=>({id:`entry-${id}`,exerciseId:id,repMin:8,repMax:10,targetRir:2,defaultIncrement:2.5,restSeconds:exerciseCatalog[id].kind==='compound'?120:60,
   sets:Array.from({length:count},(_,i)=>({id:`${id}-set-${i}`,reps:8,weight:0,completed:false,planned:true}))});
 s.program.days=[{id:'push-source',name:'Push',weekday:'Mon',location:'Commercial gym',warmupPlan:{mode:'auto'},exercises:[['incline-dumbbell-press',4],['machine-chest-press',3],['dumbbell-shoulder-press',3],['lateral-raise',3],['wg-rope-tricep-pushdown',3]].map(([id,n])=>row(id,n))},
 {id:'pull-source',name:'Pull',weekday:'Wed',location:'Commercial gym',warmupPlan:{mode:'auto'},exercises:[['pull-up',4],['t-bar-row',4],['seated-cable-row',3],['dumbbell-rear-delt-fly',3],['barbell-curl',3]].map(([id,n])=>row(id,n))}];
 s.program.source='manual';s.program.userEdited=true;
 s.program.days.forEach(d=>{d.estimatedMinutes=estimateWorkoutMinutes(d,s.profile);});
 const valid=validateProgram(s.program,null,{preserveSchedule:true});if(!valid.valid)throw new Error(valid.errors.join('; '));
 s.selectedDate='2026-09-12';s.ai.planUpgradeDismissed=true;
 const loaded=deserializeState(s);loaded.program.trainingBlock.startDate='2026-09-07';return loaded;
}
