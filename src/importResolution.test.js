import {expect,it} from 'vitest';
import {importResolutionGroups,importResolutionDecisions} from './importResolution.js';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {importResolutionNotes} from './importResolutionFixture.js';
const program={days:[{id:'d',exercises:[{id:'e',matchStatus:'matched'}]}]};
it('skips empty and preserved-only reviews',()=>{
 expect(importResolutionGroups(null,program)).toEqual([]);
 expect(importResolutionGroups({issues:[{id:'p',category:'preserved',field:'source'}]},program)).toEqual([]);
});
it('groups same type together and creates only real steps',()=>{
 const issues=['prescription','alternative','load','loggingMode','advanced','day'].map((field,id)=>({field,id}));
 const result=importResolutionGroups({issues},program);
 expect(result.map(group=>group.id)).toEqual(['prescriptions','logging','schedule']);
 expect(result.map(group=>group.issues.length)).toEqual([3,2,1]);
});
it('one match is one group and resolved identities remain changeable',()=>{
 const unmatched=structuredClone(program);unmatched.days[0].exercises[0].matchStatus='unresolved';
 expect(importResolutionGroups(null,unmatched).map(group=>group.id)).toEqual(['matches']);
 expect(importResolutionGroups(null,program,['e'])[0].entries).toEqual([{dayId:'d',id:'e'}]);
});
it('full Slovenian plan has two genuine choices; original names and inline rounds require no decision',async()=>{
 const result=await AIService.importTrainingPlan(blankState().profile,importResolutionNotes,{review:true});
 expect(result.program.days).toHaveLength(5);expect(result.program.days.flatMap(day=>day.exercises)).toHaveLength(41);
 const groups=importResolutionGroups(result.sourceReview,result.program);
 expect(groups.map(group=>group.id)).toEqual(['prescriptions','matches']);expect(groups[0].issues).toHaveLength(1);expect(groups[1].entries).toHaveLength(1);
 const decisions=importResolutionDecisions(result.sourceReview,result.program);
 expect(decisions).toHaveLength(2);
 expect(decisions.map(item=>item.issue?.field||'match')).toEqual(['alternative','match']);
 expect(new Set(decisions.map(item=>item.id)).size).toBe(2);
 expect(result.program.importMetadata.sourceNotes).toHaveLength(8);
 const rounds=result.program.days.flatMap(day=>day.exercises).filter(e=>e.importedRoundPrescription);
 expect(rounds.map(e=>e.sets.length)).toEqual([2,3]);
 for(const exercise of rounds){
 expect(exercise.repMin).toBeNull();expect(exercise.repMax).toBeNull();expect(exercise.partialPrescription).toBeUndefined();
 }
});
