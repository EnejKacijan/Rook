import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout} from './domain.js';
const parse=(source,environment='Commercial gym')=>AIService.importTrainingPlan({...blankState().profile,environment},source,{review:true});
it.each([['Home','Gym',['Home','Commercial gym']],['Home','Home',['Home','Home']],['Gym','Home',['Commercial gym','Home']],['home gym','COMMERCIAL   GYM',['Home','Commercial gym']],[' home ',' gym ',['Home','Commercial gym']]])('preserves per-day %s/%s',async(a,b,locations)=>{
 const r=await parse(`Monday: ${a}\nPush Up 3x12 bodyweight\nPull Up 3xAMRAP optional added load\nFriday: ${b}\nBench Press 3x8 60kg`);
 expect(r.program.days.map(d=>d.location)).toEqual(locations);expect(r.program.days.map(d=>d.name)).toEqual(['Workout','Workout']);expect(r.sourceReview.issues).toEqual([]);
 const [push,pull]=r.program.days[0].exercises;expect(push.loadRequirement).toBe('optional');expect(push.sets[0].weight).toBeNull();expect(pull.repMin).toBeNull();expect(pull.sets.map(s=>s.reps)).toEqual([null,null,null]);expect(pull.loadRequirement).toBe('optional');expect(r.program.days[1].exercises[0].sets[0].weight).toBe(60);
 const s=blankState();s.program=r.program;const restored=deserializeState(JSON.parse(JSON.stringify(s)));expect(restored.program.days.map(d=>d.location)).toEqual(locations);for(const day of restored.program.days){startWorkout(restored,day);expect(day.location).toBe(locations[restored.program.days.indexOf(day)]);}
});
it.each(['Upper A','Push','My unusual room'])('preserves workout name %s',async name=>{const r=await parse(`Monday: ${name}\nBench Press 3x8`);expect(r.program.days[0].name).toBe(name);expect(r.program.days[0].location).toBe('Commercial gym');});
it('retains absent-location profile fallback',async()=>{expect((await parse('Monday: Bench Press 3x8')).program.days[0].location).toBe('Commercial gym');expect((await parse('Monday\nPush Up 3x12','Home gym')).program.days[0].location).toBe('Home');});
it('does not let catalog equipment override explicit Home',async()=>{const r=await parse('Monday: Home\nLeg Press 3x9 130kg');expect(r.program.days[0].location).toBe('Home');expect(r.program.days[0].exercises[0].sets[0].weight).toBe(130);});
