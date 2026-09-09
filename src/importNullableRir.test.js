import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout,currentWeekSchedule} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
import {prescribeTrainingBlockWorkout,currentTrainingBlockWeek} from './trainingBlocks.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
it.each([null,0,1,2])('preserves imported RIR %s across the final stages',async rir=>{
 const original=blankState(),r=await AIService.importTrainingPlan(original.profile,`Monday: Upper\nBench Press 3x8${rir===null?'':` RIR ${rir}`}\nThursday: Lower\nSquat 3x8`,{review:true});
 expect(r.program.days[0].exercises[0].targetRir).toBe(rir);
 const state=deserializeState(JSON.parse(JSON.stringify(preparePlanImport(original,r.program,r.profile,{date:'2026-09-07',weekday:'Mon',initial:true}))));
 expect(state.program.days[0].exercises[0].targetRir).toBe(rir);
 const workout=prescribeTrainingBlockWorkout(state,state.program.days[0]);expect(workout.exercises[0].targetRir).toBe(rir);
 expect(currentWeekSchedule(state,new Date('2026-09-07T12:00:00')).find(x=>x.workout?.id===workout.id).workout.exercises[0].targetRir).toBe(rir);
 expect(startWorkout(state,workout).exercises[0].targetRir).toBe(rir);
 const text=buildWeeklyPlanExport({state,date:'2026-09-07'}).text;
 if(rir===null)expect(text).not.toContain('RIR');else expect(text).toContain(`RIR ${rir}`);
});
it.each([null,undefined,''])('does not adjust an absent RIR %s',async value=>{
 const original=blankState(),r=await AIService.importTrainingPlan(original.profile,'Monday\nBench Press 3x8',{review:true});
 const state=preparePlanImport(original,r.program,r.profile,{date:'2026-09-07',weekday:'Mon',initial:true});state.program.days[0].exercises[0].targetRir=value;
 currentTrainingBlockWeek(state).rirDelta=2;
 expect(prescribeTrainingBlockWorkout(state,state.program.days[0]).exercises[0].targetRir).toBe(value);
});
it.each([[0,2,2],[2,-1,1],[0,-1,0],[3,2,4]])('preserves existing explicit RIR %i adjustment %i',async(rir,delta,expected)=>{
 const original=blankState(),r=await AIService.importTrainingPlan(original.profile,`Monday\nBench Press 3x8 RIR ${rir}`,{review:true});
 const state=preparePlanImport(original,r.program,r.profile,{date:'2026-09-07',weekday:'Mon',initial:true});currentTrainingBlockWeek(state).rirDelta=delta;
 expect(prescribeTrainingBlockWorkout(state,state.program.days[0]).exercises[0].targetRir).toBe(expected);expect(state.program.days[0].exercises[0].targetRir).toBe(rir);
});
