import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState} from './domain.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
const parse=rows=>AIService.importTrainingPlan(blankState().profile,`Day\tExercise\tSets\tReps\tLoad\n${rows}`,{review:true});
it.each([['Monday','Thursday'],['Mon','Thu'],['ponedeljek','četrtek'],['pon','čet'],['  mOnDaY  ','  THURSDAY  ']])('preserves %s/%s',async(a,b)=>{
 const r=await parse(`${a}\tBench Press\t3\t8\t60 kg\n${b}\tSquat\t4\t6–8\t132.5 kg`);
 expect(r.program.days.map(d=>d.weekday)).toEqual(['Mon','Thu']);expect(r.sourceReview.issues.filter(i=>i.field==='day')).toEqual([]);
 const [bench,squat]=r.program.days.map(d=>d.exercises[0]);expect(bench.sets.map(s=>[s.reps,s.weight])).toEqual([[8,60],[8,60],[8,60]]);expect([squat.repMin,squat.repMax,squat.sets.length,squat.sets[0].weight]).toEqual([6,8,4,132.5]);
 const s=blankState();s.program=r.program;expect(deserializeState(JSON.parse(JSON.stringify(s))).program.days.map(d=>d.weekday)).toEqual(['Mon','Thu']);
});
it('groups repeated days, including nonadjacent rows, in first occurrence order',async()=>{
 const r=await parse('Thu\tSquat\t4\t6–8\t132.5 kg\nMon\tBench Press\t3\t8\t60 kg\nThursday\tCable Row\t3\t10\t');
 expect(r.program.days.map(d=>d.weekday)).toEqual(['Thu','Mon']);expect(r.program.days.map(d=>d.exercises.length)).toEqual([2,1]);
});
it.each(['Training A',''])('keeps ambiguous day %s separate and unresolved',async day=>{
 const r=await parse(`Monday\tBench Press\t3\t8\t60 kg\n${day}\tCable Row\t3\t10\t\nThursday\tSquat\t4\t6\t100 kg`);
 expect(r.program.days.map(d=>d.weekday)).toEqual(['Mon',null,'Thu']);expect(r.sourceReview.issues.filter(i=>i.field==='day')).toHaveLength(1);expect(r.program.days[1].exercises[0].sets[0].weight).toBeNull();
});
it('keeps table AMRAP open and preserves export',async()=>{
 const r=await parse('Monday\tPull Up\t3\tAMRAP\t');const e=r.program.days[0].exercises[0];expect(e.repMin).toBeNull();expect(e.sets.map(s=>s.reps)).toEqual([null,null,null]);expect(r.program.days[0].weekday).toBe('Mon');expect(r.sourceReview.issues.filter(i=>i.category==='decision')).toEqual([]);
 const s=blankState();s.program=r.program;expect(buildWeeklyPlanExport({state:s}).text).toContain('3 × AMRAP');
});
it('preserves load units, RIR, RPE decision and notes',async()=>{
 const r=await AIService.importTrainingPlan(blankState().profile,'Day\tExercise\tSets\tReps\tLoad\tRIR\tNotes\nMon\tBench Press\t3\t8\t135 lb\t2\tPause at bottom',{review:true});
 const e=r.program.days[0].exercises[0];expect(e.sets[0].weight).toBeCloseTo(61.23,2);expect(e.targetRir).toBe(2);expect(JSON.stringify(r.program)).toContain('Pause at bottom');
 const p=await AIService.importTrainingPlan(blankState().profile,'Day\tExercise\tSets\tReps\tLoad\tRPE\nMon\tBench Press\t3\t8\t60 kg\t8',{review:true});expect(p.sourceReview.issues.some(i=>/RPE/.test(i.source))).toBe(true);
});
it('preserves pipe-table scheduling',async()=>{
 const r=await AIService.importTrainingPlan(blankState().profile,'| Day | Exercise | Sets | Reps | Load |\n| Mon | Bench Press | 3 | 8 | 60 kg |\n| Thu | Squat | 4 | 6–8 | 132.5 kg |',{review:true});expect(r.program.days.map(d=>d.weekday)).toEqual(['Mon','Thu']);
});
