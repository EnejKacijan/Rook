import {it,expect} from 'vitest';
import {AIService} from './aiService.js';
import {blankState,deserializeState,startWorkout} from './domain.js';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {buildWeeklyPlanExport} from './workoutExport.js';
const parse=source=>AIService.importTrainingPlan(blankState().profile,`Monday: Upper\n${source}`,{review:true});
it('requires a separate correction action and preserves original source/provenance through reload',async()=>{
 const r=await parse('Cable Row - 3 seti vsaj 8 repi RIR 2'),e=r.program.days[0].exercises[0],partial=structuredClone(e.partialPrescription),notes=JSON.stringify(r.program.importMetadata.sourceNotes);
 expect(resolvePartialPrescription(e,{sets:1,repMin:8,repMax:10})).toBe(true);expect(e.sets).toHaveLength(3);expect(e.importPrescriptionCorrections).toBeUndefined();
 e.partialPrescription=partial;expect(resolvePartialPrescription(e,{sets:2,repMin:8,repMax:10,sourceCorrections:['sets']})).toBe(true);
 expect(e.importPrescriptionCorrections).toMatchObject({source:{sets:3,repMin:8,repMax:null},values:{sets:2},origin:'user'});expect(e.targetRir).toBe(2);expect(e.sets.every(s=>s.weight===null)).toBe(true);
 const s=deserializeState(JSON.parse(JSON.stringify({...blankState(),program:r.program})));
 expect(s.program.days[0].exercises[0].importPrescriptionCorrections).toEqual(e.importPrescriptionCorrections);expect(JSON.stringify(s.program.importMetadata.sourceNotes)).toBe(notes);expect(startWorkout(s,s.program.days[0]).exercises[0].sets).toHaveLength(2);const text=buildWeeklyPlanExport({state:s}).text;expect(text).toContain('2. 8–10 reps');expect(text).not.toContain('3. 8–10 reps');
});
it.each(['Cable Row - 3–4 seti','Cable Row - 3 seti vsaj 3 repi','Cable Row - 3 seti največ 8 repi'])('only explicit correction can override source bounds: %s',async source=>{
 const r=await parse(source),e=r.program.days[0].exercises[0],partial=structuredClone(e.partialPrescription);
 const v={sets:5,repMin:6,repMax:10};expect(resolvePartialPrescription(e,v)).toBe(false);
 expect(resolvePartialPrescription(e,{...v,sourceCorrections:['sets','repMin','repMax']})).toBe(true);expect(e.repMin).toBe(6);expect(e.repMax).toBe(10);
 e.partialPrescription=partial;expect(resolvePartialPrescription(e,{sets:e.sets.length,repMin:6,repMax:10})).toBe(true);
});
it('keeps an open AMRAP target open when correcting its set count',async()=>{const r=await parse('Pull Up - 3 seti AMRAP'),e=r.program.days[0].exercises[0];e.partialPrescription={missing:[],setType:'amrap'};expect(resolvePartialPrescription(e,{sets:4,repMin:null,repMax:null,sourceCorrections:['sets']})).toBe(true);expect(e.sets).toHaveLength(4);expect([e.repMin,e.repMax]).toEqual([null,null]);});
it('does not mutate invalid corrections or independently change linked pair counts',async()=>{const r=await parse('Cable Row 3 sets'),e=r.program.days[0].exercises[0];for(const value of [{sets:0,repMin:8,repMax:10},{sets:2,repMin:10,repMax:8}]){const before=JSON.stringify(e);expect(resolvePartialPrescription(e,{...value,sourceCorrections:['sets']})).toBe(false);expect(JSON.stringify(e)).toBe(before);}e.supersetId='pair';expect(resolvePartialPrescription(e,{sets:4,repMin:8,repMax:10,sourceCorrections:['sets']})).toBe(false);});
