import {it,expect,beforeAll} from 'vitest';
import {AIService} from './aiService.js';
import {importConsistencyCorpus} from '../scripts/fixtures/import-consistency-corpus.mjs';
import {blankState,deserializeState} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
import {buildWeeklyPlanExport,buildWorkoutExport} from './workoutExport.js';
let accepted;
beforeAll(async()=>{accepted=await AIService.importTrainingPlan(blankState().profile,importConsistencyCorpus.find(c=>c.id==='12').source,{review:true});});
const fixture=()=>JSON.parse(JSON.stringify(accepted));
it.each([false,true])('exports per-workout locations with notes=%s after reload',includeNotes=>{
 const r=fixture(),state=deserializeState(JSON.parse(JSON.stringify(preparePlanImport(blankState(),r.program,r.profile,{initial:true,date:'2026-09-07',weekday:'Mon'}))));
 state.program.days[0].name='Upper A';state.program.days[1].name='Lower';
 const text=buildWeeklyPlanExport({state,date:'2026-09-07',includeNotes}).text;
 expect(text).toContain('MON - Upper A\nLocation: Home');expect(text).toContain('FRI - Lower\nLocation: Commercial gym');
 expect(buildWorkoutExport({workout:state.program.days[0],includeNotes}).text).toContain('Location: Home');
});
it('keeps two Home locations independently',()=>{
 const r=fixture();r.program.days.forEach(d=>d.location='Home');const state=preparePlanImport(blankState(),r.program,r.profile,{initial:true,date:'2026-09-07',weekday:'Mon'});
 expect(buildWeeklyPlanExport({state,date:'2026-09-07'}).text.match(/Location: Home/g)).toHaveLength(2);
});
it.each([null,undefined,''])('does not fabricate absent location %s',location=>{
 const r=fixture(),state=preparePlanImport(blankState(),r.program,r.profile,{initial:true,date:'2026-09-07',weekday:'Mon'});state.program.days.forEach(d=>d.location=location);
 expect(buildWeeklyPlanExport({state,date:'2026-09-07'}).text).not.toContain('Location:');expect(buildWorkoutExport({workout:state.program.days[0]}).text).not.toContain('Location:');
});
