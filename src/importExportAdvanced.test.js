import {it,expect} from 'vitest';
import {formatExportSet} from './workoutExport.js';
it.each(['drop','rest_pause'])('keeps %s targets separate from logged segments',setType=>{
 const e={repMin:8,repMax:10,targetRir:null,loadRequirement:'required'},s={setType,reps:8,weight:20,segments:[],completed:false};
 const text=formatExportSet(e,s);expect(text).toContain('8–10 reps');expect(text).toContain('20 kg');expect(text).not.toContain('segments');
 expect(formatExportSet({...e,repMax:8},s)).toContain('8 reps');
 const actual={...s,reps:10,completed:true,segments:[{reps:8,weight:15,completed:true},{reps:6,weight:10,completed:true}]};
 const history=formatExportSet(e,actual,{completed:true});expect(history).toContain('10 reps');expect(history).toContain('2');expect(history).toContain('segments');expect(history).not.toContain('8–10');
 expect(formatExportSet(e,{...actual,completed:false,segments:[actual.segments[0],{...actual.segments[1],completed:false}]},{completed:true})).toContain('1');
 expect(formatExportSet(JSON.parse(JSON.stringify(e)),JSON.parse(JSON.stringify(s)))).toBe(text);
});
it('does not substitute target RIR for missing actual history RIR',()=>{expect(formatExportSet({repMin:8,repMax:10,targetRir:2},{reps:7,rir:null},{completed:true})).not.toContain('RIR');});
