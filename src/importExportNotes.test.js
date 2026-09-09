import {it,expect,beforeAll} from 'vitest';
import {AIService} from './aiService.js';
import {importConsistencyCorpus} from '../scripts/fixtures/import-consistency-corpus.mjs';
import {blankState,deserializeState} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
let accepted;
beforeAll(async()=>{accepted=await AIService.importTrainingPlan(blankState().profile,importConsistencyCorpus.find(c=>c.id==='25').source,{review:true});});
const make=()=>{const r=JSON.parse(JSON.stringify(accepted));return preparePlanImport(blankState(),r.program,r.profile,{initial:true,date:'2026-09-07',weekday:'Mon'});};
const output=(state,includeNotes=true)=>buildWeeklyPlanExport({state,date:'2026-09-07',includeNotes}).text;
it('preserves Slovenian original guidance after reload',()=>{
 const state=deserializeState(JSON.parse(JSON.stringify(make()))),text=output(state);
 for(const note of ['Opomba: pavza spodaj, ne zaklepaj kolen.','Napredovanje: povečaj težo šele ko so vse ponovitve čiste.']){expect(text).toContain(note);expect(output(state,false)).not.toContain(note);}
 expect(text.indexOf('Opomba:')).toBeLessThan(text.indexOf('THU -'));
});
it.each(['canonical','source','both'])('includes %s notes once',mode=>{
 const state=make(),d=state.program.days[0],text='Ne zaklepaj kolen.';state.program.importMetadata.sourceNotes=[];
 if(mode!=='source')d.exercises[0].notes=text;
 if(mode!=='canonical')state.program.importMetadata.sourceNotes.push({scope:'workout',dayId:d.id,text});
 expect(output(state).split(text).length-1).toBe(1);expect(output(state,false)).not.toContain(text);
});
it('retains workout/global scopes and deduplicates exact embedded canonical lines',()=>{
 const state=make(),[mon,thu]=state.program.days;mon.exercises[0].notes='Exercise cue';
 state.program.importMetadata.sourceNotes=[{scope:'workout',dayId:mon.id,text:'Exercise cue\nMonday cue'},{scope:'workout',dayId:thu.id,text:'Thursday cue'},{scope:'plan',text:'Global cue'},{scope:'plan',text:'Global cue'},{scope:'workout',dayId:'missing',text:'Unassigned cue'}];
 const text=output(state);expect(text.split('Exercise cue')).toHaveLength(2);expect(text.split('Global cue')).toHaveLength(2);
 expect(text.indexOf('Monday cue')).toBeLessThan(text.indexOf('THU -'));expect(text.indexOf('Thursday cue')).toBeGreaterThan(text.indexOf('THU -'));expect(text.indexOf('Global cue')).toBeGreaterThan(text.indexOf('SUN -'));expect(text.indexOf('Unassigned cue')).toBeGreaterThan(text.indexOf('SUN -'));
});
