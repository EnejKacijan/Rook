import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,startWorkout,deserializeState,completeWorkout,workingSetCanComplete} from './domain.js';
import {buildWeeklyPlanExport,buildWorkoutExport} from './workoutExport.js';
import {estimatedOneRepMax} from './performanceInsights.js';
import {prComparableSet} from './advancedLogging.js';
const make=async(line)=>{const s=blankState();const r=await AIService.importTrainingPlan(s.profile,`Monday\n${line}`,{review:true});s.program=r.program;return {s,r,e:s.program.days[0].exercises[0]};};
it.each(['3xAMRAP','3 × AMRAP','3xmax reps','3xfailure','3xdo odpovedi'])('retains open %s through reload and active creation',async prescription=>{
 const {s,r,e}=await make(`Pull Up ${prescription}`);expect(r.sourceReview.issues).toEqual([]);expect(e.sets).toHaveLength(3);expect(e.repMin).toBeNull();expect(e.repMax).toBeNull();expect(e.sets.map(x=>x.reps)).toEqual([null,null,null]);
 const restored=deserializeState(JSON.parse(JSON.stringify(s)));restored.activeWorkout=startWorkout(restored,restored.program.days[0]);expect(restored.activeWorkout.exercises[0].sets.map(x=>x.reps)).toEqual([null,null,null]);
 expect(workingSetCanComplete(restored.activeWorkout.exercises[0],restored.activeWorkout.exercises[0].sets[0])).toBe(false);
 const text=buildWeeklyPlanExport({state:restored}).text;expect(text).not.toContain('1 reps');if(prescription.includes('AMRAP'))expect(text).toContain('3 × AMRAP');
});
it.each([['3x8',8,8],['3x8–10',8,10],['3x45 sec',45,45]])('preserves numeric/timed %s',async(prescription,min,max)=>{const {e}=await make(`Pull Up ${prescription}`);expect(e.repMin).toBe(min);expect(e.repMax).toBe(max);expect(e.sets.map(x=>x.reps)).toEqual([min,min,min]);});
it.each([10,15])('logs actual AMRAP %i reps without changing prescription',async reps=>{
 const {s}=await make('Pull Up 3xAMRAP');s.activeWorkout=startWorkout(s,s.program.days[0]);const e=s.activeWorkout.exercises[0];e.sets.forEach(set=>Object.assign(set,{reps,weight:20,completed:true}));
 expect(workingSetCanComplete(e,e.sets[0])).toBe(true);const completed=completeWorkout(s);const restored=deserializeState(JSON.parse(JSON.stringify(completed)));const workout=restored.workouts.at(-1);expect(workout.exercises[0].sets[0].reps).toBe(reps);
 expect(buildWorkoutExport({workout,completed:true}).text).toContain(`AMRAP · ${reps} reps`);expect(buildWeeklyPlanExport({state:restored}).text).toContain('3 × AMRAP');
 expect(estimatedOneRepMax(20,reps)).toBe(reps===10?26.67:null);
 expect(prComparableSet(workout.exercises[0],workout.exercises[0].sets[0])).toBe(false); // Existing advanced-set exclusion remains intact.
 const again=startWorkout(restored,restored.program.days[0]);expect(again.exercises[0].sets[0].reps).toBeNull();
});
it('preserves AMRAP in the non-review local conversion too',async()=>{const s=blankState();const r=await AIService.importTrainingPlan(s.profile,'Monday\nPull Up 3xAMRAP');expect(r.program.days[0].exercises[0].sets.every(set=>set.reps===null&&set.setType==='amrap')).toBe(true);});
it('preserves hold seconds and leaves unsupported rounds for the existing decision',async()=>{const {e}=await make('Plank 3x45 sec hold');expect(e.repMin).toBe(45);expect(e.measure).toBe('seconds');const r=await make('Y Balance Reach 2 kroga');expect(r.r.sourceReview.issues.some(i=>i.field==='prescription')).toBe(true);expect(r.e.sets.every(s=>s.reps===null)).toBe(true);});
