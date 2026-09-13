import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout} from './domain.js';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
const parse=async text=>AIService.importTrainingPlan(blankState().profile,`Monday: Upper\n${text}\nThursday: Lower\nSquat 3x8`,{review:true});
it.each([
 ['Cable Row 3 sets',3,null,[],null],
 ['Cable Row 10 reps',0,10,['sets'],null],
 ['Bench Press 60kg',0,null,['sets'],60],
 ['Cable Row 3 sets RIR 2',3,null,[],null],
 ['Cable Row 3x',3,null,[],null],
 ['Cable Row',0,null,['sets'],null],
 ['Plank 30 sec',0,30,['sets'],null],
 ['Pull Up AMRAP',0,null,['sets'],null],
])('preserves partial %s',async(source,count,reps,missing,weight)=>{
 const r=await parse(source),e=r.program.days[0].exercises[0];
 expect(e.importedName).toBe(source.startsWith('Bench')?'Bench Press':source.startsWith('Plank')?'Plank':source.startsWith('Pull')?'Pull Up':'Cable Row');
 expect(e.sets).toHaveLength(count);expect(e.repMin).toBe(reps);expect(e.partialPrescription?.missing||[]).toEqual(missing);if(missing.length)expect(e.partialPrescription.weight).toBe(weight);
 expect(r.sourceReview.issues.filter(i=>i.field==='prescription')).toHaveLength(missing.length?1:0);
 if(source.includes('RIR'))expect(e.targetRir).toBe(2);
 if(missing.length){expect(()=>buildWeeklyPlanExport({state:{...blankState(),program:r.program}})).toThrow();expect(resolvePartialPrescription(e,{sets:3})).toBe(true);}
 else expect(()=>buildWeeklyPlanExport({state:{...blankState(),program:r.program}})).not.toThrow();
 expect(e.sets).toHaveLength(3);expect(e.repMin).toBe(missing.includes('reps')?10:reps);
 expect(e.sets.every(s=>s.weight===weight)).toBe(true);
 const state=deserializeState(JSON.parse(JSON.stringify({...blankState(),program:r.program})));
 expect(state.program.days[0].exercises[0].sets).toHaveLength(3);
 expect(startWorkout(state,state.program.days[0]).exercises[0].sets).toHaveLength(3);
 expect(buildWeeklyPlanExport({state}).text).not.toContain('1 reps');
});
it('case 26 preserves all work and known sets through resolution',async()=>{
 const r=await parse('Bench Press 60kg\nCable Row 3 sets');expect(r.program.days.map(d=>d.exercises.length)).toEqual([2,1]);
 expect(r.sourceReview.issues.filter(i=>i.field==='prescription')).toHaveLength(1);
 const e=r.program.days[0].exercises[1];expect(e.sets).toHaveLength(3);expect(e.sets.every(s=>s.reps===null)).toBe(true);expect(e.partialPrescription).toBeUndefined();
});
it('invalid resolution leaves the source draft intact',async()=>{
 const r=await parse('Cable Row - 3 seti vsaj 3 repi'),e=r.program.days[0].exercises[0],before=JSON.stringify(e);
 expect(resolvePartialPrescription(e,{sets:3,repMin:0,repMax:10})).toBe(false);expect(JSON.stringify(e)).toBe(before);
});
