import {it,expect,beforeAll} from 'vitest';
import {AIService} from './aiService.js';
import {importConsistencyCorpus} from '../scripts/fixtures/import-consistency-corpus.mjs';
import {formatExportSet,buildWeeklyPlanExport} from './workoutExport.js';
import {blankState,deserializeState} from './domain.js';
const exercise={exerciseId:'split-squat',loggingMode:'per_side',repMin:8,repMax:8,targetRir:null,sets:[{reps:8,weight:null},{reps:8,weight:null},{reps:8,weight:null}]};
let accepted;
beforeAll(async()=>{accepted=await AIService.importTrainingPlan(blankState().profile,importConsistencyCorpus.find(c=>c.id==='10').source,{review:true});});
it.each([8,10])('exports target 8–%i without impersonating results',max=>{
 const text=formatExportSet({...exercise,repMax:max},{reps:8,weight:20});expect(text).toContain(max===8?'8 reps / side':'8–10 reps / side');expect(text).toContain('20 kg');expect(text).not.toContain('L ');expect(text).not.toContain('RIR');
 expect(formatExportSet({...exercise,targetRir:0},{reps:8,weight:20})).toContain('RIR 0');
 expect(formatExportSet({...exercise,targetRir:2},{reps:8,weight:20})).toContain('RIR 2');
});
it.each([[8,8],[8,7],[7,7],[8,null]])('preserves actual sides %s/%s', (left,right)=>{
 const text=formatExportSet(exercise,{reps:7,sides:{left:{reps:left},right:{reps:right}},completed:right!==null},{completed:true});expect(text).toContain(`L ${left} · R ${right??'—'}`);expect(text).not.toContain('/ side');
});
it('preserves open AMRAP target per side',()=>{expect(formatExportSet({...exercise,failureTarget:true,repMin:null,repMax:null,sets:[{setType:'amrap'}]},{setType:'amrap',reps:null})).toContain('AMRAP / side');});
it.each([true,false])('reload/export accepted per-side fixture, notes=%s',includeNotes=>{
 const r=JSON.parse(JSON.stringify(accepted));
 const state=deserializeState(JSON.parse(JSON.stringify({...blankState(),program:r.program})));
 const text=buildWeeklyPlanExport({state,date:'2026-09-07',includeNotes}).text;expect(text.match(/8 reps \/ side/g)).toHaveLength(3);expect(text).not.toContain('L — · R —');
});
