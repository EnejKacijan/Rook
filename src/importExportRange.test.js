import {it,expect} from 'vitest';
import {formatExportSet,buildWeeklyPlanExport} from './workoutExport.js';
import {AIService} from './aiService.js';
import {blankState,deserializeState} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
it.each([[6,8,'6–8'],[8,10,'8–10'],[8,8,'8']])('exports target %i–%i', (min,max,label)=>{
 const e={repMin:min,repMax:max,targetRir:null,loadRequirement:'required'};
 expect(formatExportSet(e,{reps:min,weight:132.5})).toBe(`${label} reps - 132.5 kg`);
 expect(formatExportSet({...e,targetRir:2},{reps:min,weight:132.5})).toContain('RIR 2');
 expect(formatExportSet({...e,targetRir:0},{reps:min,weight:132.5})).toContain('RIR 0');
});
it('history retains actual results rather than target range',()=>{
 const e={repMin:6,repMax:8,targetRir:null,loadRequirement:'required'};
 for(const reps of [8,8,7,6]){const text=formatExportSet(e,{reps,weight:132.5,completed:true},{completed:true});expect(text).toContain(`${reps} reps`);expect(text).not.toContain('6–8');}
});
it('save/reload exports the range and does not invent RIR',async()=>{
 const s=blankState(),r=await AIService.importTrainingPlan(s.profile,'Monday\nSquat 4x6–8 132.5kg',{review:true});
 const state=deserializeState(JSON.parse(JSON.stringify(preparePlanImport(s,r.program,r.profile,{initial:true,date:'2026-09-07',weekday:'Mon'}))));
 const text=buildWeeklyPlanExport({state,date:'2026-09-07'}).text;expect(text.match(/6–8 reps/g)).toHaveLength(4);expect(text).not.toContain('RIR');
});
