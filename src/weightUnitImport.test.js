import {expect,it} from 'vitest';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
it('display preference never reinterprets explicit imported kg or lb',async()=>{
 const notes='MONDAY - PUSH\nBench Press 3x8 100 lb\nTUESDAY - LEGS\nSquat 3x5 60 kg';
 const profile=blankState().profile;
 const kg=await AIService.importTrainingPlan({...profile,units:'kg'},notes,{review:true});
 const lb=await AIService.importTrainingPlan({...profile,units:'lb'},notes,{review:true});
 const loads=result=>result.program.days.flatMap(day=>day.exercises.flatMap(ex=>ex.sets.map(set=>set.weight)));
 expect(loads(lb)).toEqual(loads(kg));
 expect(loads(lb).some(value=>value>45&&value<46)).toBe(true);
 expect(loads(lb)).toContain(60);
});
